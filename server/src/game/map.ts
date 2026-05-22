import { MAP_TILES_X, MAP_TILES_Y } from './constants';
import { MapData, TileKind } from './types';

/**
 * Build a symmetric Battle-City inspired default map.
 * Layout is mirrored vertically so both players have an equal arena.
 */
export function buildDefaultMap(): MapData {
  const w = MAP_TILES_X;
  const h = MAP_TILES_Y;
  const tiles: TileKind[] = new Array(w * h).fill('empty');

  const set = (x: number, y: number, kind: TileKind): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    tiles[y * w + x] = kind;
  };

  // Outer steel frame
  for (let x = 0; x < w; x++) {
    set(x, 0, 'steel');
    set(x, h - 1, 'steel');
  }
  for (let y = 0; y < h; y++) {
    set(0, y, 'steel');
    set(w - 1, y, 'steel');
  }

  // Player spawn pockets stay clear (top-left and bottom-right areas).
  // Add interior structures (mirrored across the vertical centre line).
  const interiorBricks: Array<[number, number]> = [
    [4, 4], [5, 4], [4, 5], [5, 5],
    [4, 8], [5, 8], [6, 8],
    [8, 3], [8, 4], [8, 5],
    [10, 10], [11, 10], [12, 10], [13, 10],
    [10, 11], [13, 11],
    [10, 12], [13, 12],
    [10, 13], [11, 13], [12, 13], [13, 13],
    [3, 12], [3, 13], [3, 14],
  ];
  for (const [x, y] of interiorBricks) {
    set(x, y, 'brick');
    set(w - 1 - x, h - 1 - y, 'brick'); // mirror diagonally
  }

  // A couple of indestructible steel chokepoints
  const interiorSteel: Array<[number, number]> = [
    [12, 6], [13, 6],
    [6, 16],
  ];
  for (const [x, y] of interiorSteel) {
    set(x, y, 'steel');
    set(w - 1 - x, h - 1 - y, 'steel');
  }

  // Bushes (cosmetic concealment)
  const bushes: Array<[number, number]> = [
    [7, 12], [7, 13], [8, 12], [8, 13],
    [16, 6], [17, 6],
  ];
  for (const [x, y] of bushes) {
    set(x, y, 'bush');
    set(w - 1 - x, h - 1 - y, 'bush');
  }

  return { width: w, height: h, tiles };
}

export function getTile(map: MapData, tx: number, ty: number): TileKind {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 'steel';
  return map.tiles[ty * map.width + tx];
}

export function setTile(map: MapData, tx: number, ty: number, kind: TileKind): void {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return;
  map.tiles[ty * map.width + tx] = kind;
}
