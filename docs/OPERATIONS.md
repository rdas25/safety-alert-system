# Operations and release gates

The November 10 release 497f62a is deployed to the existing Render service. Historical handoffs describe earlier snapshots. This document covers the follow-up local work, not a claim of phone validation.

## Monitoring and incidents

Run `HEALTH_URL=https://safety-alert-system.onrender.com node backend/healthcheck.mjs`. It exits nonzero on failed liveness/readiness, timeout or redirect. Connect it to an approved external monitor when an alert recipient and monitoring service are chosen. A probe is not continuous monitoring. Free-instance cold starts can exceed the ten-second timeout.

For an outage: check Render deployment status and logs, verify the running commit, then check /ready. With the existing administrator credential, inspect /metrics for tick duration, capacity and recording errors. Never attach credentials, raw locations or participant identifiers to public issues. Tell testers to stop relying on unavailable coverage. Restore service, repeat synthetic checks, and record the cause and corrective action.

Rollback: select a known-good compatible release in Render, verify its commit and health, then rerun synthetic acceptance checks. Do not roll back to the original unauthenticated implementation. Preserve environment credentials; stop enrollment during recovery. A rollback drill on the public service requires a scheduled interruption window.

## Backup and recovery

Requires persistent STATE_DIR storage; the current free service does not provide it. Keep one instance only. Stop the process before copying STATE_DIR/access.json into a restricted encrypted backup location. Keep environment seed credentials separately in an approved secret manager. Do not publish either. Restore while stopped, use directory mode 0700 and file mode 0600, retain matching seed configuration, then start and verify access, revocations and Stop behavior. Do not silently replace corrupt state with empty state.

The recovery regression test restores a separate copy and checks issued-token access, seed revocation, stopped identities, token hashing and corruption refusal. It is not a cloud-volume recovery drill. Restoring an old backup can undo newer revocations: reconcile revocations before reopening access. Backup destination, retention, encryption ownership and recovery objectives need owner decisions.

## Participant support and privacy

Use per-person scoped credentials via the existing admin issue/revoke commands. Share privately; never send the admin credential to a participant. For lost credentials, revoke the old subject and issue replacement access deliberately. Stop ends tracking; it does not erase historical recordings or operator backups.

Data inventory: precise location, motion, accuracy, role, session and device identifiers reach the backend. Same-session participants receive relevant nearby-peer data; the global administrator can observe sessions. Location recording is off by default. When enabled, the server rotates recordings and applies its documented retention limits. Render infrastructure may retain request/application metadata independently.

Before recruiting users, the owner must name the operator and support/privacy contact, approve retention and deletion handling, identify hosting/map providers, and approve a participant notice. Do not claim a published privacy policy or store compliance from this engineering inventory. For deletion requests, stop/revoke access, identify recordings and backups containing the participant, and apply the approved deletion procedure; revocation alone is not deletion.

Support report fields: app commit, phone/OS, network type, timestamp, observed behavior, expected behavior, reproduction steps. Keep precise location and tokens out of public reports. Classify missed warnings, false warnings, stale coverage, background failure and battery issues separately.

## Release gates

- Software: regression suite, six live synthetic scenarios, mobile export/native compilation, dependency review, recovery test and hosted smoke checks.
- Account/infrastructure: dashboard login for /ready health setting and automatic-deploy investigation; private admin access for hosted enrollment/revocation; approved always-on hosting/storage budget; monitoring recipient; backup destination and recovery objectives.
- Devices: signed iPhone installation, GPS/permissions, haptics/notifications, foreground/background/locked screen, Stop/expiry, reconnection and battery. Android additionally needs SDK/license setup, signing and a restricted Maps key. Simulator UI requires repairing the local runtime mismatch.
- Pilot evidence: missed/false alerts, useful warning lead time and performance across representative conditions. Set acceptance criteria before examining results; do not invent safety thresholds from synthetic passes.
- Distribution: Apple team/App Store Connect access, TestFlight configuration, owner-approved privacy/support details, screenshots and review information. Public distribution remains gated on device evidence.
- Product decisions: intended population and availability targets before multi-instance design; licensed geographic dataset before road context; invitation/account UX and deletion requirements before replacing operator-managed enrollment.

No paid plan, external monitor, store submission, new account system or production safety claim is implied by these preparations.
