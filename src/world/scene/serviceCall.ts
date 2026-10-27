import { condenserPosition, curbParking, lotById, workPosition, type Lot } from '@/game/world/cityLayout';
import type { GameState } from '@/game/simulation/types';

/**
 * Visual pacing of a service call's arrival. The simulation decides that the van has arrived, where
 * the crew works and when the job phases advance; this module only decides how that looks: the van
 * pulls into the curb lane, the technician steps out of the curb-side door, walks to the unit at a
 * walking pace and kneels at the service panel, and the tools appear where they are set down.
 */

/**
 * Camera framing for a customer's service site: from the street side, centred between the curb
 * spot where the van parks and the condenser, close enough that the van, the technician and the
 * unit read at once with the house behind them.
 */
export function serviceSiteCamera(lot: Lot): { type: 'focus'; target: { x: number; z: number }; distance: number; azimuth: number; elevation: number; targetY: number } {
  const curb = curbParking(lot);
  const unit = condenserPosition(lot);
  return { type: 'focus', target: { x: curb.x * 0.45 + unit.x * 0.55, z: curb.z * 0.45 + unit.z * 0.55 }, distance: 34, azimuth: Math.atan2(curb.x - unit.x, curb.z - unit.z) + 0.55, elevation: 0.66, targetY: 0.6 };
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
