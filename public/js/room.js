(() => {
  const roomCode = window.location.pathname.split('/').pop();
  const micBtn = document.getElementById('toggle-mic');
  const camBtn = document.getElementById('toggle-cam');
  const leaveBtn = document.getElementById('leave-call');
  const countLabel = document.getElementById('participant-count');

  const state = {
    localStream: null,
    micOn: true,
    camOn: true,
    peers: new Map(), // id -> { name, media }
  };

  document.getElementById('room-code').textContent = roomCode;
  document.title = `${roomCode} - FrameDock`;

  function refreshCount() {
    const total = state.peers.size + 1;
    countLabel.textContent = total === 1 ? 'Only you' : `${total} people`;
  }

  function refreshControls() {
    UI.setToggleState(micBtn, state.micOn, { on: 'Turn off microphone', off: 'Turn on microphone' });
    UI.setToggleState(camBtn, state.camOn, { on: 'Turn off camera', off: 'Turn on camera' });
    UI.setAudioEnabled('local', state.micOn);
    UI.setVideoEnabled('local', state.camOn);
  }

  function publishMediaState() {
    Signaling.sendMediaState({ audio: state.micOn, video: state.camOn });
  }

  function addPeer(peer) {
    state.peers.set(peer.id, { name: peer.name, media: peer.media });
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
    UI.setVideoEnabled(id, peer.media.video && hasLiveVideo);
  }

  async function loadConfig() {
    try {
      const res = await fetch('/config');
      return await res.json();
    } catch {
      return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    }
  }

  micBtn.addEventListener('click', () => {
    state.micOn = !state.micOn;
    state.localStream?.getAudioTracks().forEach((t) => (t.enabled = state.micOn));
    refreshControls();
    publishMediaState();
  });

  camBtn.addEventListener('click', () => {
    state.camOn = !state.camOn;
    state.localStream?.getVideoTracks().forEach((t) => (t.enabled = state.camOn));
    refreshControls();
    publishMediaState();
  });

  leaveBtn.addEventListener('click', () => {
    Peers.closeAll();
    Signaling.leaveRoom();
    Media.stopStream(state.localStream);
    window.location.href = '/';
  });

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

  async function start() {
    UI.addTile('local', { name: 'Me', isLocal: true });
    try {
      state.localStream = await Media.getLocalStream();
      UI.setStream('local', state.localStream);
    } catch (err) {
      console.error('Could not access camera/microphone', err);
      state.micOn = false;
      state.camOn = false;
    }
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
    }
  }

  start();
})();
