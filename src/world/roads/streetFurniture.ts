import { ROAD_WIDTH, SIDEWALK_WIDTH, STREETS, type Street } from '@/game/world/cityLayout';

/**
 * Where the tall street furniture stands: cobra-head street lights behind the sidewalk (staggered
 * by side) and the stop signs on the intersection corners. Drawn by Roads; close service cameras
 * read the same positions to keep poles out of the shot (cameraObstacles.ts).
 */

export interface StreetLight {
  street: Street;
  /** Distance along the street's axis. */
  along: number;
  /** -1 or 1: which side of the street. */
  side: number;
  x: number;
  z: number;
}

export const STREET_LIGHT_HEIGHT = 9;

/** Lateral offset of a street light pole from the street's centre line (before the side sign). */
function lightOffset(): number {
  return ROAD_WIDTH / 2 + 0.55 + SIDEWALK_WIDTH + 0.6;
}

export function streetLights(): StreetLight[] {
  const out: StreetLight[] = [];
  for (const s of STREETS) {
    const isX = s.axis === 'x';
    for (let a = s.from + 20, i = 0; a < s.to - 10; a += 44, i++) {
      if (Math.abs(a) < 9 || Math.abs(Math.abs(a) - (isX ? 130 : 100)) < 9) continue;
      const side = i % 2 === 0 ? 1 : -1;
      const across = side * lightOffset();
      out.push({ street: s, along: a, side, x: isX ? a : s.at + across, z: isX ? s.at + across : a });
    }
  }
  return out;
}

/** Stop-sign posts on the near-right corner of each approach, plus the street-name blade post. */
export function signPosts(): { x: number; z: number; height: number }[] {
  const half = ROAD_WIDTH / 2;
  const out: { x: number; z: number; height: number }[] = [];
  for (const sx of STREETS.filter((s) => s.axis === 'x')) {
    for (const sz of STREETS.filter((s) => s.axis === 'z')) {
      const cx = sz.at;
      const cz = sx.at;
      for (const [dx, dz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const) out.push({ x: cx + dx * (half + 0.8), z: cz + dz * (half + 0.8), height: 2.9 });
      out.push({ x: cx + half + 1.1, z: cz - half - 1.1, height: 3.3 });
    }
  }
  return out;
}
