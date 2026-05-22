/**
 * Wire types shared between server and client. The client copy of this file
 * lives at client/src/game/types.ts and must be kept in sync.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export type TileKind = 'empty' | 'brick' | 'steel' | 'bush' | 'water';

export type BonusKind = 'shield' | 'rapid' | 'speed' | 'triple';

export interface PlayerInput {
  /** Latest sequence number from the client (for ack/lag estimation). */
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
  color: number; // palette index
  x: number; // top-left in world px
  y: number;
  dir: Direction;
  alive: boolean;
  lives: number;
  score: number;
  /** Active bonuses with absolute expiry timestamps (ms epoch). */
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
  /** Sparse list of tile changes since match start: { x, y, kind } */
  tileChanges: Array<{ x: number; y: number; kind: TileKind }>;
  status: 'playing' | 'ended';
  winnerId?: string;
}

export interface MapData {
  width: number;
  height: number;
  tiles: TileKind[]; // row-major, length = width * height
}

// --- Client → Server events ---
export interface ClientToServerEvents {
  'lobby:create': (payload: { name: string }, ack: (res: AckResult<{ code: string }>) => void) => void;
  'lobby:join': (payload: { code: string; name: string }, ack: (res: AckResult<{ code: string }>) => void) => void;
  'lobby:leave': () => void;
  'lobby:ready': (payload: { ready: boolean }) => void;
  'lobby:start': () => void;
  input: (payload: PlayerInput) => void;
}

// --- Server → Client events ---
export interface ServerToClientEvents {
  'lobby:state': (state: LobbyState) => void;
  'game:start': (payload: { map: MapData; you: string; snapshot: GameSnapshot }) => void;
  'game:end': (payload: { winnerId: string | null }) => void;
  state: (snapshot: GameSnapshot) => void;
  'event:bullet_fired': (payload: { bulletId: string; ownerId: string; x: number; y: number; dir: Direction }) => void;
  'event:plane_spawn': (payload: PlaneState) => void;
  'event:airdrop_spawn': (payload: AirdropState) => void;
  'event:pickup': (payload: { playerId: string; bonus: BonusKind }) => void;
  'event:player_hit': (payload: { victimId: string; attackerId: string }) => void;
  'event:wall_destroyed': (payload: { x: number; y: number }) => void;
  error: (message: string) => void;
}

export type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };
