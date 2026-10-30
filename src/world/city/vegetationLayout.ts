import { HOUSE_LOTS, HQ_LOT, PARK_LOT, ROAD_WIDTH, SIDEWALK_WIDTH, STREETS, WORLD_HALF, type Lot } from '@/game/world/cityLayout';
import { makeDecoRng } from '../assets/random';
import { yardPlan, type Species } from './yardLayout';
import { greenbelts } from './greenbelt';
import { hqLandscapePlants } from './hqLandscape';
import { isOpenDesert } from './hinterlandLayout';

/**
 * Where every plant in the world stands: yards, greenbelts, street trees, the headquarters
 * planting, the park and the open-desert scatter. Drawn by Vegetation (one InstancedMesh per
 * species); close service cameras read the same list to keep trunks and crowns out of the shot
 * (cameraObstacles.ts).
 */

const FACING_ROTATION: Record<Lot['facing'], number> = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };

export interface Instance {
  species: Species;
  x: number;
  z: number;
  rotation: number;
  scale: number;
  tint: number;
  /** Open-desert scatter lies outside the sun's shadow camera, so it never casts. */
  scatter?: boolean;
}

export function collectInstances(density: number): Instance[] {
  const out: Instance[] = [];
  // Residential yards
  for (const lot of HOUSE_LOTS) {
    const plan = yardPlan(lot);
    const rot = FACING_ROTATION[lot.facing];
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (const p of plan.plants) {
      // Local (x, z) with front at -z, rotated into world.
      const wx = lot.center.x + p.x * cos + p.z * sin;
      const wz = lot.center.z - p.x * sin + p.z * cos;
      out.push({ species: p.species, x: wx, z: wz, rotation: p.rotation + rot, scale: p.scale, tint: 0.92 + ((plan.seed >> 4) % 17) / 100 });
    }
  }
  // Common-area greenbelts between the rows.
  for (const gb of greenbelts()) for (const p of gb.plants) out.push({ species: p.species, x: p.x, z: p.z, rotation: p.rotation, scale: p.scale, tint: 0.95 });
  const rnd = makeDecoRng(4242);
  // Street palms along the avenues; mesquite along the east-west streets at block corners.
  for (const st of STREETS.filter((s) => s.axis === 'z')) {
    for (let along = -WORLD_HALF + 24; along < WORLD_HALF - 10; along += 22) {
      for (const side of [-1, 1]) {
        const x = st.at + side * (ROAD_WIDTH / 2 + SIDEWALK_WIDTH + 2.2);
        const z = along + (rnd() - 0.5) * 4;
        if (st.id === 'av-c' && side === 1 && z > 32 && z < 68) continue; // HQ driveway
        if (Math.abs(z) < 7 || Math.abs(Math.abs(z) - 100) < 7) continue; // intersections
        out.push({ species: rnd() < 0.7 ? 'palm' : 'mesquite', x, z, rotation: rnd() * Math.PI * 2, scale: 0.85 + rnd() * 0.4, tint: 0.95 + rnd() * 0.1 });
      }
    }
  }
  // Headquarters: fan palms along the north bed and the street, date palms in the lot island,
  // mesquites at the staff patio, agave and shrubs at the sign and planters.
  const hx = HQ_LOT.center.x;
  const hz = HQ_LOT.center.z;
  const hqPlant = (species: Species, lx: number, lz: number, scale = 1) => out.push({ species, x: hx + lx, z: hz + lz, rotation: rnd() * 6.28, scale: scale * (0.95 + rnd() * 0.2), tint: 0.95 + rnd() * 0.1 });
  for (const lx of [-48, -38, -28, -18, -8]) hqPlant('palm', lx, -38.5, 1.0 + rnd() * 0.25);
  for (const lz of [-30, -22, 16, 26, 36]) hqPlant('palm', -56.2, lz, 0.9 + rnd() * 0.3);
  for (const lz of [-26, -12, 0]) hqPlant('date-palm', -25.5, lz, 0.95);
  hqPlant('date-palm', -14, -5, 1.0);
  for (const [lx, lz] of [[-30, 37], [-38, 38], [-46, 36], [-22, 38]] as [number, number][]) hqPlant('mesquite', lx, lz, 1.1);
  for (const [lx, lz] of [[-54.5, -20], [-54.5, -12], [-56.3, -34], [-56.3, 8], [-56.3, 32], [-40, -36.5], [-32, -36.5], [-18, -36.5], [-10, -36.5]] as [number, number][]) hqPlant(rnd() < 0.5 ? 'agave' : 'shrub-sage', lx, lz, 0.9 + rnd() * 0.4);
  for (const [lx, lz] of [[-44, -37.5], [-14, -37.5], [-56.5, 24]] as [number, number][]) hqPlant('boulder', lx, lz, 0.8);
  for (const lz of [-29.2, -18.8]) hqPlant('flower-pink', -4.0, lz, 0.9); // entry planters
  for (const [lx, lz] of [[-26, 34], [-34, 35], [-42, 34.5], [-28, 40]] as [number, number][]) hqPlant('shrub-green', lx, lz, 1.1);
  // Environment Revolution planting: parking-island understorey and the east-strip tree screen.
  for (const p of hqLandscapePlants()) hqPlant(p.species, p.x, p.z, p.scale);
  // Park
  for (let i = 0; i < 16; i++) {
    out.push({ species: i % 3 === 0 ? 'palm' : i % 3 === 1 ? 'olive' : 'mesquite', x: PARK_LOT.center.x + (rnd() - 0.5) * (PARK_LOT.width - 12), z: PARK_LOT.center.z + (rnd() - 0.5) * (PARK_LOT.depth - 12), rotation: rnd() * 6.28, scale: 0.9 + rnd() * 0.5, tint: 0.95 + rnd() * 0.1 });
  }
  // Open desert: creosote-like shrubs, rocks and the odd boulder, thinned by quality.
  const scatter = Math.round(420 * density);
  for (let i = 0; i < scatter; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 232 + rnd() * 320;
    const r = rnd();
    if (!isOpenDesert(Math.cos(a) * d, Math.sin(a) * d)) continue;
    out.push({ species: r < 0.6 ? 'shrub-sage' : r < 0.8 ? 'rock' : r < 0.9 ? 'boulder' : 'agave', x: Math.cos(a) * d, z: Math.sin(a) * d, rotation: rnd() * 6.28, scale: 1 + rnd() * 1.4, tint: 0.9 + rnd() * 0.2, scatter: true });
  }
  return out;
}
