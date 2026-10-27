import * as THREE from 'three';
import { MeshBuilder, concretePbr, membranePbr, pbrMaterial } from '../assets/pbr';
import { STATIC_MATERIALS, UV_SCALES } from './materials';
import { WAREHOUSE_LOT } from '@/game/world/cityLayout';
import { addPackageUnit, addPalletUnit } from '../props/hvac';

/**
 * Supply-house warehouse shell (lot-local frame): painted tilt-up concrete panels with vertical and
 * horizontal reveals, a parapet with metal coping and an accent band, a membrane roof with packaged
 * units and skylights, five dock positions (ribbed roll-up door, dock seals, bumpers, leveler,
 * canopy and dock light), PBR asphalt with yellow truck guide lines, and condensers on pallets in
 * the yard. Merged per material. The storefront, forecourt and sign stay separate components.
 */
export const WAREHOUSE = { x: 0, z: -8, w: 80, d: 44, h: 10 } as const;
export const DOCKS = [-24, -12, 0, 12, 24] as const;

export function buildWarehouse(): THREE.Group {
  const S = STATIC_MATERIALS;
  const mats: Record<string, THREE.Material> = {
    asphalt: S.asphalt(), concrete: S.concrete(), curb: S.curb(), stripe: S.stripe(), stripeYellow: S.stripeYellow(), darkMetal: S.darkMetal(), metal: S.metal(),
    galvanized: S.galvanized(), grille: S.grille(), insulation: S.insulation(), unitCabinetTan: S.unitCabinetTan(), unitCabinet: S.unitCabinet(), rubber: S.rubber(),
    cardboard: S.cardboard(), shrinkWrap: S.shrinkWrap(), wood: S.wood(), garage: S.garage(), lamp: S.lamp(), bollard: S.bollard(), dark: S.dark(), stain: S.stain(),
    panel: pbrMaterial(concretePbr(), { color: '#dcdad4', roughness: 0.9 }),
    panelBase: pbrMaterial(concretePbr(), { color: '#a99a84', roughness: 0.92 }),
    reveal: new THREE.MeshStandardMaterial({ color: '#8f8d88', roughness: 0.9 }),
    accent: new THREE.MeshStandardMaterial({ color: '#e0862e', roughness: 0.6 }),
    roofMembrane: pbrMaterial(membranePbr(), { roughness: 0.92 }),
    skylight: new THREE.MeshStandardMaterial({ color: '#cfe3ef', roughness: 0.2, metalness: 0.1 }),
    bumper: new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.95 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#e8b923', roughness: 0.6 }),
  };
  const b = new MeshBuilder(mats, { ...UV_SCALES, panel: 3, panelBase: 3, roofMembrane: 6, stain: 0 });
  const lot = WAREHOUSE_LOT;
  const { x: cx, z: cz, w, d, h } = WAREHOUSE;
  const front = cz + d / 2;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;

  // Paving: the whole lot in PBR asphalt with a concrete truck apron in front of the docks.
  b.box('asphalt', [lot.width - 2, 0.06, lot.depth - 2], [0, -0.01, 0]);
  b.box('concrete', [62, 0.08, 14], [0, 0.01, front + 7]);
  for (const x of DOCKS) {
    for (const s of [-1, 1]) b.box('stripeYellow', [0.15, 0.012, 16], [x + s * 1.6, 0.07, front + 9]); // truck guide lines
  }

  // Shell: base band, painted panels, parapet coping, accent band.
  b.box('panelBase', [w + 0.04, 1.6, d + 0.04], [cx, 0.8, cz]);
  b.box('panel', [w, h - 1.6, d], [cx, 1.6 + (h - 1.6) / 2, cz]);
  b.box('darkMetal', [w + 0.5, 0.35, 0.5], [cx, h + 0.17, front]);
  b.box('darkMetal', [w + 0.5, 0.35, 0.5], [cx, h + 0.17, cz - d / 2]);
  for (const s of [-1, 1]) b.box('darkMetal', [0.5, 0.35, d + 0.5], [cx + s * (w / 2), h + 0.17, cz]);
  b.box('accent', [w + 0.06, 0.35, d + 0.06], [cx, h - 0.9, cz]);
  // Vertical panel reveals on all four faces, horizontal reveal at the base band.
  const panelW = 6.66;
  for (let x = x0 + panelW; x < x1 - 0.5; x += panelW) {
    for (const z of [front + 0.02, cz - d / 2 - 0.02]) b.box('reveal', [0.07, h - 1.7, 0.03], [x, 1.6 + (h - 1.6) / 2, z]);
  }
  for (let z = cz - d / 2 + panelW; z < front - 0.5; z += panelW) for (const x of [x0 - 0.02, x1 + 0.02]) b.box('reveal', [0.03, h - 1.7, 0.07], [x, 1.6 + (h - 1.6) / 2, z]);
  b.box('reveal', [w + 0.08, 0.06, d + 0.08], [cx, 1.6, cz]);

  // Roof: membrane, packaged units, skylights, drains.
  b.box('roofMembrane', [w - 0.5, 0.1, d - 0.5], [cx, h + 0.02, cz]);
  for (const [x, z] of [[-26, -14], [-6, -2], [16, -16], [30, 0]] as [number, number][]) addPackageUnit(b, [cx + x, h + 0.08, cz + z], 0, 2.6);
  for (let i = 0; i < 6; i++) b.box('skylight', [1.4, 0.25, 2.4], [cx - 30 + i * 12, h + 0.15, cz + 8]);

  // Docks: ribbed roll-up door, seals, bumpers, leveler lip, canopy, dock light.
  for (const x of DOCKS) {
    b.box('garage', [3.6, 3.6, 0.12], [x, 1.25 + 1.8, front + 0.06]);
    b.box('darkMetal', [4.0, 0.25, 0.3], [x, 4.95, front + 0.15]); // door hood
    for (const s of [-1, 1]) b.box('rubber', [0.35, 3.8, 0.45], [x + s * 2.05, 1.25 + 1.9, front + 0.22]); // side seals
    b.box('rubber', [4.4, 0.45, 0.45], [x, 5.25, front + 0.22]); // head seal
    for (const s of [-1, 1]) b.box('bumper', [0.3, 0.5, 0.25], [x + s * 1.3, 1.0, front + 0.13]);
    b.box('galvanized', [2.4, 0.06, 0.5], [x, 1.22, front + 0.25]); // leveler lip
    b.box('panelBase', [3.0, 1.25, 0.6], [x, 0.62, front + 0.3]); // dock face
    b.box('yellow', [3.0, 0.08, 0.62], [x, 1.26, front + 0.3]);
    b.box('darkMetal', [0.5, 0.06, 0.06], [x - 2.6, 4.3, front + 0.3]); // dock light arm
    b.box('lamp', [0.25, 0.18, 0.25], [x - 2.6, 4.2, front + 0.55]);
    b.box('metal', [5.6, 0.18, 2.6], [x, 5.9, front + 1.3]); // canopy
  }
  // Bollards protecting the dock corners
  for (const x of [DOCKS[0] - 4.2, DOCKS[DOCKS.length - 1] + 4.2]) b.add('bollard', new THREE.CylinderGeometry(0.12, 0.12, 1.1, 10), [x, 0.55, front + 0.6]);

  // Condensers on pallets in the yard, east of the docks.
  for (const [x, z, yaw] of [[16, 30, 0.1], [20, 30, -0.05], [24, 30, 0.04], [28, 30, 0], [32, 30, -0.08], [18, 33.5, 0], [22, 33.5, 0.06], [30, 33.5, 0]] as [number, number, number][]) addPalletUnit(b, [x, 0.03, z], yaw, (x + z) % 4 === 0 ? 'box' : 'condenser');

  return b.build('warehouse');
}
