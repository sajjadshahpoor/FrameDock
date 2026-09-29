const path = require('path');
const http = require('http');
const express = require('express');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
const server = http.createServer(app);

app.use(express.static(PUBLIC_DIR));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

server.listen(PORT, () => {
  console.log(`FrameDock running on http://localhost:${PORT}`);
});
