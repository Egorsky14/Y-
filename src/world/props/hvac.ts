import * as THREE from 'three';
import type { MeshBuilder } from '../assets/pbr';

/**
 * HVAC equipment and contractor props as merged geometry. Every function appends to a
 * MeshBuilder using shared material keys (see STATIC_MATERIALS), so a whole yard of equipment
 * stays at one draw call per material. Positions are the unit's footprint center at ground level.
 */

type V3 = [number, number, number];

const rot = (y: number): V3 => [0, y, 0];

/** Rotates a local offset around y and adds it to the origin. */
function at(origin: V3, local: V3, y: number): V3 {
  const c = Math.cos(y);
  const s = Math.sin(y);
  return [origin[0] + local[0] * c + local[2] * s, origin[1] + local[1], origin[2] - local[0] * s + local[2] * c];
}

export interface CondenserOptions {
  /** Cabinet width/depth in meters (residential 0.9, large 1.1). */
  size?: number;
  height?: number;
  cabinet?: string;
  /** Include the concrete pad. */
  pad?: boolean;
  /** Include the refrigerant line set leaving the +z side toward a wall. */
  lineSet?: boolean;
  /** Skip the fan blades (they are drawn live for running units). */
  fan?: boolean;
}

/** Outdoor condensing unit: louvered coil guard on three sides, service panel, top fan grille. */
export function addCondenser(b: MeshBuilder, origin: V3, yaw = 0, o: CondenserOptions = {}): void {
  const w = o.size ?? 0.92;
  const h = o.height ?? 0.86;
  const cab = o.cabinet ?? 'unitCabinet';
  const base: V3 = [origin[0], origin[1], origin[2]];
  if (o.pad !== false) b.box('concrete', [w + 0.4, 0.1, w + 0.4], [base[0], base[1] + 0.05, base[2]]);
  const y0 = base[1] + (o.pad !== false ? 0.1 : 0);
  // Cabinet core (inset so the louvers sit proud), top deck and base rail
  b.box(cab, [w - 0.08, h, w - 0.08], at(base, [0, y0 - base[1] + h / 2, 0], yaw));
  b.box(cab, [w, 0.06, w], at(base, [0, y0 - base[1] + h - 0.03, 0], yaw));
  b.box('darkMetal', [w, 0.08, w], at(base, [0, y0 - base[1] + 0.04, 0], yaw));
  // Corner posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(cab, [0.06, h, 0.06], at(base, [sx * (w / 2 - 0.03), y0 - base[1] + h / 2, sz * (w / 2 - 0.03)], yaw));
  // Louvered coil guards on -x, +x, -z; the +z face carries the service panel.
  const slats = 13;
  for (let i = 0; i < slats; i++) {
    const y = y0 + 0.14 + (i / (slats - 1)) * (h - 0.36);
    for (const side of [-1, 1]) b.box('grille', [0.025, 0.018, w - 0.16], at(base, [side * (w / 2 - 0.005), y - base[1], 0], yaw));
    b.box('grille', [w - 0.16, 0.018, 0.025], at(base, [0, y - base[1], -(w / 2 - 0.005)], yaw));
  }
  // Dark coil behind the slats
  for (const side of [-1, 1]) b.box('insulation', [0.02, h - 0.3, w - 0.16], at(base, [side * (w / 2 - 0.035), y0 - base[1] + h / 2, 0], yaw));
  b.box('insulation', [w - 0.16, h - 0.3, 0.02], at(base, [0, y0 - base[1] + h / 2, -(w / 2 - 0.035)], yaw));
  // Service panel with two screws and the electrical whip
  b.box(cab, [w * 0.46, h - 0.2, 0.03], at(base, [w * 0.2, y0 - base[1] + h / 2, w / 2 - 0.02], yaw));
  b.box('darkMetal', [0.03, 0.03, 0.02], at(base, [w * 0.05, y0 - base[1] + h - 0.2, w / 2 + 0.0], yaw));
  b.box('darkMetal', [0.03, 0.03, 0.02], at(base, [w * 0.36, y0 - base[1] + 0.2, w / 2 + 0.0], yaw));
  // Top: fan guard ring, radial wires, hub and motor cap
  const top = y0 + h;
  b.add('grille', new THREE.TorusGeometry(w * 0.36, 0.014, 6, 32), at(base, [0, top - base[1] + 0.01, 0], yaw), [Math.PI / 2, 0, 0]);
  b.add('grille', new THREE.TorusGeometry(w * 0.2, 0.012, 6, 24), at(base, [0, top - base[1] + 0.01, 0], yaw), [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.box('grille', [w * 0.74, 0.012, 0.012], at(base, [0, top - base[1] + 0.01, 0], yaw), [0, a + yaw, 0]);
  }
  b.add('insulation', new THREE.CylinderGeometry(w * 0.38, w * 0.38, 0.02, 24), at(base, [0, top - base[1] - 0.1, 0], yaw));
  if (o.fan !== false) {
    for (let i = 0; i < 3; i++) b.box('galvanized', [w * 0.3, 0.01, 0.09], at(base, [Math.cos((i / 3) * 6.283) * w * 0.17, top - base[1] - 0.04, Math.sin((i / 3) * 6.283) * w * 0.17], yaw), [0.5, -(i / 3) * 6.283, 0]);
  }
  b.add('darkMetal', new THREE.CylinderGeometry(0.06, 0.07, 0.08, 10), at(base, [0, top - base[1] + 0.04, 0], yaw));
  if (o.lineSet) {
    // Suction line (insulated) and liquid line (copper) from the service side to the wall
    b.add('insulation', new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), at(base, [w * 0.1, y0 - base[1] + 0.3, w / 2 + 0.3], yaw), [Math.PI / 2, 0, 0]);
    b.add('copper', new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), at(base, [w * 0.18, y0 - base[1] + 0.25, w / 2 + 0.3], yaw), [Math.PI / 2, 0, 0]);
  }
}

/** Rooftop packaged unit on a curb: condenser section with a grille, supply/return hoods, access panels. */
export function addPackageUnit(b: MeshBuilder, origin: V3, yaw = 0, length = 2.6): void {
  const w = 1.3;
  const h = 1.1;
  b.box('darkMetal', [length - 0.2, 0.35, w - 0.2], at(origin, [0, 0.175, 0], yaw)); // curb
  b.box('unitCabinetTan', [length, h, w], at(origin, [0, 0.35 + h / 2, 0], yaw));
  b.box('darkMetal', [length + 0.06, 0.05, w + 0.06], at(origin, [0, 0.35 + h + 0.02, 0], yaw)); // top cap drip edge
  // Condenser end: slatted guard and a fan grille on top
  for (let i = 0; i < 6; i++) b.box('grille', [0.03, 0.03, w - 0.2], at(origin, [length / 2 + 0.005, 0.5 + i * 0.13, 0], yaw));
  b.add('grille', new THREE.TorusGeometry(0.4, 0.014, 6, 28), at(origin, [length / 2 - 0.6, 0.35 + h + 0.03, 0], yaw), [Math.PI / 2, 0, 0]);
  b.add('insulation', new THREE.CylinderGeometry(0.42, 0.42, 0.02, 24), at(origin, [length / 2 - 0.6, 0.35 + h, 0], yaw));
  for (let i = 0; i < 8; i++) b.box('grille', [0.8, 0.012, 0.012], at(origin, [length / 2 - 0.6, 0.35 + h + 0.03, 0], yaw), [0, (i / 8) * Math.PI + yaw, 0]);
  // Access panels with handles, and the economizer hood
  for (const x of [-length / 2 + 0.5, -0.3]) {
    b.box('darkMetal', [0.5, 0.6, 0.02], at(origin, [x, 0.35 + 0.55, w / 2 + 0.005], yaw));
    b.box('galvanized', [0.1, 0.03, 0.03], at(origin, [x + 0.15, 0.35 + 0.55, w / 2 + 0.03], yaw));
  }
  b.box('unitCabinetTan', [0.6, 0.35, 0.5], at(origin, [-length / 2 + 0.4, 0.35 + h + 0.17, -w / 2 + 0.3], yaw));
  b.box('grille', [0.62, 0.12, 0.52], at(origin, [-length / 2 + 0.4, 0.35 + h + 0.3, -w / 2 + 0.3], yaw));
}

/** Indoor air handler / furnace cabinet (upright). */
export function addAirHandler(b: MeshBuilder, origin: V3, yaw = 0): void {
  b.box('unitCabinet', [0.55, 1.3, 0.75], at(origin, [0, 0.65, 0], yaw));
  b.box('darkMetal', [0.5, 0.5, 0.02], at(origin, [0, 0.95, 0.38], yaw));
  b.box('darkMetal', [0.5, 0.45, 0.02], at(origin, [0, 0.35, 0.38], yaw));
  b.box('galvanized', [0.12, 0.02, 0.02], at(origin, [0, 0.72, 0.4], yaw));
  b.box('galvanized', [0.45, 0.3, 0.65], at(origin, [0, 1.45, 0], yaw)); // supply plenum
}

/** Shrink-wrapped unit on a wooden pallet (for yards and staging). */
export function addPalletUnit(b: MeshBuilder, origin: V3, yaw = 0, kind: 'condenser' | 'box' = 'condenser'): void {
  // Pallet: three stringers and deck boards
  for (const z of [-0.5, 0, 0.5]) b.box('wood', [1.2, 0.09, 0.09], at(origin, [0, 0.045, z], yaw));
  for (let i = 0; i < 6; i++) b.box('wood', [0.14, 0.03, 1.1], at(origin, [-0.5 + i * 0.2, 0.105, 0], yaw));
  if (kind === 'condenser') {
    addCondenser(b, at(origin, [0, 0.12, 0], yaw), yaw, { pad: false, fan: false });
    b.box('shrinkWrap', [1.0, 0.9, 1.0], at(origin, [0, 0.12 + 0.45, 0], yaw));
  } else {
    b.box('cardboard', [1.0, 0.8, 1.0], at(origin, [0, 0.12 + 0.4, 0], yaw));
    b.box('darkMetal', [1.02, 0.06, 0.08], at(origin, [0, 0.12 + 0.4, 0], yaw)); // strapping
    b.box('darkMetal', [0.08, 0.06, 1.02], at(origin, [0, 0.12 + 0.4, 0], yaw));
  }
}

/** Refrigerant cylinder (30 lb) in the standard light-blue (R-410A rose would be pink; keep neutral). */
export function addCylinder(b: MeshBuilder, origin: V3, color = 'steelBlue'): void {
  b.add(color, new THREE.CylinderGeometry(0.15, 0.15, 0.5, 12), [origin[0], origin[1] + 0.25, origin[2]]);
  b.add(color, new THREE.SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [origin[0], origin[1] + 0.5, origin[2]]);
  b.add('galvanized', new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8), [origin[0], origin[1] + 0.68, origin[2]]);
  b.box('galvanized', [0.12, 0.02, 0.03], [origin[0], origin[1] + 0.73, origin[2]]);
}

/** Rolling tool cart with a top tray and two drawers. */
export function addToolCart(b: MeshBuilder, origin: V3, yaw = 0, color = 'redSteel'): void {
  b.box(color, [0.7, 0.6, 0.45], at(origin, [0, 0.42, 0], yaw));
  b.box('darkMetal', [0.72, 0.03, 0.47], at(origin, [0, 0.73, 0], yaw));
  for (const y of [0.3, 0.5]) b.box('galvanized', [0.3, 0.02, 0.02], at(origin, [0, y, 0.24], yaw));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('rubber', new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), at(origin, [sx * 0.28, 0.05, sz * 0.16], yaw), [Math.PI / 2, 0, 0]);
  b.box('galvanized', [0.02, 0.25, 0.02], at(origin, [-0.36, 0.86, 0.2], yaw));
  b.box('galvanized', [0.02, 0.25, 0.02], at(origin, [-0.36, 0.86, -0.2], yaw));
  b.box('galvanized', [0.02, 0.02, 0.42], at(origin, [-0.36, 0.98, 0], yaw));
}

/** Wheeled hand truck (dolly) leaning against something. */
export function addDolly(b: MeshBuilder, origin: V3, yaw = 0): void {
  for (const x of [-0.18, 0.18]) b.box('galvanized', [0.025, 1.2, 0.025], at(origin, [x, 0.65, -0.1], yaw), [-0.25, 0, 0]);
  b.box('galvanized', [0.4, 0.02, 0.3], at(origin, [0, 0.06, 0.1], yaw));
  for (const x of [-0.22, 0.22]) b.add('rubber', new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10), at(origin, [x, 0.11, -0.08], yaw), [0, 0, Math.PI / 2]);
}

/** Extension ladder lying on a rack or leaning. */
export function addLadder(b: MeshBuilder, origin: V3, yaw = 0, length = 3.6, pitch = 0): void {
  for (const z of [-0.2, 0.2]) b.box('galvanized', [length, 0.05, 0.04], at(origin, [0, 0, z], yaw), [0, 0, pitch]);
  const rungs = Math.floor(length / 0.3);
  for (let i = 0; i < rungs; i++) {
    const x = -length / 2 + 0.2 + i * 0.3;
    b.box('galvanized', [0.03, 0.03, 0.4], at(origin, [x * Math.cos(pitch), x * Math.sin(pitch), 0], yaw), [0, 0, pitch]);
  }
}

/** Bundle of flexible duct rolls and a stack of rectangular duct sections. */
export function addDuctStack(b: MeshBuilder, origin: V3, yaw = 0): void {
  for (let i = 0; i < 3; i++) b.add('galvanized', new THREE.CylinderGeometry(0.28, 0.28, 1.4, 14), at(origin, [0, 0.28 + (i === 2 ? 0.5 : 0), i === 2 ? 0 : (i - 0.5) * 0.6], yaw), [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) b.box('galvanized', [1.2, 0.3, 0.5], at(origin, [1.3, 0.15 + i * 0.32, 0], yaw));
}

/** Vacuum pump or recovery machine: small boxy unit with a handle and a motor cylinder. */
export function addServiceMachine(b: MeshBuilder, origin: V3, yaw = 0, color = 'safetyOrange'): void {
  b.box(color, [0.36, 0.26, 0.24], at(origin, [0, 0.16, 0], yaw));
  b.add('darkMetal', new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10), at(origin, [0, 0.16, 0.0], yaw), [0, 0, Math.PI / 2]);
  b.box('darkMetal', [0.3, 0.02, 0.02], at(origin, [0, 0.36, 0], yaw));
  for (const x of [-0.14, 0.14]) b.box('darkMetal', [0.02, 0.08, 0.02], at(origin, [x, 0.32, 0], yaw));
  b.box('galvanized', [0.08, 0.1, 0.04], at(origin, [0.1, 0.34, 0.1], yaw)); // gauge
}

/** Commercial dumpster with lid, wheels and a side pocket. */
export function addDumpster(b: MeshBuilder, origin: V3, yaw = 0, color = 'darkGreen'): void {
  b.box(color, [3.2, 1.4, 1.8], at(origin, [0, 0.85, 0], yaw));
  b.box('insulation', [3.0, 0.08, 1.7], at(origin, [0, 1.6, 0], yaw));
  for (const x of [-0.78, 0.78]) b.box(color, [1.5, 0.12, 1.9], at(origin, [x, 1.66, 0], yaw), [0.05, 0, 0]);
  for (const x of [-1.5, 1.5]) b.box('darkMetal', [0.1, 0.5, 0.5], at(origin, [x, 0.5, 0], yaw));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('rubber', new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8), at(origin, [sx * 1.2, 0.1, sz * 0.75], yaw), [0, 0, Math.PI / 2]);
}

/** Enclosed cargo trailer with the company wrap colors. */
export function addCargoTrailer(b: MeshBuilder, origin: V3, yaw = 0): void {
  b.box('paintBlack', [4.2, 1.9, 2.1], at(origin, [0, 1.55, 0], yaw));
  b.box('darkMetal', [4.3, 0.06, 2.15], at(origin, [0, 2.52, 0], yaw));
  b.box('teal', [4.2, 0.12, 0.02], at(origin, [0, 1.35, 1.06], yaw));
  b.box('teal', [4.2, 0.12, 0.02], at(origin, [0, 1.35, -1.06], yaw));
  b.box('darkMetal', [4.0, 0.12, 2.0], at(origin, [0, 0.58, 0], yaw)); // frame
  b.box('darkMetal', [1.4, 0.08, 0.1], at(origin, [2.6, 0.55, 0], yaw)); // tongue
  b.add('darkMetal', new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), at(origin, [3.1, 0.28, 0], yaw)); // jack
  for (const sz of [-1, 1]) {
    b.add('rubber', new THREE.CylinderGeometry(0.36, 0.36, 0.22, 16), at(origin, [-0.2, 0.36, sz * 1.1], yaw), [Math.PI / 2, 0, 0]);
    b.add('galvanized', new THREE.CylinderGeometry(0.2, 0.2, 0.24, 12), at(origin, [-0.2, 0.36, sz * 1.1], yaw), [Math.PI / 2, 0, 0]);
    b.box('paintBlack', [1.0, 0.3, 0.3], at(origin, [-0.2, 0.75, sz * 1.1], yaw)); // fender
  }
  b.box('darkMetal', [0.02, 1.5, 1.8], at(origin, [-2.11, 1.45, 0], yaw)); // rear door seam plate
  b.box('galvanized', [0.04, 0.3, 0.04], at(origin, [-2.15, 1.3, 0.5], yaw));
}

/** 20 ft storage container used as a parts locker. */
export function addContainer(b: MeshBuilder, origin: V3, yaw = 0, material = 'containerBlue'): void {
  b.box(material, [6.06, 2.59, 2.44], at(origin, [0, 1.3, 0], yaw));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('darkMetal', [0.18, 2.6, 0.18], at(origin, [sx * 2.95, 1.3, sz * 1.14], yaw));
  b.box('darkMetal', [6.1, 0.12, 2.5], at(origin, [0, 0.06, 0], yaw));
  b.box('darkMetal', [6.1, 0.08, 2.5], at(origin, [0, 2.6, 0], yaw));
  // Door end: two lock bars per leaf
  for (const z of [-0.8, -0.3, 0.3, 0.8]) b.add('galvanized', new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), at(origin, [3.05, 1.3, z], yaw));
}

/** Chain-link fence run between two local points, with posts, top rail and fabric. */
export function addChainLinkFence(b: MeshBuilder, from: [number, number], to: [number, number], height = 2.0, gateAt?: [number, number]): void {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx); // builder rotation about y, matching at()
  const cx = (from[0] + to[0]) / 2;
  const cz = (from[1] + to[1]) / 2;
  const posts = Math.max(2, Math.round(len / 3) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    b.add('galvanized', new THREE.CylinderGeometry(0.035, 0.035, height, 8), [from[0] + dx * t, height / 2, from[1] + dz * t]);
  }
  b.add('galvanized', new THREE.CylinderGeometry(0.025, 0.025, len, 6), [cx, height - 0.05, cz], [0, yaw, Math.PI / 2]);
  if (gateAt) {
    // Fabric in two spans leaving a 4 m gate opening centered at gateAt (projected onto the run)
    const gt = ((gateAt[0] - from[0]) * dx + (gateAt[1] - from[1]) * dz) / (len * len);
    const g0 = Math.max(0, gt - 2 / len);
    const g1 = Math.min(1, gt + 2 / len);
    for (const [a, c] of [[0, g0], [g1, 1]] as [number, number][]) {
      const l = (c - a) * len;
      if (l <= 0.1) continue;
      const m = (a + c) / 2;
      b.add('chainLink', new THREE.PlaneGeometry(l, height - 0.1), [from[0] + dx * m, height / 2, from[1] + dz * m], [0, yaw, 0]);
    }
    // Gate leaves (open): frame + fabric swung inward
    for (const s of [-1, 1]) {
      const hinge: V3 = [from[0] + dx * (s < 0 ? g0 : g1), 0, from[1] + dz * (s < 0 ? g0 : g1)];
      const swing = yaw + s * 1.2;
      const leafC = at(hinge, [s * 1.0, height / 2, 0], -swing);
      b.add('chainLink', new THREE.PlaneGeometry(2.0, height - 0.2), leafC, [0, swing, 0]);
      b.box('galvanized', [2.0, 0.05, 0.05], at(hinge, [s * 1.0, height - 0.12, 0], -swing), [0, swing, 0]);
      b.box('galvanized', [2.0, 0.05, 0.05], at(hinge, [s * 1.0, 0.12, 0], -swing), [0, swing, 0]);
    }
  } else {
    b.add('chainLink', new THREE.PlaneGeometry(len, height - 0.1), [cx, height / 2, cz], [0, yaw, 0]);
  }
}

export const propRot = rot;
