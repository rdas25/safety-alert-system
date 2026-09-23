# Pedestrian/Cyclist Safety Alert App

A phone-based real-time collision risk alert system for pedestrians, cyclists, and drivers.

## Project structure

```
pedestrian-safety-app/
  algorithm/          <- DONE: core collision-risk math (Python, no dependencies)
    collision_risk.py
  backend/            <- TODO: real-time position-sharing server
  mobile/             <- TODO: React Native client app
```

## Phase 1: Algorithm (done — start here)

Run it yourself to see it work:

```bash
cd algorithm
python3 collision_risk.py
```

You should see 4 test cases print out, with risk levels matching the
comment above each one. Read through `collision_risk.py` top to bottom —
it's fully commented — before moving on. Try adding a 5th test case of
your own (e.g., a cyclist and pedestrian both stationary) to make sure
you understand what every parameter does.

**Known limitation to think about:** this assumes constant velocity —
nobody turns or stops. That's fine for a v1 (it still catches most real
danger scenarios), but it's worth understanding as a limitation you can
mention in interviews, and something you could improve later (e.g. by
re-running the calculation every time a new GPS ping arrives instead of
only once).

## Phase 2: Backend (next)

Goal: a server that (1) accepts position updates from clients, (2) finds
nearby devices, (3) runs `assess_risk()` on each nearby pair, (4) sends
alerts back to at-risk devices.

Recommended path — Node.js + Socket.IO, since WebSockets fit "real-time
push" much better than repeated polling:

```bash
mkdir backend && cd backend
npm init -y
npm install express socket.io
```

Minimal shape to build toward:
- Client connects via WebSocket, sends `{deviceId, lat, lon, heading, speed}` every ~1-2 seconds
- Server keeps an in-memory map of `deviceId -> latest state`
- On each update, server checks the updating device against all *other*
  currently-connected devices within a rough distance cutoff (don't
  bother running CPA math against devices miles away)
- If `assess_risk()` returns MODERATE or HIGH for a pair, push an alert
  event to both devices in that pair

Port the `collision_risk.py` logic to JavaScript once you get here (or
keep it in Python and call it via a small internal API — either is a
reasonable choice, and reviewers like seeing you make and justify that
kind of tradeoff).

## Phase 3: Mobile client (after backend)

React Native, using:
- `react-native-maps` for the map view
- `expo-location` (if using Expo) for GPS access
- `socket.io-client` to talk to your backend

Start with Expo (`npx create-expo-app mobile`) rather than bare React
Native — it handles a lot of native-build complexity you don't need to
deal with yet, and you can "eject" later if you ever need something
Expo doesn't support.
