const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { registerSignaling, ROOM_CODE_PATTERN } = require('./signaling');
const rooms = require('./rooms');
const { getIceServers } = require('./config');
const { securityHeaders } = require('./security');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
const server = http.createServer(app);
// Shorter heartbeat than the default so dropped clients leave rooms sooner.
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 8000,
  maxHttpBufferSize: 1e5, // signaling and chat messages are small
});

registerSignaling(io);

// Most free hosts (Render, Railway, Fly) terminate TLS at a proxy in front of the app.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeaders);

// Camera and microphone access only works on HTTPS (or localhost).
if (IS_PRODUCTION) {
  app.use((req, res, next) => {
    if (req.secure || req.path === '/health') return next();
    res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

app.use(
  express.static(PUBLIC_DIR, {
    maxAge: IS_PRODUCTION ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', ...rooms.stats() });
});

app.get('/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ iceServers: getIceServers(), maxParticipants: rooms.MAX_PARTICIPANTS });
});

// Lets the pre-join screen show who is already in the call.
app.get('/api/rooms/:code', (req, res) => {
  const code = req.params.code.toLowerCase();
  if (!ROOM_CODE_PATTERN.test(code)) {
    return res.status(400).json({ error: 'invalid-room' });
  }
  const participants = rooms.getParticipants(code);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    count: participants.length,
    names: participants.slice(0, 3).map((p) => p.name),
    full: participants.length >= rooms.MAX_PARTICIPANTS,
  });
});

app.get('/room/:code', (req, res) => {
  const code = req.params.code.toLowerCase();
  if (!ROOM_CODE_PATTERN.test(code)) {
    return res.redirect('/');
  }
  if (code !== req.params.code) {
    return res.redirect(301, `/room/${code}`);
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, 'room.html'));
});

app.use((req, res) => {
  res.redirect('/');
});

server.listen(PORT, () => {
  console.log(`FrameDock running on http://localhost:${PORT}`);
});

function shutdown() {
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
