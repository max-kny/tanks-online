import { TILE_SIZE } from './constants';
import { getTile } from './map';
import { MapData } from './types';

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsOverlap(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Try to move a rect by (dx, dy) against the map's solid tiles. Resolves each
 * axis independently so the entity can slide along walls.
 * Returns the resolved AABB. `solid` decides which tile kinds block movement.
 */
export function moveAgainstMap(
  rect: AABB,
  dx: number,
  dy: number,
  map: MapData,
  solid: (kind: ReturnType<typeof getTile>) => boolean,
): AABB {
  const next = { ...rect };
  next.x += dx;
  if (collidesWithMap(next, map, solid)) {
    next.x = rect.x;
  }
  next.y += dy;
  if (collidesWithMap(next, map, solid)) {
    next.y = rect.y;
  }
  return next;
}

export function collidesWithMap(
  rect: AABB,
  map: MapData,
  solid: (kind: ReturnType<typeof getTile>) => boolean,
): boolean {
  const minTx = Math.floor(rect.x / TILE_SIZE);
  const minTy = Math.floor(rect.y / TILE_SIZE);
  const maxTx = Math.floor((rect.x + rect.w - 1) / TILE_SIZE);
  const maxTy = Math.floor((rect.y + rect.h - 1) / TILE_SIZE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (solid(getTile(map, tx, ty))) return true;
    }
  }
  return false;
}

/** Return list of map tiles a rect currently overlaps. */
export function tilesIntersecting(rect: AABB, map: MapData): Array<{ x: number; y: number }> {
  const minTx = Math.max(0, Math.floor(rect.x / TILE_SIZE));
  const minTy = Math.max(0, Math.floor(rect.y / TILE_SIZE));
  const maxTx = Math.min(map.width - 1, Math.floor((rect.x + rect.w - 1) / TILE_SIZE));
  const maxTy = Math.min(map.height - 1, Math.floor((rect.y + rect.h - 1) / TILE_SIZE));
  const out: Array<{ x: number; y: number }> = [];
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      out.push({ x: tx, y: ty });
    }
  }
  return out;
}
