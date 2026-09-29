const rooms = require('./rooms');

const ROOM_CODE_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
const MAX_NAME_LENGTH = 40;

function cleanName(name) {
  const value = String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return value || 'Guest';
}

function cleanMedia(media = {}) {
  return { audio: Boolean(media.audio), video: Boolean(media.video) };
}

function registerSignaling(io) {
  io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('join-room', (payload = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const code = String(payload.room || '').toLowerCase();

      if (!ROOM_CODE_PATTERN.test(code)) {
        return reply({ ok: false, error: 'invalid-room' });
      }
      if (currentRoom) {
        return reply({ ok: false, error: 'already-joined' });
      }
      if (rooms.isFull(code)) {
        return reply({ ok: false, error: 'room-full', max: rooms.MAX_PARTICIPANTS });
      }

      const participant = {
        id: socket.id,
        name: cleanName(payload.name),
        media: cleanMedia(payload.media),
      };

      const existing = rooms.getParticipants(code);
      rooms.addParticipant(code, participant);
      socket.join(code);
      currentRoom = code;

      socket.to(code).emit('peer-joined', participant);
      reply({ ok: true, selfId: socket.id, peers: existing });
    });

    // Relay SDP offers/answers and ICE candidates to a single peer in the same room.
    socket.on('signal', ({ to, data } = {}) => {
      if (!currentRoom || !to || !data) return;
      const target = rooms.getRoom(currentRoom)?.get(to);
      if (!target) return;
      io.to(to).emit('signal', { from: socket.id, data });
    });

    socket.on('media-state', (media) => {
      if (!currentRoom) return;
      const participant = rooms.updateParticipant(currentRoom, socket.id, { media: cleanMedia(media) });
      if (participant) {
        socket.to(currentRoom).emit('peer-media', { id: socket.id, media: participant.media });
      }
    });

    function leave() {
      if (!currentRoom) return;
      rooms.removeParticipant(currentRoom, socket.id);
      socket.to(currentRoom).emit('peer-left', { id: socket.id });
      socket.leave(currentRoom);
      currentRoom = null;
    }

    socket.on('leave-room', leave);
    socket.on('disconnect', leave);
  });
}

module.exports = { registerSignaling, ROOM_CODE_PATTERN };
