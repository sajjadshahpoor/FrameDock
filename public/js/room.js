(() => {
  const roomCode = window.location.pathname.split('/').pop();
  const params = new URLSearchParams(window.location.search);
  const micBtn = document.getElementById('toggle-mic');
  const camBtn = document.getElementById('toggle-cam');
  const audioOnlyBtn = document.getElementById('toggle-audio-only');
  const leaveBtn = document.getElementById('leave-call');
  const countLabel = document.getElementById('participant-count');
  const audioOnlyBadge = document.getElementById('audio-only-badge');

  const state = {
    localStream: new MediaStream(),
    micOn: false,
    camOn: false,
    audioOnly: params.get('mode') === 'audio',
    busy: false,
    peers: new Map(), // id -> { name, media, stream }
  };

  document.getElementById('room-code').textContent = roomCode;
  document.title = `${roomCode} - FrameDock`;

  const CAMERA_MESSAGES = {
    'permission-denied': 'Camera permission was blocked. You joined with audio only.',
    'not-found': 'No camera found. You joined with audio only.',
    'in-use': 'Your camera is being used by another app. You joined with audio only.',
    unknown: 'Camera unavailable. You joined with audio only.',
  };

  const CAMERA_RETRY_MESSAGES = {
    'permission-denied': 'Camera permission is blocked. Allow it in your browser settings.',
    'not-found': 'No camera found.',
    'in-use': 'Your camera is being used by another app.',
    unknown: 'Could not start your camera.',
  };

  const MIC_MESSAGES = {
    'permission-denied': 'Microphone permission was blocked. Others will not hear you.',
    'not-found': 'No microphone found. Others will not hear you.',
    'in-use': 'Your microphone is being used by another app.',
    unknown: 'Microphone unavailable.',
  };

  function refreshCount() {
    const total = state.peers.size + 1;
    countLabel.textContent = total === 1 ? 'Only you' : `${total} people`;
  }

  function refreshControls() {
    UI.setToggleState(micBtn, state.micOn, { on: 'Turn off microphone', off: 'Turn on microphone' });
    UI.setToggleState(camBtn, state.camOn, { on: 'Turn off camera', off: 'Turn on camera' });
    audioOnlyBtn.classList.toggle('active', state.audioOnly);
    audioOnlyBtn.setAttribute('aria-pressed', String(state.audioOnly));
    audioOnlyBtn.title = state.audioOnly ? 'Turn video back on' : 'Switch to audio-only mode';
    camBtn.disabled = state.audioOnly;
    audioOnlyBadge.hidden = !state.audioOnly;
    UI.setAudioEnabled('local', state.micOn);
    UI.setVideoEnabled('local', state.camOn);
  }

  function publishMediaState() {
    Signaling.sendMediaState({ audio: state.micOn, video: state.camOn });
  }

  function refreshLocalPreview() {
    // A fresh MediaStream makes the <video> element pick up added/removed tracks reliably.
    UI.setStream('local', new MediaStream(state.localStream.getVideoTracks()));
  }

  function addPeer(peer) {
    state.peers.set(peer.id, { name: peer.name, media: peer.media, stream: null });
    UI.addTile(peer.id, { name: peer.name });
    UI.setAudioEnabled(peer.id, peer.media.audio);
    UI.setVideoEnabled(peer.id, false);
    refreshCount();
  }

  function removePeer(id) {
    state.peers.delete(id);
    Peers.remove(id);
    UI.removeTile(id);
    refreshCount();
  }

  function refreshRemoteVideo(id) {
    const peer = state.peers.get(id);
    if (!peer) return;
    const hasLiveVideo = Boolean(peer.stream?.getVideoTracks().some((t) => !t.muted));
    UI.setVideoEnabled(id, !state.audioOnly && peer.media.video && hasLiveVideo);
  }

  async function loadConfig() {
    try {
      const res = await fetch('/config');
      return await res.json();
    } catch {
      return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    }
  }

  // ---------- Camera / microphone ----------

  async function startCamera() {
    let track;
    try {
      track = await Media.getCameraTrack();
    } catch (err) {
      UI.toast(CAMERA_RETRY_MESSAGES[Media.describeError(err)]);
      return false;
    }
    state.localStream.addTrack(track);
    track.addEventListener('ended', () => withLock(stopCamera));
    await Peers.setTrack('video', track, state.localStream);
    state.camOn = true;
    refreshLocalPreview();
    return true;
  }

  async function stopCamera() {
    // Stopping the track (instead of just disabling it) turns the camera light off
    // and stops sending video entirely, rather than streaming black frames.
    state.localStream.getVideoTracks().forEach((track) => {
      track.stop();
      state.localStream.removeTrack(track);
    });
    state.camOn = false;
    await Peers.setTrack('video', null, state.localStream);
    refreshLocalPreview();
  }

  async function startMicrophone() {
    try {
      const track = await Media.getMicrophoneTrack();
      state.localStream.addTrack(track);
      await Peers.setTrack('audio', track, state.localStream);
      return true;
    } catch (err) {
      UI.toast(MIC_MESSAGES[Media.describeError(err)]);
      return false;
    }
  }

  async function withLock(task) {
    if (state.busy) return;
    state.busy = true;
    try {
      await task();
    } finally {
      state.busy = false;
      refreshControls();
      publishMediaState();
    }
  }

  micBtn.addEventListener('click', () =>
    withLock(async () => {
      const track = state.localStream.getAudioTracks()[0];
      if (!track) {
        state.micOn = await startMicrophone();
        return;
      }
      state.micOn = !state.micOn;
      track.enabled = state.micOn;
    })
  );

  camBtn.addEventListener('click', () =>
    withLock(async () => {
      if (state.camOn) await stopCamera();
      else await startCamera();
    })
  );

  audioOnlyBtn.addEventListener('click', () =>
    withLock(async () => {
      state.audioOnly = !state.audioOnly;
      if (state.audioOnly) {
        if (state.camOn) await stopCamera();
        UI.toast('Audio-only mode: video is off for you and others, saving bandwidth.');
      } else {
        UI.toast('Video is back on. Turn on your camera when you are ready.');
      }
      Peers.setReceiveVideo(!state.audioOnly);
      state.peers.forEach((_, id) => refreshRemoteVideo(id));
    })
  );

  leaveBtn.addEventListener('click', () => {
    Peers.closeAll();
    Signaling.leaveRoom();
    Media.stopStream(state.localStream);
    window.location.href = '/';
  });

  // ---------- Signaling events ----------

  Signaling.on('peer-joined', addPeer);
  Signaling.on('peer-left', ({ id }) => removePeer(id));
  Signaling.on('peer-media', ({ id, media }) => {
    const peer = state.peers.get(id);
    if (!peer) return;
    peer.media = media;
    UI.setAudioEnabled(id, media.audio);
    refreshRemoteVideo(id);
  });
  Signaling.on('signal', ({ from, data }) => Peers.handleSignal(from, data));

  // ---------- Startup ----------

  async function start() {
    UI.addTile('local', { name: 'Me', isLocal: true });

    if (!Media.isSupported()) {
      UI.toast('This browser does not support calls. Try a recent Chrome, Edge, Firefox or Safari.');
      return;
    }

    const media = await Media.getLocalStream({ video: !state.audioOnly });
    state.localStream = media.stream;
    state.micOn = media.audio;
    state.camOn = media.video;
    state.localStream.getVideoTracks().forEach((t) => t.addEventListener('ended', () => withLock(stopCamera)));

    if (!state.audioOnly && media.videoError) UI.toast(CAMERA_MESSAGES[media.videoError]);
    else if (media.audioError) UI.toast(MIC_MESSAGES[media.audioError]);

    refreshLocalPreview();
    refreshControls();

    const config = await loadConfig();
    Signaling.connect();
    try {
      const { selfId, peers } = await Signaling.joinRoom({
        room: roomCode,
        name: 'Me',
        media: { audio: state.micOn, video: state.camOn },
      });

      Peers.init({
        selfId,
        iceServers: config.iceServers,
        localStream: state.localStream,
        receiveVideo: !state.audioOnly,
        handlers: {
          stream: (id, stream) => {
            const peer = state.peers.get(id);
            if (!peer) return;
            peer.stream = stream;
            UI.setStream(id, stream);
            refreshRemoteVideo(id);
          },
          state: (id, connectionState) => console.debug(`peer ${id}: ${connectionState}`),
        },
      });

      // The newcomer starts the connections; existing participants answer.
      peers.forEach((peer) => {
        addPeer(peer);
        Peers.connect(peer.id);
      });
      refreshCount();
    } catch (err) {
      console.error('Could not join room', err);
      if (err && err.error === 'room-full') {
        UI.toast(`This meeting is full (max ${err.max} people).`);
      }
    }
  }

  start();
})();
