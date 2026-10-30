import { useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { EmployeeRole } from '@/game/employees/roles';
import { PALETTE } from '../assets/palette';
import { wordmarkTexture } from '../assets/textures';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type WorkerAnim = 'idle' | 'walk' | 'carry' | 'inspect' | 'stand-inspect' | 'repair' | 'install' | 'train' | 'celebrate';

interface WorkerProps {
  role: EmployeeRole;
  look: number;
  anim: WorkerAnim;
  scale?: number;
  /** Walk-cycle rate multiplier, matched to how fast the character covers ground (1 ≈ 1.5 m/s); 0 freezes every clip (game paused). */
  pace?: number;
  /** At a unit: distance from the character root to the cabinet's service face, the cabinet height (m), and where the tool bag sits in the character's frame (lead technician only). */
  work?: { face: number; top: number; bag?: { x: number; z: number } };
}

const SKIN = ['#f1c7a6', '#d9a57c', '#b97a52', '#8d5a3b', '#f6d7bf', '#6b4430'];
const HAIR = ['#2b1d14', '#4a2f1d', '#8a6a3c', '#1a1a1a', '#b3833f', '#5a5a5a'];
const SHIRT: Record<EmployeeRole, string> = { technician: '#1d2126', installer: '#2a2f36', dispatcher: '#f3f4f6', 'comfort-advisor': '#1b8f86' };
const PANTS: Record<EmployeeRole, string> = { technician: '#3a3f46', installer: '#4a4238', dispatcher: '#2c3340', 'comfort-advisor': '#2c3340' };

const PELVIS_Y = 0.95;

/**
 * Shared body geometry (built once for every worker): a lathed torso that tapers from chest to
 * waist and is flattened front to back, rounded hips, work boots with a rounded toe cap and a
 * lugged sole, and mitten-shaped hands. Replaces the earlier boxes, which read as blocks at the
 * close service-call camera.
 */
const lathe = (pts: [number, number][], segs = 20, depth = 0.62) => {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  g.scale(1, 1, depth);
  g.computeVertexNormals();
  return g;
};
/**
 * A gloved hand in the forearm frame (wrist at the origin, fingers toward -y, palm facing +z):
 * a broad palm with a knuckle ridge, four two-segment fingers of natural lengths fanned slightly
 * apart, and a two-segment thumb opposed across the palm. `grip` 0 is relaxed, 1 closes the hand
 * round a handle. Earlier gloves were a single mitten block, which read as a paddle up close.
 */
function buildGlove(side: -1 | 1, grip: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const seg = (from: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number) => {
    const g = new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 3, 7);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize()));
    g.translate(from.x + (dir.x * length) / 2, from.y + (dir.y * length) / 2, from.z + (dir.z * length) / 2);
    parts.push(g);
    return from.clone().addScaledVector(dir.clone().normalize(), length);
  };
  // Palm and back of the hand, with the cuff over the wrist.
  parts.push(new THREE.CapsuleGeometry(0.031, 0.04, 3, 9).scale(1.32, 1, 0.6).translate(0, -0.042, 0));
  parts.push(new THREE.CapsuleGeometry(0.011, 0.07, 2, 6).rotateZ(Math.PI / 2).translate(0, -0.07, 0.004));
  parts.push(new THREE.CylinderGeometry(0.046, 0.041, 0.045, 12).translate(0, 0.012, 0));
  // Fingers from the thumb side outward: index, middle, ring, little.
  const len = [0.05, 0.055, 0.052, 0.042];
  for (let i = 0; i < 4; i++) {
    const x = -side * (0.026 - i * 0.0175);
    const knuckle = new THREE.Vector3(x, -0.072, 0.004);
    const c1 = -(0.22 + grip * 0.95) - i * 0.03 * (1 - grip);
    const c2 = c1 - (0.25 + grip * 1.05);
    const spread = -side * (0.06 - i * 0.04) * (1 - grip);
    const d1 = new THREE.Vector3(Math.sin(spread), -Math.cos(c1), -Math.sin(c1));
    const d2 = new THREE.Vector3(Math.sin(spread), -Math.cos(c2), -Math.sin(c2));
    const mid = seg(knuckle, d1, len[i] * 0.55, 0.0092);
    seg(mid, d2, len[i] * 0.5, 0.0085);
  }
  // Thumb: from the heel of the palm, out and forward, its tip curling across the palm in a grip.
  const base = new THREE.Vector3(-side * 0.03, -0.03, 0.012);
  const t1 = new THREE.Vector3(-side * (0.55 - grip * 0.2), -0.62, 0.55 + grip * 0.15);
  const t2 = new THREE.Vector3(side * (0.15 + grip * 0.55), -0.75, 0.4 + grip * 0.25);
  seg(seg(base, t1, 0.038, 0.011), t2, 0.032, 0.0095);
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  for (const p of flat) for (const k of Object.keys(p.attributes)) if (!['position', 'normal'].includes(k)) p.deleteAttribute(k);
  return BGU.mergeGeometries(flat, false)!;
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

const GEO = {
  torso: lathe([[0.001, 0], [0.165, 0.0], [0.168, 0.1], [0.178, 0.22], [0.198, 0.36], [0.205, 0.44], [0.19, 0.5], [0.15, 0.55], [0.08, 0.58], [0.001, 0.585]]),
  hem: lathe([[0.17, 0], [0.172, 0.035]], 20, 0.64),
  hips: lathe([[0.001, -0.1], [0.12, -0.1], [0.165, -0.05], [0.17, 0.04], [0.16, 0.1], [0.001, 0.1]], 18, 0.7),
  boot: (() => {
    const g = new THREE.CapsuleGeometry(0.062, 0.17, 4, 12);
    g.rotateX(Math.PI / 2);
    g.scale(1.12, 0.95, 1);
    g.translate(0, 0.03, 0.07);
    return g;
  })(),
  sole: (() => {
    const s = new THREE.Shape();
    const w = 0.075;
    s.moveTo(-w, -0.1);
    s.lineTo(w, -0.1);
    s.quadraticCurveTo(w + 0.008, 0.16, 0, 0.255);
    s.quadraticCurveTo(-w - 0.008, 0.16, -w, -0.1);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 8 });
    g.rotateX(Math.PI / 2);
    g.translate(0, -0.005, 0);
    return g;
  })(),
  shaft: new THREE.CylinderGeometry(0.068, 0.074, 0.14, 12),
  hand: (() => {
    const g = new THREE.SphereGeometry(0.045, 12, 10);
    g.scale(0.85, 1.25, 0.6);
    return g;
  })(),
  /** Work gloves (per side): relaxed, and closed in a grip for the hand that holds a tool. */
  glove: ([-1, 1] as const).map((side) => buildGlove(side, 0)),
  gloveGrip: ([-1, 1] as const).map((side) => buildGlove(side, 1)),
  /** Cap peak: a thin, gently curved half-ellipse projecting forward from the crown's rim. */
  visor: (() => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.1, 0);
    sh.quadraticCurveTo(-0.098, 0.085, 0, 0.1);
    sh.quadraticCurveTo(0.098, 0.085, 0.1, 0);
    sh.quadraticCurveTo(0, 0.022, -0.1, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 10 });
    g.rotateX(Math.PI / 2);
    // Curve the sides down slightly, as a broken-in cap peak.
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) - pos.getX(i) * pos.getX(i) * 1.4);
    g.computeVertexNormals();
    return g;
  })(),
  cargo: new THREE.BoxGeometry(0.035, 0.13, 0.12),
  collar: new THREE.CylinderGeometry(0.07, 0.098, 0.055, 14, 1, true),
  belt: lathe([[0.176, 0], [0.18, 0.05]], 20, 0.66),
  pouch: (() => {
    const g = new THREE.CapsuleGeometry(0.045, 0.06, 3, 8);
    g.scale(1.1, 1, 0.75);
    return g;
  })(),
};
let backPrint: THREE.MeshStandardMaterial | null = null;
function backPrintMaterial(): THREE.MeshStandardMaterial {
  backPrint ??= new THREE.MeshStandardMaterial({ map: wordmarkTexture('light', false), transparent: true, alphaTest: 0.1, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  return backPrint;
}

const mat = (color: string, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function Limb({ length, radius, color, taper = 0.85 }: { length: number; radius: number; color: THREE.Material; taper?: number }) {
  // Tapered limb: a capsule with a slightly narrower lower end reads as a forearm or shin rather than a tube.
  return (
    <group>
      <mesh position={[0, -length / 2, 0]} material={color} castShadow>
        <capsuleGeometry args={[radius, length - radius * 2, 4, 12]} />
      </mesh>
      <mesh position={[0, -length + radius * 0.6, 0]} material={color} scale={[taper, 1, taper]}>
        <sphereGeometry args={[radius, 10, 8]} />
      </mesh>
    </group>
  );
}

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
type Pose = Record<string, [number, number, number]>;

/**
 * Kneeling at the unit (rig metres and radians). The kneeling (R) thigh is near vertical with the knee
 * joint 7 cm up, so the knee pad rests on the ground; that shin rises 0.25 rad toward a tucked-toe
 * ankle about 16 cm up, the boot angled down to the toes. The forward (L) shin is vertical and its
 * ankle sits at standing height (3 cm), so the boot is planted flat (src/tests/worldImmersion.test.ts).
 */
export const KNEEL = {
  pelvisY: 0.57,
  legR: [0.05, 0, -0.06] as [number, number, number],
  shinR: 1.74,
  footR: -1.2,
  legL: [-1.414, 0, 0.08] as [number, number, number],
  shinL: 1.414,
  footL: 0,
};

const UPPER_ARM = 0.3;
const FOREARM = 0.31; // elbow to the middle of the hand

/**
 * Two-bone arm IK in the character frame (+z forward, +y up, unscaled rig metres): shoulder and elbow
 * rotations that put the hand on the target, given the torso's forward lean and the pelvis height.
 * The arm hangs along -y; Euler XYZ applies the abduction (z) first, then the pitch (x), and the elbow
 * flexes about the arm's local x. Out-of-reach targets are approached along the same line.
 */
export function armIK(side: 1 | -1, target: { x: number; y: number; z: number }, torsoPitch: number, pelvisY: number, heavy = 1, torsoYaw = 0, torsoRoll = 0): { arm: [number, number, number]; fore: number } {
  // Into the torso frame: undo the torso's lean, twist and side bend (Euler XYZ about the waist pivot),
  // then measure from the shoulder.
  const local = new THREE.Vector3(target.x, target.y - (pelvisY + 0.06), target.z).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(torsoPitch, torsoYaw, torsoRoll, 'XYZ')).invert());
  const dx = local.x - side * 0.25 * heavy;
  const dy = local.y - 0.5;
  const dz = local.z;
  const len = Math.max(1e-4, Math.hypot(dx, dy, dz));
  const d = THREE.MathUtils.clamp(len, Math.abs(UPPER_ARM - FOREARM) + 0.05, UPPER_ARM + FOREARM - 0.005);
  const n = new THREE.Vector3(dx / len, dy / len, dz / len);
  const a1 = Math.acos(THREE.MathUtils.clamp((UPPER_ARM * UPPER_ARM + d * d - FOREARM * FOREARM) / (2 * UPPER_ARM * d), -1, 1));
  const flex = Math.PI - Math.acos(THREE.MathUtils.clamp((UPPER_ARM * UPPER_ARM + FOREARM * FOREARM - d * d) / (2 * UPPER_ARM * FOREARM), -1, 1));
  // The elbow sits behind and below the shoulder-to-hand line: the upper arm leans from the target
  // direction toward the back (or down, when reaching straight back).
  const pole = new THREE.Vector3(0, -0.35, -1);
  const m = pole.clone().addScaledVector(n, -pole.dot(n));
  if (m.lengthSq() < 1e-6) m.set(0, -1, 0).addScaledVector(n, n.y);
  m.normalize();
  const u = n.clone().multiplyScalar(Math.cos(a1)).addScaledVector(m, Math.sin(a1)); // shoulder → elbow
  const elbow = u.clone().multiplyScalar(UPPER_ARM);
  const fdir = n.clone().multiplyScalar(d).sub(elbow).normalize(); // elbow → hand
  // Arm frame: local -y along the upper arm, local +z the direction the forearm flexes toward.
  const yAxis = u.clone().negate();
  const zAxis = fdir.clone().addScaledVector(u, -fdir.dot(u));
  if (zAxis.lengthSq() < 1e-8) zAxis.set(0, 0, 1).addScaledVector(yAxis, -yAxis.z);
  zAxis.normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis), 'XYZ');
  return { arm: [e.x, e.y, e.z], fore: -flex };
}

/**
 * Stylized-realistic worker (~1.8 m): articulated shoulders, elbows, hips and knees driven by
 * procedural clips per job state, blended across state changes. Feet stay on the ground.
 */
export function Worker({ role, look, anim, scale = 1, pace = 1, work }: WorkerProps) {
  const root = useRef<THREE.Group>(null);
  const refs = {
    pelvis: useRef<THREE.Group>(null), torso: useRef<THREE.Group>(null), head: useRef<THREE.Group>(null),
    armL: useRef<THREE.Group>(null), armR: useRef<THREE.Group>(null), foreL: useRef<THREE.Group>(null), foreR: useRef<THREE.Group>(null),
    legL: useRef<THREE.Group>(null), legR: useRef<THREE.Group>(null), shinL: useRef<THREE.Group>(null), shinR: useRef<THREE.Group>(null),
    footL: useRef<THREE.Group>(null), footR: useRef<THREE.Group>(null),
  };
  const bag = useRef<THREE.Group>(null);
  const meter = useRef<THREE.Group>(null);
  const wrench = useRef<THREE.Group>(null);
  const tablet = useRef<THREE.Group>(null);
  const load = useRef<THREE.Group>(null);
  const phase = ((look % 100) / 100) * Math.PI * 2;
  const build = 0.94 + ((look >> 5) % 7) * 0.02; // height variation 0.94–1.06
  const heavy = 0.92 + ((look >> 2) % 5) * 0.04; // torso width variation
  const heightState = useRef({ pelvis: PELVIS_Y, root: 0, z: 0 });
  const clockT = useRef(0);
  const lastAnim = useRef<WorkerAnim | null>(null);
  const probe = useRef<THREE.Group>(null);
  const hands = { relaxedL: useRef<THREE.Mesh>(null), relaxedR: useRef<THREE.Mesh>(null), gripL: useRef<THREE.Mesh>(null), gripR: useRef<THREE.Mesh>(null) };
  const anchors = { socket: useRef<THREE.Group>(null), probeEnd: useRef<THREE.Group>(null) };
  const leads = useRef<LeadsHandle>(null);
  const blend = useRef<Pose>({});
  const stride = useRef(0);

  const materials = useMemo(
    () => ({
      skin: mat(SKIN[look % SKIN.length]),
      hair: mat(HAIR[(look >> 3) % HAIR.length], 0.9),
      shirt: mat(SHIRT[role]),
      pants: mat(PANTS[role]),
      boot: mat('#4a3423', 0.78),
      sole: mat('#18140f', 0.95),
      teal: new THREE.MeshStandardMaterial({ color: PALETTE.egoTeal, emissive: PALETTE.egoTeal, emissiveIntensity: 0.2, roughness: 0.7 }),
      belt: mat('#1c1d20', 0.85),
      leather: mat('#5b3f27', 0.75),
      buckle: mat('#c9ced3', 0.35, 0.8),
      tool: mat('#f2c230', 0.6),
      steel: mat('#b9bfc5', 0.4, 0.7),
      dark: mat('#1d1f22', 0.7),
      white: mat('#f4f5f7', 0.7),
      hiVis: new THREE.MeshStandardMaterial({ color: '#f6a21c', emissive: '#f6a21c', emissiveIntensity: 0.15, roughness: 0.8 }),
      reflective: new THREE.MeshStandardMaterial({ color: '#d8dde2', roughness: 0.3, metalness: 0.4 }),
      hat: mat(role === 'installer' ? '#f2c230' : '#15181d', 0.8),
      kneePad: mat('#23262a', 0.8),
      glove: mat('#2f3338', 0.75),
      pocket: mat(PANTS[role] === '#3a3f46' ? '#353a40' : '#40392f', 0.9),
      probe: mat('#c4262e', 0.5),
      eye: mat('#1a1511', 0.5),
      screen: new THREE.MeshStandardMaterial({ color: '#8fd9ff', emissive: '#4fb3ff', emissiveIntensity: 0.6, roughness: 0.3 }),
    }),
    [look, role],
  );

  useFrame((_, dt) => {
    // Animation time follows the game: paused games freeze the crew, fast-forward brisks them up
    // (capped so loops never look frantic). Joint blending still settles in real time.
    const workPace = Math.min(pace, 1.5);
    // Each clip's loop starts from its beginning when the state changes (diagnosis opens with the survey).
    if (lastAnim.current !== anim) {
      lastAnim.current = anim;
      clockT.current = 0;
    }
    clockT.current += dt * workPace;
    const t = clockT.current + (anim === 'inspect' || anim === 'repair' ? 0 : phase);
    const r = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, v.current])) as Record<keyof typeof refs, THREE.Group | null>;
    if (Object.values(r).some((v) => !v)) return;
    const pose: Pose = {};
    const set = (name: keyof typeof refs, x: number, y = 0, z = 0) => {
      pose[name] = [x, y, z];
    };
    let pelvisY = PELVIS_Y;
    let rootY = 0;
    let pelvisZ = 0;
    let showBag = false;
    let showMeter = false;
    let showProbe = false;
    let showWrench = false;
    let showTablet = false;
    let showLoad = false;
    const s = scale * build;
    const ik = (side: 1 | -1, x: number, y: number, z: number, torsoPitch: number, pY: number, yaw = 0, roll = 0) => {
      const sol = armIK(side, { x: x / s, y: y / s, z: z / s - pelvisZ }, torsoPitch, pY, heavy, yaw, roll);
      set(side < 0 ? 'armL' : 'armR', sol.arm[0], sol.arm[1], sol.arm[2]);
      set(side < 0 ? 'foreL' : 'foreR', sol.fore);
    };
    const look = (x: number, y: number, z: number, torsoPitch: number, pY: number, twist = 0) => {
      const hy = pY + 0.06 + 0.72 * Math.cos(torsoPitch);
      const hz = 0.72 * Math.sin(torsoPitch) + pelvisZ;
      const dy = y / s - hy;
      const dz = z / s - hz;
      const pitch = THREE.MathUtils.clamp(Math.atan2(-dy, Math.max(0.05, Math.hypot(dz, x / s))) - torsoPitch, -0.5, 0.95);
      set('head', pitch, THREE.MathUtils.clamp(Math.atan2(x / s, dz) - twist, -0.9, 0.9));
    };
    // Kneeling stance at the unit: right knee down, left foot planted forward, pelvis low.
    const kneel = () => {
      set('legR', ...KNEEL.legR);
      set('shinR', KNEEL.shinR);
      set('footR', KNEEL.footR);
      set('legL', ...KNEEL.legL);
      set('shinL', KNEEL.shinL);
      set('footL', KNEEL.footL);
      return KNEEL.pelvisY;
    };
    // Standing with soft knees, feet apart.
    const stand = (bend = 0) => {
      set('legL', -bend, 0, 0.05);
      set('legR', -bend * 0.8, 0, -0.05);
      set('shinL', bend * 1.6);
      set('shinR', bend * 1.3);
      set('footL', -bend * 0.8);
      set('footR', -bend * 0.6);
      return PELVIS_Y - bend * 0.12;
    };
    const face = work?.face ?? 0.56; // root to the cabinet's service face (m)
    const top = work?.top ?? 0.96; // cabinet height
    // Smooth 0..1 window inside a looping cycle.
    const win = (u: number, a: number, b: number, fade = 0.5) => THREE.MathUtils.smoothstep(u, a - fade, a) * (1 - THREE.MathUtils.smoothstep(u, b, b + fade));

    switch (anim) {
      case 'walk':
      case 'carry': {
        // Stride phase advances with the ground speed so the feet do not slide.
        stride.current += dt * 7.2 * pace;
        const sw = Math.sin(stride.current + phase);
        const c = Math.cos(stride.current + phase);
        set('legL', sw * 0.55 - 0.05);
        set('legR', -sw * 0.55 - 0.05);
        set('shinL', Math.max(0, -c) * 0.95 + 0.08);
        set('shinR', Math.max(0, c) * 0.95 + 0.08);
        // Heel strike then toe-off.
        set('footL', Math.max(0, sw) * 0.25 - Math.max(0, -sw) * 0.15);
        set('footR', Math.max(0, -sw) * 0.25 - Math.max(0, sw) * 0.15);
        set('armL', -sw * 0.38, 0, 0.07);
        set('foreL', -0.32 - Math.max(0, -sw) * 0.25);
        if (anim === 'carry') {
          set('armR', 0.1, 0, -0.16);
          set('foreR', -0.1);
          showBag = true;
        } else {
          set('armR', sw * 0.38, 0, -0.07);
          set('foreR', -0.32 - Math.max(0, sw) * 0.25);
        }
        // Counter-rotation of shoulders against hips, a slight forward lean, a level gaze.
        set('torso', 0.06, sw * 0.08, c * 0.02);
        set('head', -0.04, -sw * 0.06);
        rootY = Math.abs(c) * 0.03;
        break;
      }
      case 'inspect': {
        // Diagnosis, a 12 s loop: look the unit over, kneel at the service panel and take readings with
        // the meter (probes on the terminals, meter in the other hand), then rise and read the gauges
        // hung on the cabinet, and kneel again.
        const u = (t * 0.083) % 1; // 0..1 over ~12 s
        const reading = win(u, 0.68, 0.9, 0.06);
        const survey = 1 - THREE.MathUtils.smoothstep(u, 0.0, 0.08);
        const up = Math.max(reading, survey);
        // Blend between kneeling and a bent-over standing lean by mixing the two poses.
        const kY = kneel();
        const kneelPose = { ...pose };
        const sY = stand(0.12);
        const standPose = { ...pose };
        for (const k of Object.keys(kneelPose) as (keyof typeof refs)[]) {
          const a = kneelPose[k];
          const b = standPose[k] ?? [0, 0, 0];
          pose[k] = [a[0] + (b[0] - a[0]) * up, a[1] + (b[1] - a[1]) * up, a[2] + (b[2] - a[2]) * up];
        }
        pelvisY = kY + (sY - kY) * up;
        pelvisZ = -0.1 * up;
        const lean = 0.38 * (1 - up) + 0.42 * up;
        set('torso', lean, 0.05 * (1 - up));
        if (up < 0.5) {
          // Probing: tool hand on the panel terminals (small careful moves), meter held up in the other hand.
          const jitter = Math.sin(t * 2.3) * 0.025;
          ik(1, 0.14 + jitter, 0.62 + Math.sin(t * 1.7) * 0.03, face - 0.02, lean, pelvisY);
          ik(-1, -0.12, 0.85, 0.42 + pelvisZ, lean, pelvisY);
          showMeter = true;
          showProbe = true;
          // Glance between meter and terminals.
          const atMeter = Math.sin(t * 0.9) > 0.35;
          if (atMeter) look(-0.12, 0.85, 0.45, lean, pelvisY);
          else look(0.14, 0.6, face + 0.05, lean, pelvisY);
        } else {
          // Reading the gauges on the cabinet top; one hand rests on the cabinet edge.
          ik(1, 0.22, top + 0.02, face + 0.08, lean, pelvisY);
          ik(-1, -0.18, 1.0, 0.3, lean, pelvisY);
          showMeter = true;
          look(0.0, top + 0.1, face + 0.1, lean, pelvisY);
        }
        break;
      }
      case 'repair': {
        // Repair, a 14 s loop: kneel and work in the panel with the wrench (forearm turning, the free
        // hand braced on the cabinet top), reach down for a part from the bag, work again, then rise
        // and lean over the fan guard to check the unit.
        const u = (t * 0.0714) % 1;
        const fetch = win(u, 0.4, 0.5, 0.04);
        const check = win(u, 0.84, 0.97, 0.05);
        const kY = kneel();
        const kneelPose = { ...pose };
        const sY = stand(0.18);
        const standPose = { ...pose };
        for (const k of Object.keys(kneelPose) as (keyof typeof refs)[]) {
          const a = kneelPose[k];
          const b = standPose[k] ?? [0, 0, 0];
          pose[k] = [a[0] + (b[0] - a[0]) * check, a[1] + (b[1] - a[1]) * check, a[2] + (b[2] - a[2]) * check];
        }
        pelvisY = kY + (sY - kY) * check;
        pelvisZ = -0.12 * check;
        const bag = work?.bag;
        const lean = 0.42 + 0.12 * check + (bag ? 0.1 : -0.1) * fetch;
        // Turning toward the bag (beside the hip on the free-hand side) and bending down to it.
        const twist = bag ? -0.2 * fetch : 0.55 * fetch;
        const roll = bag ? 0.6 * fetch : 0;
        set('torso', lean, twist, roll);
        if (check > 0.5) {
          ik(1, 0.25, top + 0.02, face + 0.25, lean, pelvisY);
          ik(-1, -0.25, top + 0.02, face + 0.25, lean, pelvisY);
          look(0, top, face + 0.45, lean, pelvisY);
        } else if (fetch > 0.5 && bag) {
          // Reach into the tool bag set down beside the hip: hand to the handles, the other hand on the thigh.
          ik(-1, bag.x, 0.42, bag.z, lean, pelvisY, twist, roll);
          ik(1, 0.16, 0.5, 0.36, lean, pelvisY, twist, roll);
          look(bag.x, 0.3, bag.z, lean, pelvisY, twist);
        } else if (fetch > 0.5) {
          // Crew without the bag: reach down beside the knee.
          ik(1, 0.48, 0.12, 0.2, lean, pelvisY, twist);
          ik(-1, -0.2, top + 0.02, face + 0.1, lean, pelvisY, twist);
          look(0.5, 0.1, 0.25, lean, pelvisY, twist);
        } else {
          // Wrench turns: small arcs at the valve/terminal; the forearm rolls with each pull.
          const pull = Math.sin(t * 3.2);
          ik(1, 0.12 + pull * 0.03, 0.5 + pull * 0.035, face - 0.03, lean, pelvisY);
          ik(-1, -0.2, top + 0.02, face + 0.12, lean, pelvisY);
          const fr = pose.foreR!;
          pose.foreR = [fr[0], pull * 0.5, fr[2]];
          showWrench = true;
          look(0.08, 0.5, face + 0.05, lean, pelvisY);
        }
        break;
      }
      case 'stand-inspect': {
        // Waiting on a decision: tablet in both hands, glancing between it and the unit.
        pelvisY = stand(0.04);
        set('torso', 0.1);
        ik(-1, -0.05, 1.05, 0.36, 0.1, pelvisY);
        ik(1, 0.12, 1.0, 0.33, 0.1, pelvisY);
        if (Math.sin(t * 0.5) > 0.6) look(0, 0.6, face + 0.4, 0.1, pelvisY);
        else set('head', 0.55, 0.05);
        showTablet = true;
        break;
      }
      case 'install': {
        const k = (Math.sin(t * 1.6) + 1) / 2;
        set('legL', -0.9 * k, 0, 0.05);
        set('legR', -0.9 * k, 0, -0.05);
        set('shinL', 1.2 * k);
        set('shinR', 1.2 * k);
        set('footL', -0.3 * k);
        set('footR', -0.3 * k);
        pelvisY = PELVIS_Y - 0.3 * k;
        set('torso', 0.2 + 0.25 * k);
        set('armL', -1.1, 0, 0.2);
        set('armR', -1.1, 0, -0.2);
        set('foreL', -0.9);
        set('foreR', -0.9);
        showLoad = true;
        break;
      }
      case 'train': {
        set('armL', -0.9, 0, 0.1);
        set('foreL', -1.5);
        set('armR', -0.3 + Math.sin(t * 1.8) * 0.15);
        set('foreR', -0.8);
        set('head', 0.2);
        showTablet = true;
        break;
      }
      case 'celebrate': {
        const k = Math.sin(t * 5);
        set('armR', -2.8 + k * 0.2, 0, -0.3);
        set('foreR', -0.3);
        set('armL', -0.4, 0, 0.3);
        set('foreL', -1.0);
        rootY = Math.max(0, k) * 0.08;
        break;
      }
      default: {
        // Idle: breathing, a weight shift every few seconds, a slow head turn, one hand on the belt.
        const shift = Math.sin(t * 0.35);
        set('legL', 0, 0, 0.05 + shift * 0.025);
        set('legR', 0, 0, -0.05 + shift * 0.025);
        set('shinL', 0.03 + Math.max(0, -shift) * 0.06);
        set('shinR', 0.03 + Math.max(0, shift) * 0.06);
        set('armL', Math.sin(t * 1.1) * 0.03, 0, 0.12);
        set('foreL', -0.25);
        set('armR', 0.15, 0, -0.32);
        set('foreR', -0.9);
        set('torso', Math.sin(t * 1.2) * 0.012, 0, shift * 0.025);
        set('head', 0.03, Math.sin(t * 0.4) * 0.35);
        pelvisY = PELVIS_Y - Math.abs(shift) * 0.01;
      }
    }
    // Blend every joint toward its target so state changes never pop.
    const k = Math.min(1, dt * 7);
    const cur = blend.current;
    for (const name of Object.keys(refs) as (keyof typeof refs)[]) {
      const target = pose[name] ?? [0, 0, 0];
      const c = cur[name] ?? [target[0], target[1], target[2]];
      c[0] += (target[0] - c[0]) * k;
      c[1] += (target[1] - c[1]) * k;
      c[2] += (target[2] - c[2]) * k;
      cur[name] = c;
      r[name]!.rotation.set(c[0], c[1], c[2]);
    }
    const hs = heightState.current;
    hs.pelvis += (pelvisY - hs.pelvis) * k;
    hs.z += (pelvisZ - hs.z) * k;
    hs.root += (rootY - hs.root) * Math.min(1, dt * 20);
    r.pelvis!.position.y = hs.pelvis;
    r.pelvis!.position.z = hs.z;
    if (root.current) root.current.position.y = hs.root;
    if (bag.current) bag.current.visible = showBag;
    if (meter.current) meter.current.visible = showMeter;
    if (probe.current) probe.current.visible = showProbe;
    if (wrench.current) wrench.current.visible = showWrench;
    if (tablet.current) tablet.current.visible = showTablet;
    if (load.current) load.current.visible = showLoad;
    // A hand holding a tool closes round it; free hands stay relaxed.
    const gripL = showMeter || showTablet || showBag;
    const gripR = showProbe || showWrench;
    if (hands.relaxedL.current && hands.gripL.current) { hands.relaxedL.current.visible = !gripL; hands.gripL.current.visible = gripL; }
    if (hands.relaxedR.current && hands.gripR.current) { hands.relaxedR.current.visible = !gripR; hands.gripR.current.visible = gripR; }
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
  });

  const tech = role === 'technician' || role === 'installer';
  // Boot meshes are placed relative to the ankle pivot (the foot group sits at the bottom of the shin).
  const Boot = ({ side }: { side: 1 | -1 }) => (
    <group>
      <mesh geometry={GEO.boot} material={materials.boot} castShadow />
      <mesh geometry={GEO.sole} position={[0, 0.0, 0]} material={materials.sole} />
      <mesh geometry={GEO.shaft} position={[side * 0.0, 0.1, 0.0]} material={materials.boot} />
      <mesh position={[0, 0.17, 0]} material={materials.pants}>
        <cylinderGeometry args={[0.072, 0.076, 0.06, 12]} />
      </mesh>
    </group>
  );

  return (
    <group ref={root} scale={scale * build}>
      {tech && <TestLeads ref={leads} />}
      <group ref={refs.pelvis} position={[0, PELVIS_Y, 0]}>
        <mesh geometry={GEO.hips} position={[0, -0.02, 0]} material={materials.pants} castShadow scale={[heavy, 1, 1]} />
        {/* Legs: thigh → knee → shin → ankle/foot */}
        {([-1, 1] as const).map((side) => (
          <group key={side} ref={side < 0 ? refs.legL : refs.legR} position={[side * 0.1, -0.05, 0]}>
            <Limb length={0.46} radius={0.082} color={materials.pants} />
            {tech && <mesh geometry={GEO.cargo} position={[side * 0.083, -0.25, 0.01]} material={materials.pocket} />}
            <group ref={side < 0 ? refs.shinL : refs.shinR} position={[0, -0.45, 0]}>
              <Limb length={0.42} radius={0.07} color={materials.pants} taper={0.8} />
              {tech && (
                <mesh position={[0, -0.1, 0.07]} material={materials.kneePad}>
                  <boxGeometry args={[0.13, 0.14, 0.05]} />
                </mesh>
              )}
              <group ref={side < 0 ? refs.footL : refs.footR} position={[0, -0.42, 0]}>
                <Boot side={side} />
              </group>
            </group>
          </group>
        ))}
        {/* Torso */}
        <group ref={refs.torso} position={[0, 0.06, 0]}>
          <mesh geometry={GEO.torso} position={[0, 0.03, 0]} material={materials.shirt} castShadow scale={[heavy, 1, 1]} />
          <mesh geometry={GEO.hem} position={[0, 0.02, 0]} material={materials.shirt} scale={[heavy, 1, 1]} />
          {role === 'technician' && <mesh position={[0, 0.36, -0.128]} rotation={[0, Math.PI, 0]} material={backPrintMaterial()}><planeGeometry args={[0.26, 0.065]} /></mesh>}
          {/* Trapezius slope from the collar to each shoulder */}
          {([-1, 1] as const).map((side) => (
            <mesh key={side} position={[side * 0.15 * heavy, 0.535, 0]} rotation={[0, 0, side * -0.42]} scale={[1, 0.55, 0.75]} material={materials.shirt}>
              <sphereGeometry args={[0.1, 10, 8]} />
            </mesh>
          ))}
          {/* Collar, teal shoulder piping, name patch and back logo */}
          <mesh geometry={GEO.collar} position={[0, 0.58, 0.005]} material={role === 'dispatcher' ? materials.white : materials.shirt} scale={[1, 1, 0.85]} />
          <mesh position={[0, 0.53, 0.112]} rotation={[-0.25, 0, 0]} material={role === 'dispatcher' ? materials.white : materials.teal}>
            <boxGeometry args={[0.026, 0.09, 0.008]} />
          </mesh>
          {([-1, 1] as const).map((side) => (
            <mesh key={side} position={[side * 0.17 * heavy, 0.52, 0.0]} material={materials.teal} rotation={[0, 0, side * 0.3]}>
              <boxGeometry args={[0.1, 0.012, 0.2]} />
            </mesh>
          ))}
          <mesh position={[-0.1, 0.42, 0.12]} material={materials.white}>
            <boxGeometry args={[0.09, 0.03, 0.01]} />
          </mesh>
          <mesh position={[0.1, 0.42, 0.12]} material={materials.teal}>
            <boxGeometry args={[0.05, 0.05, 0.01]} />
          </mesh>
          {role !== 'technician' && (
            <mesh position={[0, 0.36, -0.12]} material={materials.teal}>
              <boxGeometry args={[0.16, 0.08, 0.01]} />
            </mesh>
          )}
          {role === 'installer' && (
            <group>
              <mesh position={[0, 0.3, 0]} material={materials.hiVis} scale={[heavy, 1, 1]}>
                <boxGeometry args={[0.44, 0.44, 0.26]} />
              </mesh>
              {[0.2, 0.34].map((y) => (
                <mesh key={y} position={[0, y, 0]} material={materials.reflective} scale={[heavy, 1, 1]}>
                  <boxGeometry args={[0.45, 0.03, 0.27]} />
                </mesh>
              ))}
            </group>
          )}
          {tech && (
            <group position={[0, 0.02, 0]}>
              <mesh geometry={GEO.belt} position={[0, -0.025, 0]} material={materials.belt} scale={[heavy, 1, 1]} />
              <mesh position={[0, 0.0, 0.118]} material={materials.buckle}>
                <boxGeometry args={[0.05, 0.04, 0.012]} />
              </mesh>
              <mesh geometry={GEO.pouch} position={[0.17 * heavy, -0.07, 0.07]} rotation={[0, -0.5, 0]} material={materials.leather} />
              <mesh geometry={GEO.pouch} position={[-0.17 * heavy, -0.07, 0.07]} rotation={[0, 0.5, 0]} material={materials.leather} scale={[0.85, 0.85, 0.85]} />
              <mesh position={[0.12, -0.08, -0.14]} material={materials.dark}>
                <boxGeometry args={[0.07, 0.1, 0.04]} />
              </mesh>
              <mesh position={[-0.16, -0.06, 0.15]} material={materials.tool}>
                <boxGeometry args={[0.06, 0.06, 0.03]} />
              </mesh>
            </group>
          )}
          {/* Boxed unit carried in front of the chest during installs */}
          <group ref={load} position={[0, 0.12, 0.42]} visible={false}>
            <mesh castShadow>
              <boxGeometry args={[0.56, 0.46, 0.5]} />
              <meshStandardMaterial color="#d9cfbf" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.58, 0.06, 0.08]} />
              <meshStandardMaterial color="#1d1f22" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.02, 0.251]} material={materials.teal}>
              <boxGeometry args={[0.2, 0.08, 0.005]} />
            </mesh>
          </group>
          {/* Neck and head with face features, hair or headwear */}
          <mesh position={[0, 0.62, 0]} material={materials.skin}>
            <cylinderGeometry args={[0.055, 0.07, 0.1, 10]} />
          </mesh>
          <group ref={refs.head} position={[0, 0.775, 0]} scale={0.92}>
            <mesh material={materials.skin} castShadow scale={[0.95, 1.08, 1]}>
              <sphereGeometry args={[0.125, 18, 14]} />
            </mesh>
            <mesh position={[0, -0.05, 0.02]} material={materials.skin} scale={[0.85, 0.9, 0.9]}>
              <sphereGeometry args={[0.1, 12, 10]} />
            </mesh>
            {([-1, 1] as const).map((side) => (
              <group key={side}>
                <mesh position={[side * 0.045, 0.01, 0.112]} material={materials.white} scale={[1, 0.7, 0.5]}>
                  <sphereGeometry args={[0.022, 8, 6]} />
                </mesh>
                <mesh position={[side * 0.045, 0.01, 0.122]} material={materials.eye}>
                  <sphereGeometry args={[0.011, 8, 6]} />
                </mesh>
                <mesh position={[side * 0.047, 0.045, 0.115]} material={materials.hair} rotation={[0, 0, side * 0.15]}>
                  <boxGeometry args={[0.05, 0.012, 0.012]} />
                </mesh>
                <mesh position={[side * 0.125, -0.005, 0]} material={materials.skin} scale={[0.5, 1, 0.8]}>
                  <sphereGeometry args={[0.03, 8, 6]} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, -0.02, 0.128]} material={materials.skin} scale={[0.6, 1, 1]}>
              <sphereGeometry args={[0.025, 8, 6]} />
            </mesh>
            <mesh position={[0, -0.065, 0.11]} material={materials.eye} scale={[1, 0.3, 0.3]}>
              <sphereGeometry args={[0.03, 8, 6]} />
            </mesh>
            {role === 'technician' ? (
              <group position={[0, 0.045, 0]}>
                <mesh material={materials.hat}>
                  <sphereGeometry args={[0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
                <mesh geometry={GEO.visor} position={[0, -0.004, 0.105]} rotation={[0.16, 0, 0]} material={materials.hat} castShadow />
                <mesh position={[0, 0.06, 0.12]} material={materials.teal}>
                  <boxGeometry args={[0.04, 0.05, 0.01]} />
                </mesh>
                <mesh position={[0, -0.02, -0.08]} material={materials.hair} scale={[1, 0.5, 1]}>
                  <sphereGeometry args={[0.13, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
                </mesh>
              </group>
            ) : role === 'installer' ? (
              <group position={[0, 0.07, 0]}>
                <mesh material={materials.hat}>
                  <sphereGeometry args={[0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
                <mesh position={[0, -0.02, 0]} material={materials.hat}>
                  <cylinderGeometry args={[0.175, 0.175, 0.03, 18]} />
                </mesh>
                <mesh position={[0, 0.08, 0]} material={materials.hat}>
                  <boxGeometry args={[0.05, 0.03, 0.28]} />
                </mesh>
              </group>
            ) : (
              <group>
                <mesh position={[0, 0.045, -0.01]} material={materials.hair} scale={[1.02, 0.85, 1.05]}>
                  <sphereGeometry args={[0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
                <mesh position={[0, 0.0, -0.06]} material={materials.hair} scale={[1, 0.6, 0.9]}>
                  <sphereGeometry args={[0.13, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
                </mesh>
              </group>
            )}
            {role === 'dispatcher' && (
              <group>
                <mesh position={[0.13, 0, 0]} material={materials.dark}>
                  <boxGeometry args={[0.04, 0.08, 0.08]} />
                </mesh>
                <mesh position={[0, 0.1, 0]} material={materials.dark} rotation={[0, 0, 0]}>
                  <torusGeometry args={[0.135, 0.01, 6, 20, Math.PI]} />
                </mesh>
              </group>
            )}
          </group>
          {/* Arms: shoulder → elbow → hand with a thumb */}
          {([-1, 1] as const).map((side) => (
            <group key={side} ref={side < 0 ? refs.armL : refs.armR} position={[side * 0.25 * heavy, 0.5, 0]}>
              {/* Deltoid: part of the arm, so it turns with it instead of standing out as a ball. */}
              <mesh position={[0, -0.035, 0]} scale={[0.95, 1.25, 1]} material={materials.shirt}>
                <sphereGeometry args={[0.072, 10, 8]} />
              </mesh>
              <Limb length={0.3} radius={0.06} color={materials.shirt} />
              {/* Short sleeve hem: the shirt ends above the elbow. */}
              <mesh position={[0, -0.2, 0]} material={materials.shirt}>
                <cylinderGeometry args={[0.068, 0.072, 0.05, 12]} />
              </mesh>
              <group ref={side < 0 ? refs.foreL : refs.foreR} position={[0, -0.3, 0]}>
                <Limb length={0.28} radius={0.05} color={materials.skin} taper={0.75} />
                {tech ? (
                  <>
                    <mesh ref={side < 0 ? hands.relaxedL : hands.relaxedR} geometry={GEO.glove[side < 0 ? 0 : 1]} position={[0, -0.27, 0.005]} material={materials.glove} castShadow />
                    <mesh ref={side < 0 ? hands.gripL : hands.gripR} geometry={GEO.gloveGrip[side < 0 ? 0 : 1]} position={[0, -0.27, 0.005]} material={materials.glove} castShadow visible={false} />
                  </>
                ) : (
                  <>
                    <mesh geometry={GEO.hand} position={[0, -0.31, 0.01]} material={materials.skin} />
                    <mesh position={[side * -0.04, -0.28, 0.025]} material={materials.skin} rotation={[0, 0, side * 0.5]}>
                      <boxGeometry args={[0.025, 0.05, 0.025]} />
                    </mesh>
                  </>
                )}
                {side < 0 ? (
                  <>
                    <group ref={bag} position={[0, -0.52, 0]} visible={false}>
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
                    <group ref={meter} position={[0, -0.36, 0.035]} rotation={[-1.25, 0, 0]} visible={false}>
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
                    <group ref={tablet} position={[0.02, -0.34, 0.08]} rotation={[-0.6, 0, 0]} visible={false}>
                      <mesh material={materials.dark}>
                        <boxGeometry args={[0.2, 0.26, 0.015]} />
                      </mesh>
                      <mesh position={[0, 0, 0.009]} material={materials.screen}>
                        <boxGeometry args={[0.17, 0.22, 0.004]} />
                      </mesh>
                    </group>
                  </>
                ) : (
                  <>
                    <group ref={probe} position={[0, -0.36, 0.03]} rotation={[0.15, 0, 0]} visible={false}>
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
                    <group ref={wrench} position={[0, -0.33, 0.04]} rotation={[0.3, 0, 0]} visible={false}>
                      <mesh geometry={WRENCH.handle} material={materials.steel} castShadow />
                      <mesh geometry={WRENCH.head} position={[0, 0.13, 0]} material={materials.steel} />
                      <mesh geometry={WRENCH.worm} position={[0, 0.105, 0.004]} material={materials.dark} />
                      <mesh position={[0, -0.04, 0]} material={materials.probe}>
                        <boxGeometry args={[0.034, 0.1, 0.016]} />
                      </mesh>
                    </group>
                  </>
                )}
              </group>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
