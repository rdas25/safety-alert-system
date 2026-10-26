import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarios, recording, groundTruth } from '../scenarios.mjs';
import { benchmark } from '../benchmark.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { replay } = require('../../backend/replay');
test('head-on and crossing trajectories independently meet; wide pass stays 25 m away', () => {
  for (const id of ['head-on', 'crossing-same-arrival']) assert.ok(groundTruth(scenarios.find(s => s.id === id)).minDistanceM < 0.02);
  assert.ok(Math.abs(groundTruth(scenarios.find(s => s.id === 'wide-pass-25m')).minDistanceM - 25) < 0.01);
});
test('seeds reproduce inputs and different seeds change noisy inputs', () => {
  const scenario = scenarios[0];
  assert.deepEqual(recording(scenario, { noise: 3, seed: 1 }), recording(scenario, { noise: 3, seed: 1 }));
  assert.notDeepEqual(recording(scenario, { noise: 3, seed: 1 }), recording(scenario, { noise: 3, seed: 2 }));
});
test('clean intended hazard cases reach shown HIGH and quiet paths never alert', () => {
  for (const scenario of scenarios.filter(s => !s.diagnostic && s.id !== 'crossing-wait-five-seconds')) {
    const result = replay(recording(scenario));
    const high = result.timeline.some(t => ['HIGH', 'CRITICAL'].includes(t.shown));
    assert.equal(high, scenario.shouldWarn, scenario.id);
    if (['side-by-side', 'walking-apart', 'wide-pass-25m'].includes(scenario.id)) assert.ok(result.timeline.every(t => t.shown === 'NONE'));
  }
});
test('poor GPS produces no assessed proxy; late joining pair is evaluated after arrival', () => {
  assert.equal(replay(recording(scenarios.find(s => s.id === 'poor-gps'))).pairs.length, 0);
  const result = replay(recording(scenarios.find(s => s.id === 'late-join')));
  assert.ok(result.timeline.every(t => t.t >= 1700000008000));
  assert.ok(result.timeline.some(t => ['HIGH', 'CRITICAL'].includes(t.shown)));
});
test('benchmark preserves all evaluations and counts only the seven core scenarios', () => {
  const result = benchmark(); assert.equal(result.runs.length, 450); assert.equal(result.syntheticRuns, 90);
  for (const row of result.sweep) assert.equal(row.TRUE_ALERT + row.MISSED + row.FALSE_ALERT + row.QUIET + row.UNASSESSED, 63);
});
