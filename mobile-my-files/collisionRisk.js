/**
 * collisionRisk.js
 * ------------------
 * JavaScript port of the collision_risk.py algorithm, so the same
 * closest-point-of-approach (CPA) math can run directly on the phone.
 *
 * Kept deliberately parallel in structure to the Python version so it's
 * easy to compare the two and confirm they agree (same math, same
 * thresholds, same logic — just a different language).
 */

const EARTH_RADIUS_M = 6371000.0;

// Same thresholds as the Python version. Keep these two files in sync
// if you tune them later — that's a known duplication to clean up
// once things stabilize (e.g. by sharing a config file or moving the
// thresholds server-side).
export const HIGH_RISK_DISTANCE_M = 3.0;
export const MODERATE_RISK_DISTANCE_M = 8.0;
export const MAX_LOOKAHEAD_S = 15.0;

export const RiskLevel = {
  NONE: 'none',
  MODERATE: 'moderate',
  HIGH: 'high',
};

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function latLonToLocalXY(lat, lon, refLat, refLon) {
  const refLatRad = toRadians(refLat);
  const dx = toRadians(lon - refLon) * EARTH_RADIUS_M * Math.cos(refLatRad);
  const dy = toRadians(lat - refLat) * EARTH_RADIUS_M;
  return { x: dx, y: dy };
}

function headingSpeedToVelocity(headingDeg, speedMps) {
  const headingRad = toRadians(headingDeg);
  const vx = speedMps * Math.sin(headingRad); // East component
  const vy = speedMps * Math.cos(headingRad); // North component
  return { vx, vy };
}

/**
 * agentA / agentB: { lat, lon, headingDeg, speedMps }
 * Returns { tCpaS, distAtCpaM }
 */
export function computeCpa(agentA, agentB) {
  const b = latLonToLocalXY(agentB.lat, agentB.lon, agentA.lat, agentA.lon);
  const av = headingSpeedToVelocity(agentA.headingDeg, agentA.speedMps);
  const bv = headingSpeedToVelocity(agentB.headingDeg, agentB.speedMps);

  const rx = b.x;
  const ry = b.y;
  const rvx = bv.vx - av.vx;
  const rvy = bv.vy - av.vy;

  const relSpeedSq = rvx * rvx + rvy * rvy;

  if (relSpeedSq < 1e-6) {
    const currentDist = Math.hypot(rx, ry);
    return { tCpaS: 0.0, distAtCpaM: currentDist };
  }

  const tCpa = -(rx * rvx + ry * rvy) / relSpeedSq;
  const cpaX = rx + rvx * tCpa;
  const cpaY = ry + rvy * tCpa;
  const distAtCpa = Math.hypot(cpaX, cpaY);

  return { tCpaS: tCpa, distAtCpaM: distAtCpa };
}

/**
 * Returns { riskLevel, tCpaS, distAtCpaM }
 */
export function assessRisk(agentA, agentB) {
  const { tCpaS, distAtCpaM } = computeCpa(agentA, agentB);

  if (tCpaS < 0 || tCpaS > MAX_LOOKAHEAD_S) {
    return { riskLevel: RiskLevel.NONE, tCpaS, distAtCpaM };
  }

  let riskLevel;
  if (distAtCpaM <= HIGH_RISK_DISTANCE_M) {
    riskLevel = RiskLevel.HIGH;
  } else if (distAtCpaM <= MODERATE_RISK_DISTANCE_M) {
    riskLevel = RiskLevel.MODERATE;
  } else {
    riskLevel = RiskLevel.NONE;
  }

  return { riskLevel, tCpaS, distAtCpaM };
}
