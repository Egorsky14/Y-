import { STREETS, ALL_LOTS, type Street } from './cityLayout';
import type { Vec2 } from './geometry';
import { dist } from './geometry';

export interface RoadNode {
  id: string;
  pos: Vec2;
  kind: 'intersection' | 'curb' | 'end';
  /** For curb nodes, the lot that stops here. */
  lotId?: string;
}

export interface RoadEdge {
  from: string;
  to: string;
  length: number;
  streetId: string;
}

export interface RoadGraph {
  nodes: Map<string, RoadNode>;
  /** Adjacency: node id -> outgoing edges (graph is undirected; both directions stored). */
  adjacency: Map<string, RoadEdge[]>;
  edges: RoadEdge[];
  streets: Street[];
}

function streetPoint(street: Street, along: number): Vec2 {
  return street.axis === 'x' ? { x: along, z: street.at } : { x: street.at, z: along };
}

/**
 * Builds the road graph from streets and lot curbs. Intersections are created where
 * streets cross, curb nodes where lots connect, and dead-end nodes at street ends.
 */
export function buildRoadGraph(): RoadGraph {
  const nodes = new Map<string, RoadNode>();
  const adjacency = new Map<string, RoadEdge[]>();
  const edges: RoadEdge[] = [];
  const perStreet = new Map<string, { along: number; nodeId: string }[]>();

  const addNode = (node: RoadNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
    return node.id;
  };
  const addOnStreet = (streetId: string, along: number, nodeId: string) => {
    const list = perStreet.get(streetId) ?? [];
    if (!list.some((e) => e.nodeId === nodeId)) list.push({ along, nodeId });
    perStreet.set(streetId, list);
  };

  // Intersections
  for (const a of STREETS) {
    for (const b of STREETS) {
      if (a.axis !== 'x' || b.axis !== 'z') continue;
      const pos = { x: b.at, z: a.at };
      const id = `ix:${b.at}:${a.at}`;
      addNode({ id, pos, kind: 'intersection' });
      addOnStreet(a.id, pos.x, id);
      addOnStreet(b.id, pos.z, id);
    }
  }
  // Street ends
  for (const s of STREETS) {
    for (const along of [s.from, s.to]) {
      const pos = streetPoint(s, along);
      const id = `end:${s.id}:${along}`;
      addNode({ id, pos, kind: 'end' });
      addOnStreet(s.id, along, id);
    }
  }
  // Curbs
  for (const lot of ALL_LOTS) {
    const street = STREETS.find((s) => s.id === lot.streetId);
    if (!street) continue;
    const along = street.axis === 'x' ? lot.curb.x : lot.curb.z;
    const id = `curb:${lot.id}`;
    addNode({ id, pos: lot.curb, kind: 'curb', lotId: lot.id });
    addOnStreet(street.id, along, id);
  }
  // Chain nodes along each street
  for (const s of STREETS) {
    const list = (perStreet.get(s.id) ?? []).sort((a, b) => a.along - b.along);
    for (let i = 0; i < list.length - 1; i++) {
      const a = nodes.get(list[i].nodeId)!;
      const b = nodes.get(list[i + 1].nodeId)!;
      const length = dist(a.pos, b.pos);
      const e1: RoadEdge = { from: a.id, to: b.id, length, streetId: s.id };
      const e2: RoadEdge = { from: b.id, to: a.id, length, streetId: s.id };
      edges.push(e1);
      (adjacency.get(a.id) ?? adjacency.set(a.id, []).get(a.id)!).push(e1);
      (adjacency.get(b.id) ?? adjacency.set(b.id, []).get(b.id)!).push(e2);
    }
  }
  return { nodes, adjacency, edges, streets: STREETS };
}

let cached: RoadGraph | null = null;
export function getRoadGraph(): RoadGraph {
  if (!cached) cached = buildRoadGraph();
  return cached;
}

export function curbNodeId(lotId: string): string {
  return `curb:${lotId}`;
}
