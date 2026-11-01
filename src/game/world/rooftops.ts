import type { Customer, GameState, Job, Vehicle } from '../simulation/types';
import { COMMERCIAL_LOTS, LOT_SETBACK, ROAD_WIDTH, lotById, lotLocalHeading, lotLocalToWorld, type Lot } from './cityLayout';
import type { Vec2 } from './geometry';

/**
 * Rooftop HVAC: which buildings carry equipment on their roof, where it stands, how a technician is
 * allowed to get up there, and whether a given job can be reached.
 *
 * Everything here is explicit, game-certified data (no roof is assumed reachable because it exists):
 *  - a roof deck with its parapet (or slab edge) height;
 *  - access points: where a portable extension ladder stands on the ground, the wall edge it rests on,
 *    and the spot on the roof a technician steps off onto;
 *  - rooftop units: position on the deck, cabinet size, the service side and the work spot in front of it;
 *  - the van's service pose (parked near the access point, its ladder rack within a few steps).
 *
 * A customer's equipment is on the roof when their system is a packaged unit and their building has a
 * roof unit spot (commercial strip, modern flat-roofed homes); split systems keep their ground
 * condenser. Whether a job can be done is decided by roofAccess: an access point that a 24 ft
 * extension ladder reaches at the 4:1 angle, and a vehicle that carries that ladder (the ladder-rack
 * upgrade). Anything else is blocked with a reason: never a technician on a roof without a way up.
 */

/** The portable ladder a ladder-rack vehicle carries: a 24 ft two-section aluminium extension ladder. */
export const ROOF_LADDER = {
  name: '24 ft extension ladder',
  /** Closed (both sections nested) and fully extended working length, m. */
  closed: 3.8,
  maxLength: 6.5,
  /** Rung spacing, m; rung 0 is this far above the feet. */
  rungStep: 0.305,
  firstRung: 0.3,
  /** Rails above the roof edge (the ladder extends about 3 ft past the landing). */
  above: 0.9,
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RoofAccessPoint {
  id: string;
  /** Ladder feet on the ground. */
  foot: Vec2;
  /** Where the rails rest on the roof edge (top of the parapet or slab edge). */
  rest: Vec3;
  /** Unit vector from the wall out toward the ladder foot. */
  out: Vec2;
  /** Where a technician stands on the roof after stepping off the ladder. */
  landing: Vec2;
}

export interface RooftopUnit {
  id: string;
  kind: 'rtu' | 'rtu-res';
  /** Centre of the cabinet footprint on the deck. */
  center: Vec2;
  /** Cabinet size: along its length, across, and height above the deck including curb or rails. */
  size: { length: number; width: number; height: number };
  /** World heading (atan2(dx, dz)) of the cabinet's length axis. */
  yaw: number;
  /** Unit vector from the cabinet out of its service side. */
  serviceDir: Vec2;
  /** Where the technician stands (kneels) at the service panel. */
  workSpot: Vec2;
}

export interface RoofSpec {
  lotId: string;
  /** Roof deck height (m) and the top of the parapet or slab edge. */
  deckY: number;
  edgeY: number;
  /** Walkable deck (inside the parapets), world-axis aligned. */
  deck: { x0: number; x1: number; z0: number; z1: number };
  access: RoofAccessPoint[];
  units: RooftopUnit[];
  /** The unit that serves this customer (the others belong to other tenants or zones). */
  servicedUnitId: string | null;
  /** Where the service vehicle parks for a roof job, and the waypoints it walks to the ladder foot. */
  van: { x: number; z: number; heading: number };
  /** Walking path (ground) from the van's ladder rack to the ladder foot, excluding both ends. */
  approach: Vec2[];
  /**
   * Game minutes for the access phase (ladder off the rack, carried, footed, raised and climbed, to the unit) and the
   * pack-up (back down, ladder stowed): bounded per site, sized to the walk and climb this site needs.
   */
  accessMinutes: number;
  packUpMinutes: number;
}

/** The 4:1 rule: the ladder foot stands a quarter of the rest height out from the wall. */
export function ladderLength(a: RoofAccessPoint): number {
  return Math.hypot(a.rest.x - a.foot.x, a.rest.y, a.rest.z - a.foot.z) + ROOF_LADDER.above;
}

function unitAt(id: string, kind: RooftopUnit['kind'], c: Vec2, size: RooftopUnit['size'], yaw: number, serviceDir: Vec2, gap: number): RooftopUnit {
  // The service side faces serviceDir; the technician works `gap` metres out from that face.
  const across = Math.abs(Math.sin(yaw) * serviceDir.x + Math.cos(yaw) * serviceDir.z) > 0.5 ? size.length / 2 : size.width / 2;
  return { id, kind, center: c, size, yaw, serviceDir, workSpot: { x: c.x + serviceDir.x * (across + gap), z: c.z + serviceDir.z * (across + gap) } };
}

/** Mesquite Plaza: 16 × 40 m single-storey retail strip, roof deck 4.0 m, parapet 4.6 m. */
const PLAZA = { x0: 162, x1: 178, z0: -70, z1: -30, deckY: 4.0, edgeY: 4.6, parapet: 0.25 };
/** Desert Ridge Offices: 26 × 40 m two-storey office, roof deck 8.0 m, parapet 8.6 m. No permanent roof access. */
export const OFFICE = { x0: 160, x1: 186, z0: -170, z1: -130, deckY: 8.0, edgeY: 8.6, parapet: 0.25 };
export const PLAZA_BUILDING = PLAZA;

function plazaSpec(): RoofSpec {
  const p = PLAZA;
  const accessX = 171;
  const rtu = (id: string, x: number, z: number) => unitAt(id, 'rtu', { x, z }, { length: 2.4, width: 1.45, height: 1.6 }, Math.PI / 2, { x: 0, z: -1 }, 0.62);
  return {
    lotId: 'cm-plaza',
    deckY: p.deckY,
    edgeY: p.edgeY,
    deck: { x0: p.x0 + p.parapet, x1: p.x1 - p.parapet, z0: p.z0 + p.parapet, z1: p.z1 - p.parapet },
    access: [{ id: 'north-ladder', foot: { x: accessX, z: p.z0 - p.edgeY / 4 }, rest: { x: accessX, y: p.edgeY, z: p.z0 }, out: { x: 0, z: -1 }, landing: { x: accessX, z: p.z0 + 0.8 } }],
    units: [rtu('rtu-1', 171.4, -62.5), rtu('rtu-2', 168.5, -49), rtu('rtu-3', 172.5, -37.5)],
    servicedUnitId: 'rtu-1',
    // Side drive north of the building, nose east; the rack's rear roller is at the van's back (west).
    van: { x: 167.5, z: -76.2, heading: Math.PI / 2 },
    // Round the van's back corner, clear of its body, to the ladder foot.
    approach: [{ x: 164.0, z: -74.4 }],
    accessMinutes: 40,
    packUpMinutes: 40,
  };
}

/**
 * Modern flat-roofed home (HouseBuilder 'modern'): the single-storey wing's slab (top 3.675 m) is clear
 * behind the upper volume, house-local x -8..1, z 1.5..5.5. The package unit stands there on rails, its
 * service side to the west; the ladder leans on the west wall's slab edge beside it.
 */
function modernSpec(lot: Lot): RoofSpec {
  const W = (x: number, z: number) => lotLocalToWorld(lot, x, z);
  const edgeY = 3.675;
  const unitC = W(-4, 3.6);
  const west = lotLocalToWorld(lot, -1, 0);
  const o = lotLocalToWorld(lot, 0, 0);
  const out = { x: west.x - o.x, z: west.z - o.z };
  const unit = unitAt('rtu-res', 'rtu-res', unitC, { length: 1.3, width: 0.95, height: 1.05 }, lotLocalHeading(lot, 1, 0), out, 0.62);
  const restP = W(-8.2, 3.6);
  const footP = W(-8.2 - edgeY / 4, 3.6);
  const corners = [W(-8, 1.5), W(1, 1.5), W(1, 5.5), W(-8, 5.5)];
  const streetZ = -(LOT_SETBACK + lot.depth / 2);
  const van = lotLocalToWorld(lot, -10.6, streetZ + ROAD_WIDTH / 2 - 1.25);
  return {
    lotId: lot.id,
    deckY: edgeY,
    edgeY,
    deck: { x0: Math.min(...corners.map((c) => c.x)), x1: Math.max(...corners.map((c) => c.x)), z0: Math.min(...corners.map((c) => c.z)), z1: Math.max(...corners.map((c) => c.z)) },
    access: [{ id: 'west-ladder', foot: footP, rest: { x: restP.x, y: edgeY, z: restP.z }, out, landing: W(-7.5, 3.6) }],
    units: [unit],
    servicedUnitId: 'rtu-res',
    van: { ...van, heading: lotLocalHeading(lot, 1, 0) },
    // Up the west side yard, clear of the garage corner and the driveway.
    approach: [W(-10.2, -16.5), W(-9.9, -7.2), W(-9.8, 1.2)],
    accessMinutes: 56,
    packUpMinutes: 56,
  };
}

function officeSpec(): RoofSpec {
  const o = OFFICE;
  const rtu = (id: string, x: number, z: number) => unitAt(id, 'rtu', { x, z }, { length: 2.8, width: 1.6, height: 1.7 }, Math.PI / 2, { x: 0, z: -1 }, 0.62);
  return {
    lotId: 'cm-office',
    deckY: o.deckY,
    edgeY: o.edgeY,
    deck: { x0: o.x0 + o.parapet, x1: o.x1 - o.parapet, z0: o.z0 + o.parapet, z1: o.z1 - o.parapet },
    // No certified access: the roof is beyond a portable ladder and the building has no roof hatch or fixed ladder.
    access: [],
    units: [rtu('rtu-a', 168, -155), rtu('rtu-b', 177, -144)],
    servicedUnitId: 'rtu-a',
    van: { x: 150, z: -150, heading: Math.PI / 2 },
    approach: [],
    accessMinutes: 40,
    packUpMinutes: 40,
  };
}

const cache = new Map<string, RoofSpec | null>();

/** The roof of a lot, when it carries (or can carry) rooftop HVAC equipment. */
export function roofSpec(lotId: string): RoofSpec | null {
  if (cache.has(lotId)) return cache.get(lotId)!;
  const lot = lotById(lotId);
  let spec: RoofSpec | null = null;
  if (lotId === 'cm-plaza') spec = plazaSpec();
  else if (lotId === 'cm-office') spec = officeSpec();
  else if (lot?.kind === 'house' && lot.style === 'modern') spec = modernSpec(lot);
  cache.set(lotId, spec);
  return spec;
}

export function servicedUnit(spec: RoofSpec): RooftopUnit | null {
  return spec.units.find((u) => u.id === spec.servicedUnitId) ?? null;
}

/** Where a customer's outdoor equipment is: on the roof (a packaged unit on a building with a roof unit spot) or on the ground. */
export function equipmentPlacement(customer: Pick<Customer, 'lotId' | 'equipment'>): 'roof' | 'ground' {
  return customer.equipment.type === 'package-unit' && roofSpec(customer.lotId)?.servicedUnitId ? 'roof' : 'ground';
}

/** True when the job's equipment is on a roof. */
export function isRoofJob(state: GameState, job: Job): boolean {
  const c = state.customers[job.customerId];
  return !!c && equipmentPlacement(c) === 'roof';
}

/** A vehicle carries the portable extension ladder when it has the ladder rack fitted. */
export function vehicleHasLadder(v: Vehicle | undefined): boolean {
  return !!v && v.upgrades.includes('ladder-rack');
}

export type RoofAccessOutcome =
  | { ok: true; method: 'approved-ladder'; accessId: string }
  | { ok: false; reason: 'no-equipment' | 'unsupported-roof' | 'missing-ladder'; message: string };

/**
 * Whether a technician can reach this job's rooftop unit: the building must have a certified access
 * point a 24 ft extension ladder reaches (4:1 angle, 3 ft past the edge), and the vehicle (when given)
 * must carry that ladder.
 */
export function roofAccess(state: GameState, job: Job, vehicle?: Vehicle): RoofAccessOutcome {
  const customer = state.customers[job.customerId];
  const spec = customer ? roofSpec(customer.lotId) : null;
  if (!customer || !spec || equipmentPlacement(customer) !== 'roof') return { ok: false, reason: 'no-equipment', message: 'This job has no rooftop equipment.' };
  const access = spec.access.find((a) => ladderLength(a) <= ROOF_LADDER.maxLength);
  if (!access) {
    return {
      ok: false,
      reason: 'unsupported-roof',
      message: `Roof access unavailable: the roof edge is ${spec.edgeY.toFixed(1)} m up, beyond a ${ROOF_LADDER.name}, and the building has no roof hatch or fixed ladder. A lift contractor would be needed.`,
    };
  }
  if (vehicle && !vehicleHasLadder(vehicle)) {
    return { ok: false, reason: 'missing-ladder', message: `${vehicle.nickname} has no ladder rack. Rooftop units need a vehicle carrying the ${ROOF_LADDER.name}.` };
  }
  return { ok: true, method: 'approved-ladder', accessId: access.id };
}

/** The access point a job uses (the first one the ladder reaches). */
export function accessFor(spec: RoofSpec): RoofAccessPoint | null {
  return spec.access.find((a) => ladderLength(a) <= ROOF_LADDER.maxLength) ?? null;
}

export const ROOF_COMMERCIAL_LOT_IDS = COMMERCIAL_LOTS.map((l) => l.id);
