---
name: testing-tanks-online
description: End-to-end browser testing recipe for the Tanks Online multiplayer game. Use whenever a session needs to verify lobby flow, gameplay, multiplayer sync, or regression-test previously fixed bugs in this repo.
---

## When to use

Whenever a Devin session involves end-to-end testing of `max-kny/tanks-online` in a browser (lobby flow, gameplay, multiplayer state sync). Read this first to avoid 5–10 minutes of trial-and-error around environment quirks and previously-fixed bugs.

## Prereqs

- Node ≥ 22 (Volta-pinned in `package.json`)
- Workspaces installed: `npm install --include-workspace-root`
- No external secrets needed

## Start the dev servers

The repo uses a top-level `dev` script (npm workspaces) that runs both server (NestJS @ `:3001`) and client (Vite @ `:5173`):

```bash
cd $REPO && npm run dev
```

Run it in **background** in a named shell so you can read logs without blocking:

```
exec(command="cd $REPO && npm run dev", shell_id="dev", run_in_background=True)
```

Wait for both lines:
- `Nest application successfully started` (server ready)
- `Local:   http://localhost:5173/` (client ready)

## Smoke-test the wire protocol first (fast, mandatory before browser tests)

```bash
node $REPO/scripts/smoke.mjs
```

This script creates two real socket clients, runs the full lobby → join → ready → start → input flow, and observes 150 server ticks. It catches gateway-level bugs (event ordering, ack mismatches) **without** a browser, so always run it before launching Chrome. If smoke fails, fix it before the browser test — the browser will fail the same way but slower.

## Single-tab Chrome test

The Devin VM has one Chrome process. Open the second player in a **second tab inside the same Chrome window** (`Ctrl+T → type URL → Enter`), NOT a second window. Both tabs hit `http://localhost:5173`.

**Maximize the Chrome window BEFORE starting any recording:**
```bash
sudo apt-get install -y wmctrl 2>/dev/null
wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz
```

## Suggested test names

Use these for `annotate_recording` `test_start` calls so every recording has a consistent structure:

1. `It should host a room and accept a joiner via the 4-letter code`
2. `It should start the match when both READY and the host hits START`
3. `It should render the spawn shield aura for ~2s and then hide it`  ← **previously-fixed bug, always assert**
4. `It should drive the tank and fire bullets via WASD + Space`
5. `It should destroy brick walls but not steel walls`
6. `It should spawn the plane and drop an airdrop crate (bonus)`
7. `It should end the match at 5 kills and show VICTORY overlay`

## Critical asserting tips

- **Spawn shield aura** is a 2-second cyan outline at match start. Take a full screenshot at t≈0 and another at t≈3 s (`computer.wait(3)`) — compare them. **Zoom screenshots are unreliable** for this assertion because the aura is 1–2 pixels thick at native canvas resolution.
- **Tank vs airdrop crate** look almost identical when zoomed. Airdrop has a **cross pattern across top/bottom edges** plus a letter overlay (T/S/R/P). Tank has a **clean rectangular body with a barrel-extension** that follows facing direction.
- **Bullets travel fast.** To verify brick destruction, zoom the target tile, fire 2–3 times in adjacent tool calls (no wait between), then re-zoom — compare. To verify steel non-destruction, same recipe but assert no change.
- **WASD does NOT require canvas focus.** `client/src/game/input.ts` attaches `keydown`/`keyup` to `window`. Switch between tabs by clicking the tab title — NOT `Ctrl+Tab` (intercepted by Chrome).
- **5-hit VICTORY in a single-person browser test is impractical.** The opponent tank doesn't move and bullets must navigate a tile maze. Mark this test as `untested` in the recording — the smoke test exercises the underlying gameplay code path.

## Known gotchas (verify these guard rails still exist)

- **Lobby `emit-before-join` race** (commit `0e4e7c4`): if a regression sneaks in, clicking CREATE ROOM does nothing. Fix is in `server/src/game/game.gateway.ts` — `client.join(room.code)` MUST happen BEFORE `room.addPlayer(...)` in both `onCreate` and `onJoin` handlers (around lines 80 and 110).
- **Shield aura time-base** (commit `32aab05`): server emits `shieldUntil` as `Date.now()` epoch ms; renderer threads BOTH `now` (animation, `performance.now()`) and `epochNow` (server comparisons, `Date.now()`). Shield check at `client/src/game/render.ts:177` MUST use `epochNow`, not `now`. If only `now` is used, the aura renders permanently.

## Quick file map

| Concern | File |
|---|---|
| Lobby Socket.io gateway | `server/src/game/game.gateway.ts` |
| 30 Hz authoritative simulation | `server/src/game/room.ts` |
| AABB collision physics | `server/src/game/physics.ts` |
| Canvas render pipeline | `client/src/game/render.ts` |
| HUD + lobby UI | `client/src/components/{HUD,Lobby}.tsx` |
| Game constants | `server/src/game/constants.ts` + `client/src/game/constants.ts` |
| Wire-protocol smoke test | `scripts/smoke.mjs` |
