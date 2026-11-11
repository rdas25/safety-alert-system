# Safety Alert System — engineering candidate

Collision-warning prototype with foreground tracking and opt-in background tasks: Expo/React Native phones send GPS data over WebSockets to a Node server. Constant-velocity closest-approach geometry and role/speed weights produce five warning levels. This is a controlled-test prototype; real-world accuracy and physical-phone behavior remain unverified.

See [the current engineering handoff](docs/ENGINEERING_HANDOFF.md) for background setup, STATE_DIR, admin commands, optional motion/road context, test evidence and remaining prerequisites.

See [operations and release gates](docs/OPERATIONS.md) for recovery, monitoring, privacy, support, and remaining approvals. The November 10 release is deployed; older handoffs describe earlier snapshots.

## Current behavior

* Required device authentication; optional individual tokens scoped to test sessions. Per-device credentials preserve identity across reconnects. Admin access is separate.
* Every fix expires after five seconds, regardless of reported movement. Missing accuracy, poor GPS and unknown motion are explicit unavailable states; peer exclusions and unavailable peers appear in the app.
* HIGH/CRITICAL escalate on the next evaluation tick; lower changes and clearing require confirmation. This reduced synthetic misses but increased synthetic false alerts.
* Server limits: 100 devices, 128 connections, 1,000 device identities per server lifetime, ten messages/second per socket, 4 KB incoming messages, 1 MB queued outgoing data. Restart clears device identities only without persistent STATE_DIR storage.
* Spatial cells restrict candidates to nearby devices; dense pair processing remains quadratic; unrelated sessions never share pairs or phone locations. Global admin observers can see all sessions.
* Replay separates encounters on missing data, long gaps, profile changes or renewed approaches after divergence. Warnings with less than one second before the sampled closest point are LATE_ALERT. Labels remain GPS proxies.
* Logging defaults off. When enabled: private files, 24-hour inactive-file retention, 100 MB inactive-file budget, 10 MB recording rotation. Excessive write backlog or disk failure disables recording and is exposed in /metrics without stopping warnings. Export test recordings promptly.

## Local setup

Install dependencies independently with `npm ci` in backend, simulation and mobile. Node 22/24 are CI targets; local verification used Node 26.10.0.

Generate private tokens, for example `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Configure CLIENT_TOKEN, ADMIN_TOKEN and RISK_PROFILE=walktest in your environment before `npm start` in backend. Production requires ADMIN_TOKEN; every environment requires explicit walktest or real profile. Use only fictional coordinates for software checks.

For individually revocable access, use CLIENT_TOKENS instead of CLIENT_TOKEN, a JSON array of objects with token, session and subject strings. Give each participant a random token and unique subject; matching sessions can see one another. Use the admin CLI/API to revoke a subject immediately; see the engineering handoff. Tokens are configuration, never committed files. The shared-token option is only for a single controlled group.

Start mobile with `npx expo run:ios` after native preparation; enter the backend address and participant token. For a physical iPhone use a signed Release build. Hosted addresses must use WSS. The app authenticates before waiting for GPS permission. A rejected token stops automatic reconnect; Stop and re-enter credentials.

Simulation clients require CLIENT_TOKEN in the environment. The live test suite supplies isolated credentials automatically.

## Verification

From repository root:

```
node --test backend/test/*.test.js mobile/*.test.js simulation/test/*.test.mjs
node simulation/live_suite.mjs simulation/results/live-transport.json
node simulation/benchmark.mjs simulation/results
```

The release handoff documents the actual final test and build results. The synthetic benchmark has 90 conditions and 450 threshold evaluations. At default HIGH=0.50 it observes 27 hazard scenarios with an alert, zero without, six false alerts and 30 quiet cases. These counts do not require timely detection; inspect warningS and replay encounter labels separately. Zero-noise seeds repeat inputs.

The generated GIF is synthetic, not phone footage. Older verification/deployment documents and screenshots are historical; see docs/ENGINEERING_HANDOFF.md for current instructions and outstanding work.

## Deployment

The Render recipe uses backend as its root, requires both tokens and explicit profile, and checks /ready. /health reports liveness; /ready fails if ticks have not completed within three seconds. An existing service must be updated explicitly; a blueprint file does not alter it automatically. Choose compute that stays available during testing, use one backend instance, and keep LOG_POSITIONS=0 except during consented recording windows. No deployment was performed in this local finalization.

## Limits

Opt-in background tracking requires hardware verification. Road matching and turning/acceleration hypotheses are advisory; no lane-aware safety decision or guaranteed delivery is implemented. Driver/driver pairs are excluded. The real profile is still a hand-chosen heuristic, not an injury model. Admin-managed enrollment, durable identities and immediate revocation support controlled sessions. Public self-service accounts and multi-server operation are not implemented. No road-safety effectiveness is established.

MIT license. Read the release handoff before distributing builds.
