// Bare local addresses use ws; public hostnames default to TLS.
function serverUrl(input) {
  let value = input.trim();
  if (!value) throw new Error('Enter a server address');
  if (!/^[a-z]+:\/\//i.test(value)) value = (/^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(value) ? 'ws://' : 'wss://') + value;
  const url = new URL(value);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Invalid server address');
  url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
  return url.toString();
}
module.exports = { serverUrl };
