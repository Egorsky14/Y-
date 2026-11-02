import * as THREE from 'three';
import { RIG_MEASURES } from './rigData.generated';

/**
 * Inverse kinematics on the real character skeleton, run after the clips' rotations have been blended, so a hand or foot
 * with a target lands exactly on it every frame instead of trailing it. All positions are in the rig's own frame
 * (the character root, unscaled metres, +z forward). Pure: no React, no renderer, so tests can run it on a bare skeleton.
 *
 * Bone frames (see tools/blender/technician_v3.py): every rotation zero is the canonical pose. Limbs hang along -y with
 * axis-aligned local frames. An elbow flexes about its local x toward +z, a knee about its local x toward -z. With the
 * arm hanging the palm faces the thigh (+x on the L side at -x, -x on the R side) and the thumb points forward (+z).
 */

export type Side = -1 | 1;
export type ChainBones = Record<string, THREE.Object3D>;
const sideName = (side: Side) => (side < 0 ? 'L' : 'R');

const tmp = {
  m: new THREE.Matrix4(),
  m2: new THREE.Matrix4(),
  q: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
  q3: new THREE.Quaternion(),
  qFk: new THREE.Quaternion(),
  qFk2: new THREE.Quaternion(),
  v: new THREE.Vector3(),
  v2: new THREE.Vector3(),
  n: new THREE.Vector3(),
  u: new THREE.Vector3(),
  f: new THREE.Vector3(),
  xA: new THREE.Vector3(),
  yA: new THREE.Vector3(),
  zA: new THREE.Vector3(),
  pole: new THREE.Vector3(),
  basis: new THREE.Matrix4(),
  scale: new THREE.Vector3(1, 1, 1),
};

/** Rig-frame matrix of a chain from the root bone down (parents first). */
function chain(out: THREE.Matrix4, bones: THREE.Object3D[]): THREE.Matrix4 {
  out.identity();
  for (const b of bones) {
    tmp.m2.compose(b.position, b.quaternion, tmp.scale);
    out.multiply(tmp.m2);
  }
  return out;
}

export interface ArmSolveOptions {
  /** World-frame (rig-frame) rotation the hand should have; omitted, the hand continues the forearm's line. */
  hand?: THREE.Quaternion | null;
  /** How far the elbow swings out from the default (radians-ish; positive is outward). */
  elbowOut?: number;
  /** 0: the clip's pose stays. 1: exactly on target. */
  weight?: number;
}

/** Where the palm's centre sits in the hand bone's frame. */
export function palmOffset(side: Side, out: THREE.Vector3): THREE.Vector3 {
  return out.set(side < 0 ? 0.016 : -0.016, -RIG_MEASURES.handToPalm, 0.004);
}

const UPPER = RIG_MEASURES.upperArm;
const LOWER = RIG_MEASURES.foreArm;
const reach = { residual: 0 };

/**
 * Solves one arm so the palm reaches `palm`. Returns how far short of the target the hand stopped (metres; 0 when
 * reachable), which is what the contact tests assert on.
 */
export function solveArm(bones: ChainBones, side: Side, palm: THREE.Vector3, opts: ArmSolveOptions = {}): number {
  const s = sideName(side);
  const weight = opts.weight ?? 1;
  if (weight <= 0.001) return 0;
  const clav = bones[`clav${s}`];
  const arm = bones[`arm${s}`];
  const fore = bones[`fore${s}`];
  const twist = bones[`twist${s}`];
  const hand = bones[`hand${s}`];
  const mClav = chain(new THREE.Matrix4(), [bones.pelvis, bones.spine, bones.torso, clav]);
  const qClav = tmp.q.setFromRotationMatrix(mClav).clone();
  const shoulder = tmp.v.copy(arm.position).applyMatrix4(mClav);
  // The wrist, working back from the palm.
  const wrist = tmp.v2.copy(palm);
  if (opts.hand) {
    wrist.sub(palmOffset(side, tmp.n).applyQuaternion(opts.hand));
  } else {
    const d = tmp.n.copy(palm).sub(shoulder);
    const len = Math.max(1e-4, d.length());
    wrist.addScaledVector(d.divideScalar(len), -RIG_MEASURES.handToPalm);
  }
  // Into the clavicle's frame, measured from the shoulder.
  const local = tmp.f.copy(wrist).sub(shoulder).applyQuaternion(tmp.q2.copy(qClav).invert());
  const dist = Math.max(1e-4, local.length());
  const maxReach = UPPER + LOWER - 0.002;
  const d = THREE.MathUtils.clamp(dist, Math.abs(UPPER - LOWER) + 0.03, maxReach);
  reach.residual = Math.max(0, dist - maxReach);
  const n = tmp.n.copy(local).divideScalar(dist);
  const a1 = Math.acos(THREE.MathUtils.clamp((UPPER * UPPER + d * d - LOWER * LOWER) / (2 * UPPER * d), -1, 1));
  const flex = Math.PI - Math.acos(THREE.MathUtils.clamp((UPPER * UPPER + LOWER * LOWER - d * d) / (2 * UPPER * LOWER), -1, 1));
  // The elbow falls below the shoulder-to-wrist line, out to its own side and back. Pointing it only backward flipped it
  // upward for targets high in front of the shoulder.
  const out = opts.elbowOut ?? 0;
  const pole = tmp.pole.set(side * (0.45 + out), -1, -0.3);
  const m = pole.addScaledVector(n, -pole.dot(n));
  if (m.lengthSq() < 1e-6) m.set(0, -1, 0).addScaledVector(n, n.y);
  m.normalize();
  const u = tmp.u.copy(n).multiplyScalar(Math.cos(a1)).addScaledVector(m, Math.sin(a1));
  const elbow = tmp.xA.copy(u).multiplyScalar(UPPER);
  const fdir = tmp.f.copy(n).multiplyScalar(d).sub(elbow).normalize();
  const yAxis = tmp.yA.copy(u).negate();
  const zAxis = tmp.zA.copy(fdir).addScaledVector(u, -fdir.dot(u));
  if (zAxis.lengthSq() < 1e-8) zAxis.set(0, 0, 1).addScaledVector(yAxis, -yAxis.z);
  zAxis.normalize();
  const xAxis = tmp.xA.crossVectors(yAxis, zAxis).normalize();
  const qArm = tmp.q3.setFromRotationMatrix(tmp.basis.makeBasis(xAxis, yAxis, zAxis));
  tmp.qFk.copy(arm.quaternion);
  tmp.qFk2.copy(fore.quaternion);
  arm.quaternion.copy(tmp.qFk).slerp(qArm, weight);
  fore.quaternion.copy(tmp.qFk2).slerp(tmp.q.setFromAxisAngle(X_AXIS, -flex), weight);
  if (opts.hand) {
    // Hand rotation relative to the forearm, with its roll shared with the twist segment so the wrist does not candy-wrap.
    const parent = tmp.q2.copy(qClav).multiply(arm.quaternion).multiply(fore.quaternion);
    const rel = tmp.q3.copy(parent).invert().multiply(opts.hand);
    const angle = 2 * Math.atan2(rel.y, rel.w);
    const half = THREE.MathUtils.clamp(angle * 0.5, -1.1, 1.1);
    const qTwist = tmp.q.setFromAxisAngle(Y_AXIS, half);
    twist.quaternion.slerp(qTwist, weight);
    const handLocal = tmp.q2.copy(qTwist).invert().multiply(rel);
    hand.quaternion.slerp(handLocal, weight);
  } else {
    twist.quaternion.slerp(IDENTITY, weight);
    hand.quaternion.slerp(IDENTITY, weight);
  }
  return reach.residual * weight;
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const IDENTITY = new THREE.Quaternion();

const THIGH = RIG_MEASURES.thigh;
const SHIN = RIG_MEASURES.shin;

export interface LegSolveOptions {
  /** Sole pitch in the rig's frame: 0 level, positive toe up. */
  pitch?: number;
  /** Knee swing outward (radians-ish). */
  kneeOut?: number;
  weight?: number;
}

/** Solves one leg so the ankle reaches `ankle`, with the sole at the asked pitch. Returns the shortfall in metres. */
export function solveLeg(bones: ChainBones, side: Side, ankle: THREE.Vector3, opts: LegSolveOptions = {}): number {
  const s = sideName(side);
  const weight = opts.weight ?? 1;
  if (weight <= 0.001) return 0;
  const leg = bones[`leg${s}`];
  const shin = bones[`shin${s}`];
  const foot = bones[`foot${s}`];
  const pelvis = bones.pelvis;
  const hip = tmp.v.copy(leg.position).applyQuaternion(pelvis.quaternion).add(pelvis.position);
  const qPelvisInv = tmp.q2.copy(pelvis.quaternion).invert();
  const local = tmp.f.copy(ankle).sub(hip).applyQuaternion(qPelvisInv);
  const dist = Math.max(1e-4, local.length());
  const maxReach = THIGH + SHIN - 0.002;
  const d = THREE.MathUtils.clamp(dist, Math.abs(THIGH - SHIN) + 0.05, maxReach);
  const residual = Math.max(0, dist - maxReach);
  const n = tmp.n.copy(local).divideScalar(dist);
  const a1 = Math.acos(THREE.MathUtils.clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
  const flex = Math.PI - Math.acos(THREE.MathUtils.clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
  // The knee goes forward, a little out to its own side.
  const pole = tmp.pole.set(side * (0.12 + (opts.kneeOut ?? 0)), 0, 1);
  const m = pole.addScaledVector(n, -pole.dot(n));
  if (m.lengthSq() < 1e-6) m.set(0, 0, 1);
  m.normalize();
  const u = tmp.u.copy(n).multiplyScalar(Math.cos(a1)).addScaledVector(m, Math.sin(a1));
  const knee = tmp.xA.copy(u).multiplyScalar(THIGH);
  const fdir = tmp.v2.copy(n).multiplyScalar(d).sub(knee).normalize();
  const yAxis = tmp.yA.copy(u).negate();
  // Local +z points opposite the way the shin folds (shin flexes about x toward -z).
  const zAxis = tmp.zA.copy(fdir).addScaledVector(u, -fdir.dot(u)).negate();
  if (zAxis.lengthSq() < 1e-8) zAxis.set(0, 0, 1).addScaledVector(yAxis, -yAxis.z);
  zAxis.normalize();
  const xAxis = tmp.xA.crossVectors(yAxis, zAxis).normalize();
  const qLeg = tmp.q3.setFromRotationMatrix(tmp.basis.makeBasis(xAxis, yAxis, zAxis));
  leg.quaternion.slerp(qLeg, weight);
  shin.quaternion.slerp(tmp.q.setFromAxisAngle(X_AXIS, flex), weight);
  // The sole, in the rig's frame: undo everything above the foot.
  const above = tmp.q3.copy(pelvis.quaternion).multiply(leg.quaternion).multiply(shin.quaternion).invert();
  const footWorld = tmp.q2.setFromAxisAngle(X_AXIS, -(opts.pitch ?? 0));
  foot.quaternion.slerp(tmp.q.copy(above).multiply(footWorld), weight);
  return residual * weight;
}

/**
 * Rotation for a hand from what it is doing, in the rig's frame: `fingers` is the way the straightened fingers point,
 * `palm` the way the palm faces (the solver orthogonalises it against `fingers`).
 */
export function handRotation(side: Side, fingers: THREE.Vector3, palm: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const y = tmp.yA.copy(fingers).normalize().negate();
  // Bone frame: the palm faces +x on the L side and -x on the R side.
  const x = tmp.xA.copy(palm).addScaledVector(y, -palm.dot(y)).normalize();
  if (side > 0) x.negate();
  const z = tmp.zA.crossVectors(x, y).normalize();
  return out.setFromRotationMatrix(tmp.basis.makeBasis(x, y, z));
}

export interface FingerPose {
  /** 0 open, 1 closed round a handle. */
  curl: number;
  /** Closing the thumb across the palm, 0 to 1. */
  thumb: number;
  /** How far the fingers fan apart when open. */
  spread?: number;
}

const FINGER_NAMES = ['index', 'middle', 'ring', 'pinky'] as const;
const FINGER_FAN = { index: 0.09, middle: 0.02, ring: -0.05, pinky: -0.13 };
const qA = new THREE.Quaternion();
const eA = new THREE.Euler();

/** Sets the finger bones of a hand. The curl axis is each finger's local z (the palm side is +x on L, -x on R). */
export function poseFingers(bones: ChainBones, side: Side, pose: FingerPose): void {
  const s = sideName(side);
  const sgn = side < 0 ? 1 : -1;
  const spread = pose.spread ?? 0;
  FINGER_NAMES.forEach((f, i) => {
    const late = 1 + i * 0.05;
    const prox = pose.curl * 1.5 * late + 0.12;
    const dist = pose.curl * 1.7 * late + 0.2;
    bones[`${f}1${s}`].quaternion.setFromEuler(eA.set(spread * FINGER_FAN[f] * 4, 0, sgn * prox));
    bones[`${f}2${s}`].quaternion.setFromAxisAngle(Z_AXIS, sgn * dist);
  });
  // The thumb opposes across the palm: it swings toward the palm and folds its tip.
  bones[`thumb1${s}`].quaternion.setFromEuler(eA.set(-0.45 * pose.thumb, 0, sgn * (0.15 + 0.5 * pose.thumb)));
  bones[`thumb2${s}`].quaternion.setFromAxisAngle(Z_AXIS, qA.identity() && sgn * (0.2 + 0.75 * pose.thumb));
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
