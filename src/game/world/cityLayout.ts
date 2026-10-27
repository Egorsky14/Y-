import type { Vec2 } from './geometry';

/**
 * The Summerlin Ridge starter neighborhood.
 *
 * World units are approximately meters. +x is east, +z is south (Three.js XZ plane
 * viewed from above with the camera looking north means -z is "up" on screen).
 *
 * The layout is data, consumed by both the simulation (road graph, pathfinding,
 * lot positions) and the renderer (geometry). Nothing here depends on Three.js.
 */

export const ROAD_WIDTH = 10;
export const LANE_OFFSET = 2.6;
export const SIDEWALK_WIDTH = 2;
export const LOT_SETBACK = ROAD_WIDTH / 2 + SIDEWALK_WIDTH; // 7
export const WORLD_HALF = 215;

export interface Street {
  id: string;
  name: string;
  axis: 'x' | 'z';
  /** Fixed coordinate (z for east-west streets, x for north-south). */
  at: number;
  from: number;
  to: number;
}

export const STREETS: Street[] = [
  { id: 'st-n', name: 'Desert Bloom Ave', axis: 'x', at: -100, from: -WORLD_HALF, to: WORLD_HALF },
  { id: 'st-c', name: 'Sunset Mesa Dr', axis: 'x', at: 0, from: -WORLD_HALF, to: WORLD_HALF },
  { id: 'st-s', name: 'Red Rock Ln', axis: 'x', at: 100, from: -WORLD_HALF, to: WORLD_HALF },
  { id: 'av-w', name: 'Cactus Ct', axis: 'z', at: -130, from: -WORLD_HALF, to: WORLD_HALF },
  { id: 'av-c', name: 'Palo Verde Way', axis: 'z', at: 0, from: -WORLD_HALF, to: WORLD_HALF },
  { id: 'av-e', name: 'Mesquite St', axis: 'z', at: 130, from: -WORLD_HALF, to: WORLD_HALF },
];

export type Facing = 'north' | 'south' | 'east' | 'west';
export type HouseStyle = 'ranch' | 'two-story' | 'premium' | 'spanish' | 'modern';

export interface Lot {
  id: string;
  kind: 'house' | 'hq' | 'warehouse' | 'competitor' | 'park';
  /** Center of the lot footprint. */
  center: Vec2;
  width: number;
  depth: number;
  /** Direction the front door faces (toward the street). */
  facing: Facing;
  /** Street the driveway connects to. */
  streetId: string;
  /** Point on the street centerline where vehicles stop. */
  curb: Vec2;
  style?: HouseStyle;
  name?: string;
}

const facingToStreetSide = (facing: Facing): number => (facing === 'north' || facing === 'west' ? -1 : 1);

function houseLot(id: string, cx: number, streetZ: number, facing: 'north' | 'south', streetId: string, style: HouseStyle): Lot {
  const depth = 36;
  const side = facingToStreetSide(facing); // north-facing houses sit south of the street (+z)
  const cz = streetZ - side * (LOT_SETBACK + depth / 2);
  return {
    id,
    kind: 'house',
    center: { x: cx, z: cz },
    width: 29,
    depth,
    facing,
    streetId,
    curb: { x: cx, z: streetZ },
    style,
  };
}

const STYLE_CYCLE: HouseStyle[] = ['ranch', 'two-story', 'spanish', 'modern', 'premium', 'ranch', 'spanish', 'two-story'];

function rowOfHouses(prefix: string, xs: number[], streetZ: number, facing: 'north' | 'south', streetId: string, styleOffset: number): Lot[] {
  return xs.map((x, i) => houseLot(`${prefix}-${i + 1}`, x, streetZ, facing, streetId, STYLE_CYCLE[(i + styleOffset) % STYLE_CYCLE.length]));
}

const WEST_BLOCK_XS = [-108, -79, -50, -21];
const EAST_BLOCK_XS = [22, 51, 80, 109];

export const HQ_LOT: Lot = {
  id: 'hq',
  kind: 'hq',
  name: 'EGO HVAC Headquarters',
  center: { x: 65, z: 50 },
  width: 116,
  depth: 86,
  facing: 'west',
  streetId: 'av-c',
  curb: { x: 0, z: 50 },
};

export const WAREHOUSE_LOT: Lot = {
  id: 'warehouse',
  kind: 'warehouse',
  name: 'Pro Supply Depot',
  center: { x: 65, z: -150 },
  width: 110,
  depth: 80,
  facing: 'south',
  streetId: 'st-n',
  curb: { x: 65, z: -100 },
};

export const COMPETITOR_LOT: Lot = {
  id: 'competitor-desert-chill',
  kind: 'competitor',
  name: 'Desert Chill Air',
  center: { x: -65, z: 150 },
  width: 110,
  depth: 80,
  facing: 'north',
  streetId: 'st-s',
  curb: { x: -65, z: 100 },
};

export const PARK_LOT: Lot = {
  id: 'park',
  kind: 'park',
  name: 'Mesa Vista Park',
  center: { x: 170, z: 50 },
  width: 60,
  depth: 86,
  facing: 'west',
  streetId: 'av-e',
  curb: { x: 130, z: 50 },
};

export const HOUSE_LOTS: Lot[] = [
  // Block A (NW): faces north street and center street
  ...rowOfHouses('a-n', WEST_BLOCK_XS, -100, 'north', 'st-n', 0),
  ...rowOfHouses('a-s', WEST_BLOCK_XS, 0, 'south', 'st-c', 3),
  // Block B (NE)
  ...rowOfHouses('b-n', EAST_BLOCK_XS, -100, 'north', 'st-n', 5),
  ...rowOfHouses('b-s', EAST_BLOCK_XS, 0, 'south', 'st-c', 1),
  // Block C (SW)
  ...rowOfHouses('c-n', WEST_BLOCK_XS, 0, 'north', 'st-c', 2),
  ...rowOfHouses('c-s', WEST_BLOCK_XS, 100, 'south', 'st-s', 6),
  // Outer north row (west half) faces south toward Desert Bloom Ave
  ...rowOfHouses('n-o', WEST_BLOCK_XS, -100, 'south', 'st-n', 4),
  // Outer south row (east half) faces north toward Red Rock Ln
  ...rowOfHouses('s-o', EAST_BLOCK_XS, 100, 'north', 'st-s', 7),
];

export const ALL_LOTS: Lot[] = [HQ_LOT, WAREHOUSE_LOT, COMPETITOR_LOT, PARK_LOT, ...HOUSE_LOTS];

export function lotById(id: string): Lot | undefined {
  return ALL_LOTS.find((l) => l.id === id);
}

/** Direction vector pointing from the street toward the lot interior. */
export function inwardDir(facing: Facing): Vec2 {
  switch (facing) {
    case 'north':
      return { x: 0, z: 1 };
    case 'south':
      return { x: 0, z: -1 };
    case 'west':
      return { x: 1, z: 0 };
    case 'east':
      return { x: -1, z: 0 };
  }
}

/** Half-width of each house style on its condenser side (local +x), used to place the unit against the wall. */
export const HOUSE_HALF_WIDTH: Record<HouseStyle, number> = { ranch: 8, 'two-story': 7, spanish: 8.5, modern: 8, premium: 9.5 };

/** Unit vector pointing from the house toward its condenser side (local +x in house space). */
export function condenserSideDir(lot: Lot): Vec2 {
  const sideSign = lot.facing === 'north' || lot.facing === 'west' ? 1 : -1;
  return lot.facing === 'north' || lot.facing === 'south' ? { x: sideSign, z: 0 } : { x: 0, z: sideSign };
}

/** Where the outdoor condenser unit sits: against the side wall, near the front of the house. */
export function condenserPosition(lot: Lot): Vec2 {
  const inward = inwardDir(lot.facing);
  const side = condenserSideDir(lot);
  const offset = HOUSE_HALF_WIDTH[lot.style ?? 'ranch'] + 0.9;
  return {
    x: lot.center.x + side.x * offset - inward.x * 3,
    z: lot.center.z + side.z * offset - inward.z * 3,
  };
}

/**
 * House-local frame → world: local +x runs toward the condenser side of the lot, local +z away
 * from the street (the front of the house faces -z). Matches condenserPosition (local (half + 0.9, -3)).
 */
export function lotLocalToWorld(lot: Lot, x: number, z: number): Vec2 {
  const side = condenserSideDir(lot);
  const inward = inwardDir(lot.facing);
  return { x: lot.center.x + side.x * x + inward.x * z, z: lot.center.z + side.z * x + inward.z * z };
}

/** World heading (atan2(dx, dz), as used by vehicles and workers) of a house-local direction. */
export function lotLocalHeading(lot: Lot, dx: number, dz: number): number {
  const side = condenserSideDir(lot);
  const inward = inwardDir(lot.facing);
  return Math.atan2(side.x * dx + inward.x * dz, side.z * dx + inward.z * dz);
}

/**
 * Where a crew member works on the unit. The lead technician kneels on the street side in front
 * of the service panel (the unit's street-facing front, see HouseBuilder), just past the unit's
 * centre line and away from the wall; extra crew stand beside the unit on the open side.
 */
export function workPosition(lot: Lot, crewIndex: number): Vec2 {
  const ux = HOUSE_HALF_WIDTH[lot.style ?? 'ranch'] + 0.9;
  const uz = -3;
  if (crewIndex === 0) return lotLocalToWorld(lot, ux + 0.14, uz - 1.02);
  return lotLocalToWorld(lot, ux + 1.25, uz - 1.4 - (crewIndex - 1) * 1.1);
}

/** Lane-side parking for a service vehicle at a house: in the curb lane, nose toward the condenser side. */
export function curbParking(lot: Lot): { x: number; z: number; heading: number } {
  const ux = HOUSE_HALF_WIDTH[lot.style ?? 'ranch'] + 0.9;
  const streetZ = -(LOT_SETBACK + lot.depth / 2);
  // Van centre 1.25 m off the curb face, its curb-side door about a metre short of the unit's line
  // so the nose stays clear of a corner crosswalk; the walk up the yard is then nearly straight.
  const p = lotLocalToWorld(lot, ux - 0.95, streetZ + ROAD_WIDTH / 2 - 1.25);
  return { ...p, heading: lotLocalHeading(lot, 1, 0) };
}

/** HQ parking stalls, in world coordinates. Expanded garage adds more. */
export function hqParkingStalls(count: number): { pos: Vec2; heading: number }[] {
  const stalls: { pos: Vec2; heading: number }[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    stalls.push({ pos: { x: 22 + row * 12, z: 22 + col * 8 }, heading: Math.PI }); // nose facing west toward the street
  }
  return stalls;
}

/** The HQ driveway apron where vehicles enter/leave the lot. */
export const HQ_APRON: Vec2 = { x: 12, z: 50 };
