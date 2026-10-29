import * as THREE from 'three';
import type { HqUpgradeId } from '@/game/progression/hqUpgrades';
import { MeshBuilder, membranePbr, pbrMaterial } from '../assets/pbr';
import { groundMaterial, STATIC_MATERIALS, UV_SCALES } from './materials';
import { HQ_LOT, hqParkingStalls } from '@/game/world/cityLayout';
import { addAirHandler, addCargoTrailer, addChainLinkFence, addCondenser, addContainer, addCylinder, addDolly, addDuctStack, addDumpster, addLadder, addPackageUnit, addPalletUnit, addServiceMachine, addToolCart } from '../props/hvac';

/**
 * EGO HVAC headquarters, local space centered on the lot (street to the west, -x).
 * Static geometry merged per material; bay doors, signs and wordmarks are separate meshes.
 *
 * Site plan (local meters): entrance drive at z 0 from the street; fleet stalls in two rows at
 * x -43 and -31 (fixed by the simulation); visitor parking along the north curb; the office at
 * (25,-20) and the service building at (25,15) both face the lot; the equipment yard runs along
 * the south wall behind a chain-link fence. Vehicle routes (stall → apron at (-53,0) → street)
 * cross only striped asphalt; nothing solid is placed inside x < -26, -32 < z < 2.
 */
export const HQ = {
  office: { x: 25, z: -20, w: 46, d: 28, h: 7.6 },
  bays: { x: 25, z: 15, w: 46, d: 30, h: 6.6 },
  bayDoorZ: [7, 19, 27] as const,
  bayDoorW: 7.2,
  apronX: -11,
  parking: { x: -27.5, z: -12.5, w: 51, d: 41 },
  tower: { x: 3, z: -24, w: 7.6, d: 10, h: 9.8 },
};

type V3 = [number, number, number];

/** Parapet coping as four edge pieces so the roof surface inside stays visible. */
function coping(b: MeshBuilder, material: string, cx: number, cz: number, w: number, d: number, y: number, t = 0.26, lip = 0.5): void {
  b.box(material, [w + 0.4, t, lip], [cx, y, cz - d / 2 - 0.2 + lip / 2]);
  b.box(material, [w + 0.4, t, lip], [cx, y, cz + d / 2 + 0.2 - lip / 2]);
  b.box(material, [lip, t, d + 0.4], [cx - w / 2 - 0.2 + lip / 2, y, cz]);
  b.box(material, [lip, t, d + 0.4], [cx + w / 2 + 0.2 - lip / 2, y, cz]);
}

/**
 * Environment Revolution site detail: equipment on the roofs that reads from the strategy camera
 * (a solar array, a makeup-air unit, conduit and gas runs, walk pads), a working service yard
 * (concrete pad, pallet racking, condenser stock that grows with each HQ upgrade) and a planted
 * east strip. Static and decorative: nothing here changes stalls, routes or upgrade effects.
 */
function addSiteDetail(b: MeshBuilder, has: (id: HqUpgradeId) => boolean, upgradeCount: number): void {
  const o = HQ.office;
  const s = HQ.bays;
  // ---- Service building roof: south half carries a tilted solar array in rows.
  for (let row = 0; row < 3; row++) {
    const z = s.z + 5 + row * 3.4;
    for (let i = 0; i < 9; i++) {
      const x = s.x - 20 + i * 2.15;
      b.box('solar', [2.05, 0.05, 2.3], [x, s.h + 0.55, z], [-0.17, 0, 0]);
      b.box('galvanized', [2.1, 0.04, 2.36], [x, s.h + 0.5, z], [-0.17, 0, 0]);
    }
    for (const x of [s.x - 21, s.x - 1.6]) b.box('galvanized', [0.08, 0.5, 2.0], [x, s.h + 0.3, z]);
    b.box('galvanized', [19.5, 0.06, 0.06], [s.x - 11.3, s.h + 0.25, z + 1.1]); // combiner conduit
  }
  // Makeup-air unit with its supply duct dropping into the shop, on a steel curb.
  b.box('darkMetal', [5.2, 0.4, 2.2], [s.x + 12, s.h + 0.2, s.z + 8]);
  b.box('unitCabinet', [5.0, 1.5, 2.0], [s.x + 12, s.h + 1.15, s.z + 8]);
  b.box('grille', [1.6, 1.0, 0.06], [s.x + 10, s.h + 1.15, s.z + 6.98]);
  b.box('galvanized', [1.2, 1.2, 3.0], [s.x + 15.6, s.h + 1.0, s.z + 8]);
  // Gas line (yellow) on pipe supports from the parapet to the units, conduit to the disconnects.
  for (let x = s.x - 22; x <= s.x + 16; x += 3) b.box('rubber', [0.2, 0.25, 0.3], [x, s.h + 0.12, s.z - 11.5]);
  b.box('bollard', [38.5, 0.08, 0.08], [s.x - 3, s.h + 0.3, s.z - 11.5]);
  b.box('bollard', [0.08, 0.08, 9.5], [s.x + 14, s.h + 0.3, s.z - 6.8]);
  b.box('galvanized', [0.06, 0.06, 18], [s.x + 18.5, s.h + 0.12, s.z]);
  // Walk pads from the roof hatches to the equipment (lighter membrane pads).
  for (let z = s.z - 12; z < s.z + 2; z += 1.0) b.box('apron', [0.9, 0.04, 0.8], [s.x + 18, s.h + 0.1, z]);
  for (let x = o.x + 17; x > o.x - 14; x -= 1.0) b.box('apron', [0.8, 0.04, 0.9], [x, o.h + 0.1, o.z + 9.5]);
  b.box('galvanized', [0.9, 0.5, 0.9], [s.x + 18, s.h + 0.3, s.z - 13]); // hatch
  for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]] as [number, number][]) b.box('bollard', [0.05, 1.0, 0.05], [s.x + 18 + dx, s.h + 0.6, s.z - 13 + dz]);

  // ---- Service yard: concrete pad with pallet racking along the south wall and condenser stock.
  const D = HQ_LOT.depth;
  b.box('apron', [24, 0.08, 4.4], [5, 0.05, D / 2 - 3.2]);
  for (let bay = 0; bay < 4; bay++) {
    const x0 = -5 + bay * 5.2;
    for (const dx of [0, 5]) for (const dz of [0, 1.1]) b.box('darkMetal', [0.1, 3.6, 0.1], [x0 + dx, 1.8, D / 2 - 2.2 + dz]);
    for (const y of [0.15, 1.35, 2.55]) {
      for (const dz of [0, 1.1]) b.box('safetyOrange', [5.0, 0.12, 0.08], [x0 + 2.5, y, D / 2 - 2.2 + dz]);
      for (let k = 0; k < 3; k++) b.box(k === 1 ? 'shrinkWrap' : 'cardboard', [1.3, 0.85, 1.0], [x0 + 0.85 + k * 1.65, y + 0.5, D / 2 - 1.65]);
    }
  }
  // Stock grows with the business: one more row of palletised condensers per HQ upgrade (up to five).
  const rows = Math.min(5, 1 + upgradeCount);
  for (let r = 0; r < rows; r++) for (let c = 0; c < 3; c++) addPalletUnit(b, [-1 + c * 1.6, 0.06, 35.6 + r * 1.55], (r + c) * 0.04, (r + c) % 4 === 3 ? 'box' : 'condenser');
  if (!has('staging-area')) {
    // Equipment carts staged for tomorrow's installs.
    for (const [x, z] of [[20, 40.5], [23, 40.5]] as [number, number][]) {
      b.box('galvanized', [2.2, 0.06, 1.0], [x, 0.5, z]);
      b.box('darkMetal', [0.06, 0.9, 1.0], [x - 1.1, 0.9, z]);
      addPalletUnit(b, [x, 0.55, z], 0, 'box');
    }
  }

  // ---- East strip between the buildings and the east wall: rock beds for the desert trees.
  const W = HQ_LOT.width;
  for (const [z0, z1] of [[-40, -17], [-6, 31]] as [number, number][]) {
    b.box('rockBrown', [W / 2 - 49.5, 0.04, z1 - z0], [(49 + W / 2 - 0.8) / 2, 0.035, (z0 + z1) / 2]);
    b.box('curb', [0.25, 0.14, z1 - z0], [49.4, 0.07, (z0 + z1) / 2]);
  }
}

/**
 * World Immersion: the parts of a working HVAC shop that read from the strategy camera, all clear of
 * the fleet stalls and the stall-to-apron route corridor (x < -26, -32 < z < 2):
 * - a solar shade carport over the staff row (columns behind the south curb, canopy over the stalls);
 * - work staged on the bay apron against the wall between bays 1 and 2: a rolling tool chest, a
 *   condenser on a hand truck waiting to go out, nitrogen cylinders chained upright in a wall rack;
 * - two EV chargers at the head of the visitor row.
 */
function addOperations(b: MeshBuilder): void {
  // ---- Staff carport (staff row: cars x -54..-27, nose to the south curb at z 21)
  const cz0 = 13.6;
  const cz1 = 21.9;
  for (const x of [-55.2, -48.6, -42, -35.4, -28.8]) {
    b.add('concrete', new THREE.CylinderGeometry(0.3, 0.34, 0.5, 10), [x, 0.25, 21.7]);
    b.box('paintBlack', [0.26, 3.6, 0.26], [x, 1.8, 21.7]);
    // Cantilever arm sloping toward the stalls
    b.box('paintBlack', [0.2, 0.32, cz1 - cz0], [x, 3.62, (cz0 + cz1) / 2], [0.05, 0, 0]);
  }
  b.box('paintBlack', [27.2, 0.2, 0.22], [-42, 3.78, 21.5]);
  b.box('paintBlack', [27.2, 0.16, 0.18], [-42, 3.36, cz0 + 0.3]);
  // Panels in two ranks on the canopy (dark modules, thin frames)
  for (let i = 0; i < 12; i++) {
    for (const [z, y] of [[16.0, 3.62], [19.6, 3.8]] as [number, number][]) {
      b.box('solar', [2.1, 0.05, 3.4], [-54.6 + i * 2.25, y + 0.12, z], [0.05, 0, 0]);
    }
  }
  // ---- Apron staging against the service-building wall between bay doors 1 and 2 (z 10.6..15.4)
  const wx = HQ.bays.x - HQ.bays.w / 2; // west face, x = 2
  // Rolling tool chest: red cabinet, drawer lines, casters
  b.box('redSteel', [0.6, 1.0, 1.1], [wx - 0.45, 0.62, 11.6]);
  for (let i = 0; i < 4; i++) b.box('darkMetal', [0.62, 0.02, 1.0], [wx - 0.45, 0.4 + i * 0.2, 11.6]);
  b.box('darkMetal', [0.62, 0.05, 1.12], [wx - 0.45, 1.14, 11.6]);
  for (const dz of [-0.45, 0.45]) b.add('rubber', new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), [wx - 0.45, 0.06, 11.6 + dz], [0, 0, Math.PI / 2]);
  // Condenser on a hand truck, ready for an install
  b.box('unitCabinet', [0.8, 0.8, 0.8], [wx - 0.9, 0.52, 13.1]);
  b.box('grille', [0.82, 0.62, 0.02], [wx - 1.31, 0.5, 13.1]);
  b.add('darkMetal', new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), [wx - 0.9, 0.94, 13.1]);
  for (const dz of [-0.36, 0.36]) b.box('safetyOrange', [0.05, 1.3, 0.05], [wx - 0.42, 0.75, 13.1 + dz], [0, 0, 0.12]);
  b.box('safetyOrange', [0.05, 0.05, 0.78], [wx - 0.35, 1.38, 13.1]);
  b.box('darkMetal', [0.5, 0.04, 0.8], [wx - 0.62, 0.1, 13.1]);
  for (const dz of [-0.42, 0.42]) b.add('rubber', new THREE.CylinderGeometry(0.11, 0.11, 0.07, 10), [wx - 0.42, 0.11, 13.1 + dz], [Math.PI / 2, 0, 0]);
  // Nitrogen cylinders chained upright in a wall rack
  b.box('darkMetal', [0.3, 1.2, 0.9], [wx - 0.16, 0.62, 14.6]);
  for (const dz of [-0.22, 0.22]) {
    b.add('darkGreen', new THREE.CylinderGeometry(0.115, 0.115, 1.35, 12), [wx - 0.42, 0.7, 14.6 + dz]);
    b.add('darkGreen', new THREE.SphereGeometry(0.115, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), [wx - 0.42, 1.37, 14.6 + dz]);
    b.add('galvanized', new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), [wx - 0.42, 1.52, 14.6 + dz]);
  }
  for (const y of [0.55, 1.05]) b.box('galvanized', [0.04, 0.03, 0.8], [wx - 0.56, y, 14.6]);
  // ---- EV chargers at the head of the visitor row (north curb)
  for (const x of [-23.1, -20.3]) {
    b.box('concrete', [0.6, 0.12, 0.5], [x, 0.06, -34.2]);
    b.box('darkPanel', [0.34, 1.35, 0.26], [x, 0.78, -34.2]);
    b.box('teal', [0.3, 0.06, 0.22], [x, 1.2, -34.07]);
    b.box('interiorLight', [0.16, 0.12, 0.01], [x, 1.0, -34.06]);
  }
}

export function buildHeadquarters(upgrades: HqUpgradeId[]): THREE.Group {
  const t0 = performance.now();
  const has = (id: HqUpgradeId) => upgrades.includes(id);
  const S = STATIC_MATERIALS;
  const mats: Record<string, THREE.Material> = {
    asphalt: S.asphalt(), concrete: S.concrete(), gravel: S.gravel(), block: S.block(), siding: S.siding(), officeWall: S.officeWall(),
    storefront: S.storefront(), frame: S.frame(), dark: S.dark(), darkMetal: S.darkMetal(), metal: S.metal(), white: S.white(), trim: S.trim(),
    teal: S.teal(), lamp: S.lamp(), bollard: S.bollard(), mulch: S.mulch(), wood: S.wood(), darkPanel: S.darkPanel(), curb: S.curb(),
    stripe: S.stripe(), stripeYellow: S.stripeYellow(), stripeBlue: S.stripeBlue(), ada: S.ada(), wear: S.wear(), stain: S.stain(),
    chainLink: S.chainLink(), galvanized: S.galvanized(), unitCabinet: S.unitCabinet(), unitCabinetTan: S.unitCabinetTan(), grille: S.grille(),
    copper: S.copper(), insulation: S.insulation(), rubber: S.rubber(), cardboard: S.cardboard(), shrinkWrap: S.shrinkWrap(), redSteel: S.redSteel(),
    safetyOrange: S.safetyOrange(), glassDark: S.glassDark(), interiorLight: S.interiorLight(), bayFloor: S.bayFloor(), containerBlue: S.containerBlue(),
    containerTeal: S.containerTeal(),
    steelBlue: new THREE.MeshStandardMaterial({ color: '#8fa3b8', roughness: 0.4, metalness: 0.6 }),
    paintBlack: new THREE.MeshStandardMaterial({ color: '#121417', roughness: 0.35, metalness: 0.4, envMapIntensity: 1.2 }),
    darkGreen: new THREE.MeshStandardMaterial({ color: '#2f4a3a', roughness: 0.7, metalness: 0.3 }),
    transformer: new THREE.MeshStandardMaterial({ color: '#5f7a5a', roughness: 0.6, metalness: 0.3 }),
    roofMembrane: pbrMaterial(membranePbr(), { roughness: 0.92 }),
    shadeFabric: new THREE.MeshStandardMaterial({ color: '#2c3238', roughness: 0.9, side: THREE.DoubleSide }),
    planter: new THREE.MeshStandardMaterial({ color: '#8a8580', roughness: 0.9 }),
    apron: S.apron(),
    solar: S.solar(),
    rockBrown: groundMaterial('rock-brown'),
    rockLight: groundMaterial('rock-light'),
  };
  const b = new MeshBuilder(mats, { ...UV_SCALES, wear: 0, stain: 0, apron: 3.6, roofMembrane: 6, rockBrown: 2.4, rockLight: 2.6 });
  const W = HQ_LOT.width;
  const D = HQ_LOT.depth;
  const o = HQ.office;
  const s = HQ.bays;
  const ox0 = o.x - o.w / 2; // office west face (x = 2)
  const sx0 = s.x - s.w / 2; // service building west face (x = 2)

  // ================================================================ GROUND
  b.add('gravel', new THREE.PlaneGeometry(W - 0.6, D - 0.6), [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
  // Main lot asphalt, entrance drive and the employee row south of it
  const lot = { x0: -56, x1: -2, z0: -34, z1: 9 };
  b.box('asphalt', [lot.x1 - lot.x0, 0.08, lot.z1 - lot.z0], [(lot.x0 + lot.x1) / 2, 0.0, (lot.z0 + lot.z1) / 2]);
  b.box('asphalt', [10, 0.08, 15], [-W / 2 + 4, 0.0, 0]);
  const emp = { x0: -56, x1: -16, z0: 9, z1: 21 };
  b.box('asphalt', [emp.x1 - emp.x0, 0.08, emp.z1 - emp.z0], [(emp.x0 + emp.x1) / 2, 0.0, (emp.z0 + emp.z1) / 2]);
  if (has('additional-parking')) b.box('asphalt', [40, 0.08, 10], [-36, 0.0, 26]);
  // Concrete: bay apron, office sidewalk, entry plaza, walkway to the lot
  b.box('apron', [14, 0.09, s.d + 4], [HQ.apronX + 4, 0.0, s.z]);
  b.box('concrete', [2.6, 0.1, 34], [ox0 - 2.3, 0.0, o.z - 1]);
  b.box('concrete', [8, 0.1, 12], [ox0 - 5.5, 0.0, HQ.tower.z]);
  b.box('concrete', [26, 0.1, 2.0], [-W / 2 + 13, 0.0, -1]);
  // Curbs: lot edges (north and south), sidewalk edge, entry island returns
  b.box('curb', [lot.x1 - lot.x0 + 0.6, 0.15, 0.3], [(lot.x0 + lot.x1) / 2, 0.075, lot.z0]);
  b.box('curb', [0.3, 0.15, 24], [lot.x0, 0.075, lot.z0 + 12]);
  b.box('curb', [0.3, 0.15, 12], [emp.x0, 0.075, emp.z0 + 6]);
  b.box('curb', [emp.x1 - emp.x0 + 0.6, 0.15, 0.3], [(emp.x0 + emp.x1) / 2, 0.075, emp.z1]);
  b.box('curb', [0.3, 0.15, emp.z1 - emp.z0], [emp.x1, 0.075, (emp.z0 + emp.z1) / 2]);
  b.box('curb', [0.3, 0.16, 34], [ox0 - 3.65, 0.08, o.z - 1]);
  b.box('curb', [8, 0.16, 0.3], [ox0 - 5.5, 0.08, HQ.tower.z - 6]);
  b.box('curb', [8, 0.16, 0.3], [ox0 - 5.5, 0.08, HQ.tower.z + 6]);
  // Curb ramp at the walkway and the drive entrance returns
  b.box('concrete', [1.6, 0.06, 2.4], [ox0 - 4.4, 0.03, -1]);
  for (const z of [-7.5, 7.5]) b.box('curb', [10, 0.15, 0.3], [-W / 2 + 4, 0.075, z]);

  // ---- Striping
  const stripe = (size: V3, pos: V3, rot?: V3, mat = 'stripe') => b.box(mat, size, pos, rot);
  // Fleet stalls (positions are fixed by the simulation): 9 m stalls, wheel stops, reserved markers
  const stallCount = 2 + (has('expanded-garage') ? 2 : 0) + (has('additional-parking') ? 4 : 0);
  const stalls = hqParkingStalls(Math.max(8, stallCount));
  stalls.forEach((st, i) => {
    const lx = st.pos.x - HQ_LOT.center.x;
    const lz = st.pos.z - HQ_LOT.center.z;
    const active = i < stallCount;
    stripe([9, 0.012, 0.14], [lx, 0.05, lz - 4]);
    stripe([9, 0.012, 0.14], [lx, 0.05, lz + 4]);
    b.box('concrete', [0.4, 0.14, 1.8], [lx - 3.8, 0.11, lz]);
    if (active) {
      stripe([0.5, 0.012, 2.2], [lx + 4.2, 0.052, lz], undefined, 'teal');
      b.add('stain', new THREE.PlaneGeometry(1.6, 1.2), [lx - 1.0, 0.049, lz + 0.3], [-Math.PI / 2, 0, 0]);
    }
  });
  // Visitor parking along the north curb (nose-in), with an accessible stall by the walkway
  const vis = { z0: -33.5, depth: 5.5, w: 2.8, x0: -24.5, count: 6 };
  for (let i = 0; i <= vis.count; i++) stripe([0.12, 0.012, vis.depth], [vis.x0 + i * vis.w, 0.05, vis.z0 + vis.depth / 2]);
  stripe([vis.count * vis.w, 0.012, 0.12], [vis.x0 + (vis.count * vis.w) / 2, 0.05, vis.z0 + vis.depth]);
  for (let i = 0; i < vis.count; i++) b.box('concrete', [1.8, 0.14, 0.35], [vis.x0 + (i + 0.5) * vis.w, 0.11, vis.z0 + 0.6]);
  const adaX = vis.x0 + vis.count * vis.w + 1.9;
  b.box('stripeBlue', [3.6, 0.012, vis.depth], [adaX, 0.045, vis.z0 + vis.depth / 2]);
  b.add('ada', new THREE.PlaneGeometry(0.9, 0.9), [adaX, 0.05, vis.z0 + 2.8], [-Math.PI / 2, 0, 0]);
  for (let i = 0; i < 5; i++) stripe([0.12, 0.012, 3.2], [adaX + 2.0 + i * 0.5, 0.05, vis.z0 + vis.depth / 2], [0, 0, 0], 'stripeBlue');
  stripe([0.12, 0.012, 2.8], [adaX + 2.0, 0.05, vis.z0 + vis.depth / 2]);
  // Employee row (nose-in to the south curb)
  for (let i = 0; i <= 9; i++) stripe([0.12, 0.012, 5.2], [-54 + i * 3.0, 0.05, emp.z1 - 2.6]);
  for (let i = 0; i < 9; i++) b.box('concrete', [1.8, 0.14, 0.35], [-54 + (i + 0.5) * 3.0, 0.11, emp.z1 - 0.7]);
  stripe([27, 0.012, 0.12], [-40.5, 0.05, emp.z1 - 5.2]);
  // Directional arrows, stop bar, entrance median and fire lane
  const arrow = (x: number, z: number, yaw: number, mat = 'stripe') => {
    // yaw is the builder's y rotation: a box along +x rotated by yaw points along (cos yaw, -sin yaw).
    const dx = Math.cos(yaw);
    const dz = -Math.sin(yaw);
    const px = -dz;
    const pz = dx;
    stripe([2.4, 0.012, 0.3], [x, 0.05, z], [0, yaw, 0], mat);
    const tipX = x + dx * 1.2;
    const tipZ = z + dz * 1.2;
    for (const sgn of [-1, 1]) stripe([1.2, 0.012, 0.3], [tipX - dx * 0.4 + px * sgn * 0.42, 0.05, tipZ - dz * 0.4 + pz * sgn * 0.42], [0, yaw + sgn * 0.75, 0], mat);
  };
  arrow(-51, -14, Math.PI / 2); // in-lane heading north toward the fleet stalls
  arrow(-51, 4, Math.PI); // out-lane heading west to the street
  arrow(-12, -22, Math.PI); // visitors heading west
  stripe([0.4, 0.012, 6], [-55.5, 0.05, 3.5]); // stop bar at the exit lane
  stripe([9, 0.012, 0.18], [-53.5, 0.05, 0], undefined, 'stripeYellow'); // entrance centerline
  for (let i = 0; i < 6; i++) stripe([0.16, 0.012, 1.4], [-13 + i * 2.2, 0.05, 6.8], [0, 0.6, 0], 'stripeYellow'); // hatched fire lane by the apron
  // Tire wear along the drive lanes and oil at the bay apron
  const wear = (x: number, z: number, len: number, yaw: number) => b.add('wear', new THREE.PlaneGeometry(len, 2.4), [x, 0.047, z], [-Math.PI / 2, 0, yaw]);
  wear(-50, -14, 34, Math.PI / 2);
  wear(-50, 2, 12, 0);
  wear(-30, -36 + 6, 28, 0);
  wear(-8, 14, 14, Math.PI / 2);
  for (const z of HQ.bayDoorZ) b.add('stain', new THREE.PlaneGeometry(3.4, 2.4), [sx0 - 4.5, 0.095, z], [-Math.PI / 2, 0, 0]);
  // Catch basins (storm drains)
  for (const [x, z] of [[-20, -31.5], [-44, 7], [-40, 19]] as [number, number][]) {
    b.box('darkMetal', [0.9, 0.03, 0.6], [x, 0.045, z]);
    for (let i = 0; i < 5; i++) b.box('stripe', [0.9, 0.012, 0.05], [x, 0.062, z - 0.25 + i * 0.125], undefined);
  }

  // ---- Landscape islands: curbed, with decomposed granite and mulch beds (plants from the vegetation layer)
  const island = (x: number, z: number, w: number, d: number) => {
    b.box('curb', [w, 0.18, 0.3], [x, 0.09, z - d / 2]);
    b.box('curb', [w, 0.18, 0.3], [x, 0.09, z + d / 2]);
    b.box('curb', [0.3, 0.18, d], [x - w / 2, 0.09, z]);
    b.box('curb', [0.3, 0.18, d], [x + w / 2, 0.09, z]);
    b.box('rockBrown', [w - 0.3, 0.14, d - 0.3], [x, 0.07, z]);
  };
  island(-25.5, -18, 2.6, 30);
  island(-14, -5, 4.0, 4.0);
  // North landscape strip between the wall and the lot, west strip along the street
  b.box('gravel', [54, 0.05, 7], [-29, 0.03, -38.5]);
  b.box('mulch', [12, 0.05, 2.6], [-36, 0.045, -36.5]);
  b.box('mulch', [12, 0.05, 2.6], [-14, 0.045, -36.5]);
  b.box('mulch', [2.4, 0.05, 20], [-56.3, 0.045, -22]);
  b.box('mulch', [2.4, 0.05, 20], [-56.3, 0.045, 20]);
  // Southwest: staff patio with a shade sail, picnic tables, a bed of mesquite
  const patio: V3 = [-38, 0, 30];
  b.box('concrete', [12, 0.1, 9], [patio[0], 0.0, patio[2]]);
  for (const [dx, dz] of [[-5, -3.8], [5, -3.8], [-5, 3.8], [5, 3.8]] as [number, number][]) b.add('darkMetal', new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8), [patio[0] + dx, 1.7, patio[2] + dz]);
  b.box('shadeFabric', [11, 0.04, 8.4], [patio[0], 3.3, patio[2]], [0.03, 0, 0.05]);
  for (const dx of [-2.8, 2.8]) {
    b.box('wood', [1.8, 0.06, 0.8], [patio[0] + dx, 0.76, patio[2]]);
    for (const dz of [-0.7, 0.7]) b.box('wood', [1.8, 0.05, 0.3], [patio[0] + dx, 0.46, patio[2] + dz]);
    for (const sx of [-0.7, 0.7]) b.box('darkMetal', [0.06, 0.75, 1.5], [patio[0] + dx + sx, 0.38, patio[2]]);
  }
  b.box('mulch', [26, 0.05, 10], [-30, 0.045, 37]);

  // ---- Light poles with twin shoebox fixtures (concrete base, square pole)
  const poles: [number, number][] = [[-50, -31], [-25.5, -8], [-25.5, 6], [-9, 8.5], [-16, 23]];
  if (has('additional-parking')) poles.push([-50, 24]);
  for (const [x, z] of poles) {
    b.add('concrete', new THREE.CylinderGeometry(0.32, 0.38, 0.7, 12), [x, 0.35, z]);
    b.box('darkMetal', [0.18, 8.4, 0.18], [x, 4.9, z]);
    b.box('darkMetal', [2.4, 0.12, 0.2], [x, 9.0, z]);
    for (const sgn of [-1, 1]) {
      b.box('darkMetal', [0.9, 0.22, 0.5], [x + sgn * 0.95, 8.95, z]);
      b.box('lamp', [0.8, 0.04, 0.4], [x + sgn * 0.95, 8.82, z]);
    }
  }

  // ================================================================ OFFICE
  // Main volume with a block veneer base, stucco body, parapet coping and a membrane roof
  b.box('block', [o.w + 0.16, 1.0, o.d + 0.16], [o.x, 0.5, o.z]);
  b.box('officeWall', [o.w, o.h - 1.0, o.d], [o.x, 1.0 + (o.h - 1.0) / 2, o.z]);
  b.box('roofMembrane', [o.w - 1.0, 0.1, o.d - 1.0], [o.x, o.h + 0.02, o.z]);
  coping(b, 'darkMetal', o.x, o.z, o.w, o.d, o.h + 0.08);
  b.box('darkPanel', [o.w + 0.2, 0.22, o.d + 0.2], [o.x, 3.95, o.z]); // floor-line reveal band
  // West (lot-facing) and north (street-facing) elevations share one detail recipe.
  type Face = { axis: 'x' | 'z'; at: number; from: number; to: number; dir: 1 | -1; center: number };
  const faces: Face[] = [
    { axis: 'x', at: ox0, from: o.z - o.d / 2, to: o.z + o.d / 2, dir: -1, center: o.z },
    { axis: 'z', at: o.z - o.d / 2, from: o.x - o.w / 2, to: o.x + o.w / 2, dir: -1, center: o.x },
  ];
  const P = (f: Face, along: number, out: number, y: number): V3 => (f.axis === 'x' ? [f.at + f.dir * out, y, along] : [along, y, f.at + f.dir * out]);
  const SZ = (f: Face, along: number, out: number, y: number): V3 => (f.axis === 'x' ? [out, y, along] : [along, y, out]);
  for (const f of faces) {
    const len = f.to - f.from;
    // Pilasters every 5.6 m, full height, proud of the wall; storefront between them
    const bays = Math.round(len / 5.6);
    const pitch = len / bays;
    for (let i = 0; i <= bays; i++) {
      const a = f.from + i * pitch;
      if (f.axis === 'x' && Math.abs(a - HQ.tower.z) < HQ.tower.d / 2) continue; // tower replaces these
      b.add('officeWall', new THREE.BoxGeometry(...SZ(f, 0.7, 0.4, o.h - 1.0)), P(f, a, 0.2, 1.0 + (o.h - 1.0) / 2));
      b.add('block', new THREE.BoxGeometry(...SZ(f, 0.8, 0.5, 1.0)), P(f, a, 0.25, 0.5));
    }
    // Ground floor storefront: continuous glass with mullions, header and sill
    b.add('storefront', new THREE.BoxGeometry(...SZ(f, len - 1.2, 0.1, 2.6)), P(f, f.center, 0.1, 1.9));
    b.add('frame', new THREE.BoxGeometry(...SZ(f, len - 1.0, 0.16, 0.12)), P(f, f.center, 0.14, 3.25));
    b.add('concrete', new THREE.BoxGeometry(...SZ(f, len - 1.0, 0.3, 0.14)), P(f, f.center, 0.18, 0.56));
    for (let a = f.from + 1.4; a < f.to - 1.0; a += 1.4) b.add('frame', new THREE.BoxGeometry(...SZ(f, 0.08, 0.14, 2.6)), P(f, a, 0.12, 1.9));
    // Second floor: punched windows with dark frames, sills and sunshade fins
    for (let a = f.from + 2.6; a <= f.to - 2.2; a += 3.6) {
      if (f.axis === 'x' && Math.abs(a - HQ.tower.z) < HQ.tower.d / 2 + 1) continue;
      b.add('frame', new THREE.BoxGeometry(...SZ(f, 2.5, 0.16, 1.9)), P(f, a, 0.04, 5.75));
      b.add('storefront', new THREE.BoxGeometry(...SZ(f, 2.3, 0.08, 1.7)), P(f, a, 0.1, 5.75));
      b.add('concrete', new THREE.BoxGeometry(...SZ(f, 2.7, 0.1, 0.22)), P(f, a, 0.12, 4.75));
      b.add('darkMetal', new THREE.BoxGeometry(...SZ(f, 2.7, 0.7, 0.06)), P(f, a, 0.45, 6.85)); // sunshade
      for (const d of [-1.2, 1.2]) b.add('darkMetal', new THREE.BoxGeometry(...SZ(f, 0.06, 0.6, 0.06)), P(f, a + d, 0.42, 6.85));
    }
    // Wall packs (night lights), security cameras at the ends, downspouts with boots
    for (let a = f.from + pitch * 1.5; a < f.to - 2; a += pitch * 2) {
      if (f.axis === 'x' && Math.abs(a - HQ.tower.z) < HQ.tower.d / 2 + 1) continue;
      b.add('darkMetal', new THREE.BoxGeometry(...SZ(f, 0.4, 0.3, 0.26)), P(f, a, 0.15, 4.5));
      b.add('lamp', new THREE.BoxGeometry(...SZ(f, 0.34, 0.2, 0.08)), P(f, a, 0.17, 4.36));
    }
    for (const a of [f.from + 0.9, f.to - 0.9]) {
      b.add('galvanized', new THREE.BoxGeometry(...SZ(f, 0.14, 0.14, o.h - 0.6)), P(f, a, 0.1, 0.3 + (o.h - 0.6) / 2));
      b.add('galvanized', new THREE.BoxGeometry(...SZ(f, 0.14, 0.5, 0.14)), P(f, a, 0.28, 0.35));
      b.add('darkMetal', new THREE.BoxGeometry(...SZ(f, 0.14, 0.14, 0.14)), P(f, a, 0.3, 6.9)); // camera
      b.add('white', new THREE.BoxGeometry(...SZ(f, 0.1, 0.16, 0.1)), P(f, a, 0.42, 6.9));
    }
  }
  // Entry tower: charcoal ACM volume projecting from the west face, carrying the main sign and the vestibule
  const t = HQ.tower;
  b.box('darkPanel', [t.w, t.h, t.d], [t.x, t.h / 2, t.z]);
  coping(b, 'darkMetal', t.x, t.z, t.w - 0.1, t.d - 0.1, t.h + 0.08);
  b.box('roofMembrane', [t.w - 0.8, 0.1, t.d - 0.8], [t.x, t.h + 0.02, t.z]);
  b.box('teal', [0.06, t.h - 0.6, 0.12], [t.x - t.w / 2 - 0.02, t.h / 2, t.z - t.d / 2 + 0.3]); // teal reveal
  b.box('teal', [0.06, t.h - 0.6, 0.12], [t.x - t.w / 2 - 0.02, t.h / 2, t.z + t.d / 2 - 0.3]);
  // Vestibule: recessed glass with double doors, push bars and a mat
  const tx = t.x - t.w / 2; // tower front
  b.box('frame', [0.14, 3.2, 5.4], [tx + 0.5, 1.6, t.z]);
  b.box('storefront', [0.08, 3.0, 5.2], [tx + 0.45, 1.6, t.z]);
  b.box('darkPanel', [0.6, 3.2, 2.2], [tx + 0.3, 1.6, t.z - 3.7]);
  b.box('darkPanel', [0.6, 3.2, 2.2], [tx + 0.3, 1.6, t.z + 3.7]);
  for (const z of [-1.1, 1.1]) {
    b.box('frame', [0.08, 2.5, 0.08], [tx + 0.36, 1.25, t.z + z]);
    b.box('galvanized', [0.05, 0.05, 0.8], [tx + 0.3, 1.05, t.z + z * 0.55]); // push bars
  }
  b.box('frame', [0.08, 0.08, 2.4], [tx + 0.36, 2.5, t.z]);
  b.box('rubber', [1.6, 0.02, 2.6], [tx - 0.9, 0.11, t.z]); // entrance mat
  // Canopy: steel outriggers on two columns with a teal underside line
  b.box('darkMetal', [5.2, 0.28, 8.4], [tx - 2.6, 3.6, t.z]);
  b.box('darkPanel', [5.2, 0.5, 0.2], [tx - 2.6, 3.9, t.z - 4.2]);
  b.box('darkPanel', [5.2, 0.5, 0.2], [tx - 2.6, 3.9, t.z + 4.2]);
  b.box('darkPanel', [0.2, 0.5, 8.4], [tx - 5.2, 3.9, t.z]);
  b.box('teal', [5.0, 0.04, 0.16], [tx - 2.6, 3.44, t.z - 3.9]);
  b.box('teal', [5.0, 0.04, 0.16], [tx - 2.6, 3.44, t.z + 3.9]);
  for (const z of [-3.6, 3.6]) {
    b.box('darkMetal', [0.22, 3.5, 0.22], [tx - 4.9, 1.75, t.z + z]);
    b.add('lamp', new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), [tx - 2.6, 3.44, t.z + z]); // canopy downlights
  }
  // Planters, bench, bike rack, bollards
  for (const z of [-5.2, 5.2]) {
    b.box('planter', [1.6, 0.6, 1.0], [tx - 3.2, 0.4, t.z + z]);
    b.box('mulch', [1.4, 0.04, 0.8], [tx - 3.2, 0.72, t.z + z]);
  }
  b.box('wood', [1.8, 0.06, 0.45], [tx - 6.4, 0.5, t.z + 3.4]);
  b.box('wood', [1.8, 0.4, 0.06], [tx - 6.4, 0.75, t.z + 3.6]);
  for (const x of [-0.75, 0.75]) b.box('darkMetal', [0.06, 0.5, 0.45], [tx - 6.4 + x, 0.25, t.z + 3.4]);
  for (let i = 0; i < 3; i++) b.add('galvanized', new THREE.TorusGeometry(0.4, 0.03, 6, 16, Math.PI), [tx - 6.4 + i * 0.9 - 0.9, 0.1, t.z - 3.6], [0, Math.PI / 2, 0]);
  for (const z of [-4.6, 4.6]) b.add('bollard', new THREE.CylinderGeometry(0.12, 0.12, 1.0, 10), [tx - 6.8, 0.5, t.z + z]);
  // Rooftop: four packaged units on curbs behind a louvered mechanical screen, hatch, vents, antenna
  for (const [x, z, yaw] of [[-14, 4, 0], [-4, 2, 0], [8, 5, 0.4], [16, -6, 0]] as [number, number, number][]) addPackageUnit(b, [o.x + x, o.h + 0.07, o.z + z], yaw, 2.8);
  for (const [x, z, w, d] of [[-2, -1, 28, 0.08], [-16, 2, 0.08, 7]] as [number, number, number, number][]) {
    for (let i = 0; i < 6; i++) b.box('darkPanel', [w === 0.08 ? 0.08 : w, 0.16, d === 0.08 ? 0.08 : d], [o.x + x, o.h + 0.4 + i * 0.3, o.z + z], [w === 0.08 ? 0 : 0.5, 0, w === 0.08 ? 0.5 : 0]);
    for (const e of [-0.5, 0.5]) b.box('darkMetal', [w === 0.08 ? 0.08 : 0.08, 2.0, d === 0.08 ? 0.08 : 0.08], [o.x + x + (w === 0.08 ? 0 : e * w), o.h + 1.0, o.z + z + (d === 0.08 ? 0 : e * d)]);
  }
  b.box('galvanized', [0.9, 0.5, 0.9], [o.x + 18, o.h + 0.3, o.z + 8]); // roof hatch
  for (const [x, z] of [[-18, -8], [2, -9], [12, -10]] as [number, number][]) {
    b.add('galvanized', new THREE.CylinderGeometry(0.22, 0.22, 0.7, 10), [o.x + x, o.h + 0.4, o.z + z]);
    b.add('darkMetal', new THREE.CylinderGeometry(0.34, 0.22, 0.18, 10), [o.x + x, o.h + 0.82, o.z + z]);
  }
  b.add('darkMetal', new THREE.CylinderGeometry(0.05, 0.08, 4.5, 8), [o.x + 21, o.h + 2.3, o.z - 11]);
  if (has('dispatch-center')) {
    b.add('metal', new THREE.CylinderGeometry(0.08, 0.12, 7, 8), [o.x + 18, o.h + 3.5, o.z + 9]);
    b.add('white', new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), [o.x + 18, o.h + 6.6, o.z + 9], [-Math.PI / 4, 0, 0]);
    b.box('darkMetal', [0.2, 0.2, 1.2], [o.x + 18, o.h + 7.0, o.z + 9.4]);
  }
  // Utility corner behind the office: transformer on a pad, gas meter, backflow preventer
  b.box('concrete', [3.2, 0.12, 2.6], [o.x + o.w / 2 + 3.5, 0.06, o.z + 8]);
  b.box('transformer', [1.8, 1.3, 1.6], [o.x + o.w / 2 + 3.5, 0.77, o.z + 8]);
  for (const z of [-1.5, 1.5]) b.add('bollard', new THREE.CylinderGeometry(0.1, 0.1, 1.0, 8), [o.x + o.w / 2 + 2.2, 0.5, o.z + 8 + z]);
  b.add('copper', new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), [o.x + o.w / 2 + 1.2, 0.6, o.z - 4]);
  b.box('galvanized', [0.3, 0.4, 0.5], [o.x + o.w / 2 + 1.2, 0.9, o.z - 4]);

  // ================================================================ SERVICE BUILDING
  // Walls as slabs so the bay openings are real; ribbed metal above a block wainscot
  const wallT = 0.3;
  const sz0 = s.z - s.d / 2;
  const sz1 = s.z + s.d / 2;
  const sx1 = s.x + s.w / 2;
  b.box('block', [s.w + 0.16, 1.2, s.d + 0.16], [s.x, 0.6, s.z]); // wainscot ring (solid; interiors sit above the floor inside)
  // East, north, south walls
  b.box('siding', [wallT, s.h - 1.2, s.d], [sx1 - wallT / 2, 1.2 + (s.h - 1.2) / 2, s.z]);
  b.box('siding', [s.w, s.h - 1.2, wallT], [s.x, 1.2 + (s.h - 1.2) / 2, sz0 + wallT / 2]);
  b.box('siding', [s.w, s.h - 1.2, wallT], [s.x, 1.2 + (s.h - 1.2) / 2, sz1 - wallT / 2]);
  // West wall: segments between the bay openings, and the header band above them
  const doorW = HQ.bayDoorW;
  const openings = HQ.bayDoorZ.map((z) => [z - doorW / 2, z + doorW / 2] as [number, number]);
  let cursor = sz0;
  for (const [a, c] of openings) {
    if (a - cursor > 0.05) b.box('siding', [wallT, s.h - 1.2, a - cursor], [sx0 + wallT / 2, 1.2 + (s.h - 1.2) / 2, (cursor + a) / 2]);
    cursor = c;
  }
  b.box('siding', [wallT, s.h - 1.2, sz1 - cursor], [sx0 + wallT / 2, 1.2 + (s.h - 1.2) / 2, (cursor + sz1) / 2]);
  b.box('siding', [wallT, s.h - 5.0, s.d], [sx0 + wallT / 2, 5.0 + (s.h - 5.0) / 2, s.z]); // header band
  // Wainscot has to open at the doors too
  b.box('bayFloor', [s.w - 0.4, 0.2, s.d - 0.4], [s.x, 0.1, s.z]); // slab (inside the wainscot ring)
  for (const z of HQ.bayDoorZ) b.box('bayFloor', [1.4, 1.22, doorW], [sx0 + 0.3, 0.61, z]); // cut the wainscot visually at the openings
  // Roof deck, parapet coping, teal accent line, downspouts
  b.box('roofMembrane', [s.w - 0.6, 0.12, s.d - 0.6], [s.x, s.h - 0.02, s.z]);
  coping(b, 'darkMetal', s.x, s.z, s.w, s.d, s.h + 0.08);
  b.box('teal', [0.08, 0.14, s.d], [sx0 - 0.04, s.h - 0.55, s.z]);
  b.box('teal', [s.w, 0.14, 0.08], [s.x, s.h - 0.55, sz1 + 0.04]);
  for (const z of [sz0 + 1.2, sz1 - 1.2]) {
    b.box('galvanized', [0.14, s.h - 0.8, 0.14], [sx0 - 0.1, 0.4 + (s.h - 0.8) / 2, z]);
    b.box('galvanized', [0.5, 0.14, 0.14], [sx0 - 0.3, 0.4, z]);
  }
  // Bay openings: jambs, header, door tracks (the door panel is a live component), wall packs, bollards, bay plates
  for (const z of HQ.bayDoorZ) {
    b.box('darkMetal', [0.5, 0.45, doorW + 0.6], [sx0 - 0.05, 5.2, z]);
    for (const dz of [-1, 1]) b.box('darkMetal', [0.5, 5.0, 0.3], [sx0 - 0.05, 2.5, z + dz * (doorW / 2 + 0.15)]);
    for (const dz of [-1, 1]) b.box('galvanized', [0.06, 4.6, 0.08], [sx0 + 0.5, 2.5, z + dz * (doorW / 2 - 0.1)]); // vertical tracks
    for (const dz of [-1, 1]) b.box('galvanized', [9.5, 0.06, 0.08], [sx0 + 5.5, 5.1, z + dz * (doorW / 2 - 0.1)]); // horizontal tracks
    for (const dz of [-1, 1]) b.add('bollard', new THREE.CylinderGeometry(0.12, 0.12, 1.1, 10), [sx0 - 1.3, 0.55, z + dz * (doorW / 2 + 0.7)]);
    b.box('darkMetal', [0.36, 0.26, 0.5], [sx0 - 0.3, 6.3, z]);
    b.box('lamp', [0.3, 0.1, 0.42], [sx0 - 0.33, 6.16, z]);
  }
  // Man door with canopy and a light, between the office and bay 1
  b.box('darkMetal', [0.2, 2.3, 1.1], [sx0 - 0.1, 1.15, 2.2]);
  b.box('galvanized', [0.06, 0.25, 0.06], [sx0 - 0.25, 1.1, 2.55]);
  b.box('darkMetal', [1.2, 0.08, 1.8], [sx0 - 0.6, 2.6, 2.2]);
  b.box('lamp', [0.2, 0.12, 0.4], [sx0 - 0.4, 2.9, 2.2]);
  // Roof: exhaust fans, skylights, a mechanical screen along the east
  for (const x of [-12, 0, 12]) {
    b.box('darkMetal', [3.0, 0.3, 2.0], [s.x + x, s.h + 0.15, s.z - 6]);
    b.box('white', [2.8, 0.5, 1.8], [s.x + x, s.h + 0.5, s.z - 6]); // skylight domes
  }
  for (const [x, z] of [[16, 8], [8, 10]] as [number, number][]) {
    b.add('galvanized', new THREE.CylinderGeometry(0.5, 0.5, 0.6, 12), [s.x + x, s.h + 0.3, s.z + z]);
    b.add('darkMetal', new THREE.CylinderGeometry(0.72, 0.5, 0.35, 12), [s.x + x, s.h + 0.75, s.z + z]);
    b.add('grille', new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12), [s.x + x, s.h + 0.95, s.z + z]);
  }
  addPackageUnit(b, [s.x + 14, s.h + 0.07, s.z - 2], 0, 2.4);
  // South (yard) elevation: man door with canopy, wall packs, louvered intake and an exhaust hood
  b.box('darkMetal', [1.1, 2.3, 0.2], [s.x - 16, 1.15, sz1 + 0.1]);
  b.box('darkMetal', [1.8, 0.08, 1.2], [s.x - 16, 2.6, sz1 + 0.6]);
  b.box('lamp', [0.4, 0.12, 0.2], [s.x - 16, 2.9, sz1 + 0.4]);
  for (const x of [-6, 6, 18]) {
    b.box('darkMetal', [0.4, 0.3, 0.26], [s.x + x, 4.8, sz1 + 0.15]);
    b.box('lamp', [0.34, 0.2, 0.08], [s.x + x, 4.66, sz1 + 0.17]);
  }
  b.box('grille', [2.4, 1.4, 0.1], [s.x + 2, 3.6, sz1 + 0.06]);
  for (let i = 0; i < 6; i++) b.box('galvanized', [2.4, 0.06, 0.12], [s.x + 2, 3.0 + i * 0.24, sz1 + 0.1], [0.5, 0, 0]);
  b.box('galvanized', [1.0, 0.8, 0.6], [s.x + 10, 5.2, sz1 + 0.35]);
  b.box('grille', [0.9, 0.12, 0.5], [s.x + 10, 4.75, sz1 + 0.35]);
  b.box('darkMetal', [0.4, 0.6, 0.16], [s.x - 4, 1.5, sz1 + 0.1]); // hose bib cabinet
  // Compressed air: receiver tank on a pad at the south wall; electrical service panel
  b.box('concrete', [2.4, 0.12, 1.4], [s.x - 10, 0.06, sz1 + 1.0]);
  b.add('galvanized', new THREE.CylinderGeometry(0.35, 0.35, 1.6, 12), [s.x - 10, 1.0, sz1 + 1.0]);
  b.box('darkMetal', [0.7, 0.5, 0.5], [s.x - 10, 1.9, sz1 + 1.0]);
  b.box('darkMetal', [1.0, 1.4, 0.16], [s.x + 16, 1.3, sz1 + 0.08]);

  // ---- Bay interiors: visible when a door is up (built for every bay so the shell reads as a shop)
  for (const [i, z] of HQ.bayDoorZ.entries()) {
    const bx = sx0 + 5.5; // interior center along x (10 m deep)
    // Ceiling strip lights
    for (const dx of [-3, 2]) b.box('interiorLight', [3.6, 0.08, 0.3], [bx + dx, 4.95, z]);
    // Back wall shelving with boxes
    const back = sx0 + 10.5;
    for (let k = 0; k < 3; k++) {
      b.box('galvanized', [0.6, 0.05, 6.0], [back, 0.6 + k * 1.1, z]);
      for (let j = 0; j < 5; j++) b.box(j % 2 ? 'cardboard' : 'unitCabinet', [0.5, 0.5, 0.8], [back, 0.9 + k * 1.1, z - 2.4 + j * 1.2]);
    }
    for (const dz of [-3, 3]) b.box('galvanized', [0.6, 3.4, 0.06], [back, 1.7, z + dz]);
    // Workbench with a vise and pegboard, tool chest, dolly, ladder on the side wall
    const side = z - doorW / 2 + 0.6;
    b.box('wood', [3.0, 0.08, 0.7], [sx0 + 3.5, 0.9, side]);
    b.box('darkMetal', [3.0, 0.8, 0.6], [sx0 + 3.5, 0.45, side]);
    b.box('cardboard', [2.8, 1.2, 0.05], [sx0 + 3.5, 1.8, side - 0.3]);
    addToolCart(b, [sx0 + 7.5, 0.2, side + 0.3], 0, i === 2 ? 'darkMetal' : 'redSteel');
    addDolly(b, [sx0 + 1.8, 0.2, z + doorW / 2 - 0.6], Math.PI / 2);
    addLadder(b, [sx0 + 6, 2.2, z + doorW / 2 - 0.35], 0, 3.2, 0.05);
    // Staged equipment for the next job
    if (i === 0) {
      addCondenser(b, [sx0 + 7.5, 0.2, z + 1.4], 0.3, { pad: false });
      addAirHandler(b, [sx0 + 8.6, 0.2, z - 1.6], 0);
      addServiceMachine(b, [sx0 + 3.2, 0.2, z + 2.2], 0.4);
      addCylinder(b, [sx0 + 3.8, 0.2, z + 2.6]);
    } else {
      addPalletUnit(b, [sx0 + 8.2, 0.2, z], 0, i === 1 ? 'condenser' : 'box');
      addServiceMachine(b, [sx0 + 3.4, 0.2, z + 2.3], -0.3, 'galvanized');
    }
  }

  // ================================================================ EQUIPMENT YARD (south, behind chain-link)
  const yz0 = 33.5;
  b.box('gravel', [70, 0.06, D / 2 - yz0 - 1], [21, 0.03, (yz0 + D / 2 - 0.5) / 2]);
  addChainLinkFence(b, [-14, yz0], [56, yz0], 2.0, [-6, yz0]);
  addChainLinkFence(b, [-14, yz0], [-14, D / 2 - 0.6], 2.0);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) addPalletUnit(b, [6 + c * 1.6, 0.06, 36.5 + r * 1.7], (r + c) * 0.05, c === 2 ? 'box' : 'condenser');
  addPackageUnit(b, [16, 0.06, 38.5], 0.2, 2.6);
  addDuctStack(b, [-4, 0.06, 38.5], 0);
  addContainer(b, [34, 0.06, 38.5], 0, 'containerTeal');
  addCargoTrailer(b, [48, 0.06, 37.5], 0.1);
  // Refrigerant cage: galvanized frame with chain-link sides and a row of cylinders
  const cage: V3 = [24, 0.06, 36.5];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('galvanized', [0.06, 2.0, 0.06], [cage[0] + sx * 1.6, 1.06, cage[2] + sz * 1.0]);
  b.box('galvanized', [3.3, 0.06, 2.1], [cage[0], 2.06, cage[2]]);
  b.add('chainLink', new THREE.PlaneGeometry(3.2, 1.9), [cage[0], 1.06, cage[2] + 1.0], [0, 0, 0]);
  b.add('chainLink', new THREE.PlaneGeometry(2.0, 1.9), [cage[0] - 1.6, 1.06, cage[2]], [0, Math.PI / 2, 0]);
  for (let i = 0; i < 6; i++) addCylinder(b, [cage[0] - 1.25 + i * 0.5, 0.06, cage[2] - 0.4], i % 3 === 0 ? 'safetyOrange' : 'steelBlue');
  // Dumpster enclosure with steel gates, plus safety cones and a ladder against the fence
  const de: V3 = [-9, 0, 39];
  b.box('block', [0.3, 2.0, 4.0], [de[0] - 2.2, 1.0, de[2]]);
  b.box('block', [0.3, 2.0, 4.0], [de[0] + 2.2, 1.0, de[2]]);
  b.box('block', [4.7, 2.0, 0.3], [de[0], 1.0, de[2] + 2.0]);
  for (const sx of [-1, 1]) b.box('darkMetal', [1.9, 1.8, 0.06], [de[0] + sx * 1.1, 1.0, de[2] - 2.0], [0, sx * 0.9, 0]);
  addDumpster(b, [de[0], 0.06, de[2] + 0.2], 0);
  for (const [x, z] of [[-2, 35], [0.5, 35.5]] as [number, number][]) {
    b.add('safetyOrange', new THREE.ConeGeometry(0.16, 0.6, 10), [x, 0.36, z]);
    b.box('darkMetal', [0.4, 0.04, 0.4], [x, 0.08, z]);
  }
  addLadder(b, [-12.5, 1.5, 38], Math.PI / 2, 3.6, 1.2);

  // ================================================================ PERIMETER, MONUMENT, FLAG
  const wallH = 2.4;
  b.box('block', [W - 1, wallH, 0.25], [0, wallH / 2, D / 2 - 0.5]);
  b.box('block', [W - 1, wallH, 0.25], [0, wallH / 2, -D / 2 + 0.5]);
  b.box('block', [0.25, wallH, D - 1], [W / 2 - 0.5, wallH / 2, 0]);
  b.box('block', [0.25, wallH, D / 2 - 8], [-W / 2 + 0.5, wallH / 2, -D / 2 + 0.5 + (D / 2 - 8) / 2]);
  b.box('block', [0.25, wallH, D / 2 - 8], [-W / 2 + 0.5, wallH / 2, D / 2 - 0.5 - (D / 2 - 8) / 2]);
  for (let x = -W / 2 + 0.5; x <= W / 2; x += 11.5) for (const z of [-D / 2 + 0.5, D / 2 - 0.5]) b.box('block', [0.5, wallH + 0.2, 0.5], [x, (wallH + 0.2) / 2, z]);
  b.box('trim', [W - 1, 0.08, 0.4], [0, wallH + 0.04, D / 2 - 0.5]);
  b.box('trim', [W - 1, 0.08, 0.4], [0, wallH + 0.04, -D / 2 + 0.5]);
  for (const z of [-8, 8]) {
    b.box('block', [0.9, 3.0, 0.9], [-W / 2 + 0.5, 1.5, z]);
    b.box('darkMetal', [1.0, 0.14, 1.0], [-W / 2 + 0.5, 3.05, z]);
    b.add('lamp', new THREE.SphereGeometry(0.14, 8, 6), [-W / 2 + 0.5, 3.3, z]);
  }
  // Monument sign: block base, charcoal cabinet (face textured by the component), cap, uplights
  const m: V3 = [-54.5, 0, -16];
  b.box('block', [1.4, 0.5, 4.6], [m[0], 0.25, m[2]]);
  b.box('darkPanel', [0.6, 2.0, 4.2], [m[0], 1.5, m[2]]);
  b.box('darkMetal', [0.8, 0.12, 4.4], [m[0], 2.56, m[2]]);
  b.box('teal', [0.62, 0.05, 4.2], [m[0], 2.5, m[2]]);
  b.box('mulch', [3, 0.05, 7], [m[0], 0.03, m[2]]);
  for (const dz of [-1.4, 1.4]) b.box('darkMetal', [0.3, 0.14, 0.3], [m[0] - 1.1, 0.07, m[2] + dz]);
  // Flag pole in the north bed
  b.add('metal', new THREE.CylinderGeometry(0.06, 0.1, 10, 8), [-20, 5, -38.5]);
  b.add('concrete', new THREE.CylinderGeometry(0.3, 0.35, 0.3, 10), [-20, 0.15, -38.5]);
  b.box('teal', [2.2, 1.3, 0.04], [-18.9, 9.2, -38.5]);

  // ================================================================ UPGRADE ANNEXES
  if (has('training-room')) {
    b.box('officeWall', [10, 5.2, 16], [o.x + o.w / 2 + 5, 2.6, o.z]);
    coping(b, 'darkMetal', o.x + o.w / 2 + 5, o.z, 10, 16, 5.3);
    b.box('roofMembrane', [9.2, 0.1, 15.2], [o.x + o.w / 2 + 5, 5.22, o.z]);
    for (const z of [-5, 0, 5]) {
      b.box('frame', [0.12, 1.7, 2.6], [o.x + o.w / 2 + 10.05, 2.6, o.z + z]);
      b.box('storefront', [0.08, 1.5, 2.4], [o.x + o.w / 2 + 10.09, 2.6, o.z + z]);
    }
  }
  if (has('parts-warehouse')) {
    const wx = -24;
    const wz = 31;
    b.box('siding', [44, 5.6, 18], [wx, 2.8, wz]);
    coping(b, 'darkMetal', wx, wz, 44, 18, 5.7);
    b.box('roofMembrane', [43.2, 0.1, 17.2], [wx, 5.62, wz]);
    b.box('block', [44.1, 1.2, 18.1], [wx, 0.6, wz]);
    b.box('white', [6, 4.0, 0.2], [wx, 2.0, wz - 9.1]);
    b.box('darkMetal', [6.4, 0.4, 0.4], [wx, 4.2, wz - 9.2]);
    b.box('concrete', [10, 0.09, 6], [wx, 0.0, wz - 12]);
  }
  if (has('staging-area')) {
    const cx = 30;
    const cz = 38;
    for (const x of [-10, 10]) for (const z of [-3.5, 3.5]) b.add('metal', new THREE.CylinderGeometry(0.12, 0.12, 4.5, 8), [cx + x, 2.25, cz + z]);
    b.box('teal', [24, 0.25, 10], [cx, 4.6, cz]);
    b.box('dark', [24.2, 0.08, 10.2], [cx, 4.76, cz]);
  }
  if (has('sales-office')) {
    const px = -8;
    const pz = -39;
    b.box('storefront', [18, 4.2, 8], [px, 2.3, pz]);
    for (let x = -9; x <= 9; x += 3) b.box('frame', [0.14, 4.4, 0.14], [px + x, 2.3, pz - 4.05]);
    b.box('darkMetal', [18.6, 0.3, 8.6], [px, 4.6, pz]);
    b.box('concrete', [18.6, 0.2, 8.6], [px, 0.1, pz]);
  }
  addSiteDetail(b, has, upgrades.length);
  addOperations(b);
  const g = b.build('hq');
  if (import.meta.env.DEV) console.debug(`[build] hq ${(performance.now() - t0).toFixed(0)} ms`);
  return g;
}
