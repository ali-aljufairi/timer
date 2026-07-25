# Sync Timer

A lightweight shared stopwatch that stays synchronized across browsers and devices in real time.

## Features

- Same-origin Socket.IO synchronization over WebSocket or HTTP polling
- Unpredictable 128-bit room capability links; possessing the link grants room access
- Server-enforced room membership for every timer mutation
- One active room per connection with correct switching and disconnect cleanup
- Bounded rooms, connections, and event rates for public operation
- Graceful SIGTERM handling closes active Socket.IO clients before exit
- Start, pause, reset, rewind, and fast-forward controls
- Live participant count and connection state
- Responsive, accessible, self-contained interface
- No accounts or database; inactive rooms are removed from memory
- Hardened non-root container and SIN k3s deployment contract
- Health endpoint at `/healthz`

## Run locally

Requires Node.js 20 or newer.

```bash
npm ci
npm test
npm start
```

The app listens on `http://localhost:3000`. Override it with `PORT=4000 npm start`.

## Container

```bash
docker compose up --build -d
curl http://127.0.0.1:3000/healthz
```

Compose publishes only to loopback and is intended for local packaging verification, not production orchestration.

## SIN k3s deployment

`k8s/sin.yaml` is the production contract for `timer.aljufairi.org`. It defines:

- exactly one replica with a `Recreate` rollout because room state is process-local;
- `/healthz` readiness and liveness probes;
- CPU/memory requests and limits;
- non-root, read-only, capability-free runtime with no service-account token;
- a ClusterIP Service and Traefik Ingress with same-origin `/socket.io/` WebSocket upgrades;
- Cloudflare DNS-01 TLS through the existing `cloudflare-issuer`;
- Traefik connection-rate and security-header middleware;
- a NetworkPolicy permitting inbound application traffic only from Traefik in `kube-system`.

Build and transfer the immutable image to the single-node cluster, then apply the manifest:

```bash
docker build --pull -t sync-timer:1.0.0 .
docker save sync-timer:1.0.0 | ssh root@sin 'k3s ctr images import -'
ssh root@sin 'k3s kubectl apply -f -' < k8s/sin.yaml
ssh root@sin 'k3s kubectl -n timer rollout status deployment/sync-timer --timeout=120s'
```

The public Cloudflare DNS record must proxy `timer.aljufairi.org` to SIN before certificate issuance and external verification.

## Runtime limits

- `MAX_ACTIVE_ROOMS` — active in-memory rooms, default `250`
- `MAX_CONNECTIONS` — simultaneous Socket.IO connections, default `500`
- control events — 30 per connection per 10 seconds
- room changes — 8 per connection per minute

Timers are intentionally ephemeral. Restarting or rescheduling the one replica clears all rooms. Empty rooms are garbage-collected after approximately five minutes.

## Architecture

- `public/` — responsive browser interface
- `routes/timer.js` — capability-token room lookup and validation
- `middleware/socket.js` — membership authorization, lifecycle, and event-rate enforcement
- `models/Timer.js` — stopwatch state and elapsed-time logic
- `models/RoomManager.js` — bounded in-memory rooms and participant cleanup
- `k8s/sin.yaml` — production k3s, Traefik, TLS, and policy resources

## License

Copyright © Ali Aljufairi. All rights reserved.
