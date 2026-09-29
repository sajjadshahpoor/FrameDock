(() => {
  const roomCode = window.location.pathname.split('/').pop();
  const inviteUrl = `${window.location.origin}/room/${roomCode}`;
  const params = new URLSearchParams(window.location.search);
  const NAME_KEY = 'framedock:name';

  const $ = (id) => document.getElementById(id);
  const prejoin = $('prejoin');
  const callScreen = $('call-screen');
  const nameInput = $('display-name');
  const previewTile = $('preview-tile');
  const previewVideo = $('preview-video');
  const previewStatus = $('preview-status');
  const audioOnlyBtn = $('toggle-audio-only');
  const countLabel = $('participant-count');
  const inviteCard = $('invite-card');
  const micButtons = document.querySelectorAll('[data-action="mic"]');
  const camButtons = document.querySelectorAll('[data-action="cam"]');

  const state = {
    name: '',
    joined: false,
    config: null,
    localStream: new MediaStream(),
    micOn: false,
    camOn: false,
    audioOnly: params.get('mode') === 'audio',
    busy: false,
    peers: new Map(), // id -> { name, media, stream }
  };

  let previewReady = Promise.resolve();

  $('room-code').textContent = roomCode;
  $('prejoin-code').textContent = roomCode;
  $('invite-url').textContent = inviteUrl;
  document.title = `${roomCode} - FrameDock`;

  const CAMERA_MESSAGES = {
    'permission-denied': 'Camera permission was blocked. You can still join with audio.',
    'not-found': 'No camera found. You can still join with audio.',
    'in-use': 'Your camera is being used by another app.',
    unknown: 'Camera unavailable. You can still join with audio.',
  };

  const MIC_MESSAGES = {
    'permission-denied': 'Microphone permission was blocked. Others will not hear you.',
    'not-found': 'No microphone found. Others will not hear you.',
    'in-use': 'Your microphone is being used by another app.',
    unknown: 'Microphone unavailable.',
  };

  // ---------- Rendering ----------

  function refreshCount() {
    const total = state.peers.size + 1;
    countLabel.textContent = total === 1 ? 'Only you' : `${total} people`;
  }

  function refreshControls() {
    const micLabels = { on: 'Turn off microphone', off: 'Turn on microphone' };
    const camLabels = { on: 'Turn off camera', off: 'Turn on camera' };
    micButtons.forEach((btn) => UI.setToggleState(btn, state.micOn, micLabels));
    camButtons.forEach((btn) => {
      UI.setToggleState(btn, state.camOn, camLabels);
      btn.disabled = state.joined && state.audioOnly;
    });

    audioOnlyBtn.classList.toggle('active', state.audioOnly);
    audioOnlyBtn.setAttribute('aria-pressed', String(state.audioOnly));
    audioOnlyBtn.title = state.audioOnly ? 'Turn video back on' : 'Switch to audio-only mode';
    $('audio-only-badge').hidden = !state.audioOnly;

    previewTile.classList.toggle('video-off', !state.camOn);
    previewStatus.hidden = state.camOn;
    if (!state.camOn) previewStatus.textContent = state.audioOnly ? 'Audio only' : 'Camera is off';

    UI.setAudioEnabled('local', state.micOn);
    UI.setVideoEnabled('local', state.camOn);
    refreshPeople();
  }

  function refreshLocalPreview() {
    // A fresh MediaStream makes <video> elements pick up added/removed tracks reliably.
    const videoOnly = new MediaStream(state.localStream.getVideoTracks());
    previewVideo.srcObject = videoOnly;
    previewVideo.play().catch(() => {});
    UI.setStream('local', videoOnly);
  }

  function refreshRemoteVideo(id) {
    const peer = state.peers.get(id);
    if (!peer) return;
    const hasLiveVideo = Boolean(peer.stream?.getVideoTracks().some((t) => !t.muted));
    UI.setVideoEnabled(id, !state.audioOnly && peer.media.video && hasLiveVideo);
  }

  function refreshInviteCard() {
    inviteCard.hidden = !state.joined || state.peers.size > 0 || inviteCard.dataset.dismissed === 'true';
  }

  function publishMediaState() {
    if (state.joined) Signaling.sendMediaState({ audio: state.micOn, video: state.camOn });
  }

  function refreshPeople() {
    if (!state.joined) return;
    const people = [
      { name: state.name, isLocal: true, media: { audio: state.micOn, video: state.camOn } },
      ...Array.from(state.peers.values()).map((peer) => ({ name: peer.name, media: peer.media })),
    ];
    Panel.renderPeople(people);
  }

  // ---------- Participants ----------

  function addPeer(peer) {
    state.peers.set(peer.id, { name: peer.name, media: peer.media, stream: null });
    UI.addTile(peer.id, { name: peer.name });
    UI.setAudioEnabled(peer.id, peer.media.audio);
    UI.setVideoEnabled(peer.id, false);
    UI.setConnecting(peer.id, 'Connecting...');
    refreshCount();
    refreshInviteCard();
    refreshPeople();
  }

  function removePeer(id) {
    const peer = state.peers.get(id);
    state.peers.delete(id);
    Peers.remove(id);
    AudioLevel.unwatch(id);
    UI.removeTile(id);
    refreshCount();
    refreshInviteCard();
    refreshPeople();
    if (peer) UI.toast(`${peer.name} left the call`, { duration: 2500 });
  }

  // ---------- Camera / microphone ----------

  async function startCamera() {
    let track;
    try {
      track = await Media.getCameraTrack();
    } catch (err) {
      UI.toast(CAMERA_MESSAGES[Media.describeError(err)]);
      return;
    }
    state.localStream.addTrack(track);
    track.addEventListener('ended', () => withLock(stopCamera));
    await Peers.setTrack('video', track, state.localStream);
    state.camOn = true;
    refreshLocalPreview();
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
      if (state.joined) AudioLevel.watch('local', state.localStream);
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

  async function setAudioOnly(enabled) {
    state.audioOnly = enabled;
    if (enabled && state.camOn) await stopCamera();
    Peers.setReceiveVideo(!enabled);
    state.peers.forEach((_, id) => refreshRemoteVideo(id));
  }

  micButtons.forEach((btn) =>
    btn.addEventListener('click', () =>
      withLock(async () => {
        const track = state.localStream.getAudioTracks()[0];
        if (!track) {
          state.micOn = await startMicrophone();
          return;
        }
        state.micOn = !state.micOn;
        track.enabled = state.micOn;
      })
    )
  );

  camButtons.forEach((btn) =>
    btn.addEventListener('click', () =>
      withLock(async () => {
        if (state.camOn) {
          await stopCamera();
        } else {
          // Turning the camera on before joining means the user wants video after all.
          if (!state.joined) state.audioOnly = false;
          await startCamera();
        }
      })
    )
  );

  audioOnlyBtn.addEventListener('click', () =>
    withLock(async () => {
      await setAudioOnly(!state.audioOnly);
      UI.toast(
        state.audioOnly
          ? 'Audio-only mode: video is off for you and others, saving bandwidth.'
          : 'Video is back on. Turn on your camera when you are ready.'
      );
    })
  );

  // ---------- Invite ----------

  async function shareInvite() {
    const shareData = { title: 'Join my FrameDock call', text: `Join my call on FrameDock (code ${roomCode})`, url: inviteUrl };
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    if (isTouch && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      UI.toast('Invite link copied to clipboard', { duration: 2500 });
    } catch {
      window.prompt('Copy this invite link:', inviteUrl);
    }
  }

  document.querySelectorAll('[data-action="invite"]').forEach((btn) => btn.addEventListener('click', shareInvite));

  $('invite-close').addEventListener('click', () => {
    inviteCard.dataset.dismissed = 'true';
    refreshInviteCard();
  });

  // ---------- Leaving ----------

  $('leave-call').addEventListener('click', () => {
    Peers.closeAll();
    Signaling.leaveRoom();
    Media.stopStream(state.localStream);
    window.location.href = '/';
  });

  // ---------- Signaling events ----------

  Signaling.on('peer-joined', (peer) => {
    addPeer(peer);
    UI.toast(`${peer.name} joined`, { duration: 2500 });
  });
  Signaling.on('peer-left', ({ id }) => removePeer(id));
  Signaling.on('peer-media', ({ id, media }) => {
    const peer = state.peers.get(id);
    if (!peer) return;
    peer.media = media;
    UI.setAudioEnabled(id, media.audio);
    refreshRemoteVideo(id);
    refreshPeople();
  });
  Signaling.on('signal', ({ from, data }) => Peers.handleSignal(from, data));
  Signaling.on('chat', (message) => {
    const seen = Panel.addMessage(message);
    if (!seen) {
      const preview = message.text.length > 80 ? `${message.text.slice(0, 80)}...` : message.text;
      UI.toast(`${message.name}: ${preview}`, { duration: 3500 });
    }
  });
  Signaling.on('chat-error', () => UI.toast('You are sending messages too quickly. Please wait a moment.'));

  // ---------- Pre-join ----------

  async function loadConfig() {
    try {
      const res = await fetch('/config');
      return await res.json();
    } catch {
      return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    }
  }

  async function loadRoomStatus() {
    const statusEl = $('room-status');
    try {
      const res = await fetch(`/api/rooms/${roomCode}`);
      const { count, names, full } = await res.json();
      if (full) {
        statusEl.textContent = 'This meeting is full right now.';
      } else if (count === 0) {
        statusEl.textContent = 'No one else is here yet.';
      } else {
        const others = count - names.length;
        statusEl.textContent = `${names.join(', ')}${others > 0 ? ` and ${others} more` : ''} ${count === 1 ? 'is' : 'are'} in this call.`;
      }
    } catch {
      statusEl.textContent = '';
    }
  }

  function updatePreviewInitials() {
    $('preview-initials').textContent = UI.initials(nameInput.value || '?');
  }

  async function preparePreview() {
    if (!Media.isSupported()) {
      previewStatus.textContent = 'Calls are not supported in this browser';
      UI.toast('This browser does not support calls. Try a recent Chrome, Edge, Firefox or Safari.');
      $('join-now').disabled = true;
      $('join-audio').disabled = true;
      return;
    }

    const media = await Media.getLocalStream({ video: !state.audioOnly });
    state.localStream = media.stream;
    state.micOn = media.audio;
    state.camOn = media.video;
    state.localStream.getVideoTracks().forEach((t) => t.addEventListener('ended', () => withLock(stopCamera)));

    if (!state.audioOnly && media.videoError) UI.toast(CAMERA_MESSAGES[media.videoError]);
    if (media.audioError) UI.toast(MIC_MESSAGES[media.audioError]);

    refreshLocalPreview();
    refreshControls();
  }

  async function join({ audioOnly }) {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.reportValidity();
      return;
    }
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // storage can be unavailable in private mode; the name just won't be remembered
    }

    state.name = name;
    $('join-now').disabled = true;
    $('join-audio').disabled = true;
    await previewReady;

    if (audioOnly) {
      state.audioOnly = true;
      if (state.camOn) await stopCamera();
    }

    const config = await loadConfig();
    Signaling.connect();

    let response;
    try {
      response = await Signaling.joinRoom({
        room: roomCode,
        name,
        media: { audio: state.micOn, video: state.camOn },
      });
    } catch (err) {
      $('join-now').disabled = false;
      $('join-audio').disabled = false;
      Signaling.socket.disconnect();
      UI.toast(err && err.error === 'room-full' ? `This meeting is full (max ${err.max} people).` : 'Could not join the meeting. Please try again.');
      loadRoomStatus();
      return;
    }

    state.joined = true;
    state.config = config;
    prejoin.hidden = true;
    callScreen.hidden = false;
    previewVideo.srcObject = null;

    UI.addTile('local', { name, isLocal: true });
    refreshLocalPreview();
    AudioLevel.init({ onChange: (id, speaking) => UI.setSpeaking(id, speaking) });
    AudioLevel.watch('local', state.localStream);
    startSession(response);
  }

  // Sets up peer connections for a (re)joined session.
  function startSession(response) {
    state.selfId = response.selfId;
    Panel.init({ selfId: response.selfId, onSend: (text) => Signaling.sendChat(text) });

    Peers.init({
      selfId: response.selfId,
      iceServers: state.config.iceServers,
      localStream: state.localStream,
      receiveVideo: !state.audioOnly,
      handlers: {
        stream: (id, stream) => {
          const peer = state.peers.get(id);
          if (!peer) return;
          peer.stream = stream;
          UI.setStream(id, stream);
          AudioLevel.watch(id, stream);
          refreshRemoteVideo(id);
        },
        state: (id, connectionState) => {
          const reconnecting = connectionState === 'disconnected' || connectionState === 'failed';
          UI.setConnecting(id, reconnecting ? 'Reconnecting...' : connectionState === 'connected' ? null : undefined);
        },
      },
    });

    // The newcomer starts the connections; existing participants answer.
    response.peers.forEach((peer) => {
      addPeer(peer);
      Peers.connect(peer.id);
    });

    refreshCount();
    refreshControls();
    refreshInviteCard();
  }

  // ---------- Reconnection ----------
  // If the signaling connection drops, the server forgets us. Once the socket is back,
  // rejoin with a fresh session and rebuild every peer connection.

  let reconnectToastShown = false;
  let previousId = null;

  Signaling.on('disconnect', (reason) => {
    if (!state.joined || reason === 'io client disconnect') return;
    reconnectToastShown = true;
    previousId = state.selfId;
    document.body.classList.add('offline');
    UI.toast('Connection lost. Trying to reconnect...', { duration: 6000 });
  });

  Signaling.on('connect', async () => {
    if (!state.joined || !reconnectToastShown) return;
    reconnectToastShown = false;

    Peers.closeAll();
    Array.from(state.peers.keys()).forEach((id) => {
      state.peers.delete(id);
      AudioLevel.unwatch(id);
      UI.removeTile(id);
    });

    try {
      const response = await Signaling.joinRoom({
        room: roomCode,
        name: state.name,
        media: { audio: state.micOn, video: state.camOn },
        previousId,
      });
      document.body.classList.remove('offline');
      startSession(response);
      UI.toast('Reconnected', { duration: 2000 });
    } catch (err) {
      UI.toast(err && err.error === 'room-full' ? 'Could not rejoin: the meeting is now full.' : 'Could not rejoin the meeting.');
    }
  });

  $('prejoin-form').addEventListener('submit', (event) => {
    event.preventDefault();
    join({ audioOnly: state.audioOnly });
  });
  $('join-audio').addEventListener('click', () => join({ audioOnly: true }));
  nameInput.addEventListener('input', updatePreviewInitials);

  try {
    nameInput.value = localStorage.getItem(NAME_KEY) || '';
  } catch {
    nameInput.value = '';
  }
  updatePreviewInitials();
  loadRoomStatus();
  previewReady = preparePreview();
})();
