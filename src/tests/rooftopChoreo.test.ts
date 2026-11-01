import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HOUSE_LOTS } from '@/game/world/cityLayout';
import { accessFor, roofSpec, servicedUnit } from '@/game/world/rooftops';
import { frameAt, frameQuat, rackPose, roofPlan, type ChoreoFrame, type LadderPose } from '@/world/scene/rooftopChoreo';

/**
 * The rooftop choreography is continuous: sampled at 30 frames a second through the whole climb up and the whole
 * pack-up, the technician never jumps (no teleporting between stages), the one ladder never jumps or flips, it
 * starts and ends on the rack, and it stands at the access point (feet on the ground, top on the roof edge) while
 * he is on the roof.
 */

const DT = 1 / 30;

function worldLadder(f: ChoreoFrame, van: { x: number; z: number; heading: number }): LadderPose {
  if (f.ladder.mode === 'world') return f.ladder;
  const m = new THREE.Matrix4().makeRotationY(van.heading).setPosition(van.x, 0, van.z);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), van.heading);
  return { ...f.ladder, mode: 'world', foot: f.ladder.foot.clone().applyMatrix4(m), axis: f.ladder.axis.clone().applyQuaternion(q), across: f.ladder.across.clone().applyQuaternion(q) };
}

function sweep(lotId: string) {
  const spec = roofSpec(lotId)!;
  const plan = roofPlan(spec, 'compact-van', spec.van)!;
  expect(plan, lotId).not.toBeNull();
  for (const [stages, total] of [[plan.up, plan.upTotal], [plan.down, plan.downTotal]] as const) {
    let prev: ChoreoFrame | null = null;
    for (let t = 0; t <= total + 1e-6; t += DT) {
      const f = frameAt(stages, t);
      expect(Number.isFinite(f.pos.x + f.pos.y + f.pos.z + f.heading + f.lean), `${lotId} ${f.stage}`).toBe(true);
      if (prev) {
        // At most a brisk 4 m/s for the body, 6 m/s for any point of the ladder, and no instant turn.
        expect(f.pos.distanceTo(prev.pos) / DT, `${lotId} ${prev.stage} → ${f.stage} at ${t.toFixed(2)} s`).toBeLessThan(4);
        const a = worldLadder(prev, spec.van);
        const b = worldLadder(f, spec.van);
        const ends = (l: LadderPose) => [l.foot.clone(), l.foot.clone().addScaledVector(l.axis, 3.8)];
        const [a0, a1] = ends(a);
        const [b0, b1] = ends(b);
        expect(Math.max(a0.distanceTo(b0), a1.distanceTo(b1)) / DT, `${lotId} ladder ${prev.stage} → ${f.stage} at ${t.toFixed(2)} s`).toBeLessThan(6);
        expect(frameQuat(a).angleTo(frameQuat(b)) / DT, `${lotId} ladder turn ${prev.stage} → ${f.stage} at ${t.toFixed(2)} s`).toBeLessThan(3);
        expect(Math.abs(Math.atan2(Math.sin(f.heading - prev.heading), Math.cos(f.heading - prev.heading))) / DT, `${lotId} heading ${prev.stage} → ${f.stage}`).toBeLessThan(6);
      }
      prev = f;
    }
  }
  return plan;
}

describe('rooftop choreography', () => {
  it('is continuous at Mesquite Plaza (no jumps for the technician or the ladder)', () => {
    sweep('cm-plaza');
  });

  it('is continuous at every modern home', () => {
    for (const lot of HOUSE_LOTS.filter((l) => l.style === 'modern')) sweep(lot.id);
  });

  it('takes the ladder off the rack, stands it at the access point while on the roof, and puts it back', () => {
    const spec = roofSpec('cm-plaza')!;
    const plan = roofPlan(spec, 'compact-van', spec.van)!;
    const access = accessFor(spec)!;
    const first = frameAt(plan.up, 0);
    const last = frameAt(plan.down, plan.downTotal);
    expect(first.ladder.mode).toBe('rack');
    expect(last.ladder.mode).toBe('rack');
    expect(first.ladder.foot.distanceTo(rackPose('compact-van').foot)).toBeLessThan(1e-6);
    // On the roof: feet on the ground at the access point, rails resting on (and above) the roof edge.
    const top = frameAt(plan.up, plan.upTotal);
    expect(top.ladder.mode).toBe('world');
    expect(top.ladder.foot.y).toBeCloseTo(0, 5);
    expect(Math.hypot(top.ladder.foot.x - access.foot.x, top.ladder.foot.z - access.foot.z)).toBeLessThan(1e-6);
    const railEnd = top.ladder.foot.clone().addScaledVector(top.ladder.axis, 3.6 + top.ladder.fly);
    expect(railEnd.y).toBeGreaterThan(spec.edgeY + 0.6);
    // He ends on the deck at the unit's work spot.
    expect(top.pos.y).toBeCloseTo(spec.deckY + 0.06, 3);
    expect(Math.hypot(top.pos.x - servicedUnit(spec)!.workSpot.x, top.pos.z - servicedUnit(spec)!.workSpot.z)).toBeLessThan(0.05);
    // Hands and feet on the rungs while climbing (within reach of the ladder's centre line).
    const climbStart = plan.up.slice(0, plan.up.findIndex((s) => s.name === 'climb')).reduce((s, x) => s + x.dur, 0);
    const mid = frameAt(plan.up, climbStart + plan.up.find((s) => s.name === 'climb')!.dur / 2);
    expect(mid.anim).toBe('climb');
    for (const p of [mid.limbs.handL!, mid.limbs.handR!, mid.limbs.footL!, mid.limbs.footR!]) {
      const rel = p.clone().sub(mid.ladder.foot);
      const along = rel.dot(mid.ladder.axis);
      const off = rel.clone().addScaledVector(mid.ladder.axis, -along);
      expect(off.length()).toBeLessThan(0.32);
      expect(along).toBeGreaterThan(-0.01);
    }
  });
});
