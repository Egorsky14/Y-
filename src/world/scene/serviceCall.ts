import * as THREE from 'three';
import { condenserPosition, curbParking, HOUSE_HALF_WIDTH, HOUSE_LOTS, lotById, lotLocalToWorld, workPosition, type Lot } from '@/game/world/cityLayout';
import type { GameState } from '@/game/simulation/types';
import { collectHouseOccluders } from '../buildings/HouseBuilder';
import { cameraPosition, NO_SAFE_AREA, registeredOccluders, registerOccluders, solveClearView, tagOccluder, type SafeArea } from './cameraOcclusion';
import { composeView, type Composed, type ServiceMode, type Subject } from './cameraComposition';
import { obstaclesNear } from './cameraObstacles';

/**
 * Visual pacing of a service call's arrival. The simulation decides that the van has arrived, where
 * the crew works and when the job phases advance; this module only decides how that looks: the van
 * pulls into the curb lane, the technician steps out of the curb-side door, walks to the unit at a
 * walking pace and kneels at the service panel, and the tools appear where they are set down.
 */

/**
 * Camera framing for a customer's service site: from the street side, centred between the curb
 * spot where the van parks and the condenser (pulled a little toward the lot centre and aimed 3 m up),
 * close enough that the van, the technician and the unit read at once with the house behind them,
 * while the job pin above the lot centre stays on screen on desktop and on an upright phone
 * (src/tests/serviceSiteCamera.test.ts).
 */
export function serviceSiteCamera(lot: Lot): { type: 'focus'; target: { x: number; z: number }; distance: number; azimuth: number; elevation: number; targetY: number } {
  const curb = curbParking(lot);
  const unit = condenserPosition(lot);
  const c = lot.center;
  return { type: 'focus', target: { x: curb.x * 0.36 + unit.x * 0.44 + c.x * 0.2, z: curb.z * 0.36 + unit.z * 0.44 + c.z * 0.2 }, distance: 38, azimuth: Math.atan2(curb.x - unit.x, curb.z - unit.z) + 0.35, elevation: 0.66, targetY: 3 };
}

/** Lots whose houses can stand between a close camera and this lot's unit: the lot and its near neighbours. */
export function nearbyLotIds(lot: Lot, radius = 40): string[] {
  const unit = condenserPosition(lot);
  return HOUSE_LOTS.filter((l) => Math.hypot(l.center.x - unit.x, l.center.z - unit.z) < radius + Math.max(l.width, l.depth) / 2).map((l) => l.id);
}

/** Occluders (solid house, porch and wall parts) of the lot and its neighbours. */
export function siteOccluders(lot: Lot): THREE.Box3[] {
  return occludersOf(nearbyLotIds(lot));
}

/** Occluders of the given lots: registered while the neighbourhood was built, else collected once. */
export function occludersOf(lotIds: string[]): THREE.Box3[] {
  return lotIds.flatMap((id) => {
    const known = registeredOccluders(id);
    if (known) return known;
    const boxes = collectHouseOccluders(lotById(id)!);
    registerOccluders(id, boxes);
    return boxes;
  });
}

/**
 * What a close view of the lead technician at work must show: head and hands, the unit's top and
 * service panel, and the tool bag beside him (world space, metres).
 */
export function workSitePoints(lot: Lot): { x: number; y: number; z: number }[] {
  const tech = workPosition(lot, 0);
  const unit = condenserPosition(lot);
  const bag = bagWorldPosition(lot);
  const top = lot.style === 'premium' ? 1.1 : 0.96;
  // The service face looks at the technician; its centre is half a cabinet from the unit toward him.
  const dx = tech.x - unit.x;
  const dz = tech.z - unit.z;
  const d = Math.hypot(dx, dz) || 1;
  const half = (lot.style === 'premium' ? 1.08 : 0.92) / 2;
  return [
    { x: tech.x, y: 1.1, z: tech.z },
    { x: tech.x * 0.6 + unit.x * 0.4, y: 0.6, z: tech.z * 0.6 + unit.z * 0.4 },
    { x: unit.x, y: top, z: unit.z },
    { x: unit.x + (dx / d) * half, y: 0.45, z: unit.z + (dz / d) * half },
    { x: bag.x, y: 0.2, z: bag.z },
  ];
}

/** Height of the work (kneeling technician's hands, the unit's middle) the close-up centres on. */
const SUBJECT_Y = 0.55;

/** The close-up's preferred view before occlusion checks (see serviceCloseUpCamera), aimed at the work itself. */
export function closeUpPreferred(lot: Lot, aspect: number) {
  const tech = workPosition(lot, 0);
  const unit = condenserPosition(lot);
  // Lot-local +x is the condenser side (away from the house wall), -z the street: look in from the side.
  const ux = HOUSE_HALF_WIDTH[lot.style ?? 'ranch'] + 0.9;
  const a = lotLocalToWorld(lot, ux, -3);
  const b = lotLocalToWorld(lot, ux + 1, -3 + 0.25);
  return { target: { x: (tech.x + unit.x) / 2, y: SUBJECT_Y, z: (tech.z + unit.z) / 2 }, azimuth: Math.atan2(b.x - a.x, b.z - a.z), elevation: 0.42, distance: aspect < 1 ? 5.6 : 6.5 };
}

/**
 * Close view of the technician working at the unit (diagnosis and repair). The preferred framing
 * is a near-profile view from the unit's open side, in the lot's own frame (away from the house
 * wall), so the technician's hands on the panel, the meter and leads, the gauges and the bag all
 * read at once: 6.5 m away on landscape screens, 5.6 m on portrait phones (whose horizontal view
 * matches landscape's, see verticalFovFor), 24° up. A fixed turn from the curb heading (the old
 * close camera) points into the house on mirrored lots, which was the P1 defect. When the house, a
 * porch post or a garden wall would stand in the way, the nearest clear angle, height or distance
 * that keeps the technician, unit, panel and bag in frame is used instead (solveClearView).
 *
 * The look-at point stays on the ground (CameraRig keeps the orbit target at y 0), so the solver
 * checks exactly the pose the camera ends in.
 */
export function serviceCloseUpCamera(lot: Lot, aspect: number, boxes: THREE.Box3[] = siteOccluders(lot), safe: SafeArea = NO_SAFE_AREA) {
  const preferred = closeUpPreferred(lot, aspect);
  const points = workSitePoints(lot);
  const view = solveClearView(preferred, points, boxes, aspect, { safe });
  // The solver aims at the work (SUBJECT_Y up); CameraRig keeps its orbit target on the ground, so
  // hand it the point where that same sight line meets the ground: the work lands mid-frame instead
  // of in the upper third (most visible on tall phone screens).
  const cam = cameraPosition(view);
  const s = view.target;
  const t = cam.y / (cam.y - s.y);
  const ground = { x: cam.x + (s.x - cam.x) * t, z: cam.z + (s.z - cam.z) * t };
  const distance = Math.hypot(cam.x - ground.x, cam.y, cam.z - ground.z);
  return {
    type: 'focus' as const,
    target: ground,
    targetY: 0,
    distance,
    azimuth: view.azimuth,
    elevation: Math.asin(cam.y / distance),
    orbit: true,
    watch: { lotIds: nearbyLotIds(lot), points },
    clear: view.clear,
    preferredAzimuth: preferred.azimuth,
  };
}

/** What the technician is doing at the site, which decides what the close shots show. */
export type ServicePhase = 'arrival' | 'diagnosis' | 'repair';

export interface ServiceViewOptions {
  phase?: ServicePhase;
  /** The technician's current position when he is not (yet) at his work spot (walking from the van). */
  techPos?: { x: number; z: number };
  /** Kneeling at the unit (default) or standing (walking up to it). */
  standing?: boolean;
  /** Keep close to this heading (following the technician as he walks: no swings between updates). */
  keepAzimuth?: number;
}

/** Footprint and height of the house itself (body and roof, not the garden walls), from its registered parts. */
export function houseBounds(lot: Lot): THREE.Box3 {
  const box = new THREE.Box3();
  const reach = Math.max(lot.width, lot.depth) / 2;
  for (const b of occludersOf([lot.id])) {
    const c = b.getCenter(new THREE.Vector3());
    if (b.max.y > 2.6 && Math.hypot(c.x - lot.center.x, c.z - lot.center.z) < reach) box.union(b);
  }
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(lot.center.x, 2.5, lot.center.z), new THREE.Vector3(12, 5, 12));
  return box;
}

/**
 * What each service camera mode must show, in world space:
 *  - property: the house, the van at the curb, the unit and the technician (establishing shot);
 *  - work: the technician and the unit as one group (head to boots, the whole cabinet, the bag);
 *  - detail: the hands and the service panel, with the meter and leads during diagnosis, the tool
 *    on the cabinet during repair; the head stays in frame so the shot is never just a pair of hands.
 */
export function serviceSubject(lot: Lot, mode: ServiceMode, opts: ServiceViewOptions = {}): Subject {
  const tech = opts.techPos ?? workPosition(lot, 0);
  const unit = condenserPosition(lot);
  const dx = tech.x - unit.x;
  const dz = tech.z - unit.z;
  const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d;
  const uz = dz / d;
  // Across the cabinet (perpendicular to the technician's line of work).
  const px = -uz;
  const pz = ux;
  const premium = lot.style === 'premium';
  const half = (premium ? 1.08 : 0.92) / 2;
  const top = premium ? 1.1 : 0.96;
  const facing = Math.atan2(unit.x - tech.x, unit.z - tech.z);
  const head = opts.standing ? 1.75 : 1.12;
  const P = (x: number, y: number, z: number) => ({ x, y, z });
  const corner = (a: number, b: number, y: number) => P(unit.x + ux * half * a + px * half * b, y, unit.z + uz * half * a + pz * half * b);
  const hands = P(tech.x * 0.6 + unit.x * 0.4, 0.6, tech.z * 0.6 + unit.z * 0.4);
  const panel = P(unit.x + ux * half, 0.45, unit.z + uz * half);
  const preferred = closeUpPreferred(lot, 1).azimuth;
  if (mode === 'property') {
    const house = houseBounds(lot);
    const van = curbParking(lot);
    const vx = Math.sin(van.heading);
    const vz = Math.cos(van.heading);
    const frame = [
      ...[house.min.x, house.max.x].flatMap((x) => [house.min.z, house.max.z].flatMap((z) => [P(x, 0, z), P(x, house.max.y, z)])),
      P(van.x + vx * 2.8, 0, van.z + vz * 2.8),
      P(van.x - vx * 2.8, 2.5, van.z - vz * 2.8),
      P(unit.x, top, unit.z),
      P(tech.x, head, tech.z),
    ];
    const box = new THREE.Box3().setFromPoints(frame.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
    const c = box.getCenter(new THREE.Vector3());
    return {
      frame,
      key: [P(unit.x, top, unit.z), P(tech.x, head - 0.1, tech.z), P(van.x, 2.2, van.z)],
      focus: P(c.x, 1.6, c.z),
      preferredAzimuth: Math.atan2(van.x - house.getCenter(new THREE.Vector3()).x, van.z - house.getCenter(new THREE.Vector3()).z) + 0.35,
    };
  }
  const techFacing = { x: tech.x, z: tech.z, facing };
  const bag = bagWorldPosition(lot);
  if (mode === 'work' || opts.phase === 'arrival' || opts.standing) {
    const frame = [
      P(tech.x, head + 0.08, tech.z),
      P(tech.x - ux * 0.55, 0.02, tech.z - uz * 0.55),
      corner(1, 1, top), corner(1, -1, top), corner(-1, 1, top), corner(-1, -1, top),
      corner(1, 1, 0.02), corner(1, -1, 0.02), corner(-1, 1, 0.02), corner(-1, -1, 0.02),
      ...(opts.techPos ? [] : [P(bag.x, 0.25, bag.z)]),
    ];
    return { frame, key: [P(tech.x, head, tech.z), hands, P(unit.x, top, unit.z), panel], focus: P((tech.x + unit.x) / 2, 0.55, (tech.z + unit.z) / 2), tech: techFacing, preferredAzimuth: preferred };
  }
  if (opts.phase === 'repair') {
    // The tool works on the cabinet near the technician: frame head, hands, the near top edge and the panel.
    const topEdge = P(unit.x + ux * half * 0.6, top, unit.z + uz * half * 0.6);
    const frame = [P(tech.x, head + 0.06, tech.z), hands, topEdge, corner(1, 1, top), corner(1, -1, top), panel, corner(1, 1, 0.1), corner(1, -1, 0.1)];
    return { frame, key: [hands, panel, topEdge], focus: P(hands.x * 0.5 + topEdge.x * 0.5, 0.7, hands.z * 0.5 + topEdge.z * 0.5), tech: techFacing, preferredAzimuth: preferred };
  }
  // Diagnosis: meter in hand, leads and gauge hoses down to the service valves at the panel.
  const valves = P(unit.x + ux * half + px * half * 0.6, 0.3, unit.z + uz * half + pz * half * 0.6);
  const frame = [P(tech.x, head + 0.06, tech.z), hands, panel, valves, corner(1, 1, top), corner(1, -1, top), corner(1, 1, 0.1), corner(1, -1, 0.1)];
  return { frame, key: [hands, panel, valves], focus: P(hands.x * 0.55 + panel.x * 0.45, 0.66, hands.z * 0.55 + panel.z * 0.45), tech: techFacing, preferredAzimuth: preferred };
}

/** Obstacles a service camera checks at a lot: the lot's and its neighbours' house parts, plus plants and poles nearby. */
export function serviceObstacles(lot: Lot, mode: ServiceMode, focus: { x: number; z: number }): THREE.Box3[] {
  const radius = mode === 'property' ? 48 : 20;
  const houses = siteOccluders(lot).filter((b) => {
    const dx = Math.max(b.min.x - focus.x, 0, focus.x - b.max.x);
    const dz = Math.max(b.min.z - focus.z, 0, focus.z - b.max.z);
    return dx * dx + dz * dz <= radius * radius;
  });
  const out = [...houses, ...obstaclesNear(focus.x, focus.z, radius)];
  if (mode !== 'property') {
    // The cabinet itself, a touch inside its faces so points on the service panel stay outside it.
    const unit = condenserPosition(lot);
    const half = (lot.style === 'premium' ? 1.08 : 0.92) / 2 - 0.03;
    out.push(tagOccluder(new THREE.Box3(new THREE.Vector3(unit.x - half, 0, unit.z - half), new THREE.Vector3(unit.x + half, (lot.style === 'premium' ? 1.1 : 0.96) - 0.03, unit.z + half)), 'subject'));
  }
  return out;
}

/** A composed view as a camera command (ground orbit target on the same sight line as the aim point). */
function toCommand(view: Composed, lot: Lot, subject: Subject) {
  const cam = cameraPosition(view);
  const s = view.target;
  const t = cam.y / Math.max(1e-3, cam.y - s.y);
  const ground = { x: cam.x + (s.x - cam.x) * t, z: cam.z + (s.z - cam.z) * t };
  const distance = Math.hypot(cam.x - ground.x, cam.y, cam.z - ground.z);
  return {
    type: 'focus' as const,
    target: ground,
    targetY: 0,
    distance,
    azimuth: view.azimuth,
    elevation: Math.asin(cam.y / distance),
    orbit: true,
    service: true,
    watch: { lotIds: nearbyLotIds(lot), points: subject.key },
  };
}

/**
 * The camera for a service mode at a lot: the best-composed view (cameraComposition.ts) for this
 * screen shape and free area. Detail falls back to Watch Work when no close-up shows the hands,
 * tools and panel; Watch Work falls back to the occlusion solver's clear view.
 */
export function serviceViewCamera(lot: Lot, mode: ServiceMode, aspect: number, safe: SafeArea = NO_SAFE_AREA, opts: ServiceViewOptions = {}) {
  const t0 = performance.now();
  const tryMode = (m: ServiceMode) => {
    const subject = serviceSubject(lot, m, opts);
    if (opts.keepAzimuth !== undefined) {
      subject.preferredAzimuth = opts.keepAzimuth;
      subject.preferWeight = 3;
    }
    const view = composeView(subject, serviceObstacles(lot, m, subject.focus), aspect, m, safe);
    return view ? { command: toCommand(view, lot, subject), report: view.report } : null;
  };
  // Walking up to the unit there is no close work to show yet: Detail waits as Watch Work.
  const asked = mode === 'detail' && (opts.phase === 'arrival' || opts.standing) ? 'work' : mode;
  const shot = tryMode(asked) ?? (asked === 'detail' ? tryMode('work') : null);
  if (shot) return { ...shot, mode: shot.report.mode, ms: performance.now() - t0 };
  if (mode === 'property') return { command: { ...serviceSiteCamera(lot), service: true }, report: null, mode, ms: performance.now() - t0 };
  return { command: { ...serviceCloseUpCamera(lot, aspect, undefined, safe), service: true }, report: null, mode: 'work' as ServiceMode, ms: performance.now() - t0 };
}

/**
 * Where the lead technician sets the tool bag down, in his own frame (+z toward the unit): beside the
 * hip on the free-hand side, clear of the kneeling leg, within reach when he turns to it.
 */
export const BAG_LOCAL = { x: -0.58, z: -0.1 };

/** World position of the tool bag for a lot (the lead technician's work spot, facing the unit). */
export function bagWorldPosition(lot: Lot): { x: number; z: number } {
  const w = workPosition(lot, 0);
  const c = condenserPosition(lot);
  const yaw = Math.atan2(c.x - w.x, c.z - w.z);
  return { x: w.x + BAG_LOCAL.x * Math.cos(yaw) + BAG_LOCAL.z * Math.sin(yaw), z: w.z - BAG_LOCAL.x * Math.sin(yaw) + BAG_LOCAL.z * Math.cos(yaw) };
}

/** Walking speed at 1× game speed (m/s); the walk cycle in Worker covers ~1.5 m per second. */
export const WALK_SPEED = 1.5;
/** Seconds (at 1×) for the van to pull from the route's end into the curb lane. */
export const PARK_SECONDS = 1.6;
/** Seconds after the van settles before the door opens. */
export const EXIT_DELAY = 0.5;
/** Seconds to step out of the door. */
export const EXIT_SECONDS = 0.6;
/** Seconds after the technician kneels before the gauges are hooked up. */
export const GAUGES_DELAY = 1.2;

/** Real-time multiplier for the choreography: follows game speed, capped so 5× reads as a brisk fast-forward. */
export function visualPace(speed: number): number {
  return speed <= 0 ? 0 : Math.min(speed, 3);
}

/** Where each vehicle is drawn while it is parked at a job, published by the vehicle view. */
export const vanVisuals = new Map<string, { x: number; z: number; heading: number; settled: boolean }>();

/** Per job: which crew members have reached their spot, and the scene time the lead arrived. */
export const siteVisuals = new Map<string, { arrived: Set<string>; leadArrivedAt: number | null }>();

export function siteFor(jobId: string) {
  let s = siteVisuals.get(jobId);
  if (!s) siteVisuals.set(jobId, (s = { arrived: new Set(), leadArrivedAt: null }));
  return s;
}

/** The job lot and parking pose for a vehicle that is on site, or null. */
export function siteParking(state: GameState, vehicleId: string): { lot: Lot; pose: { x: number; z: number; heading: number } } | null {
  const v = state.vehicles[vehicleId];
  const job = v?.jobId ? state.jobs[v.jobId] : undefined;
  const lot = job ? lotById(state.customers[job.customerId]?.lotId) : undefined;
  if (!v || v.status !== 'onsite' || !lot || lot.kind !== 'house') return null;
  return { lot, pose: curbParking(lot) };
}

/** The curb-side sliding door (passenger side, a little behind centre) of a van parked at `pose`. */
export function curbDoor(pose: { x: number; z: number; heading: number }, out = 0): { x: number; z: number } {
  const dx = Math.sin(pose.heading);
  const dz = Math.cos(pose.heading);
  // Right side of the direction of travel: (-dz, dx).
  const reach = 1.05 + out;
  return { x: pose.x - dz * reach - dx * 0.35, z: pose.z + dx * reach - dz * 0.35 };
}

/**
 * Walking route from the step-out point beside the door to a crew member's work spot. The van parks
 * with its door in line with the unit, so the route runs straight up the condenser side of the front
 * yard, which the yard plan keeps clear of planting.
 */
export function approachPath(lot: Lot, stepOut: { x: number; z: number }, crewIndex: number): { x: number; z: number }[] {
  return [stepOut, workPosition(lot, crewIndex)];
}

export function pathLength(path: { x: number; z: number }[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return d;
}

/** Point and direction at distance `s` along a polyline. */
export function samplePath(path: { x: number; z: number }[], s: number): { x: number; z: number; heading: number } {
  let left = Math.max(0, s);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= len || i === path.length - 1) {
      const t = len > 0 ? Math.min(1, left / len) : 1;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    left -= len;
  }
  const last = path[path.length - 1];
  return { x: last.x, z: last.z, heading: 0 };
}

/** Smoothstep ease. */
export const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
