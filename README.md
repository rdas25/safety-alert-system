# Safety Alert System

[![tests](https://github.com/rdas25/safety-alert-system/actions/workflows/test.yml/badge.svg)](https://github.com/rdas25/safety-alert-system/actions/workflows/test.yml)

Real-time collision warnings for pedestrians, cyclists and drivers. Phones share live GPS position with a small
backend; the backend predicts whether two people are on a collision course and pushes a graded alert
(`NONE`, `LOW`, `MODERATE`, `HIGH`, `CRITICAL`) back to the phones a few seconds before the conflict.

The risk model is deterministic and explainable: closest-point-of-approach geometry, no machine learning.
Every alert can be traced to concrete numbers (time to closest approach, predicted miss distance, closing speed).

## Demo

Two simulated pedestrians start about 40 m apart on the same line and walk toward each other at 1.4 m/s.
This is the live dashboard (`http://<computer-ip>:8080/`) at the moment the alert reaches `HIGH`:

![Live dashboard showing two pedestrians closing on each other, risk 0.857, alert level HIGH](docs/dashboard-high.png)

The `raw` column is the model's instantaneous output, and `shown` is the alert after a two-tick confirmation filter, so
one noisy GPS reading cannot fire an alert. `P`, `U` and `S` are the proximity, urgency and severity terms of the risk.

Backend log from the same run (real output, timestamps trimmed):

```
+ phone-A (pedestrian) joined. Devices online: 1
+ phone-B (pedestrian) joined. Devices online: 2
RISK phone-A <-> phone-B  NONE -> LOW        risk=0.26 tcpa=7.9s miss=0.0m closing=2.8m/s dist=22.0m reason=approaching
RISK phone-A <-> phone-B  LOW -> MODERATE    risk=0.50 tcpa=5.9s miss=0.0m closing=2.8m/s dist=16.4m reason=approaching
RISK phone-A <-> phone-B  MODERATE -> HIGH   risk=0.74 tcpa=3.9s miss=0.0m closing=2.8m/s dist=10.8m reason=approaching
RISK phone-A <-> phone-B  HIGH -> CRITICAL   risk=0.97 tcpa=1.9s miss=0.0m closing=2.8m/s dist=5.2m  reason=approaching
RISK phone-A <-> phone-B  CRITICAL -> NONE   risk=0.00 tcpa=-1.1s miss=3.1m closing=-2.8m/s dist=3.1m reason=diverging
```

Once the pair has passed, the closing speed turns negative, the pair is `diverging`, and the alert clears.

## How it works

```
Phone A --position, 1 Hz--+                         +--status, 1 Hz--> Phone A
                          +--> Backend (WebSocket) -+
Phone B --position, 1 Hz--+       |                 +--status, 1 Hz--> Phone B
                                  | every second:
                                  | 1. project each device forward to "now" (dead reckoning)
                                  | 2. run riskModel.assess() on every pair
                                  | 3. debounce, then send each phone its top threat
Browser --observe--> live dashboard (tables + map)
```

- **Clients send, the server decides.** Phones only report their own state. The server holds the one copy of the risk
  logic, so it is tested once, and every alert is logged in one place for later threshold tuning.
- **One-second tick.** Each tick the server projects every device to the current instant, so a phone whose last fix
  is 800 ms old is not compared against a phone whose fix is fresh.
- **Privacy by default.** The server only tells a phone about peers within 500 m, and it logs coordinates only when you
  start it with `VERBOSE=1`.

### Messages

Phone to server, once per second (even when standing still, so the server knows the phone is alive):

```json
{"type":"position","deviceId":"dev-k3x9fa","role":"pedestrian","lat":40.4237,"lon":-86.9212,
 "speed":1.4,"heading":92,"accuracy":4.8,"fixAgeMs":310}
```

Server to phone, once per second:

```json
{"type":"status","level":"HIGH","stale":false,"profile":"walktest",
 "threat":{"peerId":"dev-q8m2zz","peerRole":"pedestrian","level":"HIGH","risk":0.707,"tcpaS":4.2,
           "missM":0.0,"closingMps":2.8,"distanceM":11.7,"bearingDeg":90},
 "peers":[{"id":"dev-q8m2zz","role":"pedestrian","lat":40.4237,"lon":-86.9211,"speed":1.4,
           "heading":270,"level":"HIGH","distM":11.7}]}
```

The server validates every field (types, ranges, id format, 4 KB message cap) and rejects bad messages with an `error`
reply.

## The risk model

Implemented in [`backend/riskModel.js`](backend/riskModel.js). For a pair of devices, in local meters, let `r` be the
relative position and `v` the relative velocity (velocity is speed and heading as an east/north vector).

```
approaching:  r . v < 0           otherwise risk = 0 (diverging, or no relative motion)
t*  = -(r . v) / |v|^2            time of closest approach (capped at 15 s)
miss = | r + v * t* |             predicted minimum separation
D0  = contact radii + sqrt(sigmaA^2 + sigmaB^2)      sigma = each phone's reported GPS accuracy

P = exp( -(miss / D0)^2 )                       proximity: will they actually meet, given GPS error?
U = clamp( (10 - t*) / (10 - 2), 0, 1 )         urgency: 0 beyond 10 s out, 1 at 2 s or less
S = W[pair] * ( 1 - exp( -(|v| / V0)^2 ) )      severity: faster and more vulnerable pairs score higher

risk = P * U * S
```

| Level | Risk at or above | Device behavior |
|---|---|---|
| LOW | 0.10 | shown on the map only |
| MODERATE | 0.25 | banner |
| HIGH | 0.50 | banner and vibration |
| CRITICAL | 0.75 | banner and stronger vibration |

**Why a product, not a sum.** A pair is only dangerous if all three hold: they will actually come close (`P`), soon
enough that it matters (`U`), and fast or vulnerable enough to be harmful (`S`). Any one of them near zero drives
the risk to zero, so distance and speed interact instead of being added.

**Quantities used and not used.** Relative velocity, CPA distance and TCPA carry the model. Closing speed is reported for
display. Path-intersection is not scored because CPA already captures it: two paths that cross at different times
have a large predicted miss distance. Heading is not a separate term because it already shapes the relative velocity
(counting it twice would double-weight it).

Other rules:

- Speeds under 0.5 m/s, or an unknown heading, are treated as stationary, since GPS course is unreliable at low speed.
- Pairs where either GPS accuracy is worse than 30 m are not evaluated.
- Driver-to-driver pairs are skipped, because without road geometry opposing lanes look like a head-on approach.
- Alert levels use hysteresis: a pair must stay at a higher (or lower) level for 2 ticks before the shown level changes.

### Two risk profiles

| Profile | Severity scale | Use |
|---|---|---|
| `walktest` (default) | saturates at walking speed (1.5 m/s) | field tests where two people on foot stand in for a cyclist or car |
| `real` | saturates at 5 m/s, pair weights from 0.4 (two walkers) to 1.0 (car and pedestrian) | the physically motivated setting; two walkers never exceed LOW |

Choose with `RISK_PROFILE=real` (or `npm run start:real`). The geometry and thresholds are identical in both.

### Behaviors covered by unit tests

`cd backend && npm test` runs 11 tests, including: head-on walkers escalate as the gap closes; moving apart is never a
risk; same-velocity side-by-side is never a risk; a wide opposite-direction pass is safe while a narrow one is not;
crossing at very different times stays low while crossing at the same time is elevated; a stationary person approached
head-on is elevated but not critical; low speed and unknown heading are treated as stationary; in the `real` profile two
walkers never exceed LOW while a pedestrian and a car reach HIGH; driver pairs and poor GPS are excluded; risk is
symmetric in A and B; dead-reckoning moves a device the right distance.

## Quick start

Developed and tested on Node.js 22. There are no other dependencies and no environment variables you must set.

```bash
git clone https://github.com/rdas25/safety-alert-system.git
cd safety-alert-system

# 1. Backend (terminal 1). Prints the address to use on phones.
cd backend && npm install && npm test && npm start

# 2. Two simulated phones (terminals 2 and 3), 40 m apart, walking toward each other
cd simulation && npm install
node simulated_agent.mjs phone-A pedestrian 40.4237 -86.9212 90 1.4
node simulated_agent.mjs phone-B pedestrian 40.4237 -86.920728 270 1.4
```

Open `http://localhost:8080/` to watch the dashboard. Within about 15 seconds the pair walks through
`LOW`, `MODERATE`, `HIGH` and `CRITICAL`, then clears.

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | backend port |
| `RISK_PROFILE` | `walktest` | `real` for physical severity |
| `VERBOSE` | off | `1` logs every position and pair each second (includes coordinates) |
| `SERVER_URL` | `ws://localhost:8080` | simulator target (`simulation/` scripts) |
| `NOISE_M` | `0` | simulator GPS jitter in meters |

`GET /health` returns `{"ok":true,...}` and is the quickest check that a phone can reach the server.

### Simulator

```bash
cd simulation
# a fake phone: <deviceId> <role> <startLat> <startLon> <headingDeg> <speedMps>
SERVER_URL=ws://<computer-ip>:8080 NOISE_M=3 node simulated_agent.mjs ped-1 pedestrian 40.4237 -86.9212 90 1.4

# a "ghost" that approaches a real phone's coordinates:
# <phoneLat> <phoneLon> [speed=6] [distance=90] [bearing=random] [missM=0] [role=driver]
node ghost_car.mjs 40.4237 -86.9212 6 90 45 0
```

## Mobile app

Expo / React Native app in [`mobile/`](mobile/). On the setup screen you enter the server address, pick a role
(pedestrian, cyclist or driver) and tap Start. Each launch gets a random device id. The app then shows the map, the
server's alert level as a colored banner ("Pedestrian 12 m to the E. Closest approach in 4 s"), and a debug panel with
GPS accuracy, speed, heading, connection state and the top threat's numbers. It reconnects automatically if the
connection drops, and vibrates when the level first rises to HIGH or CRITICAL.

```bash
cd mobile && npm install
# optional: set DEFAULT_SERVER in mobile/config.js to your computer's address, e.g. '192.168.1.50:8080'
npx expo prebuild --platform ios
npx expo run:ios --device --configuration Release
```

`react-native-maps` needs native code, so Expo Go is not enough on iOS; this builds a development build with a free Apple ID
(it expires after 7 days). The phone cannot use `localhost` (that means the phone itself), so use the computer's
LAN address printed when the backend starts. The phones and the computer must be on the same network; a phone's
Personal Hotspot works when campus Wi-Fi blocks device-to-device traffic.

**Status of the mobile app:** the code is written to the same message protocol the simulator uses, which is verified.
A field test with two physical phones has not been run yet, so real-device GPS speed and heading behavior is unmeasured.

### Field test (two people, two phones)

1. Start the backend and open the dashboard. Both phones: same network, role Pedestrian, Start, and wait for GPS accuracy under 10 m.
2. Stand about 40 m apart on a straight, open path facing each other, then both walk toward each other at a normal pace.
3. Expected: `LOW` at roughly 25 m apart, `MODERATE` at 20 m, `HIGH` at 15 m, `CRITICAL` at 8 m (plus or minus 5 m, since
   GPS is noisy and levels need two ticks to confirm). The levels fall back to `NONE` after you pass.
4. Negative checks: walk away from each other (stays `NONE`), walk side by side (stays `NONE`), pass on parallel paths
   20 m apart (stays `NONE`), one person stands still (elevated, never `CRITICAL`).

## Project structure

```
safety-alert-system/
├── backend/
│   ├── server.js            WebSocket + HTTP server, 1 Hz evaluation loop, alert debouncing
│   ├── riskModel.js         the risk model (pure functions, no I/O)
│   ├── public/dashboard.html  live debug dashboard
│   └── test/riskModel.test.js unit tests (node:test)
├── mobile/                  Expo app: setup screen, map, alert banner, vibration, auto-reconnect
├── simulation/              fake phones and a ghost-car launcher that use the real backend
├── docs/dashboard-high.png  screenshot used above
└── .github/workflows/test.yml  runs the backend tests on every push
```

## Troubleshooting

| Symptom | Check |
|---|---|
| Phone shows `reconnecting` | open `http://<computer-ip>:8080/health` in the phone's browser; if it fails it is the network (wrong IP, different Wi-Fi, client isolation, firewall prompt not allowed) |
| Connected, but no alert | on the dashboard's Pairs table read `reason`: `diverging`, `no_relative_motion` and `poor_gps` explain most silence; also check that TCPA is under 10 s and the profile is `walktest` |
| Alerts too eager | look at GPS accuracy (above about 15 m widens the alert region) and at `raw` versus `shown` |
| Speed or heading shows `n/a` | iOS reports course only while moving; walk 20 m in a straight line, and check Precise Location is on |
| Port in use | `lsof -i :8080`, or run with `PORT=8081 npm start` |
