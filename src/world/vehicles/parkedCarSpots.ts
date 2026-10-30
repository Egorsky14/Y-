import { COMPETITOR_LOT, HOUSE_LOTS, HQ_LOT, lotLocalHeading, lotLocalToWorld } from '@/game/world/cityLayout';
import { hashLot } from '../city/yardLayout';
import { DRIVEWAYS } from '../buildings/driveways';

/** Placement of the decorative parked cars (pure; rendered by ParkedCars). */

export const CIVILIAN_MODELS = ['civilian-sedan', 'civilian-suv'] as const;
export type CivilianModel = (typeof CIVILIAN_MODELS)[number];

const PAINTS = ['#e6e7e8', '#a7abb0', '#5b6068', '#8b2c2c', '#2f4c74', '#c8b998', '#34493f', '#d9d4c8', '#6f747b'];

export interface ParkedCarSpot {
  x: number;
  z: number;
  heading: number;
  model: CivilianModel;
  paint: string;
}

function hqSpot(x: number, z: number, heading: number, seed: number): ParkedCarSpot {
  return { x: HQ_LOT.center.x + x, z: HQ_LOT.center.z + z, heading, model: CIVILIAN_MODELS[seed % 2], paint: PAINTS[(seed >> 2) % PAINTS.length] };
}

/** Competitor (Desert Chill Air) front row, lot-local: stalls 2.8 m apart, clear of its parked vans (x -20..8). */
export const COMPETITOR_CARS = [0, 2, 3, 6, 10, 11, 25, 27, 30].map((i) => ({ x: -46.2 + (i + 0.5) * 2.8, z: -34, seed: 7 + i * 11 }));

/** HQ visitor row (nose to the north curb) and staff row (nose to the south curb), lot-local. */
export const HQ_VISITOR_CARS = [0, 2, 3, 5, 1].map((i) => ({ x: -24.5 + (i + 0.5) * 2.8, z: -30.7, seed: 11 + i * 7 }));
export const HQ_STAFF_ROW = Array.from({ length: 9 }, (_, i) => ({ x: -54 + (i + 0.5) * 3.0, z: 18.4, seed: 31 + i * 13 }));

/**
 * Residents' cars in about half the driveways (two on wide ones), visitors at HQ (customers and
 * vendor reps: five of the six stalls during business hours, one after), and one car per staff
 * member in the HQ staff row, up to nine, so the lot fills as the company hires.
 */
export function parkedCarSpots(staff: number, businessHours = true): ParkedCarSpot[] {
  const out: ParkedCarSpot[] = [];
  for (const lot of HOUSE_LOTS) {
    const d = DRIVEWAYS.get(lot.id);
    const h = hashLot(lot.id + 'car');
    if (!d || h % 9 > 3) continue;
    const cars = d.w > 7 && h % 2 === 0 ? [-1.4, 1.4] : [0];
    const heading = lotLocalHeading(lot, 0, 1); // nose toward the garage
    cars.forEach((off, i) => {
      const p = lotLocalToWorld(lot, d.x + off, d.frontZ - 3.4 - i * 0.4);
      out.push({ ...p, heading, model: CIVILIAN_MODELS[(h >> (3 + i)) % 2], paint: PAINTS[(h >> (5 + i * 3)) % PAINTS.length] });
    });
  }
  for (const v of HQ_VISITOR_CARS.slice(0, businessHours ? 5 : 1)) out.push(hqSpot(v.x, v.z, Math.PI, v.seed));
  // The competitor's front row: staff and customers, nose to the store (same cars day and night).
  for (const c of COMPETITOR_CARS) out.push({ x: COMPETITOR_LOT.center.x + c.x, z: COMPETITOR_LOT.center.z + c.z, heading: 0, model: CIVILIAN_MODELS[c.seed % 2], paint: PAINTS[(c.seed >> 2) % PAINTS.length] });
  for (const s of HQ_STAFF_ROW.slice(0, Math.max(0, Math.min(9, staff)))) out.push(hqSpot(s.x, s.z, 0, s.seed));
  return out;
}
