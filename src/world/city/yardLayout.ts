import type { Lot, HouseStyle } from '@/game/world/cityLayout';
import { HOUSE_HALF_WIDTH } from '@/game/world/cityLayout';
import { makeDecoRng } from '../assets/random';

/**
 * Deterministic per-lot landscaping plan. Houses and the instanced vegetation layer both read
 * this so planting never collides with driveways, walkways or the condenser.
 */
export type Species = 'palm' | 'date-palm' | 'mesquite' | 'olive' | 'shrub-sage' | 'shrub-green' | 'shrub-red' | 'agave' | 'flower-pink' | 'flower-yellow' | 'rock' | 'boulder' | 'barrel-cactus';

export interface PlantInstance {
  species: Species;
  /** Local house-space position (front faces -z). */
  x: number;
  z: number;
  rotation: number;
  scale: number;
}

export interface YardPlan {
  seed: number;
  lawn: boolean;
  plants: PlantInstance[];
  /** Mulch beds in local space: [x, z, width, depth]. */
  beds: [number, number, number, number][];
  treeSpecies: 'palm' | 'mesquite' | 'olive';
}

export function hashLot(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

const FRONT_DEPTH: Record<HouseStyle, number> = { ranch: 5.5, 'two-story': 5.5, spanish: 6, modern: 5.5, premium: 7 };
const DRIVEWAY_X: Record<HouseStyle, [number, number]> = { ranch: [-8, -2.2], 'two-story': [-12.5, -6.5], spanish: [-8.3, -2.5], modern: [-7.6, -2.4], premium: [-15, -7] };
const WALK_X: Record<HouseStyle, number> = { ranch: 3.4, 'two-story': 0, spanish: 3.5, modern: 0.8, premium: 1 };

export function yardPlan(lot: Lot): YardPlan {
  const seed = hashLot(lot.id);
  const rnd = makeDecoRng(seed * 7 + 3);
  const style = lot.style ?? 'ranch';
  const half = HOUSE_HALF_WIDTH[style];
  const frontZ = -(FRONT_DEPTH[style]); // house front wall (local)
  const lotFront = -lot.depth / 2 + 1; // just inside the sidewalk
  const [dx0, dx1] = DRIVEWAY_X[style];
  const walkX = WALK_X[style];
  const plants: PlantInstance[] = [];
  const beds: [number, number, number, number][] = [];
  const lawn = rnd() < 0.3;
  const treeSpecies: YardPlan['treeSpecies'] = rnd() < 0.45 ? 'palm' : rnd() < 0.5 ? 'mesquite' : 'olive';

  const blocked = (x: number, z: number) => {
    if (x > dx0 - 0.8 && x < dx1 + 0.8 && z < frontZ + 1) return true; // driveway
    if (Math.abs(x - walkX) < 1.2 && z < frontZ + 1) return true; // walkway
    if (x > half - 1.5 && z > -7 && z < 1) return true; // condenser access
    return false;
  };
  const place = (species: Species, x: number, z: number, scale = 1) => {
    if (blocked(x, z)) return false;
    plants.push({ species, x, z, rotation: rnd() * Math.PI * 2, scale });
    return true;
  };

  // Foundation planting bed along the front wall, split by the entry walk.
  const bedDepth = 1.6;
  const bedZ = frontZ - bedDepth / 2 - 0.1;
  const leftBed: [number, number, number, number] = [(dx1 + 0.9 + (walkX - 1.3)) / 2, bedZ, Math.max(0, walkX - 1.3 - (dx1 + 0.9)), bedDepth];
  const rightBed: [number, number, number, number] = [(walkX + 1.3 + half) / 2, bedZ, Math.max(0, half - (walkX + 1.3)), bedDepth];
  for (const bed of [leftBed, rightBed]) {
    if (bed[2] < 1.2) continue;
    beds.push(bed);
    const n = Math.max(1, Math.floor(bed[2] / 1.6));
    for (let i = 0; i < n; i++) {
      const x = bed[0] - bed[2] / 2 + (i + 0.5) * (bed[2] / n);
      const r = rnd();
      place(r < 0.4 ? 'shrub-green' : r < 0.7 ? 'shrub-sage' : r < 0.85 ? 'flower-pink' : 'shrub-red', x, bedZ + (rnd() - 0.5) * 0.4, 0.8 + rnd() * 0.5);
    }
  }
  // Specimen tree in the front yard on the entry side, away from the driveway.
  const treeX = Math.min(half - 0.5, walkX + 4 + rnd() * 3);
  place(treeSpecies, treeX, lotFront + 4 + rnd() * 3, 0.9 + rnd() * 0.35);
  // Accent agave / barrel cactus / boulders scattered in the front gravel.
  const accents = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < accents; i++) {
    const x = -lot.width / 2 + 2 + rnd() * (lot.width - 4);
    const z = lotFront + 1 + rnd() * (frontZ - lotFront - 3);
    const r = rnd();
    place(r < 0.35 ? 'agave' : r < 0.55 ? 'barrel-cactus' : r < 0.75 ? 'rock' : r < 0.88 ? 'flower-yellow' : 'boulder', x, z, 0.7 + rnd() * 0.6);
  }
  // Backyard trees behind the block wall (visible from the high camera).
  const backZ = lot.depth / 2 - 4;
  place(rnd() < 0.5 ? 'palm' : 'mesquite', -lot.width / 2 + 3 + rnd() * 4, backZ - rnd() * 3, 0.9 + rnd() * 0.4);
  if (rnd() < 0.6) place(rnd() < 0.5 ? 'olive' : 'shrub-green', lot.width / 2 - 3 - rnd() * 4, backZ - rnd() * 4, 0.9 + rnd() * 0.4);
  return { seed, lawn, plants, beds, treeSpecies };
}
