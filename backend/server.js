/**
 * Minimal real-time position broadcast server.
 * ------------------------------------------------
 * What it does:
 *   1. Accepts WebSocket connections from clients (pedestrians/cyclists/drivers).
 *   2. Each client sends position updates: { deviceId, lat, lon, heading, speed }.
 *   3. Server stores the latest state per device in memory.
 *   4. Server broadcasts every device's latest state to every OTHER connected
 *      client, so each client can run collision-risk checks locally against
 *      nearby devices.
 *
 * Why broadcast-to-all instead of "nearby only" for v1:
 *   Real geospatial filtering (e.g. only send devices within 200m) adds real
 *   complexity — you'd need spatial indexing to do it efficiently at scale.
 *   For a v1 prototype with a handful of test devices, broadcasting
 *   everything and letting each client filter/run risk-checks locally is
 *   simpler and totally fine. This is a known place to optimize later
 *   (step 7 of the roadmap, once you have real usage data).
 */

const WebSocket = require('ws');

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

// In-memory store: deviceId -> latest state
// Data model matches the roadmap spec exactly: device ID, lat/lon, heading, speed, timestamp
const deviceStates = new Map();

// Track which WebSocket connection belongs to which deviceId,
// so we know who to exclude when broadcasting (a device shouldn't
// receive its own position back) and how to clean up on disconnect.
const socketToDeviceId = new Map();

function broadcastDeviceState(deviceId, state, originatingSocket) {
  const message = JSON.stringify({
    type: 'position_update',
    deviceId,
    ...state,
  });

  wss.clients.forEach((client) => {
    // Don't echo a device's own update back to itself, and only send
    // to sockets that are still open.
    if (client !== originatingSocket && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (socket) => {
  console.log('Client connected');

  // Fix: bring the newly-connected client up to speed immediately, rather
  // than making it wait for every other device's *next* update. We send
  // one "snapshot" message containing everyone we currently know about.
  // (We can't reuse the single-device broadcast message shape here since
  // this is multiple devices at once, so it gets its own message type.)
  if (deviceStates.size > 0) {
    const snapshot = {
      type: 'snapshot',
      devices: Object.fromEntries(deviceStates),
    };
    socket.send(JSON.stringify(snapshot));
  }

  socket.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error('Received malformed JSON, ignoring:', raw.toString());
      return;
    }

    // Basic shape validation — reject anything missing required fields
    // rather than silently broadcasting garbage.
    const { deviceId, lat, lon, heading, speed } = data;
    if (
      typeof deviceId !== 'string' ||
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      typeof heading !== 'number' ||
      typeof speed !== 'number'
    ) {
      console.error('Malformed position update, ignoring:', data);
      return;
    }

    const state = {
      lat,
      lon,
      heading,
      speed,
      timestamp: Date.now(),
    };

    deviceStates.set(deviceId, state);
    socketToDeviceId.set(socket, deviceId);

    broadcastDeviceState(deviceId, state, socket);
  });

  socket.on('close', () => {
    const deviceId = socketToDeviceId.get(socket);
    if (deviceId) {
      console.log(`Device disconnected: ${deviceId}`);
      deviceStates.delete(deviceId);
      socketToDeviceId.delete(socket);
    }
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err);
  });
});

console.log(`WebSocket server listening on ws://localhost:${PORT}`);