# Resume and interview preparation

Safe description now: Built a foreground collision-alert prototype with React Native, Node.js and WebSockets;
implemented deterministic closest-approach risk, automated tests, and simulation tooling.

Only after verification: add the actual test count and a passing CI link. Add Render deployment only after a
verified hosted run. Add tuning metrics only after recorded walks, human labels and before/after analysis.
Do not use the PDF's 27+3 count: the original checkout had 11 backend tests and no mobile helper file.

Practice explaining:
- WebSockets provide bidirectional updates; the server gives every pair one shared evaluation and log.
- Deterministic math is inspectable without a training set. Future ML would need representative labeled trajectories.
- Relative position r and velocity v give t*=-(r dot v)/|v|²; projected miss distance drives proximity.
  GPS accuracy widens its distance scale, and reported accuracy over 30 m skips a pair.
- Two ticks are required to raise/lower alerts: less flicker with added delay. Raw and shown levels differ.
- Late-joining devices are aligned by fix age before pair evaluation. Describe a specific historical bug only after
  identifying its commit/reproducer; no verified bug history is supplied by this audit.
- Limits include foreground-only tracking, straight-line assumptions, noisy GPS, unauthenticated phone IDs and no lanes.

Demo (30–60 seconds): show actual phone and dashboard, a head-on escalation and quiet wide pass; redact tokens and
precise identifying locations. State profile/build and whether each view is simulated. Link only a clip you recorded.
