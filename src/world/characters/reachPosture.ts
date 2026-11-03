import { RIG_BONES, RIG_MEASURES } from './rigData.generated';

/**
 * How a standing body gets its hands to something: squatting for what is low, leaning for what is far. Pure, so the
 * choreography's tests measure reach with the same posture the character really takes. The solver then places the hands
 * exactly; this only decides where the shoulders are when it does. All in the rig's frame (metres, +z forward).
 */

interface Point {
  x: number;
  y: number;
  z: number;
}

const add = (a: readonly number[], b: readonly number[]) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** The right shoulder relative to the pelvis, standing straight (the left mirrors it). */
const SHOULDER = add(add(add(RIG_BONES.spine.at, RIG_BONES.torso.at), RIG_BONES.clavR.at), RIG_BONES.armR.at);
/** Shoulder to palm with the arm straight. */
export const ARM_REACH = RIG_MEASURES.upperArm + RIG_MEASURES.foreArm + RIG_MEASURES.handToPalm;
/** Hands below this height start a squat; at SQUAT_FULL lower they are at the deepest one. */
const SQUAT_FROM = 0.95;
const SQUAT_FULL = 0.75;
const SQUAT_DROP = 0.58;
const SQUAT_BACK = 0.2;
const SQUAT_BEND = 0.98;
const LEAN_STEP = 0.1;
const LEAN_MAX = 0.75;

export interface Posture {
  pelvisY: number;
  pelvisZ: number;
  /** Forward bend of the back (radians). */
  pitch: number;
  /** How far the worse hand stays out of reach (m); 0 in reach. */
  short: number;
}

function shortfall(hand: Point | undefined, side: 1 | -1, pelvisY: number, pelvisZ: number, pitch: number) {
  if (!hand) return 0;
  const c = Math.cos(pitch);
  const n = Math.sin(pitch);
  const sy = pelvisY + SHOULDER[1] * c - SHOULDER[2] * n;
  const sz = pelvisZ + SHOULDER[1] * n + SHOULDER[2] * c;
  return Math.max(0, Math.hypot(hand.x - side * Math.abs(SHOULDER[0]), hand.y - sy, hand.z - sz) - ARM_REACH);
}

/**
 * The posture for these hand targets from a body standing at `pelvisY`, `pelvisZ` with the back at `pitch`: a squat for low
 * hands, then the smallest forward lean that brings both within reach.
 */
export function reachPosture(handL: Point | undefined, handR: Point | undefined, pelvisY: number, pelvisZ: number, pitch: number, leanMax = LEAN_MAX): Posture {
  const lowest = Math.min(handL?.y ?? 2, handR?.y ?? 2);
  const low = Math.min(1, Math.max(0, (SQUAT_FROM - lowest) / SQUAT_FULL));
  const y = pelvisY - low * SQUAT_DROP;
  const z = pelvisZ - low * SQUAT_BACK;
  const start = pitch + (SQUAT_BEND - pitch) * low;
  const off = (p: number) => Math.max(shortfall(handL, -1, y, z, p), shortfall(handR, 1, y, z, p));
  let best = start;
  let bestShort = off(start);
  for (let p = start + LEAN_STEP; bestShort > 0 && p <= leanMax + 1e-6; p += LEAN_STEP) {
    const s = off(p);
    if (s < bestShort) {
      bestShort = s;
      best = p;
    }
  }
  return { pelvisY: y, pelvisZ: z, pitch: best, short: bestShort };
}
