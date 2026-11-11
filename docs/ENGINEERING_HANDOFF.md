# Non-pilot engineering handoff

November 10, 2026. This document supersedes the prior release handoff. Changes are local; no repository push, deployment or real-location test was performed.

## Implemented since the prior release candidate

### Access and privacy

- Managed participant enrollment and immediate revocation through an admin-only HTTP API and operator CLI. Separate sessions remain isolated.
- Optional durable access/identity storage: set STATE_DIR to a private persistent directory. Enrollment tokens and device secrets are stored as SHA-256 digests, not raw values. Writes use private permissions and atomic rename. Without STATE_DIR, this state remains in memory.
- Revoking a participant closes their active sockets and removes their live tracks immediately. Re-enrollment does not revive the revoked seed token.
- Stop invalidates the tracking identity so an in-flight background upload cannot resurrect a stopped session. A new tracking session gets a new identity.
- The setup screen explains location sharing, the tracker shows when server recording is active, and background sharing is an explicit opt-in with a 12-hour limit.

### Background operation and mobile reliability

- Added Expo background location tasks, secure session storage and local warning notifications, including native iOS background declarations and Android foreground-service/notification configuration.
- Background tasks use bounded one-shot authenticated WebSocket exchanges. The server keeps their fresh fixes available after the socket closes, but the normal five-second freshness limit still applies.
- HIGH/CRITICAL notifications are rate-limited to one every ten seconds unless severity escalates. Unavailable-background notices are throttled. Stop cancels future tracking/notifications and removes its server track when reachable.
- Foreground sockets and GPS subscriptions pause when the app leaves the foreground. Foreground reconnection resumes when it becomes active. Background setup cancellation prevents a delayed permission response from enabling tracking after Stop.
- Screen wake is optional instead of forced. No quantitative battery-life claim is made.
- On a fresh foreground app launch, any prior background session is stopped before setup is offered. Background delivery still depends on operating-system scheduling, permission, connectivity and device settings; implementation and compilation do not establish reliable delivery on phones.

### Prediction and geographic processing

- Short-history velocity estimation uses recent, sufficiently separated GPS fixes, rejects duplicate/noisy/insufficient observations and exposes residual/error estimates and expanding forecast envelopes.
- MOTION_MODE=history allows this estimate to recover missing native speed/heading. The default raw mode preserves the original sensor-driven warning behavior. Both modes remain heuristic, not field-calibrated.
- Straight, turning and accelerating trajectory hypotheses are implemented as diagnostics. They are not assigned calibrated probabilities and do not independently change alert decisions.
- Optional local GeoJSON LineString road/path context can be supplied with ROAD_CONTEXT_FILE. Matching reports nearby paths but never suppresses a warning on the assumption that a lane or barrier is safe. No map data or commercial provider subscription is bundled.
- Earth-centered spatial cells restrict pair candidates to neighboring cells within each session. Tests compare the candidates with brute force and cover the antimeridian. Dense groups remain quadratic; geographically separated groups avoid unnecessary all-pair scoring.
- Dead reckoning uses spherical movement and longitude wrapping, including finite results at the poles.

### Operations and dependencies

- Recordings rotate at approximately 10 MB instead of stopping the warning server. Queue/disk failures disable recording and surface an error through protected /metrics; warning processing continues. Retention and private files remain enabled.
- Protected /metrics provides device/socket/pair counts, tick duration, recording state/error and model version. /ready and /health remain available for readiness/liveness.
- Model hashes now include the motion, prediction and spatial code plus the motion mode.
- Patched tooling versions are pinned with npm overrides: glob 14.0.4 and minimatch 11.0.6. This removes the previously remaining advisory entries without downgrading Expo. These are transitive major-version overrides, so they must be revisited when Expo updates. Clean installation, Expo compatibility, fingerprinting, exports, prebuild and native compilation are used to check the affected workflows.

## Operator commands and configuration

Install with npm ci separately in backend, simulation and mobile. Configure a strong ADMIN_TOKEN, an initial CLIENT_TOKEN (or CLIENT_TOKENS), RISK_PROFILE=walktest for walking demonstrations, and STATE_DIR pointing to durable private storage before starting the server. Use HTTPS/WSS for remote access. STATE_DIR must be on persistent storage if identities are expected to survive a replacement container or deployment.

From backend, with ADMIN_TOKEN already in the environment:

```
node admin.mjs issue walking-group alice
node admin.mjs list
node admin.mjs revoke walking-group alice
```

ADMIN_URL defaults to http://127.0.0.1:8080. Remote administration requires HTTPS. Issuance returns a participant token once; share it privately with that participant. The list command lists managed entries, not environment seed tokens. Keep seed credentials private as operator/bootstrap credentials or use scoped entries. Revocation applies to the participant's subject within the named session.

The equivalent /admin/access endpoint requires an Authorization: Bearer header even when a dashboard query token would otherwise be accepted. GET lists managed entries; POST issues and DELETE revokes, with JSON session/subject fields. Do not expose an administrative token in URLs or screenshots.

LOG_POSITIONS=1 enables location recordings only for an agreed test window. Inspect /metrics for recording failures. Default logging is off. MOTION_MODE accepts raw or history; ROAD_CONTEXT_FILE is an optional operator-controlled path to a bounded GeoJSON FeatureCollection. These settings do not validate the suitability of a road or forecast model.

## Test and build evidence

See engineering-tests.txt, engineering-live-run.txt, engineering-ios-build.txt and engineering-mobile-audit.json beside this handoff. The package includes regression tests for persistence, revocation, background transport/retention/Stop, history recovery, trajectory hypotheses, geographic candidates, rotation, stale data and the existing model/server behavior. Synthetic benchmark and live transport data are regenerated from the current implementation.

## Remaining work that cannot be claimed complete locally

1. **Physical device verification, before a pilot:** sign/install the native iOS app; verify foreground/background/locked-screen permissions, haptics and notifications, Stop/expiry, GPS interruption, Wi-Fi/cellular switching and battery behavior. These are hardware checks and can be performed individually without recruiting a pilot group.
2. **Android native verification:** Android JavaScript export succeeds, but the Android SDK is not installed at the standard local path and native Android compilation is unverified. Provision the SDK, produce a signed build, and configure the Google Maps Android API key for the signed application and verify maps/permissions/foreground service/notifications on an Android device. No SDK licenses or store agreements were accepted on the owner's behalf.
3. **Simulator UI verification:** this Mac's CoreSimulator service version conflicts with the installed Xcode requirement. Native simulator compilation succeeds; launch/UI testing requires repairing/restarting that environment. Existing user simulator sessions were not terminated.
4. **Deployment and hosted checks:** configure private credentials, persistent STATE_DIR storage, HTTPS/WSS, one server instance, readiness/monitoring/backups and rollback. Publish through the intended repository only after review, then run hosted CI and synthetic acceptance checks. Nothing was pushed or deployed here.
5. **Geographic data:** select and license an appropriate road/path dataset before enabling actual local road context. The importer is implemented; it is not a bundled global road network or lane-aware collision model.
6. **Pilot-dependent decisions:** warning thresholds, the treatment of motion hypotheses, safe warning lead times, false-alert trade-offs and measured battery/network reliability require representative independent observations. A trained model needs suitable labeled data. No real-world safety claim is justified by this work.
7. **Scale beyond the bounded service:** the limit remains 100 active devices and one server instance. Spatial indexing is implemented, but distributed geographic sharding/shared state and multi-instance failover are not implemented. These need an explicit population/availability target and infrastructure design; increasing capacity is not a one-line production change.

The software is a more complete controlled-session prototype, not a certified collision-avoidance service. Only participating devices with usable data can be assessed. Background and alternative-motion features must be verified before relying on them in a pilot.

## Final measured results

- 51 regression tests passed, zero failed, including live history-mode recovery and background Stop/retention scenarios.
- All six 22-second live synthetic transport scenarios passed; all 450 benchmark evaluations were regenerated.
- Final 100-device capacity run: 97 additional clients received statuses in about 1.02 seconds; measured evaluation tick 10.77 ms on this Mac. The configured device limit remains 100.
- Clean cached npm install passed with the patched dependency overrides. Expo compatibility check, project fingerprinting, iOS/Android exports and iOS native prebuild passed.
- Native unsigned iOS Simulator Release compilation succeeded under Xcode 27.2. This is compilation, not a signed physical-phone install or simulator UI verification.
- Final mobile npm audit: zero advisory entries of any severity. Backend has no new dependencies and its saved audit also reports zero. An audit result is not a guarantee that the application has no security defects.
- The five earlier moderate advisory entries are resolved in this package; the earlier handoff's advisory count is superseded. Overrides are explicitly pinned and tested, not an Expo downgrade; verify them again on future SDK changes.
