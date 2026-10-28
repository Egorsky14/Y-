import { HOUSE_LOTS, type HouseStyle, type Lot } from '@/game/world/cityLayout';
import { makeDecoRng } from '../assets/random';

/**
 * Deterministic property design for every residential lot (no Three.js, no Math.random): an
 * archetype picks the landscape language, then the plan lays out ground zones, hardscape, outdoor
 * furniture, utility details and planting around fixed obstacles (house footprint, driveway,
 * walkway, the condenser's service side and the technician's approach from the street). The house
 * builder and the vegetation layer only render the plan; neither makes random choices of its own.
 *
 * Lot-local frame (shared with HouseBuilder): +x toward the condenser side, -z toward the street.
 * Lots are 29 m wide and 36 m deep: x in [-14.5, 14.5], z in [-18, 18]. Block walls stand at
 * x = ±13.9 (from the house front back) and z = 17.2.
 */

export type Archetype = 'classic-xeriscape' | 'modern-minimal' | 'family' | 'upscale' | 'older' | 'rental' | 'entertainer' | 'desert-garden';
export const ARCHETYPES: Archetype[] = ['classic-xeriscape', 'modern-minimal', 'family', 'upscale', 'older', 'rental', 'entertainer', 'desert-garden'];

export type GroundMat = 'dg' | 'rock-light' | 'rock-gray' | 'rock-brown' | 'rock-red' | 'mulch' | 'soil' | 'turf' | 'turf-dry';
export type HardMat = 'concrete' | 'concrete-old' | 'pavers' | 'travertine' | 'flagstone';
export type Species =
  | 'palm' | 'date-palm' | 'mesquite' | 'olive' | 'palo-verde' | 'cypress'
  | 'shrub-sage' | 'shrub-green' | 'shrub-red' | 'agave' | 'yucca' | 'desert-grass' | 'groundcover'
  | 'flower-pink' | 'flower-yellow' | 'rock' | 'boulder' | 'barrel-cactus';
export type PropKind = 'dining-set' | 'bistro-set' | 'lounge-chair' | 'grill' | 'sofa-set' | 'fire-pit' | 'umbrella' | 'shed' | 'planter-pot' | 'swing-set' | 'trash-bins' | 'bench';

export interface Rect { x0: number; x1: number; z0: number; z1: number }
export type Poly = [number, number][];

export interface GroundPatch { mat: GroundMat; poly: Poly; layer: number; edge?: 'steel' | 'curb' | 'stone' }
export interface Hardscape { kind: 'patio' | 'path' | 'pad' | 'pool-deck'; mat: HardMat; rect: Rect; rot?: number }
export interface Structure {
  kind: 'pergola' | 'patio-cover' | 'pool' | 'kitchen' | 'seat-wall' | 'raised-bed' | 'utility-box' | 'hose-reel' | 'clothesline';
  rect: Rect;
}
export interface PropPlacement { kind: PropKind; x: number; z: number; rot: number }
export interface PlantPlacement { species: Species; x: number; z: number; rotation: number; scale: number }
export interface DrivewayDesign { x0: number; x1: number; frontZ: number; mat: HardMat; border: 'none' | 'pavers' | 'ribbon'; joints: number }

export interface PropertyPlan {
  lotId: string;
  seed: number;
  archetype: Archetype;
  style: HouseStyle;
  /** Ground that covers the whole lot before any zone is laid on it. */
  baseGround: GroundMat;
  ground: GroundPatch[];
  hardscape: Hardscape[];
  structures: Structure[];
  props: PropPlacement[];
  plants: PlantPlacement[];
  driveway: DrivewayDesign;
  walkway: { x: number; mat: HardMat; stepping: boolean };
  facade: { wallPalette: string[]; wainscot: boolean; accentTrim: boolean; shutters: boolean };
  pool: boolean;
  /** z range of the side yards (between the front and back zones), where the base ground shows. */
  sideBand: [number, number];
  /** Fixed obstacles the plan was laid out around (for tests and debug overlays). */
  exclusions: { kind: 'house' | 'driveway' | 'walkway' | 'service' | 'approach' | 'gate-path'; rect: Rect }[];
}

// ---------------------------------------------------------------------------------------------
// House geometry the plan respects (must match HouseBuilder).

export interface HouseInfo {
  half: number;
  frontZ: number;
  backZ: number;
  footprints: Rect[];
  drive: [number, number];
  walkX: number;
}

const R = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 });

export const HOUSE_INFO: Record<HouseStyle, HouseInfo> = {
  ranch: { half: 8, frontZ: -5.5, backZ: 5.5, footprints: [R(-8, 8, -5.5, 5.5), R(1.3, 5.9, -7.6, -5.5)], drive: [-7.75, -2.25], walkX: 3.4 },
  'two-story': { half: 7, frontZ: -5.5, backZ: 5.5, footprints: [R(-7, 7, -5.5, 5.5), R(-12.6, -6.4, -5.1, 2.1), R(-1.8, 1.8, -7.6, -5.5)], drive: [-12.1, -6.9], walkX: 0 },
  spanish: { half: 8.5, frontZ: -6, backZ: 6, footprints: [R(-8.5, 8.5, -6, 6), R(1.1, 5.9, -7.2, -2.2)], drive: [-8.15, -2.65], walkX: 3.5 },
  modern: { half: 8, frontZ: -5.5, backZ: 5.5, footprints: [R(-8, 2, -5.5, 5.5), R(1, 8, -4, 5), R(-0.9, 2.5, -7.6, -5.4)], drive: [-7.6, -2.4], walkX: 0.8 },
  premium: { half: 9.5, frontZ: -6, backZ: 7, footprints: [R(-9.5, 9.5, -6, 7), R(-15, -7, -5, 3), R(-1.6, 3.6, -8.3, -6)], drive: [-15.25, -6.75], walkX: 1 },
};

export const LOT_HALF_W = 14.5;
export const LOT_HALF_D = 18;
/** Inner faces of the side and rear block walls. */
export const WALL_X = 13.75;
export const WALL_Z = 17.05;
/** Street edge of the lot (back of the sidewalk). */
export const FRONT_LINE = -17.6;

export const UNIT_Z = -3;

// ---------------------------------------------------------------------------------------------
// Geometry helpers

export const overlaps = (a: Rect, b: Rect, pad = 0) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;
export const inside = (x: number, z: number, r: Rect, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
const rectAt = (cx: number, cz: number, w: number, d: number): Rect => R(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2);
const rectPoly = (r: Rect): Poly => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];

/** A soft organic outline (planting island, curved bed) around a centre, clipped to a rect. */
function blob(rnd: () => number, cx: number, cz: number, rx: number, rz: number, clip: Rect, points = 14): Poly {
  const out: Poly = [];
  const phase = rnd() * 6.28;
  const k1 = 0.1 + rnd() * 0.1;
  const k2 = 0.05 + rnd() * 0.08;
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const f = 1 + k1 * Math.sin(a * 2 + phase) + k2 * Math.sin(a * 3 + phase * 1.7);
    out.push([Math.min(clip.x1, Math.max(clip.x0, cx + Math.cos(a) * rx * f)), Math.min(clip.z1, Math.max(clip.z0, cz + Math.sin(a) * rz * f))]);
  }
  return out;
}

/** Rounded rectangle outline (curved lawn and bed corners). */
function roundRect(r: Rect, radius: number, seg = 4): Poly {
  const out: Poly = [];
  const rr = Math.min(radius, (r.x1 - r.x0) / 2, (r.z1 - r.z0) / 2);
  const corners: [number, number, number][] = [[r.x1 - rr, r.z0 + rr, -Math.PI / 2], [r.x1 - rr, r.z1 - rr, 0], [r.x0 + rr, r.z1 - rr, Math.PI / 2], [r.x0 + rr, r.z0 + rr, Math.PI]];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= seg; i++) {
    const a = a0 + (i / seg) * (Math.PI / 2);
    out.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
  }
  return out;
}

export function polyArea(p: Poly): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i];
    const [x1, z1] = p[(i + 1) % p.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
}

export function polyContains(p: Poly, x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i];
    const [xj, zj] = p[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Archetype selection: neighbourhood character per street row, the house style's compatibility,
// and no two neighbours in a row with the same archetype.

const ROW_CHARACTER: Record<string, Archetype[]> = {
  'a-n': ['older', 'family', 'classic-xeriscape', 'rental', 'desert-garden'],
  'n-o': ['older', 'rental', 'classic-xeriscape', 'family', 'desert-garden'],
  'a-s': ['classic-xeriscape', 'family', 'desert-garden', 'entertainer', 'rental', 'modern-minimal'],
  'c-n': ['family', 'classic-xeriscape', 'entertainer', 'desert-garden', 'rental', 'older'],
  'c-s': ['older', 'rental', 'classic-xeriscape', 'family', 'desert-garden'],
  'b-n': ['modern-minimal', 'entertainer', 'desert-garden', 'classic-xeriscape', 'family', 'upscale'],
  'b-s': ['entertainer', 'modern-minimal', 'desert-garden', 'family', 'classic-xeriscape', 'upscale'],
  's-o': ['upscale', 'modern-minimal', 'entertainer', 'desert-garden', 'classic-xeriscape'],
};

const STYLE_FIT: Record<HouseStyle, Archetype[]> = {
  ranch: ['classic-xeriscape', 'rental', 'older', 'family', 'desert-garden', 'entertainer'],
  'two-story': ['family', 'rental', 'classic-xeriscape', 'desert-garden', 'entertainer', 'upscale', 'older'],
  spanish: ['classic-xeriscape', 'desert-garden', 'older', 'family', 'upscale', 'entertainer'],
  modern: ['modern-minimal', 'desert-garden', 'entertainer'],
  premium: ['upscale', 'entertainer'],
};

export function hashLot(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Spreads nearby hashes so consecutive lot ids do not start the LCG in correlated states. */
export function mixSeed(h: number): number {
  let x = (h ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

const archetypeCache = new Map<string, Archetype>();

/** Archetype of a lot; neighbours in the same row are resolved in order so no two adjacent lots match. */
export function archetypeFor(lot: Lot, rowLots: Lot[] = HOUSE_LOTS): Archetype {
  const cached = archetypeCache.get(lot.id);
  if (cached) return cached;
  const prefix = lot.id.replace(/-\d+$/, '');
  const index = Number(lot.id.match(/-(\d+)$/)?.[1] ?? 1) - 1;
  const pool = ROW_CHARACTER[prefix] ?? ARCHETYPES;
  const fit = STYLE_FIT[lot.style ?? 'ranch'];
  let prev: Archetype | undefined;
  if (index > 0) {
    const left = rowLots.find((l) => l.id === `${prefix}-${index}`);
    if (left) prev = archetypeFor(left, rowLots);
  }
  const rnd = makeDecoRng(mixSeed(hashLot(lot.id) + 17));
  const candidates = fit.filter((a) => a !== prev);
  // Prefer the row's character (weighted by its order), fall back to anything that fits the house.
  const weighted: Archetype[] = [];
  for (const a of candidates) {
    const at = pool.indexOf(a);
    // The row's character and the house's own first choice both pull (a modern house is most
    // often a modern-minimal landscape).
    const w = (at < 0 ? 1 : Math.max(2, 7 - at)) + Math.max(0, 6 - fit.indexOf(a) * 3);
    for (let i = 0; i < w; i++) weighted.push(a);
  }
  const pick = weighted[Math.floor(rnd() * weighted.length)] ?? fit[0];
  archetypeCache.set(lot.id, pick);
  return pick;
}

// ---------------------------------------------------------------------------------------------
// Plan builder

const PALETTES: Record<Archetype, string[]> = {
  'classic-xeriscape': ['#e8d2ad', '#dcc09a', '#d8b39a', '#e2c7a1'],
  'modern-minimal': ['#eeece6', '#d6d2c8', '#c3c4b4', '#e4e2dc'],
  family: ['#ead9b9', '#f0e3c8', '#d8c3a5', '#e6d5bb'],
  upscale: ['#f2e6cf', '#e9d8b8', '#ddc7a5', '#efe2c9'],
  older: ['#cfb48f', '#bfae95', '#c7b08a', '#d2bd9c'],
  rental: ['#d9ccb3', '#cdbfa6', '#d6cfc0', '#c9bba0'],
  entertainer: ['#e8c9a8', '#dcc09a', '#ecdcc0', '#d9b896'],
  'desert-garden': ['#cfa983', '#d8b39a', '#c9a27e', '#dcbf9e'],
};

const planCache = new Map<string, PropertyPlan>();

export function propertyPlan(lot: Lot, rowLots: Lot[] = HOUSE_LOTS): PropertyPlan {
  const cached = planCache.get(lot.id);
  if (cached) return cached;
  const plan = buildPlan(lot, archetypeFor(lot, rowLots));
  planCache.set(lot.id, plan);
  return plan;
}

/** Test hook: plans are cached per lot id for the life of the page. */
export function clearPlanCache(): void {
  planCache.clear();
  archetypeCache.clear();
}

function buildPlan(lot: Lot, archetype: Archetype): PropertyPlan {
  const style: HouseStyle = lot.style ?? 'ranch';
  const info = HOUSE_INFO[style];
  const seed = hashLot(lot.id);
  const rnd = makeDecoRng(mixSeed(seed));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const rr = (a: number, b: number) => a + rnd() * (b - a);

  const { half, frontZ, backZ, footprints, drive, walkX } = info;
  const sideWallZ = frontZ + 2; // block walls start two metres behind the house front

  // ---- Fixed obstacles
  const exclusions: PropertyPlan['exclusions'] = [
    ...footprints.map((rect) => ({ kind: 'house' as const, rect })),
    { kind: 'driveway', rect: R(drive[0] - 0.2, drive[1] + 0.2, FRONT_LINE - 0.4, frontZ + 0.2) },
    { kind: 'walkway', rect: R(walkX - 0.85, walkX + 0.85, FRONT_LINE - 0.4, frontZ - 0.6) },
    // Service side of the condenser (unit centre (half + 0.9, -3), service face toward the street).
    { kind: 'service', rect: R(half - 0.05, half + 2.7, UNIT_Z - 2.6, UNIT_Z + 0.9) },
    // Straight walk from the van at the curb to the unit.
    { kind: 'approach', rect: R(half - 1.6, half + 2.4, FRONT_LINE - 0.4, UNIT_Z - 1) },
    // Path from the side gate into the backyard on the condenser side.
    { kind: 'gate-path', rect: R(WALL_X - 1.5, WALL_X, sideWallZ, backZ + 1.6) },
  ];
  const blocked: Rect[] = exclusions.map((e) => e.rect);
  const occupied: Rect[] = [];
  const ground: GroundPatch[] = [];
  const hardscape: Hardscape[] = [];
  const structures: Structure[] = [];
  const props: PropPlacement[] = [];
  const plants: PlantPlacement[] = [];

  const lotRect = R(-WALL_X, WALL_X, FRONT_LINE, WALL_Z);
  const back = R(-WALL_X, WALL_X, backZ, WALL_Z);
  const backDepth = WALL_Z - backZ;

  const free = (r: Rect, pad = 0.15) => r.x0 >= lotRect.x0 - 0.01 && r.x1 <= lotRect.x1 + 0.01 && r.z0 >= lotRect.z0 - 0.01 && r.z1 <= lotRect.z1 + 0.01 && !blocked.some((b) => overlaps(r, b, pad)) && !occupied.some((o) => overlaps(r, o, pad));
  const PROP_SIZE: Record<PropKind, [number, number]> = {
    'dining-set': [2.4, 2.4], 'bistro-set': [1.5, 1.5], 'lounge-chair': [0.8, 2.0], grill: [1.4, 0.7], 'sofa-set': [3.0, 2.6], 'fire-pit': [2.8, 2.6],
    umbrella: [0.5, 0.5], shed: [2.5, 1.9], 'planter-pot': [0.7, 0.7], 'swing-set': [3.6, 2.7], 'trash-bins': [1.6, 0.8], bench: [1.6, 0.7],
  };
  const placeProp = (kind: PropKind, x: number, z: number, rot = 0, opts: { ignore?: Rect } = {}): boolean => {
    const [w, d] = PROP_SIZE[kind];
    const swap = Math.abs(Math.sin(rot)) > 0.7;
    const r = rectAt(x, z, swap ? d : w, swap ? w : d);
    const ok = r.x0 >= lotRect.x0 && r.x1 <= lotRect.x1 && r.z0 >= lotRect.z0 && r.z1 <= lotRect.z1 && !blocked.some((b) => overlaps(r, b, 0.1)) && !occupied.some((o) => o !== opts.ignore && overlaps(r, o, 0.1)) && !plants.some((p) => inside(p.x, p.z, r, 0.25));
    if (!ok) return false;
    occupied.push(r);
    props.push({ kind, x, z, rot });
    return true;
  };
  // Furniture that sits on a patio may overlap the patio's own footprint but nothing else.
  const onPatio = (patio: Rect, kind: PropKind, x: number, z: number, rot = 0) => placeProp(kind, x, z, rot, { ignore: patio });

  const plantRadius = (s: Species) => (s === 'mesquite' || s === 'olive' || s === 'palo-verde' ? 2.4 : s === 'palm' || s === 'date-palm' ? 1.4 : s === 'cypress' ? 0.7 : s === 'boulder' ? 1.1 : 0.45);
  const plantOk = (s: Species, x: number, z: number, scale: number) => {
    const r = plantRadius(s) * scale;
    const trunk = Math.min(r, 0.6);
    if (x - trunk < -WALL_X || x + trunk > WALL_X || z - trunk < FRONT_LINE + 0.3 || z + trunk > WALL_Z) return false;
    // Tree canopies may overhang the yard but not the roof; small plants stay out of every obstacle.
    const canopy = r > 1.5 ? r * 0.75 : trunk;
    if (footprints.some((f) => inside(x, z, f, canopy))) return false;
    if (blocked.some((b) => inside(x, z, b, trunk))) return false;
    if (occupied.some((o) => inside(x, z, o, trunk))) return false;
    for (const p of plants) {
      const minD = (plantRadius(p.species) * p.scale + r) * (r > 1.5 || plantRadius(p.species) > 1.5 ? 0.75 : 0.55);
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < minD * minD) return false;
    }
    return true;
  };
  const plant = (s: Species, x: number, z: number, scale = 1): boolean => {
    if (!plantOk(s, x, z, scale)) return false;
    plants.push({ species: s, x, z, rotation: rnd() * Math.PI * 2, scale });
    return true;
  };
  /** A natural cluster: a focal plant with companions around it at varied distances and sizes. */
  const cluster = (cx: number, cz: number, focal: Species, companions: Species[], count: number, spread: number, scale = 1) => {
    plant(focal, cx, cz, scale * rr(0.9, 1.15));
    for (let i = 0, tries = 0; i < count && tries < count * 6; tries++) {
      const a = rnd() * Math.PI * 2;
      const d = spread * (0.45 + rnd() * 0.75);
      if (plant(pick(companions), cx + Math.cos(a) * d, cz + Math.sin(a) * d * 0.8, scale * rr(0.65, 1.05))) i++;
    }
  };
  /** Plants scattered inside a bed outline, denser toward its centre. */
  const fillBed = (poly: Poly, species: Species[], density: number, scale: [number, number] = [0.75, 1.1]) => {
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), bz0 = Math.min(...zs), bz1 = Math.max(...zs);
    const n = Math.round(polyArea(poly) * density * 0.62);
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
      const x = rr(bx0, bx1);
      const z = rr(bz0, bz1);
      if (!polyContains(poly, x, z)) continue;
      if (plant(pick(species), x, z, rr(scale[0], scale[1]))) i++;
    }
  };
  const bed = (mat: GroundMat, poly: Poly, layer = 2, edge?: GroundPatch['edge']) => ground.push({ mat, poly, layer, edge });

  // ---- Archetype design parameters
  const A = archetype;
  const baseGround: GroundMat = A === 'modern-minimal' ? 'rock-gray' : A === 'older' ? 'soil' : A === 'rental' ? 'dg' : A === 'desert-garden' ? 'dg' : A === 'upscale' ? 'rock-light' : pick(['dg', 'rock-light'] as const);
  const accentRock: GroundMat = A === 'modern-minimal' ? 'rock-gray' : A === 'desert-garden' ? 'rock-red' : A === 'older' ? 'rock-light' : pick(['rock-brown', 'rock-red', 'rock-brown'] as const);
  const patioMat: HardMat = A === 'upscale' ? 'travertine' : A === 'entertainer' || A === 'modern-minimal' ? 'pavers' : A === 'desert-garden' ? 'flagstone' : A === 'older' ? 'concrete-old' : 'concrete';
  const walkMat: HardMat = A === 'upscale' || A === 'entertainer' ? 'pavers' : A === 'desert-garden' ? 'flagstone' : A === 'older' ? 'concrete-old' : 'concrete';
  const accentTree: Species = A === 'modern-minimal' ? pick(['olive', 'palo-verde'] as const) : A === 'desert-garden' ? 'palo-verde' : A === 'upscale' ? pick(['date-palm', 'olive'] as const) : A === 'older' ? pick(['mesquite', 'olive'] as const) : A === 'rental' ? pick(['palm', 'mesquite'] as const) : pick(['mesquite', 'palm', 'olive', 'palo-verde'] as const);
  const desertMix: Species[] = A === 'modern-minimal' ? ['agave', 'desert-grass', 'yucca', 'agave'] : A === 'desert-garden' ? ['agave', 'barrel-cactus', 'yucca', 'desert-grass', 'shrub-sage', 'flower-yellow', 'groundcover'] : A === 'rental' ? ['shrub-sage', 'shrub-green', 'agave'] : A === 'older' ? ['shrub-green', 'shrub-red', 'shrub-sage', 'flower-pink'] : ['shrub-sage', 'agave', 'desert-grass', 'shrub-green', 'flower-pink', 'groundcover', 'barrel-cactus'];

  // ============================== BACKYARD ==============================
  let pool = false;
  {
    const doorX = style === 'premium' ? rr(-3, 3) : style === 'modern' ? -3 : rr(-2.5, 2.5);
    const patioW = A === 'rental' ? 4.6 : A === 'older' ? rr(4.5, 5.5) : A === 'entertainer' ? rr(9.5, 11.5) : A === 'upscale' ? rr(10, 12) : A === 'modern-minimal' ? rr(7.5, 9) : A === 'desert-garden' ? rr(5, 6) : rr(6.5, 8);
    // Pools go to upscale homes (and some entertainers) whose backyards are deep enough for a
    // patio, deck, water and coping; the patio is kept shallower to make room.
    const newerRow = /^(b-|s-o)/.test(lot.id);
    const wantsPool = (A === 'upscale' || (A === 'entertainer' && newerRow && rnd() < 0.2)) && backDepth >= 10;
    const patioD = wantsPool ? 3.0 : A === 'rental' ? 2.6 : A === 'entertainer' || A === 'upscale' ? rr(4.2, 4.8) : A === 'older' ? 3 : rr(3.4, 4.2);
    const px = Math.max(-WALL_X + patioW / 2 + 0.6, Math.min(WALL_X - patioW / 2 - 1.8, doorX));
    // The backyard gets its own ground (it is a different room from the front yard).
    const backGround: GroundMat = A === 'older' ? 'soil' : A === 'modern-minimal' ? 'rock-gray' : A === 'upscale' || A === 'entertainer' ? 'rock-light' : A === 'rental' ? 'rock-light' : 'dg';
    ground.push({ mat: backGround, poly: rectPoly(R(-WALL_X, WALL_X, backZ, WALL_Z)), layer: 0 });
    const patio = R(px - patioW / 2, px + patioW / 2, backZ + 0.02, backZ + patioD);
    hardscape.push({ kind: 'patio', mat: patioMat, rect: patio });
    occupied.push(patio);
    const cover = A === 'family' || A === 'upscale' || (A === 'older' && rnd() < 0.5) ? 'patio-cover' : A === 'entertainer' || A === 'modern-minimal' || (A === 'classic-xeriscape' && rnd() < 0.4) ? 'pergola' : null;
    if (cover) structures.push({ kind: cover, rect: R(patio.x0 + 0.15, Math.min(patio.x1 - 0.15, patio.x0 + Math.min(patioW, 7.5)), patio.z0, patio.z1 - 0.1) });

    // Furniture on the patio.
    const pcx = (patio.x0 + patio.x1) / 2;
    const pcz = (patio.z0 + patio.z1) / 2 + 0.2;
    if (A === 'rental') onPatio(patio, 'bistro-set', pcx, pcz);
    else if (A === 'older') { onPatio(patio, 'bistro-set', pcx - 0.8, pcz); onPatio(patio, 'grill', patio.x1 - 0.6, patio.z0 + 0.5, 0); }
    else if (A === 'modern-minimal') { onPatio(patio, 'sofa-set', patio.x0 + 1.7, pcz); onPatio(patio, 'planter-pot', patio.x1 - 0.5, patio.z0 + 0.5); onPatio(patio, 'planter-pot', patio.x1 - 0.5, patio.z1 - 0.5); }
    else if (A === 'entertainer') {
      onPatio(patio, 'dining-set', patio.x0 + 1.5, pcz);
      onPatio(patio, 'sofa-set', patio.x1 - 1.7, pcz);
      structures.push({ kind: 'kitchen', rect: R(patio.x0 + 3.1, patio.x0 + 5.3, patio.z0 + 0.15, patio.z0 + 0.85) });
    } else if (A === 'upscale') {
      onPatio(patio, 'sofa-set', patio.x0 + 1.7, pcz);
      onPatio(patio, 'dining-set', patio.x0 + 4.6, pcz);
      onPatio(patio, 'grill', patio.x1 - 0.8, patio.z0 + 0.5);
    } else if (A === 'desert-garden') onPatio(patio, 'bistro-set', pcx, pcz);
    else { onPatio(patio, 'dining-set', pcx - 0.6, pcz); onPatio(patio, 'grill', patio.x1 - 0.7, patio.z0 + 0.45); }
    if (A === 'classic-xeriscape' || A === 'family' || A === 'desert-garden') {
      const table = props.find((p) => p.kind === 'dining-set' || p.kind === 'bistro-set');
      if (!cover && table && rnd() < 0.6) props.push({ kind: 'umbrella', x: table.x, z: table.z, rot: 0 });
    }

    // Pool: upscale (and some entertainers) on backyards deep enough for deck and coping.
    if (wantsPool) {
      const pw = rr(6.5, 8.5);
      const pd = Math.min(4, backDepth - patioD - 2.7);
      const pxc = Math.max(-WALL_X + pw / 2 + 2.2, Math.min(WALL_X - pw / 2 - 2.6, px + rr(-1.5, 2.5)));
      const pz0 = patio.z1 + 1.1;
      const water = R(pxc - pw / 2, pxc + pw / 2, pz0, pz0 + pd);
      const deck = R(water.x0 - 1.2, water.x1 + 1.2, patio.z1 + 0.04, Math.min(WALL_Z - 0.5, water.z1 + 1.1));
      if (pd >= 3 && free(deck, 0)) {
        pool = true;
        hardscape.push({ kind: 'pool-deck', mat: patioMat === 'travertine' ? 'travertine' : 'pavers', rect: deck });
        structures.push({ kind: 'pool', rect: water });
        occupied.push(deck);
        // Loungers on the sunny deck strip beside the pool.
        for (let i = 0; i < (A === 'upscale' ? 3 : 2); i++) onPatio(deck, 'lounge-chair', water.x1 + 0.6, water.z0 + 0.6 + i * 1.05, 0);
      }
    }

    // Lawn or turf panel.
    const lawnRect = (() => {
      if (A === 'family') return R(-WALL_X + 1.6, WALL_X - 3.2, patio.z1 + 1.2, WALL_Z - 1.6);
      if (A === 'modern-minimal') return R(px - 3, px + 3.5, patio.z1 + 1.6, Math.min(WALL_Z - 1.8, patio.z1 + 5.4));
      if (A === 'older') return R(-WALL_X + 2.4, rr(2, 6), patio.z1 + 1.4, WALL_Z - 2.2);
      if (A === 'classic-xeriscape' && rnd() < 0.35) return R(px - 3.5, px + 3.5, patio.z1 + 1.4, WALL_Z - 2.6);
      return null;
    })();
    if (lawnRect && !pool && lawnRect.x1 - lawnRect.x0 > 3 && lawnRect.z1 - lawnRect.z0 > 2.5) {
      const mat: GroundMat = A === 'older' ? 'turf-dry' : 'turf';
      ground.push({ mat, poly: A === 'older' ? blob(rnd, (lawnRect.x0 + lawnRect.x1) / 2, (lawnRect.z0 + lawnRect.z1) / 2, (lawnRect.x1 - lawnRect.x0) / 2, (lawnRect.z1 - lawnRect.z0) / 2, lawnRect, 16) : roundRect(lawnRect, A === 'modern-minimal' ? 0 : 1.6), layer: 1, edge: A === 'modern-minimal' ? 'steel' : 'curb' });
      if (A === 'family') {
        // Swing set on the lawn's far corner, shade tree on the other.
        placeProp('swing-set', lawnRect.x1 - 2.4, lawnRect.z1 - 1.6, 0);
        plant(accentTree === 'palm' ? 'mesquite' : accentTree, lawnRect.x0 + 2.6, lawnRect.z1 - 0.8, rr(1.0, 1.2));
      }
    }

    if (A === 'older' || A === 'family' || A === 'rental' || (A === 'classic-xeriscape' && rnd() < 0.5)) {
      // Storage shed in a back corner (opposite the gate path).
      if (!placeProp('shed', -WALL_X + 1.45, WALL_Z - 1.15, 0)) placeProp('shed', -WALL_X + 1.45, WALL_Z - 4.2, 0);
    }
    // Planting beds along the rear wall and the far side wall (L-shaped border), with
    // archetype-specific shape and species.
    const rearBedDepth = A === 'rental' ? 1.7 : A === 'desert-garden' ? 3.2 : A === 'family' ? 2.3 : 3.0;
    if (A === 'modern-minimal') {
      const strip = R(-WALL_X + 0.1, WALL_X - 0.1, WALL_Z - 1.5, WALL_Z - 0.05);
      bed('rock-light', rectPoly(strip), 2, 'steel');
      for (let x = strip.x0 + 1.2; x < strip.x1 - 1; x += rr(1.6, 2.6)) plant(rnd() < 0.55 ? 'desert-grass' : rnd() < 0.5 ? 'agave' : 'yucca', x, rr(strip.z0 + 0.4, strip.z1 - 0.5), rr(0.8, 1.1));
      plant('cypress', strip.x0 + 0.8, strip.z1 - 0.6, 1);
      plant('cypress', strip.x1 - 0.8, strip.z1 - 0.6, 1);
      structures.push({ kind: 'raised-bed', rect: R(patio.x1 + 0.8, Math.min(WALL_X - 2.0, patio.x1 + 3.2), backZ + 0.4, backZ + 1.4) });
    } else if (A === 'desert-garden') {
      const curved = blob(rnd, rr(-4, 4), WALL_Z - 2.2, WALL_X - 1, 2.6, R(-WALL_X, WALL_X, backZ + patioD + 0.8, WALL_Z), 20);
      bed(accentRock, curved, 2, 'stone');
      fillBed(curved, desertMix, 0.45);
      const island = blob(rnd, rr(-8, -4), backZ + patioD + 2.4, 2.2, 1.5, back, 12);
      bed('rock-brown', island, 3, 'stone');
      plant('boulder', (island[0][0] + island[6][0]) / 2, (island[0][1] + island[6][1]) / 2, rr(0.7, 0.9));
      fillBed(island, ['barrel-cactus', 'agave', 'groundcover'], 0.7);
      plant('palo-verde', rr(5, 9), WALL_Z - 2.6, rr(1.0, 1.15));
      // Flagstone stepping path from the patio into the garden.
      for (let i = 0; i < 5; i++) hardscape.push({ kind: 'pad', mat: 'flagstone', rect: rectAt(px + 2.5 + i * 1.1 + Math.sin(i) * 0.4, backZ + patioD + 0.7 + i * 0.85, 0.75, 0.6), rot: i * 0.6 });
      placeProp('fire-pit', rr(-1, 3), WALL_Z - 5.2, 0);
    } else {
      const rearBed = A === 'older' ? blob(rnd, 0, WALL_Z - 1.2, WALL_X - 0.6, 1.5, R(-WALL_X, WALL_X, WALL_Z - 3.2, WALL_Z), 18) : roundRect(R(-WALL_X + 0.05, WALL_X - 0.05, WALL_Z - rearBedDepth, WALL_Z - 0.05), A === 'rental' ? 0 : 1.0);
      bed(A === 'older' ? 'mulch' : accentRock, rearBed, 2, A === 'rental' ? undefined : 'curb');
      fillBed(rearBed, desertMix, A === 'rental' ? 0.16 : A === 'upscale' ? 0.3 : 0.24);
      // Trees anchor the rear bed so the yard has canopy from the strategy camera.
      if (A !== 'family') plant(A === 'rental' ? 'palm' : accentTree, rr(1, 7), WALL_Z - rearBedDepth / 2 - 0.2, rr(0.95, 1.15));
      // Side border along the wall opposite the gate path.
      if (A !== 'rental') {
        const side = roundRect(R(-WALL_X + 0.05, -WALL_X + 1.6, backZ + 0.6, WALL_Z - rearBedDepth), 0.6);
        bed(A === 'older' ? 'mulch' : accentRock, side, 2, 'curb');
        fillBed(side, desertMix, 0.28);
      }
      // A shade tree or palms where there is room.
      if (A === 'upscale') { plant('date-palm', -WALL_X + 2.2, WALL_Z - 2.0, rr(0.85, 1.0)); plant('date-palm', WALL_X - 2.4, WALL_Z - 2.0, rr(0.85, 1.0)); }
      else if (A === 'older') { plant(accentTree, rr(-8, -4), WALL_Z - 3.6, rr(1.2, 1.4)); plant('palm', WALL_X - 3, WALL_Z - 1.6, rr(1.0, 1.2)); }
      else if (A !== 'family') plant(accentTree, rr(-10, -6), WALL_Z - 2.4, rr(0.95, 1.15));
    }

    // An island bed in the open middle of the backyard: boulder group, small tree, desert cluster.
    if (!pool && !lawnRect && A !== 'desert-garden' && A !== 'modern-minimal') {
      const ix = px > 0 ? rr(-9, -5) : rr(5, 9);
      const iz = Math.min(WALL_Z - (A === 'rental' ? 2.4 : 4.6), backZ + patioD + rr(2.2, 3.0));
      const island = blob(rnd, ix, iz, A === 'rental' ? 1.6 : 2.6, A === 'rental' ? 1.1 : 1.6, back, 14);
      bed(A === 'older' ? 'mulch' : accentRock, island, 3, A === 'rental' ? undefined : 'stone');
      plant('boulder', ix + rr(-0.6, 0.6), iz + rr(-0.3, 0.3), rr(0.55, 0.75));
      if (A !== 'rental') plant(A === 'older' ? 'olive' : pick(['palo-verde', 'mesquite', 'olive'] as const), ix + rr(-1.2, 1.2), iz, rr(0.85, 1.0));
      fillBed(island, desertMix, A === 'rental' ? 0.4 : 0.55);
    }

    if (A === 'rental') cluster(rr(-9, -4), backZ + rr(4, 6), 'boulder', ['shrub-sage', 'agave', 'desert-grass'], 3, 1.4, 0.8);

    // Outdoor living extras and utility details.
    if (A === 'entertainer' && !pool) placeProp('fire-pit', patio.x1 - 2.2, patio.z1 + 2.6, 0);
    if (A === 'upscale' && !pool) placeProp('fire-pit', px, patio.z1 + 2.8, 0);
    if (A === 'older' && rnd() < 0.7) structures.push({ kind: 'clothesline', rect: R(rr(0, 3), rr(6, 9), WALL_Z - 4.5, WALL_Z - 4.4) });
    if (A === 'older' || A === 'classic-xeriscape') placeProp('bench', rr(-3, 3), WALL_Z - 2.9, Math.PI);
    // Hose reel and a utility box on the house's rear corner by the gate path.
    structures.push({ kind: 'hose-reel', rect: R(half - 1.4, half - 0.8, backZ + 0.05, backZ + 0.45) });
    if (style !== 'modern') structures.push({ kind: 'utility-box', rect: R(-half + 1.0, -half + 1.6, backZ + 0.02, backZ + 0.3) });
    // Low-maintenance lots still read as designed: two-tone gravel band along the walls and a
    // stepping path to the gate.
    if (A === 'rental' || A === 'classic-xeriscape') {
      for (let i = 0; i < 4; i++) hardscape.push({ kind: 'pad', mat: A === 'rental' ? 'concrete' : 'flagstone', rect: rectAt(Math.min(WALL_X - 0.9, patio.x1 + 1.2 + i * 1.15), backZ + 0.9, 0.8, 0.8), rot: 0 });
    }
  }

  // ============================== SIDE YARDS ==============================
  {
    // Trash bins in the side yard on the driveway side, behind the wall line; gravel strip on the condenser side.
    const binX = Math.max(-WALL_X + 0.9, footprints.reduce((m, f) => (f.z1 > sideWallZ && f.x0 < m ? f.x0 : m), -half) - 1.0);
    if (!placeProp('trash-bins', binX, sideWallZ + 1.2, Math.PI / 2)) placeProp('trash-bins', drive[1] + 1.1, frontZ + 0.7, 0);
    bed('rock-gray', rectPoly(R(half + 0.2, WALL_X, sideWallZ, backZ + 0.4)), 1);
  }

  // ============================== FRONT YARD ==============================
  {
    // The front yard is its own landscape room: decorative rock (or turf) from the sidewalk to the
    // house, distinct from the side and back yards.
    const frontMat: GroundMat = A === 'modern-minimal' ? 'rock-gray' : A === 'older' ? 'dg' : A === 'desert-garden' ? 'rock-light' : A === 'rental' ? 'rock-gray' : A === 'family' ? 'dg' : 'rock-light';
    ground.push({ mat: frontMat, poly: rectPoly(R(-LOT_HALF_W + 0.3, LOT_HALF_W - 0.3, FRONT_LINE + 0.05, frontZ + 2)), layer: 0 });
    // Service path from the sidewalk to the side gate along the technician's approach: pavers or
    // stepping stones on the ground only, so the route stays visibly clear.
    for (let z = FRONT_LINE + 0.7, i = 0; z < UNIT_Z - 1.8; z += 0.95, i++) hardscape.push({ kind: 'pad', mat: A === 'upscale' || A === 'entertainer' ? 'pavers' : A === 'desert-garden' || A === 'classic-xeriscape' ? 'flagstone' : 'concrete', rect: rectAt(half + 0.9 + (i % 2 ? 0.12 : -0.12), z, 0.95, 0.6), rot: (i % 3) * 0.05 });
    // Corner bed between the approach and the side wall, along the sidewalk.
    const corner = R(half + 2.6, LOT_HALF_W - 0.5, FRONT_LINE + 0.5, Math.min(frontZ + 1, UNIT_Z - 2.8));
    if (corner.x1 - corner.x0 > 1.2) {
      const poly = A === 'modern-minimal' ? rectPoly(corner) : blob(rnd, (corner.x0 + corner.x1) / 2, (corner.z0 + corner.z1) / 2, (corner.x1 - corner.x0) / 2 + 0.2, (corner.z1 - corner.z0) / 2, corner, 12);
      bed(A === 'older' ? 'mulch' : accentRock, poly, 2, A === 'rental' ? undefined : A === 'modern-minimal' ? 'steel' : 'stone');
      fillBed(poly, desertMix, A === 'rental' ? 0.25 : 0.45);
      if (A !== 'rental' && corner.z1 - corner.z0 > 6) plant(A === 'modern-minimal' ? 'cypress' : rnd() < 0.5 ? 'palm' : accentTree, (corner.x0 + corner.x1) / 2, corner.z0 + 2.4, rr(0.9, 1.1));
    }
    const entryLeft = drive[1] + 0.9; // between the driveway and the walk
    // Foundation bed along the front wall on both sides of the entry walk.
    const fz1 = frontZ - 0.15;
    const fz0 = frontZ - (A === 'rental' ? 1.2 : A === 'upscale' || A === 'desert-garden' ? 2.4 : 1.8);
    const leftBed = R(entryLeft, walkX - 1.0, fz0, fz1);
    const rightBed = R(walkX + 1.0, half - 1.7, fz0, fz1);
    for (const b of [leftBed, rightBed]) {
      if (b.x1 - b.x0 < 1.2) continue;
      const poly = A === 'modern-minimal' || A === 'rental' ? rectPoly(b) : A === 'desert-garden' || A === 'older' ? blob(rnd, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2 + 0.3, R(b.x0, b.x1, b.z0 - 0.6, b.z1), 12) : roundRect(b, 0.7);
      bed(A === 'older' || A === 'family' ? 'mulch' : accentRock, poly, 2, A === 'modern-minimal' ? 'steel' : A === 'rental' ? undefined : 'stone');
      fillBed(poly, A === 'family' || A === 'older' ? ['shrub-green', 'flower-pink', 'shrub-red', 'shrub-sage'] : A === 'upscale' ? ['shrub-green', 'flower-pink', 'groundcover', 'shrub-sage'] : desertMix, A === 'rental' ? 0.35 : 0.75, [0.7, 1.0]);
    }

    // Front lawn or designed gravel garden on the open side of the walk (away from the driveway).
    const openX0 = walkX + 1.1;
    const openX1 = half - 1.9; // the approach corridor to the condenser starts here
    const yard = R(openX0, openX1, FRONT_LINE + 1.0, fz0 - 0.6);
    const farSide = R(-LOT_HALF_W + 0.5, drive[0] - 0.5, FRONT_LINE + 1.0, frontZ - 0.6);
    if ((A === 'family' || A === 'older' || (A === 'upscale' && rnd() < 0.5)) && yard.x1 - yard.x0 > 2.5) {
      ground.push({ mat: A === 'older' ? 'turf-dry' : 'turf', poly: A === 'older' ? blob(rnd, (yard.x0 + yard.x1) / 2, (yard.z0 + yard.z1) / 2, (yard.x1 - yard.x0) / 2, (yard.z1 - yard.z0) / 2, yard, 14) : roundRect(yard, 1.2), layer: 1, edge: 'curb' });
      plant(accentTree, (yard.x0 + yard.x1) / 2 + rr(-1, 1), (yard.z0 + yard.z1) / 2 + rr(-1.5, 1.5), rr(1.0, 1.2));
    } else if (yard.x1 - yard.x0 > 1.2) {
      // Island bed with a boulder group, a specimen tree and a desert cluster.
      const cx = (yard.x0 + yard.x1) / 2 + rr(-0.5, 0.5);
      const cz = (yard.z0 + yard.z1) / 2 + rr(-1.5, 1.5);
      const island = A === 'modern-minimal' ? rectPoly(R(yard.x0 + 0.4, yard.x1 - 0.2, cz - 2.2, cz + 2.2)) : blob(rnd, cx, cz, Math.max(1.4, (yard.x1 - yard.x0) / 2 + 0.3), 3.4, R(yard.x0 - 0.6, yard.x1 + 0.3, FRONT_LINE + 0.6, fz0 - 0.3), 16);
      bed(accentRock, island, 2, A === 'modern-minimal' ? 'steel' : A === 'rental' ? undefined : 'stone');
      plant(accentTree, cx + rr(-0.8, 0.8), cz + rr(-0.5, 0.8), rr(0.95, 1.15));
      if (A !== 'modern-minimal') plant('boulder', cx + rr(-1.5, 1.5), cz - rr(1.2, 2.0), rr(0.6, 0.85));
      fillBed(island, desertMix, A === 'rental' ? 0.18 : A === 'desert-garden' ? 0.6 : 0.4);
    }
    // Between the driveway and the entry walk: a planted bed (or turf on family lots) in front of the foundation planting.
    const mid = R(drive[1] + 0.8, walkX - 1.0, FRONT_LINE + 1.2, fz0 - 0.9);
    if (mid.x1 - mid.x0 > 2.2 && mid.z1 - mid.z0 > 3) {
      if (A === 'family') ground.push({ mat: 'turf', poly: roundRect(mid, 1.0), layer: 1, edge: 'curb' });
      else {
        const poly = A === 'modern-minimal' ? rectPoly(R(mid.x0 + 0.3, mid.x1 - 0.3, mid.z0 + 1, mid.z1 - 0.5)) : blob(rnd, (mid.x0 + mid.x1) / 2, (mid.z0 + mid.z1) / 2, (mid.x1 - mid.x0) / 2, (mid.z1 - mid.z0) / 2 - 0.4, mid, 14);
        bed(accentRock, poly, 2, A === 'modern-minimal' ? 'steel' : A === 'rental' ? undefined : 'stone');
        if (A !== 'rental') plant(pick(['palo-verde', 'olive', 'mesquite'] as const), (mid.x0 + mid.x1) / 2 + rr(-0.6, 0.6), (mid.z0 + mid.z1) / 2, rr(0.85, 1.0));
        fillBed(poly, desertMix, A === 'rental' ? 0.2 : 0.4);
      }
    }
    // The strip beyond the driveway (toward the neighbour) gets its own treatment.
    if (farSide.x1 - farSide.x0 > 1.5) {
      const strip = A === 'modern-minimal' ? rectPoly(farSide) : blob(rnd, (farSide.x0 + farSide.x1) / 2, (farSide.z0 + farSide.z1) / 2, (farSide.x1 - farSide.x0) / 2 + 0.2, (farSide.z1 - farSide.z0) / 2, farSide, 12);
      bed(A === 'older' ? 'mulch' : accentRock, strip, 2, A === 'rental' ? undefined : 'stone');
      if (farSide.x1 - farSide.x0 > 3) plant(rnd() < 0.5 ? 'palm' : accentTree, (farSide.x0 + farSide.x1) / 2, (farSide.z0 + farSide.z1) / 2, rr(0.9, 1.1));
      fillBed(strip, desertMix, A === 'rental' ? 0.15 : 0.35);
    }
    // Clusters along the sidewalk and in the condenser-side front corner (outside the approach).
    if (A !== 'rental') cluster(WALL_X - 1.0, FRONT_LINE + 1.4, A === 'modern-minimal' ? 'yucca' : 'agave', desertMix, 3, 1.4);
    cluster(rr(walkX + 1.6, walkX + 3), FRONT_LINE + 1.3, 'rock', ['agave', 'barrel-cactus', 'shrub-sage', 'groundcover'], A === 'rental' ? 1 : 2, 1.0, 0.9);
    // Entry pots for the more designed homes.
    if (A === 'modern-minimal' || A === 'upscale' || A === 'entertainer') {
      const entryZ = Math.min(frontZ, ...footprints.filter((f) => f.x0 < walkX && f.x1 > walkX).map((f) => f.z0)) - 0.6;
      placeProp('planter-pot', walkX - 1.25, entryZ, 0);
      placeProp('planter-pot', walkX + 1.25, entryZ, 0);
    }
  }

  const driveway: DrivewayDesign = {
    x0: drive[0] + 0.25, x1: drive[1] - 0.25, frontZ,
    mat: A === 'upscale' ? 'pavers' : A === 'older' ? 'concrete-old' : 'concrete',
    border: A === 'modern-minimal' || A === 'entertainer' || A === 'upscale' ? 'pavers' : A === 'desert-garden' && rnd() < 0.5 ? 'ribbon' : 'none',
    joints: A === 'rental' ? 2 : 3,
  };
  const facade = {
    wallPalette: PALETTES[A],
    wainscot: A === 'upscale' || A === 'entertainer' || (A === 'family' && style !== 'two-story'),
    accentTrim: A === 'modern-minimal' || A === 'desert-garden',
    shutters: A === 'family' || A === 'older',
  };
  return {
    lotId: lot.id, seed, archetype, style, baseGround, ground, hardscape, structures, props, plants, driveway,
    walkway: { x: walkX, mat: walkMat, stepping: A === 'modern-minimal' }, facade, pool, sideBand: [frontZ + 1.9, backZ + 0.1], exclusions,
  };
}
