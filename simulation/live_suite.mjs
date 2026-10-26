#!/usr/bin/env node
// Wall-clock synthetic clients against isolated copies of the actual local backend.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { scenarios, device } from './scenarios.mjs';
const backend = fileURLToPath(new URL('../backend/', import.meta.url));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run(scenario) {
  const logs = fs.mkdtempSync(path.join(os.tmpdir(), 'safety-synthetic-'));
  const server = spawn(process.execPath, ['server.js'], { cwd: backend,
    env: { ...process.env, PORT: '0', ADMIN_TOKEN: 'synthetic-only-token', RISK_PROFILE: 'walktest', LOG_POSITIONS: '1', LOG_DIR: logs }, stdio: ['ignore', 'pipe', 'pipe'] });
  const sockets = []; let timer; let failure;
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const deadline = setTimeout(() => reject(new Error('Backend startup timeout: ' + output)), 5000);
      server.stderr.on('data', d => { output += d; });
      server.stdout.on('data', d => { output += d; const m = output.match(/LISTENING (\d+)/); if (m) { clearTimeout(deadline); resolve(m[1]); } });
      server.once('exit', code => { clearTimeout(deadline); reject(new Error('Backend exited ' + code + ': ' + output)); });
      server.once('error', reject);
    });
    const statuses = [];
    for (const id of ['a', 'b']) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/`); sockets.push(ws);
      ws.on('message', raw => { const m = JSON.parse(raw); if (m.type === 'status') statuses.push({ id, ...m }); });
      await once(ws, 'open');
    }
    const start = Date.now();
    const sendPositions = () => {
      const t = (Date.now() - start) / 1000;
      for (let i = 0; i < 2; i++) {
        const d = device(i ? 'b' : 'a', (i ? scenario.b : scenario.a)(t));
        sockets[i].send(JSON.stringify({ type: 'position', deviceId: d.id, role: d.role,
          lat: d.lat, lon: d.lon, speed: d.speed, heading: d.heading, accuracy: 4, fixAgeMs: 0 }));
      }
    };
    sendPositions(); timer = setInterval(sendPositions, 250);
    await wait(22000); clearInterval(timer); timer = null;
    const levels = new Set(statuses.map(s => s.level));
    const alerted = levels.has('HIGH') || levels.has('CRITICAL');
    const expectedAlert = scenario.shouldWarn;
    const passed = statuses.some(s => s.id === 'a') && statuses.some(s => s.id === 'b') && alerted === expectedAlert;
    return { scenario: scenario.id, kind: 'LOCAL_SYNTHETIC_TRANSPORT', elapsedS: (Date.now() - start) / 1000,
      statuses: statuses.length, levels: [...levels], expectedHigh: expectedAlert, observedHigh: alerted, passed };
  } catch (error) { failure = error; throw error; }
  finally {
    clearInterval(timer); sockets.forEach(ws => ws.terminate());
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit'); server.kill('SIGTERM');
      await Promise.race([exited, wait(3000).then(() => { if (server.exitCode === null) server.kill('SIGKILL'); })]);
    }
    fs.rmSync(logs, { recursive: true, force: true });
    if (failure) console.error(scenario.id + ': ' + failure.message);
  }
}
// The checklist's delayed crossing hypothesis is measured offline, rather than asserted as truth here.
const selected = scenarios.filter(s => ['head-on', 'crossing-same-arrival', 'side-by-side', 'stationary-approach', 'walking-apart', 'wide-pass-25m'].includes(s.id));
const settled = await Promise.allSettled(selected.map(run));
const results = settled.map((result, i) => result.status === 'fulfilled' ? result.value : { scenario: selected[i].id, passed: false, error: result.reason.message });
const output = process.argv[2] || 'results/live-transport.json'; fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ kind: 'LOCAL_SYNTHETIC_TRANSPORT', inputHz: 4, backendTickHz: 1, results }, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
if (results.some(r => !r.passed)) process.exitCode = 1;
