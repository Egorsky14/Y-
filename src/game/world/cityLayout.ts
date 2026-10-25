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
  name: 'Mojave HVAC Supply',
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

/** Where the outdoor condenser unit sits (side yard near the front). */
export function condenserPosition(lot: Lot): Vec2 {
  const inward = inwardDir(lot.facing);
  // Place the unit at the front corner of the house, offset to the right side when facing the street.
  const sideSign = lot.facing === 'north' || lot.facing === 'west' ? 1 : -1;
  const lateral = lot.facing === 'north' || lot.facing === 'south' ? { x: sideSign * 9.5, z: 0 } : { x: 0, z: sideSign * 9.5 };
  return {
    x: lot.center.x + lateral.x - inward.x * 4,
    z: lot.center.z + lateral.z - inward.z * 4,
  };
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
