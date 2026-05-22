/**
 * Wire types. Must stay in sync with server/src/game/types.ts.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';
export type TileKind = 'empty' | 'brick' | 'steel' | 'bush' | 'water';
export type BonusKind = 'shield' | 'rapid' | 'speed' | 'triple';

export interface PlayerInput {
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
}

export interface TankState {
  id: string;
  name: string;
  color: number;
  x: number;
  y: number;
  dir: Direction;
  alive: boolean;
  lives: number;
  score: number;
  shieldUntil: number;
  rapidUntil: number;
  speedUntil: number;
  tripleUntil: number;
}

export interface BulletState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  dir: Direction;
}

export interface AirdropState {
  id: string;
  x: number;
  y: number;
  bonus: BonusKind;
  expiresAt: number;
}

export interface PlaneState {
  id: string;
  x: number;
  y: number;
  dir: 'left' | 'right';
}

export interface PlayerSummary {
  id: string;
  name: string;
  color: number;
  ready: boolean;
  isHost: boolean;
}

export interface LobbyState {
  code: string;
  players: PlayerSummary[];
  status: 'waiting' | 'playing' | 'ended';
}

export interface GameSnapshot {
  tick: number;
  serverTime: number;
  tanks: TankState[];
  bullets: BulletState[];
  airdrops: AirdropState[];
  plane: PlaneState | null;
  tileChanges: Array<{ x: number; y: number; kind: TileKind }>;
  status: 'playing' | 'ended';
  winnerId?: string;
}

export interface MapData {
  width: number;
  height: number;
  tiles: TileKind[];
}

export type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };
