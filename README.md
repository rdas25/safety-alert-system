# Safety Alert System

Phones share live GPS position with a small backend. The backend predicts whether two users are
on a collision course and pushes an alert level (NONE, LOW, MODERATE, HIGH, CRITICAL) back to the phones.

## How it works

```
Phone A --position, 1 Hz--> Backend (WebSocket) --> risk model (backend/riskModel.js)
Phone B --position, 1 Hz-->                     <-- status (alert level, threat, peers), 1 Hz
```

- `mobile/`: Expo app. Sends GPS fix (lat, lon, speed, heading, accuracy), shows the server's alert level.
- `backend/`: Node + `ws`. Keeps the latest position per device, runs the risk model on every pair once per second.
  Serves a live debug page at `http://<computer-ip>:8080/`.
- `simulation/`: fake phones (`simulated_agent.mjs`) and a ghost-car launcher (`ghost_car.mjs`) that use the real backend.
- `collision-risk/collision_risk.py`: legacy v1 reference (distance-threshold model). Not used at runtime and no longer matches the backend.

## Risk model (backend/riskModel.js)

Per pair, in local meters: `r` = relative position, `v` = relative velocity.

- Approaching only if `r.v < 0`; otherwise risk is 0 (moving apart / same velocity).
- `t* = -(r.v)/|v|^2` (time to closest approach), `miss = |r + v*min(t*, 15)|`
- `P = exp(-(miss/D0)^2)`, `D0 = contact radii + sqrt(sigmaA^2 + sigmaB^2)` (sigma = GPS accuracy)
- `U = clamp((10 - t*)/(10 - 2), 0, 1)`
- `S = W_pair * (1 - exp(-(|v|/V0)^2))`
- `risk = P * U * S`; LOW >= 0.10, MODERATE >= 0.25, HIGH >= 0.50, CRITICAL >= 0.75.

Profiles: `walktest` (default; severity saturates at walking speed so two people on foot can reach CRITICAL)
and `real` (physical severity; two walkers never exceed LOW). Choose with `RISK_PROFILE`.

## Run it

```bash
# backend (terminal 1)
cd backend && npm install && npm start        # prints the address to type into the phones
npm test                                       # unit tests

# simulated phones (terminals 2 and 3), from simulation/
cd simulation && npm install
SERVER_URL=ws://localhost:8080 node simulated_agent.mjs phone-A pedestrian 40.4237 -86.9212 90 1.4
SERVER_URL=ws://localhost:8080 node simulated_agent.mjs phone-B pedestrian 40.4237 -86.920728 270 1.4

# mobile app: edit DEFAULT_SERVER in mobile/config.js, then
cd mobile && npm install && npx expo prebuild --platform ios && npx expo run:ios --device --configuration Release
```

Open `http://localhost:8080/` for the live dashboard. Both phones must be on the same network as the computer.

## Status

Working: GPS to server, per-pair risk, alerts back to phones, simulation, unit tests.
Not built yet: authentication, TLS, persistence, background location, road-aware logic.
