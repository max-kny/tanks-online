/**
 * Shared game constants. The world is tile-based (Battle City style).
 * Server is authoritative — it owns positions, collisions, and timers.
 */

export const TILE_SIZE = 16;
export const MAP_TILES_X = 26;
export const MAP_TILES_Y = 26;
export const WORLD_WIDTH = TILE_SIZE * MAP_TILES_X; // 416
export const WORLD_HEIGHT = TILE_SIZE * MAP_TILES_Y; // 416

export const TANK_SIZE = 26;
export const TANK_BASE_SPEED = 70; // px / second
export const TANK_TURN_GRID = 2; // snap to grid for nicer movement

export const BULLET_SIZE = 6;
export const BULLET_BASE_SPEED = 220; // px / second
export const BULLET_BASE_COOLDOWN_MS = 450;
export const BULLET_RAPID_COOLDOWN_MS = 180;

export const SERVER_TICK_RATE = 30;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

export const PLAYER_LIVES = 3;
export const SCORE_TO_WIN = 5;

// Plane / airdrop
export const PLANE_MIN_INTERVAL_MS = 20_000;
export const PLANE_MAX_INTERVAL_MS = 35_000;
export const PLANE_SPEED = 140; // px / second
export const AIRDROP_LIFETIME_MS = 25_000;

// Bonus durations
export const BONUS_SHIELD_MS = 10_000;
export const BONUS_RAPID_MS = 12_000;
export const BONUS_SPEED_MS = 12_000;
export const BONUS_TRIPLE_MS = 12_000;
export const SPEED_BONUS_MULT = 1.6;

export const BRICK_HP = 1;

export const ROOM_CODE_LEN = 4;
export const MAX_PLAYERS_PER_ROOM = 2;
