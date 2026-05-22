# TANKS ONLINE

A 90s-style 2-player tank duel for the web. Pixel art à la *Battle City*, CRT
overlay, virtual joystick for phones, WASD/Arrows for desktop. Built on a
**server-authoritative** Socket.io game loop so neither client can cheat.

```
┌──────────────────────┐         WS         ┌────────────────────────┐
│  React 19 + Canvas   │  ←── state @30Hz ──│   NestJS v11 Gateway   │
│  (Vite dev server)   │  ── input @30Hz ──→│   GameRoom (sim @30Hz) │
└──────────────────────┘                    └────────────────────────┘
```

| Layer       | Stack                                           |
| ----------- | ----------------------------------------------- |
| Frontend    | React 19, Vite 6, HTML5 Canvas API, vanilla CSS |
| Backend     | NestJS 11, `@nestjs/websockets`, Socket.io 4    |
| Real-time   | One persistent `socket.io` channel per room     |
| Aesthetic   | 8-bit palette, scanlines, RGB sub-pixel mask    |

---

## 1. Quick start

```bash
# install workspaces (server + client)
npm install

# run both dev servers concurrently (server on :3001, client on :5173)
npm run dev

# or run them individually
npm run dev:server
npm run dev:client

# production build
npm run build

# quick socket smoke test (server must be running)
node scripts/smoke.mjs
```

Open <http://localhost:5173> in two browser tabs (or two devices on the same
LAN). Create a room in one, copy the 4-letter code, join from the other, both
ready up, host hits **START**.

Controls:

* **Desktop**: `W A S D` or `↑ ↓ ← →` to move, `Space` / `J` to fire.
* **Mobile**: virtual joystick (bottom-left), red **FIRE** button (bottom-right).

---

## 2. Repository layout

```
tanks-online/
├── package.json            # npm workspaces root
├── server/                 # NestJS 11 + Socket.io
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       └── game/
│           ├── game.module.ts
│           ├── game.gateway.ts   # @WebSocketGateway — routes events to rooms
│           ├── room.ts           # GameRoom: authoritative simulation
│           ├── map.ts            # default tile map + tile helpers
│           ├── physics.ts        # AABB / map collision helpers
│           ├── constants.ts      # tile size, tick rate, bonus durations…
│           ├── types.ts          # wire types shared with client
│           └── util.ts           # room code + RNG helpers
└── client/                 # React 19 + Vite + Canvas
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── styles.css            # CRT scanlines + 90s HUD
        ├── components/
        │   ├── CRTFrame.tsx
        │   ├── Lobby.tsx         # create / join / ready
        │   ├── GameScreen.tsx    # canvas + game loop
        │   ├── HUD.tsx
        │   └── VirtualJoystick.tsx
        └── game/
            ├── constants.ts      # mirrors server constants
            ├── types.ts          # mirrors server types
            ├── socket.ts         # singleton socket.io client
            ├── input.ts          # keyboard + joystick aggregator
            └── render.ts         # canvas pixel-art renderer
```

The two `types.ts` files are kept in sync by hand — small enough that a build
step isn't worth the complexity.

---

## 3. Step-by-step implementation guide

### 3.1 Bootstrap the workspaces

```bash
mkdir tanks-online && cd $_
npm init -y
# Edit package.json to add the "workspaces": ["client", "server"] field.

mkdir -p server/src/game client/src
```

### 3.2 Server — NestJS scaffolding

1. `cd server && npm init -y`
2. Install runtime + dev deps: `@nestjs/{common,core,platform-express,platform-socket.io,websockets} socket.io reflect-metadata rxjs`
   and dev `@nestjs/{cli,schematics} typescript @types/node ts-node ts-loader`.
3. Create `tsconfig.json`, `nest-cli.json`, `src/main.ts`, `src/app.module.ts`.
4. Add `src/game/game.module.ts` and register it in `AppModule`.

### 3.3 Server — game model

Create a single class `GameRoom` that owns the state of one match. The gateway
should be a *thin shell* that:

* keeps a `Map<roomCode, GameRoom>`;
* keeps a `Map<socketId, roomCode>` so each connection can be routed in O(1);
* forwards events to the appropriate room;
* exposes a `RoomCallbacks` interface so the room can broadcast without
  importing Socket.io directly (makes the room unit-testable).

The room exposes:

```ts
class GameRoom {
  addPlayer(socketId, name): { ok: true } | { ok: false; error: string };
  removePlayer(socketId): void;
  setReady(socketId, ready: boolean): void;
  startGame(socketId): { ok: boolean; error?: string };
  applyInput(socketId, input: PlayerInput): void;
}
```

Internally it runs a `setInterval` at **30Hz**. Each tick:

1. Apply latest input → resolve tank movement (AABB vs map + other tanks).
2. Move bullets, resolve bullet-vs-map (destroys brick, stops on steel) and
   bullet-vs-tank.
3. Update plane (spawn / move / drop crate).
4. Resolve airdrop pickups.
5. Check win condition (score ≥ 5 or last tank standing).
6. Broadcast `state` snapshot to everyone in the room.

### 3.4 Client — Vite + React 19 + Canvas

1. `cd client && npm init -y`, install `react react-dom socket.io-client vite @vitejs/plugin-react`.
2. Configure Vite to proxy `/socket.io` to `http://localhost:3001` so the
   browser connects same-origin in dev.
3. `App.tsx` is a state machine: `menu → lobby → playing → ended`.
4. `GameScreen.tsx` is where the magic happens:
    * `useRef<HTMLCanvasElement>` for the canvas;
    * `useEffect` to install a `requestAnimationFrame` loop;
    * Hold the latest two server snapshots and **interpolate** at render time
      (the canonical fix for 30 Hz feeling choppy at 60 fps).
5. `InputController` aggregates keyboard + joystick. A separate `setInterval`
   at 30 Hz emits `input` events to the server.

### 3.5 Pixel-perfect canvas scaling

```ts
canvas.width  = WORLD_WIDTH  * RENDER_SCALE;   // 416 * 2 = 832
canvas.height = WORLD_HEIGHT * RENDER_SCALE;
ctx.imageSmoothingEnabled = false;
ctx.scale(RENDER_SCALE, RENDER_SCALE);          // we then draw at world units
```

The CSS keeps the canvas at its aspect ratio (`aspect-ratio: 1`) and lets it
fill the available width/height, so the same code looks crisp on any device.

### 3.6 CRT effect (vanilla CSS)

Three layered overlays inside the `.crt-inner` container:

* **Scanlines** — `repeating-linear-gradient` of dark stripes with
  `mix-blend-mode: multiply`.
* **Sub-pixel mask** — vertical `background-size: 3px 100%` RGB gradient with
  `mix-blend-mode: screen` for a slight chromatic shimmer.
* **Vignette** — radial gradient to darken the corners.

No images, no shaders — fully vector & GPU-friendly.

---

## 4. Socket.io architecture & server authority

### 4.1 Event catalogue

Client → Server:

| Event           | Payload                                  | Notes                       |
| --------------- | ---------------------------------------- | --------------------------- |
| `lobby:create`  | `{ name }` (ack: `{ code }`)             | Generates a 4-letter code   |
| `lobby:join`    | `{ code, name }` (ack: `{ code }`)       | Rejects if room full / busy |
| `lobby:leave`   | —                                        |                             |
| `lobby:ready`   | `{ ready: boolean }`                     |                             |
| `lobby:start`   | —                                        | Host-only                   |
| `input`         | `{ seq, up, down, left, right, fire }`   | Send at 30 Hz               |

Server → Client:

| Event                  | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `lobby:state`          | Full lobby snapshot (players, ready flags, code)       |
| `game:start`           | Initial map + spawn snapshot + `you` (your socket id)  |
| `state`                | 30 Hz authoritative snapshot of the world              |
| `event:bullet_fired`   | One-shot for SFX / muzzle flash                        |
| `event:plane_spawn`    | Plane entering the screen                              |
| `event:airdrop_spawn`  | Crate created                                          |
| `event:pickup`         | Tank collected a bonus                                 |
| `event:player_hit`     | A tank took a hit                                      |
| `event:wall_destroyed` | A brick tile turned `empty`                            |
| `game:end`             | Match over (`winnerId` or `null`)                      |
| `error`                | Human-readable error                                   |

### 4.2 Server authority & latency handling

* **Single source of truth.** The server simulates the world at 30 Hz. The
  client never decides whether a bullet hit, whether a wall broke, or whether
  it picked up a bonus — it only renders what the server reports.
* **Input is *intent*, not result.** The client sends "which buttons are
  pressed". The server decides what that does given the current map state.
  This is what prevents speed-hack / no-clip cheats: a malicious client could
  spam `right: true` forever, but the server still resolves AABB collisions.
* **Sequence numbers.** Each `input` carries a monotonically increasing `seq`.
  Out-of-order packets are naturally tolerated because the server only keeps
  the latest input snapshot.
* **Interpolation buffer.** The client keeps the previous + current server
  snapshot and renders 1 tick (~33 ms) in the past so motion is always
  smoothly tweened between two known positions. This trades a few ms of
  latency for buttery 60 fps movement.
* **One-shot events.** Discrete events (`bullet_fired`, `pickup`, …) are sent
  outside the snapshot stream so the UI can play SFX/animations even if a
  snapshot is lost — the simulation will recover from the next snapshot
  anyway.

### 4.3 NestJS gateway code (excerpt)

```ts
@WebSocketGateway({ cors: { origin: '*' }, transports: ['websocket', 'polling'] })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server<ClientToServerEvents, ServerToClientEvents>;

  @SubscribeMessage('lobby:create')
  onCreate(@ConnectedSocket() client: Socket, @MessageBody() { name }: { name: string }) {
    const room = this.createRoom();
    const res = room.addPlayer(client.id, name);
    if (!res.ok) return res;
    client.join(room.code);
    this.socketRoom.set(client.id, room.code);
    return { ok: true, data: { code: room.code } };
  }

  @SubscribeMessage('input')
  onInput(@ConnectedSocket() client: Socket, @MessageBody() input: PlayerInput) {
    this.roomFor(client.id)?.applyInput(client.id, input);
  }
}
```

The return value of a handler is automatically delivered as the Socket.io ack
callback to the client, which is how the client knows whether `lobby:join`
succeeded.

---

## 5. The Plane / Air-Drop system

`GameRoom` schedules the next plane between `PLANE_MIN_INTERVAL_MS` and
`PLANE_MAX_INTERVAL_MS` (default 20–35 s). On spawn:

1. Pick a random `y` and a horizontal direction.
2. Pick a random `dropX` in the middle 50 % of the world.
3. Each tick, advance the plane by `PLANE_SPEED * dt`.
4. When the plane crosses `dropX`, spawn an airdrop at the chosen X. The
   crate is snapped to the nearest empty tile (so it never lands inside a
   wall) and gets a random bonus.
5. When the plane leaves the screen, schedule the next spawn.

Bonus effects (server applies, client just renders the active timers):

| Bonus   | Effect                                | Duration |
| ------- | ------------------------------------- | -------- |
| Shield  | Tank ignores bullets                  | 10 s     |
| Rapid   | Cooldown 450 ms → 180 ms              | 12 s     |
| Speed   | Movement × 1.6                        | 12 s     |
| Triple  | Single shot → 3-bullet spread         | 12 s     |

Airdrops auto-expire after `AIRDROP_LIFETIME_MS` (25 s).

---

## 6. Collision detection (AABB)

All entities are axis-aligned rectangles, so a single overlap test works for
every pair:

```ts
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}
```

Tank-vs-map movement resolves each axis **independently** so tanks can slide
along walls instead of getting stuck:

```ts
const next = { ...rect };
next.x += dx; if (collidesWithMap(next, …)) next.x = rect.x;
next.y += dy; if (collidesWithMap(next, …)) next.y = rect.y;
```

`collidesWithMap` only checks the tile indices the rect actually overlaps
(`floor(x/TILE)` to `floor((x+w-1)/TILE)`), keeping it O(1) per frame
regardless of map size.

Bullet-vs-anything walks the same tile range. Brick tiles flip to `empty` and
emit an `event:wall_destroyed`; steel tiles just absorb the bullet.

Tank-vs-tank simply re-uses `rectsOverlap` — if a tank's move would overlap
another live tank, we revert that frame's movement.

---

## 7. React game loop pattern

```tsx
useEffect(() => {
  const ctx = configureCanvas(canvas);
  let raf = 0;
  const draw = () => {
    const now = performance.now();
    // alpha = 0..1 between snapshots[prev] and snapshots[curr]
    const alpha = computeInterpolationAlpha(snapshotsRef.current, now);
    renderFrame({ ctx, map: mapRef.current, snapshot: curr, prevSnapshot: prev, alpha, … });
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}, [youId]);
```

Two `useRef`s — `mapRef` (mutable tile array, updated as walls break) and
`snapshotsRef` (prev/curr snapshots) — keep the loop allocation-free.

---

## 8. Tweaking / extending

* **Constants:** the source of truth for both halves is in `*/src/game/constants.ts`.
  Keep them in sync; an alternative is to extract a tiny `shared` workspace.
* **Map layout:** edit `server/src/game/map.ts`. The default is mirrored so
  both players spawn at equivalent positions.
* **More than 2 players:** bump `MAX_PLAYERS_PER_ROOM` and add more spawns
  in `GameRoom.beginMatch`. The renderer already handles N tanks.
* **Sound:** subscribe to `event:bullet_fired`, `event:pickup`, etc. and
  trigger `<audio>` playback. No server change needed.

---

## 9. Testing tips

* `node scripts/smoke.mjs` (with the dev server running) exercises the full
  lobby → game flow.
* `npm run lint && npm run typecheck && npm run build` is the green-light
  check the CI run also performs.
