'use strict';
const test = require('node:test');
const assert = require('node:assert');
const risk = require('../riskModel');

const LAT0 = 40.4237;
const LON0 = -86.9212;
const WALK = risk.PROFILES.walktest;
const REAL = risk.PROFILES.real;

// x = meters east, y = meters north, relative to a fixed origin
function agent(x, y, heading, speed, role, accuracy) {
  return {
    lat: LAT0 + y / 111195,
    lon: LON0 + x / (111195 * Math.cos((LAT0 * Math.PI) / 180)),
    heading, speed, role: role || 'pedestrian', accuracy: accuracy === undefined ? 5 : accuracy,
  };
}
const level = (a, b, p) => risk.assess(a, b, p || WALK).level;
const rank = (l) => risk.RANK[l];

test('head-on walkers escalate as they close in', () => {
  const at = (gap) => level(agent(0, 0, 90, 1.4), agent(gap, 0, 270, 1.4));
  assert.strictEqual(at(40), 'NONE');
  assert.strictEqual(at(22), 'MODERATE');
  assert.strictEqual(at(14), 'HIGH');
  assert.strictEqual(at(8), 'CRITICAL');
  assert.ok(rank(at(8)) >= rank(at(14)) && rank(at(14)) >= rank(at(22)));
});

test('moving away from each other is never a risk', () => {
  const r = risk.assess(agent(0, 0, 270, 1.4), agent(5, 0, 90, 1.4), WALK);
  assert.strictEqual(r.level, 'NONE');
  assert.strictEqual(r.reason, 'diverging');
});

test('same velocity side by side is never a risk', () => {
  const r = risk.assess(agent(0, 0, 0, 1.4), agent(3, 0, 0, 1.4), WALK);
  assert.strictEqual(r.level, 'NONE');
  assert.strictEqual(r.reason, 'no_relative_motion');
});

test('opposite-direction pass: wide lateral gap is safe, narrow one is not', () => {
  assert.strictEqual(level(agent(0, 0, 0, 1.4), agent(20, 12, 180, 1.4)), 'NONE');
  assert.ok(rank(level(agent(0, 0, 0, 1.4), agent(2, 12, 180, 1.4))) >= rank('HIGH'));
});

test('crossing at very different times stays low; same time is elevated', () => {
  const diff = level(agent(-10, 0, 90, 1.4), agent(0, -24, 0, 1.4));
  const same = level(agent(-6, 0, 90, 1.4), agent(0, -6, 0, 1.4));
  assert.ok(rank(diff) <= rank('LOW'));
  assert.ok(rank(same) >= rank('HIGH'));
});

test('stationary person approached head-on: elevated, but not critical at walking speed', () => {
  const near = level(agent(0, 0, null, 0), agent(4, 0, 270, 1.4));
  assert.ok(rank(near) >= rank('HIGH'));
  assert.ok(rank(near) < rank('CRITICAL'));
  assert.strictEqual(level(agent(0, 0, null, 0), agent(15, 12, 180, 1.4)), 'NONE');
});

test('speeds under 0.5 m/s or unknown heading count as stationary', () => {
  const r = risk.assess(agent(0, 0, 90, 0.3), agent(10, 0, null, 3), WALK);
  assert.strictEqual(r.relSpeedMps, 0);
  assert.strictEqual(r.reason, 'no_relative_motion');
});

test('real profile: two walkers never exceed LOW, pedestrian vs car does', () => {
  const pp = level(agent(0, 0, 90, 1.4), agent(6, 0, 270, 1.4), REAL);
  assert.ok(rank(pp) <= rank('LOW'));
  const pc = level(agent(0, 0, 90, 1.4), agent(40, 0, 270, 8, 'driver'), REAL);
  assert.ok(rank(pc) >= rank('HIGH'));
});

test('driver-to-driver pairs are excluded; very poor GPS is not evaluated', () => {
  const dd = risk.assess(agent(0, 0, 90, 10, 'driver'), agent(60, 0, 270, 10, 'driver'), REAL);
  assert.strictEqual(dd.reason, 'pair_excluded');
  const poor = risk.assess(agent(0, 0, 90, 1.4, 'pedestrian', 40), agent(10, 0, 270, 1.4), WALK);
  assert.strictEqual(poor.reason, 'poor_gps');
  assert.strictEqual(poor.level, 'NONE');
});

test('risk is symmetric in A and B', () => {
  const a = agent(0, 0, 90, 1.4);
  const b = agent(20, 3, 250, 1.6);
  assert.ok(Math.abs(risk.assess(a, b, WALK).risk - risk.assess(b, a, WALK).risk) < 1e-4);
});

test('advance() dead-reckons a moving device and leaves a stationary one alone', () => {
  const moved = risk.advance(agent(0, 0, 90, 10, 'driver'), 2, WALK);
  const x0 = risk.localXY(agent(0, 0, 90, 10).lat, agent(0, 0, 90, 10).lon, LAT0, LON0).x;
  const x1 = risk.localXY(moved.lat, moved.lon, LAT0, LON0).x;
  assert.ok(Math.abs(x1 - x0 - 20) < 0.01);
  const still = agent(0, 0, null, 0);
  assert.deepStrictEqual(risk.advance(still, 5, WALK), still);
});
