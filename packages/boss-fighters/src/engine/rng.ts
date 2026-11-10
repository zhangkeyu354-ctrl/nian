import type { GameState } from '../types.ts';

// 可回放的随机数：状态里只存一个整数（mulberry32）
export function next(state: GameState): number {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function int(state: GameState, n: number): number {
  return Math.floor(next(state) * n);
}

export function pick<T>(state: GameState, arr: T[]): T {
  return arr[int(state, arr.length)];
}

export function weighted<T extends { weight: number }>(state: GameState, arr: T[]): T {
  const total = arr.reduce((s, x) => s + x.weight, 0);
  let r = next(state) * total;
  for (const x of arr) {
    r -= x.weight;
    if (r < 0) return x;
  }
  return arr[arr.length - 1];
}

export function shuffle<T>(state: GameState, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(state, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
