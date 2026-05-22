import { BULLET_SIZE, PALETTE, RENDER_SCALE, TANK_SIZE, TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import { AirdropState, BulletState, GameSnapshot, MapData, PlaneState, TankState } from './types';

/**
 * Sets up the canvas backing store at world resolution and scales via CSS
 * for a crisp pixel-perfect upscale. Returns the (logical) ctx.
 */
export function configureCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  canvas.width = WORLD_WIDTH * RENDER_SCALE;
  canvas.height = WORLD_HEIGHT * RENDER_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  return ctx;
}

interface RenderArgs {
  ctx: CanvasRenderingContext2D;
  map: MapData;
  snapshot: GameSnapshot;
  prevSnapshot: GameSnapshot | null;
  alpha: number; // 0..1 between prev and current snapshot
  youId: string;
  plane: PlaneState | null;
  now: number;
}

export function renderFrame(args: RenderArgs): void {
  const { ctx, map, snapshot, prevSnapshot, alpha, youId, plane, now } = args;

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  drawMapTiles(ctx, map, false);
  // Bullets are drawn before tanks so tank chassis can occlude their tail.
  drawBullets(ctx, snapshot.bullets, prevSnapshot?.bullets ?? null, alpha);
  drawAirdrops(ctx, snapshot.airdrops, now);
  drawTanks(ctx, snapshot.tanks, prevSnapshot?.tanks ?? null, alpha, youId, now);
  // Bushes are drawn last so tanks under them appear semi-hidden.
  drawMapTiles(ctx, map, true);
  if (plane) drawPlane(ctx, plane);
}

function drawMapTiles(ctx: CanvasRenderingContext2D, map: MapData, bushesOnly: boolean): void {
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const kind = map.tiles[ty * map.width + tx];
      if (kind === 'empty') continue;
      const x = tx * TILE_SIZE;
      const y = ty * TILE_SIZE;
      if (bushesOnly) {
        if (kind === 'bush') drawBush(ctx, x, y);
      } else {
        if (kind === 'brick') drawBrick(ctx, x, y);
        else if (kind === 'steel') drawSteel(ctx, x, y);
        else if (kind === 'water') drawWater(ctx, x, y);
      }
    }
  }
}

function drawBrick(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = PALETTE.brickA;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = PALETTE.brickB;
  // Two rows of staggered "bricks"
  for (let row = 0; row < 2; row++) {
    const yy = y + row * 8;
    for (let i = 0; i < 2; i++) {
      const xx = x + i * 8 + (row % 2 === 0 ? 0 : 4);
      ctx.fillRect(xx, yy, 6, 6);
      ctx.fillRect(xx, yy + 1, 6, 5); // a hint of mortar
    }
  }
}

function drawSteel(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = PALETTE.steelA;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = PALETTE.steelB;
  ctx.fillRect(x + 1, y + 1, 6, 6);
  ctx.fillRect(x + 9, y + 1, 6, 6);
  ctx.fillRect(x + 1, y + 9, 6, 6);
  ctx.fillRect(x + 9, y + 9, 6, 6);
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(x + 7, y, 2, TILE_SIZE);
  ctx.fillRect(x, y + 7, TILE_SIZE, 2);
}

function drawWater(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
}

function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = PALETTE.bushA;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = PALETTE.bushB;
  for (let yy = 0; yy < TILE_SIZE; yy += 2) {
    for (let xx = 0; xx < TILE_SIZE; xx += 4) {
      ctx.fillRect(x + xx + (yy % 4 === 0 ? 0 : 2), y + yy, 2, 2);
    }
  }
}

function drawTanks(
  ctx: CanvasRenderingContext2D,
  tanks: TankState[],
  prev: TankState[] | null,
  alpha: number,
  youId: string,
  now: number,
): void {
  const prevById = new Map(prev?.map((t) => [t.id, t]) ?? []);
  for (const tank of tanks) {
    if (!tank.alive) continue;
    const prevTank = prevById.get(tank.id);
    const x = prevTank ? lerp(prevTank.x, tank.x, alpha) : tank.x;
    const y = prevTank ? lerp(prevTank.y, tank.y, alpha) : tank.y;
    drawTank(ctx, tank, x, y, now);
    if (tank.id === youId) drawYouMarker(ctx, x, y);
  }
}

function drawTank(ctx: CanvasRenderingContext2D, tank: TankState, x: number, y: number, now: number): void {
  const palette = PALETTE.tanks[tank.color % PALETTE.tanks.length];
  // Tread strips
  ctx.fillStyle = palette.tread;
  ctx.fillRect(x, y, TANK_SIZE, TANK_SIZE);
  // Body
  ctx.fillStyle = palette.body;
  ctx.fillRect(x + 3, y + 3, TANK_SIZE - 6, TANK_SIZE - 6);
  // Tread rivets
  ctx.fillStyle = palette.barrel;
  const t = Math.floor(now / 80) % 2;
  for (let i = 0; i < 4; i++) {
    const ox = 2 + i * 6;
    ctx.fillRect(x + ox + t, y + 1, 2, 1);
    ctx.fillRect(x + ox + t, y + TANK_SIZE - 2, 2, 1);
  }
  // Barrel based on direction
  ctx.fillStyle = palette.barrel;
  const cx = x + TANK_SIZE / 2;
  const cy = y + TANK_SIZE / 2;
  const barrelLen = TANK_SIZE / 2 + 2;
  const barrelHalf = 2;
  switch (tank.dir) {
    case 'up':
      ctx.fillRect(cx - barrelHalf, cy - barrelLen, barrelHalf * 2, barrelLen);
      break;
    case 'down':
      ctx.fillRect(cx - barrelHalf, cy, barrelHalf * 2, barrelLen);
      break;
    case 'left':
      ctx.fillRect(cx - barrelLen, cy - barrelHalf, barrelLen, barrelHalf * 2);
      break;
    case 'right':
      ctx.fillRect(cx, cy - barrelHalf, barrelLen, barrelHalf * 2);
      break;
  }
  // Shield aura
  if (tank.shieldUntil > now) {
    const phase = Math.floor(now / 80) % 2;
    ctx.strokeStyle = phase === 0 ? PALETTE.shield : '#a0f0ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2, y - 2, TANK_SIZE + 4, TANK_SIZE + 4);
    ctx.strokeRect(x - 4, y - 4, TANK_SIZE + 8, TANK_SIZE + 8);
  }
}

function drawYouMarker(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // Pixel "▼" sitting above the tank to mark the local player.
  ctx.fillStyle = PALETTE.hud;
  const tx = x + TANK_SIZE / 2 - 2;
  const ty = y - 6;
  ctx.fillRect(tx, ty, 4, 2);
  ctx.fillRect(tx + 1, ty + 2, 2, 1);
}

function drawBullets(
  ctx: CanvasRenderingContext2D,
  bullets: BulletState[],
  prev: BulletState[] | null,
  alpha: number,
): void {
  const prevById = new Map(prev?.map((b) => [b.id, b]) ?? []);
  ctx.fillStyle = PALETTE.bullet;
  for (const b of bullets) {
    const p = prevById.get(b.id);
    const x = p ? lerp(p.x, b.x, alpha) : b.x;
    const y = p ? lerp(p.y, b.y, alpha) : b.y;
    ctx.fillRect(x, y, BULLET_SIZE, BULLET_SIZE);
  }
}

function drawAirdrops(ctx: CanvasRenderingContext2D, drops: AirdropState[], now: number): void {
  for (const drop of drops) {
    const flicker = Math.floor(now / 200) % 2 === 0;
    ctx.fillStyle = flicker ? PALETTE.airdrop : '#fff0a0';
    ctx.fillRect(drop.x + 1, drop.y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.fillStyle = '#3a2400';
    ctx.fillRect(drop.x + 2, drop.y + 2, TILE_SIZE - 4, 1);
    ctx.fillRect(drop.x + 2, drop.y + TILE_SIZE - 3, TILE_SIZE - 4, 1);
    ctx.fillRect(drop.x + 7, drop.y + 2, 2, TILE_SIZE - 4);
    // Letter overlay
    ctx.fillStyle = '#3a2400';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText(drop.bonus[0].toUpperCase(), drop.x + 4, drop.y + 12);
  }
}

function drawPlane(ctx: CanvasRenderingContext2D, plane: PlaneState): void {
  const flip = plane.dir === 'left';
  ctx.save();
  ctx.translate(plane.x, plane.y);
  if (flip) ctx.scale(-1, 1);
  ctx.fillStyle = PALETTE.plane;
  // Fuselage
  ctx.fillRect(0, 4, 24, 4);
  // Wings
  ctx.fillRect(8, 0, 10, 12);
  // Tail
  ctx.fillRect(0, 2, 4, 8);
  // Nose
  ctx.fillRect(24, 5, 4, 2);
  // Propeller
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(28, 4, 1, 4);
  ctx.restore();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
