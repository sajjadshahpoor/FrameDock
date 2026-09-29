// Highlights the tile of whoever is currently talking.
const AudioLevel = (() => {
  const SPEAKING_THRESHOLD = 0.035;
  const HOLD_MS = 600; // keep the highlight briefly so it doesn't flicker between words
  const monitors = new Map(); // id -> { source, analyser, data, lastLoud, trackId }

  let context = null;
  let timer = null;
  let onChange = () => {};

  function ensureContext() {
    if (!context) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      context = new Ctx();
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  function init(options) {
    onChange = options.onChange;
    ensureContext();
    if (!timer) timer = setInterval(tick, 120);
  }

  function watch(id, stream) {
    const track = stream && stream.getAudioTracks()[0];
    const existing = monitors.get(id);
    if (existing && track && existing.trackId === track.id) return;
    unwatch(id);
    if (!track) return;

    const ctx = ensureContext();
    if (!ctx) return;

    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    monitors.set(id, {
      source,
      analyser,
      data: new Float32Array(analyser.fftSize),
      lastLoud: 0,
      speaking: false,
      trackId: track.id,
    });
  }

  function unwatch(id) {
    const monitor = monitors.get(id);
    if (!monitor) return;
    monitor.source.disconnect();
    monitors.delete(id);
    if (monitor.speaking) onChange(id, false);
  }

  function tick() {
    const now = performance.now();
    for (const [id, monitor] of monitors) {
      monitor.analyser.getFloatTimeDomainData(monitor.data);
      let sum = 0;
      for (let i = 0; i < monitor.data.length; i++) sum += monitor.data[i] * monitor.data[i];
      const rms = Math.sqrt(sum / monitor.data.length);

      if (rms > SPEAKING_THRESHOLD) monitor.lastLoud = now;
      const speaking = now - monitor.lastLoud < HOLD_MS;
      if (speaking !== monitor.speaking) {
        monitor.speaking = speaking;
        onChange(id, speaking);
      }
    }
  }

  return { init, watch, unwatch };
})();
