import { describe, expect, it } from 'vitest';
import { HQ_LOT, hqParkingStalls } from '@/game/world/cityLayout';
import { BAG_LOCAL } from '@/world/scene/serviceCall';
import { HQ, HQ_OPERATIONS_SOLIDS } from '@/world/buildings/HeadquartersBuilder';
import { HQ_STAFF_ROW, HQ_VISITOR_CARS, parkedCarSpots } from '@/world/vehicles/parkedCarSpots';

/**
 * World Immersion: the HQ operations staging stays clear of the fleet stalls, the stall-to-apron route, the bay doors and
 * the parked cars.
 */

describe('HQ operations clearances', () => {
  type R = { x0: number; x1: number; z0: number; z1: number };
  const rect = (p: { x: number; z: number; w: number; d: number }): R => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 });
  const overlap = (a: R, b: R) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
  const solids = HQ_OPERATIONS_SOLIDS.map(rect);

  it('keeps every fleet stall (all eight, 9 x 4 m with a van) and the route corridor free', () => {
    for (const st of hqParkingStalls(8)) {
      const stall = rect({ x: st.pos.x - HQ_LOT.center.x, z: st.pos.z - HQ_LOT.center.z, w: 9.4, d: 4.4 });
      for (const s of solids) expect(overlap(s, stall)).toBe(false);
    }
    const corridor: R = { x0: -60, x1: -26, z0: -32, z1: 2 };
    for (const s of solids) expect(overlap(s, corridor)).toBe(false);
  });

  it('keeps bay door openings and parked cars clear', () => {
    const doorFace = HQ.bays.x - HQ.bays.w / 2;
    for (const z of HQ.bayDoorZ) {
      const lane = rect({ x: doorFace - 7, z, w: 14, d: HQ.bayDoorW + 0.4 });
      for (const s of solids) expect(overlap(s, lane)).toBe(false);
    }
    const cars = [...HQ_VISITOR_CARS.map((c) => ({ x: c.x, z: c.z, w: 2.0, d: 4.6 })), ...HQ_STAFF_ROW.map((c) => ({ x: c.x, z: c.z, w: 2.0, d: 4.6 }))].map(rect);
    for (const c of cars) for (const s of solids) expect(overlap(s, c)).toBe(false);
  });

  it('shows visitors by business hours without touching staff cars', () => {
    expect(parkedCarSpots(3, true).length - parkedCarSpots(3, false).length).toBe(4);
  });
});

describe('tool bag placement', () => {
  it('sets the bag down clear of both legs (bag 0.46 x 0.30 m, legs within 0.18 m of the centre line)', () => {
    // Nearest bag edge to the body, whichever way the bag is turned: centre minus half its long side.
    expect(Math.abs(BAG_LOCAL.x) - 0.23).toBeGreaterThan(0.18 + 0.1);
  });
});
