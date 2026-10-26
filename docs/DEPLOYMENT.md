# Deployment runbook (not a deployment claim)

1. Push/review these changes and confirm GitHub Actions passes on the branch that will deploy.
2. With the Render account owner, create a Blueprint from `render.yaml`. Review plan, billing,
   region and location-data exposure before approving creation. `rootDir` is `backend`.
3. Copy the generated `ADMIN_TOKEN` privately from Environment. Do not commit it or put it in screenshots.
4. Verify `/health` returns `ok: true`. `/` and `/logs` must return 401 without a token or with a wrong token.
5. Open `https://<service>.onrender.com/?token=<ADMIN_TOKEN>` privately. The browser must connect over WSS.
   Tokens in URLs can appear in browser history and infrastructure logs; clear history and rotate if exposed.
6. Type the public hostname into the phone setup screen; bare public hostnames use WSS.
   Rebuild if native dependencies or permissions changed. Run the ghost car with
   `SERVER_URL=wss://<service>.onrender.com` and verify actual phone behavior.
7. Repeat one controlled two-phone scenario, ideally with one phone on cellular. Record results and connection gaps.

Recording: set `LOG_POSITIONS=1` for an agreed test window. `/logs?token=...` lists available names;
`/logs/session-<timestamp>.jsonl?token=...` downloads a file. End the test and allow a tick before downloading;
a live file may still grow, so stop sending positions and compare the saved data with your notes.
Default Render storage is ephemeral; download before restart/redeploy. Check current Render plan behavior and
sleep limits in the account before test day. No persistent disk, retention service, or deployment is claimed here.

Local token-protected trial:

```bash
cd backend
ADMIN_TOKEN=<private-value> LOG_POSITIONS=1 npm start
```

Do not put literal private values in shared command history. Production startup requires `ADMIN_TOKEN`.
The token protects dashboard/observer/log access, not phone connections. A join-code/authentication system
and rate limits remain future hardening before an open public pilot.
