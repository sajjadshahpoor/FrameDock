(() => {
  const roomCode = window.location.pathname.split('/').pop();
  const micBtn = document.getElementById('toggle-mic');
  const camBtn = document.getElementById('toggle-cam');
  const leaveBtn = document.getElementById('leave-call');

  const state = {
    localStream: null,
    micOn: true,
    camOn: true,
  };

  document.getElementById('room-code').textContent = roomCode;
  document.title = `${roomCode} - FrameDock`;

  function refreshControls() {
    UI.setToggleState(micBtn, state.micOn, { on: 'Turn off microphone', off: 'Turn on microphone' });
    UI.setToggleState(camBtn, state.camOn, { on: 'Turn off camera', off: 'Turn on camera' });
    UI.setAudioEnabled('local', state.micOn);
    UI.setVideoEnabled('local', state.camOn);
  }

  micBtn.addEventListener('click', () => {
    state.micOn = !state.micOn;
    state.localStream?.getAudioTracks().forEach((t) => (t.enabled = state.micOn));
    refreshControls();
  });

  camBtn.addEventListener('click', () => {
    state.camOn = !state.camOn;
    state.localStream?.getVideoTracks().forEach((t) => (t.enabled = state.camOn));
    refreshControls();
  });

  leaveBtn.addEventListener('click', () => {
    Media.stopStream(state.localStream);
    window.location.href = '/';
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
  }

  start();
})();
