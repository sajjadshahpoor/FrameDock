// Side panel with the participant list and in-call chat.
const Panel = (() => {
  const panel = document.getElementById('side-panel');
  const title = document.getElementById('panel-title');
  const tabs = document.querySelectorAll('[data-panel-tab]');
  const views = document.querySelectorAll('[data-panel-view]');
  const peopleList = document.getElementById('people-list');
  const messages = document.getElementById('chat-messages');
  const emptyChat = document.getElementById('chat-empty');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatBadge = document.getElementById('chat-badge');
  const toggleButtons = document.querySelectorAll('[data-open-panel]');

  const TITLES = { people: 'People', chat: 'In-call messages' };

  let current = null; // 'people' | 'chat' | null
  let unread = 0;
  let selfId = null;
  let onSend = () => {};

  function setUnread(count) {
    unread = count;
    chatBadge.hidden = unread === 0;
    chatBadge.textContent = unread > 9 ? '9+' : String(unread);
  }

  function open(view) {
    current = view;
    panel.hidden = false;
    document.body.classList.add('panel-open');
    title.textContent = TITLES[view];
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.panelTab === view));
    views.forEach((el) => (el.hidden = el.dataset.panelView !== view));
    toggleButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.openPanel === view));
    if (view === 'chat') {
      setUnread(0);
      messages.scrollTop = messages.scrollHeight;
      if (window.matchMedia('(pointer: fine)').matches) chatInput.focus();
    }
    window.dispatchEvent(new Event('resize'));
  }

  function close() {
    current = null;
    panel.hidden = true;
    document.body.classList.remove('panel-open');
    toggleButtons.forEach((btn) => btn.classList.remove('active'));
    window.dispatchEvent(new Event('resize'));
  }

  function toggle(view) {
    if (current === view) close();
    else open(view);
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Turn plain URLs into links without ever injecting HTML from the message.
  function renderText(container, text) {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    let lastIndex = 0;
    for (const match of text.matchAll(urlPattern)) {
      container.append(text.slice(lastIndex, match.index));
      const link = document.createElement('a');
      link.href = match[0];
      link.textContent = match[0];
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      container.append(link);
      lastIndex = match.index + match[0].length;
    }
    container.append(text.slice(lastIndex));
  }

  function addMessage({ id, name, text, ts }) {
    emptyChat.hidden = true;
    const mine = id === selfId;
    const last = messages.lastElementChild;
    const grouped = last && last.dataset.sender === id && ts - Number(last.dataset.ts) < 60000;

    const item = document.createElement('div');
    item.className = `chat-message${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}`;
    item.dataset.sender = id;
    item.dataset.ts = ts;

    if (!grouped) {
      const meta = document.createElement('div');
      meta.className = 'chat-meta';
      const author = document.createElement('strong');
      author.textContent = mine ? 'You' : name;
      const time = document.createElement('span');
      time.textContent = formatTime(ts);
      meta.append(author, time);
      item.append(meta);
    }

    const body = document.createElement('p');
    body.className = 'chat-text';
    renderText(body, text);
    item.append(body);

    const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
    messages.append(item);
    if (mine || nearBottom) messages.scrollTop = messages.scrollHeight;

    if (current !== 'chat' && !mine) {
      setUnread(unread + 1);
      return false; // not seen
    }
    return true;
  }

  function renderPeople(people) {
    peopleList.replaceChildren();
    document.getElementById('people-count').textContent = people.length;
    people.forEach((person) => {
      const row = document.createElement('li');
      row.className = 'person';

      const avatar = document.createElement('span');
      avatar.className = 'person-avatar';
      avatar.textContent = UI.initials(person.name);

      const name = document.createElement('span');
      name.className = 'person-name';
      name.textContent = person.isLocal ? `${person.name} (You)` : person.name;

      const status = document.createElement('span');
      status.className = 'person-status';
      const parts = [];
      if (!person.media.audio) parts.push('Muted');
      if (!person.media.video) parts.push('No video');
      status.textContent = parts.join(' · ');

      row.append(avatar, name, status);
      peopleList.append(row);
    });
  }

  function init(options) {
    selfId = options.selfId;
    onSend = options.onSend;
  }

  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    onSend(text);
    chatInput.value = '';
  });

  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });

  toggleButtons.forEach((btn) => btn.addEventListener('click', () => toggle(btn.dataset.openPanel)));
  tabs.forEach((tab) => tab.addEventListener('click', () => open(tab.dataset.panelTab)));
  document.getElementById('panel-close').addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && current) close();
  });

  return { init, open, close, toggle, addMessage, renderPeople, get current() { return current; } };
})();
