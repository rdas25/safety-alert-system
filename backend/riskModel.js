'use strict';
// Collision-risk model: risk = P (miss distance) x U (urgency) x S (severity).
// Deterministic and explainable. See README.md for the formulas.

const EARTH_RADIUS_M = 6371000;
const LEVELS = ['NONE', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
const RANK = { NONE: 0, LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };
const ROLES = ['pedestrian', 'cyclist', 'driver'];

const COMMON = {
  T_HOR_S: 10,            // urgency starts rising when time-to-closest-approach drops below this
  T_CRIT_S: 2,            // urgency is 1.0 at or below this
  T_MAX_S: 15,            // never look further ahead than this
  MIN_MOVING_MPS: 0.5,    // below this speed a device is treated as stationary
  CONTACT_RADIUS_M: { pedestrian: 0.5, cyclist: 0.8, driver: 1.5 },
  SIGMA_DEFAULT_M: 4,     // GPS error assumed when a phone reports no accuracy
  SIGMA_MIN_M: 2,
  SIGMA_MAX_M: 20,
  MAX_USABLE_ACCURACY_M: 30, // worse than this: pair is not evaluated
  CUTOFFS: { LOW: 0.10, MODERATE: 0.25, HIGH: 0.50, CRITICAL: 0.75 },
  SKIP_PAIRS: ['driver|driver'], // opposing lanes look like head-on without road geometry
};

const ALL_ONE = {
  'pedestrian|pedestrian': 1, 'cyclist|pedestrian': 1, 'cyclist|cyclist': 1,
  'driver|pedestrian': 1, 'cyclist|driver': 1, 'driver|driver': 1,
};

const PROFILES = {
  // Physically motivated severity: two walkers colliding is low severity, so risk tops out at LOW.
  real: Object.assign({}, COMMON, {
    name: 'real',
    V0_MPS: 5,
    W: {
      'pedestrian|pedestrian': 0.4, 'cyclist|pedestrian': 0.7, 'cyclist|cyclist': 0.6,
      'driver|pedestrian': 1.0, 'cyclist|driver': 1.0, 'driver|driver': 0.9,
    },
  }),
  // For tests where people on foot stand in for cyclists/cars: severity saturates at walking speed.
  walktest: Object.assign({}, COMMON, { name: 'walktest', V0_MPS: 1.5, W: ALL_ONE }),
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const pairKey = (r1, r2) => [r1, r2].sort().join('|');

function localXY(lat, lon, refLat, refLon) {
  const toRad = Math.PI / 180;
  return {
    x: (lon - refLon) * toRad * EARTH_RADIUS_M * Math.cos(refLat * toRad),
    y: (lat - refLat) * toRad * EARTH_RADIUS_M,
  };
}

// Velocity in m/s (east, north). Unknown heading or very low speed => stationary.
function velocity(s, profile) {
  const speed = isNum(s.speed) ? s.speed : 0;
  if (speed < profile.MIN_MOVING_MPS || !isNum(s.heading)) return { vx: 0, vy: 0, moving: false };
  const h = (s.heading * Math.PI) / 180;
  return { vx: speed * Math.sin(h), vy: speed * Math.cos(h), moving: true };
}

// Dead-reckon a state forward by dtS seconds (used to align devices to the same instant).
function advance(s, dtS, profile) {
  const p = profile || PROFILES.walktest;
  if (!(dtS > 0)) return s;
  const v = velocity(s, p);
  if (!v.moving) return s;
  const dLat = ((v.vy * dtS) / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLon = ((v.vx * dtS) / (EARTH_RADIUS_M * Math.cos((s.lat * Math.PI) / 180))) * (180 / Math.PI);
  return Object.assign({}, s, { lat: s.lat + dLat, lon: s.lon + dLon });
}

// a, b: { lat, lon, heading (deg|null), speed (m/s|null), accuracy (m|null), role }
function assess(a, b, profile) {
  const p = profile || PROFILES.walktest;
  const rel = localXY(b.lat, b.lon, a.lat, a.lon);
  const rx = rel.x;
  const ry = rel.y;
  const distM = Math.hypot(rx, ry);
  const result = {
    risk: 0, level: 'NONE', reason: 'ok',
    distM, bearingAtoB: (Math.atan2(rx, ry) * 180 / Math.PI + 360) % 360,
    tcpaS: null, missM: distM, closingMps: 0, relSpeedMps: 0, P: 0, U: 0, S: 0,
  };

  if ((a.accuracy || 0) > p.MAX_USABLE_ACCURACY_M || (b.accuracy || 0) > p.MAX_USABLE_ACCURACY_M) {
    result.reason = 'poor_gps';
    return result;
  }
  if (p.SKIP_PAIRS.indexOf(pairKey(a.role, b.role)) !== -1) {
    result.reason = 'pair_excluded';
    return result;
  }

  const va = velocity(a, p);
  const vb = velocity(b, p);
  const vx = vb.vx - va.vx;
  const vy = vb.vy - va.vy;
  const v2 = vx * vx + vy * vy;
  const dot = rx * vx + ry * vy;
  result.relSpeedMps = Math.sqrt(v2);
  result.closingMps = distM > 1e-6 ? -dot / distM : 0;

  if (v2 < 1e-6) { result.reason = 'no_relative_motion'; return result; }
  const tStar = -dot / v2;
  result.tcpaS = tStar;
  if (dot >= 0) { result.reason = 'diverging'; return result; }

  const tc = Math.min(tStar, p.T_MAX_S);
  const missM = Math.hypot(rx + vx * tc, ry + vy * tc);
  const contact = (p.CONTACT_RADIUS_M[a.role] || 0.5) + (p.CONTACT_RADIUS_M[b.role] || 0.5);
  const sig = (s) => clamp(isNum(s.accuracy) ? s.accuracy : p.SIGMA_DEFAULT_M, p.SIGMA_MIN_M, p.SIGMA_MAX_M);
  const D0 = contact + Math.hypot(sig(a), sig(b));

  const P = Math.exp(-Math.pow(missM / D0, 2));
  const U = clamp((p.T_HOR_S - tc) / (p.T_HOR_S - p.T_CRIT_S), 0, 1);
  const w = p.W[pairKey(a.role, b.role)];
  const S = (w === undefined ? 1 : w) * (1 - Math.exp(-Math.pow(result.relSpeedMps / p.V0_MPS, 2)));
  const risk = P * U * S;

  let level = 'NONE';
  for (const name of ['LOW', 'MODERATE', 'HIGH', 'CRITICAL']) {
    if (risk >= p.CUTOFFS[name]) level = name;
  }
  return Object.assign(result, { risk, level, missM, P, U, S, reason: 'approaching' });
}

module.exports = { LEVELS, RANK, ROLES, PROFILES, assess, advance, localXY, velocity };
