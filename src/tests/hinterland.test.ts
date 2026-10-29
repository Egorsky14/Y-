import { describe, expect, it } from 'vitest';
import { ALL_LOTS, ROAD_WIDTH, SIDEWALK_WIDTH, STREETS, WORLD_HALF } from '@/game/world/cityLayout';
import { buildRoadGraph } from '@/game/world/roadGraph';
import { hinterland, isOpenDesert, roadReserve, scenicRoads, terrainHeight } from '@/world/city/hinterlandLayout';

/**
 * World Immersion: the surrounding valley is scenery only. It must leave the playable district, its
 * streets and the routing graph exactly as they are, and must never put a building on a road.
 */

type Rect = { x0: number; x1: number; z0: number; z1: number };
const overlap = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const lotRect = (l: (typeof ALL_LOTS)[number]): Rect => ({ x0: l.center.x - l.width / 2, x1: l.center.x + l.width / 2, z0: l.center.z - l.depth / 2, z1: l.center.z + l.depth / 2 });
const streetRect = (s: (typeof STREETS)[number], pad: number): Rect => {
  const half = ROAD_WIDTH / 2 + SIDEWALK_WIDTH + pad;
  return s.axis === 'x' ? { x0: s.from, x1: s.to, z0: s.at - half, z1: s.at + half } : { x0: s.at - half, x1: s.at + half, z0: s.from, z1: s.to };
};

describe('hinterland', () => {
  const h = hinterland();

  it('leaves the routing graph inside the playable district', () => {
    const graph = buildRoadGraph();
    for (const n of graph.nodes.values()) {
      expect(Math.abs(n.pos.x)).toBeLessThanOrEqual(WORLD_HALF);
      expect(Math.abs(n.pos.z)).toBeLessThanOrEqual(WORLD_HALF);
    }
    // The playable streets themselves are unchanged (the scenic layout only reads them).
    expect(STREETS.map((s) => [s.axis, s.at, s.from, s.to])).toEqual([
      ['x', -100, -WORLD_HALF, WORLD_HALF],
      ['x', 0, -WORLD_HALF, WORLD_HALF],
      ['x', 100, -WORLD_HALF, WORLD_HALF],
      ['z', -130, -WORLD_HALF, WORLD_HALF],
      ['z', 0, -WORLD_HALF, WORLD_HALF],
      ['z', 130, -WORLD_HALF, WORLD_HALF],
    ]);
  });

  it('continues every playable street end and keeps scenic roads out of the district', () => {
    const roads = scenicRoads();
    for (const s of STREETS) {
      expect(roads.some((r) => r.axis === s.axis && r.at === s.at && r.from === s.to)).toBe(true);
      expect(roads.some((r) => r.axis === s.axis && r.at === s.at && r.to === s.from)).toBe(true);
    }
    for (const r of roads) {
      const crossesInside = Math.abs(r.at) < WORLD_HALF && r.from < WORLD_HALF && r.to > -WORLD_HALF;
      expect(crossesInside).toBe(false);
    }
  });

  it('places no scenery on a playable lot or street, or on a scenic road', () => {
    const lots = ALL_LOTS.map(lotRect);
    const streets = STREETS.map((s) => streetRect(s, 0));
    const scenic = scenicRoads().map((r) => {
      const half = roadReserve(r.kind) - 1;
      return r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.at - half, z1: r.at + half } : { x0: r.at - half, x1: r.at + half, z0: r.from, z1: r.to };
    });
    const items: Rect[] = [
      ...h.boxes.map((b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 })),
      ...h.flats.filter((f) => !f.rot).map((f) => ({ x0: f.x - f.w / 2, x1: f.x + f.w / 2, z0: f.z - f.d / 2, z1: f.z + f.d / 2 })),
    ];
    expect(items.length).toBeGreaterThan(1000);
    for (const it of items) {
      for (const l of lots) expect(overlap(it, l)).toBe(false);
      for (const s of streets) expect(overlap(it, s)).toBe(false);
      for (const s of scenic) expect(overlap(it, s)).toBe(false);
    }
  });

  it('is deterministic, finite and has varied districts', () => {
    const kinds = new Set(h.cells.map((c) => c.kind));
    for (const k of ['subdivision', 'business', 'golf', 'school', 'desert', 'estates']) expect(kinds.has(k as never)).toBe(true);
    for (const b of h.boxes) expect([b.x, b.z, b.w, b.d, b.h].every(Number.isFinite)).toBe(true);
    const roofColors = new Set(h.roofs.map((r) => r.color));
    expect(roofColors.size).toBeGreaterThan(5);
    expect(h.boxes.length).toBeLessThan(40000);
    expect(h.trees.length).toBeLessThan(30000);
  });

  it('keeps the valley floor flat under the district and its surroundings', () => {
    for (const [x, z] of [[0, 0], [215, 215], [-900, 900], [1100, -1100]]) expect(terrainHeight(x, z)).toBe(0);
    expect(terrainHeight(2200, 0)).toBeGreaterThan(20);
  });

  it('reports roads and built parcels as not open desert', () => {
    expect(isOpenDesert(0, -400)).toBe(false); // Palo Verde Way continued north
    expect(isOpenDesert(600, 260 + 3)).toBe(false); // section-line arterial
    const sub = h.cells.find((c) => c.kind === 'subdivision')!;
    expect(isOpenDesert((sub.x0 + sub.x1) / 2, (sub.z0 + sub.z1) / 2)).toBe(false);
  });
});

describe('ambient traffic', () => {
  it('drives only on scenic arterials, inside their asphalt and outside the playable district', async () => {
    const { ambientCars } = await import('@/world/vehicles/AmbientTraffic');
    const cars = ambientCars(1);
    const roads = scenicRoads().filter((r) => r.kind !== 'collector');
    expect(cars.length).toBeGreaterThan(100);
    expect(ambientCars(0)).toHaveLength(0);
    for (const c of cars) {
      const road = roads.find((r) => r.axis === c.axis && r.at === c.at)!;
      expect(road).toBeDefined();
      expect(Math.abs(c.lane)).toBeLessThan(road.width / 2 - 0.9);
      expect(Math.abs(c.at)).toBeGreaterThan(WORLD_HALF + 20);
    }
  });
});
