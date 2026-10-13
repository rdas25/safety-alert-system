#!/usr/bin/env node
// A fake phone. Moves in a straight line and sends 'position' messages to the real backend once per second.
// Usage (from simulation/):
//   node simulated_agent.mjs <deviceId> <role> <startLat> <startLon> <headingDeg> <speedMps>
//   role = pedestrian | cyclist | driver
// Optional environment variables:
//   SERVER_URL=ws://192.168.1.50:8080   (default ws://localhost:8080)
//   NOISE_M=3                           (random GPS jitter in meters, default 0)

import WebSocket from "ws";

const [deviceId, role, latArg, lonArg, headingArg, speedArg] = process.argv.slice(2);
const ROLES = ["pedestrian", "cyclist", "driver"];

if (!deviceId || !ROLES.includes(role) || [latArg, lonArg, headingArg, speedArg].some((v) => v === undefined || Number.isNaN(Number(v)))) {
  console.error("Usage: node simulated_agent.mjs <deviceId> <pedestrian|cyclist|driver> <startLat> <startLon> <headingDeg> <speedMps>");
  process.exit(1);
}

const SERVER_URL = process.env.SERVER_URL || "ws://localhost:8080";
const NOISE_M = Number(process.env.NOISE_M || 0);
const METERS_PER_DEG_LAT = 111_320;
const toRad = (d) => (d * Math.PI) / 180;

let lat = Number(latArg);
let lon = Number(lonArg);
const heading = ((Number(headingArg) % 360) + 360) % 360;
const speed = Number(speedArg);

// Standard normal random number (Box-Muller)
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

let lastLevel = "NONE";
const ws = new WebSocket(SERVER_URL);

ws.on("open", () => {
  console.log(`[${deviceId}] connected to ${SERVER_URL} as ${role}, heading ${heading}°, ${speed} m/s`);
  setInterval(() => {
    // dead-reckon one second forward
    lat += (speed * Math.cos(toRad(heading))) / METERS_PER_DEG_LAT;
    lon += (speed * Math.sin(toRad(heading))) / (METERS_PER_DEG_LAT * Math.cos(toRad(lat)));
    const jitterN = NOISE_M * gauss();
    const jitterE = NOISE_M * gauss();
    ws.send(JSON.stringify({
      type: "position",
      deviceId,
      role,
      lat: lat + jitterN / METERS_PER_DEG_LAT,
      lon: lon + jitterE / (METERS_PER_DEG_LAT * Math.cos(toRad(lat))),
      speed,
      heading: speed > 0 ? heading : null,
      accuracy: Math.max(3, NOISE_M * 1.5),
      fixAgeMs: 0,
    }));
  }, 1000);
});

ws.on("message", (data) => {
  const m = JSON.parse(data.toString());
  if (m.type === "error") console.log(`[${deviceId}] SERVER ERROR: ${m.message}`);
  if (m.type !== "status") return;
  if (m.level !== lastLevel) {
    const t = m.threat;
    const detail = t
      ? ` vs ${t.peerId} (${t.peerRole}): ${t.distanceM} m away, closest approach in ${t.tcpaS} s at ${t.missM} m, risk ${t.risk}`
      : "";
    console.log(`[${deviceId}] ALERT LEVEL ${lastLevel} -> ${m.level}${detail}`);
    lastLevel = m.level;
  }
});

ws.on("close", () => { console.log(`[${deviceId}] connection closed`); process.exit(0); });
ws.on("error", (e) => { console.error(`[${deviceId}] error: ${e.message}`); process.exit(1); });
