import { ALL_LOTS, ROAD_WIDTH, SIDEWALK_WIDTH, STREETS, WORLD_HALF } from '@/game/world/cityLayout';
import { makeDecoRng } from '../assets/random';

/**
 * The world beyond the playable neighborhood: a deterministic, visual-only layout of the rest of the
 * valley. Nothing here is read by the simulation; the road graph, lots, customers and routing live in
 * src/game/world and never see these roads or buildings.
 *
 * Structure, inside out (Las Vegas valley pattern):
 * - the playable district (|x|, |z| <= WORLD_HALF), untouched;
 * - its six streets continue outward as scenic collectors, so no street ends in open sand;
 * - an open desert buffer ring (no buildings) up to the first section-line arterials;
 * - superblocks between arterials: walled subdivisions with mixed lot sizes and house types,
 *   corner retail centres, business parks, a golf course, a school, and undeveloped desert parcels;
 *   development thins with distance and stops toward the western foothills;
 * - natural washes crossing the valley floor; subdivisions leave them open;
 * - mountain ranges beyond (Ground.tsx).
 */

export const EXTENT = 1600; // scenic roads run to here, fading into the haze
export const DEVELOPED = 1150; // no buildings beyond this Chebyshev distance
export const BUFFER = WORLD_HALF + 14; // nothing scenic but roads inside this square

export type RoadKind = 'collector' | 'arterial' | 'parkway';
export interface ScenicRoad {
  axis: 'x' | 'z';
  /** Fixed coordinate (z for east-west roads, x for north-south). */
  at: number;
  from: number;
  to: number;
  kind: RoadKind;
  /** Asphalt width. */
  width: number;
}
export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  y?: number;
  color: number;
}
export interface Roof {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  y: number;
  /** Ridge along z instead of x. */
  turn: boolean;
  color: number;
}
export interface Flat {
  x: number;
  z: number;
  w: number;
  d: number;
  rot?: number;
  color: number;
  /** Layer above the ground: 0 ground patches, 1 paving, 2 water and markings. */
  layer: number;
}
export interface Tree {
  x: number;
  z: number;
  /** Crown radius. */
  r: number;
  /** Trunk height. */
  h: number;
  palm: boolean;
  color: number;
}
export interface Shrub {
  x: number;
  z: number;
  s: number;
  color: number;
}
export type CellKind = 'buffer' | 'subdivision' | 'estates' | 'business' | 'golf' | 'school' | 'desert';
export interface Cell {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  kind: CellKind;
}
export interface Hinterland {
  roads: ScenicRoad[];
  cells: Cell[];
  boxes: Box[];
  roofs: Roof[];
  flats: Flat[];
  trees: Tree[];
  shrubs: Shrub[];
  washes: { x: number; z: number }[][];
  /** Night light positions along arterials (street lights) and at commercial lots. */
  lights: { x: number; z: number; warm: boolean }[];
}

// Section-line arterials (Las Vegas: about every mile; compressed here) and two parkways.
const X_ARTERIALS = [-1180, -860, -560, -300, 300, 560, 860, 1180];
const Z_ARTERIALS = [-1100, -800, -520, -260, 260, 520, 800, 1100];
const PARKWAYS = new Set(['x:-800', 'z:860']);
const WIDTH: Record<RoadKind, number> = { collector: ROAD_WIDTH, arterial: 17, parkway: 26 };

/** Edge of the road reserve on each side of a road's centre line (asphalt, curb, sidewalk, planting). */
export function roadReserve(kind: RoadKind): number {
  return WIDTH[kind] / 2 + (kind === 'collector' ? 0.85 + SIDEWALK_WIDTH : kind === 'arterial' ? 4 : 6);
}

export function scenicRoads(): ScenicRoad[] {
  const roads: ScenicRoad[] = [];
  // Continuations of the playable streets, both directions, as two-lane collectors.
  for (const s of STREETS) {
    roads.push({ axis: s.axis, at: s.at, from: s.to, to: EXTENT, kind: 'collector', width: ROAD_WIDTH });
    roads.push({ axis: s.axis, at: s.at, from: -EXTENT, to: s.from, kind: 'collector', width: ROAD_WIDTH });
  }
  for (const x of X_ARTERIALS) {
    const kind: RoadKind = PARKWAYS.has(`z:${x}`) ? 'parkway' : 'arterial';
    roads.push({ axis: 'z', at: x, from: -EXTENT, to: EXTENT, kind, width: WIDTH[kind] });
  }
  for (const z of Z_ARTERIALS) {
    const kind: RoadKind = PARKWAYS.has(`x:${z}`) ? 'parkway' : 'arterial';
    roads.push({ axis: 'x', at: z, from: -EXTENT, to: EXTENT, kind, width: WIDTH[kind] });
  }
  return roads;
}

/** Natural washes: gently meandering channels that cross the valley floor outside the playable area. */
export function washPaths(): { x: number; z: number }[][] {
  const wash = (pts: [number, number][], seed: number) => {
    const rnd = makeDecoRng(seed);
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 30);
      const nx = -(bz - az);
      const nz = bx - ax;
      const nl = Math.hypot(nx, nz) || 1;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const wob = Math.sin(t * Math.PI * 2 + i * 1.7) * 26 + (rnd() - 0.5) * 18;
        out.push({ x: ax + (bx - ax) * t + (nx / nl) * wob, z: az + (bz - az) * t + (nz / nl) * wob });
      }
    }
    out.push({ x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] });
    return out;
  };
  return [
    // From the western foothills, around the north of the district and off to the north-east.
    wash([[-1700, -560], [-1150, -620], [-700, -650], [-380, -660], [0, -650], [420, -640], [900, -680], [1700, -900]], 301),
    // A southern wash running south-east.
    wash([[-1700, 560], [-1100, 640], [-560, 660], [-120, 650], [380, 660], [760, 700], [1300, 950], [1800, 1150]], 302),
    // A short tributary from the north-west.
    wash([[-1000, -1500], [-930, -1250], [-720, -960], [-420, -660]], 303),
  ];
}

function distToPath(path: { x: number; z: number }[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

export function distToWash(washes: { x: number; z: number }[][], x: number, z: number): number {
  let d = Infinity;
  for (const w of washes) d = Math.min(d, distToPath(w, x, z));
  return d;
}

// Palettes: stucco and roof colours of Las Vegas tract housing (sRGB hex).
const STUCCO = [0xd9c6a5, 0xe3d3b6, 0xcdb48e, 0xd8bfa0, 0xe8dcc6, 0xc9ab86, 0xd2c3a9, 0xbfa483, 0xe0cdb0];
const STUCCO_MODERN = [0xe9e6df, 0xd6d2c8, 0xb9b3a8, 0x8f8b84];
const TILE = [0xa8583a, 0xb4633f, 0x9a5236, 0xbb7a52, 0x8f4a32];
const SHINGLE = [0x6b6159, 0x7a6e62, 0x5d5d5f, 0x857868];
const WALL = 0xcdb894;
const DRIVE = 0xc4c0b6;
const YARD = [0xc9b48f, 0xbfa784, 0xcdbd9c, 0xb59c78, 0xd2c2a2, 0xb8a58a];
const DESERT_TREE = [0x7d8a50, 0x8c9356, 0x6f7d48];
const ASPHALT = 0x3c3e42;
const LAWN = [0x6f8a45, 0x7a9450, 0x667f40];
const DRY = [0xb7a57a, 0xa99a70];
const POOL = 0x3fa6c9;
const ROOF_FLAT = [0xd9d8d3, 0xcfcdc6, 0xe4e2dc];
const COMMERCIAL = [0xd8c7a8, 0xc7b391, 0xe1d6c2, 0xb8a98f];
const TREE = [0x5f7a3c, 0x6b8443, 0x577236, 0x748a4a, 0x80934e];
const SHRUB = [0x7c7a52, 0x8a835a, 0x6f6f4c, 0x958b62, 0x7a6f55];

function pick<T>(rnd: () => number, list: T[]): T {
  return list[Math.floor(rnd() * list.length) % list.length];
}

interface Ctx {
  rnd: () => number;
  out: Hinterland;
  washes: { x: number; z: number }[][];
  /** Development falloff 0..1 (1 near the district). */
  density: number;
}

function wall(c: Ctx, x0: number, z0: number, x1: number, z1: number, h = 1.8) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 1) return;
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  c.out.boxes.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: alongX ? len : 0.3, d: alongX ? 0.3 : len, h, color: WALL });
}

/** One house facing a street; `dir` is the unit vector from the house toward its street. */
function house(c: Ctx, x: number, z: number, dir: { x: number; z: number }, lotW: number, lotD: number, style: 'tract' | 'estate' | 'modern') {
  const { rnd, out } = c;
  const big = style === 'estate';
  const w = big ? 18 + rnd() * 6 : Math.min(lotW - 3.5, 14 + rnd() * 2.5); // width along the street
  const d = (big ? 13 : 10) + rnd() * 3;
  const twoStory = !big && rnd() < 0.35;
  // The lot itself: a graded, landscaped pad (rock mulch tones), and a block wall on one side line.
  out.flats.push({ x, z, w: dir.z !== 0 ? lotW - 0.5 : lotD - 0.5, d: dir.z !== 0 ? lotD - 0.5 : lotW - 0.5, color: pick(rnd, YARD), layer: 0 });
  const sw = rnd() < 0.5 ? -1 : 1;
  if (dir.z !== 0) wall(c, x + sw * lotW / 2, z - dir.z * (lotD / 2 - 0.3), x + sw * lotW / 2, z + dir.z * 1, 1.7);
  else wall(c, x - dir.x * (lotD / 2 - 0.3), z + sw * lotW / 2, x + dir.x * 1, z + sw * lotW / 2, 1.7);
  const h = twoStory ? 6.1 : 3.3 + rnd() * 0.4;
  const alongX = dir.z !== 0; // street runs along x when the house faces north/south
  const W = alongX ? w : d;
  const D = alongX ? d : w;
  const wallColor = style === 'modern' ? pick(rnd, STUCCO_MODERN) : pick(rnd, STUCCO);
  out.boxes.push({ x, z, w: W, d: D, h, color: wallColor });
  if (style === 'modern') {
    out.boxes.push({ x, z, w: W + 0.6, d: D + 0.6, h: 0.35, y: h, color: 0x3a3a3c });
  } else {
    const tile = rnd() < 0.7;
    out.roofs.push({ x, z, w: W + 0.9, d: D + 0.9, h: (twoStory ? 2.0 : 2.2) + rnd() * 0.5, y: h, turn: !alongX, color: tile ? pick(rnd, TILE) : pick(rnd, SHINGLE) });
  }
  // Garage wing toward the street on one side, with its door, and the driveway to the curb.
  const side = rnd() < 0.5 ? -1 : 1;
  const gx = x + (alongX ? side * (w / 2 - 3.2) : dir.x * (d / 2 + 2.6));
  const gz = z + (alongX ? dir.z * (d / 2 + 2.6) : side * (w / 2 - 3.2));
  out.boxes.push({ x: gx, z: gz, w: alongX ? 6.4 : 5.2, d: alongX ? 5.2 : 6.4, h: 3.0, color: wallColor });
  out.roofs.push({ x: gx, z: gz, w: alongX ? 7 : 5.8, d: alongX ? 5.8 : 7, h: 1.4, y: 3.0, turn: alongX, color: out.roofs.length ? out.roofs[out.roofs.length - 1].color : TILE[0] });
  const front = (alongX ? D : W) / 2 + 5.2;
  const driveLen = lotD / 2 - front + 1;
  if (driveLen > 1) {
    const cx = gx + dir.x * (2.6 + driveLen / 2);
    const cz = gz + dir.z * (2.6 + driveLen / 2);
    out.flats.push({ x: cx, z: cz, w: alongX ? 5.6 : driveLen, d: alongX ? driveLen : 5.6, color: DRIVE, layer: 1 });
  }
  // Front yard: lawn on some lots, gravel tones on the rest; a tree on most.
  const fx = x + dir.x * (lotD * 0.33);
  const fz = z + dir.z * (lotD * 0.33);
  if (rnd() < 0.3) out.flats.push({ x: fx - (alongX ? side * 3 : 0), z: fz - (alongX ? 0 : side * 3), w: alongX ? lotW * 0.4 : 5, d: alongX ? 5 : lotW * 0.4, color: pick(rnd, LAWN), layer: 0 });
  if (rnd() < 0.75) {
    const palm = rnd() < 0.3;
    out.trees.push({ x: fx - (alongX ? side * (lotW * 0.25) : 0), z: fz - (alongX ? 0 : side * (lotW * 0.25)), r: palm ? 1.6 : 1.8 + rnd() * 1.4, h: palm ? 6 + rnd() * 3 : 1.6 + rnd(), palm, color: pick(rnd, TREE) });
  }
  // Backyard: pool, lawn, a tree or two.
  const bx = x - dir.x * (lotD * 0.33);
  const bz = z - dir.z * (lotD * 0.33);
  const pool = rnd() < (big ? 0.7 : 0.22);
  if (pool) out.flats.push({ x: bx, z: bz, w: alongX ? 7 : 3.6, d: alongX ? 3.6 : 7, color: POOL, layer: 2 });
  else if (rnd() < 0.35) out.flats.push({ x: bx, z: bz, w: alongX ? lotW * 0.6 : 6, d: alongX ? 6 : lotW * 0.6, color: pick(rnd, rnd() < 0.7 ? LAWN : DRY), layer: 0 });
  const nTrees = rnd() < 0.6 ? 1 : rnd() < 0.5 ? 2 : 0;
  for (let i = 0; i < nTrees; i++) {
    const o = (rnd() - 0.5) * lotW * 0.7;
    out.trees.push({ x: bx + (alongX ? o : (rnd() - 0.5) * 4) - dir.x * 3, z: bz + (alongX ? (rnd() - 0.5) * 4 : o) - dir.z * 3, r: 1.8 + rnd() * 1.6, h: 1.5 + rnd(), palm: rnd() < 0.2, color: pick(rnd, TREE) });
  }
}

/** Walled subdivision: local streets parallel to the long side, a spine street to the arterial, back-to-back rows. */
function subdivision(c: Ctx, x0: number, z0: number, x1: number, z1: number, style: 'tract' | 'estate' | 'modern') {
  const { rnd, out } = c;
  const lotD = style === 'estate' ? 38 : 27;
  const lotW = style === 'estate' ? 32 : 19 + rnd() * 3;
  const street = 9;
  const W = x1 - x0;
  const D = z1 - z0;
  const rowsAlongX = W >= D; // streets run along the long side
  const L0 = rowsAlongX ? x0 : z0;
  const L1 = rowsAlongX ? x1 : z1;
  const S0 = rowsAlongX ? z0 : x0;
  const S1 = rowsAlongX ? z1 : x1;
  const pitch = 2 * lotD + street;
  const rows = Math.max(1, Math.floor((S1 - S0) / pitch));
  const used = rows * pitch;
  const start = S0 + (S1 - S0 - used) / 2;
  const spine = L0 + (L1 - L0) * (0.35 + rnd() * 0.3);
  const P = (l: number, s: number) => (rowsAlongX ? { x: l, z: s } : { x: s, z: l });
  // Perimeter wall with a gap for the entrance at the spine.
  const a = P(L0, S0);
  const b = P(L1, S1);
  const gapA = spine - 7;
  const gapB = spine + 7;
  const edges: [number, number, number, number][] = rowsAlongX
    ? [[a.x, a.z, gapA, a.z], [gapB, a.z, b.x, a.z], [a.x, b.z, gapA, b.z], [gapB, b.z, b.x, b.z], [a.x, a.z, a.x, b.z], [b.x, a.z, b.x, b.z]]
    : [[a.x, a.z, a.x, gapA], [a.x, gapB, a.x, b.z], [b.x, a.z, b.x, gapA], [b.x, gapB, b.x, b.z], [a.x, a.z, b.x, a.z], [a.x, b.z, b.x, b.z]];
  for (const [p, q, r, s] of edges) wall(c, p, q, r, s);
  // Spine street across all rows.
  const sp = P(spine, (S0 + S1) / 2);
  out.flats.push({ x: sp.x, z: sp.z, w: rowsAlongX ? street : S1 - S0, d: rowsAlongX ? S1 - S0 : street, color: ASPHALT, layer: 1 });
  for (let r = 0; r < rows; r++) {
    const sc = start + r * pitch + lotD + street / 2; // street centre
    const st = P((L0 + L1) / 2, sc);
    out.flats.push({ x: st.x, z: st.z, w: rowsAlongX ? L1 - L0 - 4 : street, d: rowsAlongX ? street : L1 - L0 - 4, color: ASPHALT, layer: 1 });
    // Rear wall between this row's back yards and the next row's.
    if (r > 0) {
      const back = start + r * pitch;
      const w0 = P(L0, back);
      const w1 = P(L1, back);
      wall(c, w0.x, w0.z, w1.x, w1.z, 1.7);
    }
    for (const side of [-1, 1] as const) {
      const hc = sc + side * (street / 2 + lotD / 2);
      const dirToStreet = rowsAlongX ? { x: 0, z: -side } : { x: -side, z: 0 };
      for (let l = L0 + lotW / 2 + 2; l < L1 - lotW / 2 - 2; l += lotW) {
        if (Math.abs(l - spine) < lotW / 2 + street / 2 + 1) continue;
        const p = P(l, hc);
        if (distToWash(c.washes, p.x, p.z) < 34) continue;
        // Thin the far edge of the valley: a few vacant lots and lower build-out with distance.
        if (rnd() > 0.8 + 0.2 * c.density) continue;
        house(c, p.x, p.z, dirToStreet, lotW, lotD, style);
      }
    }
  }
}

/**
 * Custom homes on large desert lots facing the outer road of a first-ring parcel (as in the rural
 * preservation areas of the north-west valley): a row of estates along the edge farthest from the
 * playable district, natural desert behind and around them.
 */
function estateRow(c: Ctx, x0: number, z0: number, x1: number, z1: number) {
  const { rnd } = c;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  // Outer edge: the side of the parcel facing away from the district centre along its dominant axis.
  const alongX = Math.abs(cz) >= Math.abs(cx);
  const dir = alongX ? { x: 0, z: Math.sign(cz) || 1 } : { x: Math.sign(cx) || 1, z: 0 };
  const lotD = 40;
  const lotW = 38;
  const L0 = alongX ? x0 : z0;
  const L1 = alongX ? x1 : z1;
  const edge = alongX ? (dir.z > 0 ? z1 : z0) : (dir.x > 0 ? x1 : x0);
  const hc = edge - (alongX ? dir.z : dir.x) * (lotD / 2 + 1);
  for (let l = L0 + lotW / 2 + 4; l < L1 - lotW / 2 - 2; l += lotW + 6 + rnd() * 14) {
    if (rnd() < 0.18) continue;
    house(c, alongX ? l : hc, alongX ? hc : l, dir, lotW, lotD, 'estate');
  }
  desertParcel(c, x0, z0, x1, z1, 90);
}

function retail(c: Ctx, x0: number, z0: number, x1: number, z1: number, corner: { x: number; z: number }) {
  const { rnd, out } = c;
  out.flats.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, color: ASPHALT, layer: 1 });
  // Stall rows as faint light stripes.
  for (let z = z0 + 14; z < z1 - 26; z += 17) out.flats.push({ x: (x0 + x1) / 2, z, w: (x1 - x0) * 0.62, d: 0.4, color: 0x9a9a96, layer: 2 });
  // Anchor and in-line shops at the back corner (away from the intersection), pad building at the front.
  const bx = corner.x < (x0 + x1) / 2 ? x1 : x0;
  const bz = corner.z < (z0 + z1) / 2 ? z1 : z0;
  const sx = Math.sign((x0 + x1) / 2 - bx) || 1;
  const sz = Math.sign((z0 + z1) / 2 - bz) || 1;
  const col = pick(rnd, COMMERCIAL);
  const mainW = (x1 - x0) * 0.7;
  const mainD = 24;
  const main = { x: bx + sx * (mainW / 2 + 4), z: bz + sz * (mainD / 2 + 4) };
  out.boxes.push({ x: main.x, z: main.z, w: mainW, d: mainD, h: 7.5, color: col });
  out.boxes.push({ x: main.x, z: main.z, w: mainW + 0.6, d: mainD + 0.6, h: 0.4, y: 7.5, color: pick(rnd, ROOF_FLAT) });
  out.boxes.push({ x: main.x, z: main.z + sz * (mainD / 2 + 1.5), w: mainW * 0.9, d: 3, h: 0.5, y: 3.4, color: 0x4a4d52 }); // storefront canopy
  for (let i = 0; i < 4; i++) out.boxes.push({ x: main.x + (rnd() - 0.5) * mainW * 0.8, z: main.z + (rnd() - 0.5) * mainD * 0.6, w: 2.2, d: 1.6, h: 1.2, y: 7.9, color: 0xb9bcbf });
  const pad = { x: corner.x + (Math.sign((x0 + x1) / 2 - corner.x) || 1) * 18, z: corner.z + (Math.sign((z0 + z1) / 2 - corner.z) || 1) * 16 };
  out.boxes.push({ x: pad.x, z: pad.z, w: 16, d: 12, h: 5.5, color: pick(rnd, COMMERCIAL) });
  out.boxes.push({ x: pad.x, z: pad.z, w: 16.6, d: 12.6, h: 0.35, y: 5.5, color: pick(rnd, ROOF_FLAT) });
  // Parking-island trees and a landscape strip along the arterials.
  for (let x = x0 + 10; x < x1 - 6; x += 22) out.trees.push({ x, z: (z0 + z1) / 2 + (rnd() - 0.5) * 6, r: 2 + rnd(), h: 2, palm: rnd() < 0.4, color: pick(rnd, TREE) });
  c.out.lights.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, warm: false }, { x: main.x, z: main.z + sz * (mainD / 2 + 5), warm: true });
}

function business(c: Ctx, x0: number, z0: number, x1: number, z1: number) {
  const { rnd, out } = c;
  const n = 2 + Math.floor(rnd() * 3);
  const W = x1 - x0;
  const along = W >= z1 - z0;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const bx0 = along ? x0 + W * t0 + 8 : x0 + 10;
    const bx1 = along ? x0 + W * t1 - 8 : x1 - 10;
    const bz0 = along ? z0 + 10 : z0 + (z1 - z0) * t0 + 8;
    const bz1 = along ? z1 - 10 : z0 + (z1 - z0) * t1 - 8;
    const bw = Math.min(110, (bx1 - bx0) * (0.45 + rnd() * 0.2));
    const bd = Math.min(70, (bz1 - bz0) * (0.35 + rnd() * 0.2));
    const cx = (bx0 + bx1) / 2 + (rnd() - 0.5) * 10;
    const cz = (bz0 + bz1) / 2 + (rnd() - 0.5) * 10;
    out.flats.push({ x: (bx0 + bx1) / 2, z: (bz0 + bz1) / 2, w: bx1 - bx0, d: bz1 - bz0, color: ASPHALT, layer: 1 });
    const h = 8 + rnd() * 3;
    const col = pick(rnd, COMMERCIAL);
    out.boxes.push({ x: cx, z: cz, w: bw, d: bd, h, color: col });
    out.boxes.push({ x: cx, z: cz, w: bw + 0.5, d: bd + 0.5, h: 0.4, y: h, color: pick(rnd, ROOF_FLAT) });
    for (let k = 0; k < 3; k++) out.boxes.push({ x: cx + (rnd() - 0.5) * bw * 0.7, z: cz + (rnd() - 0.5) * bd * 0.7, w: 2.4, d: 1.8, h: 1.3, y: h + 0.4, color: 0xb9bcbf });
    for (let k = 0; k < 4; k++) out.trees.push({ x: bx0 + (bx1 - bx0) * (k + 0.5) / 4, z: bz0 + 2, r: 2.2, h: 2, palm: false, color: pick(rnd, TREE) });
    out.lights.push({ x: (bx0 + bx1) / 2, z: bz0 + 6, warm: false });
  }
}

function golf(c: Ctx, x0: number, z0: number, x1: number, z1: number) {
  const { rnd, out } = c;
  // Fairways winding through desert landscape, with a lake, bunkers and tree lines; houses on the edge.
  const holes = 6;
  for (let i = 0; i < holes; i++) {
    const cx = x0 + 30 + rnd() * (x1 - x0 - 60);
    const cz = z0 + 30 + rnd() * (z1 - z0 - 60);
    const len = 90 + rnd() * 70;
    const rot = rnd() * Math.PI;
    out.flats.push({ x: cx, z: cz, w: len, d: 26 + rnd() * 10, rot, color: 0x6e8d43, layer: 0 });
    out.flats.push({ x: cx + Math.cos(rot) * len * 0.45, z: cz - Math.sin(rot) * len * 0.45, w: 18, d: 18, rot, color: 0x7fa04c, layer: 1 });
    out.flats.push({ x: cx + Math.cos(rot) * len * 0.3 + 10, z: cz - Math.sin(rot) * len * 0.3 + 8, w: 8, d: 5, rot, color: 0xe2d6b4, layer: 2 });
    for (let k = 0; k < 6; k++) {
      const t = (k / 5 - 0.5) * len;
      const off = (k % 2 ? 1 : -1) * (17 + rnd() * 4);
      out.trees.push({ x: cx + Math.cos(rot) * t + Math.sin(rot) * off, z: cz - Math.sin(rot) * t + Math.cos(rot) * off, r: 2.4 + rnd() * 1.2, h: 2 + rnd() * 4, palm: rnd() < 0.45, color: pick(rnd, TREE) });
    }
  }
  out.flats.push({ x: (x0 + x1) / 2 + 20, z: (z0 + z1) / 2 - 10, w: 60, d: 34, rot: 0.4, color: 0x4f8fa8, layer: 2 });
  out.boxes.push({ x: x0 + 24, z: z0 + 24, w: 30, d: 20, h: 6, color: 0xd8c3a0 });
  out.roofs.push({ x: x0 + 24, z: z0 + 24, w: 32, d: 22, h: 3, y: 6, turn: false, color: TILE[1] });
}

function school(c: Ctx, x0: number, z0: number, x1: number, z1: number) {
  const { rnd, out } = c;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  out.flats.push({ x: cx + (x1 - x0) * 0.2, z: cz, w: (x1 - x0) * 0.45, d: (z1 - z0) * 0.6, color: 0x77924b, layer: 0 });
  out.flats.push({ x: cx + (x1 - x0) * 0.2, z: cz, w: 40, d: 0.5, color: 0xe8e8e2, layer: 2 });
  out.boxes.push({ x: cx - (x1 - x0) * 0.2, z: cz, w: 60, d: 34, h: 8, color: 0xcbb592 });
  out.boxes.push({ x: cx - (x1 - x0) * 0.2, z: cz, w: 60.6, d: 34.6, h: 0.4, y: 8, color: 0xd9d8d3 });
  out.flats.push({ x: cx - (x1 - x0) * 0.2, z: cz + 34, w: 60, d: 26, color: ASPHALT, layer: 1 });
  for (let i = 0; i < 10; i++) out.trees.push({ x: x0 + 10 + rnd() * (x1 - x0 - 20), z: z0 + 8 + rnd() * 6, r: 2.4, h: 2, palm: false, color: pick(rnd, TREE) });
}

function desertParcel(c: Ctx, x0: number, z0: number, x1: number, z1: number, rate: number) {
  const { rnd, out } = c;
  const n = Math.round(((x1 - x0) * (z1 - z0)) / rate);
  // Native scrub in loose clumps (creosote and bursage), with the odd mesquite or palo verde.
  for (let i = 0; i < n; i++) {
    const cx = x0 + rnd() * (x1 - x0);
    const cz = z0 + rnd() * (z1 - z0);
    const k = rnd() < 0.35 ? 3 : 1;
    for (let j = 0; j < k; j++) out.shrubs.push({ x: Math.min(x1, Math.max(x0, cx + (rnd() - 0.5) * 9 * (k > 1 ? 1 : 0))), z: Math.min(z1, Math.max(z0, cz + (rnd() - 0.5) * 9 * (k > 1 ? 1 : 0))), s: 0.6 + rnd() * 1.1, color: pick(rnd, SHRUB) });
  }
  const nt = Math.round(n / 14);
  for (let i = 0; i < nt; i++) out.trees.push({ x: x0 + rnd() * (x1 - x0), z: z0 + rnd() * (z1 - z0), r: 2 + rnd() * 1.6, h: 1.2 + rnd(), palm: false, color: pick(rnd, DESERT_TREE) });
}

let cached: Hinterland | null = null;

/** The full layout (deterministic; built once). `scale` < 1 thins houses and shrubs for low quality. */
export function hinterland(): Hinterland {
  if (cached) return cached;
  const roads = scenicRoads();
  const washes = washPaths();
  const out: Hinterland = { roads, cells: [], boxes: [], roofs: [], flats: [], trees: [], shrubs: [], washes, lights: [] };
  const lineKind = (axis: 'x' | 'z', v: number): RoadKind => roads.find((r) => r.axis === axis && r.at === v)?.kind ?? 'collector';
  const xs = [-EXTENT, ...X_ARTERIALS, -130, 0, 130].sort((a, b) => a - b).concat([EXTENT]);
  const zs = [-EXTENT, ...Z_ARTERIALS, -100, 0, 100].sort((a, b) => a - b).concat([EXTENT]);
  // Lines: x = const roads run along z (axis 'z'); z = const roads run along x (axis 'x').
  const reserveX = (v: number) => (Math.abs(v) === EXTENT ? 0 : roadReserve(lineKind('z', v)));
  const reserveZ = (v: number) => (Math.abs(v) === EXTENT ? 0 : roadReserve(lineKind('x', v)));
  const golfCells = new Set(['560,-800', '-860,520']);
  const schoolCells = new Set(['300,260', '-560,-520']);
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x0 = xs[i] + reserveX(xs[i]) + 3;
      const x1 = xs[i + 1] - reserveX(xs[i + 1]) - 3;
      const z0 = zs[j] + reserveZ(zs[j]) + 3;
      const z1 = zs[j + 1] - reserveZ(zs[j + 1]) - 3;
      if (x1 - x0 < 30 || z1 - z0 < 30) continue;
      const rnd = makeDecoRng(1000 + i * 37 + j * 101);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const cheb = Math.max(Math.abs(cx), Math.abs(cz));
      const overlapsPlay = x0 < BUFFER && x1 > -BUFFER && z0 < BUFFER && z1 > -BUFFER;
      let kind: CellKind;
      const key = `${xs[i]},${zs[j]}`;
      if (overlapsPlay) kind = 'buffer';
      else if (cheb > DEVELOPED || x1 > EXTENT - 60 || x0 < -EXTENT + 60 || z1 > EXTENT - 60 || z0 < -EXTENT + 60) kind = 'desert';
      else if (golfCells.has(key)) kind = 'golf';
      else if (schoolCells.has(key)) kind = 'school';
      else {
        // Western foothills stay largely open; elsewhere development thins with distance.
        const west = cx < -900 ? 0.45 : 0;
        const pDesert = (cheb < 650 ? 0.03 : 0.08) + west + 0.45 * Math.max(0, Math.min(1, (cheb - 700) / 450));
        const r = rnd();
        kind = r < pDesert ? 'desert' : r < pDesert + 0.1 ? 'business' : r < pDesert + 0.22 && cheb < 800 ? 'estates' : 'subdivision';
      }
      out.cells.push({ x0, x1, z0, z1, kind });
      const ctx: Ctx = { rnd, out, washes, density: Math.max(0, Math.min(1, 1 - (cheb - 450) / 800)) };
      // A cell that touches the playable square: its part beyond the playable lots is a first ring of
      // lower-density neighbours (estates, natural desert with trees, a park), never a wall of tract houses.
      const lots = ALL_LOTS.filter((l) => l.center.x + l.width / 2 + 8 > x0 && l.center.x - l.width / 2 - 8 < x1 && l.center.z + l.depth / 2 + 8 > z0 && l.center.z - l.depth / 2 - 8 < z1);
      if (kind === 'buffer') {
        const bx0 = Math.min(...lots.map((l) => l.center.x - l.width / 2 - 10));
        const bx1 = Math.max(...lots.map((l) => l.center.x + l.width / 2 + 10));
        const bz0 = Math.min(...lots.map((l) => l.center.z - l.depth / 2 - 10));
        const bz1 = Math.max(...lots.map((l) => l.center.z + l.depth / 2 + 10));
        const slabs: [number, number, number, number][] = lots.length ? [[x0, z0, Math.min(x1, bx0), z1], [Math.max(x0, bx1), z0, x1, z1], [x0, z0, x1, Math.min(z1, bz0)], [x0, Math.max(z0, bz1), x1, z1]] : [[x0, z0, x1, z1]];
        const best = slabs.filter(([a, b, cc, d]) => cc - a >= 55 && d - b >= 55).sort((p, q2) => (q2[2] - q2[0]) * (q2[3] - q2[1]) - (p[2] - p[0]) * (p[3] - p[1]))[0];
        if (best) {
          const [a, b, cc, d] = best;
          const pickRing = rnd();
          const roomy = cc - a >= 100 && d - b >= 100;
          const ringKind: CellKind = pickRing < 0.55 ? 'estates' : pickRing < 0.8 || !roomy ? 'desert' : 'school';
          out.cells.push({ x0: a, x1: cc, z0: b, z1: d, kind: ringKind });
          const ring: Ctx = { rnd, out, washes, density: 0.8 };
          if (ringKind === 'estates') estateRow(ring, a, b, cc, d);
          else if (ringKind === 'school') school(ring, a, b, cc, d);
          else desertParcel(ring, a, b, cc, d, 95);
          continue;
        }
      }
      if (kind === 'buffer') {
        // Open desert around the district: sparse native scrub, thinning toward the streets.
        const parts: [number, number, number, number][] = [];
        if (x1 > BUFFER) parts.push([Math.max(x0, BUFFER), z0, x1, z1]);
        if (x0 < -BUFFER) parts.push([x0, z0, Math.min(x1, -BUFFER), z1]);
        if (z1 > BUFFER) parts.push([Math.max(x0, -BUFFER), Math.max(z0, BUFFER), Math.min(x1, BUFFER), z1]);
        if (z0 < -BUFFER) parts.push([Math.max(x0, -BUFFER), z0, Math.min(x1, BUFFER), Math.min(z1, -BUFFER)]);
        for (const [a, b, cc, d] of parts) if (cc - a > 4 && d - b > 4) desertParcel(ctx, a, b, cc, d, 160);
      } else if (kind === 'desert') desertParcel(ctx, x0, z0, x1, z1, cheb > 1300 ? 1200 : 600);
      else if (kind === 'business') business(ctx, x0, z0, x1, z1);
      else if (kind === 'golf') golf(ctx, x0, z0, x1, z1);
      else if (kind === 'school') {
        school(ctx, x0, z0, x1, z1);
      } else {
        // Corner retail at an arterial intersection on some superblocks; houses fill the rest.
        const style: 'tract' | 'estate' | 'modern' = kind === 'estates' ? 'estate' : rnd() < 0.18 ? 'modern' : 'tract';
        const arterialX = (v: number) => lineKind('z', v) !== 'collector';
        const arterialZ = (v: number) => lineKind('x', v) !== 'collector';
        const cornerOk = (arterialX(xs[i]) || arterialX(xs[i + 1])) && (arterialZ(zs[j]) || arterialZ(zs[j + 1]));
        let hx0 = x0;
        let hx1 = x1;
        if (cornerOk && x1 - x0 > 200 && z1 - z0 > 160 && rnd() < 0.45) {
          const left = arterialX(xs[i]) && (!arterialX(xs[i + 1]) || rnd() < 0.5);
          const top = arterialZ(zs[j]) && (!arterialZ(zs[j + 1]) || rnd() < 0.5);
          const rw = 120;
          const rx0 = left ? x0 : x1 - rw;
          const rh = Math.min(110, z1 - z0);
          const rz0 = top ? z0 : z1 - rh;
          retail(ctx, rx0, rz0, rx0 + rw, rz0 + rh, { x: left ? x0 : x1, z: top ? z0 : z1 });
          if (left) hx0 = x0 + rw + 6;
          else hx1 = x1 - rw - 6;
        }
        if (hx1 - hx0 > 60) subdivision(ctx, hx0, z0, hx1, z1, style);
      }
      // Arterial landscape strip: trees along the wall line on arterial frontages near the district.
      if (kind !== 'desert' && kind !== 'buffer' && cheb < 900) {
        for (const [ax, az, bx, bz] of [[x0, z0 - 2, x1, z0 - 2], [x0, z1 + 2, x1, z1 + 2]] as [number, number, number, number][]) {
          for (let x = ax + 8; x < bx - 8; x += 26 + rnd() * 10) out.trees.push({ x, z: az + (bz - az) * 0, r: 1.6, h: 7 + rnd() * 3, palm: true, color: pick(rnd, TREE) });
        }
      }
    }
  }
  // Street lights along arterials and parkways (night only), staggered.
  for (const r of roads) {
    if (r.kind === 'collector') continue;
    for (let a = r.from + 20, k = 0; a < r.to; a += 48, k++) {
      if (Math.max(Math.abs(a), Math.abs(r.at)) > 1450) continue;
      const off = (k % 2 ? 1 : -1) * (r.width / 2 + 1.5);
      out.lights.push(r.axis === 'x' ? { x: a, z: r.at + off, warm: false } : { x: r.at + off, z: a, warm: false });
    }
  }
  cached = out;
  return out;
}

/**
 * Valley-floor height: flat across the developed valley (|x|, |z| up to about 1.25 km, a little less
 * on the western side), then the alluvial fans (bajadas) rise gently toward the ranges.
 */
export function terrainHeight(x: number, z: number): number {
  const r = Math.max(Math.abs(x) * (x < 0 ? 1.12 : 1), Math.abs(z));
  const t = Math.max(0, Math.min(1, (r - 1250) / 1100));
  if (t <= 0) return 0;
  const n = Math.sin(x * 0.004 + 1.3) * Math.cos(z * 0.0035 - 0.4) * 0.5 + 0.5;
  return t * t * (70 + 40 * n);
}

/** True when (x, z) is open ground (not road reserve and not a built parcel), for desert scatter. */
export function isOpenDesert(x: number, z: number): boolean {
  const h = hinterland();
  for (const r of h.roads) {
    const along = r.axis === 'x' ? x : z;
    const across = r.axis === 'x' ? z : x;
    if (along >= r.from - 1 && along <= r.to + 1 && Math.abs(across - r.at) < roadReserve(r.kind) + 2) return false;
  }
  let open = true;
  for (const c of h.cells) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && c.kind !== 'buffer' && c.kind !== 'desert') open = false;
  return open;
}
