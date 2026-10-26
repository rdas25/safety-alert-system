# Two-phone test record — no observations collected here

Build/commit: pending. Device models/iOS: pending. Profile: walktest. Location/date: pending.
Participant consent/retention agreement: pending. Native permission and haptic checks: pending.

Use open sky in a safe walking area, away from traffic. Both phones use the same build and backend.
Start the backend with `npm run start:log`; narrate start/closest-point/stop timestamps. Note GPS accuracy,
connection loss, observed closest separation and whether a warning was warranted. Stop the server after each walk,
save the private log, and replay it against notes. Run every scenario three times (21 walks; at least 10 for tuning).
Expectations below are hypotheses from the checklist/model, not measured outcomes or guaranteed shown timings.

| Scenario | Expected | Repeat | Private log ID | Observed alert | Warning seconds | GPS accuracy / actual closest point / notes |
|---|---|---|---|---|---|---|
| Head-on, start 40 m apart | HIGH near 14 m raw; shown delayed | 1 | pending | pending | pending | pending |
| Head-on, start 40 m apart | HIGH near 14 m raw; shown delayed | 2 | pending | pending | pending | pending |
| Head-on, start 40 m apart | HIGH near 14 m raw; shown delayed | 3 | pending | pending | pending | pending |
| Crossing, same arrival | HIGH+ | 1 | pending | pending | pending | pending |
| Crossing, same arrival | HIGH+ | 2 | pending | pending | pending | pending |
| Crossing, same arrival | HIGH+ | 3 | pending | pending | pending | pending |
| Crossing, one waits 5 s | LOW or lower | 1 | pending | pending | pending | pending |
| Crossing, one waits 5 s | LOW or lower | 2 | pending | pending | pending | pending |
| Crossing, one waits 5 s | LOW or lower | 3 | pending | pending | pending | pending |
| Side by side | NONE | 1 | pending | pending | pending | pending |
| Side by side | NONE | 2 | pending | pending | pending | pending |
| Side by side | NONE | 3 | pending | pending | pending | pending |
| Stationary + approaching walker | HIGH, below CRITICAL | 1 | pending | pending | pending | pending |
| Stationary + approaching walker | HIGH, below CRITICAL | 2 | pending | pending | pending | pending |
| Stationary + approaching walker | HIGH, below CRITICAL | 3 | pending | pending | pending | pending |
| Walking apart | NONE | 1 | pending | pending | pending | pending |
| Walking apart | NONE | 2 | pending | pending | pending | pending |
| Walking apart | NONE | 3 | pending | pending | pending | pending |
| Parallel wide pass (25 m) | NONE | 1 | pending | pending | pending | pending |
| Parallel wide pass (25 m) | NONE | 2 | pending | pending | pending | pending |
| Parallel wide pass (25 m) | NONE | 3 | pending | pending | pending | pending |

## Threshold decision — pending real data

Sample size and scenarios: pending. Human labels and exclusions: pending.
For each log run `node replay.js logs/<file>.jsonl --sweep HIGH=0.3,0.4,0.5,0.6,0.7`.
Aggregate per-pair counts across eligible walks; distinguish proxy labels from human observations.
Record current cutoff, candidate, before/after TRUE_ALERT/MISSED/FALSE_ALERT/QUIET counts and warning times.
Explain why the selected trade-off is acceptable; retaining 0.50 is valid if data supports it.
Document small sample size, GPS uncertainty, 1 Hz sampling, incomplete runs and the 5 m proxy.
Do not commit raw coordinates or infer an improvement from simulation alone.
