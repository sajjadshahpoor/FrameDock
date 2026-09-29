(() => {
  const newMeetingBtn = document.getElementById('new-meeting');
  const joinForm = document.getElementById('join-form');
  const codeInput = document.getElementById('join-code');
  const joinBtn = document.getElementById('join-btn');
  const errorText = document.getElementById('join-error');

  function goToRoom(code) {
    window.location.href = `/room/${code}`;
  }

  newMeetingBtn.addEventListener('click', () => {
    goToRoom(RoomCode.generate());
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
