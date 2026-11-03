import { COMMERCIAL_LOTS, COMPETITOR_LOT, HOUSE_LOTS, HQ_LOT, inwardDir, ROAD_WIDTH, SIDEWALK_WIDTH, STREETS, WAREHOUSE_LOT } from '@/game/world/cityLayout';

/**
 * How high the walkable ground is, so feet stand on raised sidewalks and driveway aprons instead of sinking through them.
 * Visual only: the simulation is flat. Pure data from the street layout, shared with the geometry in Roads.tsx.
 */

export const CURB_H = 0.15;
const half = ROAD_WIDTH / 2;
const SIDEWALK_TOP = CURB_H - 0.005;
/** Height of a driveway apron's top. */
export const APRON_H = CURB_H + 0.02;
/** A step up takes this much ground, so a walker rises smoothly instead of popping up. */
const RAMP = 0.3;

export interface Apron {
  x: number;
  z: number;
  /** Size along world x and z. */
  sx: number;
  sz: number;
}

/** The curb cut in front of every lot that touches a street. */
export function drivewayAprons(): Apron[] {
  const walk = SIDEWALK_WIDTH;
  return [...HOUSE_LOTS, HQ_LOT, WAREHOUSE_LOT, COMPETITOR_LOT, ...COMMERCIAL_LOTS].map((lot) => {
    const dir = inwardDir(lot.facing);
    const horizontal = dir.z !== 0;
    const sideSign = lot.facing === 'north' || lot.facing === 'west' ? -1 : 1;
    const wide = lot.kind === 'house' ? (lot.style === 'premium' ? 8.5 : lot.style === 'two-story' ? 5.2 : 5.5) : lot.kind === 'hq' ? 10 : 9;
    const offset = lot.kind === 'house' ? (lot.style === 'premium' ? 11 : lot.style === 'two-story' ? 9.5 : lot.style === 'modern' ? 5 : lot.style === 'spanish' ? 5.4 : 5) : 0;
    return {
      x: lot.curb.x + dir.x * (half + 0.3 + walk / 2) + (horizontal ? sideSign * offset : 0),
      z: lot.curb.z + dir.z * (half + 0.3 + walk / 2) + (horizontal ? 0 : sideSign * offset),
      sx: horizontal ? wide : walk + 0.9,
      sz: horizontal ? walk + 0.9 : wide,
    };
  });
}

const APRONS = drivewayAprons();
/** A raised strip, from its centre: full height inside, sloping to nothing over RAMP outside. */
const strip = (dAlong: number, dAcross: number, height: number) => {
  const d = Math.max(dAlong, dAcross);
  return d <= 0 ? height : d >= RAMP ? 0 : height * (1 - d / RAMP);
};

/** The ground's height at a point (metres). */
export function walkSurfaceY(x: number, z: number): number {
  let y = 0;
  const inner = half + 0.25;
  const outer = half + 0.55 + SIDEWALK_WIDTH;
  const mid = (inner + outer) / 2;
  const halfBand = (outer - inner) / 2;
  for (const s of STREETS) {
    const along = s.axis === 'x' ? x : z;
    const across = Math.abs((s.axis === 'x' ? z : x) - s.at);
    const c = (s.from + s.to) / 2;
    const v = strip(Math.abs(along - c) - (s.to - s.from) / 2, Math.abs(across - mid) - halfBand, SIDEWALK_TOP);
    if (v > y) y = v;
  }
  for (const a of APRONS) {
    const v = strip(Math.abs(x - a.x) - a.sx / 2, Math.abs(z - a.z) - a.sz / 2, APRON_H);
    if (v > y) y = v;
  }
  return y;
}
