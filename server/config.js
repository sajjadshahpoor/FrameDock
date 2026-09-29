// ICE server configuration handed to browsers.
// Public STUN is enough for most home and mobile networks. For strict corporate
// networks a TURN relay helps; set TURN_URL/TURN_USERNAME/TURN_CREDENTIAL to use one
// (e.g. a free-tier provider or a self-hosted coturn).

function getIceServers() {
  const servers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  if (process.env.TURN_URL) {
    servers.push({
      urls: process.env.TURN_URL.split(',').map((url) => url.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  return servers;
}

module.exports = { getIceServers };
