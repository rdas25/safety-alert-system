#!/usr/bin/env node
// Usage (from simulation/):
//   node ghost_car.mjs <phoneLat> <phoneLon> [speedMps=6] [distanceM=90] [approachBearingDeg=random] [missM=0]
// Add --print to only print the command instead of running it.

import { spawn } from "node:child_process";

const METERS_PER_DEG_LAT = 111_320;
const args = process.argv.slice(2).filter((a) => a !== "--print");
const printOnly = process.argv.includes("--print");
const [latArg, lonArg, speedArg, distArg, bearArg, missArg] = args;

if (latArg === undefined || lonArg === undefined) {
  console.error("Usage: node ghost_car.mjs <phoneLat> <phoneLon> [speedMps=6] [distanceM=90] [approachBearingDeg=random] [missM=0] [--print]");
  process.exit(1);
}

const phoneLat = parseFloat(latArg);
const phoneLon = parseFloat(lonArg);
const ghostSpeed = speedArg !== undefined ? parseFloat(speedArg) : 6;
const distanceM = distArg !== undefined ? parseFloat(distArg) : 90;
const approachBearing = bearArg !== undefined ? parseFloat(bearArg) : Math.floor(Math.random() * 360);
const missM = missArg !== undefined ? parseFloat(missArg) : 0;

if ([phoneLat, phoneLon, ghostSpeed, distanceM, approachBearing, missM].some(Number.isNaN)) {
  console.error("All arguments must be numbers.");
  process.exit(1);
}

const toRad = (d) => (d * Math.PI) / 180;

// Start distanceM away along the approach bearing, then shift missM sideways
// (bearing + 90) so the straight-line path passes you at ~missM.
let north = distanceM * Math.cos(toRad(approachBearing));
let east = distanceM * Math.sin(toRad(approachBearing));
north += missM * Math.cos(toRad(approachBearing + 90));
east += missM * Math.sin(toRad(approachBearing + 90));

const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(toRad(phoneLat));
const ghostLat = (phoneLat + north / METERS_PER_DEG_LAT).toFixed(6);
const ghostLon = (phoneLon + east / metersPerDegLon).toFixed(6);
const ghostHeading = ((approachBearing + 180) % 360).toFixed(1);

console.log(`Phone: ${phoneLat}, ${phoneLon}`);
console.log(
  `Ghost starts ${distanceM} m away at bearing ${approachBearing.toFixed(0)}°, heading ${ghostHeading}° at ${ghostSpeed} m/s, ` +
    `passing you at ~${Math.abs(missM)} m (reaches you in ~${(distanceM / ghostSpeed).toFixed(1)} s)\n`
);

const cmdArgs = ["simulated_agent.mjs", "ghost-car", ghostLat, ghostLon, ghostHeading, String(ghostSpeed)];

if (printOnly) {
  console.log(`node ${cmdArgs.join(" ")}`);
} else {
  console.log("Launching ghost... (Ctrl+C to stop)\n");
  const child = spawn("node", cmdArgs, { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
}