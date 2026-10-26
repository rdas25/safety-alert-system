# Evidence-backed portfolio wording

Use these as prototype bullets. They deliberately describe synthetic validation rather than field testing or deployment.

- Built a foreground collision-alert prototype with React Native, Expo, Node.js and WebSockets, using deterministic closest-approach risk and GPS-aware miss-distance scoring.
- Added 26 automated regression tests, a CI pipeline, and six live local WebSocket scenarios covering alert escalation and quiet paths.
- Evaluated 90 reproducible synthetic runs across ten trajectories, three bounded-noise settings and three seeds; documented threshold trade-offs, data-loss misses, and limitations without claiming real-world accuracy.

Portfolio: https://github.com/rdas25/safety-alert-system

The 90 runs include repeated identical clean inputs, not 90 independent field samples. The six live scenarios used synthetic clients against a local server. Tests do not establish safety, haptic behavior, device GPS performance or deployment.

Only add a hosted deployment after confirming the live URL and a hosted phone test. Only add threshold-tuning, false-alert-rate or warning-time claims after recorded walks with human observations and sample-size disclosure.
