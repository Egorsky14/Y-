import * as THREE from 'three';
import type { Lot, HouseStyle } from '@/game/world/cityLayout';
import { gableEndGeometry, gableRoofGeometry, hipRoofGeometry, MeshBuilder } from '../assets/pbr';
import { makeDecoRng } from '../assets/random';
import { DOOR_COLORS, roofMaterial, STATIC_MATERIALS, UV_SCALES, WALL_TINTS, wallMaterial, type RoofKind } from './materials';
import { hashLot, yardPlan } from '../city/yardLayout';
import { addCondenser } from '../props/hvac';
import { condenserPosition, condenserSideDir, HOUSE_HALF_WIDTH } from '@/game/world/cityLayout';

/**
 * Builds a complete house lot (architecture, hardscape, walls, ground) in local space with the
 * front facing -z, merged into one mesh per material. Vegetation is instanced separately.
 */
export interface HouseVariant {
  wall: string;
  roof: RoofKind;
  door: string;
  lawn: boolean;
}

export function houseVariant(lot: Lot): HouseVariant {
  const seed = hashLot(lot.id);
  const rnd = makeDecoRng(seed);
  const style = lot.style ?? 'ranch';
  const wall = WALL_TINTS[Math.floor(rnd() * WALL_TINTS.length)];
  const roofPick = rnd();
  const roof: RoofKind = style === 'spanish' ? 'tile' : style === 'modern' ? 'shingle-charcoal' : roofPick < 0.4 ? 'tile' : roofPick < 0.65 ? 'shingle-slate' : roofPick < 0.85 ? 'shingle-brown' : 'shingle-charcoal';
  const door = style === 'modern' ? '#19d3c5' : DOOR_COLORS[Math.floor(rnd() * DOOR_COLORS.length)];
  return { wall, roof, door, lawn: yardPlan(lot).lawn };
}

type B = MeshBuilder;

function windowBox(b: B, w: number, h: number, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], sill = true) {
  // Frame slightly proud of the wall, glass recessed, optional sill.
  // Frame slab, glass pane just outside its face, mullion in front of the glass.
  b.box('frame', [w + 0.18, h + 0.18, 0.1], pos, rot);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
  const out = new THREE.Vector3(0, 0, -0.06).applyQuaternion(q);
  // Glass must sit outside the wall: flip if the rotation's front points toward the house center.
  if (out.x * pos[0] + out.z * pos[2] < 0) out.multiplyScalar(-1);
  b.box('glass', [w, h, 0.02], [pos[0] + out.x, pos[1] + out.y, pos[2] + out.z], rot);
  b.box('frame', [0.05, h, 0.03], [pos[0] + out.x * 1.3, pos[1], pos[2] + out.z * 1.3], rot);
  b.box('frame', [w, 0.05, 0.03], [pos[0] + out.x * 1.3, pos[1], pos[2] + out.z * 1.3], rot);
  if (sill) {
    const down = new THREE.Vector3(0, -h / 2 - 0.06, -0.08).applyQuaternion(q);
    b.box('trim', [w + 0.3, 0.1, 0.22], [pos[0] + down.x, pos[1] + down.y, pos[2] + down.z], rot);
  }
}

function frontDoor(b: B, x: number, z: number, w = 1.1, h = 2.2, sidelight = true) {
  b.box('frame', [w + 0.16, h + 0.1, 0.12], [x, h / 2 + 0.02, z]);
  b.box('door', [w, h, 0.06], [x, h / 2, z - 0.08]);
  b.box('metal', [0.04, 0.3, 0.05], [x + w / 2 - 0.15, h * 0.48, z - 0.13]);
  if (sidelight) {
    b.box('frame', [0.4, h, 0.1], [x + w / 2 + 0.3, h / 2, z]);
    b.box('glass', [0.28, h - 0.2, 0.02], [x + w / 2 + 0.3, h / 2, z - 0.07]);
  }
  // Porch light
  b.box('darkMetal', [0.14, 0.28, 0.14], [x - w / 2 - 0.5, h + 0.1, z - 0.1]);
  b.box('lamp', [0.09, 0.18, 0.09], [x - w / 2 - 0.5, h + 0.1, z - 0.1]);
  // Step
  b.box('concrete', [w + 1.2, 0.15, 1.0], [x, 0.075, z - 0.5]);
}

function garageDoor(b: B, x: number, z: number, w: number, h = 2.4) {
  b.box('frame', [w + 0.3, h + 0.2, 0.14], [x, h / 2 + 0.05, z]);
  b.box('garage', [w, h, 0.06], [x, h / 2, z - 0.09]);
  b.box('darkMetal', [0.12, 0.22, 0.12], [x + w / 2 + 0.45, h + 0.1, z - 0.08]);
  b.box('lamp', [0.08, 0.14, 0.08], [x + w / 2 + 0.45, h + 0.1, z - 0.08]);
}

function fascia(b: B, w: number, d: number, y: number, overhang: number, pos: [number, number, number] = [0, 0, 0], soffit = true) {
  const a = w / 2 + overhang;
  const c = d / 2 + overhang;
  b.box('trim', [a * 2 + 0.1, 0.22, 0.08], [pos[0], y - 0.05, pos[2] + c]);
  b.box('trim', [a * 2 + 0.1, 0.22, 0.08], [pos[0], y - 0.05, pos[2] - c]);
  b.box('trim', [0.08, 0.22, c * 2 + 0.1], [pos[0] + a, y - 0.05, pos[2]]);
  b.box('trim', [0.08, 0.22, c * 2 + 0.1], [pos[0] - a, y - 0.05, pos[2]]);
  // Soffit underside only on the primary roof; secondary roofs sit on other roofs or walls.
  if (soffit) b.box('trim', [a * 2, 0.06, c * 2], [pos[0], y - 0.19, pos[2]]);
}

function roofVents(b: B, items: [number, number, number][]) {
  for (const [x, y, z] of items) {
    b.box('metal', [0.32, 0.26, 0.32], [x, y, z]);
    b.box('darkMetal', [0.4, 0.05, 0.4], [x, y + 0.15, z]);
  }
}

function downspouts(b: B, points: [number, number, number][], height: number) {
  for (const [x, z, rotY] of points) {
    b.box('trim', [0.09, height, 0.09], [x, height / 2, z], [0, rotY, 0]);
  }
}

function chimney(b: B, x: number, z: number, baseY: number, h: number, wall: string) {
  void wall;
  b.box('wall', [1.2, h, 0.9], [x, baseY + h / 2, z]);
  b.box('trim', [1.4, 0.18, 1.1], [x, baseY + h + 0.05, z]);
  b.box('darkMetal', [0.5, 0.5, 0.5], [x, baseY + h + 0.38, z]);
}

function hipRoof(b: B, w: number, d: number, h: number, y: number, overhang = 0.7, pos: [number, number, number] = [0, 0, 0], primary = true) {
  b.add('roof', hipRoofGeometry(w, d, h, overhang), [pos[0], y + pos[1], pos[2]]);
  // Ridge cap
  const alongX = w >= d;
  const r = alongX ? Math.max(0.6, (w - d) / 2) : Math.max(0.6, (d - w) / 2);
  b.box('roofCap', alongX ? [r * 2 + 0.4, 0.14, 0.34] : [0.34, 0.14, r * 2 + 0.4], [pos[0], y + pos[1] + h + 0.02, pos[2]]);
  fascia(b, w, d, y + pos[1], overhang, pos, primary);
}

function gableRoof(b: B, w: number, d: number, h: number, y: number, overhang = 0.6, pos: [number, number, number] = [0, 0, 0], primary = true) {
  b.add('roof', gableRoofGeometry(w, d, h, overhang), [pos[0], y + pos[1], pos[2]]);
  b.add('wall', gableEndGeometry(w, h, d / 2, true), [pos[0], y + pos[1], pos[2]]);
  b.add('wall', gableEndGeometry(w, h, -d / 2, false), [pos[0], y + pos[1], pos[2]]);
  b.box('roofCap', [w + overhang * 2 + 0.3, 0.14, 0.34], [pos[0], y + pos[1] + h + 0.02, pos[2]]);
  // Fascia along both eaves and rake boards
  const a = w / 2 + overhang;
  const c = d / 2 + overhang;
  b.box('trim', [a * 2 + 0.1, 0.22, 0.08], [pos[0], y + pos[1] - 0.05, pos[2] + c]);
  b.box('trim', [a * 2 + 0.1, 0.22, 0.08], [pos[0], y + pos[1] - 0.05, pos[2] - c]);
  if (primary) b.box('trim', [a * 2, 0.06, c * 2], [pos[0], y + pos[1] - 0.19, pos[2]]);
}

function blockWall(b: B, lot: Lot, frontZ: number) {
  // Rear and side block walls from the front wall line back to the rear lot line, with pilasters.
  const x0 = -lot.width / 2 + 0.6;
  const x1 = lot.width / 2 - 0.6;
  const zBack = lot.depth / 2 - 0.8;
  const h = 1.8;
  const len = zBack - frontZ;
  b.box('block', [0.2, h, len], [x0, h / 2, frontZ + len / 2]);
  b.box('block', [0.2, h, len], [x1, h / 2, frontZ + len / 2]);
  b.box('block', [x1 - x0, h, 0.2], [0, h / 2, zBack]);
  for (let z = frontZ; z <= zBack + 0.01; z += 6) for (const x of [x0, x1]) b.box('block', [0.36, h + 0.15, 0.36], [x, (h + 0.15) / 2, Math.min(z, zBack)]);
  for (const x of [x0, x1]) b.box('trim', [0.3, 0.06, len], [x, h + 0.03, frontZ + len / 2]);
  b.box('trim', [x1 - x0, 0.06, 0.3], [0, h + 0.03, zBack]);
  // Side gate on the condenser side (dark metal)
  b.box('darkMetal', [0.05, 1.7, 1.2], [x1 - 0.0, 0.85, frontZ + 1.2]);
}

/** Resolves shared material keys, including per-variant keys such as `wall:#f0e3c8`. */
export function houseMaterialResolver(key: string): THREE.Material {
  const [kind, arg] = key.split(':');
  switch (kind) {
    case 'wall':
      return wallMaterial(arg);
    case 'roof':
      return roofMaterial(arg as RoofKind);
    case 'roofCap':
      return arg === 'tile' ? STATIC_MATERIALS.doorColor('#8c3f2b') : STATIC_MATERIALS.dark();
    case 'door':
      return STATIC_MATERIALS.doorColor(arg);
    case 'trim': return STATIC_MATERIALS.trim();
    case 'frame': return STATIC_MATERIALS.frame();
    case 'glass': return STATIC_MATERIALS.glass();
    case 'garage': return STATIC_MATERIALS.garage();
    case 'concrete': return STATIC_MATERIALS.concrete();
    case 'block': return STATIC_MATERIALS.block();
    case 'gravel': return STATIC_MATERIALS.gravel();
    case 'lawn': return STATIC_MATERIALS.lawn();
    case 'mulch': return STATIC_MATERIALS.mulch();
    case 'metal': return STATIC_MATERIALS.metal();
    case 'darkMetal': return STATIC_MATERIALS.darkMetal();
    case 'lamp': return STATIC_MATERIALS.lamp();
    case 'water': return STATIC_MATERIALS.water();
    case 'wood': return STATIC_MATERIALS.wood();
    case 'white': return STATIC_MATERIALS.white();
    case 'dark': return STATIC_MATERIALS.dark();
    case 'garageTint': return STATIC_MATERIALS.garageTint(arg);
    case 'unitCabinet': return STATIC_MATERIALS.unitCabinet();
    case 'grille': return STATIC_MATERIALS.grille();
    case 'insulation': return STATIC_MATERIALS.insulation();
    case 'galvanized': return STATIC_MATERIALS.galvanized();
    case 'copper': return STATIC_MATERIALS.copper();
    case 'solar': return STATIC_MATERIALS.solar();
    case 'bin': return STATIC_MATERIALS.bin();
    case 'rubber': return STATIC_MATERIALS.rubber();
    case 'planter': return STATIC_MATERIALS.doorColor('#8a8580');
    case 'umbrella': return STATIC_MATERIALS.doorColor(arg);
    case 'safetyOrange': return STATIC_MATERIALS.safetyOrange();
    default:
      throw new Error(`Unknown house material ${key}`);
  }
}

const FACING_ROTATION: Record<Lot['facing'], number> = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };

/** Builds every house lot into one shared builder so the whole neighborhood is a handful of draw calls. */
export function buildNeighborhood(lots: Lot[]): THREE.Group {
  const t0 = performance.now();
  const shared = new MeshBuilder(houseMaterialResolver, UV_SCALES);
  for (const lot of lots) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(lot.center.x, 0, lot.center.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), FACING_ROTATION[lot.facing]), new THREE.Vector3(1, 1, 1));
    shared.setFrame(m);
    addHouse(shared, lot);
  }
  shared.setFrame(null);
  const g = shared.build('houses');
  if (import.meta.env.DEV) console.debug(`[build] neighborhood ${(performance.now() - t0).toFixed(0)} ms`);
  return g;
}

/** Single-lot build (used by tests and previews). */
/** Driveway of every built house in its local frame (garage-door line at frontZ), for parked cars. */
export const DRIVEWAYS = new Map<string, { x: number; w: number; frontZ: number }>();

export function buildHouse(lot: Lot): THREE.Group {
  const b = new MeshBuilder(houseMaterialResolver, UV_SCALES);
  addHouse(b, lot);
  return b.build(`house:${lot.id}`);
}

export function addHouse(shared: MeshBuilder, lot: Lot): void {
  const style: HouseStyle = lot.style ?? 'ranch';
  const variant = houseVariant(lot);
  const plan = yardPlan(lot);
  // Alias generic keys to this house's variant materials; everything else is shared.
  const garageTint = ['#e9e6de', '#d9d2c4', '#c9bfae', '#3a3d41'][hashLot(lot.id + 'g') % 4];
  const alias: Record<string, string> = { wall: `wall:${variant.wall}`, roof: `roof:${variant.roof}`, roofCap: `roofCap:${variant.roof}`, door: `door:${variant.door}`, garage: `garageTint:${garageTint}` };
  const b = {
    add: (k: string, g: THREE.BufferGeometry, p?: [number, number, number], r?: [number, number, number], s?: [number, number, number]) => shared.add(alias[k] ?? k, g, p, r, s),
    box: (k: string, size: [number, number, number], p: [number, number, number], r?: [number, number, number]) => shared.box(alias[k] ?? k, size, p, r),
  } as unknown as B;
  const lotW = lot.width;
  const lotD = lot.depth;
  const lotFront = -lotD / 2;

  // Ground cover for the whole lot, lawn panel in front if chosen.
  b.add('gravel', new THREE.PlaneGeometry(lotW - 0.4, lotD - 0.4), [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
  // Mulch beds
  for (const [x, z, w, d] of plan.beds) b.add('mulch', new THREE.PlaneGeometry(w, d), [x, 0.03, z], [-Math.PI / 2, 0, 0]);

  let frontZ: number;
  let driveX: number;
  let driveW = 5.5;
  let walkX: number;

  if (style === 'ranch') {
    const w = 16;
    const d = 11;
    const h = 3.3;
    frontZ = -d / 2;
    b.box('wall', [w, h, d], [0, h / 2, 0]);
    hipRoof(b, w, d, 2.4, h);
    garageDoor(b, -5, -d / 2 - 0.01, 5.2);
    windowBox(b, 1.4, 1.2, [1.6, 1.8, -d / 2 - 0.02]);
    windowBox(b, 1.8, 1.2, [5.6, 1.8, -d / 2 - 0.02]);
    frontDoor(b, 3.5, -d / 2 - 0.02);
    // Porch: slab, two posts, small hip canopy
    b.box('concrete', [4.4, 0.16, 1.9], [3.6, 0.08, -d / 2 - 1.0]);
    for (const x of [1.8, 5.4]) b.box('trim', [0.22, 2.7, 0.22], [x, 1.35, -d / 2 - 1.8]);
    hipRoof(b, 4.4, 2.0, 0.7, 2.75, 0.3, [3.6, 0, -d / 2 - 1.0], false);
    windowBox(b, 1.4, 1.2, [w / 2 + 0.02, 1.8, 0.5], [0, Math.PI / 2, 0]);
    windowBox(b, 1.4, 1.2, [-w / 2 - 0.02, 1.8, 2.5], [0, -Math.PI / 2, 0]);
    windowBox(b, 1.6, 1.2, [-2, 1.8, d / 2 + 0.02], [0, Math.PI, 0]);
    windowBox(b, 1.6, 1.2, [3, 1.8, d / 2 + 0.02], [0, Math.PI, 0]);
    roofVents(b, [[-3, h + 1.0, 2], [4, h + 1.2, -1.5]]);
    downspouts(b, [[-w / 2 - 0.65, -d / 2 - 0.5, 0], [w / 2 + 0.65, d / 2 + 0.5, 0]], h);
    driveX = -5;
    walkX = 3.4;
  } else if (style === 'two-story') {
    const w = 14;
    const d = 11;
    const h = 6.4;
    frontZ = -d / 2;
    b.box('wall', [w, h, d], [0, h / 2, 0]);
    gableRoof(b, w, d, 2.8, h);
    // Stone-look wainscot band on the ground floor front
    b.box('block', [w + 0.06, 1.0, 0.08], [0, 0.5, -d / 2 - 0.03]);
    b.box('trim', [w + 0.1, 0.18, 0.12], [0, 3.25, -d / 2 - 0.04]); // floor band
    // Garage wing
    b.box('wall', [6, 3.3, 7], [-9.5, 1.65, -1.5]);
    hipRoof(b, 6, 7, 1.7, 3.3, 0.5, [-9.5, 0, -1.5], false);
    garageDoor(b, -9.5, -5.01, 4.6);
    windowBox(b, 1.3, 1.3, [-3.5, 1.8, -d / 2 - 0.02]);
    windowBox(b, 1.3, 1.2, [-3.5, 4.8, -d / 2 - 0.02]);
    windowBox(b, 1.3, 1.2, [0, 4.8, -d / 2 - 0.02]);
    windowBox(b, 1.3, 1.2, [3.5, 4.8, -d / 2 - 0.02]);
    windowBox(b, 2.0, 1.4, [3.5, 1.8, -d / 2 - 0.02]);
    frontDoor(b, 0, -d / 2 - 0.02, 1.1, 2.2, true);
    // Entry canopy with posts
    b.box('wall', [3.2, 0.3, 2.0], [0, 2.75, -d / 2 - 1.0]);
    gableRoof(b, 3.2, 2.0, 0.9, 2.9, 0.2, [0, 0, -d / 2 - 1.0], false);
    for (const x of [-1.3, 1.3]) b.box('trim', [0.2, 2.7, 0.2], [x, 1.35, -d / 2 - 1.9]);
    windowBox(b, 1.4, 1.2, [w / 2 + 0.02, 4.8, 0], [0, Math.PI / 2, 0]);
    windowBox(b, 1.4, 1.2, [w / 2 + 0.02, 1.8, 2.5], [0, Math.PI / 2, 0]);
    windowBox(b, 1.4, 1.2, [-w / 2 - 0.02, 4.8, 1.5], [0, -Math.PI / 2, 0]);
    windowBox(b, 2.2, 1.3, [-2, 1.8, d / 2 + 0.02], [0, Math.PI, 0]);
    windowBox(b, 1.4, 1.2, [2.5, 4.8, d / 2 + 0.02], [0, Math.PI, 0]);
    chimney(b, 5.5, 1.5, h + 1.0, 2.2, variant.wall);
    roofVents(b, [[-4, h + 1.0, 3.2]]);
    downspouts(b, [[-w / 2 - 0.65, -d / 2 - 0.6, 0], [w / 2 + 0.65, d / 2 + 0.6, 0]], h);
    driveX = -9.5;
    driveW = 5.2;
    walkX = 0;
  } else if (style === 'spanish') {
    const w = 17;
    const d = 12;
    const h = 3.6;
    frontZ = -d / 2;
    b.box('wall', [w, h, d], [0, h / 2, 0]);
    hipRoof(b, w, d, 2.0, h, 0.8);
    // Entry tower
    b.box('wall', [4.6, 5.6, 4.6], [3.5, 2.8, -4.6]);
    hipRoof(b, 4.6, 4.6, 1.5, 5.6, 0.6, [3.5, 0, -4.6], false);
    // Arched entry: arch made from a half-cylinder shell
    b.add('wall', new THREE.CylinderGeometry(1.05, 1.05, 0.5, 24, 1, false, 0, Math.PI), [3.5, 1.2, -6.9], [Math.PI / 2, 0, 0]);
    b.box('wall', [2.2, 0.5, 0.5], [3.5, 1.2, -6.9]);
    frontDoor(b, 3.5, -6.93, 1.2, 2.2, false);
    windowBox(b, 0.9, 1.3, [3.5, 4.3, -6.93], [0, 0, 0], true);
    garageDoor(b, -5.4, -d / 2 - 0.01, 5.2);
    windowBox(b, 1.3, 1.5, [-0.4, 1.9, -d / 2 - 0.02]);
    windowBox(b, 1.3, 1.5, [-11.0 + 11, 1.9, d / 2 + 0.02], [0, Math.PI, 0]);
    windowBox(b, 1.3, 1.5, [w / 2 + 0.02, 1.9, 1], [0, Math.PI / 2, 0]);
    windowBox(b, 1.3, 1.5, [-w / 2 - 0.02, 1.9, 2], [0, -Math.PI / 2, 0]);
    windowBox(b, 1.6, 1.4, [4, 1.9, d / 2 + 0.02], [0, Math.PI, 0]);
    // Wrought-iron grilles under the front window and decorative clay pipe vents
    for (let i = 0; i < 3; i++) b.box('darkMetal', [0.04, 1.3, 0.04], [-0.9 + i * 0.5, 1.9, -d / 2 - 0.2]);
    for (const x of [-3, 0, 3]) b.add('roofCap', new THREE.CylinderGeometry(0.16, 0.16, 0.5, 10), [x, h + 0.35, -2.5], [Math.PI / 2, 0, 0]);
    roofVents(b, [[-5, h + 0.9, 2.5]]);
    downspouts(b, [[-w / 2 - 0.75, -d / 2 - 0.6, 0], [w / 2 + 0.75, d / 2 + 0.6, 0]], h);
    driveX = -5.4;
    walkX = 3.5;
  } else if (style === 'modern') {
    frontZ = -5.5;
    const light = variant.wall;
    void light;
    b.box('wall', [10, 3.4, 11], [-3, 1.7, 0]);
    b.box('dark', [7, 6.6, 9], [4.5, 3.3, 0.5]);
    b.box('wall', [9, 3.0, 6], [-2.5, 5.0, -1.5]);
    // Parapet caps and thin roof slabs
    b.box('darkMetal', [10.4, 0.25, 11.4], [-3, 3.55, 0]);
    b.box('darkMetal', [7.4, 0.25, 9.4], [4.5, 6.75, 0.5]);
    b.box('darkMetal', [9.4, 0.25, 6.4], [-2.5, 6.62, -1.5]);
    // Wood slat screen on the dark volume
    for (let i = 0; i < 9; i++) b.box('wood', [0.12, 6.2, 0.1], [1.2 + i * 0.75, 3.3, -4.1]);
    windowBox(b, 4.0, 2.4, [4.5, 2.0, -4.02], [0, 0, 0], false);
    windowBox(b, 4.0, 1.5, [4.5, 5.2, -4.02], [0, 0, 0], false);
    windowBox(b, 6.0, 1.6, [-2.5, 5.0, -4.52], [0, 0, 0], false);
    garageDoor(b, -5.0, -5.51, 4.8, 2.5);
    frontDoor(b, 0.8, -5.52, 1.1, 2.4, false);
    windowBox(b, 3.0, 2.2, [8.02, 2.0, 2], [0, Math.PI / 2, 0], false);
    windowBox(b, 2.4, 1.4, [-8.02, 1.9, 1], [0, -Math.PI / 2, 0], false);
    windowBox(b, 3.0, 1.6, [-3, 1.9, 5.52], [0, Math.PI, 0], false);
    // Entry canopy slab + cantilever supports, address lights
    b.box('darkMetal', [3.4, 0.16, 2.2], [0.8, 2.9, -6.5]);
    for (const x of [-0.6, 2.2]) b.box('darkMetal', [0.1, 2.9, 0.1], [x, 1.45, -7.5]);
    roofVents(b, [[-5, 3.8, 2.5], [5, 7.0, 2]]);
    driveX = -5;
    driveW = 5.2;
    walkX = 0.8;
  } else {
    // premium
    const w = 19;
    const d = 13;
    const h = 6.6;
    frontZ = -d / 2 + 0.5;
    b.box('wall', [w, h, d], [0, h / 2, 0.5]);
    hipRoof(b, w, d, 2.4, h, 0.8, [0, 0, 0.5]);
    b.box('trim', [w + 0.1, 0.2, 0.12], [0, 3.3, frontZ - 0.05]);
    b.box('block', [w + 0.06, 0.9, 0.08], [0, 0.45, frontZ - 0.03]);
    // Garage wing (3-car)
    b.box('wall', [8, 3.4, 8], [-11, 1.7, -1]);
    hipRoof(b, 8, 8, 1.9, 3.4, 0.6, [-11, 0, -1], false);
    garageDoor(b, -13, -5.01, 3.0);
    garageDoor(b, -9.2, -5.01, 3.0);
    // Grand entry portico
    b.box('wall', [5, 6.9, 2.2], [1, 3.45, frontZ - 1.1]);
    gableRoof(b, 5, 2.2, 1.4, 6.9, 0.4, [1, 0, frontZ - 1.1], false);
    for (const x of [-1.0, 3.0]) b.add('trim', new THREE.CylinderGeometry(0.22, 0.26, 3.0, 14), [x, 1.5, frontZ - 2.0]);
    frontDoor(b, 1, frontZ - 2.21, 1.6, 2.6, true);
    windowBox(b, 1.6, 1.8, [1, 5.0, frontZ - 2.21], [0, 0, 0], true);
    for (const x of [-5, -1.8, 4.5, 7.5]) windowBox(b, 1.5, 1.5, [x, 1.9, frontZ - 0.02]);
    for (const x of [-5, -1.8, 4.5, 7.5]) windowBox(b, 1.5, 1.4, [x, 5.0, frontZ - 0.02]);
    windowBox(b, 2.2, 1.6, [w / 2 + 0.02, 2.0, 1], [0, Math.PI / 2, 0]);
    windowBox(b, 2.2, 1.4, [w / 2 + 0.02, 5.0, 1], [0, Math.PI / 2, 0]);
    windowBox(b, 2.2, 1.6, [-w / 2 - 0.02, 2.0, 3], [0, -Math.PI / 2, 0]);
    windowBox(b, 3.0, 2.0, [0, 2.0, d / 2 + 0.52], [0, Math.PI, 0], false);
    windowBox(b, 2.0, 1.4, [-5, 5.0, d / 2 + 0.52], [0, Math.PI, 0]);
    windowBox(b, 2.0, 1.4, [5, 5.0, d / 2 + 0.52], [0, Math.PI, 0]);
    chimney(b, -6, 2, h + 1.2, 2.4, variant.wall);
    roofVents(b, [[4, h + 1.4, 3], [-3, h + 1.3, -1]]);
    downspouts(b, [[-w / 2 - 0.75, frontZ - 0.6, 0], [w / 2 + 0.75, d / 2 + 1.1, 0]], h);
    // Pool with deck and a shade sail post
    b.add('water', new THREE.PlaneGeometry(7, 3.5), [0, 0.06, 12], [-Math.PI / 2, 0, 0]);
    b.box('concrete', [9.2, 0.14, 5.6], [0, 0.02, 12]);
    b.box('concrete', [7.4, 0.3, 3.9], [0, -0.1, 12]);
    driveX = -11;
    driveW = 8.5;
    walkX = 1;
  }

  // ---- Outdoor condensing unit against the side wall with the disconnect, whip and line set to the wall.
  {
    const cp = condenserPosition(lot);
    const sd = condenserSideDir(lot);
    // Local frame: the lot's facing rotation maps local +x to the condenser side, so the unit sits at local (half + 0.9, -3).
    void cp; void sd;
    const half = HOUSE_HALF_WIDTH[style];
    const ux = half + 0.9;
    const uz = -3;
    // The unit turns its service side (unit +z) to the street-side approach: the panel sits in the
    // middle of that face, the suction and liquid service valves at its corner nearest the wall,
    // and the line set runs from the wall into those valves. The technician kneels in front of the
    // panel (workPosition), and the gauge hoses of the job-site kit end at the valve ports.
    const w = style === 'premium' ? 1.08 : 0.92;
    addCondenser(b as unknown as MeshBuilder, [ux, 0, uz], Math.PI, { pad: true, lineSet: false, fan: false, size: w, height: style === 'premium' ? 1.0 : 0.86, panelX: -0.01, serviceValves: [w * 0.39, w * 0.28] });
    b.box('galvanized', [0.06, 0.32, 0.22], [half + 0.03, 1.45, uz - 0.3]); // disconnect box
    b.box('galvanized', [0.02, 0.08, 0.1], [half + 0.05, 1.3, uz - 0.3]);
    b.box('galvanized', [0.04, 1.3, 0.04], [half + 0.03, 0.65, uz - 0.3]); // conduit down the wall
    const lineZ = uz - w / 2 - 0.03;
    const suctionX = ux - w * 0.39 - 0.035;
    const liquidX = ux - w * 0.28 - 0.025;
    b.box('insulation', [suctionX - half, 0.07, 0.07], [(half + suctionX) / 2, 0.24, lineZ]); // insulated suction line, wall → suction valve
    b.box('copper', [liquidX - half, 0.022, 0.022], [(half + liquidX) / 2, 0.19, lineZ - 0.045]); // bare liquid line, wall → liquid valve
    b.box('copper', [0.022, 0.06, 0.022], [liquidX + 0.01, 0.215, lineZ - 0.045]);
    b.box('unitCabinet', [0.12, 0.55, 0.22], [half + 0.06, 0.38, lineZ]); // line-set wall cover
  }
  // ---- Solar array on about half the roofs, trash bins by the garage, a patio set behind the house
  const seed = hashLot(lot.id + 'p');
  if (seed % 2 === 0 && style !== 'modern') {
    const roofInfo = { ranch: { w: 16, d: 11, h: 2.4, y: 3.3, over: 0.7, z: 0 }, 'two-story': { w: 14, d: 11, h: 2.8, y: 6.4, over: 0.6, z: 0 }, spanish: { w: 17, d: 12, h: 2.0, y: 3.6, over: 0.8, z: 0 }, premium: { w: 19, d: 13, h: 2.4, y: 6.6, over: 0.8, z: 0.5 }, modern: { w: 10, d: 11, h: 0, y: 3.4, over: 0, z: 0 } }[style];
    const c = roofInfo.d / 2 + roofInfo.over;
    const theta = Math.atan(roofInfo.h / c);
    const back = seed % 4 === 0 ? 1 : -1; // which slope
    const t = 0.5;
    const cz = roofInfo.z + back * c * t;
    const cy = roofInfo.y + roofInfo.h * (1 - t) + 0.12;
    const cols = style === 'premium' ? 8 : 5;
    for (let i = 0; i < cols; i++) {
      const px = (i - (cols - 1) / 2) * 1.08;
      b.box('solar', [1.02, 0.05, 1.7], [px, cy, cz], [back * theta, 0, 0]);
      b.box('galvanized', [1.06, 0.03, 1.74], [px, cy - 0.03, cz], [back * theta, 0, 0]);
    }
  }
  for (const [i, col] of (['bin', 'dark'] as const).entries()) {
    b.box(col, [0.62, 1.05, 0.7], [driveX + driveW / 2 + 0.6 + i * 0.75, 0.52, frontZ + 1.3]);
    b.box('dark', [0.66, 0.08, 0.74], [driveX + driveW / 2 + 0.6 + i * 0.75, 1.08, frontZ + 1.3]);
  }
  {
    const backZ = { ranch: 5.5, 'two-story': 5.5, spanish: 6, modern: 5.5, premium: 7 }[style] + 3.2;
    const px = style === 'premium' ? -6 : 1.5;
    b.box('concrete', [5.5, 0.1, 4.5], [px, 0.05, backZ]);
    b.add('wood', new THREE.CylinderGeometry(0.7, 0.7, 0.06, 16), [px, 0.74, backZ]);
    b.box('darkMetal', [0.06, 0.72, 0.06], [px, 0.37, backZ]);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      b.box('darkMetal', [0.45, 0.06, 0.45], [px + Math.cos(a) * 1.1, 0.45, backZ + Math.sin(a) * 1.1], [0, -a, 0]);
      b.box('darkMetal', [0.45, 0.5, 0.05], [px + Math.cos(a) * 1.32, 0.72, backZ + Math.sin(a) * 1.32], [0, -a - Math.PI / 2, 0]);
    }
    const umbrella = ['#b7442e', '#2f5d8a', '#c9a24a', '#4a7a52'][seed % 4];
    b.box('darkMetal', [0.05, 2.4, 0.05], [px, 1.2, backZ]);
    b.add(`umbrella:${umbrella}`, new THREE.ConeGeometry(1.5, 0.45, 8), [px, 2.45, backZ]);
    b.box('dark', [0.6, 0.9, 0.5], [px + 2.8, 0.75, backZ - 1.2]); // grill
    b.box('darkMetal', [0.7, 0.05, 0.6], [px + 2.8, 1.22, backZ - 1.2]);
    for (const [gx, gz] of [[-0.25, -0.2], [0.25, 0.2]]) b.add('darkMetal', new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10), [px + 2.8 + gx, 0.05, backZ - 1.2 + gz], [0, 0, Math.PI / 2]);
  }
  if (seed % 3 === 0) {
    // Basketball hoop at the driveway
    b.box('darkMetal', [0.08, 3.2, 0.08], [driveX - driveW / 2 - 0.4, 1.6, frontZ - 3]);
    b.box('white', [1.4, 0.9, 0.05], [driveX - driveW / 2 + 0.1, 3.2, frontZ - 3]);
    b.add('safetyOrange', new THREE.TorusGeometry(0.23, 0.02, 6, 16), [driveX - driveW / 2 + 0.1, 2.9, frontZ - 3.3], [Math.PI / 2, 0, 0]);
  }

  DRIVEWAYS.set(lot.id, { x: driveX, w: driveW, frontZ });
  // Driveway from the garage down to the sidewalk; walkway from the door.
  const driveLen = frontZ - lotFront + 0.6;
  b.add('concrete', new THREE.PlaneGeometry(driveW, driveLen), [driveX, 0.04, frontZ - driveLen / 2 + 0.6], [-Math.PI / 2, 0, 0]);
  const walkLen = frontZ - lotFront - 1.2;
  b.add('concrete', new THREE.PlaneGeometry(1.3, walkLen), [walkX, 0.04, frontZ - 1.2 - walkLen / 2], [-Math.PI / 2, 0, 0]);
  // Lawn panel in the front yard if the plan has one
  if (plan.lawn) b.add('lawn', new THREE.PlaneGeometry(Math.max(4, lotW / 2 - 4), Math.max(3, frontZ - lotFront - 3)), [walkX + (lotW / 2 - 4) / 2 + 1.0, 0.02, frontZ - (frontZ - lotFront - 3) / 2 - 1.5], [-Math.PI / 2, 0, 0]);
  // Mailbox at the curb beside the driveway
  b.box('wood', [0.1, 1.0, 0.1], [driveX + driveW / 2 + 0.8, 0.5, lotFront + 0.4]);
  b.box('darkMetal', [0.3, 0.26, 0.5], [driveX + driveW / 2 + 0.8, 1.1, lotFront + 0.4]);
  // Low landscape lights along the walkway
  for (let i = 0; i < 3; i++) b.box('lamp', [0.12, 0.3, 0.12], [walkX + 0.9, 0.15, frontZ - 2.5 - i * 2.2]);
  // Backyard block walls and side gate
  blockWall(b, lot, frontZ + 2);
}
