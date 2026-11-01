import * as THREE from 'three';
import type { VehicleClass } from '@/game/fleet/vehicleCatalog';
import { ROOF_LADDER, accessFor, ladderLength, servicedUnit, type RoofAccessPoint, type RoofSpec, type RooftopUnit } from '@/game/world/rooftops';
import { curbDoor, ease, pathLength, samplePath } from './serviceCall';

/**
 * Visual choreography of a rooftop service call (rooftops.ts decides what is possible; the simulation decides
 * when phases start and end; this module only decides what that looks like).
 *
 * Going up (the job's access phase):    exit the van → walk to its rear → pull the extension ladder off the rack →
 *   shoulder-carry it to the access point → set its feet and walk it up → extend the fly section → climb rung by
 *   rung → step over the parapet → walk to the rooftop unit.
 * Coming down (the vehicle's pack-up):  collect the tools → walk back to the ladder → step onto it → climb down →
 *   retract the fly → lower the ladder → shoulder it and turn → carry it back → push it onto the rack → get in.
 *
 * Everything is a pure function of the time `t` (seconds at 1×) into the sequence, so the caller can drive it at
 * its own pace and still jump to the point a loaded save resumes at. There is exactly one ladder per vehicle; at any
 * `t` it is on the rack (vehicle frame) or at one world pose, never both.
 */

export type V3 = THREE.Vector3;
const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const flat = (p: { x: number; z: number }, y = 0) => v3(p.x, y, p.z);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const headingOf = (d: { x: number; z: number }) => Math.atan2(d.x, d.z);
const angleLerp = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
/** 0 → 1 → 0 over [a, b]. */
const bump = (u: number, a: number, b: number) => (u <= a || u >= b ? 0 : Math.sin(((u - a) / (b - a)) * Math.PI));

/** Where each vehicle class carries the ladder (vehicle frame, metres): rack centre line, ladder lying on it. */
export const RACK: Record<VehicleClass, { x: number; y: number; z: number; half: number }> = {
  'compact-van': { x: 0, y: 2.2, z: -0.5, half: 2.375 },
  'full-size-van': { x: 0, y: 2.76, z: -0.7, half: 2.975 },
  pickup: { x: 0, y: 2.55, z: -1.5, half: 2.925 },
  'box-truck': { x: 1.1, y: 3.72, z: -1.225, half: 3.7 },
};

const SPEED = { walk: 1.45, carry: 1.15, roof: 1.25, climb: 0.62, climbDown: 0.7 };
/** Rung spacing and the first rung's height along the rails (rooftops.ts ROOF_LADDER). */
const RUNG = ROOF_LADDER.rungStep;
const FIRST = ROOF_LADDER.firstRung;
const BASE_LEN = ROOF_LADDER.closed;
const FLY_LEN = 3.6;
const HALF_W = 0.24;
/** Retracted fly offset (its foot this far up the base). */
const FLY_HOME = 0.2;
/** Height (along the axis) of the technician's hands while walking the ladder up, and of the top end at the start. */
const RAISE_HANDS = 1.85;
const RAISE_START_TOP = 1.6;

export interface LadderPose {
  /** 'rack': lying on the vehicle's rack (the caller places it in the vehicle frame); 'world': feet at `foot`. */
  mode: 'rack' | 'world';
  foot: V3;
  /** Unit vectors: along the rails (feet → top), across the rails, and the climbing face normal. */
  axis: V3;
  across: V3;
  /** How far the fly section's foot is up the base (m). */
  fly: number;
}

export interface Limbs {
  handL?: V3;
  handR?: V3;
  footL?: V3;
  footR?: V3;
}

export type ChoreoAnim = 'hidden' | 'idle' | 'walk' | 'carry' | 'ladder-carry' | 'reach' | 'raise' | 'pull' | 'climb' | 'step-over' | 'work';

export interface ChoreoFrame {
  stage: string;
  /** 0..1 inside the stage. */
  u: number;
  anim: ChoreoAnim;
  /** Technician root (soles) in the world, facing, forward lean (radians, about his own x). */
  pos: V3;
  heading: number;
  lean: number;
  /** World targets for hands and feet (IK), when the stage poses them. */
  limbs: Limbs;
  /** Walking pace multiplier for the leg cycle (0 standing). */
  pace: number;
  ladder: LadderPose;
}

interface Stage {
  name: string;
  dur: number;
  frame: (u: number) => ChoreoFrame;
}

export interface RoofPlan {
  spec: RoofSpec;
  access: RoofAccessPoint;
  unit: RooftopUnit;
  van: { x: number; z: number; heading: number };
  klass: VehicleClass;
  up: Stage[];
  down: Stage[];
  upTotal: number;
  downTotal: number;
  /** Where the technician kneels at the unit and which way he faces. */
  workSpot: V3;
  workHeading: number;
}

/** The ladder lying on the vehicle's rack: feet toward the rear, climbing face up (in the vehicle frame). */
export function rackPose(klass: VehicleClass): LadderPose {
  const r = RACK[klass];
  return { mode: 'rack', foot: v3(r.x, r.y, r.z - BASE_LEN / 2), axis: v3(0, 0, 1), across: v3(1, 0, 0), fly: FLY_HOME };
}

/** Vehicle frame → world for a pose (the van parked at `van`). */
function rackWorld(klass: VehicleClass, van: { x: number; z: number; heading: number }): LadderPose {
  const p = rackPose(klass);
  const m = new THREE.Matrix4().makeRotationY(van.heading).setPosition(van.x, 0, van.z);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, van.heading);
  return { mode: 'world', foot: p.foot.clone().applyMatrix4(m), axis: p.axis.clone().applyQuaternion(q), across: p.across.clone().applyQuaternion(q), fly: p.fly };
}

/**
 * The ladder on the technician's shoulder: held at its middle, on edge (rails one above the other), the lower rail on
 * his right (+x) shoulder, the leading end a little high. `lead` +1: the top end leads (forward), -1: the feet lead.
 */
function carryPose(pos: V3, heading: number, lead: 1 | -1, fly = FLY_HOME): { ladder: LadderPose; handL: V3; handR: V3 } {
  const f = v3(Math.sin(heading), 0, Math.cos(heading));
  const side = v3(Math.cos(heading), 0, -Math.sin(heading)); // his +x
  const tilt = 0.09;
  // Feet → top along his heading (lead +1) or against it (-1); the leading end is raised a little either way.
  const axis = f.clone().multiplyScalar(lead * Math.cos(tilt)).addScaledVector(UP, lead > 0 ? Math.sin(tilt) : -Math.sin(tilt));
  const across = UP.clone().addScaledVector(axis, -UP.dot(axis)).normalize();
  const shoulder = pos.clone().addScaledVector(side, 0.2).addScaledVector(UP, 1.56);
  const center = shoulder.clone().addScaledVector(across, HALF_W + 0.025);
  const foot = center.clone().addScaledVector(axis, -BASE_LEN / 2);
  const rail = center.clone().addScaledVector(across, -HALF_W - 0.02);
  const handR = rail.clone().addScaledVector(f, 0.34).addScaledVector(side, -0.02);
  const handL = rail.clone().addScaledVector(f, -0.26).addScaledVector(side, -0.04);
  return { ladder: { mode: 'world', foot, axis: axis.normalize(), across, fly }, handL, handR };
}

/** Interpolates two world ladder poses (slerped frame, lerped feet). */
function blendLadder(a: LadderPose, b: LadderPose, t: number): LadderPose {
  const qa = frameQuat(a);
  const qb = frameQuat(b);
  const q = qa.clone().slerp(qb, t);
  return { mode: 'world', foot: a.foot.clone().lerp(b.foot, t), axis: v3(0, 1, 0).applyQuaternion(q), across: v3(1, 0, 0).applyQuaternion(q), fly: lerp(a.fly, b.fly, t) };
}

/** The ladder's frame as a rotation: local x across, y along the rails, z the climbing face. */
export function frameQuat(p: LadderPose): THREE.Quaternion {
  const y = p.axis.clone().normalize();
  const x = p.across.clone().addScaledVector(y, -p.across.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Total rail length for a fly offset (the fly's top beyond the base's). */
const totalLength = (fly: number) => Math.max(BASE_LEN, fly + FLY_LEN);

/**
 * Builds the plan for a job at a roof: positions, paths, durations. `van` is where the vehicle stands (its service pose).
 */
export function roofPlan(spec: RoofSpec, klass: VehicleClass, van: { x: number; z: number; heading: number }): RoofPlan | null {
  const access = accessFor(spec);
  const unit = servicedUnit(spec);
  if (!access || !unit) return null;
  const out = v3(access.out.x, 0, access.out.z).normalize();
  const toWall = out.clone().negate();
  const wallHeading = headingOf(toWall);
  const F = flat(access.foot);
  const rest = v3(access.rest.x, access.rest.y, access.rest.z);
  const restLen = rest.distanceTo(F);
  const axisFinal = rest.clone().sub(F).normalize();
  // Extension: total length rounded to whole rungs so the fly's rungs line up with the base's.
  const flyFinal = Math.max(FLY_HOME, Math.round((ladderLength(access) - FLY_LEN) / RUNG) * RUNG);
  const wallDist = Math.hypot(rest.x - F.x, rest.z - F.z);
  // Across the rails: along the wall, signed so the climbing face (x × y) points away from the wall.
  const across = new THREE.Vector3().crossVectors(UP, out).normalize();
  if (new THREE.Vector3().crossVectors(across, axisFinal).dot(out) < 0) across.negate();
  const face = (axis: V3) => new THREE.Vector3().crossVectors(across, axis).normalize();
  /** The ladder leaning on the wall with the given fly offset: its top on the wall face, or on the edge once long enough. */
  const leaning = (fly: number): LadderPose => {
    const L = totalLength(fly);
    if (L >= restLen) return { mode: 'world', foot: F.clone(), axis: axisFinal.clone(), across: across.clone(), fly };
    const h = Math.sqrt(Math.max(0, L * L - wallDist * wallDist));
    const axis = toWall.clone().multiplyScalar(wallDist).addScaledVector(UP, h).normalize();
    return { mode: 'world', foot: F.clone(), axis, across: across.clone(), fly };
  };
  /** The ladder pivoting on its feet at angle phi from the outward horizontal (phi > 90°: leaning toward the wall). */
  const pivot = (phi: number): LadderPose => ({ mode: 'world', foot: F.clone(), axis: out.clone().multiplyScalar(Math.cos(phi)).addScaledVector(UP, Math.sin(phi)), across: across.clone(), fly: FLY_HOME });
  const leanHome = leaning(FLY_HOME);
  const phiLean = Math.atan2(leanHome.axis.y, leanHome.axis.dot(out));
  const phi0 = Math.asin(RAISE_START_TOP / BASE_LEN);

  // Vehicle: door, the spot behind it where the ladder comes off, its headings.
  const vf = v3(Math.sin(van.heading), 0, Math.cos(van.heading));
  const vr = v3(-Math.cos(van.heading), 0, Math.sin(van.heading)); // right (curb) side
  const doorIn = flat(curbDoor(van, -0.55));
  const doorOut = flat(curbDoor(van, 0.4));
  const rack = RACK[klass];
  const rear = v3(van.x, 0, van.z).addScaledVector(vf, -(rack.half + 0.62)).addScaledVector(vr, -rack.x);
  // Facing rearward his +x is the van's right: stand left of the ladder line so it passes over that shoulder.
  const rearSpot = rear.clone().addScaledVector(vr, -0.2);
  const rearHeading = van.heading + Math.PI;
  const footOut = F.clone().addScaledVector(out, BASE_LEN / 2);
  /** Where he stands, and how far up the rails his hands are, while walking the ladder up at angle phi. */
  const raiseHold = (phi: number) => {
    const along = Math.min(BASE_LEN - 0.25, RAISE_HANDS / Math.max(0.3, Math.sin(phi)));
    return { along, stand: F.clone().addScaledVector(out, Math.max(0.55, along * Math.cos(Math.min(phi, Math.PI / 2)) + 0.3)) };
  };
  const raiseStart = raiseHold(phi0).stand;
  const toRack = [doorOut, rear.clone().addScaledVector(vr, 0.9), rearSpot];
  // He steps back a little while the ladder comes off; the carry starts where he ends up.
  // (far enough that the ladder's back half, behind his shoulder, clears the van's rear doors).
  const retrieveEnd = rearSpot.clone().addScaledVector(vf, -1.6);
  const carryPath = [retrieveEnd, ...spec.approach.map((p) => flat(p)), footOut];
  const deckY = spec.deckY + 0.06;
  const landing = flat(access.landing, deckY);
  const workSpot = flat(unit.workSpot, deckY);
  const workHeading = headingOf({ x: -unit.serviceDir.x, z: -unit.serviceDir.z });
  const roofPath = [landing, workSpot];

  // Climb: the root (soles) runs along the rails, 0.16 m out from them; it ends with the feet about half a metre
  // below the roof edge (the hands then hold the rails above it).
  const faceFinal = face(axisFinal);
  const edgeAlong = restLen;
  const climbTop = edgeAlong - 0.72;
  const leanFinal = Math.acos(THREE.MathUtils.clamp(axisFinal.y, -1, 1));
  const ladderFinal = leaning(flyFinal);
  const flyRungsMax = Math.floor((totalLength(flyFinal) - FIRST - 0.25) / RUNG);

  const still = (stage: string, u: number, anim: ChoreoAnim, pos: V3, heading: number, ladder: LadderPose, limbs: Limbs = {}, pace = 0, lean = 0): ChoreoFrame => ({ stage, u, anim, pos, heading, lean, limbs, pace, ladder });
  const walkAlong = (path: V3[], u: number, window = 0.45) => {
    const len = pathLength(path);
    // Ease into and out of the stride.
    const s = len * easeWalk(u, len);
    const p = samplePath(path, s);
    // Facing along a window round the current point, so corners of the path are walked round, not snapped.
    const a = samplePath(path, Math.max(0, s - window));
    const b = samplePath(path, Math.min(len, s + window));
    const heading = Math.hypot(b.x - a.x, b.z - a.z) > 1e-3 ? Math.atan2(b.x - a.x, b.z - a.z) : p.heading;
    return { pos: v3(p.x, path[0].y, p.z), heading };
  };
  const onRack = rackPose(klass);
  const rackW = rackWorld(klass, van);

  /** Climbing frame: limbs on rungs for root progress h (0 at the ground, climbTop at the top). */
  const climbFrame = (stage: string, u: number, h: number): ChoreoFrame => {
    const ladder = ladderFinal;
    const axis = ladder.axis;
    const fc = faceFinal;
    const rungAt = (k: number) => (k < 0 ? 0 : FIRST + Math.min(k, flyRungsMax) * RUNG);
    const C = RUNG * 2;
    const limb = (offset: number, base: number, swing: number) => {
      const x = h - offset;
      const n = Math.floor(x / C);
      const q = clamp01((x - n * C) / (C * 0.38));
      const k1 = 2 * n + base;
      const k0 = k1 - 2;
      const e = ease(q);
      return { along: lerp(rungAt(k0), rungAt(k1), e), away: bump(q, 0, 1) * swing };
    };
    const fL = limb(0, 0, 0.1);
    const fR = limb(RUNG, 1, 0.1);
    const hR = limb(0.15, 6, 0.08);
    const hL = limb(0.15 + RUNG, 5, 0.08);
    const rootAlong = (fL.along + fR.along) / 2 - 0.05;
    const point = (along: number, side: number, away: number, depth: number) => F.clone().addScaledVector(axis, along).addScaledVector(across, side).addScaledVector(fc, depth + away);
    const pos = F.clone().addScaledVector(axis, Math.max(0, rootAlong)).addScaledVector(fc, 0.16);
    return {
      stage,
      u,
      anim: 'climb',
      pos,
      heading: wallHeading,
      lean: leanFinal,
      pace: 0,
      ladder,
      // Ankles just behind the rung (balls of the feet on it), hands round the rungs.
      limbs: { footL: point(fL.along + 0.045, 0.11, fL.away, 0.065), footR: point(fR.along + 0.045, -0.11, fR.away, 0.065), handL: point(hL.along, 0.17, hL.away, 0.03), handR: point(hR.along, -0.17, hR.away, 0.03) },
    };
  };
  const climbEnd = climbFrame('climb', 1, climbTop);
  /** Over the parapet (or off the slab edge) onto the deck. */
  const transfer = (stage: string, u: number): ChoreoFrame => {
    const p0 = climbEnd.pos;
    const apex = rest.clone().addScaledVector(toWall, 0.15).addScaledVector(UP, 0.12);
    apex.y = Math.max(apex.y, spec.edgeY + 0.12);
    const k = ease(u);
    const pos = p0.clone().multiplyScalar((1 - k) * (1 - k)).addScaledVector(apex, 2 * k * (1 - k)).addScaledVector(landing, k * k);
    const railTop = (side: number) => F.clone().addScaledVector(axisFinal, edgeAlong + 0.5).addScaledVector(across, side * 0.24);
    const limbs: Limbs = u < 0.55 ? { handL: railTop(1), handR: railTop(-1) } : {};
    return still(stage, u, 'step-over', pos, wallHeading, ladderFinal, limbs, 0, leanFinal * (1 - clamp01(u / 0.6)));
  };

  // ---------------------------------------------------------------- going up
  const up: Stage[] = [];
  const add = (list: Stage[], name: string, dur: number, frame: (u: number) => ChoreoFrame) => list.push({ name, dur: Math.max(0.05, dur), frame });
  add(up, 'exit', 0.6, (u) => still('exit', u, 'walk', doorIn.clone().lerp(doorOut, ease(u)), headingOf(doorOut.clone().sub(doorIn)), onRack, {}, 0.7));
  add(up, 'to-rack', pathLength(toRack) / SPEED.walk, (u) => {
    const w = walkAlong(toRack, u);
    const exitHeading = headingOf(doorOut.clone().sub(doorIn));
    return still('to-rack', u, 'walk', w.pos, angleLerp(angleLerp(exitHeading, w.heading, clamp01(u / 0.3)), rearHeading, clamp01((u - 0.75) / 0.25)), onRack, {}, 1);
  });
  add(up, 'retrieve', 3.2, (u) => {
    // Pull it rearward off the rack (feet first), then lower it onto the shoulder.
    const slid = rackW.foot.clone().addScaledVector(vf, -1.7);
    const off = { ...rackW, foot: slid };
    const carry = carryPose(retrieveEnd, rearHeading, -1);
    const ladder = u < 0.55 ? { ...rackW, foot: rackW.foot.clone().lerp(slid, ease(u / 0.55)) } : blendLadder(off, carry.ladder, ease((u - 0.55) / 0.45));
    // Hands on the lower rail above him, following the ladder down.
    const grip = (along: number) => ladder.foot.clone().addScaledVector(ladder.axis, along).addScaledVector(ladder.across, -HALF_W).addScaledVector(UP, -0.03);
    const limbs = u < 0.55 ? { handR: grip(0.4 + 1.7 * ease(u / 0.55)), handL: grip(0.1 + 1.7 * ease(u / 0.55)) } : { handR: carry.handR.clone().lerp(grip(2.2), 1 - ease((u - 0.55) / 0.45)), handL: carry.handL.clone().lerp(grip(1.6), 1 - ease((u - 0.55) / 0.45)) };
    return still('retrieve', u, 'reach', rearSpot.clone().lerp(retrieveEnd, ease(u)), rearHeading, u < 0.55 ? { ...ladder, mode: 'world' } : ladder, limbs);
  });
  add(up, 'carry', pathLength(carryPath) / SPEED.carry, (u) => {
    const w = walkAlong(carryPath, u, 0.95);
    const heading = angleLerp(angleLerp(rearHeading, w.heading, clamp01(u / 0.18)), wallHeading, clamp01((u - 0.9) / 0.1));
    const c = carryPose(w.pos, heading, -1);
    return still('carry', u, 'ladder-carry', w.pos, heading, c.ladder, { handL: c.handL, handR: c.handR }, 0.85);
  });
  add(up, 'set', 1.8, (u) => {
    // Feet down at the wall, top end staying on his shoulder as he steps back to the raising position.
    const pos = footOut.clone().lerp(raiseStart, ease(u));
    const carry = carryPose(footOut, wallHeading, -1).ladder;
    const ladder = blendLadder(carry, pivot(phi0), ease(u));
    const top = ladder.foot.clone().addScaledVector(ladder.axis, BASE_LEN - 0.25);
    return still('set', u, 'raise', pos, wallHeading, ladder, { handL: top.clone().addScaledVector(across, HALF_W), handR: top.clone().addScaledVector(across, -HALF_W) }, 0.6);
  });
  add(up, 'raise', 3.2, (u) => {
    // Walk it up hand over hand toward its feet, then lean it on the wall.
    const phi = lerp(phi0, phiLean, ease(u));
    const ladder = pivot(phi);
    const { along, stand: pos } = raiseHold(phi);
    const hands = ladder.foot.clone().addScaledVector(ladder.axis, along);
    const sway = Math.sin(u * Math.PI * 6) * 0.04;
    return still('raise', u, 'raise', pos, wallHeading, ladder, { handL: hands.clone().addScaledVector(across, HALF_W - 0.02).addScaledVector(ladder.axis, sway), handR: hands.clone().addScaledVector(across, -HALF_W + 0.02).addScaledVector(ladder.axis, -sway) }, 0.5);
  });
  add(up, 'extend', 1.8, (u) => {
    // Pull the halyard hand over hand: the fly runs up and the top settles onto the edge.
    const ladder = leaning(lerp(FLY_HOME, flyFinal, ease(u)));
    const base = F.clone().addScaledVector(out, 0.5);
    const pull = (ph: number) => ladder.foot.clone().addScaledVector(ladder.axis, 1.15 + 0.35 * (0.5 + 0.5 * Math.sin(u * Math.PI * 7 + ph))).addScaledVector(face(ladder.axis), 0.05);
    return still('extend', u, 'pull', base, wallHeading, ladder, { handL: pull(0).addScaledVector(across, 0.05), handR: pull(Math.PI).addScaledVector(across, -0.05) });
  });
  const groundStand = F.clone().addScaledVector(out, 0.5);
  /** Stepping in to the ladder: hands to the rungs, first foot onto the bottom rung. */
  const mount = (stage: string, u: number): ChoreoFrame => {
    const c = climbFrame('climb', 0, 0);
    const k = ease(u);
    return { ...c, stage, u, pos: groundStand.clone().lerp(c.pos, k), lean: c.lean * k, pace: u < 0.6 ? 0.4 : 0 };
  };
  add(up, 'mount', 0.9, (u) => mount('mount', u));
  add(up, 'climb', climbTop / SPEED.climb, (u) => climbFrame('climb', u, u * climbTop));
  add(up, 'transfer', 1.8, (u) => transfer('transfer', u));
  add(up, 'roof-walk', pathLength(roofPath) / SPEED.roof, (u) => {
    const w = walkAlong(roofPath, u);
    return still('roof-walk', u, 'carry', w.pos, angleLerp(w.heading, workHeading, clamp01((u - 0.85) / 0.15)), ladderFinal, {}, 1);
  });

  // ---------------------------------------------------------------- coming down
  const down: Stage[] = [];
  const pickEnd = F.clone().addScaledVector(out, BASE_LEN / 2);
  // Beside the lying ladder, not on it: facing out he shoulders it on his +x side.
  const outHeadingDown = wallHeading + Math.PI;
  const pickSpot = pickEnd.clone().addScaledVector(v3(Math.cos(outHeadingDown), 0, -Math.sin(outHeadingDown)), -0.2);
  const backPath = [pickSpot, ...[...spec.approach].reverse().map((p) => flat(p)), rearSpot.clone().addScaledVector(vf, -0.35)];
  const stowSpot = rearSpot.clone().addScaledVector(vf, -0.35);
  const stowEnd = stowSpot.clone().addScaledVector(vf, 0.3);
  const toDoor = [stowEnd, rear.clone().addScaledVector(vr, 0.9), doorOut];
  add(down, 'collect', 1.2, (u) => still('collect', u, 'idle', workSpot.clone(), workHeading, ladderFinal));
  const backWalk = pathLength(roofPath) / SPEED.roof;
  add(down, 'roof-walk', backWalk + 1.1, (u) => {
    // Walking, then a second to turn round at the landing.
    const t = u * (backWalk + 1.1);
    const w = walkAlong([workSpot, landing], clamp01(t / backWalk));
    const turnU = clamp01((t - backWalk + 0.25) / 1.35);
    // Walk to the landing, then turn his back to the edge: he goes down facing the ladder.
    return still('roof-walk', u, 'carry', w.pos, angleLerp(angleLerp(workHeading, w.heading, clamp01(t / Math.min(0.8, backWalk))), wallHeading, ease(turnU)), ladderFinal, {}, t < backWalk ? 1 : 0.35);
  });
  add(down, 'transfer', 1.9, (u) => {
    const f = transfer('transfer', 1 - u);
    return { ...f, u };
  });
  add(down, 'climb', climbTop / SPEED.climbDown, (u) => climbFrame('climb', u, (1 - u) * climbTop));
  add(down, 'dismount', 0.9, (u) => ({ ...mount('dismount', 1 - u), u }));
  add(down, 'retract', 1.6, (u) => {
    const ladder = leaning(lerp(flyFinal, FLY_HOME, ease(u)));
    const pull = (ph: number) => ladder.foot.clone().addScaledVector(ladder.axis, 1.2 + 0.3 * (0.5 + 0.5 * Math.sin(u * Math.PI * 6 + ph))).addScaledVector(face(ladder.axis), 0.05);
    return still('retract', u, 'pull', F.clone().addScaledVector(out, 0.5), wallHeading, ladder, { handL: pull(0).addScaledVector(across, 0.05), handR: pull(Math.PI).addScaledVector(across, -0.05) });
  });
  add(down, 'lower', 3.0, (u) => {
    const f = up.find((s) => s.name === 'raise')!.frame(1 - u);
    return { ...f, stage: 'lower', u, pace: 0.5 };
  });
  add(down, 'pick-up', 3.0, (u) => {
    // Lay it down on the ground, step round to its middle facing the van, and shoulder it top end first (its top
    // already points outward, so the frame stays continuous and it reaches the rack the right way round).
    const outHeading = wallHeading + Math.PI;
    const lay = clamp01(u / 0.35);
    const lying = pivot(0.035);
    if (u < 0.35) {
      const ladder = blendLadder(pivot(phi0), lying, ease(lay));
      const top = ladder.foot.clone().addScaledVector(ladder.axis, BASE_LEN - 0.25);
      return still('pick-up', u, 'raise', raiseStart.clone(), wallHeading, ladder, { handL: top.clone().addScaledVector(across, HALF_W), handR: top.clone().addScaledVector(across, -HALF_W) }, 0);
    }
    if (u < 0.7) {
      const k = ease((u - 0.35) / 0.35);
      const pos = raiseStart.clone().lerp(pickSpot, k);
      return still('pick-up', u, 'walk', pos, angleLerp(wallHeading, outHeading, k), lying, {}, 0.8);
    }
    const k = ease((u - 0.7) / 0.3);
    const carry = carryPose(pickSpot, outHeading, 1);
    const ladder = blendLadder(lying, carry.ladder, k);
    const grip = (along: number) => ladder.foot.clone().addScaledVector(ladder.axis, along).addScaledVector(ladder.across, -HALF_W);
    return still('pick-up', u, 'reach', pickSpot.clone(), outHeading, ladder, { handL: grip(1.6).lerp(carry.handL, k), handR: grip(2.2).lerp(carry.handR, k) }, 0);
  });
  add(down, 'carry', pathLength(backPath) / SPEED.carry, (u) => {
    const w = walkAlong(backPath, u, 0.95);
    const heading = angleLerp(angleLerp(wallHeading + Math.PI, w.heading, clamp01(u / 0.22)), van.heading, ease(clamp01((u - 0.75) / 0.25)));
    // Top end first, so it goes onto the rear roller first.
    const c = carryPose(w.pos, heading, 1);
    return still('carry', u, 'ladder-carry', w.pos, heading, c.ladder, { handL: c.handL, handR: c.handR }, 0.85);
  });
  add(down, 'stow', 2.4, (u) => {
    // Lift the leading end onto the rear roller and push the ladder forward onto the rack.
    const carry = carryPose(stowSpot, van.heading, 1);
    const lifted = { ...rackW, foot: rackW.foot.clone().addScaledVector(vf, -1.7) };
    // Facing the van, top end first: the carried ladder's frame matches the rack's (feet rearward, top forward).
    const ladder = u < 0.45 ? blendLadder(carry.ladder, lifted, ease(u / 0.45)) : { ...rackW, foot: lifted.foot.clone().lerp(rackW.foot, ease((u - 0.45) / 0.55)) };
    const grip = (along: number) => ladder.foot.clone().addScaledVector(ladder.axis, along).addScaledVector(ladder.across, -HALF_W).addScaledVector(UP, -0.03);
    const pos = stowSpot.clone().addScaledVector(vf, 0.3 * ease(u));
    return still('stow', u, 'reach', pos, van.heading, u >= 1 ? onRack : ladder, { handR: grip(0.35), handL: grip(0.05) });
  });
  add(down, 'to-door', pathLength(toDoor) / SPEED.walk, (u) => {
    const w = walkAlong(toDoor, u);
    const enterHeading = headingOf(doorIn.clone().sub(doorOut));
    return still('to-door', u, 'walk', w.pos, angleLerp(angleLerp(van.heading, w.heading, clamp01(u / 0.35)), enterHeading, clamp01((u - 0.7) / 0.3)), onRack, {}, 1);
  });
  add(down, 'enter', 0.6, (u) => still('enter', u, 'walk', doorOut.clone().lerp(doorIn, ease(u)), headingOf(doorIn.clone().sub(doorOut)), onRack, {}, 0.7));

  const total = (l: Stage[]) => l.reduce((s, x) => s + x.dur, 0);
  return { spec, access, unit, van, klass, up, down, upTotal: total(up), downTotal: total(down), workSpot, workHeading };
}

/** Eased walking progress: a softer start and stop over the first and last metre. */
function easeWalk(u: number, len: number): number {
  if (len < 0.01) return 1;
  const r = Math.min(0.45, 1 / len);
  // Piecewise: accelerate over r, constant, decelerate over r (C1 at the joins).
  const v = 1 / (1 - r);
  if (u < r) return (v * u * u) / (2 * r);
  if (u > 1 - r) return 1 - (v * (1 - u) * (1 - u)) / (2 * r);
  return v * (u - r / 2);
}

/** The frame at time t (seconds at 1×) into a stage list; beyond the end, the last frame. */
export function frameAt(stages: Stage[], t: number): ChoreoFrame {
  let left = Math.max(0, t);
  for (const s of stages) {
    if (left <= s.dur) return s.frame(left / s.dur);
    left -= s.dur;
  }
  const last = stages[stages.length - 1];
  return last.frame(1);
}

/** Every stage's name and duration (tests, the camera). */
export function stageTimes(stages: Stage[]): { name: string; start: number; dur: number }[] {
  let t = 0;
  return stages.map((s) => {
    const r = { name: s.name, start: t, dur: s.dur };
    t += s.dur;
    return r;
  });
}

/**
 * Where each vehicle's ladder is this frame, published by the technician working with it (WorkerView) and drawn by
 * the vehicle (LadderView). No entry: on the rack.
 */
export const ladderVisuals = new Map<string, LadderPose>();

const plans = new Map<string, RoofPlan | null>();
/** The plan for a lot's roof with a vehicle class (cached; positions are fixed data). */
export function roofPlanFor(spec: RoofSpec, klass: VehicleClass): RoofPlan | null {
  const key = `${spec.lotId}|${klass}`;
  if (!plans.has(key)) plans.set(key, roofPlan(spec, klass, spec.van));
  return plans.get(key)!;
}

/** Share of a rooftop job's access phase the van's pull-in may take; the choreography maps onto the rest. */
export const ROOF_PARK_SHARE = 0.25;
