// Manages one RTCPeerConnection per remote participant (full mesh).
// Uses the "perfect negotiation" pattern so either side can renegotiate
// (e.g. turning a camera on mid-call) without offer collisions breaking the call.
const Peers = (() => {
  const connections = new Map(); // id -> { pc, polite, makingOffer, ignoreOffer, remoteStream }

  let selfId = null;
  let iceServers = [];
  let localStream = null;
  let receiveVideo = true;
  let handlers = {};

  function init(options) {
    selfId = options.selfId;
    iceServers = options.iceServers || [];
    localStream = options.localStream || null;
    receiveVideo = options.receiveVideo !== false;
    handlers = options.handlers || {};
  }

  function emit(name, ...args) {
    if (typeof handlers[name] === 'function') handlers[name](...args);
  }

  function findTransceiver(pc, kind) {
    return pc.getTransceivers().find(
      (t) => !t.stopped && t.currentDirection !== 'stopped' && t.receiver.track.kind === kind
    );
  }

  function videoDirection(sending) {
    if (sending && receiveVideo) return 'sendrecv';
    if (sending) return 'sendonly';
    if (receiveVideo) return 'recvonly';
    return 'inactive';
  }

  // Changing a transceiver's direction triggers renegotiation, which tells the other
  // side to stop (or resume) sending. This is what actually saves bandwidth.
  function applyVideoDirection(pc) {
    const transceiver = findTransceiver(pc, 'video');
    if (!transceiver) return;
    const desired = videoDirection(Boolean(transceiver.sender.track));
    if (transceiver.direction !== desired) transceiver.direction = desired;
  }

  function create(id) {
    const pc = new RTCPeerConnection({ iceServers });
    const peer = {
      pc,
      polite: selfId > id, // any stable tie-breaker works, as long as both sides agree
      makingOffer: false,
      ignoreOffer: false,
      remoteStream: new MediaStream(),
    };
    connections.set(id, peer);

    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }
    applyVideoDirection(pc);

    pc.ontrack = ({ track }) => {
      // Build a fresh stream so <video> elements always pick up newly added tracks.
      const tracks = peer.remoteStream.getTracks().filter((t) => t.kind !== track.kind);
      peer.remoteStream = new MediaStream([...tracks, track]);
      emit('stream', id, peer.remoteStream);

      track.addEventListener('unmute', () => emit('stream', id, peer.remoteStream));
      track.addEventListener('mute', () => emit('stream', id, peer.remoteStream));
    };

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        Signaling.sendSignal(id, { description: pc.localDescription });
      } catch (err) {
        console.error('Negotiation failed', err);
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) Signaling.sendSignal(id, { candidate });
    };

    pc.onconnectionstatechange = () => {
      emit('state', id, pc.connectionState);
      if (pc.connectionState === 'failed') pc.restartIce();
    };

    return peer;
  }

  // Called by the newcomer for each participant already in the room.
  function connect(id) {
    if (!connections.has(id)) create(id);
  }

  async function handleSignal(from, data) {
    const peer = connections.get(from) || create(from);
    const { pc } = peer;

    try {
      if (data.description) {
        const { description } = data;
        const offerCollision =
          description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');

        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;

        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          Signaling.sendSignal(from, { description: pc.localDescription });
          applyVideoDirection(pc);
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!peer.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.error(`Signal from ${from} failed`, err);
    }
  }

  // Swap the outgoing audio or video track on every connection. Passing null stops sending.
  async function setTrack(kind, track, stream) {
    localStream = stream || localStream;
    const jobs = [];

    for (const { pc } of connections.values()) {
      const transceiver = findTransceiver(pc, kind);
      if (transceiver) {
        jobs.push(
          transceiver.sender.replaceTrack(track).then(() => {
            if (track && transceiver.sender.setStreams) transceiver.sender.setStreams(localStream);
            if (kind === 'video') applyVideoDirection(pc);
            else if (track && !transceiver.direction.startsWith('send')) transceiver.direction = 'sendrecv';
          })
        );
      } else if (track) {
        pc.addTrack(track, localStream);
        if (kind === 'video') applyVideoDirection(pc);
      }
    }

    await Promise.allSettled(jobs);
  }

  function setReceiveVideo(enabled) {
    receiveVideo = enabled;
    for (const { pc } of connections.values()) applyVideoDirection(pc);
  }

  function remove(id) {
    const peer = connections.get(id);
    if (!peer) return;
    peer.pc.close();
    connections.delete(id);
  }

  function closeAll() {
    for (const id of connections.keys()) remove(id);
  }

  return { init, connect, handleSignal, setTrack, setReceiveVideo, remove, closeAll };
})();
