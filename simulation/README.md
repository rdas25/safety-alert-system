# Reproducible synthetic validation

These tools generate fictional positions, not physical-phone evidence.

```bash
cd simulation
npm ci
npm test
npm run benchmark
npm run test:live
```

`benchmark` evaluates the production model and shared debounce through replay. It writes `results/REPORT.md`, complete JSON/CSV evaluations and regenerable clean JSONL fixtures. Ten trajectories × three bounded uniform per-axis position-noise levels (0, 3, 8 m) × three seeds = 90 runs. Five HIGH cutoffs yield 450 evaluations. Seven core scenarios contribute 63 runs per cutoff; three diagnostics test poor accuracy, late arrival and a stale gap. Clean seeds are duplicates. Speeds/headings are perfect; this is not a realistic GPS distribution.

`test:live` starts six isolated copies of the actual backend, sends synthetic positions at 4 Hz for 22 seconds, and checks 1 Hz received statuses. It deletes temporary position recordings and emits `results/live-transport.json`. These runs validate local transport plus the model, not phones, a hosted server or network reliability. CI uploads this result even on failure.

Labels in the benchmark come from scenario intent and exact trajectories. Replay's <=5 m sampled-distance proxy is separately reported. Quiet side-by-side and walking-apart cases demonstrate why proximity is not collision ground truth. The delayed crossing reaches MODERATE rather than the checklist's LOW-or-lower hypothesis; the stale gap can miss an intended hazard. Those outcomes are retained.

## Synthetic demo

The committed GIF shows a clean head-on approach and a quiet 25 m pass. Rebuild it with Node plus Python/Pillow (optional tooling; the app/server do not need Python):

```bash
node demo_data.mjs
python3 render_demo.py results/demo-frames.json ../docs/images/synthetic-demo.gif
```

Every frame is labeled synthetic. It is a model illustration, not phone footage or a measurement of screen/haptic response.

## Threshold policy

HIGH remains 0.50. The exploratory sweep illustrates false-alert/miss trade-offs but cannot justify a real-world calibrated cutoff. Collect consented walks and notes before changing that claim. See `docs/FIELD_RESULTS.md`.
