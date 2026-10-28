import * as THREE from 'three';
import { aggregatePbr, pavingPbr, type AggregateKind } from '../assets/pbr';
import { asphaltPbr, blockWallPbr, concretePbr, corrugatedPbr, darkPanelPbr, garageDoorPbr, gravelPbr, lawnPbr, pbrMaterial, sandPbr, shinglePbr, sidingPbr, stuccoPbr, tileRoofPbr } from '../assets/pbr';
import { adaTexture, chainLinkTexture, stainTexture, wearTexture, windowTexture } from '../assets/textures';

/** Shared, cached materials for merged static geometry. Keys match MeshBuilder material names. */
const cache = new Map<string, THREE.Material>();

function cached(key: string, make: () => THREE.Material): THREE.Material {
  const hit = cache.get(key);
  if (hit) return hit;
  const m = make();
  cache.set(key, m);
  return m;
}

// Las Vegas stucco: soft whites and creams, warm tans and adobe, taupe and sage gray (multiplied over the stucco map).
export const WALL_TINTS = ['#f4efe2', '#ead9b9', '#dcc09a', '#cfa983', '#d8b39a', '#bfae95', '#c3c4b4', '#d6d2c8', '#e8c9a8', '#b9a083'];
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
  garageTint: (c: string) => cached(`garage:${c}`, () => pbrMaterial(garageDoorPbr(), { roughness: 0.65, color: c })),
  solar: () => cached('solar', () => new THREE.MeshStandardMaterial({ color: '#15213a', roughness: 0.15, metalness: 0.6, envMapIntensity: 1.4 })),
  bin: () => cached('bin', () => new THREE.MeshStandardMaterial({ color: '#2f6b4f', roughness: 0.7 })),
  concrete: () => cached('concrete', () => pbrMaterial(concretePbr(), { roughness: 0.92 })),
  apron: () => cached('apron', () => pbrMaterial(concretePbr(), { roughness: 0.9, color: '#d8d4cc' })),
  asphalt: () => cached('asphalt', () => pbrMaterial(asphaltPbr(), { roughness: 0.95 })),
  block: () => cached('block', () => pbrMaterial(blockWallPbr(), { roughness: 0.95 })),
  gravel: () => cached('gravel', () => pbrMaterial(gravelPbr(), { roughness: 1 })),
  lawn: () => cached('lawn', () => pbrMaterial(lawnPbr(), { roughness: 1 })),
  sand: () => cached('sand', () => pbrMaterial(sandPbr(), { roughness: 1 })),
  siding: () => cached('siding', () => pbrMaterial(sidingPbr(), { roughness: 0.55, metalness: 0.35 })),
  officeWall: () => cached('officeWall', () => pbrMaterial(stuccoPbr(), { color: '#d8d3c9', roughness: 0.9 })),
  storefront: () => cached('storefront', () => new THREE.MeshStandardMaterial({ color: '#7fa6c4', roughness: 0.12, metalness: 0.6, envMapIntensity: 1.4 })),
  teal: () => cached('teal', () => new THREE.MeshStandardMaterial({ color: '#19d3c5', roughness: 0.45, metalness: 0.2, emissive: '#19d3c5', emissiveIntensity: 0.18 })),
  bollard: () => cached('bollard', () => new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.6 })),
  mulch: () => cached('mulch', () => new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 1 })),
  metal: () => cached('metal', () => new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.45, metalness: 0.7 })),
  darkMetal: () => cached('darkMetal', () => new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.6, metalness: 0.5 })),
  lamp: () => cached('lamp', () => new THREE.MeshStandardMaterial({ color: '#ffe6b8', emissive: '#ffcf80', emissiveIntensity: 0.35, roughness: 0.4 })),
  water: () => cached('water', () => new THREE.MeshStandardMaterial({ color: '#3fb5de', roughness: 0.1, metalness: 0.2, emissive: '#1c8ab5', emissiveIntensity: 0.15, envMapIntensity: 1.5 })),
  wood: () => cached('wood', () => new THREE.MeshStandardMaterial({ color: '#7a5637', roughness: 0.85 })),
  white: () => cached('white', () => new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.7 })),
  dark: () => cached('dark', () => new THREE.MeshStandardMaterial({ color: '#34383d', roughness: 0.7 })),
  doorColor: (c: string) => cached(`door:${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.1 })),
  // ---- Visual-excellence additions: campus, pavement and equipment materials
  darkPanel: () => cached('darkPanel', () => pbrMaterial(darkPanelPbr(), { roughness: 0.45, metalness: 0.35, envMapIntensity: 0.8 })),
  containerBlue: () => cached('containerBlue', () => pbrMaterial(corrugatedPbr([46, 72, 104]), { roughness: 0.6, metalness: 0.4 })),
  containerTeal: () => cached('containerTeal', () => pbrMaterial(corrugatedPbr([24, 110, 104]), { roughness: 0.6, metalness: 0.4 })),
  curb: () => cached('curb', () => new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: 0.95 })),
  stripe: () => cached('stripe', () => new THREE.MeshStandardMaterial({ color: '#e9e9e3', roughness: 0.7 })),
  stripeYellow: () => cached('stripeYellow', () => new THREE.MeshStandardMaterial({ color: '#e7c23a', roughness: 0.7 })),
  stripeBlue: () => cached('stripeBlue', () => new THREE.MeshStandardMaterial({ color: '#2160b8', roughness: 0.7 })),
  ada: () => cached('ada', () => new THREE.MeshStandardMaterial({ map: adaTexture(), roughness: 0.7 })),
  wear: () => cached('wear', () => new THREE.MeshStandardMaterial({ map: wearTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 })),
  stain: () => cached('stain', () => new THREE.MeshStandardMaterial({ map: stainTexture(), transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -1 })),
  chainLink: () => cached('chainLink', () => new THREE.MeshStandardMaterial({ map: chainLinkTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6, color: '#d8dde2' })),
  galvanized: () => cached('galvanized', () => new THREE.MeshStandardMaterial({ color: '#aeb4b9', roughness: 0.35, metalness: 0.8 })),
  unitCabinet: () => cached('unitCabinet', () => new THREE.MeshStandardMaterial({ color: '#c9ccce', roughness: 0.5, metalness: 0.35 })),
  unitCabinetTan: () => cached('unitCabinetTan', () => new THREE.MeshStandardMaterial({ color: '#b9ac92', roughness: 0.55, metalness: 0.3 })),
  grille: () => cached('grille', () => new THREE.MeshStandardMaterial({ color: '#5a5f64', roughness: 0.7, metalness: 0.45 })),
  copper: () => cached('copper', () => new THREE.MeshStandardMaterial({ color: '#b87333', roughness: 0.35, metalness: 0.9 })),
  insulation: () => cached('insulation', () => new THREE.MeshStandardMaterial({ color: '#1e1f22', roughness: 0.95 })),
  rubber: () => cached('rubber', () => new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.9 })),
  cardboard: () => cached('cardboard', () => new THREE.MeshStandardMaterial({ color: '#b8905c', roughness: 0.95 })),
  shrinkWrap: () => cached('shrinkWrap', () => new THREE.MeshStandardMaterial({ color: '#dfe6ea', roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.85 })),
  redSteel: () => cached('redSteel', () => new THREE.MeshStandardMaterial({ color: '#b3362d', roughness: 0.5, metalness: 0.5 })),
  safetyOrange: () => cached('safetyOrange', () => new THREE.MeshStandardMaterial({ color: '#e8702a', roughness: 0.6 })),
  glassDark: () => cached('glassDark', () => new THREE.MeshStandardMaterial({ color: '#2c3d4a', roughness: 0.08, metalness: 0.7, envMapIntensity: 1.6 })),
  interiorLight: () => cached('interiorLight', () => new THREE.MeshStandardMaterial({ color: '#fff6e6', emissive: '#fff1d6', emissiveIntensity: 1.6, roughness: 0.5 })),
  bayFloor: () => cached('bayFloor', () => new THREE.MeshStandardMaterial({ color: '#8f9296', roughness: 0.45, metalness: 0.1 })),
};

/** World-meters-per-repeat for textured material keys used by the builders. */
/** Landscape ground covers (Environment Revolution property plans). */
export function groundMaterial(kind: string): THREE.Material {
  return cached(`ground:${kind}`, () => {
    if (kind === 'turf') return pbrMaterial(lawnPbr(), { roughness: 1 });
    if (kind === 'turf-dry') return pbrMaterial(lawnPbr(), { roughness: 1, color: '#c9bf86' });
    return pbrMaterial(aggregatePbr(kind as AggregateKind), { roughness: 1 });
  });
}

/** Hardscape surfaces: patios, walks, decks and driveways. */
export function hardMaterial(kind: string): THREE.Material {
  return cached(`hard:${kind}`, () => {
    if (kind === 'concrete') return pbrMaterial(concretePbr(), { roughness: 0.92, color: '#ece8e0' });
    if (kind === 'concrete-old') return pbrMaterial(concretePbr(), { roughness: 0.95, color: '#cfc5b4' });
    return pbrMaterial(pavingPbr(kind as 'pavers' | 'travertine' | 'flagstone'), { roughness: kind === 'travertine' ? 0.8 : 0.9 });
  });
}

export const LANDSCAPE_MATERIALS = {
  poolWater: () => cached('poolWater', () => new THREE.MeshStandardMaterial({ color: '#2f9fbf', roughness: 0.05, metalness: 0.1, emissive: '#0d4a63', emissiveIntensity: 0.25, envMapIntensity: 1.6, transparent: true, opacity: 0.88 })),
  poolShell: () => cached('poolShell', () => new THREE.MeshStandardMaterial({ color: '#8fc9d6', roughness: 0.6 })),
  coping: () => cached('coping', () => pbrMaterial(pavingPbr('travertine'), { roughness: 0.8, color: '#f2ece0' })),
  steelEdge: () => cached('steelEdge', () => new THREE.MeshStandardMaterial({ color: '#5b3b27', roughness: 0.8, metalness: 0.3 })),
  curbEdge: () => cached('curbEdge', () => new THREE.MeshStandardMaterial({ color: '#c9c0b0', roughness: 0.95 })),
  stoneEdge: () => cached('stoneEdge', () => new THREE.MeshStandardMaterial({ color: '#9a8468', roughness: 0.95 })),
  pergolaWood: () => cached('pergolaWood', () => new THREE.MeshStandardMaterial({ color: '#8b6a49', roughness: 0.85 })),
  pergolaDark: () => cached('pergolaDark', () => new THREE.MeshStandardMaterial({ color: '#2f2c2a', roughness: 0.6, metalness: 0.4 })),
  stoneVeneer: () => cached('stoneVeneer', () => pbrMaterial(pavingPbr('flagstone'), { roughness: 0.95, color: '#c8b8a2' })),
  counter: () => cached('counter', () => new THREE.MeshStandardMaterial({ color: '#3a3836', roughness: 0.35, metalness: 0.1 })),
  shutter: (c: string) => cached(`shutter:${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })),
  line: () => cached('line', () => new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.8 })),
};

export const UV_SCALES: Record<string, number> = {
  'ground:dg': 3,
  'ground:rock-light': 2.6,
  'ground:rock-gray': 2.6,
  'ground:rock-brown': 2.4,
  'ground:rock-red': 2.4,
  'ground:mulch': 2,
  'ground:soil': 4,
  'ground:turf': 2,
  'ground:turf-dry': 2,
  'hard:concrete': 1.5,
  'hard:concrete-old': 1.5,
  'hard:pavers': 2.4,
  'hard:travertine': 2.4,
  'hard:flagstone': 3.2,
  'bed:rock-light': 2.6,
  'bed:rock-gray': 2.6,
  'bed:rock-brown': 2.4,
  'bed:rock-red': 2.4,
  'bed:mulch': 2,
  'bed:dg': 3,
  'bed:turf': 2,
  coping: 2.4,
  stoneVeneer: 1.6,
  wall: 2.5,
  roof: 3.0,
  garage: 2.6,
  garageTint: 2.6,
  concrete: 1.5,
  asphalt: 6,
  block: 1.2,
  gravel: 1.6,
  lawn: 2,
  sand: 10,
  siding: 2.0,
  officeWall: 2.5,
  roofCap: 1,
  darkPanel: 2.4,
  containerBlue: 2.4,
  containerTeal: 2.4,
};
