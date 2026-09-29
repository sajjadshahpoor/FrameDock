const UI = (() => {
  const grid = document.getElementById('video-grid');
  const template = document.getElementById('tile-template');
  const tiles = new Map();

  function initials(name) {
    const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?')[0];
    return letters.toUpperCase();
  }

  function addTile(id, { name, isLocal = false } = {}) {
    if (tiles.has(id)) return tiles.get(id);

    const tile = template.content.firstElementChild.cloneNode(true);
    tile.dataset.peer = id;
    if (isLocal) {
      tile.classList.add('local');
      tile.querySelector('video').muted = true;
    }
    tiles.set(id, tile);
    grid.appendChild(tile);
    setName(id, name);
    updateLayout();
    return tile;
  }

  function removeTile(id) {
    const tile = tiles.get(id);
    if (!tile) return;
    const video = tile.querySelector('video');
    video.srcObject = null;
    tile.remove();
    tiles.delete(id);
    updateLayout();
  }

  function setName(id, name) {
    const tile = tiles.get(id);
    if (!tile) return;
    const label = tile.classList.contains('local') ? `${name} (You)` : name;
    tile.querySelector('.tile-name').textContent = label;
    tile.querySelector('.avatar-initials').textContent = initials(name);
  }

  function setStream(id, stream) {
    const tile = tiles.get(id);
    if (!tile) return;
    const video = tile.querySelector('video');
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(() => {});
  }

  function setVideoEnabled(id, enabled) {
    const tile = tiles.get(id);
    if (tile) tile.classList.toggle('video-off', !enabled);
  }

  function setAudioEnabled(id, enabled) {
    const tile = tiles.get(id);
    if (tile) tile.classList.toggle('muted', !enabled);
  }

  // Pick a column count that keeps tiles as large as possible for the screen shape.
  function updateLayout() {
    const count = tiles.size;
    const portrait = window.innerHeight > window.innerWidth;
    let columns;
    if (portrait) {
      columns = count <= 2 ? 1 : 2;
    } else {
      columns = Math.ceil(Math.sqrt(count));
    }
    const rows = Math.ceil(count / columns) || 1;
    grid.style.setProperty('--cols', columns);
    grid.style.setProperty('--rows', rows);
    grid.dataset.count = count;
  }

  function setSpeaking(id, speaking) {
    const tile = tiles.get(id);
    if (tile) tile.classList.toggle('speaking', speaking);
  }

  // message: string shows an overlay, null hides it, undefined leaves it unchanged.
  function setConnecting(id, message) {
    const tile = tiles.get(id);
    if (!tile || message === undefined) return;
    let overlay = tile.querySelector('.tile-status');
    if (!message) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'tile-status';
      tile.appendChild(overlay);
    }
    overlay.textContent = message;
  }

  function setToggleState(button, on, labels) {
    button.setAttribute('aria-pressed', String(on));
    button.classList.toggle('off', !on);
    button.title = on ? labels.on : labels.off;
  }

  function toast(message, { duration = 4500 } = {}) {
    const container = document.getElementById('toasts');
    if (!container || !message) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
      setTimeout(() => el.remove(), 400);
    }, duration);
  }

  window.addEventListener('resize', updateLayout);

  return {
    addTile,
    removeTile,
    setName,
    setStream,
    setVideoEnabled,
    setAudioEnabled,
    setToggleState,
    setConnecting,
    setSpeaking,
    updateLayout,
    toast,
    initials,
    get tileCount() {
      return tiles.size;
    },
  };
})();
