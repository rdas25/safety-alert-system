# Verification report — October 25, 2026

Baseline: main `2db78d2ef24f613eaa43197593ee3895abfcdc7f`.
Draft PR: https://github.com/rdas25/safety-alert-system/pull/1

Access is authorized for only this repository. PR #1 was merged on October 26, 2026 and the backend was deployed to Render. See HOSTED_DEPLOYMENT.md for hosted evidence and remaining checks.
This report describes observations, not assumed physical-phone test results.

## Verified locally

- **26 regression tests passed, 0 failed**, on Node.js v24.22.1: 18 backend, 3 mobile URL helpers, 5 simulation tests.
  Reproduce from root: `node --test backend/test/*.test.js mobile/serverUrl.test.js simulation/test/*.test.mjs`.
- Backend tests cover model geometry, debounce/replay, public health, HTTP token rejection/acceptance, observer
  authorization, position validation, two synthetic live devices receiving HIGH-or-higher, malformed HTTP/WebSocket URL rejection without crashing, log list/download,
  missing/traversal filenames, SIGTERM flush, and production refusal without a token.
- **Six live local-server scenarios passed**: head-on, simultaneous crossing, stationary approach, side-by-side,
  walking apart, and wide 25 m pass. Actual isolated backend processes received synthetic positions at 4 Hz;
  clients received 1 Hz statuses over real localhost WebSockets. See `simulation/results/live-transport.json`.
  This is not hosted/device/network-reliability evidence.
- **90 synthetic benchmark runs** across ten trajectories, three bounded-noise settings and three seeds, evaluated
  at five HIGH cutoffs (450 evaluations). Clean seeds duplicate inputs. All evaluations and limitations are preserved
  in `simulation/results/REPORT.md`, JSON and CSV. Six quiet/hazard transport checks are separate from these runs.
- **52-second synthetic animation** generated from model/debounce outputs. Head-on and quiet wide-pass diagrams
  are labeled synthetic on every frame. Selected frames were visually inspected. It is not phone footage.
- Incremental Expo upgrades: SDK 54 -> 55 -> 56 -> 57 -> 58, with `expo install --fix` and successful iOS JavaScript
  exports at each upgraded SDK. Final stack: Expo 58.0.19, React Native 0.88.0, React 19.3.0, compatible native modules.
  Sources: https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/ and https://expo.dev/changelog/sdk-58.
- Final Expo compatibility check passed; **Expo Doctor 20/20 checks passed**. iOS JS/Hermes export passed.
- Native prebuild and CocoaPods installation succeeded. Generated Info.plist contains both location/local-network
  permission descriptions and scene lifecycle configuration.
- **Native iOS Simulator Release build succeeded** using Xcode 27.1 / iOS Simulator SDK 27.1 with signing disabled:
  `xcodebuild -workspace mobile/ios/SafetyAlert.xcworkspace -scheme SafetyAlert -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath <temporary-build-dir> CODE_SIGNING_ALLOWED=NO`.
  This is compilation only: the simulator app was not launched or UI-tested, and no physical device was installed.
- Clean installs succeeded separately in backend, simulation and mobile; the final SDK 58 mobile lockfile also
  passed a fresh cached `npm ci --offline` and compatibility check. Hosted CI verifies network clean installs. Native directories and build artifacts are generated and ignored by Git.

## Results that did not meet an expectation

- The clean five-second delayed crossing peaks at MODERATE, exceeding the checklist's LOW-or-lower hypothesis.
- A synthetic stale gap spanning the approach misses an intended hazard. Data loss reduces coverage.
- At default HIGH=0.50, the 63 core synthetic runs include 19 TRUE_ALERT, 8 MISSED, 2 FALSE_ALERT and 34 QUIET labels.
  These labels reflect scenario intent, not human field observations. Three diagnostic trajectories are excluded.
- Replay's <=5 m GPS proxy reports MISSED for quiet side-by-side/retreating trajectories. The report keeps proxy
  labels separate from independent trajectory intent; neither is a measured field false-alert rate.
- No threshold was changed. Simulation alone does not justify a field-calibration or improvement claim.

## Dependencies and access limitations

Final online audit after SDK 58 upgrade: **5 high advisory dependency entries**, rooted in `node-forge` and `zod`
in Expo CLI tooling (including transitive Expo/CLI/code-signing chain entries). The original stack reported 11,
then compatible fixes reduced it to 7. New SDK/tooling is not vulnerability-free. The registry's latest node-forge
was 1.4.0, included in its advisory; an unsupported forced downgrade or Zod major override was not applied.
Resolve upstream remediation before distributing builds to others. Audit entries are dependency-chain counts,
not five distinct demonstrated exploits. Backend/simulation install audits reported zero vulnerabilities.

Dashboard/observer/log access is token-protected when configured; production requires a token. Phone clients
remain unauthenticated and can submit fake positions or receive nearby peers. Do not expose an open public pilot
without session authentication/resource limits. Logs contain sensitive coordinates; default logging is off.
No real tokens or `.env` files were found in the working-tree scan; this is not a complete historical secret audit.

## Still unverified

Physical iPhone signing/install, actual permission prompts, screen wake/haptics, real GPS noise/accuracy,
consented two-phone walks, a physical-phone/cellular hosted scenario, real-data threshold calibration,
field false-alert/warning-time statistics, and a phone demo. These cannot be assumed from synthetic tests.

## Hosted CI

The initial implementation passed PR run 40260801800 and latest documentation commit run 40260982032
(Node.js 22/24 and mobile bundling). The expanded PR adds seeded benchmarks and a six-scenario live transport job.
Use the PR's latest commit checks for the current hosted result; earlier green runs do not validate new changes.

## Review and apply

The archive contains source plus labeled synthetic results/demo, excluding node_modules, Git internals, generated
native directories, build products and regenerated JSONL fixtures. The patch applies against the baseline above:

```bash
git switch -c finish-line-foundations 2db78d2ef24f613eaa43197593ee3895abfcdc7f
git apply --check /path/to/finish-line.patch
git apply /path/to/finish-line.patch
```

Review SDK compatibility, license, remaining advisories, location-data policy and latest CI before merging.
See FINISH_LINE.md for phases 1–6 and FIELD_RESULTS.md for unfilled real-test rows. RESUME.md provides
synthetic-evidence wording; it does not claim deployment or field validation.
