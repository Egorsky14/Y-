import * as THREE from 'three';
import { HOUSE_HALF_WIDTH, type Lot } from '@/game/world/cityLayout';
import type { Equipment } from '@/game/simulation/types';
import { MeshBuilder } from '../assets/pbr';
import { addCondenser } from '../props/hvac';
import { FACING_ROTATION } from './HouseBuilder';
import { STATIC_MATERIALS, UV_SCALES } from './materials';

/**
 * Each house's outdoor unit shows the customer's actual system: a faded, rust-streaked R-22 unit
 * on old systems, the familiar gray louvered cabinet in mid life, and a graphite wire-guard unit
 * on current systems, with the EGO badge once EGO has installed it. Footprint, height, service
 * panel and valve positions are the same in every generation, so the technician's kneel, hands
 * and gauge hoses (LiveEntities, job-site kit) meet the cabinet exactly as before.
 *
 * All units are merged per material into one group, rebuilt only when a generation changes
 * (a replacement install), not every frame.
 */

export type CondenserGeneration = 'legacy' | 'standard' | 'current' | 'ego';

export const EGO_BRAND = 'EGO Select';

export function condenserGeneration(equipment: Pick<Equipment, 'ageYears' | 'refrigerant' | 'brand'>): CondenserGeneration {
  if (equipment.brand === EGO_BRAND) return 'ego';
  if (equipment.refrigerant === 'R-22' || equipment.ageYears > 15) return 'legacy';
  if (equipment.ageYears <= 4) return 'current';
  return 'standard';
}

/** Unit placement in the house's local frame (front at -z): beside the condenser-side wall, service side to the street. */
export function houseCondenserLocal(lot: Lot): { x: number; z: number; size: number; height: number } {
  const style = lot.style ?? 'ranch';
  return { x: HOUSE_HALF_WIDTH[style] + 0.9, z: -3, size: style === 'premium' ? 1.08 : 0.92, height: style === 'premium' ? 1.0 : 0.86 };
}

function resolve(key: string): THREE.Material {
  const m = (STATIC_MATERIALS as unknown as Record<string, () => THREE.Material>)[key];
  if (!m) throw new Error(`Unknown condenser material ${key}`);
  return m();
}

function addUnit(b: MeshBuilder, lot: Lot, gen: CondenserGeneration): void {
  const u = houseCondenserLocal(lot);
  const w = u.size;
  const h = u.height;
  const cabinet = gen === 'legacy' ? 'unitCabinetFaded' : gen === 'standard' ? 'unitCabinet' : 'unitCabinetGraphite';
  const lotFrame = new THREE.Matrix4().compose(new THREE.Vector3(lot.center.x, 0, lot.center.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), FACING_ROTATION[lot.facing]), new THREE.Vector3(1, 1, 1));
  b.setFrame(lotFrame);
  addCondenser(b, [u.x, 0, u.z], Math.PI, { pad: true, lineSet: false, fan: false, size: w, height: h, panelX: -0.01, serviceValves: [w * 0.39, w * 0.28], cabinet, guard: gen === 'legacy' || gen === 'standard' ? 'louver' : 'wire' });
  // Generation details in the unit's own frame (service face at unit +z, pad top at y 0.1).
  b.setFrame(lotFrame.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(u.x, 0, u.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(1, 1, 1))));
  const y0 = 0.1;
  const face = w / 2 - 0.002;
  if (gen === 'legacy') {
    // Rust bloom along the base rail and the bottom of each guard, streaks from the top deck corners,
    // and a sun-bleached rating plate.
    for (const side of [-1, 1]) b.box('corrosion', [0.006, 0.035, w - 0.1], [side * (w / 2 + 0.001), y0 + 0.03, 0]);
    b.box('corrosion', [w - 0.1, 0.035, 0.006], [0, y0 + 0.03, -(w / 2 + 0.001)]);
    // Short drips under the top deck: [face, position along it, length].
    for (const [f, a, len] of [[0, -0.31, 0.16], [0, 0.22, 0.09], [1, -0.12, 0.13], [1, 0.35, 0.07], [2, 0.05, 0.11], [3, 0.3, 0.08]] as const) {
      const y = y0 + h - 0.06 - (len * h) / 2;
      const s = a * w;
      if (f === 0) b.box('corrosion', [0.006, len * h, 0.016], [w / 2 + 0.001, y, s]);
      else if (f === 1) b.box('corrosion', [0.006, len * h, 0.016], [-(w / 2 + 0.001), y, s]);
      else if (f === 2) b.box('corrosion', [0.016, len * h, 0.006], [s, y, -(w / 2 + 0.001)]);
      else b.box('corrosion', [0.016, len * h, 0.006], [s + w * 0.12, y, w / 2 + 0.001]);
    }
    b.box('unitCabinetTan', [0.16, 0.1, 0.006], [-0.01 - w * 0.12, y0 + h - 0.22, face + 0.001]);
  } else {
    // Rating plate on the service panel; EGO installs carry the teal EGO badge above it.
    b.box('white', [0.14, 0.08, 0.006], [-0.01 - w * 0.12, y0 + h - 0.24, face + 0.001]);
    if (gen === 'ego') b.box('badgeTeal', [0.2, 0.045, 0.008], [-0.01, y0 + h - 0.12, face + 0.001]);
  }
  b.setFrame(null);
}

/**
 * One merged group of every house unit; `generations` maps lot id → generation (default standard).
 * `materials` replaces the shared textured materials (tests run without a canvas).
 */
export function buildHouseCondensers(lots: Lot[], generations: Record<string, CondenserGeneration>, materials: (key: string) => THREE.Material = resolve): THREE.Group {
  const b = new MeshBuilder(materials, UV_SCALES);
  for (const lot of lots) addUnit(b, lot, generations[lot.id] ?? 'standard');
  return b.build('house-condensers');
}
