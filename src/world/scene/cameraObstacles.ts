import * as THREE from 'three';
import type { Species } from '../city/yardLayout';
import { collectInstances } from '../city/vegetationLayout';
import { signPosts, STREET_LIGHT_HEIGHT, streetLights } from '../roads/streetFurniture';
import { tagOccluder } from './cameraOcclusion';

/**
 * Camera obstacles that are not part of a house: tree trunks and crowns, palms, shrubs and street
 * poles. Houses register their solid parts per lot while the neighbourhood is built; plants and
 * poles come from the same placement lists the renderer draws (vegetationLayout, streetFurniture),
 * turned into boxes once and bucketed on a 16 m grid, so a close camera asks only for what stands
 * within a few tens of metres of the work.
 *
 * Boxes are deliberately simple: a trunk box and a crown box per tree (both upper bounds of the
 * mesh at the instance's scale), one box per shrub. Small ground plants (ground cover, rocks,
 * barrel cacti) never hide a kneeling technician and are left out.
 */

interface Shape {
  /** Trunk half-width and height (m, at scale 1); 0 for plants that are a single mass. */
  trunk?: [number, number];
  /** Crown (or whole plant) half-width, bottom and top (m, at scale 1). */
  crown: [number, number, number];
}

const SHAPES: Partial<Record<Species, Shape>> = {
  palm: { trunk: [0.32, 8.4], crown: [2.5, 7.2, 9.6] },
  'date-palm': { trunk: [0.6, 5.4], crown: [3.2, 4.2, 6.6] },
  mesquite: { trunk: [0.28, 2.6], crown: [2.4, 2.2, 5.3] },
  olive: { trunk: [0.28, 2.6], crown: [2.4, 2.2, 5.3] },
  'palo-verde': { trunk: [0.2, 1.6], crown: [2.4, 1.9, 3.6] },
  cypress: { crown: [0.6, 0, 5.6] },
  yucca: { crown: [0.6, 0, 1.75] },
  'shrub-sage': { crown: [0.72, 0, 0.9] },
  'shrub-green': { crown: [0.72, 0, 0.9] },
  'shrub-red': { crown: [0.72, 0, 1.3] },
  agave: { crown: [0.75, 0, 0.95] },
  'desert-grass': { crown: [0.5, 0, 0.85] },
  'flower-pink': { crown: [0.5, 0, 0.7] },
  'flower-yellow': { crown: [0.5, 0, 0.7] },
  boulder: { crown: [1.3, 0, 1.05] },
};

const CELL = 16;
let grid: Map<string, THREE.Box3[]> | null = null;

function cellKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

function add(box: THREE.Box3, kind: 'plant' | 'pole') {
  tagOccluder(box, kind);
  const cx0 = Math.floor(box.min.x / CELL);
  const cx1 = Math.floor(box.max.x / CELL);
  const cz0 = Math.floor(box.min.z / CELL);
  const cz1 = Math.floor(box.max.z / CELL);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const k = cellKey(cx, cz);
    (grid!.get(k) ?? grid!.set(k, []).get(k)!).push(box);
  }
}

function build() {
  grid = new Map();
  // Placement only (no desert scatter: it stands hundreds of metres from any lot).
  for (const it of collectInstances(0)) {
    if (it.scatter) continue;
    const shape = SHAPES[it.species];
    if (!shape) continue;
    const s = it.scale;
    if (shape.trunk) add(new THREE.Box3(new THREE.Vector3(it.x - shape.trunk[0] * s, 0, it.z - shape.trunk[0] * s), new THREE.Vector3(it.x + shape.trunk[0] * s, shape.trunk[1] * s, it.z + shape.trunk[0] * s)), 'plant');
    const [r, y0, y1] = shape.crown;
    add(new THREE.Box3(new THREE.Vector3(it.x - r * s, y0 * s, it.z - r * s), new THREE.Vector3(it.x + r * s, y1 * s, it.z + r * s)), 'plant');
  }
  for (const l of streetLights()) add(new THREE.Box3(new THREE.Vector3(l.x - 0.16, 0, l.z - 0.16), new THREE.Vector3(l.x + 0.16, STREET_LIGHT_HEIGHT, l.z + 0.16)), 'pole');
  // Sign posts: the post and the sign face (about 0.85 m across) at the top.
  for (const p of signPosts()) add(new THREE.Box3(new THREE.Vector3(p.x - 0.42, 0, p.z - 0.42), new THREE.Vector3(p.x + 0.42, p.height, p.z + 0.42)), 'pole');
}

/** Plant and pole boxes within `radius` (m, horizontally) of a point, each box once. */
export function obstaclesNear(x: number, z: number, radius: number): THREE.Box3[] {
  if (!grid) build();
  const out = new Set<THREE.Box3>();
  const cx0 = Math.floor((x - radius) / CELL);
  const cx1 = Math.floor((x + radius) / CELL);
  const cz0 = Math.floor((z - radius) / CELL);
  const cz1 = Math.floor((z + radius) / CELL);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    for (const b of grid!.get(cellKey(cx, cz)) ?? []) {
      const dx = Math.max(b.min.x - x, 0, x - b.max.x);
      const dz = Math.max(b.min.z - z, 0, z - b.max.z);
      if (dx * dx + dz * dz <= radius * radius) out.add(b);
    }
  }
  return [...out];
}
