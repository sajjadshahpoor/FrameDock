(() => {
  const newMeetingBtn = document.getElementById('new-meeting');
  const joinForm = document.getElementById('join-form');
  const codeInput = document.getElementById('join-code');
  const joinBtn = document.getElementById('join-btn');
  const errorText = document.getElementById('join-error');

  function goToRoom(code, { audioOnly = false } = {}) {
    window.location.href = `/room/${code}${audioOnly ? '?mode=audio' : ''}`;
  }

  newMeetingBtn.addEventListener('click', () => {
    goToRoom(RoomCode.generate());
  });

  document.getElementById('new-audio-call').addEventListener('click', (event) => {
    event.preventDefault();
    goToRoom(RoomCode.generate(), { audioOnly: true });
  });

  codeInput.addEventListener('input', () => {
    joinBtn.disabled = codeInput.value.trim().length === 0;
    errorText.hidden = true;
  });

  joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = RoomCode.normalize(codeInput.value);
    if (!code) {
      errorText.hidden = false;
      codeInput.focus();
      return;
    }
    goToRoom(code);
  });
})();
