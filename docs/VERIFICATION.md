# Verification report — October 25, 2026

Baseline: main `2db78d2ef24f613eaa43197593ee3895abfcdc7f`.
Changes are prepared on `codex/finish-line-foundations`. Initial GitHub branch creation was rejected with 403
`Resource not accessible by integration`. The owner subsequently approved installing the connector for only this
repository. This report records local verification; consult the draft PR for current publication and CI status.
No merge or deployment was performed.

## Verified

- Final Node.js v24.22.1 run: **21 passed, 0 failed** (18 backend, 3 mobile helper tests).
  Command: `node --test backend/test/*.test.js mobile/serverUrl.test.js` from the repository root.
- Backend coverage includes the 11 original risk-model tests, 5 replay/debounce tests, 1 local
  HTTP/WebSocket/recording integration test, and 1 production-startup token test.
- Integration: public health; missing/wrong HTTP token rejected; correct token accepted; unauthorized
  observer closed; authorized observer receives a snapshot; invalid position rejected; two synthetic devices
  receive status and HIGH-or-higher; authenticated log list/download; missing/traversal filenames rejected;
  SIGTERM flushes JSONL that replays successfully. Test logs are synthetic and deleted afterward.
- `npm ci` succeeded separately in backend, simulation and mobile with the repaired lockfiles.
  Final repeat used cached packages (`--offline`); initial dependency installation used network access.
- `npx expo install --check` reported dependencies up to date using Expo's bundled compatibility map.
  It warned that offline version validation could not query the remote endpoint.
- `npx expo export --platform ios` succeeded (609 modules). This is a JS/Hermes bundle, not native compilation.
- Render Blueprint and workflow parsed as YAML; `git diff --check` passed.
- Final online mobile audit: **7 advisory entries: 6 high, 1 moderate**. These are dependency-chain counts,
  not seven distinct demonstrated exploits. Compatible fixes reduced the initial count from 11.
  Remaining packages: @expo/cli, @expo/code-signing-certificates, @expo/metro-config, expo, image-size,
  node-forge, postcss. A broader SDK/tooling remediation needs compatibility and native validation.
  Offline install output saying zero vulnerabilities is not an online security assessment.
- Backend and simulation install audits each reported zero vulnerabilities.

## Not verified

Native Xcode compile, signing, installation, physical haptics, keep-awake, local-network prompt,
actual GPS accuracy, two-phone walks, hosted Render service, cellular connectivity, CI execution,
false-alert rate, warning-time distribution, threshold improvement, demo clip, interview performance.
No real field logs were available. No threshold was changed. No private token was put in the code.

## Review and apply

The source archive includes all original tracked files plus these changes, excluding dependencies,
Git internals and generated bundles. The patch applies against the exact baseline above; check it in a clean clone:

```bash
git switch -c finish-line-foundations 2db78d2ef24f613eaa43197593ee3895abfcdc7f
git apply --check /path/to/finish-line.patch
git apply /path/to/finish-line.patch
```

Review before publishing, including the MIT license, token/data exposure policy and remaining dependency advisories.
Publish this branch as a draft PR. Confirm remote CI passes, then obtain owner
review before merging to main. Render account creation/service approval and all physical/real-world sign-offs
remain outstanding. See FINISH_LINE.md for phases 1–6 and FIELD_RESULTS.md for unfilled test rows.

## Hosted CI

Draft PR: https://github.com/rdas25/safety-alert-system/pull/1

PR run https://github.com/rdas25/safety-alert-system/actions/runs/40260801800 completed successfully on commit 79418e369614ee9946e25712cad8e4327d13f77c. All three jobs passed: test (22), test (24), mobile. The push run 40260764294 also passed. These checks do not verify native compilation or phone behavior. Main remains unchanged and no deployment was performed.
