import { makeDecoRng } from '../assets/random';
import type { GroundMat, Poly, Species } from './propertyPlan';

/**
 * Common-area greenbelts: the 14 m strips between the back walls of facing rows of houses become
 * HOA-style desert landscape (as in Summerlin and Henderson subdivisions): a decomposed-granite
 * base with darker rock swales, a winding concrete path, groves of desert trees, boulder groups
 * and benches. Deterministic data in world coordinates; rendered with the neighbourhood mesh and
 * the instanced vegetation layer. No roads, lots or job locations are involved.
 */

export interface GreenbeltPlan {
  id: string;
  rect: { x0: number; x1: number; z0: number; z1: number };
  ground: { mat: GroundMat; poly: Poly; layer: number; edge?: 'stone' | 'curb' }[];
  path: [number, number][];
  plants: { species: Species; x: number; z: number; rotation: number; scale: number }[];
  benches: { x: number; z: number; rot: number }[];
}

// Strips between rear walls: block A (a-n / a-s), block B (b-n / b-s), block C (c-n / c-s).
export const GREENBELT_STRIPS = [
  { id: 'gb-a', x0: -122, x1: -7, z0: -56.6, z1: -43.4 },
  { id: 'gb-b', x0: 8, x1: 123, z0: -56.6, z1: -43.4 },
  { id: 'gb-c', x0: -122, x1: -7, z0: 43.4, z1: 56.6 },
];

let cache: GreenbeltPlan[] | null = null;

export function greenbelts(): GreenbeltPlan[] {
  if (cache) return cache;
  cache = GREENBELT_STRIPS.map((s, k) => {
    const rnd = makeDecoRng(9100 + k * 131);
    const rr = (a: number, b: number) => a + rnd() * (b - a);
    const zc = (s.z0 + s.z1) / 2;
    const half = (s.z1 - s.z0) / 2;
    const ground: GreenbeltPlan['ground'] = [];
    const plants: GreenbeltPlan['plants'] = [];
    const benches: GreenbeltPlan['benches'] = [];
    // Winding path along the strip.
    const path: [number, number][] = [];
    const phase = rr(0, 6);
    for (let x = s.x0 + 1; x <= s.x1 - 1 + 0.01; x += 2.5) path.push([x, zc + Math.sin(x / 13 + phase) * (half - 3.2)]);
    const pathZ = (x: number) => zc + Math.sin(x / 13 + phase) * (half - 3.2);
    const nearPath = (x: number, z: number, r: number) => Math.abs(z - pathZ(x)) < 1.3 + r;
    // Rock swales and planting beds on alternating sides of the path.
    for (let x = s.x0 + 6; x < s.x1 - 6; x += rr(11, 16)) {
      const side = pathZ(x) > zc ? -1 : 1;
      const bz = zc + side * rr(2.5, 3.6);
      const rx = rr(3.5, 6);
      const rz = rr(1.6, 2.4);
      const poly: Poly = [];
      const ph = rnd() * 6;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const f = 1 + 0.15 * Math.sin(a * 2 + ph) + 0.08 * Math.sin(a * 3 + ph);
        poly.push([x + Math.cos(a) * rx * f, Math.min(s.z1 - 0.3, Math.max(s.z0 + 0.3, bz + Math.sin(a) * rz * f))]);
      }
      ground.push({ mat: rnd() < 0.5 ? 'rock-brown' : 'rock-red', poly, layer: 2, edge: 'stone' });
      // Grove: one or two trees, a boulder group and a desert cluster in each bed.
      const tree = (sp: Species, tx: number, tz: number, sc: number) => { if (!nearPath(tx, tz, 1.2)) plants.push({ species: sp, x: tx, z: tz, rotation: rnd() * 6.28, scale: sc }); };
      tree(rnd() < 0.5 ? 'palo-verde' : rnd() < 0.5 ? 'mesquite' : 'olive', x + rr(-1.5, 1.5), bz + rr(-0.4, 0.4), rr(1.0, 1.3));
      if (rx > 4.5) tree(rnd() < 0.6 ? 'palm' : 'palo-verde', x + rr(2.5, 3.5) * (rnd() < 0.5 ? -1 : 1), bz, rr(0.9, 1.15));
      plants.push({ species: 'boulder', x: x + rr(-2.5, 2.5), z: bz + rr(-0.6, 0.6), rotation: rnd() * 6.28, scale: rr(0.7, 1.1) });
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2;
        const d = rr(0.6, 1);
        const px = x + Math.cos(a) * rx * d * 0.85;
        const pz = bz + Math.sin(a) * rz * d * 0.8;
        if (nearPath(px, pz, 0.4)) continue;
        const r = rnd();
        plants.push({ species: r < 0.25 ? 'agave' : r < 0.45 ? 'desert-grass' : r < 0.6 ? 'yucca' : r < 0.75 ? 'shrub-sage' : r < 0.87 ? 'barrel-cactus' : 'groundcover', x: px, z: pz, rotation: rnd() * 6.28, scale: rr(0.75, 1.15) });
      }
    }
    // Benches beside the path every ~35 m, facing across it.
    for (let x = s.x0 + 18; x < s.x1 - 10; x += rr(30, 40)) {
      const z = pathZ(x);
      const side = z > zc ? -1 : 1;
      // The bench asset's back faces -z: on the +z side it turns to face the path.
      benches.push({ x, z: z + side * 1.6, rot: side > 0 ? Math.PI : 0 });
    }
    return { id: s.id, rect: s, ground, path, plants, benches };
  });
  return cache;
}
