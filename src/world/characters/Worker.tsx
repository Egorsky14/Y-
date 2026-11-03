import { useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { EmployeeRole } from '@/game/employees/roles';
import { useApp } from '@/app/store';
import { PALETTE } from '../assets/palette';
import { appearanceFor, buildCharacter, CHARACTER_URL, PELVIS_Y, type BoneName, type Lod } from './technicianModel';
import { RIG_BONES, RIG_MEASURES } from './rigData.generated';
import { handRotation, poseFingers, solveArm, solveLeg, type FingerPose } from './rigSolver';
import { bodyAt, footAt, strideLength } from './gait';
import { reachPosture } from './reachPosture';

useGLTF.preload(CHARACTER_URL);

declare global {
  interface Window {
    /** Test hook: when set, each character records the furthest any hand or foot fell short of its target (m). */
    __egoContact?: Record<string, number>;
    /** Test hook: when set, characters add their CPU time here (performance benchmark). */
    __egoCharCost?: { ms: number };
  }
}

export type WorkerAnim = 'idle' | 'walk' | 'carry' | 'inspect' | 'stand-inspect' | 'repair' | 'install' | 'train' | 'celebrate' | 'ladder-carry' | 'reach' | 'raise' | 'pull' | 'climb' | 'step-over';

/**
 * Per-frame targets for the ladder and rooftop clips (rooftopChoreo.ts), in the character's own frame (metres,
 * +z forward, as the work props): hands and feet for IK, the walking pace of the legs, how far through a
 * stage the character is, and the foot pitch that keeps the soles level on a leaning ladder.
 */
export interface WorkerMotion {
  handL?: THREE.Vector3;
  handR?: THREE.Vector3;
  footL?: THREE.Vector3;
  footR?: THREE.Vector3;
  pace: number;
  u: number;
  footPitch: number;
}

interface WorkerProps {
  role: EmployeeRole;
  look: number;
  anim: WorkerAnim;
  scale?: number;
  /** How fast the game runs for this character's work clips; 0 freezes them (game paused). Walking follows real ground speed. */
  pace?: number;
  /** At a unit: distance from the character root to the cabinet's service face, the cabinet height (m), and where the tool bag sits in the character's frame (lead technician only). */
  work?: { face: number; top: number; bag?: { x: number; z: number } };
  /** Ladder and rooftop clips read their targets from here every frame. */
  motion?: { current: WorkerMotion | null };
}

/**
 * Clamp meter in the left hand's frame: a yellow-and-graphite body with the jaw arc on top, the
 * display, rotary dial and buttons on the face, and the test-lead sockets at the bottom (where the
 * leads attach, LEAD_SOCKET).
 */
const METER = {
  body: (() => {
    const sh = new THREE.Shape();
    const w = 0.04;
    const h = 0.095;
    const r = 0.012;
    sh.moveTo(-w + r, -h);
    sh.lineTo(w - r, -h);
    sh.quadraticCurveTo(w, -h, w, -h + r);
    sh.lineTo(w * 0.86, h - r);
    sh.quadraticCurveTo(w * 0.86, h, w * 0.86 - r, h);
    sh.lineTo(-w * 0.86 + r, h);
    sh.quadraticCurveTo(-w * 0.86, h, -w * 0.86, h - r);
    sh.lineTo(-w, -h + r);
    sh.quadraticCurveTo(-w, -h, -w + r, -h);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.032, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -0.016);
    return g;
  })(),
  face: new THREE.BoxGeometry(0.062, 0.15, 0.004),
  jaw: new THREE.TorusGeometry(0.036, 0.0095, 8, 20, Math.PI * 1.7).rotateZ(Math.PI * 0.65),
  dial: new THREE.CylinderGeometry(0.016, 0.017, 0.008, 16).rotateX(Math.PI / 2),
  screen: new THREE.BoxGeometry(0.046, 0.032, 0.003),
  button: new THREE.BoxGeometry(0.011, 0.007, 0.004),
};
/** Meter-frame position of the lead sockets (bottom of the body). */
const LEAD_SOCKET = new THREE.Vector3(0, -0.1, 0.0);

/** Adjustable wrench in the right hand's frame: tapered handle, open jaw and knurled worm. */
const WRENCH = {
  handle: (() => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.011, -0.13);
    sh.quadraticCurveTo(0, -0.142, 0.011, -0.13);
    sh.lineTo(0.015, 0.1);
    sh.lineTo(-0.015, 0.1);
    sh.lineTo(-0.011, -0.13);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
    g.translate(0, 0, -0.005);
    return g;
  })(),
  head: new THREE.TorusGeometry(0.03, 0.012, 6, 14, Math.PI * 1.4).rotateZ(-Math.PI * 0.2),
  worm: new THREE.CylinderGeometry(0.007, 0.007, 0.03, 10).rotateZ(Math.PI / 2),
};

const mat = (color: string, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

interface LeadsHandle {
  update: (socket: THREE.Vector3, probeEnd: THREE.Vector3, clip: THREE.Vector3) => void;
  hide: () => void;
}

const LEAD_SEGMENTS = 14;
const LEAD_GEO = new THREE.CylinderGeometry(0.0042, 0.0042, 1, 5, 1, true);
const LEAD_RED = new THREE.MeshStandardMaterial({ color: '#c4262e', roughness: 0.55 });
const LEAD_BLACK = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.55 });

/**
 * The clamp meter's test leads, in the worker's root frame: red from the meter's sockets to the
 * probe in the other hand, black to an alligator clip on the cabinet's panel edge. Each lead sags
 * as a cable would (quadratic curve dropped by slack), drawn as instanced segments and recomputed
 * every frame while probing, so meter, probe and unit stay physically connected as the hands move.
 */
function TestLeads({ ref }: { ref: React.Ref<LeadsHandle> }) {
  const red = useRef<THREE.InstancedMesh>(null);
  const black = useRef<THREE.InstancedMesh>(null);
  const clip = useRef<THREE.Group>(null);
  useImperativeHandle(ref, () => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const draw = (mesh: THREE.InstancedMesh, a: THREE.Vector3, b: THREE.Vector3) => {
      const span = a.distanceTo(b);
      const ctrl = a.clone().add(b).multiplyScalar(0.5);
      ctrl.y -= 0.05 + span * 0.45;
      const at = (t: number, out: THREE.Vector3) => {
        const u = 1 - t;
        return out.set(u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x, Math.max(0.012, u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y), u * u * a.z + 2 * u * t * ctrl.z + t * t * b.z);
      };
      for (let i = 0; i < LEAD_SEGMENTS; i++) {
        at(i / LEAD_SEGMENTS, p0);
        at((i + 1) / LEAD_SEGMENTS, p1);
        dir.subVectors(p1, p0);
        const len = dir.length();
        q.setFromUnitVectors(up, dir.divideScalar(Math.max(len, 1e-6)));
        mid.addVectors(p0, p1).multiplyScalar(0.5);
        m.compose(mid, q, sc.set(1, len * 1.02, 1));
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = true;
    };
    return {
      update: (socket, probeEnd, clipAt) => {
        if (red.current) draw(red.current, socket, probeEnd);
        if (black.current) draw(black.current, socket.clone().add(new THREE.Vector3(0.012, 0, 0)), clipAt);
        if (clip.current) {
          clip.current.position.copy(clipAt);
          clip.current.visible = true;
        }
      },
      hide: () => {
        if (red.current) red.current.visible = false;
        if (black.current) black.current.visible = false;
        if (clip.current) clip.current.visible = false;
      },
    };
  }, []);
  return (
    <>
      <instancedMesh ref={red} args={[LEAD_GEO, LEAD_RED, LEAD_SEGMENTS]} visible={false} frustumCulled={false} />
      <instancedMesh ref={black} args={[LEAD_GEO, LEAD_BLACK, LEAD_SEGMENTS]} visible={false} frustumCulled={false} />
      <group ref={clip} visible={false}>
        <mesh material={LEAD_BLACK}>
          <boxGeometry args={[0.014, 0.032, 0.012]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} material={LEAD_GEO_STEEL}>
          <boxGeometry args={[0.01, 0.012, 0.016]} />
        </mesh>
      </group>
    </>
  );
}
const LEAD_GEO_STEEL = new THREE.MeshStandardMaterial({ color: '#b9bfc5', roughness: 0.4, metalness: 0.7 });

/** Joint rotation targets for one pose; everything not named returns to zero. */
type Pose = Partial<Record<BoneName, [number, number, number]>>;

const V = RIG_MEASURES;
/** Where a standing foot's ankle goes (rig metres), each side of the centre line. */
const STANCE_X = 0.115;

/**
 * Kneeling at the unit (rig metres): right knee down, its toes tucked; left foot planted forward, shin upright. Both legs
 * are placed by IK from these points, so the knee and sole touch the ground whatever the proportions.
 */
export const KNEEL = {
  pelvisY: 0.506,
  /** Forward (L) foot: ankle at standing height, far enough out that the shin stands upright. */
  footL: { x: -STANCE_X - 0.01, y: V.ankleHeight, z: 0.42 },
  /** Rear (R) foot: ankle raised behind the knee, on tucked toes. */
  footR: { x: STANCE_X, y: 0.16, z: -0.405 },
  pitchR: -1.28,
  toeR: 0.85,
};

/** Beyond these distances (m) the character draws its simpler meshes; past the far one its pose also updates less often. */
const LOD_MID = 13;
const LOD_FAR = 40;
/** The game's quality setting scales those distances: lower settings drop to the simpler meshes sooner. */
const LOD_REACH = { low: 0.5, medium: 0.75, high: 1, ultra: 1.4 } as const;

const smooth01 = THREE.MathUtils.smoothstep;
/** What a hand is doing with its fingers, by clip. */
const OPEN: FingerPose = { curl: 0.16, thumb: 0.2, spread: 0.2 };
const GRIP: FingerPose = { curl: 0.82, thumb: 1 };
const PINCH: FingerPose = { curl: 0.5, thumb: 0.8 };

interface LimbState {
  /** The target last asked for, in rig metres; kept so the IK can fade out from where it was. */
  at: THREE.Vector3;
  weight: number;
  has: boolean;
  /** For hands: the hand's wanted rotation; for feet: pitch and toe bend. */
  rot: THREE.Quaternion;
  hasRot: boolean;
  pitch: number;
  toe: number;
}
const newLimb = (): LimbState => ({ at: new THREE.Vector3(), weight: 0, has: false, rot: new THREE.Quaternion(), hasRot: false, pitch: 0, toe: 0 });

const T_DIR = { f: new THREE.Vector3(), p: new THREE.Vector3(), a: new THREE.Vector3() };

/**
 * A technician: the Blender-authored character (technicianModel.ts) driven by clips per job state. Each clip names joint
 * rotations and places hands and feet; rotations are blended across state changes; the placed limbs are then solved
 * exactly on the blended body (rigSolver.ts), so what touches something stays on it. Walking is measured in ground
 * covered (gait.ts): a planted foot cannot slide at any game speed.
 */
export function Worker({ role, look, anim, scale = 1, pace = 1, work, motion }: WorkerProps) {
  const root = useRef<THREE.Group>(null);
  const { scene: characterScene } = useGLTF(CHARACTER_URL);
  const appearance = useMemo(() => appearanceFor(look), [look]);
  const character = useMemo(() => buildCharacter(characterScene, appearance, role), [characterScene, appearance, role]);
  const bag = useRef<THREE.Group>(null);
  const meter = useRef<THREE.Group>(null);
  const wrench = useRef<THREE.Group>(null);
  const tablet = useRef<THREE.Group>(null);
  const load = useRef<THREE.Group>(null);
  const phase = ((look % 100) / 100) * Math.PI * 2;
  const build = appearance.height;
  const lod = useRef({ level: 0 as Lod, skipped: 0, skippedDt: 0 });
  const body = useRef({ y: PELVIS_Y, z: RIG_BONES.pelvis.at[2], x: 0 });
  const clockT = useRef(0);
  const lastAnim = useRef<WorkerAnim | null>(null);
  const probe = useRef<THREE.Group>(null);
  const anchors = { socket: useRef<THREE.Group>(null), probeEnd: useRef<THREE.Group>(null) };
  const leads = useRef<LeadsHandle>(null);
  const blend = useRef<Partial<Record<BoneName, THREE.Quaternion>>>({});
  const gait = useRef({ phase: (look % 100) / 100, moving: 0, speed: 0, last: new THREE.Vector3(), seen: false, toeL: 0, toeR: 0 });
  const limbs = useRef({ handL: newLimb(), handR: newLimb(), footL: newLimb(), footR: newLimb() });
  const fingers = useRef({ L: { ...OPEN }, R: { ...OPEN } });

  const materials = useMemo(
    () => ({
      teal: new THREE.MeshStandardMaterial({ color: PALETTE.egoTeal, emissive: PALETTE.egoTeal, emissiveIntensity: 0.2, roughness: 0.7 }),
      tool: mat('#f2c230', 0.6),
      steel: mat('#b9bfc5', 0.4, 0.7),
      dark: mat('#1d1f22', 0.7),
      white: mat('#f4f5f7', 0.7),
      probe: mat('#c4262e', 0.5),
      screen: new THREE.MeshStandardMaterial({ color: '#8fd9ff', emissive: '#4fb3ff', emissiveIntensity: 0.6, roughness: 0.3 }),
    }),
    [],
  );

  const tick = (camera: THREE.Camera, frameDt: number) => {
    // Level of detail: simpler meshes with distance; far away or off screen, the pose updates on every fourth frame with
    // the time summed, so clips stay in step but cost a quarter. The hands are only posed when they can be seen.
    const L = lod.current;
    const rootNow = root.current;
    let cheap = false;
    if (rootNow) {
      const p = rootNow.getWorldPosition(LOD_POS);
      const dist = camera.position.distanceTo(p);
      const reach = LOD_REACH[useApp.getState().settings.quality];
      const level: Lod = dist > LOD_FAR * reach ? 2 : dist > LOD_MID * reach ? 1 : 0;
      if (level !== L.level) {
        L.level = level;
        character.lods.forEach((m, i) => (m.visible = i === level));
      }
      LOD_FRUSTUM.setFromProjectionMatrix(LOD_MATRIX.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      cheap = level === 2 || !LOD_FRUSTUM.intersectsSphere(LOD_SPHERE.set(p.setY(p.y + 0.9), 1.3));
    }
    if (cheap && ++L.skipped % 4 !== 0) {
      L.skippedDt += frameDt;
      return;
    }
    const dt = frameDt + L.skippedDt;
    L.skippedDt = 0;
    // Clip time follows the game: paused games freeze the crew, fast-forward brisks them up (capped so loops never look
    // frantic). Joint blending still settles in real time.
    const workPace = Math.min(pace, 1.5);
    if (lastAnim.current !== anim) {
      lastAnim.current = anim;
      clockT.current = 0;
    }
    clockT.current += dt * workPace;
    const t = clockT.current + (anim === 'inspect' || anim === 'repair' ? 0 : phase);
    const r = character.bones;
    const pose: Pose = {};
    const set = (name: BoneName, x: number, y = 0, z = 0) => {
      pose[name] = [x, y, z];
    };
    let pelvisY = PELVIS_Y;
    let pelvisZ: number = RIG_BONES.pelvis.at[2];
    let pelvisX = 0;
    let showBag = false;
    let showMeter = false;
    let showProbe = false;
    let showWrench = false;
    let showTablet = false;
    let showLoad = false;
    let blendRate = 7;
    let gripL: FingerPose = OPEN;
    let gripR: FingerPose = OPEN;
    const s = scale * build;
    const want = limbs.current;
    want.handL.has = want.handR.has = want.footL.has = want.footR.has = false;
    want.handL.hasRot = want.handR.hasRot = false;

    /** Places a hand: its palm at a point in the character's frame, optionally with the way fingers and palm point. */
    const hand = (side: 1 | -1, x: number, y: number, z: number, fingerDir?: [number, number, number], palmDir?: [number, number, number]) => {
      const h = side < 0 ? want.handL : want.handR;
      h.at.set(x / s, y / s, z / s);
      h.has = true;
      if (fingerDir && palmDir) {
        handRotation(side, T_DIR.f.fromArray(fingerDir), T_DIR.p.fromArray(palmDir), h.rot);
        h.hasRot = true;
      }
    };
    /** Places a foot: ankle in rig metres, sole pitch (toe up positive) and bend at the ball. */
    const foot = (side: 1 | -1, x: number, y: number, z: number, pitch = 0, toe = 0) => {
      const f = side < 0 ? want.footL : want.footR;
      f.at.set(x, y, z);
      f.has = true;
      f.pitch = pitch;
      f.toe = toe;
    };
    const look3 = (x: number, y: number, z: number, torsoPitch: number, pY: number, twist = 0) => {
      const hy = pY + 0.64 * Math.cos(torsoPitch);
      const hz = 0.64 * Math.sin(torsoPitch) + pelvisZ;
      const dy = y / s - hy;
      const dz = z / s - hz;
      const pitch = THREE.MathUtils.clamp(Math.atan2(-dy, Math.max(0.05, Math.hypot(dz, x / s))) - torsoPitch, -0.5, 0.95);
      set('head', pitch, THREE.MathUtils.clamp(Math.atan2(x / s, dz) - twist, -0.9, 0.9));
    };
    /** Feet planted a little apart, knees soft; returns the pelvis height. */
    const stand = (bend = 0, shift = 0) => {
      foot(-1, -STANCE_X, V.ankleHeight, 0.015);
      foot(1, STANCE_X, V.ankleHeight, -0.012);
      pelvisX = shift;
      return PELVIS_Y - 0.012 - bend * 0.16;
    };
    /** The kneeling stance blended toward standing by `up` (0 kneeling, 1 standing). */
    const kneelToStand = (up: number, bend: number) => {
      const standY = PELVIS_Y - 0.012 - bend * 0.16;
      const k = THREE.MathUtils.smootherstep(up, 0, 1);
      // Rising, the rear foot comes through under him first.
      foot(-1, THREE.MathUtils.lerp(KNEEL.footL.x, -STANCE_X, k), V.ankleHeight, THREE.MathUtils.lerp(KNEEL.footL.z, 0.015, k));
      foot(1, THREE.MathUtils.lerp(KNEEL.footR.x, STANCE_X, k), THREE.MathUtils.lerp(KNEEL.footR.y, V.ankleHeight, k), THREE.MathUtils.lerp(KNEEL.footR.z, -0.012, k), KNEEL.pitchR * (1 - k), KNEEL.toeR * (1 - k));
      pelvisY = THREE.MathUtils.lerp(KNEEL.pelvisY, standY, k);
      return k;
    };
    const face = work?.face ?? 0.56; // root to the cabinet's service face (m)
    const top = work?.top ?? 0.96; // cabinet height
    // Where a kneeling technician braces the free hand: on the top of a ground condenser, flat on the service panel of a
    // taller cabinet (a rooftop unit's top is out of reach from the knees).
    const brace = (out: number) => (top > 1.2 ? { y: 1.05, z: face - 0.03 } : { y: top + 0.02, z: face + out });
    const win = (u: number, a: number, b: number, fade = 0.5) => smooth01(u, a - fade, a) * (1 - smooth01(u, b, b + fade));
    const bump01 = (u: number, a: number, b: number) => (u <= a || u >= b ? 0 : Math.sin(((u - a) / (b - a)) * Math.PI));

    // How fast the character's root is really crossing the ground.
    const G = gait.current;
    if (rootNow) {
      const here = rootNow.getWorldPosition(LOD_POS);
      const moved = G.seen && dt > 0 ? Math.hypot(here.x - G.last.x, here.z - G.last.z) : 0;
      G.last.copy(here);
      G.seen = true;
      const v = dt > 1e-4 ? Math.min(7, moved / dt) : 0;
      // A paused game holds him mid-stride: standing still because nothing moves is not the same as stopping.
      if (pace > 0) G.speed += (v - G.speed) * Math.min(1, dt * 14);
    }
    /** Legs and hips for walking at the root's real speed, eased from a stand by how much he is moving. */
    const walkLegs = (carryLoad = 0): { swing: number; size: number } => {
      const speed = G.speed;
      const stride = strideLength(Math.max(0.6, speed));
      if (pace > 0) {
        G.phase = (G.phase + (speed * dt) / stride) % 1;
        G.moving += (smooth01(speed, 0.08, 0.5) - G.moving) * Math.min(1, dt * 9);
      }
      const k = G.moving;
      const fL = footAt(G.phase, stride);
      const fR = footAt(G.phase + 0.5, stride);
      const mix = (a: number, b: number) => a + (b - a) * k;
      const lx = -STANCE_X + 0.012 * k;
      const rx = STANCE_X - 0.012 * k;
      foot(-1, lx, mix(V.ankleHeight, fL.y), mix(0.015, fL.z), fL.pitch * k, fL.toe * k);
      foot(1, rx, mix(V.ankleHeight, fR.y), mix(-0.012, fR.z), fR.pitch * k, fR.toe * k);
      const m = bodyAt(G.phase, stride);
      pelvisY = PELVIS_Y - 0.012 - m.drop * k;
      pelvisX = m.shift * k;
      set('pelvis', 0.03 * k, m.yaw * k * 0.8, m.roll * k);
      // Shoulders counter the hips; he leans into the walk, more under load.
      set('torso', (0.045 + 0.05 * carryLoad) * k + 0.01 * Math.sin(G.phase * Math.PI * 4), -m.yaw * k * 1.5, -m.roll * k * 1.2);
      set('head', -0.05 * k, m.yaw * k * 0.5);
      return { swing: m.swing * k, size: Math.min(1, stride / 1.3) };
    };
    /** Arms hanging, swung opposite the legs; the elbow bends more going forward. */
    const swingArm = (side: 1 | -1, swing: number, amp: number) => {
      const fwd = -side * swing; // positive carries that arm forward (the L arm goes back as the L foot leads).
      const name = side < 0 ? 'L' : 'R';
      set(`arm${name}` as BoneName, -fwd * amp + 0.03, 0, side * 0.09);
      set(`fore${name}` as BoneName, -0.26 - Math.max(0, fwd) * 0.38);
    };

    switch (anim) {
      case 'walk':
      case 'carry': {
        const { swing, size } = walkLegs(anim === 'carry' ? 0.4 : 0);
        swingArm(1, swing, 0.34 * size);
        if (anim === 'carry') {
          // The bag's weight straightens that arm and takes the swing out of it.
          set('armL', 0.04 + swing * 0.05, 0, -0.14);
          set('foreL', -0.08);
          set('handL', 0, 0, -0.05);
          gripL = GRIP;
          showBag = true;
        } else swingArm(-1, swing, 0.34 * size);
        break;
      }
      case 'inspect': {
        // Diagnosis, a 12 s loop: look the unit over, kneel at the service panel and take readings with the meter (probe
        // on the terminals, meter in the other hand), then rise and read the gauges hung on the cabinet, and kneel again.
        const u = (t * 0.083) % 1;
        const reading = win(u, 0.68, 0.9, 0.06);
        const survey = 1 - smooth01(u, 0.0, 0.08);
        const up = Math.max(reading, survey);
        kneelToStand(up, 0.12);
        pelvisZ = 0.007 - 0.09 * up;
        const lean = 0.34 * (1 - up) + 0.42 * up;
        set('torso', lean, 0.05 * (1 - up));
        showMeter = true;
        gripL = PINCH;
        if (up < 0.5) {
          // Probing: tool hand on the panel terminals (small careful moves), meter held up in the other hand.
          const jitter = Math.sin(t * 2.3) * 0.022;
          hand(1, 0.13 + jitter, 0.62 + up * 0.5 + Math.sin(t * 1.7) * 0.025, face - 0.035 - up * 0.1, [0.05, -0.15, 1], [-1, -0.2, 0]);
          hand(-1, -0.14, 0.84, 0.44, [0.35, 0.1, 1], [0.2, 1, -0.1]);
          showProbe = true;
          gripR = PINCH;
          if (Math.sin(t * 0.9) > 0.35) look3(-0.12, 0.85, 0.45, lean, pelvisY);
          else look3(0.14, 0.6, face + 0.05, lean, pelvisY);
        } else {
          // Reading the gauges on the cabinet top; one hand rests on the cabinet edge.
          hand(1, 0.2, top + 0.015, Math.min(face + 0.07, 0.62), [0.05, -0.1, 1], [0, -1, 0]);
          hand(-1, -0.16, 1.02, 0.34, [0.35, 0.1, 1], [0.2, 1, -0.1]);
          look3(0.0, top + 0.1, face + 0.1, lean, pelvisY);
        }
        break;
      }
      case 'repair': {
        // Repair, a 14 s loop: kneel and work in the panel with the wrench (forearm turning, the free hand braced on the
        // cabinet), reach down for a part from the bag, work again, then rise and lean over the fan guard to check the unit.
        const u = (t * 0.0714) % 1;
        const fetch = win(u, 0.4, 0.5, 0.04);
        const check = win(u, 0.84, 0.97, 0.05);
        kneelToStand(check, 0.18);
        pelvisZ = 0.007 - 0.1 * check;
        const toolBag = work?.bag;
        const lean = 0.38 + 0.14 * check + (toolBag ? 0.1 : -0.1) * fetch;
        const twist = toolBag ? -0.2 * fetch : 0.55 * fetch;
        const roll = toolBag ? 0.5 * fetch : 0;
        set('torso', lean, twist, roll);
        if (check > 0.5) {
          hand(1, 0.25, top + 0.015, Math.min(face + 0.2, 0.68), [0.05, -0.1, 1], [0, -1, 0]);
          hand(-1, -0.25, top + 0.015, Math.min(face + 0.2, 0.68), [-0.05, -0.1, 1], [0, -1, 0]);
          look3(0, top, face + 0.45, lean, pelvisY);
        } else if (fetch > 0.5 && toolBag) {
          // Into the tool bag set down beside the hip: hand to the handles, the other hand on the thigh.
          hand(-1, toolBag.x * 0.9, 0.34, toolBag.z, [0, -1, 0.1], [1, 0, 0]);
          hand(1, 0.15, 0.56, 0.36, [0, -0.6, 1], [0, -1, 0]);
          gripL = GRIP;
          look3(toolBag.x, 0.3, toolBag.z, lean, pelvisY, twist);
        } else if (fetch > 0.5) {
          // Crew without the bag: reach down beside the knee.
          hand(1, 0.44, 0.14, 0.2, [0, -1, 0.2], [-1, 0, 0]);
          hand(-1, -0.2, brace(0.1).y, brace(0.1).z);
          look3(0.5, 0.1, 0.25, lean, pelvisY, twist);
        } else {
          // Wrench turns: small arcs at the valve or terminal, the wrist rolling with each pull. The hand stops short of
          // the panel; the wrench's head reaches it.
          const pull = Math.sin(t * 3.2);
          const a = pull * 0.35;
          hand(1, 0.11 + pull * 0.028, 0.56 + pull * 0.03, face - 0.17, [Math.sin(a) * 0.9, 0.15, 0.4], [-Math.cos(a), Math.sin(a) * 0.6, 0]);
          // On a tall cabinet the palm lies flat on the panel, fingers up; on a low one it rests on top, fingers forward.
          if (top > 1.2) hand(-1, -0.2, brace(0.12).y, brace(0.12).z, [0.12, 1, 0.02], [0, 0, 1]);
          else hand(-1, -0.2, brace(0.12).y, brace(0.12).z, [0.05, -0.1, 1], [0, -1, 0]);
          showWrench = true;
          gripR = GRIP;
          look3(0.08, 0.52, face + 0.05, lean, pelvisY);
        }
        break;
      }
      case 'stand-inspect': {
        // Waiting on a decision: tablet in the left hand, the right hand on its edge, glancing between it and the unit.
        pelvisY = stand(0.04);
        set('torso', 0.1);
        hand(-1, -0.075, 1.08, 0.36, [0.45, 0.1, 1], [0.1, 1, -0.2]);
        hand(1, 0.1, 1.09, 0.35, [-0.5, 0.2, 1], [-0.1, 0.9, 0.1]);
        if (Math.sin(t * 0.5) > 0.6) look3(0, 0.6, face + 0.4, 0.1, pelvisY);
        else set('head', 0.5, 0.02);
        showTablet = true;
        gripL = PINCH;
        gripR = PINCH;
        break;
      }
      case 'install': {
        // Lifting a boxed unit: knees and back working together, hands on its sides.
        const k = (Math.sin(t * 1.6) + 1) / 2;
        pelvisY = stand(0, 0) - 0.3 * k;
        set('torso', 0.2 + 0.25 * k);
        const lift = 1.02 - 0.34 * k;
        hand(-1, -0.285, lift, 0.42, [0.2, 0.1, 1], [1, 0, 0]);
        hand(1, 0.285, lift, 0.42, [-0.2, 0.1, 1], [-1, 0, 0]);
        gripL = GRIP;
        gripR = GRIP;
        showLoad = true;
        break;
      }
      case 'train': {
        pelvisY = stand(0.02, 0.01);
        hand(-1, -0.075, 1.08, 0.33, [0.45, 0.1, 1], [0.1, 1, -0.2]);
        set('armR', -0.3 + Math.sin(t * 1.8) * 0.15, 0, 0.08);
        set('foreR', -0.8);
        set('head', 0.2);
        showTablet = true;
        gripL = PINCH;
        break;
      }
      case 'celebrate': {
        const k = Math.sin(t * 5);
        pelvisY = stand(0.06) + Math.max(0, k) * 0.03;
        set('armR', -2.75 + k * 0.2, 0, 0.3);
        set('foreR', -0.3);
        set('armL', -0.4, 0, -0.25);
        set('foreL', -1.0);
        gripR = GRIP;
        break;
      }
      case 'ladder-carry':
      case 'reach':
      case 'raise':
      case 'pull':
      case 'climb':
      case 'step-over': {
        const m = motion?.current;
        const mp = m?.pace ?? 0;
        let torsoPitch: number;
        if (anim === 'climb' && m?.footL && m.footR) {
          // On the rungs: hips over the feet, legs and arms placed on the ladder.
          pelvisY = THREE.MathUtils.clamp((m.footL.y + m.footR.y) / (2 * s) + 0.7, 0.62, PELVIS_Y);
          pelvisZ = -0.02;
          foot(-1, m.footL.x / s, m.footL.y / s, m.footL.z / s, -m.footPitch);
          foot(1, m.footR.x / s, m.footR.y / s, m.footR.z / s, -m.footPitch);
          torsoPitch = 0.09;
          set('torso', torsoPitch);
        } else if (anim === 'step-over') {
          // A high step over the parapet: one knee up, then the other, the body upright.
          const u = m?.u ?? 0;
          const kl = bump01(u, 0.02, 0.55);
          const kr = bump01(u, 0.4, 0.98);
          foot(-1, -STANCE_X, V.ankleHeight + kl * 0.36, 0.015 + kl * 0.26, 0.15 * kl);
          foot(1, STANCE_X, V.ankleHeight + kr * 0.36, -0.012 + kr * 0.26, 0.15 * kr);
          pelvisY = PELVIS_Y - 0.03 - 0.05 * Math.max(kl, kr);
          torsoPitch = 0.16;
          set('torso', torsoPitch);
        } else if (mp > 0.01) {
          // Walking with the ladder on the shoulder, or stepping while raising it.
          walkLegs(anim === 'ladder-carry' ? 1 : 0.4);
          torsoPitch = anim === 'raise' ? -0.06 : 0.05;
          // Stepping with the ladder at arm's length: he leans in to keep his hands on it.
          if (anim === 'raise') torsoPitch = reachPosture(scaled(PT_L, m?.handL, s), scaled(PT_R, m?.handR, s), pelvisY, pelvisZ, torsoPitch).pitch;
          pose.torso![0] = torsoPitch;
        } else {
          pelvisY = stand(anim === 'pull' ? 0.08 : 0.03);
          torsoPitch = anim === 'raise' || anim === 'reach' ? -0.08 : anim === 'pull' ? 0.1 : 0.04;
          // Anything low is a squat and a bent back, anything far a lean: never an arm stretched through the air.
          const body = reachPosture(scaled(PT_L, m?.handL, s), scaled(PT_R, m?.handR, s), pelvisY, pelvisZ, torsoPitch);
          pelvisY = body.pelvisY;
          pelvisZ = body.pelvisZ;
          torsoPitch = body.pitch;
          // Going down with something in his hands, the body keeps up with them.
          if (pelvisY < PELVIS_Y - 0.08) blendRate = 18;
          set('torso', torsoPitch);
        }
        if (m?.handL) {
          if (anim === 'climb') hand(-1, m.handL.x, m.handL.y, m.handL.z, [0.02, 0.62, 0.78], [0, -0.35, 1]);
          else if (anim === 'ladder-carry') hand(-1, m.handL.x, m.handL.y, m.handL.z, [0.9, 0.25, 0.2], [0, 1, 0]);
          else if (anim === 'reach') hand(-1, m.handL.x, m.handL.y, m.handL.z, [0.1, 0.25, 1], [0, 1, 0.2]);
          else hand(-1, m.handL.x, m.handL.y, m.handL.z, [0.1, 0.1, 1], [1, 0, 0]);
          gripL = GRIP;
        } else {
          set('armL', 0.05, 0, -0.09);
          set('foreL', -0.3);
        }
        if (m?.handR) {
          if (anim === 'climb') hand(1, m.handR.x, m.handR.y, m.handR.z, [-0.02, 0.62, 0.78], [0, -0.35, 1]);
          else if (anim === 'ladder-carry') hand(1, m.handR.x, m.handR.y, m.handR.z, [0.35, 0.2, 1], [0, 1, 0]);
          else if (anim === 'reach') hand(1, m.handR.x, m.handR.y, m.handR.z, [-0.1, 0.25, 1], [0, 1, 0.2]);
          else hand(1, m.handR.x, m.handR.y, m.handR.z, [-0.1, 0.1, 1], [-1, 0, 0]);
          gripR = GRIP;
        } else {
          set('armR', 0.05, 0, 0.09);
          set('foreR', -0.3);
        }
        // Eyes on the hands (or ahead).
        const hl = m?.handL;
        const hr = m?.handR;
        if (hl && hr) look3((hl.x + hr.x) / 2, (hl.y + hr.y) / 2, Math.max(0.2, (hl.z + hr.z) / 2), torsoPitch, pelvisY);
        else set('head', anim === 'climb' ? -0.25 : -0.04);
        break;
      }
      default: {
        // Idle: breathing, a slow weight shift over one foot, the head looking about, hands loose.
        const shift = Math.sin(t * 0.35);
        const breath = Math.sin(t * 1.15);
        pelvisY = stand(0.025 + Math.abs(shift) * 0.04, shift * 0.018);
        set('pelvis', 0, shift * 0.04, shift * 0.018);
        set('torso', 0.012 + breath * 0.006, -shift * 0.03, -shift * 0.02);
        set('head', 0.02, Math.sin(t * 0.4) * 0.32, shift * 0.02);
        set('armL', breath * 0.012 + 0.03, 0, -0.09);
        set('foreL', -0.26);
        set('armR', 0.06 - breath * 0.012, 0, 0.09);
        set('foreR', -0.34);
      }
    }
    // Blend every joint toward its target so state changes never pop. Rotations are slerped: blending Euler angles
    // component by component swings an arm the long way round when a solution wraps past ±π. The torso and head targets
    // are shared down the spine and neck, so bending is a curve, not a hinge at the waist.
    const k = Math.min(1, dt * blendRate);
    const cur = blend.current;
    const torso = pose.torso;
    if (torso) {
      pose.spine = [torso[0] * 0.42, torso[1] * 0.4, torso[2] * 0.45];
      pose.torso = [torso[0] * 0.58, torso[1] * 0.6, torso[2] * 0.55];
    }
    const head = pose.head;
    if (head) {
      pose.neck = [head[0] * 0.42, head[1] * 0.4, head[2] * 0.4];
      pose.head = [head[0] * 0.58, head[1] * 0.6, head[2] * 0.6];
    }
    for (const name of BODY_BONES) {
      const target = pose[name];
      const goal = target ? BLEND_Q.setFromEuler(BLEND_E.set(target[0], target[1], target[2])) : BLEND_Q.identity();
      const c = cur[name] ?? (cur[name] = goal.clone());
      c.slerp(goal, k);
      r[name].quaternion.copy(c);
    }
    const hs = body.current;
    hs.y += (pelvisY - hs.y) * k;
    hs.z += (pelvisZ - hs.z) * k;
    hs.x += (pelvisX - hs.x) * k;
    r.pelvis.position.set(hs.x, hs.y, hs.z);

    // Limbs with a target: fade the solver in and out, ease a target across a change of clip, then solve.
    const fade = Math.min(1, dt * 8);
    let worst = 0;
    const clavicle = (side: 1 | -1, h: LimbState) => {
      // A hand reaching high or far brings the shoulder blade along.
      const lift = smooth01(h.at.y, 1.2, 1.75) * h.weight;
      const fwd = smooth01(h.at.z, 0.3, 0.6) * h.weight;
      r[side < 0 ? 'clavL' : 'clavR'].quaternion.setFromEuler(BLEND_E.set(0, side * fwd * 0.22 * -1, side * lift * 0.34));
    };
    for (const [side, h] of [[-1, want.handL], [1, want.handR]] as const) {
      h.weight += ((h.has ? 1 : 0) - h.weight) * fade;
      clavicle(side, h);
      if (h.weight > 0.002) {
        const short = solveArm(r, side, h.at, { hand: h.hasRot ? h.rot : null, weight: h.weight });
        if (h.has && h.weight > 0.9) worst = Math.max(worst, short);
      }
    }
    for (const [side, f] of [[-1, want.footL], [1, want.footR]] as const) {
      f.weight += ((f.has ? 1 : 0) - f.weight) * fade;
      if (f.weight > 0.002) {
        const short = solveLeg(r, side, f.at, { pitch: f.pitch, weight: f.weight });
        if (f.has && f.weight > 0.9) worst = Math.max(worst, short);
      }
      const toeGoal = f.has ? f.toe : 0;
      // The toes stay down while the foot rolls over them, which is a bend upward at the ball.
      r[side < 0 ? 'toeL' : 'toeR'].quaternion.setFromAxisAngle(X_AXIS, -toeGoal);
    }
    // Fingers follow their clip's grip, only when near enough to see them.
    if (L.level === 0) {
      const F = fingers.current;
      const close = Math.min(1, dt * 10);
      for (const [side, goal, state] of [[-1, gripL, F.L], [1, gripR, F.R]] as const) {
        state.curl += (goal.curl - state.curl) * close;
        state.thumb += (goal.thumb - state.thumb) * close;
        state.spread = (state.spread ?? 0) + ((goal.spread ?? 0) - (state.spread ?? 0)) * close;
        poseFingers(r, side, state);
      }
    }
    if (typeof window !== 'undefined' && window.__egoContact) window.__egoContact[anim] = Math.max(window.__egoContact[anim] ?? 0, worst);
    if (bag.current) bag.current.visible = showBag;
    if (meter.current) meter.current.visible = showMeter;
    if (probe.current) probe.current.visible = showProbe;
    if (wrench.current) wrench.current.visible = showWrench;
    if (tablet.current) tablet.current.visible = showTablet;
    if (load.current) load.current.visible = showLoad;
    // Test leads while probing: red from the meter to the probe, black to a clip on the panel edge.
    const rootObj = root.current;
    if (leads.current && rootObj) {
      if (showMeter && showProbe && anchors.socket.current && anchors.probeEnd.current) {
        rootObj.updateMatrixWorld(true);
        const a = rootObj.worldToLocal(anchors.socket.current.getWorldPosition(new THREE.Vector3()));
        const b = rootObj.worldToLocal(anchors.probeEnd.current.getWorldPosition(new THREE.Vector3()));
        const clip = new THREE.Vector3(-0.2 / s, 0.55 / s, (face - 0.01) / s);
        leads.current.update(a, b, clip);
      } else leads.current.hide();
    }
  };
  useFrame(({ camera }, frameDt) => {
    const cost = window.__egoCharCost;
    if (!cost) return tick(camera, frameDt);
    const t0 = performance.now();
    tick(camera, frameDt);
    cost.ms += performance.now() - t0;
  });

  const tech = role === 'technician' || role === 'installer';
  const b = character.bones;

  return (
    <group ref={root} scale={scale * build}>
      {tech && <TestLeads ref={leads} />}
      <primitive object={character.root} />
      {createPortal(
        <>
          {/* Boxed unit carried in front of the chest during installs */}
          <group ref={load} position={[0, -0.16, 0.42]} visible={false}>
            <mesh castShadow>
              <boxGeometry args={[0.56, 0.46, 0.5]} />
              <meshStandardMaterial color="#d9cfbf" roughness={0.9} />
            </mesh>
            <mesh>
              <boxGeometry args={[0.58, 0.06, 0.08]} />
              <meshStandardMaterial color="#1d1f22" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.02, 0.251]} material={materials.teal}>
              <boxGeometry args={[0.2, 0.08, 0.005]} />
            </mesh>
          </group>
        </>,
        b.torso,
      )}
      {createPortal(
        <>
          {/* Tools sit in the hand's frame: fingers along -y, the palm facing +x on this side, the thumb forward (+z). */}
          <group ref={bag} position={[0.01, -0.2, 0]} visible={false}>
            <mesh material={materials.dark} castShadow>
              <boxGeometry args={[0.22, 0.26, 0.4]} />
            </mesh>
            <mesh position={[0, 0.16, 0]} material={materials.dark}>
              <torusGeometry args={[0.07, 0.015, 6, 12]} />
            </mesh>
            <mesh position={[0, 0.02, 0.201]} material={materials.teal}>
              <boxGeometry args={[0.14, 0.04, 0.005]} />
            </mesh>
            <mesh position={[0.08, 0.14, 0.1]} material={materials.steel}>
              <boxGeometry args={[0.02, 0.1, 0.02]} />
            </mesh>
          </group>
          {/* The meter lies in the palm with its back on it, its face toward him and its jaw past the fingertips. */}
          <group ref={meter} position={[0.03, -0.09, 0.006]} quaternion={IN_PALM_L} visible={false}>
            <mesh geometry={METER.body} material={materials.tool} castShadow />
            <mesh geometry={METER.face} position={[0, -0.005, 0.0205]} material={materials.dark} />
            <mesh geometry={METER.jaw} position={[0, 0.125, 0]} material={materials.dark} />
            <mesh geometry={METER.screen} position={[0, 0.045, 0.0232]} material={materials.screen} />
            <mesh geometry={METER.dial} position={[0, -0.01, 0.0245]} material={materials.steel} />
            {[-0.018, 0, 0.018].map((x) => (
              <mesh key={x} geometry={METER.button} position={[x, -0.055, 0.0232]} material={materials.white} />
            ))}
            <group ref={anchors.socket} position={[LEAD_SOCKET.x, LEAD_SOCKET.y, LEAD_SOCKET.z]} />
          </group>
          <group ref={tablet} position={[0.018, -0.095, 0.03]} quaternion={IN_PALM_L} visible={false}>
            <mesh material={materials.dark}>
              <boxGeometry args={[0.2, 0.26, 0.015]} />
            </mesh>
            <mesh position={[0, 0, 0.009]} material={materials.screen}>
              <boxGeometry args={[0.17, 0.22, 0.004]} />
            </mesh>
          </group>
        </>,
        b.handL,
      )}
      {createPortal(
        <>
          {/* A pen grip for the probe; the tip runs along the fingers. */}
          <group ref={probe} position={[-0.02, -0.105, 0.012]} visible={false}>
            <mesh material={materials.probe}>
              <cylinderGeometry args={[0.007, 0.009, 0.15, 8]} />
            </mesh>
            <mesh position={[0, -0.05, 0]} material={materials.probe}>
              <cylinderGeometry args={[0.013, 0.013, 0.008, 10]} />
            </mesh>
            <group ref={anchors.probeEnd} position={[0, 0.075, 0]} />
            <mesh position={[0, -0.09, 0]} material={materials.steel}>
              <cylinderGeometry args={[0.0015, 0.003, 0.04, 4]} />
            </mesh>
          </group>
          {/* The wrench's handle runs across the closed fist, its head out past the thumb. */}
          <group ref={wrench} position={[-0.028, -0.075, 0.03]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
            <mesh geometry={WRENCH.handle} material={materials.steel} castShadow />
            <mesh geometry={WRENCH.head} position={[0, 0.13, 0]} material={materials.steel} />
            <mesh geometry={WRENCH.worm} position={[0, 0.105, 0.004]} material={materials.dark} />
            <mesh position={[0, -0.04, 0]} material={materials.probe}>
              <boxGeometry args={[0.034, 0.1, 0.016]} />
            </mesh>
          </group>
        </>,
        b.handR,
      )}
    </group>
  );
}

const PT_L = new THREE.Vector3();
const PT_R = new THREE.Vector3();
/** A target in the rig's own unscaled metres (undefined stays undefined). */
const scaled = (out: THREE.Vector3, v: THREE.Vector3 | undefined, s: number) => (v ? out.copy(v).divideScalar(s) : undefined);
const BLEND_Q = new THREE.Quaternion();
const BLEND_E = new THREE.Euler();
const LOD_POS = new THREE.Vector3();
const LOD_SPHERE = new THREE.Sphere();
const LOD_FRUSTUM = new THREE.Frustum();
const LOD_MATRIX = new THREE.Matrix4();
const X_AXIS = new THREE.Vector3(1, 0, 0);
/** Every bone the clips rotate; the fingers have their own pose, and the clavicles and toes are set from what the limbs do. */
const BODY_BONES: BoneName[] = ['pelvis', 'spine', 'torso', 'neck', 'head', 'armL', 'armR', 'foreL', 'foreR', 'twistL', 'twistR', 'handL', 'handR', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR'];
/** Palm-held tools on the L hand: their face (local +z) away from the palm (+x), their top (local +y) past the fingertips. */
const IN_PALM_L = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0)));
