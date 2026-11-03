import * as THREE from 'three';
import type { CameraCommand, ServiceCameraMode } from '@/app/store';
import { roofStageGroup } from './rooftopCamera';

/**
 * The player's zoom on the service camera. The director still chooses every shot and when to take it; this is how much
 * closer or farther than that shot the player has asked to be, and it is applied to each one. It ends when the player
 * resets it, picks another mode or leaves the service camera, not when the job moves on.
 *
 * A zoom scales the view about the technician (a homothety: camera and aim point both move toward him by the same share),
 * so he stays where he is on screen, on the ground, up a ladder or on a roof alike, and zooming out exactly undoes
 * zooming in. Dollying toward the orbit target instead would head for a ground point, often inside the building.
 */

declare global {
  interface Window {
    /** Test hook: the player's zoom on the service camera. */
    __egoServiceZoom?: typeof serviceZoom;
  }
}

export const serviceZoom = {
  /** Distance as a share of what the director's shot would use: under 1 closer, over 1 farther. */
  factor: 1,
  /** Zoom asked for and not yet applied (log of the ratio): it eases in over a few frames. */
  pendingLog: 0,
};

/** Below this the view is tight enough that the director's stepped follow moves would lose him: it slides with him instead. */
export const ZOOMED_IN = 0.8;

/** Asks for the view to go this many times as far away (0.5: twice as close). Works in free play too. */
export function requestZoom(ratio: number) {
  serviceZoom.pendingLog = THREE.MathUtils.clamp(serviceZoom.pendingLog + Math.log(ratio), -2, 2);
}

export function resetServiceZoom() {
  serviceZoom.factor = 1;
  serviceZoom.pendingLog = 0;
}

/** Ratio for one wheel event. Trackpads send many small events and mice few large ones, so it goes by how far they scrolled. */
export function wheelRatio(e: { deltaY: number; deltaMode: number; ctrlKey: boolean }): number {
  const pixels = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  // A pinch on a trackpad reaches the browser as a wheel with ctrl held, in much smaller steps.
  const k = e.ctrlKey ? 0.009 : 0.0011;
  return Math.exp(THREE.MathUtils.clamp(pixels * k, -0.5, 0.5));
}

/** How close and far the camera may be from the technician. */
export function zoomLimits(mode: ServiceCameraMode, stage: string | null | undefined): { min: number; max: number } {
  const group = roofStageGroup(stage ?? undefined);
  const working = stage === 'work' || stage === 'roof:work';
  // Up the ladder the rails must stay in shot; on the move there is a margin for him to walk in; at the unit, close enough to see his hands and face.
  const min = group === 'ladder' ? 2.2 : working ? 1 : 1.5;
  return { min, max: mode === 'property' ? 160 : 90 };
}

/** What a zoom scales about: his body, lower while he kneels at the unit, so face and hands stay in a close view. */
export function zoomSubject(pos: { x: number; y: number; z: number }, stage: string | null | undefined, out = new THREE.Vector3()): THREE.Vector3 {
  const working = stage === 'work' || stage === 'roof:work';
  return out.set(pos.x, pos.y + (working ? 0.85 : 1.3), pos.z);
}

/** A view (camera and aim point) scaled about a point by the player's zoom, within limits of distance from that point. Returns the share actually used. */
export function scaleView(pos: THREE.Vector3, target: THREE.Vector3, subject: THREE.Vector3, factor: number, limits: { min: number; max: number }): number {
  const from = pos.distanceTo(subject);
  if (from < 1e-3) return 1;
  // Never pushes a view already outside the limits further out of them, and a factor of 1 leaves the director's shot alone.
  const lo = Math.min(limits.min, from);
  const hi = Math.max(limits.max, from);
  const k = THREE.MathUtils.clamp(from * factor, factor < 1 ? lo : from, factor > 1 ? hi : from) / from;
  pos.sub(subject).multiplyScalar(k).add(subject);
  target.sub(subject).multiplyScalar(k).add(subject);
  return k;
}

/** The director's shot with the player's zoom on it. */
export function zoomedCommand<C extends Omit<CameraCommand, 'id'>>(command: C, subject: THREE.Vector3, factor: number, limits: { min: number; max: number }): C {
  if (Math.abs(factor - 1) < 1e-3 || !command.target || command.azimuth === undefined || command.distance === undefined) return command;
  const el = command.elevation ?? 0.62;
  const target = new THREE.Vector3(command.target.x, command.targetY ?? 0, command.target.z);
  const pos = target.clone().add(new THREE.Vector3(Math.sin(command.azimuth) * Math.cos(el), Math.sin(el), Math.cos(command.azimuth) * Math.cos(el)).multiplyScalar(command.distance));
  const k = scaleView(pos, target, subject, factor, limits);
  return { ...command, target: { x: target.x, z: target.z }, targetY: target.y, distance: command.distance * k };
}
