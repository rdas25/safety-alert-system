> Superseded by ENGINEERING_HANDOFF.md for current behavior and evidence.

# Safety Alert System — local finalization handoff

Date: November 10, 2026. This release candidate is for controlled foreground testing. Source changes, tests, local native compilation and synthetic demonstrations are complete to the extent described below. Nothing was pushed or deployed, and no real participant location was used.

## Implemented

- Required access credentials. CLIENT_TOKENS supports separate participant tokens, subjects and session scopes. Phones only receive participants from their own session. Revocation is configuration removal plus process restart. Shared CLIENT_TOKEN remains a single-group convenience.
- Per-device reconnect credentials block identity replacement by a different participant or secret. Identity allocation and live devices are bounded.
- Authentication occurs immediately on connection, independently of permission prompts or GPS arrival. Invalid credentials stop mobile automatic reconnect.
- All fixes expire after five seconds; the server distinguishes stale, unknown accuracy, poor GPS, unknown motion and available assessment. The phone shows incomplete peer coverage and excluded pairs.
- GPS failures produce an actionable retry control. Older native GPS samples are ignored. Client sequence numbers reject duplicate/out-of-order updates when supplied; current mobile supplies them. Legacy simulator inputs without sequences remain supported.
- Immediate urgent escalation; confirmed clearing. Tests cover a short urgent hazard and abrupt motion reversal. Sampling, network and sensor delays remain.
- Pair/status processing is quadratic instead of cubic. Caps: 100 active devices, 128 sockets, 1,000 identities per server lifetime, 10 messages/second/socket, 4 KB inbound payloads and 1 MB outbound queue. Slow sockets are disconnected.
- Explicit valid risk profile required. /health is liveness; /ready reports readiness based on ticks and their duration. Shutdown closes sockets and flushes recordings, with a bounded exit timeout.
- Private opt-in recordings include model hash, profile, input coordinates, receipt time, fix age and sequence. Inactive logs older than 24 hours are pruned; oldest inactive files are removed above a 100 MB total budget. The current recording is protected from deletion. A 10 MB recording session or 1 MB write backlog stops the process cleanly; this is explicit protection against silent evidence loss, and operators must restart for further recording. Logging is off by default.
- Replay validates nested records, separates sessions/encounters and reports LATE_ALERT when a warning precedes the sampled closest point by less than one second. Missing/unusable sample counts are exposed. These remain sampled-GPS proxy labels, not independent field truth.
- Compatible mobile security updates applied; Expo compatibility rechecked. Current README replaces mixed historical instructions. Benchmark data and the 52-second labeled synthetic animation were regenerated.

## Local verification

| Check | Result |
|---|---|
| Regression suite | 35 tests passed, zero failed; includes live backend tests |
| Local transport | Six scenarios passed using isolated real backend processes, each approximately 22 seconds |
| Dense capacity check | 100 devices, 97 added clients all received statuses; final measured tick 12.6 ms; capacity overflow rejected |
| Session/security | Wrong tokens rejected; cross-session peers absent; same ID allowed independently across sessions; credential takeover rejected; legitimate reconnect succeeds; sequence replay rejected; flood socket closed |
| Replay/limits | Late labels and encounter separation checked; invalid nested inputs rejected; bounded send and retention behavior tested |
| Benchmark | 90 synthetic conditions, 450 threshold evaluations regenerated |
| iOS | Expo compatibility check passed, JS/Hermes export succeeded, native dependencies installed, unsigned iOS Simulator Release build succeeded under Xcode 27.2 |
| Android | JavaScript export checked separately; native Android build not verified because Android SDK is absent from the standard local SDK path |
| Mobile audit | Compatible fixes reduced 11 advisory entries (including three high) to five moderate tooling entries; no high/critical entries remain in the saved final audit |
| Backend audit | See backend-audit-final.json for the current result |

The load result is a local dense stationary-device test, not a hosted capacity guarantee or sustained stress test. The six live transport scenarios send synthetic input at 4 Hz. The mobile sender uses 1 Hz.

At default HIGH=0.50, constructed core scenarios show 27 hazards with an alert, zero without, six false alerts and 30 quiet outcomes. Before immediate urgent escalation the counts were 19, eight, two and 34. Scenario counts mean any HIGH was observed, not necessarily a useful lead time. The revised replay labels and warningS should be inspected separately. No field calibration claim is made.

Native compilation succeeded, but simulator launch was unavailable: CoreSimulator reported an installed version older than the Xcode build's required version (1171.7.0 versus 1174.21.0). Reconcile Xcode/CoreSimulator installation and restart its service or the Mac before UI testing. The local work did not terminate other simulator sessions or change the machine's Xcode installation.

## Exact physical-phone work remaining

1. **Prepare two iPhones.** Record device model and iOS version. From the supplied source run `npm ci` in mobile, then `npx expo prebuild --platform ios` and `npx expo run:ios --device --configuration Release`. Select the development team/signing identity in Xcode as needed, trust the build on the devices, and install the same release on both. The included simulator compile does not provide a signed physical-device app.
2. **Verify setup and credentials.** Use distinct participant tokens in the same configured session. Check successful entry, wrong-token denial, Stop/re-entry, reconnect with identity preserved, and separation from a third token in another session. Remove one token and restart the backend; that participant must be denied afterward. Do not show credentials in recordings.
3. **Verify permission and location states.** Test permission grant and denial, Precise Location on/off, location services disabled and retry, delayed permission response, indoor/poor accuracy, unknown heading, GPS freeze, fresh-fix recovery and stationary-to-moving transitions. Confirm unavailable coverage is visible and warnings stop when coverage expires.
4. **Verify native UI behavior.** Check map/markers, banner text and direction, HIGH/CRITICAL haptic patterns, clearing, disconnected status, screen wake, Stop cleanup, and app foreground/background transitions. Background warnings are not supported; confirm that testers understand this limitation.
5. **Verify network behavior.** Run on shared Wi-Fi, then with one phone on cellular against the hosted WSS endpoint. Toggle airplane mode and change networks. Record time until warnings become unavailable, reconnect recovery and any displayed stale peers.
6. **Collect controlled walking evidence.** In an open area away from traffic, repeat seven paths three times: head-on, simultaneous crossing, delayed crossing, side-by-side, stationary approach, walking apart, and a wide pass. Add abrupt turns, brief data gaps and late joining. Use timestamped independent observations of closest approach and whether a warning was warranted. Never stage vehicle collisions.
7. **Measure and decide.** Save private logs and synchronized notes. Report true timely warnings, late warnings, misses, nuisance alerts, unavailable coverage and warning lead-time distributions. Split tuning and validation observations. Set acceptable timing/miss/nuisance targets explicitly before approving a pilot; a one-second replay cutoff is a reporting definition, not proof of adequate reaction time. Retain HIGH=0.50 until observations justify changing it.
8. **If Android is in scope:** install/configure Android SDK, set the application ID and production map configuration, generate/build the Android native app, and repeat the device checks. JavaScript export does not validate Android permissions, maps or haptics.

## Exact deployment work remaining

1. **Review and publish the release candidate.** Commit source and lockfiles to the intended repository/branch, review the diff, and run hosted CI on Node 22/24. Local checks used Node 26.10.0. No repository push, merge or hosted CI execution was performed here.
2. **Resolve or explicitly accept the remaining moderate tooling advisories.** The final audit points to glob/minimatch through Expo CLI/fingerprint. The suggested forced fix would downgrade Expo to 53, so it was not applied. Recheck upstream compatible remediation before distributing builds. These are five dependency-chain entries, not five independently demonstrated exploits.
3. **Configure the existing hosting service rather than accidentally creating a duplicate.** Use backend root with `npm ci` and `npm start`, or repository root with `npm ci --prefix backend` and `node backend/server.js`. Use one instance: state and device ownership are in memory. Choose compute that stays available during planned tests; verify the account's current plan behavior.
4. **Set private configuration.** NODE_ENV=production, RISK_PROFILE=walktest for walking trials, LOG_POSITIONS=0, a strong random ADMIN_TOKEN and either CLIENT_TOKENS or CLIENT_TOKEN. Prefer individual tokens. Each CLIENT_TOKENS entry has `token`, `session`, `subject` strings; session/subject use 1–40 letters, digits, underscores, dots or hyphens. Entries take precedence over CLIENT_TOKEN. Generate cryptographically random tokens; do not commit them. Set PORT through the host.
5. **Enable HTTPS/WSS and readiness.** Terminate TLS at the hosting platform and route WebSocket upgrades correctly. Configure /ready as the health-check route. Check /health and /ready return 200; protected dashboard/log routes reject missing and wrong admin tokens. Confirm unauthorized observer and phone connections are denied.
6. **Run hosted synthetic acceptance tests.** Use fictional coordinates only. Check urgent and quiet scenarios, different-session isolation, wrong-token denial, same-device reconnect, revocation after restart, slow/flood client behavior and startup/shutdown logs. Measure hosted tick timing at the intended participant count. Local 100-device timing is not a substitute.
7. **Set operational handling.** Monitor readiness failures, restarts, rejected access, resource usage and connection counts. If recording is enabled for a consented window, download logs before ephemeral storage resets and before retention removes them. Watch for the 10 MB session stop; restart deliberately for another recording window. Keep raw coordinates private and delete/export according to the agreed retention policy.
8. **Complete the phone/cellular tests above.** Record build, backend version/profile, device and network details. Approve release only against the agreed measured acceptance criteria.
9. **Prepare rollback.** Keep the last reviewed source and configuration. Drain/disconnect clients, restore the known version and compatible tokens/profile, redeploy, and verify readiness plus synthetic authentication/alert checks. Restart loses in-memory identity ownership; reconnecting phones reclaim IDs with their credential. Rotate credentials if exposure is suspected.

## Remaining product limitations

This is a bounded controlled-session release candidate, not a completed public safety service. Self-service enrollment, durable device accounts and instant revocation without restart are not implemented. No road geometry, background tracking, guaranteed warning delivery, physical calibration or independent safety validation exists. Do not infer road suitability from the synthetic results or the successful native compilation.
