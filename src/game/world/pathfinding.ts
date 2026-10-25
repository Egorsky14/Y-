import type { RoadGraph } from './roadGraph';
import type { Vec2 } from './geometry';
import { dist } from './geometry';

/** A* over the road graph. Returns node ids from start to goal inclusive, or null when unreachable. */
export function findPath(graph: RoadGraph, startId: string, goalId: string): string[] | null {
  if (startId === goalId) return [startId];
  const goal = graph.nodes.get(goalId);
  const start = graph.nodes.get(startId);
  if (!goal || !start) return null;

  const open = new Set<string>([startId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startId, 0]]);
  const fScore = new Map<string, number>([[startId, dist(start.pos, goal.pos)]]);

  while (open.size > 0) {
    let current = '';
    let best = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < best) {
        best = f;
        current = id;
      }
    }
    if (current === goalId) {
      const path = [current];
      while (cameFrom.has(current)) {
        current = cameFrom.get(current)!;
        path.push(current);
      }
      return path.reverse();
    }
    open.delete(current);
    const g = gScore.get(current) ?? Infinity;
    for (const edge of graph.adjacency.get(current) ?? []) {
      const tentative = g + edge.length;
      if (tentative < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, current);
        gScore.set(edge.to, tentative);
        const h = dist(graph.nodes.get(edge.to)!.pos, goal.pos);
        fScore.set(edge.to, tentative + h);
        open.add(edge.to);
      }
    }
  }
  return null;
}

export interface RouteWaypoint {
  pos: Vec2;
  /** True when this leg runs along a street (right-lane offset applies). */
  onRoad: boolean;
}

export function pathToWaypoints(graph: RoadGraph, nodeIds: string[]): RouteWaypoint[] {
  return nodeIds.map((id) => ({ pos: graph.nodes.get(id)!.pos, onRoad: true }));
}

export function routeLength(waypoints: RouteWaypoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) total += dist(waypoints[i - 1].pos, waypoints[i].pos);
  return total;
}
