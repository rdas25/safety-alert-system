#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { scenarios, recording, groundTruth } from './scenarios.mjs';
const require = createRequire(import.meta.url);
const { replay } = require('../backend/replay');
const risk = require('../backend/riskModel');
export function benchmark() {
  const runs = [];
  for (const scenario of scenarios) for (const noise of [0, 3, 8]) for (const seed of [1, 2, 3]) {
    const rows = recording(scenario, { noise, seed });
    const truth = groundTruth(scenario);
    for (const high of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      const result = replay(rows, high);
      const first = result.timeline.find(t => risk.RANK[t.shown] >= risk.RANK.HIGH);
      const peak = result.timeline.reduce((level, t) => risk.RANK[t.shown] > risk.RANK[level] ? t.shown : level, 'NONE');
      const warned = !!first;
      runs.push({ scenario: scenario.id, diagnostic: !!scenario.diagnostic, noiseM: noise, seed, high,
        ...truth, peak, warned, warningS: first ? truth.closestS - (first.t - rows[0].t) / 1000 : null,
        proxyVerdict: result.pairs[0]?.verdict ?? 'UNASSESSED',
        verdict: !result.pairs.length ? 'UNASSESSED' : truth.shouldWarn ? (warned ? 'TRUE_ALERT' : 'MISSED') : (warned ? 'FALSE_ALERT' : 'QUIET') });
    }
  }
  const sweep = [0.3, 0.4, 0.5, 0.6, 0.7].map(high => {
    const selected = runs.filter(r => r.high === high && !r.diagnostic);
    const counts = Object.fromEntries(['TRUE_ALERT', 'MISSED', 'FALSE_ALERT', 'QUIET', 'UNASSESSED'].map(v => [v, selected.filter(r => r.verdict === v).length]));
    return { high, syntheticRuns: selected.length, ...counts };
  });
  return { kind: 'SYNTHETIC_MODEL_BENCHMARK', profile: 'walktest', independentTrajectories: scenarios.length,
    observationsPerRun: 26, noiseModel: 'independent bounded uniform position error per axis; exact headings/speeds',
    seeds: [1, 2, 3], noiseM: [0, 3, 8], syntheticRuns: runs.length / 5,
    riskModelSha256: createHash('sha256').update(fs.readFileSync(new URL('../backend/riskModel.js', import.meta.url))).digest('hex'),
    sweep, runs };
}
function report(data) {
  const baseline = data.runs.filter(r => r.high === 0.5 && r.noiseM === 0 && r.seed === 1);
  return `# Synthetic simulation results\n\n**Simulation only: no physical phones, field measurements or deployment.**\n\n` +
    `Reproduce: \`cd simulation && npm run benchmark\`. The runner evaluates the actual risk model and shared debounce through replay, with fictional coordinates.\n\n` +
    `${data.syntheticRuns} synthetic runs: ${data.independentTrajectories} trajectories × 3 bounded-noise levels × 3 seeds. Each run has 26 one-second snapshots and is evaluated at five HIGH cutoffs (450 evaluations). Clean seeds repeat identical inputs; these are not 90 independent real-world samples. Seven core scenarios contribute 63 runs per cutoff; three diagnostics are excluded from sweep counts.\n\n` +
    `Scenario labels come from intended trajectory behavior, independently of replay's 5 m GPS-distance proxy. True closest approach is sampled every 10 ms from the exact trajectories. Speeds/headings are perfect, noise is independent and bounded, and no network/hardware behavior is modeled here.\n\n` +
    `## Clean baseline (HIGH=0.50, seed=1)\n\n| Scenario | Peak shown | Known closest distance (m) | Warning before closest point (s) | Scenario verdict | Replay proxy |\n|---|---|---|---|---|---|\n` +
    baseline.map(r => `| ${r.scenario} | ${r.peak} | ${r.minDistanceM.toFixed(2)} | ${r.warningS === null ? 'n/a' : r.warningS.toFixed(2)} | ${r.verdict} | ${r.proxyVerdict} |`).join('\n') +
    `\n\n## Exploratory HIGH sweep (all core seeds/noise conditions)\n\n| HIGH | Synthetic runs | True alert | Missed | False alert | Quiet | Unassessed |\n|---|---|---|---|---|---|---|\n` +
    data.sweep.map(r => `| ${r.high.toFixed(2)} | ${r.syntheticRuns} | ${r.TRUE_ALERT} | ${r.MISSED} | ${r.FALSE_ALERT} | ${r.QUIET} | ${r.UNASSESSED} |`).join('\n') +
    `\n\n## Decision and limits\n\nThe clean five-second delayed crossing peaks at MODERATE, exceeding the checklist hypothesis of LOW or lower, although it does not reach HIGH. This mismatch is retained rather than marked as a pass. The stale-gap diagnostic misses its intended hazard after data loss. These are limitations, not successful safety validations.\n\nRetain HIGH=0.50. This sweep is exploratory simulation evidence, not a field-calibration decision. No improvement in real false-alert rate or warning time is established. Cases marked MISSED/FALSE_ALERT are retained in the report. Same-direction/retreating paths illustrate why replay's proximity proxy is not a collision ground truth. Poor GPS and stale data intentionally reduce coverage; no alert does not imply safety.\n\nModel SHA-256: \`${data.riskModelSha256}\`. JSON and CSV contain every evaluation for inspection. Live local transport tests are reported separately.\n`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const output = path.resolve(process.argv[2] || 'results');
  fs.mkdirSync(output, { recursive: true });
  const data = benchmark();
  fs.writeFileSync(path.join(output, 'benchmark.json'), JSON.stringify(data, null, 2) + '\n');
  const keys = Object.keys(data.runs[0]);
  fs.writeFileSync(path.join(output, 'benchmark.csv'), keys.join(',') + '\n' + data.runs.map(r => keys.map(k => r[k] ?? '').join(',')).join('\n') + '\n');
  fs.writeFileSync(path.join(output, 'REPORT.md'), report(data));
  const recordings = path.join(output, 'synthetic-recordings'); fs.mkdirSync(recordings, { recursive: true });
  for (const scenario of scenarios) fs.writeFileSync(path.join(recordings, scenario.id + '.jsonl'), recording(scenario).map(r => JSON.stringify(r)).join('\n') + '\n');
  console.log(JSON.stringify({ syntheticRuns: data.syntheticRuns, sweep: data.sweep, output }, null, 2));
}
