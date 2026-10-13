'use strict';
// Safety Alert System backend.
// Phones send 'position' messages over WebSocket. Once per second the server projects every
// device to "now", runs the risk model on every pair, and pushes a 'status' message to each phone.
// A live debug page is served at http://<this-computer>:8080/

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const risk = require('./riskModel');

const PORT = Number(process.env.PORT) || 8080;
const PROFILE_NAME = process.env.RISK_PROFILE === 'real' ? 'real' : 'walktest';
const PROFILE = risk.PROFILES[PROFILE_NAME];
const VERBOSE = process.env.VERBOSE === '1';

const TICK_MS = 1000;
const MAX_AGE_MS = 5000;        // data older than this is not used for risk
const FORGET_AFTER_MS = 30000;  // device removed after this much silence
const PEER_RADIUS_M = 500;      // phones only learn about peers within this distance
const CONFIRM_UP = 2;           // ticks needed to raise a pair's alert level
const CONFIRM_DOWN = 2;         // ticks needed to lower it

const VALID_ROLES = new Set(risk.ROLES);
const devices = new Map();      // deviceId -> record
const pairStates = new Map();   // "idA|idB" -> alert state machine

const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(ts(), ...a);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ---------- HTTP (dashboard + health) ----------
const DASHBOARD = path.join(__dirname, 'public', 'dashboard.html');
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/dashboard') {
    fs.readFile(DASHBOARD, (err, html) => {
      if (err) { res.writeHead(500); res.end('dashboard.html missing'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
  } else if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, profile: PROFILE_NAME, devices: devices.size, uptimeS: Math.round(process.uptime()) }));
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});

// ---------- WebSocket ----------
const wss = new WebSocket.Server({ server, maxPayload: 4096 });

function send(socket, obj) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
}

function parsePosition(m) {
  if (typeof m.deviceId !== 'string' || !/^[A-Za-z0-9_.-]{1,40}$/.test(m.deviceId)) return { error: 'bad deviceId' };
  if (!VALID_ROLES.has(m.role)) return { error: 'bad role' };
  if (!isNum(m.lat) || Math.abs(m.lat) > 90) return { error: 'bad lat' };
  if (!isNum(m.lon) || Math.abs(m.lon) > 180) return { error: 'bad lon' };
  let speed = null;
  if (m.speed != null) {
    if (!isNum(m.speed) || m.speed < 0 || m.speed > 100) return { error: 'bad speed' };
    speed = m.speed;
  }
  let heading = null;
  if (m.heading != null) {
    if (!isNum(m.heading)) return { error: 'bad heading' };
    heading = ((m.heading % 360) + 360) % 360;
  }
  let accuracy = null;
  if (m.accuracy != null) {
    if (!isNum(m.accuracy) || m.accuracy < 0) return { error: 'bad accuracy' };
    accuracy = m.accuracy;
  }
  let fixAgeMs = 0;
  if (m.fixAgeMs != null) {
    if (!isNum(m.fixAgeMs) || m.fixAgeMs < 0) return { error: 'bad fixAgeMs' };
    fixAgeMs = Math.min(m.fixAgeMs, 600000);
  }
  return { value: { id: m.deviceId, role: m.role, lat: m.lat, lon: m.lon, speed, heading, accuracy, fixAgeMs } };
}

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.deviceId = null;
  socket.isObserver = false;
  socket.on('pong', () => { socket.isAlive = true; });

  socket.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'observe') { socket.isObserver = true; return; }
    if (m.type !== 'position') return;

    const parsed = parsePosition(m);
    if (parsed.error) {
      send(socket, { type: 'error', message: 'Rejected position: ' + parsed.error });
      log('! rejected message:', parsed.error);
      return;
    }
    const p = parsed.value;
    if (socket.deviceId && socket.deviceId !== p.id) {
      send(socket, { type: 'error', message: 'This connection already belongs to another deviceId' });
      return;
    }
    const existing = devices.get(p.id);
    if (existing && existing.socket !== socket) {
      log('~ ' + p.id + ' reconnected, replacing old connection');
      existing.socket.deviceId = null;
      existing.socket.terminate();
    }
    socket.deviceId = p.id;
    if (!existing) log('+ ' + p.id + ' (' + p.role + ') joined. Devices online: ' + (devices.size + 1));
    devices.set(p.id, Object.assign({}, p, { socket, receivedAt: Date.now() }));
    if (VERBOSE) {
      log('  pos', p.id, 'lat=' + p.lat.toFixed(6), 'lon=' + p.lon.toFixed(6),
        'speed=' + (p.speed === null ? 'n/a' : p.speed.toFixed(2)),
        'heading=' + (p.heading === null ? 'n/a' : p.heading.toFixed(0)),
        'acc=' + (p.accuracy === null ? 'n/a' : p.accuracy.toFixed(1)));
    }
  });

  socket.on('close', () => {
    if (!socket.deviceId) return;
    const d = devices.get(socket.deviceId);
    if (d && d.socket === socket) {
      devices.delete(socket.deviceId);
      log('- ' + socket.deviceId + ' left. Devices online: ' + devices.size);
    }
  });
  socket.on('error', () => {});
});

setInterval(() => {
  wss.clients.forEach((s) => {
    if (s.isAlive === false) { s.terminate(); return; }
    s.isAlive = false;
    try { s.ping(); } catch (e) { /* ignore */ }
  });
}, 10000);

// ---------- alert state machine (debounce / hysteresis) ----------
function newPairState() { return { level: 'NONE', upCount: 0, upMin: 0, downCount: 0, downMax: 0 }; }

function stepPair(ps, rawLevel) {
  const r = risk.RANK[rawLevel];
  const cur = risk.RANK[ps.level];
  if (r > cur) {
    ps.downCount = 0;
    ps.upCount += 1;
    ps.upMin = ps.upCount === 1 ? r : Math.min(ps.upMin, r);
    if (ps.upCount >= CONFIRM_UP) { ps.level = risk.LEVELS[ps.upMin]; ps.upCount = 0; }
  } else if (r < cur) {
    ps.upCount = 0;
    ps.downCount += 1;
    ps.downMax = ps.downCount === 1 ? r : Math.max(ps.downMax, r);
    if (ps.downCount >= CONFIRM_DOWN) { ps.level = risk.LEVELS[ps.downMax]; ps.downCount = 0; }
  } else {
    ps.upCount = 0;
    ps.downCount = 0;
  }
}

const round = (x, n) => (x === null || x === undefined ? null : Number(x.toFixed(n)));

// ---------- main loop ----------
function tick() {
  const now = Date.now();
  for (const [id, d] of devices) {
    if (now - d.receivedAt > FORGET_AFTER_MS) { devices.delete(id); log('- ' + id + ' timed out'); }
  }

  const all = [];
  for (const d of devices.values()) {
    const moving = d.speed !== null && d.speed >= PROFILE.MIN_MOVING_MPS && d.heading !== null;
    // A stationary phone's last GPS fix may be old; only moving devices need a fresh fix.
    const ageMs = now - d.receivedAt + (moving ? d.fixAgeMs : 0);
    const stale = ageMs > MAX_AGE_MS;
    const state = { lat: d.lat, lon: d.lon, heading: d.heading, speed: d.speed === null ? 0 : d.speed, accuracy: d.accuracy, role: d.role };
    all.push({ d, ageMs, stale, cur: stale ? state : risk.advance(state, ageMs / 1000, PROFILE) });
  }
  all.sort((x, y) => (x.d.id < y.d.id ? -1 : 1));
  const live = all.filter((r) => !r.stale);

  const pairs = [];
  const seen = new Set();
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const A = live[i];
      const B = live[j];
      const key = A.d.id + '|' + B.d.id;
      const res = risk.assess(A.cur, B.cur, PROFILE);
      let ps = pairStates.get(key);
      if (!ps) { ps = newPairState(); pairStates.set(key, ps); }
      const before = ps.level;
      stepPair(ps, res.level);
      seen.add(key);
      pairs.push({ key, A, B, res, level: ps.level });
      const detail = 'risk=' + res.risk.toFixed(2) + ' tcpa=' + (res.tcpaS === null ? 'n/a' : res.tcpaS.toFixed(1) + 's') +
        ' miss=' + res.missM.toFixed(1) + 'm closing=' + res.closingMps.toFixed(1) + 'm/s dist=' + res.distM.toFixed(1) + 'm reason=' + res.reason;
      if (ps.level !== before) log('RISK ' + A.d.id + ' <-> ' + B.d.id + '  ' + before + ' -> ' + ps.level + '  ' + detail);
      else if (VERBOSE) log('  pair ' + A.d.id + ' <-> ' + B.d.id + ' raw=' + res.level + ' shown=' + ps.level + ' ' + detail);
    }
  }
  for (const k of Array.from(pairStates.keys())) if (!seen.has(k)) pairStates.delete(k);

  for (const rec of all) {
    let top = null;
    const peers = [];
    for (const p of pairs) {
      if (p.A !== rec && p.B !== rec) continue;
      const other = p.A === rec ? p.B : p.A;
      if (p.res.distM > PEER_RADIUS_M) continue;
      const bearing = p.A === rec ? p.res.bearingAtoB : (p.res.bearingAtoB + 180) % 360;
      peers.push({
        id: other.d.id, role: other.d.role, lat: other.cur.lat, lon: other.cur.lon,
        speed: round(other.cur.speed, 2), heading: other.cur.heading === null ? null : round(other.cur.heading, 0),
        level: p.level, distM: round(p.res.distM, 1),
      });
      const better = !top || risk.RANK[p.level] > risk.RANK[top.level] ||
        (p.level === top.level && p.res.risk > top.res.risk);
      if (better) top = { level: p.level, res: p.res, other, bearing };
    }
    const level = top ? top.level : 'NONE';
    const threat = top && level !== 'NONE' ? {
      peerId: top.other.d.id, peerRole: top.other.d.role, level,
      risk: round(top.res.risk, 3), tcpaS: round(top.res.tcpaS, 1), missM: round(top.res.missM, 1),
      closingMps: round(top.res.closingMps, 2), distanceM: round(top.res.distM, 1), bearingDeg: round(top.bearing, 0),
    } : null;
    send(rec.d.socket, { type: 'status', t: now, level, stale: rec.stale, profile: PROFILE_NAME, threat, peers });
  }

  const snapshot = {
    type: 'dashboard', t: now, profile: PROFILE_NAME,
    devices: all.map((r) => ({
      id: r.d.id, role: r.d.role, lat: r.cur.lat, lon: r.cur.lon, speed: r.d.speed, heading: r.d.heading,
      accuracy: r.d.accuracy, ageMs: Math.round(r.ageMs), stale: r.stale,
    })),
    pairs: pairs.map((p) => ({
      a: p.A.d.id, b: p.B.d.id, distM: round(p.res.distM, 1), tcpaS: round(p.res.tcpaS, 1), missM: round(p.res.missM, 1),
      closingMps: round(p.res.closingMps, 2), risk: round(p.res.risk, 3), raw: p.res.level, level: p.level,
      reason: p.res.reason, P: round(p.res.P, 2), U: round(p.res.U, 2), S: round(p.res.S, 2),
    })),
  };
  wss.clients.forEach((s) => { if (s.isObserver) send(s, snapshot); });
}

setInterval(tick, TICK_MS);

server.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log(' Safety Alert System backend');
  console.log(' Risk profile : ' + PROFILE_NAME + (PROFILE_NAME === 'walktest'
    ? '  (walking-speed severity; use RISK_PROFILE=real for physical severity)' : ''));
  console.log(' Port         : ' + PORT);
  console.log(' Put ONE of these in the phone app (Server field):');
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((n) => {
      if (n.family === 'IPv4' && !n.internal) console.log('   ' + n.address + ':' + PORT + '   (' + name + ')');
    });
  });
  console.log(' Live dashboard: open http://<one of those addresses> in a browser');
  console.log('==============================================');
});

process.on('SIGINT', () => { console.log('\nshutting down'); process.exit(0); });
