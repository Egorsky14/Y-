import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HQ_LOT, hqParkingStalls } from '@/game/world/cityLayout';
import { armIK, KNEEL } from '@/world/characters/Worker';
import { BAG_LOCAL } from '@/world/scene/serviceCall';
import { HQ, HQ_OPERATIONS_SOLIDS } from '@/world/buildings/HeadquartersBuilder';
import { HQ_STAFF_ROW, HQ_VISITOR_CARS, parkedCarSpots } from '@/world/vehicles/parkedCarSpots';

/**
 * World Immersion: the technician's arm IK reaches the cabinet targets it is given, and the HQ
 * operations staging stays clear of the fleet stalls, the stall-to-apron route, the bay doors and
 * the parked cars.
 */

/** Hand position from the rig's joint angles (same hierarchy as Worker: pelvis → torso → shoulder → elbow). */
function handPosition(side: 1 | -1, torsoPitch: number, pelvisY: number, arm: [number, number, number], fore: number, yaw = 0, roll = 0): THREE.Vector3 {
  const torso = new THREE.Object3D();
  torso.position.set(0, pelvisY + 0.06, 0);
  torso.rotation.set(torsoPitch, yaw, roll);
  const shoulder = new THREE.Object3D();
  shoulder.position.set(side * 0.25, 0.5, 0);
  shoulder.rotation.set(arm[0], arm[1], arm[2]);
  const elbow = new THREE.Object3D();
  elbow.position.set(0, -0.3, 0);
  elbow.rotation.set(fore, 0, 0);
  const hand = new THREE.Object3D();
  hand.position.set(0, -0.31, 0);
  torso.add(shoulder);
  shoulder.add(elbow);
  elbow.add(hand);
  torso.updateMatrixWorld(true);
  return hand.getWorldPosition(new THREE.Vector3());
}

describe('technician arm IK', () => {
  // Kneeling at the unit (pelvis 0.53, lean 0.4) and standing (0.93, 0.42): service panel, cabinet top, gauges, meter at the chest.
  const cases: [number, number, 1 | -1, { x: number; y: number; z: number }][] = [
    [0.4, 0.53, 1, { x: 0.14, y: 0.62, z: 0.54 }],
    [0.4, 0.53, -1, { x: -0.2, y: 0.98, z: 0.68 }],
    [0.4, 0.53, -1, { x: -0.12, y: 0.85, z: 0.42 }],
    [0.42, 0.93, 1, { x: 0.22, y: 0.98, z: 0.6 }],
    [0.1, 0.92, 1, { x: 0.12, y: 1.0, z: 0.33 }],
  ];
  it('puts the hand on reachable targets within 2 cm', () => {
    for (const [lean, pY, side, target] of cases) {
      const sol = armIK(side, target, lean, pY);
      const p = handPosition(side, lean, pY, sol.arm, sol.fore);
      expect(p.distanceTo(new THREE.Vector3(target.x, target.y, target.z)), JSON.stringify(target)).toBeLessThan(0.02);
      expect([...sol.arm, sol.fore].every(Number.isFinite)).toBe(true);
    }
  });
  it('reaches the tool bag handles with the torso turned and bent toward it', () => {
    const [lean, yaw, roll] = [0.52, -0.2, 0.6];
    const target = { x: BAG_LOCAL.x, y: 0.42, z: BAG_LOCAL.z };
    const sol = armIK(-1, target, lean, KNEEL.pelvisY, 1, yaw, roll);
    const p = handPosition(-1, lean, KNEEL.pelvisY, sol.arm, sol.fore, yaw, roll);
    expect(p.distanceTo(new THREE.Vector3(target.x, target.y, target.z))).toBeLessThan(0.03);
  });
  it('stays finite and bends the elbow forward for out-of-reach targets', () => {
    const sol = armIK(1, { x: 0, y: 0.6, z: 3 }, 0.4, 0.53);
    expect([...sol.arm, sol.fore].every(Number.isFinite)).toBe(true);
    expect(sol.fore).toBeLessThanOrEqual(0);
  });
});

describe('technician kneeling contact', () => {
  /** World height of a point down a leg chain: hip at (side 0.1, pelvis - 0.05), thigh 0.45 to the knee, shin 0.42 to the ankle. */
  const leg = (thigh: [number, number, number], shin: number) => {
    const hip = new THREE.Object3D();
    hip.position.set(0, KNEEL.pelvisY - 0.05, 0);
    hip.rotation.set(...thigh);
    const knee = new THREE.Object3D();
    knee.position.set(0, -0.45, 0);
    knee.rotation.set(shin, 0, 0);
    const ankle = new THREE.Object3D();
    ankle.position.set(0, -0.42, 0);
    hip.add(knee);
    knee.add(ankle);
    hip.updateMatrixWorld(true);
    return { knee: knee.getWorldPosition(new THREE.Vector3()), ankle: ankle.getWorldPosition(new THREE.Vector3()) };
  };
  it('rests the kneeling knee on the ground, tucks the rear toes and plants the front boot', () => {
    const rear = leg(KNEEL.legR, KNEEL.shinR);
    // Knee pad (shin radius ~7 cm) touching the ground, not sunk into it or floating.
    expect(rear.knee.y).toBeGreaterThan(0.055);
    expect(rear.knee.y).toBeLessThan(0.09);
    // Rear ankle raised for tucked toes, behind the knee.
    expect(rear.ankle.y).toBeGreaterThan(0.12);
    expect(rear.ankle.y).toBeLessThan(0.2);
    expect(rear.ankle.z).toBeLessThan(rear.knee.z);
    const front = leg(KNEEL.legL, KNEEL.shinL);
    // Front ankle at standing height (3 cm): the boot sole is on the ground.
    expect(Math.abs(front.ankle.y - 0.03)).toBeLessThan(0.012);
    expect(front.ankle.z).toBeGreaterThan(0.3);
  });
});

describe('HQ operations clearances', () => {
  type R = { x0: number; x1: number; z0: number; z1: number };
  const rect = (p: { x: number; z: number; w: number; d: number }): R => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 });
  const overlap = (a: R, b: R) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
  const solids = HQ_OPERATIONS_SOLIDS.map(rect);

  it('keeps every fleet stall (all eight, 9 x 4 m with a van) and the route corridor free', () => {
    for (const st of hqParkingStalls(8)) {
      const stall = rect({ x: st.pos.x - HQ_LOT.center.x, z: st.pos.z - HQ_LOT.center.z, w: 9.4, d: 4.4 });
      for (const s of solids) expect(overlap(s, stall)).toBe(false);
    }
    const corridor: R = { x0: -60, x1: -26, z0: -32, z1: 2 };
    for (const s of solids) expect(overlap(s, corridor)).toBe(false);
  });

  it('keeps bay door openings and parked cars clear', () => {
    const doorFace = HQ.bays.x - HQ.bays.w / 2;
    for (const z of HQ.bayDoorZ) {
      const lane = rect({ x: doorFace - 7, z, w: 14, d: HQ.bayDoorW + 0.4 });
      for (const s of solids) expect(overlap(s, lane)).toBe(false);
    }
    const cars = [...HQ_VISITOR_CARS.map((c) => ({ x: c.x, z: c.z, w: 2.0, d: 4.6 })), ...HQ_STAFF_ROW.map((c) => ({ x: c.x, z: c.z, w: 2.0, d: 4.6 }))].map(rect);
    for (const c of cars) for (const s of solids) expect(overlap(s, c)).toBe(false);
  });

  it('shows visitors by business hours without touching staff cars', () => {
    expect(parkedCarSpots(3, true).length - parkedCarSpots(3, false).length).toBe(4);
  });
});

describe('tool bag placement', () => {
  it('sets the bag down clear of both legs (bag 0.46 x 0.30 m, legs within 0.18 m of the centre line)', () => {
    // Nearest bag edge to the body, whichever way the bag is turned: centre minus half its long side.
    expect(Math.abs(BAG_LOCAL.x) - 0.23).toBeGreaterThan(0.18 + 0.1);
  });
});
