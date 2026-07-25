# Sync Timer

A polished, lightweight shared stopwatch that stays synchronized across browsers and devices in real time.

## Features

- Same-origin Socket.IO synchronization
- Shareable room URLs
- Start, pause, reset, rewind, and fast-forward controls
- Live participant count and connection state
- Responsive, accessible interface
- No accounts or database; inactive rooms are removed from memory
- Hardened non-root Docker deployment
- Health endpoint at `/healthz`

## Run locally

Requires Node.js 20 or newer.

```bash
npm ci
npm test
npm start
```

The app listens on `http://localhost:3000`. Override it with `PORT=4000 npm start`.

## Docker

```bash
docker compose up --build -d
curl http://127.0.0.1:3000/healthz
```

The Compose service publishes only to loopback so a reverse proxy can terminate HTTPS safely.

## Architecture

- `public/` — responsive browser interface
- `routes/timer.js` — timer lookup and room creation endpoints
- `middleware/socket.js` — validated Socket.IO room events
- `models/Timer.js` — stopwatch state and elapsed-time logic
- `models/RoomManager.js` — in-memory rooms and participant cleanup

Timers are ephemeral. Restarting the process clears them, and rooms with no participants are garbage-collected after approximately five minutes.

## License

Copyright © Ali Aljufairi. All rights reserved.
