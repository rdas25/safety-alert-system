import fs from 'node:fs';
import { createRequire } from 'node:module';
import { scenarios, recording } from './scenarios.mjs';
const require = createRequire(import.meta.url), risk = require('../backend/riskModel');
const { replay } = require('../backend/replay');
const frames = [];
for (const name of ['head-on', 'wide-pass-25m']) {
  const rows = recording(scenarios.find(s => s.id === name));
  const evaluation = replay(rows);
  for (const row of rows) {
    const [a,b] = row.devices, assessed = risk.assess(a,b,risk.PROFILES.walktest);
    frames.push({ scenario:name, seconds:(row.t-rows[0].t)/1000,
      a:risk.localXY(a.lat,a.lon,0,0), b:risk.localXY(b.lat,b.lon,0,0),
      raw:assessed.level, shown:evaluation.timeline.find(t=>t.t===row.t).shown,
      risk:assessed.risk, distanceM:assessed.distM, tcpaS:assessed.tcpaS });
  }
}
fs.writeFileSync(process.argv[2] || 'results/demo-frames.json', JSON.stringify(frames));
