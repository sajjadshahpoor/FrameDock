# FrameDock

Free, browser-based audio and video calling. Create a meeting, share the link, talk. No accounts, no downloads, and an audio-only mode for slow connections.

## Features

- **Video and audio calls** in the browser, peer-to-peer over WebRTC
- **Audio-only mode**: join without video, or switch mid-call. It stops *sending and receiving* video, not just hiding it, so it genuinely saves bandwidth
- **Automatic fallback** to audio when there is no camera, permission is denied, or the camera is busy
- **Shareable links and meeting codes** (`abc-defg-hij`), with nothing to sign up for
- **Pre-join screen** with camera/mic preview, display name and "who's already here"
- **In-call chat** and participant list
- **Screen sharing** on desktop browsers
- **Active speaker highlight**
- **Reconnects automatically** after a network drop
- **Responsive UI** for desktop, tablet and phone

## How it works

```
 Browser A  <──── audio / video (WebRTC, peer-to-peer) ────>  Browser B
     │                                                            │
     └──────── signaling (Socket.io: join, SDP, ICE, chat) ───────┘
                               │
                      Node.js + Express server
```

- The **server** only handles signaling: who is in which room, and relaying WebRTC offers, answers and ICE candidates between peers. It also relays chat messages. Nothing is stored; rooms exist in memory while people are in them.
- **Media never passes through the server.** Each participant connects directly to every other participant (a *mesh*). This keeps hosting free: the server moves a few kilobytes per call.
- NAT traversal uses Google's public STUN servers by default. A TURN relay can be added for users behind strict firewalls (see [Configuration](#configuration)).
- Because every participant uploads a separate stream to each peer, rooms are capped at **6 people** and video bitrate is lowered automatically as the room grows.

### Why this is free to run

| Piece | Cost |
| --- | --- |
| Signaling server | Fits in any free Node.js tier (Render, Railway, Fly.io, Glitch) |
| Audio/video | Peer-to-peer, so no media server or bandwidth bill |
| STUN | Public Google STUN servers |
| TURN (optional) | Only needed for ~10–15% of networks. Use a free tier (e.g. Metered, ExpressTURN) or self-host coturn |

If bandwidth is a concern for users, audio-only mode uses a small fraction of the data a video call does.

## Getting started

Requires Node.js 18 or newer.

```bash
git clone https://github.com/sajjadshahpoor/FrameDock.git
cd FrameDock
npm install
npm run dev
```

Open http://localhost:3000, click **New meeting**, then open the same link in another tab or on another device.

> Browsers only allow camera and microphone access on `https://` pages or `localhost`. To test from your phone on the same Wi-Fi, use a tunnel such as `npx localtunnel --port 3000` or deploy it (below).

## Deploying

### Render (free tier)

The repo includes a [`render.yaml`](render.yaml) blueprint.

1. Push the repo to GitHub.
2. In Render, choose **New > Blueprint** and select the repository.
3. Deploy. Render provides HTTPS automatically, which is required for camera access.

Free Render instances sleep when idle, so the first visit after a while can take ~30 seconds to load.

### Any other Node host

```bash
npm ci --omit=dev
NODE_ENV=production npm start
```

Put it behind HTTPS (most hosts do this for you). WebSockets must be allowed.

## Configuration

All settings are optional environment variables. See [`.env.example`](.env.example).

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `NODE_ENV` | – | `production` enables the HTTPS redirect and asset caching |
| `MAX_PARTICIPANTS` | `6` | Max people per room |
| `TURN_URL` | – | TURN server URL(s), comma-separated |
| `TURN_USERNAME` | – | TURN username |
| `TURN_CREDENTIAL` | – | TURN password/credential |

## Project structure

```
server/
  index.js        Express app, routes, Socket.io setup
  signaling.js    Room join/leave, signal relay, media state, chat
  rooms.js        In-memory room registry
  config.js       ICE (STUN/TURN) servers sent to clients
  security.js     Security headers (CSP etc.)
public/
  index.html      Landing page
  room.html       Pre-join screen and call UI
  css/styles.css
  js/
    room-code.js    Meeting code generation and parsing
    landing.js      Landing page logic
    signaling.js    Socket.io client wrapper
    media.js        Camera/microphone access with fallbacks
    peers.js        RTCPeerConnection per participant (perfect negotiation)
    audio-level.js  Active speaker detection
    ui.js           Video tiles, layout, toasts
    panel.js        People list and chat panel
    room.js         Call flow: pre-join, controls, reconnection
```

## Browser support

Recent versions of Chrome, Edge, Firefox and Safari (desktop and mobile). Screen sharing is available on desktop browsers only.

## Limitations

- Mesh calls work best with up to 4–6 people. Larger meetings would need an SFU (e.g. mediasoup, LiveKit), which is a paid-infrastructure step.
- Without a TURN server, some users on strict corporate or carrier networks may not be able to connect.
- Chat is not saved. It disappears when the call ends.
- Anyone with the link can join, so share it only with the people you want in the call.

## License

[MIT](LICENSE)
