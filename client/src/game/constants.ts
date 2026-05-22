/** Client-side constants. Must mirror server/src/game/constants.ts. */
export const TILE_SIZE = 16;
export const MAP_TILES_X = 26;
export const MAP_TILES_Y = 26;
export const WORLD_WIDTH = TILE_SIZE * MAP_TILES_X;
export const WORLD_HEIGHT = TILE_SIZE * MAP_TILES_Y;

export const TANK_SIZE = 26;
export const BULLET_SIZE = 6;

/** Render scale: world is 416x416, we upscale for crisp pixel-art look. */
export const RENDER_SCALE = 2;

/** Palette inspired by the NES Battle City — limited 8-bit feel. */
export const PALETTE = {
  bg: '#000000',
  brickA: '#a04020',
  brickB: '#d06030',
  steelA: '#808080',
  steelB: '#c0c0c0',
  bushA: '#005800',
  bushB: '#00a020',
  water: '#1a4ad8',
  hud: '#fefe54',
  hudDim: '#a8a800',
  text: '#ffffff',
  shield: '#54e0ff',
  bullet: '#ffffff',
  airdrop: '#ffdc4a',
  plane: '#b0b0b0',
  tanks: [
    { body: '#f0c000', tread: '#7c5800', barrel: '#fff0a0' }, // yellow
    { body: '#54a800', tread: '#1d5c00', barrel: '#c0ff7d' }, // green
    { body: '#54a8ff', tread: '#1d4d8c', barrel: '#bfe0ff' }, // blue
    { body: '#ff5454', tread: '#8c1d1d', barrel: '#ffc0c0' }, // red
  ],
} as const;

export const BONUS_LABEL: Record<string, string> = {
  shield: 'SHLD',
  rapid: 'RAPD',
  speed: 'SPED',
  triple: 'TRPL',
};
