const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { registerSignaling, ROOM_CODE_PATTERN } = require('./signaling');
const rooms = require('./rooms');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

registerSignaling(io);

app.use(express.static(PUBLIC_DIR));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', ...rooms.stats() });
});

app.get('/room/:code', (req, res) => {
  const code = req.params.code.toLowerCase();
  if (!ROOM_CODE_PATTERN.test(code)) {
    return res.redirect('/');
  }
  res.sendFile(path.join(PUBLIC_DIR, 'room.html'));
});

server.listen(PORT, () => {
  console.log(`FrameDock running on http://localhost:${PORT}`);
});
