// In-memory room registry. Rooms only exist while someone is in them,
// so there is nothing to persist or clean up between restarts.

const MAX_PARTICIPANTS = Number(process.env.MAX_PARTICIPANTS) || 6;

const rooms = new Map(); // code -> Map<socketId, participant>

function getRoom(code) {
  return rooms.get(code);
}

function getParticipants(code) {
  const room = rooms.get(code);
  return room ? Array.from(room.values()) : [];
}

function isFull(code) {
  const room = rooms.get(code);
  return Boolean(room) && room.size >= MAX_PARTICIPANTS;
}

function addParticipant(code, participant) {
  if (!rooms.has(code)) rooms.set(code, new Map());
  rooms.get(code).set(participant.id, participant);
}

function updateParticipant(code, id, changes) {
  const participant = rooms.get(code)?.get(id);
  if (!participant) return null;
  Object.assign(participant, changes);
  return participant;
}

function removeParticipant(code, id) {
  const room = rooms.get(code);
  if (!room) return;
  room.delete(id);
  if (room.size === 0) rooms.delete(code);
}

function stats() {
  let participants = 0;
  for (const room of rooms.values()) participants += room.size;
  return { rooms: rooms.size, participants };
}

module.exports = {
  MAX_PARTICIPANTS,
  getRoom,
  getParticipants,
  isFull,
  addParticipant,
  updateParticipant,
  removeParticipant,
  stats,
};
