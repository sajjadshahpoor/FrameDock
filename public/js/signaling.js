// Thin wrapper around the Socket.io connection used for call signaling.
const Signaling = (() => {
  const socket = io({ autoConnect: false });

  function connect() {
    if (!socket.connected) socket.connect();
  }

  function joinRoom({ room, name, media }) {
    return new Promise((resolve, reject) => {
      socket.emit('join-room', { room, name, media }, (response) => {
        if (response && response.ok) resolve(response);
        else reject(response || { error: 'unknown' });
      });
    });
  }

  function sendSignal(to, data) {
    socket.emit('signal', { to, data });
  }

  function sendMediaState(media) {
    socket.emit('media-state', media);
  }

  function leaveRoom() {
    socket.emit('leave-room');
    socket.disconnect();
  }

  function on(event, handler) {
    socket.on(event, handler);
  }

  return { connect, joinRoom, sendSignal, sendMediaState, leaveRoom, on, socket };
})();
