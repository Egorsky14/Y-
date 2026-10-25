import { describe, expect, it } from 'vitest';
import { getRoadGraph, curbNodeId } from '@/game/world/roadGraph';
import { findPath, pathToWaypoints, routeLength } from '@/game/world/pathfinding';
import { HOUSE_LOTS, ALL_LOTS } from '@/game/world/cityLayout';
import { sampleRoute, routeFromHqToLot } from '@/game/fleet/fleet';
import { hqParkingStalls } from '@/game/world/cityLayout';

describe('road graph', () => {
  it('connects every lot curb to the HQ curb', () => {
    const graph = getRoadGraph();
    for (const lot of ALL_LOTS) {
      if (lot.id === 'hq') continue;
      const path = findPath(graph, curbNodeId('hq'), curbNodeId(lot.id));
      expect(path, `path to ${lot.id}`).not.toBeNull();
      expect(path![0]).toBe(curbNodeId('hq'));
      expect(path![path!.length - 1]).toBe(curbNodeId(lot.id));
    }
  });

  it('produces routes that only follow road edges', () => {
    const graph = getRoadGraph();
    const path = findPath(graph, curbNodeId('hq'), curbNodeId(HOUSE_LOTS[0].id))!;
    for (let i = 1; i < path.length; i++) {
      const edges = graph.adjacency.get(path[i - 1]) ?? [];
      expect(edges.some((e) => e.to === path[i]), `${path[i - 1]} -> ${path[i]}`).toBe(true);
    }
    expect(routeLength(pathToWaypoints(graph, path))).toBeGreaterThan(50);
  });

  it('samples the route monotonically from HQ stall to the customer curb', () => {
    const stall = hqParkingStalls(1)[0];
    const vehicle = { position: { ...stall.pos }, stall: 0 } as Parameters<typeof routeFromHqToLot>[0];
    const route = routeFromHqToLot(vehicle, 'a-s-2')!;
    expect(route.totalLength).toBeGreaterThan(0);
    const start = sampleRoute(route, 0);
    expect(start.x).toBeCloseTo(stall.pos.x, 3);
    const end = sampleRoute(route, route.totalLength);
    const curb = HOUSE_LOTS.find((l) => l.id === 'a-s-2')!.curb;
    // End position is within lane-offset distance of the curb centerline point.
    expect(Math.hypot(end.x - curb.x, end.z - curb.z)).toBeLessThan(4);
  });
});
