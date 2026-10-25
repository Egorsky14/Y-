/**
 * Deterministic pseudo-random number generator (mulberry32).
 * The RNG state is a plain number so it can be serialized with the save file,
 * which keeps the simulation reproducible for a given seed and action sequence.
 */
export interface RngState {
  seed: number;
}

export function createRng(seed: number): RngState {
  return { seed: seed >>> 0 };
}

/** Advances the RNG and returns a float in [0, 1). */
export function nextFloat(rng: RngState): number {
  let t = (rng.seed = (rng.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max] inclusive. */
export function nextInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

export function nextRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

export function chance(rng: RngState, probability: number): boolean {
  return nextFloat(rng) < probability;
}

export function pick<T>(rng: RngState, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(nextFloat(rng) * items.length))];
}

export function shuffle<T>(rng: RngState, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Hashes a string to a 32-bit seed. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
