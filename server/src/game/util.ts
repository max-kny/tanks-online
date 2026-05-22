import { ROOM_CODE_LEN } from './constants';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function generateRoomCode(): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LEN; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function randomId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
