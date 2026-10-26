# Synthetic simulation results

**Simulation only: no physical phones, field measurements or deployment.**

Reproduce: `cd simulation && npm run benchmark`. The runner evaluates the actual risk model and shared debounce through replay, with fictional coordinates.

90 synthetic runs: 10 trajectories × 3 bounded-noise levels × 3 seeds. Each run has 26 one-second snapshots and is evaluated at five HIGH cutoffs (450 evaluations). Clean seeds repeat identical inputs; these are not 90 independent real-world samples. Seven core scenarios contribute 63 runs per cutoff; three diagnostics are excluded from sweep counts.

Scenario labels come from intended trajectory behavior, independently of replay's 5 m GPS-distance proxy. True closest approach is sampled every 10 ms from the exact trajectories. Speeds/headings are perfect, noise is independent and bounded, and no network/hardware behavior is modeled here.

## Clean baseline (HIGH=0.50, seed=1)

| Scenario | Peak shown | Known closest distance (m) | Warning before closest point (s) | Scenario verdict | Replay proxy |
|---|---|---|---|---|---|
| head-on | CRITICAL | 0.01 | 3.29 | TRUE_ALERT | TRUE_ALERT |
| crossing-same-arrival | CRITICAL | 0.00 | 4.00 | TRUE_ALERT | TRUE_ALERT |
| crossing-wait-five-seconds | MODERATE | 4.95 | n/a | QUIET | QUIET |
| side-by-side | NONE | 3.00 | n/a | QUIET | MISSED |
| stationary-approach | HIGH | 0.01 | 1.29 | TRUE_ALERT | TRUE_ALERT |
| walking-apart | NONE | 2.00 | n/a | QUIET | MISSED |
| wide-pass-25m | NONE | 25.00 | n/a | QUIET | QUIET |
| poor-gps | NONE | 0.01 | n/a | UNASSESSED | UNASSESSED |
| late-join | CRITICAL | 0.01 | 3.29 | TRUE_ALERT | TRUE_ALERT |
| stale-gap | LOW | 0.01 | n/a | MISSED | MISSED |

## Exploratory HIGH sweep (all core seeds/noise conditions)

| HIGH | Synthetic runs | True alert | Missed | False alert | Quiet | Unassessed |
|---|---|---|---|---|---|---|
| 0.30 | 63 | 24 | 3 | 6 | 30 | 0 |
| 0.40 | 63 | 22 | 5 | 5 | 31 | 0 |
| 0.50 | 63 | 19 | 8 | 2 | 34 | 0 |
| 0.60 | 63 | 13 | 14 | 1 | 35 | 0 |
| 0.70 | 63 | 11 | 16 | 1 | 35 | 0 |

## Decision and limits

The clean five-second delayed crossing peaks at MODERATE, exceeding the checklist hypothesis of LOW or lower, although it does not reach HIGH. This mismatch is retained rather than marked as a pass. The stale-gap diagnostic misses its intended hazard after data loss. These are limitations, not successful safety validations.

Retain HIGH=0.50. This sweep is exploratory simulation evidence, not a field-calibration decision. No improvement in real false-alert rate or warning time is established. Cases marked MISSED/FALSE_ALERT are retained in the report. Same-direction/retreating paths illustrate why replay's proximity proxy is not a collision ground truth. Poor GPS and stale data intentionally reduce coverage; no alert does not imply safety.

Model SHA-256: `5ee62b87accfadfcd0222eb28ebc0fcf13740ed2290989b8651ee6860209e41c`. JSON and CSV contain every evaluation for inspection. Live local transport tests are reported separately.
