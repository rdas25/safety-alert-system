// Synthetic walking trajectories in local meters. They are not field recordings.
const speed = 1.4;
const moving = (x, y, heading, t, delay = 0) => {
  const elapsed = Math.max(0, t - delay);
  const radians = heading * Math.PI / 180;
  return { x: x + elapsed * speed * Math.sin(radians), y: y + elapsed * speed * Math.cos(radians),
    speed: t < delay ? 0 : speed, heading: t < delay ? null : heading };
};
export const scenarios = [
  { id: 'head-on', shouldWarn: true, expected: 'HIGH+', a: t => moving(-20, 0, 90, t), b: t => moving(20, 0, 270, t) },
  { id: 'crossing-same-arrival', shouldWarn: true, expected: 'HIGH+', a: t => moving(-14, 0, 90, t), b: t => moving(0, -14, 0, t) },
  { id: 'crossing-wait-five-seconds', shouldWarn: false, expected: 'LOW or lower (checklist hypothesis)', a: t => moving(-14, 0, 90, t), b: t => moving(0, -14, 0, t, 5) },
  { id: 'side-by-side', shouldWarn: false, expected: 'NONE', a: t => moving(0, 0, 0, t), b: t => moving(3, 0, 0, t) },
  { id: 'stationary-approach', shouldWarn: true, expected: 'HIGH, below CRITICAL', a: () => ({ x: 0, y: 0, heading: null, speed: 0 }), b: t => moving(20, 0, 270, t) },
  { id: 'walking-apart', shouldWarn: false, expected: 'NONE', a: t => moving(-1, 0, 270, t), b: t => moving(1, 0, 90, t) },
  { id: 'wide-pass-25m', shouldWarn: false, expected: 'NONE', a: t => moving(-20, 0, 90, t), b: t => moving(20, 25, 270, t) },
  { id: 'poor-gps', diagnostic: true, shouldWarn: true, expected: 'skip pair', accuracy: 40, a: t => moving(-20, 0, 90, t), b: t => moving(20, 0, 270, t) },
  { id: 'late-join', diagnostic: true, shouldWarn: true, expected: 'HIGH+ after join', joinB: 8, a: t => moving(-20, 0, 90, t), b: t => moving(20, 0, 270, t) },
  { id: 'stale-gap', diagnostic: true, shouldWarn: true, expected: 'ignore stale pair; reset debounce', stale: t => t >= 8 && t <= 13, a: t => moving(-20, 0, 90, t), b: t => moving(20, 0, 270, t) },
];
export const origin = { lat: 0, lon: 0 }; // Deliberately fictional test origin.
const metersPerDegree = 6371000 * Math.PI / 180;
export function device(id, state, { noise = 0, random = () => 0.5, accuracy = 4, stale = false } = {}) {
  // Bounded, independent uniform position error per axis; not a realistic GPS error model.
  return { id, role: 'pedestrian', lat: (state.y + noise * (2 * random() - 1)) / metersPerDegree,
    lon: (state.x + noise * (2 * random() - 1)) / metersPerDegree,
    speed: state.speed, heading: state.heading, accuracy, stale, ageMs: stale ? 6000 : 0 };
}
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
export function recording(scenario, { noise = 0, seed = 1 } = {}) {
  const random = seededRandom(seed);
  return Array.from({ length: 26 }, (_, t) => {
    const options = { noise, random, accuracy: scenario.accuracy ?? Math.max(4, noise), stale: !!scenario.stale?.(t) };
    const devices = [device('a', scenario.a(t), options)];
    if (t >= (scenario.joinB ?? 0)) devices.push(device('b', scenario.b(t), options));
    return { type: 'dashboard', schema: 1, profile: 'walktest', t: 1700000000000 + t * 1000, devices };
  });
}
export function groundTruth(scenario) {
  // 10 ms sampling of known trajectories, independent of GPS/model output.
  let minDistanceM = Infinity, closestS = 0;
  for (let i = 0; i <= 2500; i++) {
    const t = i / 100, a = scenario.a(t), b = scenario.b(t);
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (distance < minDistanceM) { minDistanceM = distance; closestS = t; }
  }
  return { shouldWarn: scenario.shouldWarn, minDistanceM, closestS };
}
