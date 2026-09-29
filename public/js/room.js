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
    UI.removeTile(id);
    refreshCount();
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
  });

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

    Signaling.connect();
    try {
      const { peers } = await Signaling.joinRoom({
        room: roomCode,
        name: 'Me',
        media: { audio: state.micOn, video: state.camOn },
      });
      peers.forEach(addPeer);
      refreshCount();
    } catch (err) {
      console.error('Could not join room', err);
    }
  }

  start();
})();
