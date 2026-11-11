# Synthetic simulation results

**Simulation only: no physical phones, field measurements or deployment.**

Reproduce: `cd simulation && npm run benchmark`. The runner evaluates the actual risk model and shared debounce through replay, with fictional coordinates.

90 synthetic runs: 10 trajectories × 3 bounded-noise levels × 3 seeds. Each run has 26 one-second snapshots and is evaluated at five HIGH cutoffs (450 evaluations). Clean seeds repeat identical inputs; these are not 90 independent real-world samples. Seven core scenarios contribute 63 runs per cutoff; three diagnostics are excluded from sweep counts.

Scenario labels come from intended trajectory behavior, independently of replay's 5 m GPS-distance proxy. True closest approach is sampled every 10 ms from the exact trajectories. Speeds/headings are perfect, noise is independent and bounded, and no network/hardware behavior is modeled here.

## Clean baseline (HIGH=0.50, seed=1)

| Scenario | Peak shown | Known closest distance (m) | Warning before closest point (s) | Scenario verdict | Replay proxy |
|---|---|---|---|---|---|
| head-on | CRITICAL | 0.01 | 5.29 | TRUE_ALERT | TRUE_ALERT |
| crossing-same-arrival | CRITICAL | 0.00 | 5.00 | TRUE_ALERT | TRUE_ALERT |
| crossing-wait-five-seconds | MODERATE | 4.95 | n/a | QUIET | QUIET |
| side-by-side | NONE | 3.00 | n/a | QUIET | MISSED |
| stationary-approach | HIGH | 0.01 | 2.29 | TRUE_ALERT | TRUE_ALERT |
| walking-apart | NONE | 2.00 | n/a | QUIET | MISSED |
| wide-pass-25m | NONE | 25.00 | n/a | QUIET | QUIET |
| poor-gps | NONE | 0.01 | n/a | UNASSESSED | UNASSESSED |
| late-join | CRITICAL | 0.01 | 5.29 | TRUE_ALERT | TRUE_ALERT |
| stale-gap | CRITICAL | 0.01 | 0.29 | TRUE_ALERT | QUIET |

## Exploratory HIGH sweep (all core seeds/noise conditions)

| HIGH | Synthetic runs | True alert | Missed | False alert | Quiet | Unassessed |
|---|---|---|---|---|---|---|
| 0.30 | 63 | 27 | 0 | 12 | 24 | 0 |
| 0.40 | 63 | 27 | 0 | 11 | 25 | 0 |
| 0.50 | 63 | 27 | 0 | 6 | 30 | 0 |
| 0.60 | 63 | 18 | 9 | 5 | 31 | 0 |
| 0.70 | 63 | 17 | 10 | 5 | 31 | 0 |

## Current interpretation

Urgent HIGH/CRITICAL escalation is immediate. The table above describes this version. Replay proxy labels now split encounters and classify warnings with less than one second lead as LATE_ALERT. Scenario verdicts still describe whether any HIGH was seen, so inspect warningS separately for timeliness. No field performance is established.

Model SHA-256: `a829186d35fbed7f226dd691b2ad83f0ffaced3160b3beaa441adc86adeb37e4`.
