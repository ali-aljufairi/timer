# Timer (Socket.IO Sync Timer)

A small Express + Socket.IO server that hosts **shared timers** ("rooms") and broadcasts the current time to everyone connected to the same timer id.

This is useful when you want multiple clients (browser tabs, devices, etc.) to see the **same running timer** in real time.

## How it works

- The server keeps timers in memory (no database).
- Clients join a timer room by id via Socket.IO (`set up`).
- When a timer is running, the server broadcasts `update timer` events to that room.
- If everyone leaves a timer, it is garbage-collected after ~5 minutes.

## Requirements

- Node.js (npm)

## Install

```bash
npm install
```

## Run

```bash
# default port is 80
npm start

# or override the port
PORT=4000 npm start
```

You should see:

```
🕒  Sync Timer listening on port <PORT>
```

## HTTP API

Base URL: `http://localhost:<PORT>`

### Create a new timer id

`GET /timer/new`

- Creates a new timer id and redirects to `/timer/:id`.

### Validate / fetch a timer id

`GET /timer/:id`

- If the id exists: returns JSON

```json
{ "timerId": "<id>" }
```

- If the id does not exist: redirects to `/timer/404`.

## Socket.IO API

Socket server is attached to the same HTTP server.

### Connect + join a timer

Client emits:

- `set up` (payload: `timerId`)

Server responses/events:

- `done set up` → `{ timerId }`
- `new user joining` → `{ clientId }` (broadcast to the room)
- `update timer` → `{ hours, minutes, seconds }`
- `timer started`
- `timer stopped`
- `timer error`

### Timer controls

Client emits (payload: `timerId`):

- `start timer`
- `stop timer`
- `reset timer`
- `rewind timer` (rewinds by 5 seconds)
- `fastforward timer` (forwards by 5 seconds)
- `get time`

## Demo client

There is a simple demo page in `timer.html`.

To use it locally:

1. Start the server (example uses port 4000):
   ```bash
   PORT=4000 npm start
   ```
2. Edit `timer.html` and change the socket URL:
   - from: `ws://15.184.79.6:4000`
   - to: `ws://localhost:4000`
3. Set a timer id (example: `match1`) or create one via `GET /timer/new`.
4. Open `timer.html` in multiple tabs/devices and press **Start** — they should stay in sync.

## Notes / current behavior

- The timer ticks every ~200ms.
- The timer **auto-stops after ~5 minutes** (see `models/Timer.js`).
- Timers are stored in memory only; restarting the server clears them.

## Project structure

- `app.js` → entry point
- `bin/server.js` → Express + Socket.IO server
- `routes/timer.js` → HTTP endpoints (`/timer/*`)
- `middleware/socket.js` → Socket.IO event handlers
- `models/Timer.js` → timer logic
- `models/RoomManager.js` → manages timers + connected clients

## License

No license specified yet. If you plan to share/redistribute this project, add a license (MIT/Apache-2.0/etc.).
