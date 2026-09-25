/**
 * simulated_agent.mjs
 * ---------------------
 * Stands in for a real phone: connects to the real backend over a real
 * WebSocket, continuously updates its own position (dead-reckoning —
 * moving in a straight line based on heading/speed, same assumption the
 * algorithm itself makes), sends updates just like App.js does, and runs
 * the real assessRisk() function against everything it hears about.
 *
 * This validates the FULL pipeline (network -> algorithm -> alert
 * decision) using real network calls, without needing a phone, GPS, or
 * a second person. What it does NOT validate: real GPS noise, real
 * human movement, or the actual UI -- that's what step 5 (real phones)
 * is still for.
 *
 * Usage:
 *   node simulated_agent.mjs <deviceId> <startLat> <startLon> <headingDeg> <speedMps>
 *
 * Example (two agents walking toward each other):
 *   node simulated_agent.mjs ped-1 40.4237 -86.9212 90 1.4
 *   node simulated_agent.mjs car-1 40.4237 -86.9200 270 8.0
 */

import WebSocket from 'ws';
import { assessRisk, RiskLevel } from './collisionRisk.js';

const [, , deviceId, startLatStr, startLonStr, headingStr, speedStr] = process.argv;

if (!deviceId || !startLatStr || !startLonStr || !headingStr || !speedStr) {
  console.error('Usage: node simulated_agent.mjs <deviceId> <startLat> <startLon> <headingDeg> <speedMps>');
  process.exit(1);
}

const EARTH_RADIUS_M = 6371000.0;
const UPDATE_INTERVAL_MS = 1000; // matches the phone's ~1s GPS update rate

let lat = parseFloat(startLatStr);
let lon = parseFloat(startLonStr);
const headingDeg = parseFloat(headingStr);
const speedMps = parseFloat(speedStr);

const otherDevices = {}; // deviceId -> state
let lastLoggedRisk = {}; // deviceId -> last risk level logged, to avoid log spam

/**
 * Move (lat, lon) forward by `speedMps * dtSeconds` meters in the
 * direction of `headingDeg`. Same flat-earth approximation used
 * throughout -- fine for short simulated walks.
 */
function step(lat, lon, headingDeg, speedMps, dtSeconds) {
  const headingRad = (headingDeg * Math.PI) / 180;
  const distM = speedMps * dtSeconds;
  const dNorth = distM * Math.cos(headingRad);
  const dEast = distM * Math.sin(headingRad);

  const newLat = lat + (dNorth / EARTH_RADIUS_M) * (180 / Math.PI);
  const newLon = lon + (dEast / (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: newLat, lon: newLon };
}

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log(`[${deviceId}] connected`);
});

ws.on('message', (raw) => {
  const data = JSON.parse(raw.toString());

  if (data.type === 'snapshot') {
    Object.assign(otherDevices, data.devices);
  } else if (data.type === 'position_update' && data.deviceId !== deviceId) {
    otherDevices[data.deviceId] = {
      lat: data.lat,
      lon: data.lon,
      heading: data.heading,
      speed: data.speed,
      timestamp: data.timestamp,
    };
  }
});

ws.on('error', (err) => {
  console.error(`[${deviceId}] error:`, err.message);
});

setInterval(() => {
  // Move myself forward
  const dtSeconds = UPDATE_INTERVAL_MS / 1000;
  const next = step(lat, lon, headingDeg, speedMps, dtSeconds);
  lat = next.lat;
  lon = next.lon;

  // Send my new position, same message shape as App.js
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ deviceId, lat, lon, heading: headingDeg, speed: speedMps }));
  }

  // Run the real risk check against everyone I know about
  for (const [otherId, other] of Object.entries(otherDevices)) {
    const result = assessRisk(
      { lat, lon, headingDeg, speedMps },
      { lat: other.lat, lon: other.lon, headingDeg: other.heading, speedMps: other.speed }
    );

    // Only log when the risk level actually changes, so the terminal
    // doesn't get spammed every single second.
    if (result.riskLevel !== lastLoggedRisk[otherId]) {
      lastLoggedRisk[otherId] = result.riskLevel;
      if (result.riskLevel === RiskLevel.HIGH) {
        console.log(`[${deviceId}] \u26A0\uFE0F  HIGH RISK with ${otherId} -- CPA in ${result.tCpaS.toFixed(1)}s, distance ${result.distAtCpaM.toFixed(1)}m`);
      } else if (result.riskLevel === RiskLevel.MODERATE) {
        console.log(`[${deviceId}] Caution: ${otherId} nearby -- CPA in ${result.tCpaS.toFixed(1)}s, distance ${result.distAtCpaM.toFixed(1)}m`);
      } else {
        console.log(`[${deviceId}] Risk with ${otherId} cleared`);
      }
    }
  }
}, UPDATE_INTERVAL_MS);
