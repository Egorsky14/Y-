import { describe, expect, it } from 'vitest';
import { ALL_LOTS, HQ_LOT, hqParkingStalls, ROAD_WIDTH, SIDEWALK_WIDTH, STREETS } from '@/game/world/cityLayout';
import { greenbelts } from '@/world/city/greenbelt';
import { hqLandscapePlants } from '@/world/city/hqLandscape';

/**
 * Environment Revolution placement outside the house lots: common-area greenbelts stay between the
 * rows (off every lot, street and sidewalk) and HQ planting stays out of fleet stalls and routes.
 */

const lotRect = (l: (typeof ALL_LOTS)[number]) => ({ x0: l.center.x - l.width / 2, x1: l.center.x + l.width / 2, z0: l.center.z - l.depth / 2, z1: l.center.z + l.depth / 2 });
const overlap = (a: { x0: number; x1: number; z0: number; z1: number }, b: { x0: number; x1: number; z0: number; z1: number }) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const streetBand = (s: (typeof STREETS)[number]) => {
  const h = ROAD_WIDTH / 2 + SIDEWALK_WIDTH;
  return s.axis === 'x' ? { x0: s.from, x1: s.to, z0: s.at - h, z1: s.at + h } : { x0: s.at - h, x1: s.at + h, z0: s.from, z1: s.to };
};

describe('greenbelts', () => {
  const belts = greenbelts();

  it('sit between rows, off every lot, street and sidewalk', () => {
    expect(belts.length).toBe(3);
    for (const g of belts) {
      for (const l of ALL_LOTS) expect(overlap(g.rect, lotRect(l)), `${g.id} vs ${l.id}`).toBe(false);
      for (const s of STREETS) expect(overlap(g.rect, streetBand(s)), `${g.id} vs ${s.id}`).toBe(false);
    }
  });

  it('keep plants, benches and the path inside the strip, with finite values', () => {
    for (const g of belts) {
      const r = g.rect;
      for (const p of g.plants) {
        expect(p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1, `${g.id} ${p.species}`).toBe(true);
        expect([p.x, p.z, p.scale, p.rotation].every(Number.isFinite)).toBe(true);
      }
      for (const b of g.benches) expect(b.x >= r.x0 && b.x <= r.x1 && b.z >= r.z0 && b.z <= r.z1).toBe(true);
      for (const [x, z] of g.path) expect(x >= r.x0 - 0.01 && x <= r.x1 + 0.01 && z >= r.z0 && z <= r.z1).toBe(true);
      expect(g.plants.length).toBeGreaterThan(20);
    }
  });

  it('are deterministic', () => {
    expect(JSON.stringify(greenbelts())).toBe(JSON.stringify(belts));
  });
});

describe('HQ landscaping', () => {
  it('keeps every plant out of the fleet stalls (all eight) and the vehicle route corridor', () => {
    const stalls = hqParkingStalls(8).map((s) => ({ x: s.pos.x - HQ_LOT.center.x, z: s.pos.z - HQ_LOT.center.z }));
    for (const p of hqLandscapePlants()) {
      for (const s of stalls) expect(Math.abs(p.x - s.x) > 4.5 + 0.4 || Math.abs(p.z - s.z) > 4 + 0.4, `${p.species} at ${p.x},${p.z}`).toBe(true);
      // The HQ builder keeps x < -26, -32 < z < 2 free of anything solid (stall to apron routes).
      expect(p.x < -26 && p.z > -32 && p.z < 2, `${p.species} in the route corridor`).toBe(false);
      expect(Math.abs(p.x) < HQ_LOT.width / 2 && Math.abs(p.z) < HQ_LOT.depth / 2).toBe(true);
    }
  });
});
