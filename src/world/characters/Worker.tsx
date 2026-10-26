import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { EmployeeRole } from '@/game/employees/roles';
import { PALETTE } from '../assets/palette';

export type WorkerAnim = 'idle' | 'walk' | 'carry' | 'inspect' | 'stand-inspect' | 'repair' | 'install' | 'train' | 'celebrate';

interface WorkerProps {
  role: EmployeeRole;
  look: number;
  anim: WorkerAnim;
  scale?: number;
  /** Walk-cycle rate multiplier, matched to how fast the character covers ground (1 ≈ 1.5 m/s). */
  pace?: number;
}

const SKIN = ['#f1c7a6', '#d9a57c', '#b97a52', '#8d5a3b', '#f6d7bf', '#6b4430'];
const HAIR = ['#2b1d14', '#4a2f1d', '#8a6a3c', '#1a1a1a', '#b3833f', '#5a5a5a'];
const SHIRT: Record<EmployeeRole, string> = { technician: '#1d2126', installer: '#2a2f36', dispatcher: '#f3f4f6', 'comfort-advisor': '#1b8f86' };
const PANTS: Record<EmployeeRole, string> = { technician: '#3a3f46', installer: '#4a4238', dispatcher: '#2c3340', 'comfort-advisor': '#2c3340' };

const PELVIS_Y = 0.95;

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

/** Joint rotation targets for one pose; everything not named returns to zero. */
type Pose = Record<string, [number, number, number]>;

/**
 * Stylized-realistic worker (~1.8 m): articulated shoulders, elbows, hips and knees driven by
 * procedural clips per job state, blended across state changes. Feet stay on the ground.
 */
export function Worker({ role, look, anim, scale = 1, pace = 1 }: WorkerProps) {
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
  const heightState = useRef({ pelvis: PELVIS_Y, root: 0 });
  const blend = useRef<Pose>({});
  const stride = useRef(0);

  const materials = useMemo(
    () => ({
      skin: mat(SKIN[look % SKIN.length]),
      hair: mat(HAIR[(look >> 3) % HAIR.length], 0.9),
      shirt: mat(SHIRT[role]),
      pants: mat(PANTS[role]),
      boot: mat('#2a2622', 0.9),
      sole: mat('#141211', 0.95),
      teal: new THREE.MeshStandardMaterial({ color: PALETTE.egoTeal, emissive: PALETTE.egoTeal, emissiveIntensity: 0.2, roughness: 0.7 }),
      belt: mat('#4a3522', 0.9),
      tool: mat('#f2c230', 0.6),
      steel: mat('#b9bfc5', 0.4, 0.7),
      dark: mat('#1d1f22', 0.7),
      white: mat('#f4f5f7', 0.7),
      hiVis: new THREE.MeshStandardMaterial({ color: '#f6a21c', emissive: '#f6a21c', emissiveIntensity: 0.15, roughness: 0.8 }),
      reflective: new THREE.MeshStandardMaterial({ color: '#d8dde2', roughness: 0.3, metalness: 0.4 }),
      hat: mat(role === 'installer' ? '#f2c230' : '#15181d', 0.8),
      kneePad: mat('#23262a', 0.8),
      eye: mat('#1a1511', 0.5),
      screen: new THREE.MeshStandardMaterial({ color: '#8fd9ff', emissive: '#4fb3ff', emissiveIntensity: 0.6, roughness: 0.3 }),
    }),
    [look, role],
  );

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime() + phase;
    const r = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, v.current])) as Record<keyof typeof refs, THREE.Group | null>;
    if (Object.values(r).some((v) => !v)) return;
    const pose: Pose = {};
    const set = (name: keyof typeof refs, x: number, y = 0, z = 0) => {
      pose[name] = [x, y, z];
    };
    let pelvisY = PELVIS_Y;
    let rootY = 0;
    let showBag = false;
    let showMeter = false;
    let showWrench = false;
    let showTablet = false;
    let showLoad = false;

    switch (anim) {
      case 'walk':
      case 'carry': {
        // Stride phase advances with the ground speed so the feet do not slide.
        stride.current += dt * 7.2 * pace;
        const s = Math.sin(stride.current + phase);
        const c = Math.cos(stride.current + phase);
        set('legL', s * 0.62);
        set('legR', -s * 0.62);
        set('shinL', Math.max(0, -c) * 0.95);
        set('shinR', Math.max(0, c) * 0.95);
        set('footL', Math.max(0, s) * 0.3);
        set('footR', Math.max(0, -s) * 0.3);
        set('armL', -s * 0.45, 0, 0.06);
        set('foreL', -0.35);
        if (anim === 'carry') {
          set('armR', 0.12, 0, -0.14);
          set('foreR', -0.12);
          showBag = true;
        } else {
          set('armR', s * 0.45, 0, -0.06);
          set('foreR', -0.35);
        }
        set('torso', 0.07, s * 0.06);
        set('head', -0.05, -s * 0.05);
        rootY = Math.abs(c) * 0.035;
        break;
      }
      case 'inspect':
      case 'repair': {
        // Kneel on the right knee; the left foot is planted in front. The torso leans toward the unit.
        set('legR', 0.05);
        set('shinR', 1.55);
        set('footR', -0.4);
        set('legL', -1.5);
        set('shinL', 1.5);
        set('footL', 0.0);
        pelvisY = 0.52;
        set('torso', 0.4, 0.08);
        set('head', 0.2, -0.1);
        if (anim === 'inspect') {
          set('armR', -1.35 + Math.sin(t * 2.5) * 0.08, 0, -0.05);
          set('foreR', -0.7);
          set('armL', -1.15 + Math.sin(t * 2.2) * 0.08, 0.2, -0.25);
          set('foreL', -0.9);
          showMeter = true;
        } else {
          const w = Math.sin(t * 6);
          set('armR', -1.15 + w * 0.22, 0, -0.1);
          set('foreR', -0.85 + w * 0.25);
          set('armL', -0.95, 0.15, -0.3);
          set('foreL', -1.2);
          showWrench = true;
        }
        break;
      }
      case 'stand-inspect': {
        set('armR', -0.9, 0, -0.1);
        set('foreR', -1.3);
        set('armL', -0.7, 0, 0.15);
        set('foreL', -1.5);
        set('head', 0.35);
        set('torso', 0.08);
        set('legL', 0, 0, 0.04);
        set('legR', 0, 0, -0.04);
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
        // Idle: breathing, a weight shift every few seconds, a slow head turn.
        const shift = Math.sin(t * 0.35);
        set('legL', 0, 0, 0.03 + shift * 0.02);
        set('legR', 0, 0, -0.03 + shift * 0.02);
        set('shinL', 0.02);
        set('shinR', 0.02);
        set('armL', Math.sin(t * 1.1) * 0.04, 0, 0.1);
        set('armR', -Math.sin(t * 1.1) * 0.04, 0, -0.1);
        set('foreL', -0.3);
        set('foreR', -0.3);
        set('torso', Math.sin(t * 1.2) * 0.015, 0, shift * 0.02);
        set('head', 0.02, Math.sin(t * 0.4) * 0.4);
      }
    }
    // Blend every joint toward its target so state changes never pop.
    const k = Math.min(1, dt * 9);
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
    hs.root += (rootY - hs.root) * Math.min(1, dt * 20);
    r.pelvis!.position.y = hs.pelvis;
    if (root.current) root.current.position.y = hs.root;
    if (bag.current) bag.current.visible = showBag;
    if (meter.current) meter.current.visible = showMeter;
    if (wrench.current) wrench.current.visible = showWrench;
    if (tablet.current) tablet.current.visible = showTablet;
    if (load.current) load.current.visible = showLoad;
  });

  const tech = role === 'technician' || role === 'installer';
  // Boot meshes are placed relative to the ankle pivot (the foot group sits at the bottom of the shin).
  const Boot = ({ side }: { side: 1 | -1 }) => (
    <group>
      <mesh position={[0, 0.02, 0.06]} material={materials.boot} castShadow>
        <boxGeometry args={[0.14, 0.11, 0.3]} />
      </mesh>
      <mesh position={[0, 0.06, 0.2]} material={materials.boot} scale={[1, 0.7, 1]}>
        <sphereGeometry args={[0.07, 10, 8]} />
      </mesh>
      <mesh position={[0, -0.035, 0.07]} material={materials.sole}>
        <boxGeometry args={[0.15, 0.03, 0.33]} />
      </mesh>
      <mesh position={[side * 0.0, 0.12, 0.02]} material={materials.pants}>
        <cylinderGeometry args={[0.07, 0.075, 0.12, 10]} />
      </mesh>
    </group>
  );

  return (
    <group ref={root} scale={scale * build}>
      <group ref={refs.pelvis} position={[0, PELVIS_Y, 0]}>
        <mesh position={[0, -0.02, 0]} material={materials.pants} castShadow scale={[heavy, 1, 1]}>
          <boxGeometry args={[0.34, 0.2, 0.22]} />
        </mesh>
        {/* Legs: thigh → knee → shin → ankle/foot */}
        {([-1, 1] as const).map((side) => (
          <group key={side} ref={side < 0 ? refs.legL : refs.legR} position={[side * 0.1, -0.05, 0]}>
            <Limb length={0.46} radius={0.082} color={materials.pants} />
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
          <mesh position={[0, 0.3, 0]} material={materials.shirt} castShadow scale={[heavy, 1, 1]}>
            <boxGeometry args={[0.4, 0.54, 0.23]} />
          </mesh>
          <mesh position={[0, 0.32, 0]} material={materials.shirt} castShadow scale={[heavy, 1, 1]}>
            <capsuleGeometry args={[0.2, 0.28, 4, 12]} />
          </mesh>
          {/* Shoulder caps round the silhouette */}
          {([-1, 1] as const).map((side) => (
            <mesh key={side} position={[side * 0.24 * heavy, 0.5, 0]} material={materials.shirt}>
              <sphereGeometry args={[0.085, 10, 8]} />
            </mesh>
          ))}
          {/* Collar, teal shoulder piping, name patch and back logo */}
          <mesh position={[0, 0.57, 0.02]} material={role === 'dispatcher' ? materials.white : materials.teal}>
            <boxGeometry args={[0.2, 0.03, 0.22]} />
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
          <mesh position={[0, 0.36, -0.12]} material={materials.teal}>
            <boxGeometry args={[0.16, 0.08, 0.01]} />
          </mesh>
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
              <mesh material={materials.belt} scale={[heavy, 1, 1]}>
                <boxGeometry args={[0.44, 0.08, 0.28]} />
              </mesh>
              <mesh position={[0.2 * heavy, -0.09, 0.08]} material={materials.belt}>
                <boxGeometry args={[0.1, 0.16, 0.12]} />
              </mesh>
              <mesh position={[-0.2 * heavy, -0.09, 0.08]} material={materials.belt}>
                <boxGeometry args={[0.1, 0.16, 0.12]} />
              </mesh>
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
          <group ref={refs.head} position={[0, 0.78, 0]}>
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
                <mesh position={[0, 0.0, 0.15]} material={materials.hat}>
                  <boxGeometry args={[0.2, 0.015, 0.14]} />
                </mesh>
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
              <Limb length={0.3} radius={0.06} color={materials.shirt} />
              <group ref={side < 0 ? refs.foreL : refs.foreR} position={[0, -0.3, 0]}>
                <Limb length={0.28} radius={0.05} color={materials.skin} taper={0.75} />
                <mesh position={[0, -0.31, 0.01]} material={materials.skin}>
                  <boxGeometry args={[0.075, 0.1, 0.045]} />
                </mesh>
                <mesh position={[side * -0.04, -0.28, 0.025]} material={materials.skin} rotation={[0, 0, side * 0.5]}>
                  <boxGeometry args={[0.025, 0.05, 0.025]} />
                </mesh>
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
                    <group ref={meter} position={[0, -0.36, 0.05]} rotation={[-0.4, 0, 0]} visible={false}>
                      <mesh material={materials.tool}>
                        <boxGeometry args={[0.09, 0.17, 0.04]} />
                      </mesh>
                      <mesh position={[0, 0.04, 0.021]} material={materials.screen}>
                        <boxGeometry args={[0.065, 0.05, 0.004]} />
                      </mesh>
                      <mesh position={[0, -0.03, 0.021]} material={materials.dark}>
                        <cylinderGeometry args={[0.02, 0.02, 0.006, 12]} />
                      </mesh>
                      <mesh position={[0.025, -0.16, 0]} material={materials.dark}>
                        <cylinderGeometry args={[0.005, 0.005, 0.16, 5]} />
                      </mesh>
                      <mesh position={[-0.025, -0.16, 0]} material={materials.dark}>
                        <cylinderGeometry args={[0.005, 0.005, 0.16, 5]} />
                      </mesh>
                    </group>
                    <group ref={wrench} position={[0, -0.36, 0.05]} rotation={[0.3, 0, 0]} visible={false}>
                      <mesh material={materials.steel}>
                        <boxGeometry args={[0.03, 0.28, 0.02]} />
                      </mesh>
                      <mesh position={[0, 0.15, 0]} material={materials.steel}>
                        <boxGeometry args={[0.07, 0.06, 0.025]} />
                      </mesh>
                      <mesh position={[0, -0.05, 0]} material={materials.dark}>
                        <boxGeometry args={[0.035, 0.12, 0.025]} />
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
