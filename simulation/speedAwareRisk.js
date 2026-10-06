// Speed gate: two slow movers (walkers) are not a collision threat.
// Both numbers are placeholders to tune with pilot data.
export const MIN_THREAT_SPEED_MPS = 3.0;   // ~6.7 mph
export const MIN_CLOSING_SPEED_MPS = 1.0;

// GPS speed can be null, undefined, NaN, or -1 (unknown). Treat those as 0.
export function cleanSpeed(speed) {
  return Number.isFinite(speed) && speed > 0 ? speed : 0;
}

export function isSpeedRelevant(a, b, closingSpeedMps) {
  const fastest = Math.max(cleanSpeed(a.speed), cleanSpeed(b.speed));
  if (fastest < MIN_THREAT_SPEED_MPS) return false;
  if (closingSpeedMps !== undefined && closingSpeedMps < MIN_CLOSING_SPEED_MPS) return false;
  return true;
}