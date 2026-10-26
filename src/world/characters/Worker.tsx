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
}

const SKIN = ['#f1c7a6', '#d9a57c', '#b97a52', '#8d5a3b', '#f6d7bf', '#6b4430'];
const HAIR = ['#2b1d14', '#4a2f1d', '#8a6a3c', '#1a1a1a', '#b3833f', '#5a5a5a'];
const SHIRT: Record<EmployeeRole, string> = { technician: PALETTE.egoBlack, installer: '#2f3a44', dispatcher: '#f3f4f6', 'comfort-advisor': '#1b8f86' };
const PANTS: Record<EmployeeRole, string> = { technician: '#3a3f46', installer: '#4a4238', dispatcher: '#2c3340', 'comfort-advisor': '#2c3340' };

const PELVIS_Y = 0.95;

const mat = (color: string, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function Limb({ length, radius, color }: { length: number; radius: number; color: THREE.Material }) {
  return (
    <mesh position={[0, -length / 2, 0]} material={color} castShadow>
      <capsuleGeometry args={[radius, length - radius * 2, 4, 10]} />
    </mesh>
  );
}

/** Work boot (upper, toe box, thick sole) anchored at the ankle; keeps the sole on the ground. */
function Boot({ boot, sole }: { boot: THREE.Material; sole: THREE.Material }) {
  return (
    <group position={[0, -0.42, 0.05]}>
      <mesh position={[0, 0.03, -0.02]} material={boot} castShadow>
        <boxGeometry args={[0.15, 0.14, 0.26]} />
      </mesh>
      <mesh position={[0, -0.02, 0.07]} material={boot} castShadow>
        <boxGeometry args={[0.15, 0.08, 0.16]} />
      </mesh>
      <mesh position={[0, -0.07, 0.02]} material={sole}>
        <boxGeometry args={[0.16, 0.04, 0.32]} />
      </mesh>
    </group>
  );
}

/**
 * Stylized-realistic worker (~1.78 m): articulated shoulders, elbows, hips and knees driven by
 * procedural clips per job state. Feet are kept on the ground in every pose. Field roles wear a
 * branded EGO uniform — hard hat, hi-vis vest with reflective bands, safety glasses, gloves and a
 * loaded tool belt; the rig (bone pivots and limb lengths) is unchanged so every pose stays valid.
 */
export function Worker({ role, look, anim, scale = 1 }: WorkerProps) {
  const root = useRef<THREE.Group>(null);
  const pelvis = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const foreL = useRef<THREE.Group>(null);
  const foreR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const shinL = useRef<THREE.Group>(null);
  const shinR = useRef<THREE.Group>(null);
  const bag = useRef<THREE.Group>(null);
  const meter = useRef<THREE.Group>(null);
  const wrench = useRef<THREE.Group>(null);
  const tablet = useRef<THREE.Group>(null);
  const phase = ((look % 100) / 100) * Math.PI * 2;

  const fieldRole = role === 'technician' || role === 'installer';

  const materials = useMemo(
    () => ({
      skin: mat(SKIN[look % SKIN.length]),
      hair: mat(HAIR[(look >> 3) % HAIR.length], 0.9),
      shirt: mat(SHIRT[role]),
      pants: mat(PANTS[role]),
      boot: mat('#2a2622', 0.9),
      bootSole: mat('#121212', 0.85),
      teal: new THREE.MeshStandardMaterial({ color: PALETTE.egoTeal, emissive: PALETTE.egoTeal, emissiveIntensity: 0.25, roughness: 0.7 }),
      vest: mat(role === 'installer' ? '#3c4147' : '#24282e', 0.82),
      band: new THREE.MeshStandardMaterial({ color: '#e6ebef', emissive: '#aeb8be', emissiveIntensity: 0.14, roughness: 0.4, metalness: 0.2 }),
      glove: mat('#17181c', 0.85),
      belt: mat('#41362a', 0.85),
      tool: mat('#f2c230', 0.6),
      steel: mat('#b9bfc5', 0.4, 0.7),
      dark: mat('#1d1f22', 0.7),
      hat: mat(role === 'installer' ? '#f2c230' : PALETTE.egoTeal, 0.75),
      eyeWhite: mat('#f3f1ec', 0.45),
      eyeDark: mat('#23282d', 0.35),
      lens: new THREE.MeshStandardMaterial({ color: '#0c1b1f', roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.6 }),
      screen: new THREE.MeshStandardMaterial({ color: '#8fd9ff', emissive: '#4fb3ff', emissiveIntensity: 0.6, roughness: 0.3 }),
    }),
    [look, role],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phase;
    const r = {
      root: root.current, pelvis: pelvis.current, torso: torso.current, head: head.current,
      armL: armL.current, armR: armR.current, foreL: foreL.current, foreR: foreR.current,
      legL: legL.current, legR: legR.current, shinL: shinL.current, shinR: shinR.current,
    };
    if (Object.values(r).some((v) => !v)) return;
    const set = (g: THREE.Group | null, x: number, y = 0, z = 0) => {
      if (g) g.rotation.set(x, y, z);
    };
    // Reset defaults
    set(r.torso, 0);
    set(r.head, 0);
    r.root!.position.y = 0;
    r.pelvis!.position.y = PELVIS_Y;
    if (bag.current) bag.current.visible = false;
    if (meter.current) meter.current.visible = false;
    if (wrench.current) wrench.current.visible = false;
    if (tablet.current) tablet.current.visible = false;

    switch (anim) {
      case 'walk':
      case 'carry': {
        const s = Math.sin(t * 7.5);
        const c = Math.cos(t * 7.5);
        set(r.legL, s * 0.65);
        set(r.legR, -s * 0.65);
        set(r.shinL, Math.max(0, -c) * 0.9);
        set(r.shinR, Math.max(0, c) * 0.9);
        set(r.armL, -s * 0.5);
        set(r.foreL, -0.3);
        if (anim === 'carry') {
          set(r.armR, 0.1, 0, -0.12);
          set(r.foreR, -0.15);
          if (bag.current) bag.current.visible = true;
        } else {
          set(r.armR, s * 0.5);
          set(r.foreR, -0.3);
        }
        set(r.torso, 0.06);
        set(r.head, -0.04);
        r.root!.position.y = Math.abs(c) * 0.04;
        break;
      }
      case 'inspect':
      case 'repair': {
        // Kneel on the right knee: right thigh vertical with the shin flat behind; left thigh
        // forward with the shin vertical and the foot planted.
        set(r.legR, 0.05);
        set(r.shinR, 1.55);
        set(r.legL, -1.5);
        set(r.shinL, 1.5);
        r.pelvis!.position.y = 0.52;
        set(r.torso, 0.35);
        set(r.head, 0.25);
        if (anim === 'inspect') {
          set(r.armR, -1.25 + Math.sin(t * 2.5) * 0.08);
          set(r.foreR, -0.9);
          set(r.armL, -0.9 + Math.sin(t * 2.2) * 0.1, 0, -0.2);
          set(r.foreL, -1.2);
          if (meter.current) meter.current.visible = true;
        } else {
          const w = Math.sin(t * 6);
          set(r.armR, -1.1 + w * 0.22);
          set(r.foreR, -0.9 + w * 0.25);
          set(r.armL, -0.8, 0, -0.3);
          set(r.foreL, -1.3);
          if (wrench.current) wrench.current.visible = true;
        }
        break;
      }
      case 'stand-inspect': {
        set(r.armR, -0.9, 0, -0.1);
        set(r.foreR, -1.3);
        set(r.armL, -0.7, 0, 0.15);
        set(r.foreL, -1.5);
        set(r.head, 0.35);
        set(r.torso, 0.08);
        if (tablet.current) tablet.current.visible = true;
        break;
      }
      case 'install': {
        // Lifting motion: squat and rise with the load held in front.
        const k = (Math.sin(t * 1.6) + 1) / 2;
        set(r.legL, -0.9 * k);
        set(r.legR, -0.9 * k);
        set(r.shinL, 1.2 * k);
        set(r.shinR, 1.2 * k);
        r.pelvis!.position.y = PELVIS_Y - 0.3 * k;
        set(r.torso, 0.2 + 0.25 * k);
        set(r.armL, -1.1, 0, 0.2);
        set(r.armR, -1.1, 0, -0.2);
        set(r.foreL, -0.9);
        set(r.foreR, -0.9);
        break;
      }
      case 'train': {
        set(r.armL, -0.9, 0, 0.1);
        set(r.foreL, -1.5);
        set(r.armR, -0.3 + Math.sin(t * 1.8) * 0.15);
        set(r.foreR, -0.8);
        set(r.head, 0.2);
        if (tablet.current) tablet.current.visible = true;
        break;
      }
      case 'celebrate': {
        const k = Math.sin(t * 5);
        set(r.armR, -2.8 + k * 0.2, 0, -0.3);
        set(r.foreR, -0.3);
        set(r.armL, -0.4, 0, 0.3);
        set(r.foreL, -1.0);
        r.root!.position.y = Math.max(0, k) * 0.08;
        break;
      }
      default: {
        // Idle: subtle breathing, weight shift, occasional head turn.
        set(r.legL, 0, 0, 0.03);
        set(r.legR, 0, 0, -0.03);
        set(r.shinL, 0.02);
        set(r.shinR, 0.02);
        set(r.armL, Math.sin(t * 1.1) * 0.04, 0, 0.08);
        set(r.armR, -Math.sin(t * 1.1) * 0.04, 0, -0.08);
        set(r.foreL, -0.25);
        set(r.foreR, -0.25);
        set(r.torso, Math.sin(t * 1.2) * 0.015);
        set(r.head, 0, Math.sin(t * 0.4) * 0.35);
      }
    }
  });

  return (
    <group ref={root} scale={scale}>
      <group ref={pelvis} position={[0, PELVIS_Y, 0]}>
        {/* Hips */}
        <mesh position={[0, -0.02, 0]} material={materials.pants} castShadow>
          <boxGeometry args={[0.36, 0.2, 0.24]} />
        </mesh>
        {/* Legs */}
        <group ref={legL} position={[-0.11, -0.05, 0]}>
          <Limb length={0.46} radius={0.095} color={materials.pants} />
          <mesh position={[0, -0.4, 0.04]} material={materials.pants} castShadow>
            <boxGeometry args={[0.16, 0.14, 0.14]} />
          </mesh>
          <group ref={shinL} position={[0, -0.45, 0]}>
            <Limb length={0.42} radius={0.08} color={materials.pants} />
            <Boot boot={materials.boot} sole={materials.bootSole} />
          </group>
        </group>
        <group ref={legR} position={[0.11, -0.05, 0]}>
          <Limb length={0.46} radius={0.095} color={materials.pants} />
          <mesh position={[0, -0.4, 0.04]} material={materials.pants} castShadow>
            <boxGeometry args={[0.16, 0.14, 0.14]} />
          </mesh>
          <group ref={shinR} position={[0, -0.45, 0]}>
            <Limb length={0.42} radius={0.08} color={materials.pants} />
            <Boot boot={materials.boot} sole={materials.bootSole} />
          </group>
        </group>
        {/* Torso */}
        <group ref={torso} position={[0, 0.06, 0]}>
          {/* Abdomen and rounded chest */}
          <mesh position={[0, 0.15, 0]} material={materials.shirt} castShadow>
            <boxGeometry args={[0.36, 0.28, 0.23]} />
          </mesh>
          <mesh position={[0, 0.36, 0]} material={materials.shirt} castShadow>
            <capsuleGeometry args={[0.2, 0.26, 6, 12]} />
          </mesh>
          {/* Broad shoulder yoke */}
          <mesh position={[0, 0.52, 0]} material={materials.shirt} castShadow>
            <boxGeometry args={[0.52, 0.14, 0.26]} />
          </mesh>
          {/* Branded hi-vis vest for field roles: front panels, back, reflective bands, EGO patch */}
          {fieldRole && (
            <group>
              <mesh position={[-0.1, 0.32, 0.115]} material={materials.vest} castShadow>
                <boxGeometry args={[0.15, 0.42, 0.04]} />
              </mesh>
              <mesh position={[0.1, 0.32, 0.115]} material={materials.vest} castShadow>
                <boxGeometry args={[0.15, 0.42, 0.04]} />
              </mesh>
              <mesh position={[0, 0.33, -0.115]} material={materials.vest} castShadow>
                <boxGeometry args={[0.36, 0.44, 0.04]} />
              </mesh>
              {/* Reflective bands: chest wrap + two vertical shoulder straps */}
              <mesh position={[-0.1, 0.26, 0.137]} material={materials.band}>
                <boxGeometry args={[0.15, 0.05, 0.01]} />
              </mesh>
              <mesh position={[0.1, 0.26, 0.137]} material={materials.band}>
                <boxGeometry args={[0.15, 0.05, 0.01]} />
              </mesh>
              <mesh position={[0, 0.26, -0.137]} material={materials.band}>
                <boxGeometry args={[0.36, 0.05, 0.01]} />
              </mesh>
              <mesh position={[-0.12, 0.47, 0.02]} material={materials.band}>
                <boxGeometry args={[0.05, 0.14, 0.27]} />
              </mesh>
              <mesh position={[0.12, 0.47, 0.02]} material={materials.band}>
                <boxGeometry args={[0.05, 0.14, 0.27]} />
              </mesh>
              {/* EGO chest patch */}
              <mesh position={[-0.1, 0.44, 0.14]} material={materials.teal}>
                <boxGeometry args={[0.1, 0.055, 0.006]} />
              </mesh>
            </group>
          )}
          {/* Collar and teal piping */}
          <mesh position={[0, 0.57, 0.02]} material={materials.teal}>
            <boxGeometry args={[0.2, 0.03, 0.22]} />
          </mesh>
          {(role === 'technician' || role === 'installer') && (
            <group position={[0, 0.02, 0]}>
              <mesh material={materials.belt}>
                <boxGeometry args={[0.46, 0.08, 0.3]} />
              </mesh>
              <mesh position={[0, -0.01, 0.152]} material={materials.steel}>
                <boxGeometry args={[0.07, 0.05, 0.01]} />
              </mesh>
              {/* Tool pouches and a holstered driver */}
              <mesh position={[0.2, -0.08, 0.1]} material={materials.belt} castShadow>
                <boxGeometry args={[0.11, 0.16, 0.13]} />
              </mesh>
              <mesh position={[-0.2, -0.08, 0.1]} material={materials.belt} castShadow>
                <boxGeometry args={[0.11, 0.16, 0.13]} />
              </mesh>
              <mesh position={[0.21, -0.05, 0.17]} material={materials.tool}>
                <boxGeometry args={[0.04, 0.12, 0.03]} />
              </mesh>
              <mesh position={[-0.24, -0.1, 0]} material={materials.steel}>
                <cylinderGeometry args={[0.018, 0.018, 0.2, 8]} />
              </mesh>
            </group>
          )}
          {/* Neck and head */}
          <mesh position={[0, 0.62, 0]} material={materials.skin}>
            <cylinderGeometry args={[0.06, 0.07, 0.1, 8]} />
          </mesh>
          <group ref={head} position={[0, 0.78, 0]}>
            {/* Cranium + tapered jaw */}
            <mesh material={materials.skin} castShadow>
              <sphereGeometry args={[0.13, 16, 12]} />
            </mesh>
            <mesh position={[0, -0.07, 0.015]} material={materials.skin} scale={[0.82, 1, 0.9]}>
              <sphereGeometry args={[0.1, 12, 10]} />
            </mesh>
            {/* Ears */}
            <mesh position={[0.125, -0.01, 0]} material={materials.skin}>
              <sphereGeometry args={[0.028, 8, 6]} />
            </mesh>
            <mesh position={[-0.125, -0.01, 0]} material={materials.skin}>
              <sphereGeometry args={[0.028, 8, 6]} />
            </mesh>
            {/* Nose */}
            <mesh position={[0, -0.02, 0.125]} material={materials.skin}>
              <boxGeometry args={[0.03, 0.05, 0.035]} />
            </mesh>
            {/* Eyes + brows */}
            <mesh position={[0.05, 0.015, 0.112]} material={materials.eyeWhite}>
              <sphereGeometry args={[0.022, 8, 6]} />
            </mesh>
            <mesh position={[-0.05, 0.015, 0.112]} material={materials.eyeWhite}>
              <sphereGeometry args={[0.022, 8, 6]} />
            </mesh>
            <mesh position={[0.052, 0.015, 0.128]} material={materials.eyeDark}>
              <sphereGeometry args={[0.011, 6, 6]} />
            </mesh>
            <mesh position={[-0.052, 0.015, 0.128]} material={materials.eyeDark}>
              <sphereGeometry args={[0.011, 6, 6]} />
            </mesh>
            <mesh position={[0.05, 0.055, 0.115]} material={materials.hair}>
              <boxGeometry args={[0.05, 0.015, 0.02]} />
            </mesh>
            <mesh position={[-0.05, 0.055, 0.115]} material={materials.hair}>
              <boxGeometry args={[0.05, 0.015, 0.02]} />
            </mesh>
            {/* Safety glasses for field roles */}
            {fieldRole && (
              <group position={[0, 0.02, 0.1]}>
                <mesh material={materials.lens}>
                  <boxGeometry args={[0.2, 0.05, 0.04]} />
                </mesh>
                <mesh position={[0, 0.035, 0.01]} material={materials.dark}>
                  <boxGeometry args={[0.21, 0.015, 0.03]} />
                </mesh>
              </group>
            )}
            {role === 'technician' ? (
              <group position={[0, 0.055, 0]}>
                {/* Hard hat: dome, full brim, crown ridges */}
                <mesh material={materials.hat} castShadow>
                  <sphereGeometry args={[0.145, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
                <mesh position={[0, 0.005, 0]} material={materials.hat}>
                  <cylinderGeometry args={[0.185, 0.185, 0.025, 20]} />
                </mesh>
                <mesh position={[0, 0.02, 0.135]} material={materials.hat}>
                  <boxGeometry args={[0.2, 0.025, 0.12]} />
                </mesh>
                <mesh position={[0, 0.08, 0]} material={materials.hat}>
                  <boxGeometry args={[0.04, 0.06, 0.26]} />
                </mesh>
                <mesh position={[0, 0.03, 0.146]} material={materials.band}>
                  <boxGeometry args={[0.1, 0.02, 0.01]} />
                </mesh>
              </group>
            ) : role === 'installer' ? (
              <group position={[0, 0.06, 0]}>
                <mesh material={materials.hat} castShadow>
                  <sphereGeometry args={[0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
                <mesh position={[0, 0.005, 0]} material={materials.hat}>
                  <cylinderGeometry args={[0.19, 0.19, 0.025, 20]} />
                </mesh>
                <mesh position={[0, 0.07, 0]} material={materials.hat}>
                  <boxGeometry args={[0.04, 0.06, 0.28]} />
                </mesh>
              </group>
            ) : (
              <mesh position={[0, 0.05, -0.01]} material={materials.hair}>
                <sphereGeometry args={[0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              </mesh>
            )}
            {role === 'dispatcher' && (
              <mesh position={[0.13, 0, 0]} material={materials.dark}>
                <boxGeometry args={[0.04, 0.08, 0.08]} />
              </mesh>
            )}
          </group>
          {/* Arms: shoulder → elbow → hand */}
          <group ref={armL} position={[-0.26, 0.5, 0]}>
            <mesh material={materials.shirt} castShadow>
              <sphereGeometry args={[0.082, 10, 8]} />
            </mesh>
            <Limb length={0.3} radius={0.062} color={materials.shirt} />
            <group ref={foreL} position={[0, -0.3, 0]}>
              <mesh position={[0, -0.01, 0]} material={materials.teal}>
                <cylinderGeometry args={[0.058, 0.055, 0.04, 10]} />
              </mesh>
              <Limb length={0.28} radius={0.05} color={materials.skin} />
              <mesh position={[0, -0.3, 0]} material={materials.glove} castShadow>
                <boxGeometry args={[0.085, 0.11, 0.055]} />
              </mesh>
              <mesh position={[0.03, -0.35, 0.01]} material={materials.glove}>
                <boxGeometry args={[0.025, 0.05, 0.04]} />
              </mesh>
              {/* Tool bag hangs from the left hand while walking */}
              <group ref={bag} position={[0, -0.5, 0]} visible={false}>
                <mesh material={materials.dark} castShadow>
                  <boxGeometry args={[0.22, 0.26, 0.4]} />
                </mesh>
                <mesh position={[0, 0.16, 0]} material={materials.dark}>
                  <torusGeometry args={[0.07, 0.015, 6, 12]} />
                </mesh>
                <mesh position={[0, 0.02, 0.201]} material={materials.teal}>
                  <boxGeometry args={[0.14, 0.04, 0.005]} />
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
            </group>
          </group>
          <group ref={armR} position={[0.26, 0.5, 0]}>
            <mesh material={materials.shirt} castShadow>
              <sphereGeometry args={[0.082, 10, 8]} />
            </mesh>
            <Limb length={0.3} radius={0.062} color={materials.shirt} />
            <group ref={foreR} position={[0, -0.3, 0]}>
              <mesh position={[0, -0.01, 0]} material={materials.teal}>
                <cylinderGeometry args={[0.058, 0.055, 0.04, 10]} />
              </mesh>
              <Limb length={0.28} radius={0.05} color={materials.skin} />
              <mesh position={[0, -0.3, 0]} material={materials.glove} castShadow>
                <boxGeometry args={[0.085, 0.11, 0.055]} />
              </mesh>
              <mesh position={[-0.03, -0.35, 0.01]} material={materials.glove}>
                <boxGeometry args={[0.025, 0.05, 0.04]} />
              </mesh>
              <group ref={meter} position={[0, -0.36, 0.04]} visible={false}>
                <mesh material={materials.tool}>
                  <boxGeometry args={[0.09, 0.16, 0.04]} />
                </mesh>
                <mesh position={[0, 0.03, 0.021]} material={materials.screen}>
                  <boxGeometry args={[0.06, 0.05, 0.004]} />
                </mesh>
                <mesh position={[0.03, -0.14, 0]} material={materials.dark}>
                  <cylinderGeometry args={[0.006, 0.006, 0.14, 5]} />
                </mesh>
              </group>
              <group ref={wrench} position={[0, -0.36, 0.05]} rotation={[0.3, 0, 0]} visible={false}>
                <mesh material={materials.steel}>
                  <boxGeometry args={[0.03, 0.28, 0.02]} />
                </mesh>
                <mesh position={[0, 0.15, 0]} material={materials.steel}>
                  <boxGeometry args={[0.07, 0.06, 0.025]} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
