# Safety Alert System

A real-time collision-alert prototype for pedestrians, cyclists and drivers. Phones share live GPS position with a
small server. Every second the server predicts, for every pair of nearby users, whether their paths are on a collision
course, and pushes an alert level (`NONE`, `LOW`, `MODERATE`, `HIGH`, `CRITICAL`) back to the phones a few seconds
before the closest approach.

**Stack:** React Native (Expo) client, Node.js + WebSocket (`ws`) server, a deterministic closest-point-of-approach
risk model (no ML), unit tests with `node:test`, and a multi-client simulator.

**Status:** the server, risk model and simulator are tested; the phone app is written and has been field-tested
on two physical phones (see [Status](#status)).

## Demo

The images below come from a real run of this repo: the actual server and risk model, two simulated pedestrians
(`simulation/simulated_agent.mjs`) walking toward each other from 40 m apart at 1.4 m/s each, and the live debug dashboard
(`http://localhost:8080/`). Each frame shows the server's per-pair numbers and the two devices on a north-up map; the
line through each dot is 5 seconds of travel.

**1. Approaching, still far apart.** 31.9 m apart, closest approach 11.4 s away. Urgency `U` is 0, so risk is 0.

![Far apart: NONE](docs/images/01-approach-none.png)

**2. LOW.** 20.7 m apart, closest approach in 7.4 s, predicted miss distance 0 m, risk 0.315. The shown level is `LOW`, but the
`raw` level is already `MODERATE` (risk of 0.25 or more); see the note after frame 7.

![LOW](docs/images/02-head-on-low.png)

**3. MODERATE.** 15.1 m, 5.4 s, risk 0.56. `raw` is already `HIGH` while `shown` is still `MODERATE`.

![MODERATE](docs/images/03-head-on-moderate.png)

**4. HIGH.** 9.5 m, 3.4 s, risk 0.80. `raw` is already `CRITICAL`.

![HIGH](docs/images/04-head-on-high.png)

**5. CRITICAL.** 3.9 m, 1.4 s to the predicted collision.

![CRITICAL](docs/images/05-head-on-critical.png)

**6. After passing.** The phones are now moving apart (`reason = diverging`), so the alert clears.

![After pass: NONE](docs/images/06-after-pass-none.png)

**7. A pass that should not alert.** Two walkers heading in opposite directions on parallel paths 20 m apart. They
approach each other, but the predicted miss distance is 20 m, so the proximity term `P` is 0 and no alert is raised.

![Wide pass: NONE](docs/images/07-wide-pass-none.png)

**About `raw` and `shown`.** The model produces a `raw` level every second. The server only changes the `shown` level after two
consecutive ticks agree, which removes flicker from noisy GPS. The cost is visible in frames 2 to 4: the level phones
receive trails the raw level by about one step, roughly 1 to 2 seconds. Raising `HIGH` and `CRITICAL` immediately (and
debouncing only the lower levels) would be the first thing to tune with field data.

Level changes in the server log for the head-on run (the numbers are the raw values at the tick when the shown level changed):

```
NONE -> LOW       risk=0.32  tcpa=7.4s  miss=0.0m  closing=2.8m/s  dist=20.7m  reason=approaching
LOW -> MODERATE   risk=0.56  tcpa=5.4s  miss=0.0m  closing=2.8m/s  dist=15.1m  reason=approaching
MODERATE -> HIGH  risk=0.80  tcpa=3.4s  miss=0.0m  closing=2.8m/s  dist=9.5m   reason=approaching
HIGH -> CRITICAL  risk=0.97  tcpa=1.4s  miss=0.0m  closing=2.8m/s  dist=3.9m   reason=approaching
CRITICAL -> NONE  risk=0.00  tcpa=-1.6s miss=4.5m  closing=-2.8m/s dist=4.5m   reason=diverging
```

These runs use the default `walktest` risk profile, explained [below](#risk-model).

## How it works

```
Phone A --position, 1 Hz--+                              +--status, 1 Hz--> Phone A
                          +--> Backend (WebSocket) ------+
Phone B --position, 1 Hz--+       |                      +--status, 1 Hz--> Phone B
                                  | every second: dead-reckon each device to "now",
                                  | run the risk model on every pair, debounce the level
Browser --> http://<ip>:8080/ ----+ live dashboard (observer)
```

The risk model runs on the server, so there is one implementation to test and one place to log what happened.

Phone to server, once per second (also when standing still, so the server knows the phone is alive):

```json
{"type":"position","deviceId":"dev-k3x9fa","role":"pedestrian","lat":40.4237,"lon":-86.9212,
 "speed":1.4,"heading":92,"accuracy":4.8,"fixAgeMs":310}
```

Server to phone, once per second:

```json
{"type":"status","level":"HIGH","stale":false,"profile":"walktest",
 "threat":{"peerId":"dev-q8m2zz","peerRole":"pedestrian","level":"HIGH","risk":0.707,"tcpaS":4.2,
           "missM":0.0,"closingMps":2.8,"distanceM":11.7,"bearingDeg":90},
 "peers":[{"id":"dev-q8m2zz","role":"pedestrian","lat":40.4237,"lon":-86.9211,"speed":1.4,"heading":270,"level":"HIGH","distM":11.7}]}
```

Details that matter for correctness:

- Each device gets a random ID per app launch; reconnecting with the same ID replaces the old connection.
- Messages are validated (ranges, types, 4 KB max). Devices silent for 30 s are dropped, and data older than 5 s is not
  used for risk.
- A phone's position is dead-reckoned forward by the age of its fix so two devices are compared at the same instant.
- Phones only receive peers within 500 m.

## Risk model

`backend/riskModel.js`, a pure function with no I/O. For two devices, work in local meters with `r` = relative position
and `v` = relative velocity (a device under 0.5 m/s or with unknown heading counts as stationary).

| Step | Formula | Meaning |
|---|---|---|
| Approaching? | `r · v < 0` | Otherwise risk is 0 (moving apart, or same velocity) |
| Time to closest approach | `t* = -(r · v) / abs(v)^2` | Capped at 15 s |
| Predicted miss distance | `miss = abs(r + v * t*)` | Separation at closest approach |
| Proximity | `P = exp(-(miss / D0)^2)`, `D0 = contact radii + sqrt(sigmaA^2 + sigmaB^2)` | Wider region when GPS accuracy is poor |
| Urgency | `U = clamp((10 - t*) / (10 - 2), 0, 1)` | 0 at 10 s or more, 1 at 2 s or less |
| Severity | `S = W_pair * (1 - exp(-(abs(v) / V0)^2))` | Faster closing and more vulnerable pairs score higher |
| Risk | `risk = P * U * S` | Levels: LOW 0.10, MODERATE 0.25, HIGH 0.50, CRITICAL 0.75 |

Multiplying the three terms means a far miss, a distant closest approach, or a harmless closing speed each drive risk
toward zero on their own, so distance and speed interact instead of being added.

Worked example, frame 2 above: `miss = 0` so `P = 1`; `t* = 7.4 s` so `U = (10 - 7.4) / 8 = 0.32`; relative speed 2.8 m/s
with `V0 = 1.5` gives `S = 1 - exp(-3.48) = 0.97`; `risk = 1 * 0.32 * 0.97 = 0.31`, which is at or above the 0.25
MODERATE cutoff (the dashboard shows 0.315 from unrounded inputs).

Two profiles, chosen with `RISK_PROFILE`:

- `walktest` (default): severity saturates at walking speed, so two people on foot can exercise every level. Use it for
  testing.
- `real`: physical severity weights (`V0 = 5 m/s`, two walkers cap at LOW, pedestrian versus car reaches HIGH).

Driver-to-driver pairs are excluded for now, because without road geometry opposing lanes look head-on. All constants
(`T_HOR_S`, `V0_MPS`, cutoffs, contact radii) are hand-chosen starting values, listed at the top of the file.

## Run it

Prerequisites: Node.js 20 or newer (tested on 22). No Python is needed. For the phone app you also need a Mac with Xcode
and an iPhone.

### Without any phones

```bash
git clone https://github.com/rdas25/safety-alert-system.git
cd safety-alert-system

# terminal 1: backend (prints the address it listens on)
cd backend && npm install && npm test && npm start

# terminal 2 and 3: two simulated pedestrians, 40 m apart, walking toward each other
cd simulation && npm install
node simulated_agent.mjs phone-A pedestrian 40.4237 -86.9212 90 1.4
node simulated_agent.mjs phone-B pedestrian 40.4237 -86.920728 270 1.4
```

Open `http://localhost:8080/` to watch the dashboard. Useful variations:

```bash
SERVER_URL=ws://<other-computer-ip>:8080 node simulated_agent.mjs ...   # backend on another machine
NOISE_M=3 node simulated_agent.mjs ...                                  # add 3 m of GPS jitter
node ghost_car.mjs <phoneLat> <phoneLon> 6 90 45 0                      # a simulated car aimed at a real phone
RISK_PROFILE=real npm start                                             # in backend/: physical severity
VERBOSE=1 npm start                                                     # in backend/: log every position and pair
```

### With phones (written, not yet tested on hardware)

1. Start the backend and note the `<ip>:8080` address it prints. Phones and computer must be on the same network.
   `localhost` on a phone means the phone itself, so the computer's LAN address is required.
2. Put that address in `mobile/config.js` (`DEFAULT_SERVER`), or type it into the app's setup screen.
3. Build and install on an iPhone:

   ```bash
   cd mobile && npm install
   npx expo prebuild --platform ios
   npx expo run:ios --device --configuration Release
   ```

   `react-native-maps` needs a native development build, so Expo Go is not enough. A free Apple ID build expires after
   7 days. Allow Location (While Using, Precise) and Local Network when asked.
4. In the app choose a role, tap Start, and walk toward another phone. The banner colour, alert text and vibration
   follow the server's alert level.

## Tests

```bash
cd backend && npm test
```

11 unit tests cover head-on escalation, moving apart, same velocity, wide and narrow passes, crossing at the same and
at different times, a stationary person, unknown heading, both profiles, excluded pairs and poor GPS, symmetry between
the two devices, and dead-reckoning. The server and simulator are exercised end to end by running the
[quick start](#without-any-phones).

## Project structure

```
safety-alert-system/
├── README.md
├── LICENSE
├── .gitignore
├── docs/images/             demo frames used in this README
├── backend/
│   ├── server.js            WebSocket + HTTP server, per-second evaluation loop, debounce
│   ├── riskModel.js         the risk model (pure functions)
│   ├── public/dashboard.html  live debug dashboard
│   ├── test/riskModel.test.js
│   └── package.json
├── mobile/                  Expo app: App.js, config.js, index.js, app.json, assets/
└── simulation/              simulated_agent.mjs, ghost_car.mjs
```

The first version of the model (a distance-only threshold, in Python) is in the git history.

## Status

- Tested: the risk model (unit tests) and the full pipeline of WebSocket server, per-pair risk, debounced alert levels
  and clients, using simulated phones.
- Tested: a walk with two physical phones. The app uses the same message protocol as the simulator, and real
  iPhone speed and heading at walking pace, and real GPS noise, have been measured.
