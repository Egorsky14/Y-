import * as THREE from 'three';
import { asphaltPbr, blockWallPbr, concretePbr, garageDoorPbr, gravelPbr, lawnPbr, pbrMaterial, sandPbr, shinglePbr, stuccoPbr, tileRoofPbr } from '../assets/pbr';
import { windowTexture } from '../assets/textures';

/** Shared, cached materials for merged static geometry. Keys match MeshBuilder material names. */
const cache = new Map<string, THREE.Material>();

function cached(key: string, make: () => THREE.Material): THREE.Material {
  const hit = cache.get(key);
  if (hit) return hit;
  const m = make();
  cache.set(key, m);
  return m;
}

export const WALL_TINTS = ['#f0e3c8', '#e2c9a2', '#f6f3ea', '#e9c6a3', '#d9d2c4', '#cfd6c6', '#f1d9b8', '#e6dccb'];
export const DOOR_COLORS = ['#6f3f24', '#1b8f86', '#2d3a4a', '#8a2d2d', '#3f3a35'];

export type RoofKind = 'tile' | 'shingle-slate' | 'shingle-brown' | 'shingle-charcoal';

export function wallMaterial(tint: string): THREE.Material {
  return cached(`wall:${tint}`, () => pbrMaterial(stuccoPbr(), { color: tint, roughness: 0.95 }));
}

export function roofMaterial(kind: RoofKind): THREE.Material {
  return cached(`roof:${kind}`, () => {
    if (kind === 'tile') return pbrMaterial(tileRoofPbr(), { roughness: 0.85 });
    const set = kind === 'shingle-slate' ? shinglePbr([92, 98, 106]) : kind === 'shingle-brown' ? shinglePbr([96, 74, 56]) : shinglePbr([58, 60, 64]);
    return pbrMaterial(set, { roughness: 0.95 });
  });
}

export const STATIC_MATERIALS = {
  trim: () => cached('trim', () => new THREE.MeshStandardMaterial({ color: '#f7f5ef', roughness: 0.8 })),
  frame: () => cached('frame', () => new THREE.MeshStandardMaterial({ color: '#2e2a26', roughness: 0.6, metalness: 0.2 })),
  glass: () =>
    cached('glass', () => {
      const t = windowTexture();
      return new THREE.MeshStandardMaterial({ map: t, color: '#a9c8de', roughness: 0.15, metalness: 0.5, envMapIntensity: 1.2 });
    }),
  garage: () => cached('garage', () => pbrMaterial(garageDoorPbr(), { roughness: 0.7 })),
  concrete: () => cached('concrete', () => pbrMaterial(concretePbr(), { roughness: 0.92 })),
  asphalt: () => cached('asphalt', () => pbrMaterial(asphaltPbr(), { roughness: 0.95 })),
  block: () => cached('block', () => pbrMaterial(blockWallPbr(), { roughness: 0.95 })),
  gravel: () => cached('gravel', () => pbrMaterial(gravelPbr(), { roughness: 1 })),
  lawn: () => cached('lawn', () => pbrMaterial(lawnPbr(), { roughness: 1 })),
  sand: () => cached('sand', () => pbrMaterial(sandPbr(), { roughness: 1 })),
  mulch: () => cached('mulch', () => new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 1 })),
  metal: () => cached('metal', () => new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.45, metalness: 0.7 })),
  darkMetal: () => cached('darkMetal', () => new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.6, metalness: 0.5 })),
  lamp: () => cached('lamp', () => new THREE.MeshStandardMaterial({ color: '#ffe6b8', emissive: '#ffcf80', emissiveIntensity: 0.35, roughness: 0.4 })),
  water: () => cached('water', () => new THREE.MeshStandardMaterial({ color: '#3fb5de', roughness: 0.1, metalness: 0.2, emissive: '#1c8ab5', emissiveIntensity: 0.15, envMapIntensity: 1.5 })),
  wood: () => cached('wood', () => new THREE.MeshStandardMaterial({ color: '#7a5637', roughness: 0.85 })),
  white: () => cached('white', () => new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.7 })),
  dark: () => cached('dark', () => new THREE.MeshStandardMaterial({ color: '#34383d', roughness: 0.7 })),
  doorColor: (c: string) => cached(`door:${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.1 })),
};

/** World-meters-per-repeat for textured material keys used by the builders. */
export const UV_SCALES: Record<string, number> = {
  wall: 2.5,
  roof: 3.0,
  garage: 2.6,
  concrete: 1.5,
  asphalt: 6,
  block: 1.2,
  gravel: 1.6,
  lawn: 2,
  sand: 10,
};
