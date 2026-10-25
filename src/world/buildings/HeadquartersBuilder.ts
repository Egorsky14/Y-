import * as THREE from 'three';
import type { HqUpgradeId } from '@/game/progression/hqUpgrades';
import { MeshBuilder } from '../assets/pbr';
import { STATIC_MATERIALS, UV_SCALES } from './materials';
import { HQ_LOT, hqParkingStalls } from '@/game/world/cityLayout';

/**
 * EGO HVAC headquarters, local space centered on the lot (street to the west, -x).
 * Static geometry merged per material; bay doors, signs and wordmarks are separate meshes.
 */
export const HQ = {
  office: { x: 25, z: -20, w: 46, d: 28, h: 7.6 },
  bays: { x: 25, z: 15, w: 46, d: 30, h: 6.6 },
  bayDoorZ: [7, 19, 27] as const,
  apronX: -11,
  parking: { x: -27.5, z: -12.5, w: 51, d: 41 },
};

export function buildHeadquarters(upgrades: HqUpgradeId[]): THREE.Group {
  const has = (id: HqUpgradeId) => upgrades.includes(id);
  const mats: Record<string, THREE.Material> = {
    asphalt: STATIC_MATERIALS.asphalt(),
    concrete: STATIC_MATERIALS.concrete(),
    gravel: STATIC_MATERIALS.gravel(),
    block: STATIC_MATERIALS.block(),
    siding: STATIC_MATERIALS.siding(),
    officeWall: STATIC_MATERIALS.officeWall(),
    storefront: STATIC_MATERIALS.storefront(),
    frame: STATIC_MATERIALS.frame(),
    dark: STATIC_MATERIALS.dark(),
    darkMetal: STATIC_MATERIALS.darkMetal(),
    metal: STATIC_MATERIALS.metal(),
    white: STATIC_MATERIALS.white(),
    trim: STATIC_MATERIALS.trim(),
    teal: STATIC_MATERIALS.teal(),
    lamp: STATIC_MATERIALS.lamp(),
    bollard: STATIC_MATERIALS.bollard(),
    curb: new THREE.MeshStandardMaterial({ color: '#c9c4b8', roughness: 0.95 }),
    stripe: new THREE.MeshStandardMaterial({ color: '#e8e8e4', roughness: 0.6 }),
    mulch: STATIC_MATERIALS.mulch(),
    wood: STATIC_MATERIALS.wood(),
    steelBlue: new THREE.MeshStandardMaterial({ color: '#8fa3b8', roughness: 0.4, metalness: 0.6 }),
  };
  const b = new MeshBuilder(mats, UV_SCALES);
  const W = HQ_LOT.width;
  const D = HQ_LOT.depth;

  // Lot ground: gravel with asphalt work areas and concrete pads.
  b.add('gravel', new THREE.PlaneGeometry(W - 0.6, D - 0.6), [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
  const parkD = HQ.parking.d + (has('additional-parking') ? 18 : 0);
  const parkZ = HQ.parking.z + (has('additional-parking') ? 9 : 0);
  b.box('asphalt', [HQ.parking.w, 0.08, parkD], [HQ.parking.x, 0.0, parkZ]);
  // Entrance drive from the street apron
  b.box('asphalt', [10, 0.08, 12], [-W / 2 + 4, 0.0, 0]);
  // Concrete apron in front of the bays and a walkway to the office entrance
  b.box('concrete', [14, 0.09, HQ.bays.d + 4], [HQ.apronX + 4, 0.0, HQ.bays.z]);
  b.box('concrete', [2.2, 0.09, 26], [HQ.office.x - HQ.office.w / 2 - 3, 0.0, -8]);
  b.box('concrete', [26, 0.09, 2.2], [-W / 2 + 13, 0.0, -1]);
  // Curbs around the parking lot edges
  const px0 = HQ.parking.x - HQ.parking.w / 2;
  const pz0 = parkZ - parkD / 2;
  const pz1 = parkZ + parkD / 2;
  b.box('curb', [HQ.parking.w + 0.6, 0.15, 0.3], [HQ.parking.x, 0.075, pz0]);
  b.box('curb', [HQ.parking.w + 0.6, 0.15, 0.3], [HQ.parking.x, 0.075, pz1]);
  b.box('curb', [0.3, 0.15, 0.3 + (pz1 - pz0) * 0.42], [px0, 0.075, pz0 + (pz1 - pz0) * 0.21]);
  b.box('curb', [0.3, 0.15, 0.3 + (pz1 - pz0) * 0.42], [px0, 0.075, pz1 - (pz1 - pz0) * 0.21]);
  // Parking stalls: stripes, wheel stops
  const stallCount = 2 + (has('expanded-garage') ? 2 : 0) + (has('additional-parking') ? 4 : 0);
  const stalls = hqParkingStalls(Math.max(8, stallCount));
  stalls.forEach((s, i) => {
    const lx = s.pos.x - HQ_LOT.center.x;
    const lz = s.pos.z - HQ_LOT.center.z;
    const active = i < stallCount;
    if (!active && !has('additional-parking')) return;
    b.box('stripe', [9, 0.012, 0.14], [lx, 0.05, lz - 4]);
    b.box('stripe', [9, 0.012, 0.14], [lx, 0.05, lz + 4]);
    b.box('concrete', [0.4, 0.14, 1.8], [lx - 3.8, 0.11, lz]);
    if (active) b.box('teal', [0.5, 0.012, 2.2], [lx + 4.2, 0.052, lz]); // EGO reserved marker
  });
  // Light poles with twin fixtures
  const poles: [number, number][] = [[-46, -31], [-10, -31], [-46, 6], [-10, 6]];
  if (has('additional-parking')) poles.push([-46, 24], [-10, 24]);
  for (const [x, z] of poles) {
    b.add('metal', new THREE.CylinderGeometry(0.1, 0.14, 8, 10), [x, 4, z]);
    b.box('metal', [2.4, 0.16, 0.3], [x, 8, z]);
    for (const s of [-1, 1]) b.box('lamp', [0.8, 0.14, 0.4], [x + s * 0.95, 7.9, z]);
    b.add('concrete', new THREE.CylinderGeometry(0.35, 0.4, 0.6, 10), [x, 0.3, z]);
  }

  // ---- Office: two-storey, glass storefront on the ground floor, stucco above, parapet.
  const o = HQ.office;
  const ox0 = o.x - o.w / 2;
  b.box('officeWall', [o.w, o.h, o.d], [o.x, o.h / 2, o.z]);
  b.box('dark', [o.w + 0.5, 0.5, o.d + 0.5], [o.x, o.h + 0.1, o.z]); // parapet cap
  b.box('teal', [o.w + 0.3, 0.35, o.d + 0.3], [o.x, 3.7, o.z]); // floor-line band
  // Ground-floor storefront on the west (parking) and north (street) faces
  b.box('storefront', [0.12, 2.9, o.d - 4], [ox0 - 0.06, 1.75, o.z]);
  for (let z = -o.d / 2 + 2; z <= o.d / 2 - 2; z += 2.8) b.box('frame', [0.2, 3.1, 0.14], [ox0 - 0.1, 1.75, o.z + z]);
  b.box('frame', [0.22, 0.14, o.d - 3.8], [ox0 - 0.1, 3.3, o.z]);
  b.box('frame', [0.22, 0.14, o.d - 3.8], [ox0 - 0.1, 0.25, o.z]);
  b.box('storefront', [o.w - 6, 2.9, 0.12], [o.x, 1.75, o.z - o.d / 2 - 0.06]);
  for (let x = -o.w / 2 + 3; x <= o.w / 2 - 3; x += 2.8) b.box('frame', [0.14, 3.1, 0.2], [o.x + x, 1.75, o.z - o.d / 2 - 0.1]);
  // Second-floor punched windows
  for (let z = -o.d / 2 + 3; z <= o.d / 2 - 3; z += 3.6) {
    b.box('frame', [0.12, 1.7, 2.3], [ox0 - 0.05, 5.6, o.z + z]);
    b.box('storefront', [0.08, 1.5, 2.1], [ox0 - 0.09, 5.6, o.z + z]);
  }
  for (let x = -o.w / 2 + 3; x <= o.w / 2 - 3; x += 3.6) {
    b.box('frame', [2.3, 1.7, 0.12], [o.x + x, 5.6, o.z - o.d / 2 - 0.05]);
    b.box('storefront', [2.1, 1.5, 0.08], [o.x + x, 5.6, o.z - o.d / 2 - 0.09]);
  }
  // Entrance: recessed vestibule with glass doors, canopy, bollards, sign band
  const ex = ox0 - 0.2;
  const ez = o.z - 4;
  b.box('frame', [0.2, 3.0, 4.2], [ex - 0.1, 1.5, ez]);
  b.box('storefront', [0.08, 2.8, 3.8], [ex - 0.25, 1.4, ez]);
  b.box('metal', [0.06, 1.1, 0.06], [ex - 0.35, 1.3, ez - 0.4]);
  b.box('metal', [0.06, 1.1, 0.06], [ex - 0.35, 1.3, ez + 0.4]);
  b.box('dark', [6.0, 0.3, 7.5], [ex - 3.0, 3.4, ez]);
  b.box('teal', [6.0, 0.08, 7.5], [ex - 3.0, 3.26, ez]);
  for (const z of [-3.2, 3.2]) b.box('darkMetal', [0.12, 3.4, 0.12], [ex - 5.8, 1.7, ez + z]);
  b.box('white', [0.3, 2.6, 16], [ox0 - 0.15, 5.9, ez]); // white sign band for the wordmark (textured mesh added by the component)
  // Rooftop: HVAC units, parapet ladder, antenna
  for (const [x, z] of [[-14, 4], [0, 2], [14, 5], [8, -8]] as [number, number][]) {
    b.box('metal', [3.2, 1.3, 2.4], [o.x + x, o.h + 0.9, o.z + z]);
    b.box('darkMetal', [3.4, 0.08, 2.6], [o.x + x, o.h + 1.6, o.z + z]);
    b.add('darkMetal', new THREE.CylinderGeometry(0.8, 0.8, 0.05, 16), [o.x + x + 0.6, o.h + 1.66, o.z + z]);
  }
  b.box('metal', [0.4, 2.0, 0.1], [o.x + o.w / 2 - 1, o.h + 0.5, o.z + o.d / 2 + 0.1]);
  if (has('dispatch-center')) {
    b.add('metal', new THREE.CylinderGeometry(0.08, 0.12, 7, 8), [o.x + 18, o.h + 3.5, o.z + 9]);
    b.add('white', new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), [o.x + 18, o.h + 6.6, o.z + 9], [-Math.PI / 4, 0, 0]);
    b.box('darkMetal', [0.2, 0.2, 1.2], [o.x + 18, o.h + 7.0, o.z + 9.4]);
  }

  // ---- Service building: ribbed metal, bays facing the apron, man door, wall packs, bollards
  const s = HQ.bays;
  const sx0 = s.x - s.w / 2;
  b.box('siding', [s.w, s.h, s.d], [s.x, s.h / 2, s.z]);
  b.box('dark', [s.w + 0.5, 0.5, s.d + 0.5], [s.x, s.h + 0.1, s.z]);
  b.box('teal', [s.w + 0.3, 0.3, s.d + 0.3], [s.x, s.h - 0.9, s.z]);
  b.box('block', [s.w + 0.1, 1.0, s.d + 0.1], [s.x, 0.5, s.z]); // wainscot
  const doorZs: number[] = [HQ.bayDoorZ[0]];
  if (has('expanded-garage')) doorZs.push(HQ.bayDoorZ[1]);
  if (has('fleet-maintenance')) doorZs.push(HQ.bayDoorZ[2]);
  for (const z of doorZs) {
    b.box('dark', [0.4, 0.5, 7.6], [sx0 - 0.1, 5.0, z]); // door header
    for (const dz of [-3.9, 3.9]) b.box('dark', [0.4, 4.8, 0.3], [sx0 - 0.1, 2.4, z + dz]); // jambs
    for (const dz of [-4.8, 4.8]) {
      b.add('bollard', new THREE.CylinderGeometry(0.12, 0.12, 1.1, 10), [sx0 - 1.2, 0.55, z + dz]);
    }
    b.box('darkMetal', [0.35, 0.25, 0.5], [sx0 - 0.25, 5.6, z]);
    b.box('lamp', [0.2, 0.12, 0.4], [sx0 - 0.3, 5.5, z]);
  }
  // Blanked future bay positions read as wall panels with a number plate
  b.box('darkMetal', [0.3, 2.3, 1.1], [sx0 - 0.12, 1.15, -5]); // man door
  b.box('metal', [0.06, 0.25, 0.06], [sx0 - 0.3, 1.1, -4.7]);
  b.box('darkMetal', [0.3, 0.25, 0.5], [sx0 - 0.25, 3.0, -5]);
  b.box('lamp', [0.2, 0.12, 0.4], [sx0 - 0.3, 2.9, -5]);
  // Rooftop exhaust and skylights on the bays
  for (const x of [-12, 0, 12]) b.box('white', [3, 0.5, 2], [s.x + x, s.h + 0.4, s.z - 6]);
  b.add('metal', new THREE.CylinderGeometry(0.35, 0.35, 1.5, 10), [s.x + 16, s.h + 0.9, s.z + 8]);
  b.add('metal', new THREE.CylinderGeometry(0.6, 0.35, 0.3, 10), [s.x + 16, s.h + 1.75, s.z + 8]);

  // ---- Yard: equipment pallets, refrigerant cage, dumpster enclosure, perimeter block wall
  for (const [x, z] of [[6, 36], [10, 36], [14, 36]] as [number, number][]) {
    b.box('wood', [2.2, 0.25, 2.2], [x, 0.12, z]);
    b.box('metal', [1.7, 1.5, 1.7], [x, 1.0, z]);
    b.box('darkMetal', [1.75, 0.06, 1.75], [x, 1.78, z]);
  }
  for (let i = 0; i < 4; i++) b.add('steelBlue', new THREE.CylinderGeometry(0.2, 0.2, 1.3, 10), [24 + i * 0.6, 0.65, 38]);
  b.box('darkMetal', [3.2, 1.9, 0.06], [25, 0.95, 39.2]);
  b.box('darkMetal', [3.2, 1.9, 0.06], [25, 0.95, 36.8]);
  b.box('block', [0.3, 1.8, 3.4], [-50, 0.9, 36]);
  b.box('block', [4.4, 1.8, 0.3], [-48, 0.9, 37.6]);
  b.box('block', [0.3, 1.8, 3.4], [-45.9, 0.9, 36]);
  b.box('dark', [3.6, 1.5, 2.0], [-48, 0.75, 36]);
  // Perimeter block wall (north, south, east sides) with pilasters and a gate return at the drive
  const wallH = 2.4;
  b.box('block', [W - 1, wallH, 0.25], [0, wallH / 2, D / 2 - 0.5]);
  b.box('block', [W - 1, wallH, 0.25], [0, wallH / 2, -D / 2 + 0.5]);
  b.box('block', [0.25, wallH, D - 1], [W / 2 - 0.5, wallH / 2, 0]);
  b.box('block', [0.25, wallH, D / 2 - 7], [-W / 2 + 0.5, wallH / 2, -D / 2 + 0.5 + (D / 2 - 7) / 2]);
  b.box('block', [0.25, wallH, D / 2 - 7], [-W / 2 + 0.5, wallH / 2, D / 2 - 0.5 - (D / 2 - 7) / 2]);
  for (let x = -W / 2 + 0.5; x <= W / 2; x += 11.5) for (const z of [-D / 2 + 0.5, D / 2 - 0.5]) b.box('block', [0.5, wallH + 0.2, 0.5], [x, (wallH + 0.2) / 2, z]);
  b.box('trim', [W - 1, 0.08, 0.4], [0, wallH + 0.04, D / 2 - 0.5]);
  b.box('trim', [W - 1, 0.08, 0.4], [0, wallH + 0.04, -D / 2 + 0.5]);
  // Gate posts flanking the drive
  for (const z of [-7, 7]) b.box('block', [0.8, 3.0, 0.8], [-W / 2 + 0.5, 1.5, z]);

  // ---- Monument sign base (panel textured by the component), flag pole, entrance island
  b.box('block', [1.2, 0.9, 4.4], [-50, 0.45, -12]);
  b.box('dark', [0.3, 1.5, 4.0], [-50.2, 1.65, -12]);
  b.box('mulch', [3, 0.05, 7], [-50, 0.03, -12]);
  b.add('metal', new THREE.CylinderGeometry(0.07, 0.1, 10, 8), [-46, 5, -18]);
  b.box('teal', [2.2, 1.3, 0.04], [-44.9, 9.2, -18]);
  // Landscape islands with mulch (plants come from the vegetation layer)
  for (const [x, z] of [[-27.5, -34.5], [-27.5, 10.5]] as [number, number][]) b.box('mulch', [40, 0.05, 2.2], [x, 0.03, z]);
  b.box('mulch', [6, 0.05, 20], [-55, 0.03, -22]);
  b.box('mulch', [6, 0.05, 24], [-55, 0.03, 24]);

  // ---- Upgrade annexes
  if (has('training-room')) {
    b.box('officeWall', [10, 5.2, 16], [o.x + o.w / 2 + 5, 2.6, o.z]);
    b.box('dark', [10.4, 0.4, 16.4], [o.x + o.w / 2 + 5, 5.4, o.z]);
    for (const z of [-5, 0, 5]) {
      b.box('frame', [0.12, 1.7, 2.6], [o.x + o.w / 2 + 10.05, 2.6, o.z + z]);
      b.box('storefront', [0.08, 1.5, 2.4], [o.x + o.w / 2 + 10.09, 2.6, o.z + z]);
    }
  }
  if (has('parts-warehouse')) {
    const wx = -24;
    const wz = 31;
    b.box('siding', [44, 5.6, 18], [wx, 2.8, wz]);
    b.box('dark', [44.5, 0.4, 18.5], [wx, 5.8, wz]);
    b.box('block', [44.1, 1.0, 18.1], [wx, 0.5, wz]);
    b.box('white', [6, 4.0, 0.2], [wx, 2.0, wz - 9.1]);
    b.box('dark', [6.4, 0.4, 0.4], [wx, 4.2, wz - 9.2]);
    b.box('concrete', [10, 0.09, 6], [wx, 0.0, wz - 12]);
  }
  if (has('staging-area')) {
    const cx = 30;
    const cz = 38;
    for (const x of [-10, 10]) for (const z of [-3.5, 3.5]) b.add('metal', new THREE.CylinderGeometry(0.12, 0.12, 4.5, 8), [cx + x, 2.25, cz + z]);
    b.box('teal', [24, 0.25, 10], [cx, 4.6, cz]);
    b.box('dark', [24.2, 0.08, 10.2], [cx, 4.76, cz]);
    for (let i = 0; i < 4; i++) {
      b.box('wood', [2.2, 0.25, 2.2], [cx - 8 + i * 5, 0.12, cz]);
      b.box('white', [1.8, 1.7, 1.8], [cx - 8 + i * 5, 1.1, cz]);
    }
  }
  if (has('sales-office')) {
    const px = -8;
    const pz = -39;
    b.box('storefront', [18, 4.2, 8], [px, 2.3, pz]);
    for (let x = -9; x <= 9; x += 3) b.box('frame', [0.14, 4.4, 0.14], [px + x, 2.3, pz - 4.05]);
    b.box('dark', [18.6, 0.4, 8.6], [px, 4.6, pz]);
    b.box('concrete', [18.6, 0.2, 8.6], [px, 0.1, pz]);
  }
  return b.build('hq');
}
