import { RIG_MEASURES } from './rigData.generated';

/**
 * Walking as foot placement, not as swinging joint angles. Time is measured in distance walked: the cycle's phase
 * advances with the ground the character really covers, and a stance foot moves backward in the character's frame at
 * exactly that speed, so a planted foot cannot slide at any game speed, and stopping leaves the feet where they are.
 *
 * A cycle runs phase 0..1 per leg. Stance is 0..STANCE: heel strike (toe up), flat, heel rising, toe-off on the ball of
 * the foot. Swing is the rest: lift, carry through, reach forward.
 */

export const STANCE = 0.62;
const ANKLE = RIG_MEASURES.ankleHeight;
/** Heel to ankle and ankle to ball, along the sole (for the heel and toe pivots). */
const HEEL_BACK = 0.055;
const BALL = RIG_MEASURES.ballZ - 0.019;

/** Stride length (one full cycle) for a walking speed: longer strides as he goes faster, as people do. */
export function strideLength(speed: number): number {
  return Math.min(1.34, 0.72 + 0.44 * speed);
}

export interface FootPlacement {
  /** Ankle height above the ground, and forward of the foot's stance line (rig metres). */
  y: number;
  z: number;
  /** Sole pitch: positive toe up. */
  pitch: number;
  /** Bend at the ball of the foot, radians. */
  toe: number;
  /** 1 while bearing weight. */
  planted: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * One foot's placement at a phase. `reach` scales how much of the stride is ahead of the hips: a stride reaches a little
 * further behind than ahead because the heel rises to make up the leg length.
 */
export function footAt(phase: number, stride: number): FootPlacement {
  const p = ((phase % 1) + 1) % 1;
  const front = stride * 0.46 * STANCE * 2 * 0.5;
  const back = stride * STANCE - front;
  if (p < STANCE) {
    const u = p / STANCE;
    // Linear in phase: this is what makes the planted foot stay put on the ground.
    const z = front - stride * p;
    // Heel strike: rocking down onto a flat foot about the heel.
    const strike = (1 - smooth(0, 0.2, u)) * 0.34;
    // Heel off, pivoting about the ball, in the last third of stance.
    const off = smooth(0.58, 1, u) * 0.72;
    const pitch = strike - off;
    // Keeping the pivot point on the ground lifts the ankle.
    const y = ANKLE + (strike > 0 ? Math.sin(strike) * HEEL_BACK : 0) + (off > 0 ? Math.sin(off) * BALL - (1 - Math.cos(off)) * ANKLE : 0);
    return { y, z, pitch, toe: off * 1.05, planted: 1 };
  }
  const u = (p - STANCE) / (1 - STANCE);
  const k = smooth(0, 1, u);
  const z = -back + (front + back) * k;
  // The foot clears the ground early in swing, trails on its toes, and reaches level just before the heel lands.
  const lift = Math.sin(Math.min(1, u * 1.15) * Math.PI);
  const pitch = -0.72 * (1 - smooth(0, 0.45, u)) + 0.34 * smooth(0.55, 1, u);
  const y = ANKLE + Math.sin(0.72) * BALL * (1 - smooth(0, 0.4, u)) + lift * 0.055 + Math.sin(0.34) * HEEL_BACK * smooth(0.6, 1, u);
  return { y, z, pitch, toe: 0.75 * (1 - smooth(0, 0.3, u)), planted: 0 };
}

export interface BodyMotion {
  /** Pelvis drop below straight-legged standing, side shift over the stance foot, yaw and roll. */
  drop: number;
  shift: number;
  yaw: number;
  roll: number;
  /** Arm swing, -1..1: positive carries the L arm forward. */
  swing: number;
}

/** What the hips and arms do at a left-leg phase (the right leg runs half a cycle behind). */
export function bodyAt(phase: number, stride: number): BodyMotion {
  const a = phase * Math.PI * 2;
  const size = Math.min(1, stride / 1.3);
  return {
    // Lowest at double support (twice a cycle), highest over the stance leg, plus the crouch long strides need.
    drop: 0.022 + 0.042 * size * size + 0.012 * size * Math.cos(a * 2 + 0.5),
    shift: 0.018 * size * Math.cos(a - 0.5),
    yaw: 0.16 * size * Math.cos(a - 0.3),
    roll: 0.035 * size * Math.sin(a - 0.3),
    swing: Math.cos(a - 0.25),
  };
}
