const test = require('node:test');
const assert = require('node:assert/strict');
const { serverUrl } = require('./serverUrl');
test('local address uses ws', () => assert.equal(serverUrl(' 192.168.1.50:8080 '), 'ws://192.168.1.50:8080/'));
test('hosted and HTTPS addresses use wss', () => { assert.equal(serverUrl('example.onrender.com'), 'wss://example.onrender.com/'); assert.equal(serverUrl('https://example.com'), 'wss://example.com/'); });
test('reject empty or unsafe URLs', () => { for (const value of ['', 'ftp://example.com', 'https://user:password@example.com']) assert.throws(() => serverUrl(value)); });
