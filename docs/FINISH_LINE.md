# Finish-line audit — October 25, 2026

Source: uploaded Safety Alert System Finish Line Checklist.pdf, phases 1–6.
Baseline: public `rdas25/safety-alert-system`, main at `2db78d2ef24f613eaa43197593ee3895abfcdc7f`.
GitHub API inspection found zero Actions workflow runs, zero check runs and zero commit statuses.
The combined status API returned `pending` with an empty list: that is absence of checks, not a running or passing CI job.
The checklist describes files/test counts that were absent in this checkout. This audit uses the actual checkout.

| Phase | Present at baseline | Implemented in this change | Still required / evidence owner |
|---|---|---|---|
| 1: phone rebuild | Expo tracking/map app; haptics/keep-awake declared but unused | Haptic pulses while fresh HIGH/CRITICAL, keep-awake while tracker mounted, iOS permission strings/local networking, URL validation and WSS defaults, repaired native dependency lock/version mismatch; stale alerts clear | Physical iPhones + user: signed Release rebuild, Allow location/local-network prompts, verify screen stays awake, pulses trigger/stop, GPS HUD and joins; current laptop address must be entered, not guessed |
| 2: two-phone test | Simulator/ghost car and screenshots; README claims a phone walk but no logs/results support it | Opt-in private JSONL recordings, shared debounce, replay/timeline, 21-row scenario template including quiet cases | Two participants/phones + real world: each scenario three times, timestamped notes and private recordings. No measured walking results supplied |
| 3: deployment | HTTP health and unprotected dashboard; no Render Blueprint | Token checks for HTTP dashboard/logs and WS observer, production token requirement, HTTPS/WSS dashboard, Render Blueprint and download runbook | Render account owner: approve service/plan/data exposure, create service, verify health + rejected access + hosted phone alerts, export logs before storage resets. No deployment performed |
| 4: tuning | Deterministic model with default cutoffs | Replay HIGH sweep recomputes same model/debounce, proxy classifications and warning time, decision template | Real data: at least 10 walks including quiet cases, human labels and exclusions, before/after comparison, cutoff choice justified. Defaults remain unchanged |
| 5: repo/demo | Detailed README and 7 simulation images; 11 risk tests; no workflow/license; mobile lock broken | CI workflow/badge, mobile helper tests, replay/integration tests, clean-install repair, honest status, privacy/license/runbooks | GitHub CI must actually execute/pass on published branch and then main after merge. User: approve/merge PR including MIT license; record/redact 30–60 s phone demo. No clip exists here |
| 6: resume/interview | No recorded outcomes or interview notes | Evidence-limited resume language and design/limits preparation | User: rehearse explanations; include counts from actual test run and measured field outcomes only. No deployment/tuning/latency/improvement claim is justified yet |

## Validation and limitations

- Original 11 backend model tests passed; added replay/debounce and real local HTTP/WebSocket integration coverage.
- Latest final test/install/build counts are recorded in the delivered verification report. The PDF's expected 27+3
  tests are not an observed baseline; do not copy them into a resume.
- JavaScript iOS export validates bundling only. No physical phone, signing, native compilation, field walk,
  hosted connection or haptic result was verified during this work.
- Dependencies: compatible audit fixes applied. Mobile audit still reports 7 dependency entries (6 high, 1 moderate),
  including image-size, node-forge and postcss/Expo tooling chains. Forced Expo migration was not applied;
  resolve and native-test this before distributing builds to others. Backend/simulation install audits reported zero.
- No `.env` or real token was found among tracked files. Tests use a visibly fake token; LAN addresses/coordinates in
  docs are examples. This is a working-tree scan, not a complete historical secret audit.
- Public phone connections are still unauthenticated and can receive nearby coordinates. Admin tokens protect
  observer/log access only. Add authenticated sessions and resource limits before an open pilot.
- Recordings contain sensitive locations; default logging is off. Do not publish raw logs. Consent, retention and
  deletion are manual responsibilities. A Render deployment can expose the unauthenticated phone endpoint publicly.

## Approval and access boundaries

No physical tests, measurements or deployment can be substituted by code changes. Render service creation/billing,
sharing participant location, merging to main, public raw-data/demo publication and final resume claims remain with
the owner. Draft PR preparation is reviewable work; it does not certify any phase as complete.
