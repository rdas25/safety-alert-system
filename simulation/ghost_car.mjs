#!/usr/bin/env node
// ghost_car.mjs — compute a "ghost car" start position + heading that puts a
// simulated agent on a head-on collision course with your (stationary) phone,
// then print the exact simulated_agent.mjs command to run.
//
// Usage:
//   node ghost_car.mjs <phoneLat> <phoneLon> [distanceM=90] [approachBearingDeg=random] [ghostSpeedMps=6]
//
// Example:
//   node ghost_car.mjs 40.4237 -86.9212
//   node ghost_car.mjs 40.4237 -86.9212 100 270 8     // ghost starts due WEST of you, drives east
//
// Conventions: bearings are compass degrees (0 = north, 90 = east, clockwise).
// "approachBearing" = the direction FROM your phone TO where the ghost starts.

const METERS_PER_DEG_LAT = 111_320; // close enough at these distances

const [latArg, lonArg, distArg, bearArg, speedArg] = process.argv.slice(2);

if (latArg === undefined || lonArg === undefined) {
  console.error(
    "Usage: node ghost_car.mjs <phoneLat> <phoneLon> [distanceM=90] [approachBearingDeg=random] [ghostSpeedMps=6]"
  );
  process.exit(1);
}

const phoneLat = parseFloat(latArg);
const phoneLon = parseFloat(lonArg);
const distanceM = distArg !== undefined ? parseFloat(distArg) : 90;
const approachBearing =
  bearArg !== undefined ? parseFloat(bearArg) : Math.floor(Math.random() * 360);
const ghostSpeed = speedArg !== undefined ? parseFloat(speedArg) : 6;

if ([phoneLat, phoneLon, distanceM, approachBearing, ghostSpeed].some(Number.isNaN)) {
  console.error("All arguments must be numbers.");
  process.exit(1);
}

const toRad = (deg) => (deg * Math.PI) / 180;

// Local flat-meter offsets of the ghost's start point relative to the phone.
const north = distanceM * Math.cos(toRad(approachBearing));
const east = distanceM * Math.sin(toRad(approachBearing));

// Convert meters back to degrees. A degree of longitude shrinks with latitude.
const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(toRad(phoneLat));
const ghostLat = phoneLat + north / METERS_PER_DEG_LAT;
const ghostLon = phoneLon + east / metersPerDegLon;

// The ghost drives straight back at the phone: exactly opposite the approach bearing.
const ghostHeading = (approachBearing + 180) % 360;

const timeToArrival = distanceM / ghostSpeed;

console.log(`Phone:  ${phoneLat}, ${phoneLon}`);
console.log(
  `Ghost starts ${distanceM} m away at bearing ${approachBearing.toFixed(0)}°, ` +
    `heading ${ghostHeading.toFixed(0)}° at ${ghostSpeed} m/s ` +
    `(reaches you in ~${timeToArrival.toFixed(1)} s)\n`
);
console.log("Run this (server must be up and the app open on your phone):\n");
console.log(
  `node simulated_agent.mjs ghost-car ${ghostLat.toFixed(6)} ${ghostLon.toFixed(6)} ${ghostHeading.toFixed(1)} ${ghostSpeed}`
);
