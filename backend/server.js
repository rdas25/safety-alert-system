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
const crypto = require('crypto');
const risk = require('./riskModel');

const { credentials, boundedSend } = require('./access');
const {AccessStore}=require('./accessStore');
const accessStore=new AccessStore(process.env);
const authenticate=token=>accessStore.lookup(token);
const {append,estimate}=require('./motion');
const {variants}=require('./prediction');
const {candidatePairs}=require('./spatial');
const roadContext=require('./roadContext');
const roads=process.env.ROAD_CONTEXT_FILE?roadContext.prepare(JSON.parse(fs.readFileSync(process.env.ROAD_CONTEXT_FILE,'utf8'))):[];
const MAX_DEVICES = 100;
const MAX_CONNECTIONS = 128;
const MAX_IDENTITIES = 1000;
const MODEL_VERSION = ['riskModel.js','alertState.js','motion.js','prediction.js','spatial.js'].reduce((hash,file)=>hash.update(fs.readFileSync(path.join(__dirname,file))),crypto.createHash('sha256')).update(process.env.MOTION_MODE||'raw').digest('hex');
const owners = new Map(); // Device credentials live for this server session.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
if (process.env.NODE_ENV === 'production' && !ADMIN_TOKEN) throw new Error('ADMIN_TOKEN required in production');
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, 'logs');
let recording=null,recordingError=null;
if(process.env.LOG_POSITIONS==='1'){const {Journal}=require('./recording');recording=new Journal(LOG_DIR,{onError:error=>{recordingError=error.message;console.error('Recording disabled:',error.message);}});}
function authorized(token) {
  if (!ADMIN_TOKEN) return true; // local development only
  const a = Buffer.from(token || ''); const b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const PORT = process.env.PORT === undefined ? 8080 : Number(process.env.PORT);
const PROFILE_NAME = process.env.RISK_PROFILE;
if (!Object.hasOwn(risk.PROFILES, PROFILE_NAME || '')) throw Error('RISK_PROFILE must explicitly be walktest or real');
const PROFILE = risk.PROFILES[PROFILE_NAME];
if(process.env.MOTION_MODE&&!['raw','history'].includes(process.env.MOTION_MODE))throw Error('MOTION_MODE must be raw or history');
const VERBOSE = process.env.VERBOSE === '1';

const TICK_MS = 1000;
const MAX_AGE_MS = 5000;        // data older than this is not used for risk
const FORGET_AFTER_MS = 30000;  // device removed after this much silence
const PEER_RADIUS_M = 500;      // phones only learn about peers within this distance

const VALID_ROLES = new Set(risk.ROLES);
const devices = new Map();      // deviceId -> record
const pairStates = new Map();   // "idA|idB" -> alert state machine

const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(ts(), ...a);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ---------- HTTP (dashboard + health) ----------
const DASHBOARD = path.join(__dirname, 'public', 'dashboard.html');
let lastTickAt=Date.now(), lastTickMs=0;
const server = http.createServer((req, res) => {
  let parsedUrl;
  try { parsedUrl = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400); res.end('Invalid URL'); return; }
  const url = parsedUrl.pathname;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (url !== '/health' && url !== '/ready' && !authorized(req.headers.authorization?.replace(/^Bearer /,'') || parsedUrl.searchParams.get('token'))) { res.writeHead(401); res.end('Unauthorized'); return; }
  if(url==='/admin/access'){
    if(!ADMIN_TOKEN || !authorized(req.headers.authorization?.replace(/^Bearer /,''))){res.writeHead(401);res.end('Bearer admin token required');return;}
    if(req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(accessStore.list()));return;}
    if(!['POST','DELETE'].includes(req.method)){res.writeHead(405);res.end();return;}
    let body='';req.on('data',chunk=>{body+=chunk;if(body.length>4096)req.destroy();});req.on('end',()=>{
      try{const {session,subject}=JSON.parse(body);let token;
        if(req.method==='POST')token=accessStore.issue(session,subject);
        else {accessStore.revoke(session,subject);for(const [key,owner] of owners)if(key.startsWith(session+'|')&&owner.subject===subject)owners.delete(key);for(const [id,d] of devices)if(d.session===session&&d.subject===subject){devices.delete(id);owners.delete(id);d.socket.close(1008,'Access revoked');}wss.clients.forEach(socket=>{if(socket.access?.session===session&&socket.access?.subject===subject)socket.close(1008,'Access revoked');});}
        res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,...(token?{token}:{})}));
      }catch(error){res.writeHead(400);res.end(JSON.stringify({error:error.message}));}
    });return;
  }
  if(url==='/metrics'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({devices:devices.size,connections:wss.clients.size,pairs:pairStates.size,lastTickMs,recording:!!recording&&!recordingError,recordingError,modelVersion:MODEL_VERSION}));return;}
  if(url==='/ready'){const ready=!stopping&&Date.now()-lastTickAt<3000;res.writeHead(ready?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({ready,lastTickMs}));return;}
  if (url === '/logs') {
    const files = fs.existsSync(LOG_DIR) ? fs.readdirSync(LOG_DIR).filter(n => /^session-[0-9]+\.jsonl$/.test(n)) : [];
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(files)); return;
  }
  if (url.startsWith('/logs/')) {
    const name = url.slice(6);
    if (!/^session-[0-9]+\.jsonl$/.test(name) || !fs.existsSync(path.join(LOG_DIR, name))) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Content-Disposition': 'attachment; filename="' + name + '"' });
    const stream = fs.createReadStream(path.join(LOG_DIR, name)); stream.on('error', () => res.destroy()); stream.pipe(res); return;
  }
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
  boundedSend(socket, obj, WebSocket.OPEN);
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

wss.on('connection', (socket, req) => {
  if(wss.clients.size>MAX_CONNECTIONS){socket.close(1013,'Connection limit');return;}
  const authDeadline=setTimeout(()=>{if(!socket.authenticated&&!socket.deviceId&&!socket.isObserver)socket.close(1008,'Authentication timeout');},10000);
  socket.on('close',()=>clearTimeout(authDeadline));
  let windowStart=Date.now(), messages=0;
  let observerAuthorized;
  try { observerAuthorized = authorized(new URL(req.url, 'http://localhost').searchParams.get('token')); }
  catch { socket.close(1008, 'Invalid URL'); return; }
  send(socket, { type: 'credential', deviceSecret: crypto.randomBytes(32).toString('hex') });
  socket.isAlive = true;
  socket.deviceId = null;
  socket.isObserver = false;
  socket.on('pong', () => { socket.isAlive = true; });

  socket.on('message', (raw) => {
    if(Date.now()-windowStart>=1000){windowStart=Date.now();messages=0;}
    if(++messages>10){socket.close(1008,'Rate limit');return;}
    let m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if(m.type==='authenticate'){
      if(!authenticate(m.sessionToken)){send(socket,{type:'error',message:'Unauthorized device'});socket.close(1008,'Unauthorized');return;}
      socket.access=authenticate(m.sessionToken);socket.authenticated=true;send(socket,{type:'authenticated'});return;
    }
    if (m.type === 'observe') {
      if (!observerAuthorized) {
        socket.send(JSON.stringify({ type: 'error', message: 'Unauthorized observer' }), () => socket.close(1008, 'Unauthorized'));
        return;
      }
      socket.isObserver = true; return;
    }
    if(m.type==='stop'){
      const a=authenticate(m.sessionToken),id=a&&a.session+'|'+m.deviceId,d=id&&devices.get(id);
      if(a&&typeof m.deviceSecret==='string'&&accessStore.stop(id,m.deviceSecret,a.subject)){devices.delete(id);send(socket,{type:'stopped'});if(d&&d.socket!==socket)d.socket.close(1000,'Tracking stopped');}else send(socket,{type:'error',message:'Unknown tracking session'});
      return;
    }
    if (m.type !== 'position') return;

    const access=authenticate(m.sessionToken);
    if(!access){send(socket,{type:'error',message:'Unauthorized device'});socket.close(1008,'Unauthorized');return;}
    const parsed = parsePosition(m);
    if (parsed.error) {
      send(socket, { type: 'error', message: 'Rejected position: ' + parsed.error });
      log('! rejected message:', parsed.error);
      return;
    }
    if (typeof m.deviceSecret !== 'string' || !/^[a-f0-9]{32,128}$/.test(m.deviceSecret)) {
      send(socket, { type: 'error', message: 'Device credential required' }); return;
    }
    const p = parsed.value;
    p.publicId=p.id; p.session=access.session; p.subject=access.subject;
    p.id=access.session+'|'+p.id;
    if(socket.deviceId && socket.deviceId!==p.id){send(socket,{type:'error',message:'Connection identity cannot change'});return;}
    if(!owners.has(p.id) && owners.size>=MAX_IDENTITIES){socket.close(1013,'Identity capacity');return;}
    if(!devices.has(p.id) && devices.size>=MAX_DEVICES){socket.close(1013,'Device capacity');return;}
    if (owners.has(p.id) && (owners.get(p.id).secret !== m.deviceSecret || owners.get(p.id).subject !== access.subject)) {
      send(socket, { type: 'error', message: 'Device identity already owned' }); return;
    }
    try{if(!accessStore.claim(p.id,m.deviceSecret,access.subject,access.session)){send(socket,{type:'error',message:'Device identity already owned'});return;}}catch(error){socket.close(1013,error.message);return;}
    socket.access=access;
    owners.set(p.id, {secret:m.deviceSecret,subject:access.subject});
    if (socket.deviceId && socket.deviceId !== p.id) {
      send(socket, { type: 'error', message: 'This connection already belongs to another deviceId' });
      return;
    }
    const existing = devices.get(p.id);
    if(existing && isNum(m.sequence) && existing.sequence!=null && m.sequence<=existing.sequence){send(socket,{type:'error',message:'Out-of-order position'});return;}
    if (existing && existing.socket !== socket) {
      log('~ ' + p.id + ' reconnected, replacing old connection');
      existing.socket.deviceId = null;
      existing.socket.terminate();
    }
    p.sequence=isNum(m.sequence)?m.sequence:null; p.background=m.background===true;
    socket.deviceId = p.id;
    if (!existing) log('+ ' + p.id + ' (' + p.role + ') joined. Devices online: ' + (devices.size + 1));
    const receivedAt=Date.now();
    const history=append(existing?.history||[],{...p,receivedAt});
    const motion=estimate(history);
    devices.set(p.id, Object.assign({}, p, { socket, receivedAt,history,motion,predictions:variants(history) }));
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
    if (d && d.socket === socket && !d.background) {
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
const { newPairState, stepPair } = require('./alertState');

const round = (x, n) => (x === null || x === undefined ? null : Number(x.toFixed(n)));

// ---------- main loop ----------
function tick() {
  const tickStart=performance.now();
  const now = Date.now();
  for (const [id, d] of devices) {
    if (now - d.receivedAt > FORGET_AFTER_MS) { devices.delete(id); log('- ' + id + ' timed out'); }
  }

  const all = [];
  for (const d of devices.values()) {
    const moving = d.speed !== null && d.speed >= PROFILE.MIN_MOVING_MPS && d.heading !== null;
    // Location freshness is independent of connection liveness and reported motion.
    const ageMs = now - d.receivedAt + d.fixAgeMs;
    const stale = ageMs > MAX_AGE_MS;
    const effective=(process.env.MOTION_MODE==='history'&&d.motion&&(d.speed===null||d.heading===null))?{...d,speed:d.motion.speed,heading:d.motion.heading}:d;
    const state = { lat: d.lat, lon: d.lon, heading: effective.heading, speed: effective.speed === null ? 0 : effective.speed, accuracy: d.accuracy, role: d.role };
    const coverage=stale?'stale':d.accuracy===null?'unknown_accuracy':d.accuracy>30?'poor_gps':effective.speed===null||(effective.speed>=0.5&&effective.heading===null)?'unknown_motion':'available';
    all.push({ d, ageMs, stale, coverage, links:[], cur: stale ? state : risk.advance(state, ageMs / 1000, PROFILE) });
  }
  all.sort((x, y) => (x.d.id < y.d.id ? -1 : 1));
  const live = all.filter((r) => r.coverage==='available');

  const pairs = [];
  const seen = new Set();
  for(const [A,B] of candidatePairs(live,PEER_RADIUS_M)){
      const key = A.d.id + '|' + B.d.id;
      const res = risk.assess(A.cur, B.cur, PROFILE);
      let ps = pairStates.get(key);
      if (!ps) { ps = newPairState(); pairStates.set(key, ps); }
      const before = ps.level;
      stepPair(ps, res.level);
      seen.add(key);
      const pair={ key, A, B, res, level: ps.level };
      pairs.push(pair); A.links.push(pair); B.links.push(pair);
      const detail = 'risk=' + res.risk.toFixed(2) + ' tcpa=' + (res.tcpaS === null ? 'n/a' : res.tcpaS.toFixed(1) + 's') +
        ' miss=' + res.missM.toFixed(1) + 'm closing=' + res.closingMps.toFixed(1) + 'm/s dist=' + res.distM.toFixed(1) + 'm reason=' + res.reason;
      if (ps.level !== before) log('RISK ' + A.d.id + ' <-> ' + B.d.id + '  ' + before + ' -> ' + ps.level + '  ' + detail);
      else if (VERBOSE) log('  pair ' + A.d.id + ' <-> ' + B.d.id + ' raw=' + res.level + ' shown=' + ps.level + ' ' + detail);
  }
  for (const k of Array.from(pairStates.keys())) if (!seen.has(k)) pairStates.delete(k);

  for (const rec of all) {
    let top = null;
    const peers = [];
    for (const p of rec.links) {
      const other = p.A === rec ? p.B : p.A;
      if (p.res.distM > PEER_RADIUS_M) continue;
      const bearing = p.A === rec ? p.res.bearingAtoB : (p.res.bearingAtoB + 180) % 360;
      peers.push({
        id: other.d.publicId, role: other.d.role, lat: other.cur.lat, lon: other.cur.lon,
        speed: round(other.cur.speed, 2), heading: other.cur.heading === null ? null : round(other.cur.heading, 0),
        level: p.level, reason:p.res.reason, distM: round(p.res.distM, 1),
      });
      const better = !top || risk.RANK[p.level] > risk.RANK[top.level] ||
        (p.level === top.level && p.res.risk > top.res.risk);
      if (better) top = { level: p.level, res: p.res, other, bearing };
    }
    const level = top ? top.level : 'NONE';
    const threat = top && level !== 'NONE' ? {
      peerId: top.other.d.publicId, peerRole: top.other.d.role, level,
      risk: round(top.res.risk, 3), tcpaS: round(top.res.tcpaS, 1), missM: round(top.res.missM, 1),
      closingMps: round(top.res.closingMps, 2), distanceM: round(top.res.distM, 1), bearingDeg: round(top.bearing, 0),
    } : null;
    send(rec.d.socket, { type: 'status', t: now, level, stale: rec.stale, coverage:rec.coverage, unavailablePeers:all.filter(o=>o!==rec&&o.d.session===rec.d.session&&o.coverage!=='available').length, excludedPeers:rec.links.filter(p=>p.res.reason==='pair_excluded').length, profile: PROFILE_NAME, recordingEnabled:!!recording&&!recordingError, roadContext:roads.length?roadContext.match(roads,rec.cur):null, motion:rec.d.motion, predictions:rec.d.predictions, threat, peers });
  }

  const snapshot = {
    type: 'dashboard', t: now, modelVersion:MODEL_VERSION, profile: PROFILE_NAME,
    devices: all.map((r) => ({
      id: r.d.id, role: r.d.role, lat: r.cur.lat, lon: r.cur.lon, speed: r.cur.speed, heading: r.cur.heading, motion:r.d.motion,
      accuracy: r.d.accuracy, session:r.d.session, coverage:r.coverage, rawFix:{lat:r.d.lat,lon:r.d.lon,fixAgeMs:r.d.fixAgeMs,receivedAt:r.d.receivedAt,sequence:r.d.sequence}, ageMs: Math.round(r.ageMs), stale: r.stale,
    })),
    pairs: pairs.map((p) => ({
      a: p.A.d.id, b: p.B.d.id, distM: round(p.res.distM, 1), tcpaS: round(p.res.tcpaS, 1), missM: round(p.res.missM, 1),
      closingMps: round(p.res.closingMps, 2), risk: round(p.res.risk, 3), raw: p.res.level, level: p.level,
      reason: p.res.reason, P: round(p.res.P, 2), U: round(p.res.U, 2), S: round(p.res.S, 2),
    })),
  };
  if(recording)recording.write(JSON.stringify({...snapshot,schema:1})+'\n');
  wss.clients.forEach((s) => { if (s.isObserver) send(s, snapshot); });
  lastTickAt=Date.now(); lastTickMs=Number((performance.now()-tickStart).toFixed(2));
}

setInterval(tick, TICK_MS);

server.listen(PORT, '0.0.0.0', () => {
  console.log('LISTENING ' + server.address().port);
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

let stopping=false;
function shutdown() {
  if(stopping)return;stopping=true;
  server.close(); wss.clients.forEach(s=>s.close(1001,'Server restarting'));
  setTimeout(()=>process.exit(1),5000).unref();
  if (recording) recording.end(() => process.exit(0));
  else process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
