// Meeting codes look like "abc-defg-hij": easy to read out loud and type on a phone.
const RoomCode = (() => {
  const ALPHABET = 'abcdefghijkmnopqrstuvwxyz'; // no "l" to avoid confusion with "1"
  const PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

  function randomChars(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  }

  function generate() {
    return `${randomChars(3)}-${randomChars(4)}-${randomChars(3)}`;
  }

  // Accepts a raw code, a code without dashes, or a full invite link.
  function normalize(input) {
    if (!input) return null;
    let value = input.trim().toLowerCase();

    const linkMatch = value.match(/\/room\/([a-z-]+)/);
    if (linkMatch) value = linkMatch[1];

    const letters = value.replace(/[^a-z]/g, '');
    if (letters.length !== 10) return null;

    const code = `${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7)}`;
    return PATTERN.test(code) ? code : null;
  }

  function isValid(code) {
    return PATTERN.test(code);
  }

  return { generate, normalize, isValid };
})();
