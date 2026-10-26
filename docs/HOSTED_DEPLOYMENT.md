# Hosted deployment — October 26, 2026

- Backend: https://safety-alert-system.onrender.com
- Public health: https://safety-alert-system.onrender.com/health
- Render: https://dashboard.render.com/web/srv-dbfm0hfb9u1s73deok8g
- Workspace: My Workspace; region: Ohio; compute plan: free.
- Source: public GitHub repository, main. PR #1 was merged as 9681dd41c19c12d335879b7303a191f10357d01a.
- First deploy dep-dbfm0i7b9u1s73deom80 reached live. Node.js 22; NODE_ENV=production; LOG_POSITIONS=0; walktest profile.

The service was created directly through Render, not as a Blueprint-managed resource. Repository root is used,
with build `npm ci --prefix backend` and start `node backend/server.js`; these target the backend folder.
The committed render.yaml is a reproducible alternative, not a second service to create alongside this one.
Render currently uses default TCP readiness checks. The application /health endpoint was checked separately.

Verified on the hosted service: health returned 200/ok; dashboard and logs returned 401 without a token;
wrong dashboard token returned 401; correct dashboard token returned 200; authorized observer received snapshots;
synthetic head-on clients reached HIGH/CRITICAL; a 25 m wide pass stayed NONE; test devices were removed afterward.
These tests used fictional coordinates and a Node.js client, not physical phones or cellular connectivity.
The initial unauthorized observer close-code probe timed out through the hosted path. The server now also sends
an explicit unauthorized error before closing, so clients can verify refusal independently of close-frame delivery.
Use the current deployment verification report for the latest retest; do not treat that initial timeout as a pass.

## Dashboard access

Retrieve ADMIN_TOKEN privately from the Render service's Environment tab. Open the backend with `?token=<value>`.
Do not put the actual value into GitHub, this document, screenshots, recordings or shared chat. Query tokens may
appear in browser history and infrastructure logs. The token was generated for this service and kept out of source.

## Phone setup

Enter `safety-alert-system.onrender.com` in the app; the URL helper uses WSS for public hostnames. Native iPhone
installation, actual permission prompts, GPS and haptics still require physical verification. Native simulator
Release compilation succeeded, but no phone behavior is inferred from that build.

## Limits

Location recording is disabled. Phone connections are unauthenticated; controlled consenting tests only.
Free instances sleep after inactivity and use ephemeral storage. Current platform details:
https://render.com/docs/free and https://render.com/docs/deploys.
A live URL does not establish real-world detection accuracy, field warning time or calibrated thresholds.
