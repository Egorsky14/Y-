import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { appearanceFor, buildSkeleton, partsFor, PELVIS_Y, setBindPose, setCanonicalPose } from '@/world/characters/technicianModel';
import { RIG_BONES, RIG_MEASURES, RIG_ORDER } from '@/world/characters/rigData.generated';
import { handRotation, palmOffset, poseFingers, solveArm, solveLeg } from '@/world/characters/rigSolver';
import { bodyAt, footAt, STANCE, strideLength } from '@/world/characters/gait';
import { KNEEL } from '@/world/characters/Worker';
import { BAG_LOCAL } from '@/world/scene/serviceCall';
import { frameAt, roofPlanFor, stageTimes } from '@/world/scene/rooftopChoreo';
import { roofSpec } from '@/game/world/rooftops';

/**
 * The generation 3 technician: the real skeleton the game animates, solved the way the game solves it. No mocks: the
 * bones come from the generated rig table, and the GLB checks read the shipped file.
 */

const V = RIG_MEASURES;

function rig(pelvisY = PELVIS_Y) {
  const { root, bones } = buildSkeleton();
  setCanonicalPose(bones);
  bones.pelvis.position.y = pelvisY;
  root.updateMatrixWorld(true);
  return { root, bones };
}
const world = (o: THREE.Object3D) => {
  o.updateWorldMatrix(true, false);
  return o.getWorldPosition(new THREE.Vector3());
};

describe('rig', () => {
  it('stands on the ground at the canonical pose, with a believable adult skeleton', () => {
    const { bones } = rig();
    expect(world(bones.footL).y).toBeCloseTo(V.ankleHeight, 3);
    expect(world(bones.footR).y).toBeCloseTo(V.ankleHeight, 3);
    expect(V.height).toBe(1.8);
    // Head about one eighth of the height, hips near half, knees near a quarter, arm reaching mid-thigh.
    expect(world(bones.legL).y / V.height).toBeGreaterThan(0.48);
    expect(world(bones.legL).y / V.height).toBeLessThan(0.56);
    expect(world(bones.shinL).y / V.height).toBeGreaterThan(0.24);
    expect(world(bones.shinL).y / V.height).toBeLessThan(0.31);
    const headAndNeck = V.height - world(bones.neck).y;
    expect(headAndNeck / V.height).toBeGreaterThan(0.13);
    expect(headAndNeck / V.height).toBeLessThan(0.2);
    const shoulders = world(bones.armR).x - world(bones.armL).x;
    expect(shoulders).toBeGreaterThan(0.34);
    expect(shoulders).toBeLessThan(0.46);
    const fingertip = world(bones.handL).y - V.handToPalm * 2.6;
    expect(fingertip).toBeLessThan(world(bones.legL).y);
    expect(fingertip).toBeGreaterThan(world(bones.shinL).y);
  });

  it('has a parent for every bone and more than the old rig could do: clavicles, wrists, fingers, toes', () => {
    expect(RIG_ORDER).toHaveLength(43);
    for (const name of RIG_ORDER) {
      const p = RIG_BONES[name].parent;
      if (p) expect(RIG_ORDER).toContain(p);
      expect(Math.hypot(...RIG_BONES[name].bind)).toBeCloseTo(1, 3);
    }
    for (const name of ['clavL', 'handR', 'thumb2L', 'pinky1R', 'toeL', 'neck', 'spine'] as const) expect(RIG_ORDER).toContain(name);
  });

  it('keeps every old clip joint name, so existing gameplay commands still address the rig', () => {
    for (const name of ['pelvis', 'torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR'] as const) expect(RIG_ORDER).toContain(name);
  });

  it('bends the elbow forward and the knee forward in the bind table', () => {
    // At the bind pose the hand is forward of the elbow and the knee forward of the ankle line, as the mesh is modelled.
    const { bones } = buildSkeleton();
    setBindPose(bones);
    expect(world(bones.handL).z).toBeGreaterThan(world(bones.foreL).z);
    expect(world(bones.handL).x).toBeLessThan(world(bones.foreL).x);
  });
});

const palmWorld = (bones: ReturnType<typeof rig>['bones'], side: -1 | 1) => {
  const hand = side < 0 ? bones.handL : bones.handR;
  hand.updateWorldMatrix(true, false);
  return palmOffset(side, new THREE.Vector3()).applyMatrix4(hand.matrixWorld);
};

describe('hand contact', () => {
  // Kneeling at a ground unit and standing: panel terminals, cabinet top, meter at the chest, rooftop panel brace.
  const cases: [number, number, 1 | -1, [number, number, number]][] = [
    [0.34, KNEEL.pelvisY, 1, [0.14, 0.62, 0.52]],
    [0.34, KNEEL.pelvisY, -1, [-0.2, 0.98, 0.55]],
    [0.34, KNEEL.pelvisY, -1, [-0.14, 0.84, 0.44]],
    [0.42, 0.93, 1, [0.2, 0.98, 0.6]],
    [0.1, 0.95, 1, [0.1, 1.09, 0.35]],
    [0.42, KNEEL.pelvisY, -1, [-0.2, 1.05, 0.52]],
  ];
  it('puts the palm on reachable targets within 5 mm, with or without a set hand rotation', () => {
    for (const [lean, pY, side, t] of cases) {
      for (const withRot of [false, true]) {
        const { bones } = rig(pY);
        bones.spine.rotation.x = lean * 0.42;
        bones.torso.rotation.x = lean * 0.58;
        const target = new THREE.Vector3(...t);
        const q = handRotation(side, new THREE.Vector3(0.05, -0.1, 1), new THREE.Vector3(0, -1, 0), new THREE.Quaternion());
        const short = solveArm(bones, side, target, { hand: withRot ? q : null });
        expect(short, JSON.stringify(t)).toBe(0);
        expect(palmWorld(bones, side).distanceTo(target), `${JSON.stringify(t)} rot ${withRot}`).toBeLessThan(withRot ? 0.005 : 0.08);
      }
    }
  });

  it('gives the hand the rotation asked for', () => {
    const { bones } = rig();
    const q = handRotation(1, new THREE.Vector3(0, 0.6, 0.8), new THREE.Vector3(0, -0.35, 1), new THREE.Quaternion());
    solveArm(bones, 1, new THREE.Vector3(0.17, 1.4, 0.3), { hand: q });
    bones.handR.updateWorldMatrix(true, false);
    const got = new THREE.Quaternion().setFromRotationMatrix(bones.handR.matrixWorld);
    expect(got.angleTo(q)).toBeLessThan(0.02);
  });

  it('reports the shortfall for targets out of reach and stays finite', () => {
    const { bones } = rig();
    const short = solveArm(bones, 1, new THREE.Vector3(0, 0.6, 3));
    expect(short).toBeGreaterThan(2);
    for (const n of ['armR', 'foreR'] as const) expect(Number.isFinite(bones[n].quaternion.w)).toBe(true);
    expect(bones.foreR.quaternion.x).toBeLessThanOrEqual(0);
  });

  it('reaches the tool bag handles from the knees with the torso turned toward it', () => {
    const { bones } = rig(KNEEL.pelvisY);
    bones.spine.rotation.set(0.2, -0.08, 0.22);
    bones.torso.rotation.set(0.28, -0.12, 0.27);
    const short = solveArm(bones, -1, new THREE.Vector3(BAG_LOCAL.x * 0.9, 0.34, BAG_LOCAL.z));
    expect(short).toBeLessThan(0.02);
  });

  it('closes the fingers toward the palm on either hand', () => {
    for (const side of [-1, 1] as const) {
      const { bones } = rig();
      const name = side < 0 ? 'L' : 'R';
      const tip = () => {
        const b = bones[`middle2${name}`];
        b.updateWorldMatrix(true, false);
        return new THREE.Vector3(0, -0.03, 0).applyMatrix4(b.matrixWorld);
      };
      poseFingers(bones, side, { curl: 0, thumb: 0 });
      const open = tip();
      poseFingers(bones, side, { curl: 1, thumb: 1 });
      const closed = tip();
      // With the arm hanging, the palm faces the thigh: closing moves the fingertip inward and up.
      expect((closed.x - open.x) * side).toBeLessThan(-0.004);
      expect(closed.y).toBeGreaterThan(open.y + 0.015);
    }
  });
});

describe('elbows', () => {
  it('never raises the elbow above both the shoulder and the hand (the premium cabinet brace included)', () => {
    for (const [pitch, pY] of [[0.42, KNEEL.pelvisY], [0.54, 0.93], [0.1, 0.95]] as const) {
      for (const side of [1, -1] as const) {
        for (let x = 0; x <= 0.31; x += 0.15) {
          for (let y = 0.4; y <= 1.3; y += 0.15) {
            for (let z = 0.3; z <= 0.75; z += 0.15) {
              const { bones } = rig(pY);
              bones.spine.rotation.x = pitch * 0.42;
              bones.torso.rotation.x = pitch * 0.58;
              const target = new THREE.Vector3(side * x, y + (pY - KNEEL.pelvisY) * 0.6, z);
              solveArm(bones, side, target);
              const name = side < 0 ? 'L' : 'R';
              const sh = world(bones[`arm${name}`]);
              const el = world(bones[`fore${name}`]);
              const hand = world(bones[`hand${name}`]);
              // (A hand raised close in front of the chest lets the elbow rise a little as it swings out: allowed.)
              expect(el.y, JSON.stringify({ side, x, y, z, pitch })).toBeLessThanOrEqual(Math.max(sh.y, hand.y) + 0.06);
            }
          }
        }
      }
    }
  });
});

describe('foot contact', () => {
  it('kneels with the knee on the ground, the rear toes tucked, and the front boot flat', () => {
    const { bones } = rig(KNEEL.pelvisY);
    solveLeg(bones, -1, new THREE.Vector3(KNEEL.footL.x, KNEEL.footL.y, KNEEL.footL.z));
    solveLeg(bones, 1, new THREE.Vector3(KNEEL.footR.x, KNEEL.footR.y, KNEEL.footR.z), { pitch: KNEEL.pitchR });
    // Knee (trouser radius about 7 cm) resting on the ground, not sunk into it or floating.
    const knee = world(bones.shinR);
    expect(knee.y).toBeGreaterThan(0.03);
    expect(knee.y).toBeLessThan(0.1);
    // The rear ankle sits behind the knee, the front one at standing height.
    expect(world(bones.footR).z).toBeLessThan(knee.z);
    expect(world(bones.footL).y).toBeCloseTo(V.ankleHeight, 2);
    // The front shin stands near upright.
    const fk = world(bones.shinL);
    const fa = world(bones.footL);
    expect(Math.abs(fk.z - fa.z)).toBeLessThan(0.14);
    // And the front sole is level.
    bones.footL.updateWorldMatrix(true, false);
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(bones.footL.matrixWorld);
    expect(Math.abs(fwd.y)).toBeLessThan(0.03);
  });
});

describe('gait', () => {
  it('moves a planted foot backward at exactly the walking speed, so it cannot slide', () => {
    for (const speed of [0.6, 1.15, 1.45, 2.9]) {
      const stride = strideLength(speed);
      // Frames at 60 Hz: phase advances by distance over stride, as Worker does.
      const dPhase = (speed / 60) / stride;
      for (let p = 0.02; p < STANCE - dPhase - 0.02; p += 0.05) {
        const a = footAt(p, stride);
        const b = footAt(p + dPhase, stride);
        // The root moves speed/60 forward; the foot moves that much backward in the root's frame.
        expect(a.z - b.z).toBeCloseTo(speed / 60, 5);
        expect(a.planted).toBe(1);
      }
    }
  });

  it('reaches every point of the stride within the leg, at the speeds the game walks', () => {
    for (const speed of [0.6, 1.15, 1.45]) {
      const stride = strideLength(speed);
      for (let p = 0; p < 1; p += 0.01) {
        for (const off of [0, 0.5]) {
          const f = footAt(p + off, stride);
          const m = bodyAt(p, stride);
          const hipY = PELVIS_Y - 0.012 - m.drop + RIG_BONES.legL.at[1];
          const shortfall = Math.hypot(hipY - f.y, f.z) - (V.thigh + V.shin);
          expect(shortfall, `speed ${speed} phase ${p.toFixed(2)}`).toBeLessThan(0.028);
        }
      }
    }
  });

  it('keeps the soles on or above the ground, and lifts the swing foot clear', () => {
    const stride = strideLength(1.45);
    let maxSwing = 0;
    for (let p = 0; p < 1; p += 0.005) {
      const f = footAt(p, stride);
      expect(f.y).toBeGreaterThanOrEqual(V.ankleHeight - 0.03);
      if (p > STANCE) maxSwing = Math.max(maxSwing, f.y);
    }
    expect(maxSwing).toBeGreaterThan(V.ankleHeight + 0.05);
  });
});

describe('ladder contact', () => {
  for (const lot of ['cm-plaza', 'a-n-4']) {
    it(`at ${lot}, hands and feet reach the rungs through the whole climb, up and down`, () => {
      const plan = roofPlanFor(roofSpec(lot)!, 'compact-van')!;
      for (const list of [plan.up, plan.down]) {
        const times = stageTimes(list).find((s) => s.name === 'climb')!;
        for (let i = 0; i <= 90; i++) {
          const f = frameAt(list, times.start + 0.001 + ((times.dur - 0.002) * i) / 90);
          expect(f.stage).toBe('climb');
          const g = new THREE.Object3D();
          g.position.copy(f.pos);
          g.rotation.order = 'YXZ';
          g.rotation.set(f.lean, f.heading, 0);
          g.updateMatrixWorld(true);
          const inv = g.matrixWorld.clone().invert();
          const local = (v?: THREE.Vector3) => v!.clone().applyMatrix4(inv);
          const pY = THREE.MathUtils.clamp((local(f.limbs.footL).y + local(f.limbs.footR).y) / 2 + 0.7, 0.62, PELVIS_Y);
          const { bones } = rig(pY);
          bones.pelvis.position.z = -0.02;
          bones.spine.rotation.x = 0.09 * 0.42;
          bones.torso.rotation.x = 0.09 * 0.58;
          const shortL = solveLeg(bones, -1, local(f.limbs.footL));
          const shortR = solveLeg(bones, 1, local(f.limbs.footR));
          const armL = solveArm(bones, -1, local(f.limbs.handL));
          const armR = solveArm(bones, 1, local(f.limbs.handR));
          expect(shortL + shortR, `feet at ${i}`).toBeLessThan(0.015);
          expect(armL + armR, `hands at ${i}`).toBeLessThan(0.015);
        }
      }
    });
  }
});

describe('shipped asset', () => {
  const glb = readFileSync('public/models/characters/technician-v3.glb');
  const json = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12))) as { nodes: { name?: string; mesh?: number; skin?: number }[]; meshes: { primitives: { indices?: number; attributes: Record<string, number> }[] }[]; accessors: { count: number; min?: number[]; max?: number[]; type: string }[]; skins: { joints: number[] }[]; extensionsUsed?: string[] };
  const byName = new Map<string, { tris: number; pos: { min: number[]; max: number[] } }>();
  for (const n of json.nodes) {
    if (n.mesh === undefined || !n.name) continue;
    const p = json.meshes[n.mesh].primitives[0];
    const acc = json.accessors[p.attributes.POSITION];
    byName.set(n.name, { tris: json.meshes[n.mesh].primitives.reduce((s, q) => s + json.accessors[q.indices!].count / 3, 0), pos: { min: acc.min!, max: acc.max! } });
  }
  const wornTris = (look: number, role: 'technician' | 'dispatcher', lod: 0 | 1 | 2) => {
    const parts = partsFor(appearanceFor(look), role, lod);
    const suffix = ['', '_lod1', '_lod2'][lod];
    let total = 0;
    for (const part of parts) {
      const found = [...byName.keys()].filter((k) => k.startsWith(`${part}${suffix}__`));
      // A part the budget drops at this level may be absent there, but never at the nearest level.
      if (lod === 0) expect(found.length, `${part} look ${look}`).toBeGreaterThan(0);
      for (const f of found) total += byName.get(f)!.tris;
    }
    return total;
  };

  it('is skinned to the rig, every joint named, and compressed', () => {
    expect(json.skins.length).toBeGreaterThan(0);
    const names = new Set(json.skins[0].joints.map((j) => json.nodes[j].name));
    for (const b of RIG_ORDER) expect(names.has(b), b).toBe(true);
    expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
    for (const n of json.nodes) if (n.mesh !== undefined) expect(n.skin, n.name).toBeDefined();
  });

  it('has every part each appearance wears, inside each level of detail budget', () => {
    for (let look = 0; look < 4096; look += 37) {
      for (const role of ['technician', 'dispatcher'] as const) {
        expect(wornTris(look, role, 0), `near ${look}`).toBeLessThan(19_000);
        expect(wornTris(look, role, 0), `near ${look}`).toBeGreaterThan(11_000);
        expect(wornTris(look, role, 1), `mid ${look}`).toBeLessThan(6_500);
        expect(wornTris(look, role, 2), `far ${look}`).toBeLessThan(1_300);
      }
    }
  });

  it('keeps the figure at a human size: bounds of the near meshes sit between the soles and the cap', () => {
    for (const [name, v] of byName) {
      expect(v.pos.min[1], name).toBeGreaterThan(-0.02);
      expect(v.pos.max[1], name).toBeLessThan(1.86);
      expect(Math.abs(v.pos.min[0]), name).toBeLessThan(0.75);
      expect(Math.abs(v.pos.max[0]), name).toBeLessThan(0.75);
    }
  });

  it('gives employees stable and varied looks', () => {
    expect(appearanceFor(1234)).toEqual(appearanceFor(1234));
    const seen = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(appearanceFor(i * 977 + 13))));
    expect(seen.size).toBeGreaterThan(30);
    expect(new Set(Array.from({ length: 200 }, (_, i) => appearanceFor(i * 977 + 13).face)).size).toBe(6);
  });
});
