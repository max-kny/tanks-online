import {
  AIRDROP_LIFETIME_MS,
  BONUS_RAPID_MS,
  BONUS_SHIELD_MS,
  BONUS_SPEED_MS,
  BONUS_TRIPLE_MS,
  BULLET_BASE_COOLDOWN_MS,
  BULLET_BASE_SPEED,
  BULLET_RAPID_COOLDOWN_MS,
  BULLET_SIZE,
  MAX_PLAYERS_PER_ROOM,
  PLANE_MAX_INTERVAL_MS,
  PLANE_MIN_INTERVAL_MS,
  PLANE_SPEED,
  PLAYER_LIVES,
  SCORE_TO_WIN,
  SERVER_TICK_MS,
  SPEED_BONUS_MULT,
  TANK_BASE_SPEED,
  TANK_SIZE,
  TILE_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import { buildDefaultMap, getTile, setTile } from './map';
import { AABB, moveAgainstMap, rectsOverlap, tilesIntersecting } from './physics';
import {
  AirdropState,
  BonusKind,
  BulletState,
  Direction,
  GameSnapshot,
  LobbyState,
  MapData,
  PlaneState,
  PlayerInput,
  PlayerSummary,
  TankState,
  TileKind,
} from './types';
import { clamp, generateRoomCode, randInt, randomId } from './util';

const TANK_COLORS = [0, 1, 2, 3]; // palette indices

interface PlayerSlot {
  id: string; // socket id
  name: string;
  color: number;
  ready: boolean;
  isHost: boolean;
  input: PlayerInput;
  lastFireAt: number;
}

const BONUS_POOL: BonusKind[] = ['shield', 'rapid', 'speed', 'triple'];

const DIR_VEC: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Callbacks the gateway provides so the room can broadcast events.
 * Keeping this pure-ish lets us unit-test the room logic later.
 */
export interface RoomCallbacks {
  emitLobby(state: LobbyState): void;
  emitGameStart(payload: { map: MapData; you: string; snapshot: GameSnapshot; socketId: string }): void;
  emitSnapshot(snapshot: GameSnapshot): void;
  emitBulletFired(b: BulletState): void;
  emitPlaneSpawn(p: PlaneState): void;
  emitAirdropSpawn(a: AirdropState): void;
  emitPickup(playerId: string, bonus: BonusKind): void;
  emitPlayerHit(victimId: string, attackerId: string): void;
  emitWallDestroyed(x: number, y: number): void;
  emitGameEnd(winnerId: string | null): void;
}

export class GameRoom {
  readonly code: string;
  private players = new Map<string, PlayerSlot>();
  private status: 'waiting' | 'playing' | 'ended' = 'waiting';
  private map: MapData = buildDefaultMap();
  private tileChanges: Array<{ x: number; y: number; kind: TileKind }> = [];
  private tanks = new Map<string, TankState>();
  private bullets: BulletState[] = [];
  private airdrops: AirdropState[] = [];
  private plane: PlaneState | null = null;
  private nextPlaneAt = 0;
  private tick = 0;
  private loopHandle: NodeJS.Timeout | null = null;
  private winnerId: string | null = null;

  constructor(private readonly cb: RoomCallbacks, code?: string) {
    this.code = code ?? generateRoomCode();
  }

  get size(): number {
    return this.players.size;
  }

  get isPlaying(): boolean {
    return this.status === 'playing';
  }

  // --- Lobby management ---

  addPlayer(socketId: string, name: string): { ok: true } | { ok: false; error: string } {
    if (this.players.size >= MAX_PLAYERS_PER_ROOM) {
      return { ok: false, error: 'Room is full' };
    }
    if (this.status === 'playing') {
      return { ok: false, error: 'Game already in progress' };
    }
    const usedColors = new Set([...this.players.values()].map((p) => p.color));
    const color = TANK_COLORS.find((c) => !usedColors.has(c)) ?? 0;
    const slot: PlayerSlot = {
      id: socketId,
      name: name.slice(0, 16) || 'Player',
      color,
      ready: false,
      isHost: this.players.size === 0,
      input: { seq: 0, up: false, down: false, left: false, right: false, fire: false },
      lastFireAt: 0,
    };
    this.players.set(socketId, slot);
    this.cb.emitLobby(this.getLobbyState());
    return { ok: true };
  }

  removePlayer(socketId: string): void {
    if (!this.players.has(socketId)) return;
    this.players.delete(socketId);
    this.tanks.delete(socketId);
    if (this.players.size > 0) {
      const [first] = this.players.values();
      first.isHost = true;
    }
    if (this.status === 'playing' && this.tanks.size <= 1) {
      // Last tank standing wins by walkover.
      const survivor = [...this.tanks.values()][0];
      this.endGame(survivor?.id ?? null);
    }
    this.cb.emitLobby(this.getLobbyState());
  }

  setReady(socketId: string, ready: boolean): void {
    const slot = this.players.get(socketId);
    if (!slot) return;
    slot.ready = ready;
    this.cb.emitLobby(this.getLobbyState());
  }

  startGame(socketId: string): { ok: boolean; error?: string } {
    const slot = this.players.get(socketId);
    if (!slot?.isHost) return { ok: false, error: 'Only host can start' };
    if (this.players.size < 2) return { ok: false, error: 'Need 2 players' };
    const allReady = [...this.players.values()].every((p) => p.ready);
    if (!allReady) return { ok: false, error: 'All players must be ready' };
    this.beginMatch();
    return { ok: true };
  }

  getLobbyState(): LobbyState {
    const players: PlayerSummary[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      ready: p.ready,
      isHost: p.isHost,
    }));
    return { code: this.code, players, status: this.status };
  }

  applyInput(socketId: string, input: PlayerInput): void {
    const slot = this.players.get(socketId);
    if (!slot) return;
    slot.input = input;
  }

  // --- Match lifecycle ---

  private beginMatch(): void {
    this.map = buildDefaultMap();
    this.tileChanges = [];
    this.bullets = [];
    this.airdrops = [];
    this.plane = null;
    this.tick = 0;
    this.winnerId = null;
    this.status = 'playing';

    const spawns: Array<{ x: number; y: number; dir: Direction }> = [
      { x: 2 * TILE_SIZE, y: 2 * TILE_SIZE, dir: 'down' },
      { x: WORLD_WIDTH - TANK_SIZE - 2 * TILE_SIZE, y: WORLD_HEIGHT - TANK_SIZE - 2 * TILE_SIZE, dir: 'up' },
    ];
    let i = 0;
    this.tanks.clear();
    for (const slot of this.players.values()) {
      const spawn = spawns[i++ % spawns.length];
      this.tanks.set(slot.id, {
        id: slot.id,
        name: slot.name,
        color: slot.color,
        x: spawn.x,
        y: spawn.y,
        dir: spawn.dir,
        alive: true,
        lives: PLAYER_LIVES,
        score: 0,
        shieldUntil: Date.now() + 2000, // 2s spawn shield
        rapidUntil: 0,
        speedUntil: 0,
        tripleUntil: 0,
      });
    }

    this.scheduleNextPlane(Date.now());

    const snapshot = this.buildSnapshot();
    for (const slot of this.players.values()) {
      this.cb.emitGameStart({ map: this.map, you: slot.id, snapshot, socketId: slot.id });
    }

    this.startLoop();
  }

  private endGame(winnerId: string | null): void {
    this.status = 'ended';
    this.winnerId = winnerId;
    this.stopLoop();
    this.cb.emitGameEnd(winnerId);
    // Reset readiness so the lobby is reusable
    for (const slot of this.players.values()) slot.ready = false;
    this.cb.emitLobby(this.getLobbyState());
  }

  private startLoop(): void {
    if (this.loopHandle) return;
    let last = Date.now();
    this.loopHandle = setInterval(() => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      this.update(dt, now);
    }, SERVER_TICK_MS);
  }

  private stopLoop(): void {
    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }

  dispose(): void {
    this.stopLoop();
    this.players.clear();
    this.tanks.clear();
  }

  // --- Per-tick simulation ---

  private update(dt: number, now: number): void {
    this.tick++;

    // 1. Tanks: apply input, move, fire bullets.
    for (const tank of this.tanks.values()) {
      if (!tank.alive) continue;
      const slot = this.players.get(tank.id);
      if (!slot) continue;
      this.updateTank(tank, slot, dt, now);
    }

    // 2. Bullets: move, collide with map / tanks.
    this.updateBullets(dt, now);

    // 3. Airdrops: pickup / expiry.
    this.updateAirdrops(now);

    // 4. Plane: spawn / move / drop crate.
    this.updatePlane(dt, now);

    // 5. Win condition.
    this.checkWinCondition();

    // 6. Broadcast snapshot.
    this.cb.emitSnapshot(this.buildSnapshot());
  }

  private updateTank(tank: TankState, slot: PlayerSlot, dt: number, now: number): void {
    const input = slot.input;

    // Determine facing from latest input. We prefer the most recent axis.
    let dx = 0;
    let dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;

    // Tank-style movement: only one axis at a time.
    let newDir: Direction | null = null;
    if (dx !== 0 && dy === 0) newDir = dx < 0 ? 'left' : 'right';
    else if (dy !== 0 && dx === 0) newDir = dy < 0 ? 'up' : 'down';
    else if (dx !== 0 && dy !== 0) {
      // Both axes pressed — keep current direction if still pressed, else pick X.
      if ((tank.dir === 'left' && dx < 0) || (tank.dir === 'right' && dx > 0)) newDir = tank.dir;
      else if ((tank.dir === 'up' && dy < 0) || (tank.dir === 'down' && dy > 0)) newDir = tank.dir;
      else newDir = dx < 0 ? 'left' : 'right';
    }
    if (newDir) tank.dir = newDir;

    const isMoving = newDir !== null;
    if (isMoving) {
      const vec = DIR_VEC[tank.dir];
      const speedMult = tank.speedUntil > now ? SPEED_BONUS_MULT : 1;
      const speed = TANK_BASE_SPEED * speedMult * dt;
      const rect: AABB = { x: tank.x, y: tank.y, w: TANK_SIZE, h: TANK_SIZE };
      // Clamp to world bounds.
      const resolved = moveAgainstMap(
        rect,
        vec.x * speed,
        vec.y * speed,
        this.map,
        (kind) => kind === 'brick' || kind === 'steel' || kind === 'water',
      );
      tank.x = clamp(resolved.x, 0, WORLD_WIDTH - TANK_SIZE);
      tank.y = clamp(resolved.y, 0, WORLD_HEIGHT - TANK_SIZE);

      // Tank-vs-tank: revert if we collided with another tank.
      for (const other of this.tanks.values()) {
        if (other.id === tank.id || !other.alive) continue;
        if (
          rectsOverlap(
            { x: tank.x, y: tank.y, w: TANK_SIZE, h: TANK_SIZE },
            { x: other.x, y: other.y, w: TANK_SIZE, h: TANK_SIZE },
          )
        ) {
          tank.x = rect.x;
          tank.y = rect.y;
          break;
        }
      }
    }

    // Firing
    if (input.fire) {
      const cooldown = tank.rapidUntil > now ? BULLET_RAPID_COOLDOWN_MS : BULLET_BASE_COOLDOWN_MS;
      if (now - slot.lastFireAt >= cooldown) {
        slot.lastFireAt = now;
        const triple = tank.tripleUntil > now;
        this.spawnBullet(tank, 0);
        if (triple) {
          this.spawnBullet(tank, -1);
          this.spawnBullet(tank, 1);
        }
      }
    }
  }

  private spawnBullet(tank: TankState, lateralOffset: number): void {
    const vec = DIR_VEC[tank.dir];
    // Spawn at the front-centre of the tank, with optional lateral offset for triple-shot.
    const cx = tank.x + TANK_SIZE / 2 - BULLET_SIZE / 2;
    const cy = tank.y + TANK_SIZE / 2 - BULLET_SIZE / 2;
    const frontX = cx + (vec.x * TANK_SIZE) / 2;
    const frontY = cy + (vec.y * TANK_SIZE) / 2;
    // Perpendicular offset
    const px = vec.y; // perpendicular x
    const py = -vec.x; // perpendicular y
    const off = lateralOffset * 6;
    const bullet: BulletState = {
      id: randomId('b'),
      ownerId: tank.id,
      x: frontX + px * off,
      y: frontY + py * off,
      dir: tank.dir,
    };
    this.bullets.push(bullet);
    this.cb.emitBulletFired(bullet);
  }

  private updateBullets(dt: number, now: number): void {
    const surviving: BulletState[] = [];
    for (const bullet of this.bullets) {
      const vec = DIR_VEC[bullet.dir];
      const speed = BULLET_BASE_SPEED * dt;
      bullet.x += vec.x * speed;
      bullet.y += vec.y * speed;

      // Out of bounds
      if (bullet.x < 0 || bullet.y < 0 || bullet.x > WORLD_WIDTH || bullet.y > WORLD_HEIGHT) {
        continue;
      }

      const bulletRect: AABB = { x: bullet.x, y: bullet.y, w: BULLET_SIZE, h: BULLET_SIZE };

      // Tile collision
      let hitTile = false;
      for (const { x: tx, y: ty } of tilesIntersecting(bulletRect, this.map)) {
        const kind = getTile(this.map, tx, ty);
        if (kind === 'brick') {
          setTile(this.map, tx, ty, 'empty');
          this.tileChanges.push({ x: tx, y: ty, kind: 'empty' });
          this.cb.emitWallDestroyed(tx, ty);
          hitTile = true;
          break;
        }
        if (kind === 'steel') {
          hitTile = true;
          break;
        }
      }
      if (hitTile) continue;

      // Tank collision
      let hitTank = false;
      for (const tank of this.tanks.values()) {
        if (!tank.alive || tank.id === bullet.ownerId) continue;
        if (rectsOverlap(bulletRect, { x: tank.x, y: tank.y, w: TANK_SIZE, h: TANK_SIZE })) {
          if (tank.shieldUntil > now) {
            // Shield absorbs the bullet without consuming life.
            hitTank = true;
            break;
          }
          tank.lives -= 1;
          this.cb.emitPlayerHit(tank.id, bullet.ownerId);
          const attacker = this.tanks.get(bullet.ownerId);
          if (attacker) attacker.score += 1;
          if (tank.lives <= 0) {
            tank.alive = false;
          } else {
            this.respawn(tank);
          }
          hitTank = true;
          break;
        }
      }
      if (hitTank) continue;

      surviving.push(bullet);
    }
    this.bullets = surviving;
  }

  private respawn(tank: TankState): void {
    // Place tank back at its corner with a brief shield.
    const isFirst = tank.color % 2 === 0;
    if (isFirst) {
      tank.x = 2 * TILE_SIZE;
      tank.y = 2 * TILE_SIZE;
      tank.dir = 'down';
    } else {
      tank.x = WORLD_WIDTH - TANK_SIZE - 2 * TILE_SIZE;
      tank.y = WORLD_HEIGHT - TANK_SIZE - 2 * TILE_SIZE;
      tank.dir = 'up';
    }
    tank.shieldUntil = Date.now() + 2500;
  }

  // --- Plane / airdrops ---

  private scheduleNextPlane(now: number): void {
    this.nextPlaneAt = now + randInt(PLANE_MIN_INTERVAL_MS, PLANE_MAX_INTERVAL_MS);
  }

  private updatePlane(dt: number, now: number): void {
    if (this.plane) {
      const vec = this.plane.dir === 'right' ? 1 : -1;
      this.plane.x += vec * PLANE_SPEED * dt;
      // Drop a crate roughly mid-screen
      if (
        !this.airdropPending &&
        ((this.plane.dir === 'right' && this.plane.x >= this.dropX) ||
          (this.plane.dir === 'left' && this.plane.x <= this.dropX))
      ) {
        this.spawnAirdrop(this.dropX, this.plane.y, now);
        this.airdropPending = true;
      }
      if (this.plane.x < -64 || this.plane.x > WORLD_WIDTH + 64) {
        this.plane = null;
        this.airdropPending = false;
        this.scheduleNextPlane(now);
      }
      return;
    }
    if (now >= this.nextPlaneAt) {
      const dir = Math.random() < 0.5 ? 'right' : 'left';
      const y = randInt(TILE_SIZE, WORLD_HEIGHT - 2 * TILE_SIZE);
      this.plane = {
        id: randomId('plane'),
        x: dir === 'right' ? -48 : WORLD_WIDTH + 48,
        y,
        dir,
      };
      this.dropX = randInt(WORLD_WIDTH * 0.25, WORLD_WIDTH * 0.75);
      this.airdropPending = false;
      this.cb.emitPlaneSpawn(this.plane);
    }
  }

  private airdropPending = false;
  private dropX = 0;

  private spawnAirdrop(x: number, _y: number, now: number): void {
    // Snap crate to a non-solid tile near the chosen X (search downward).
    const tx = clamp(Math.floor(x / TILE_SIZE), 1, this.map.width - 2);
    let ty = Math.floor(this.map.height / 2);
    for (let i = 0; i < this.map.height; i++) {
      const probe = (ty + i) % this.map.height;
      if (getTile(this.map, tx, probe) === 'empty') {
        ty = probe;
        break;
      }
    }
    const bonus = BONUS_POOL[randInt(0, BONUS_POOL.length - 1)];
    const airdrop: AirdropState = {
      id: randomId('drop'),
      x: tx * TILE_SIZE,
      y: ty * TILE_SIZE,
      bonus,
      expiresAt: now + AIRDROP_LIFETIME_MS,
    };
    this.airdrops.push(airdrop);
    this.cb.emitAirdropSpawn(airdrop);
  }

  private updateAirdrops(now: number): void {
    const surviving: AirdropState[] = [];
    for (const drop of this.airdrops) {
      if (drop.expiresAt <= now) continue;
      let picked = false;
      for (const tank of this.tanks.values()) {
        if (!tank.alive) continue;
        if (
          rectsOverlap(
            { x: drop.x, y: drop.y, w: TILE_SIZE, h: TILE_SIZE },
            { x: tank.x, y: tank.y, w: TANK_SIZE, h: TANK_SIZE },
          )
        ) {
          this.applyBonus(tank, drop.bonus, now);
          this.cb.emitPickup(tank.id, drop.bonus);
          picked = true;
          break;
        }
      }
      if (!picked) surviving.push(drop);
    }
    this.airdrops = surviving;
  }

  private applyBonus(tank: TankState, bonus: BonusKind, now: number): void {
    switch (bonus) {
      case 'shield':
        tank.shieldUntil = now + BONUS_SHIELD_MS;
        break;
      case 'rapid':
        tank.rapidUntil = now + BONUS_RAPID_MS;
        break;
      case 'speed':
        tank.speedUntil = now + BONUS_SPEED_MS;
        break;
      case 'triple':
        tank.tripleUntil = now + BONUS_TRIPLE_MS;
        break;
    }
  }

  // --- Win check ---

  private checkWinCondition(): void {
    const alive = [...this.tanks.values()].filter((t) => t.alive);
    if (alive.length <= 1 && this.tanks.size >= 2) {
      this.endGame(alive[0]?.id ?? null);
      return;
    }
    const champ = [...this.tanks.values()].find((t) => t.score >= SCORE_TO_WIN);
    if (champ) this.endGame(champ.id);
  }

  private buildSnapshot(): GameSnapshot {
    return {
      tick: this.tick,
      serverTime: Date.now(),
      tanks: [...this.tanks.values()],
      bullets: this.bullets,
      airdrops: this.airdrops,
      plane: this.plane,
      tileChanges: this.tileChanges,
      status: this.status === 'playing' ? 'playing' : 'ended',
      winnerId: this.winnerId ?? undefined,
    };
  }
}
