const WebSocket = require('ws');

const deviceId = process.argv[2] || 'test-device';
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log(`[${deviceId}] connected, sending position update`);
  ws.send(JSON.stringify({
    deviceId,
    lat: 40.4237,
    lon: -86.9212,
    heading: 90,
    speed: 1.4,
  }));
});

ws.on('message', (data) => {
  console.log(`[${deviceId}] received broadcast:`, data.toString());
  process.exit(0); // exit after receiving one message, for test purposes
});

ws.on('error', (err) => {
  console.error(`[${deviceId}] error:`, err.message);
});

// Safety timeout in case nothing arrives
setTimeout(() => {
  console.log(`[${deviceId}] no message received within timeout`);
  process.exit(1);
}, 3000);