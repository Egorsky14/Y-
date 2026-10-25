import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { EmployeeRole } from '@/game/employees/roles';
import { PALETTE } from '../assets/palette';

export type WorkerAnim = 'idle' | 'walk' | 'work' | 'train';

interface WorkerProps {
  role: EmployeeRole;
  look: number;
  anim: WorkerAnim;
  scale?: number;
}

const SKIN = ['#f1c7a6', '#d9a57c', '#b97a52', '#8d5a3b', '#f6d7bf', '#6b4430'];
const HAIR = ['#2b1d14', '#4a2f1d', '#8a6a3c', '#1a1a1a', '#b3833f', '#5a5a5a'];
const ROLE_SHIRT: Record<EmployeeRole, string> = {
  technician: PALETTE.egoBlack,
  installer: '#2f3a44',
  dispatcher: '#f3f4f6',
  'comfort-advisor': '#1b8f86',
};

/**
 * Stylized humanoid with procedural animation: walk cycle, kneeling work loop, idle sway.
 * ~1.75 m tall so it reads correctly next to vehicles and condensers.
 */
export function Worker({ role, look, anim, scale = 1 }: WorkerProps) {
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const skin = SKIN[look % SKIN.length];
  const hair = HAIR[(look >> 3) % HAIR.length];
  const shirt = ROLE_SHIRT[role];
  const phase = (look % 100) / 100 * Math.PI * 2;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phase;
    if (!root.current || !legL.current || !legR.current || !armL.current || !armR.current || !torso.current) return;
    if (anim === 'walk') {
      const s = Math.sin(t * 7);
      legL.current.rotation.x = s * 0.7;
      legR.current.rotation.x = -s * 0.7;
      armL.current.rotation.x = -s * 0.6;
      armR.current.rotation.x = s * 0.6;
      torso.current.rotation.x = 0.05;
      root.current.position.y = Math.abs(Math.cos(t * 7)) * 0.05;
    } else if (anim === 'work') {
      // Kneeling at the unit, arms working.
      legL.current.rotation.x = -1.3;
      legR.current.rotation.x = -0.4;
      torso.current.rotation.x = 0.45;
      armL.current.rotation.x = -1.2 + Math.sin(t * 5) * 0.25;
      armR.current.rotation.x = -1.4 + Math.cos(t * 6) * 0.3;
      root.current.position.y = -0.42;
    } else if (anim === 'train') {
      legL.current.rotation.x = 0;
      legR.current.rotation.x = 0;
      torso.current.rotation.x = 0.1;
      armL.current.rotation.x = -0.9;
      armR.current.rotation.x = -0.9 + Math.sin(t * 2) * 0.1;
      root.current.position.y = 0;
    } else {
      legL.current.rotation.x = 0;
      legR.current.rotation.x = 0;
      torso.current.rotation.x = Math.sin(t * 1.2) * 0.02;
      armL.current.rotation.x = Math.sin(t * 1.1) * 0.05;
      armR.current.rotation.x = -Math.sin(t * 1.1) * 0.05;
      root.current.position.y = 0;
    }
  });

  return (
    <group ref={root} scale={scale}>
      {/* Legs */}
      <group ref={legL} position={[-0.12, 0.85, 0]}>
        <mesh position={[0, -0.42, 0]} castShadow>
          <boxGeometry args={[0.17, 0.84, 0.2]} />
          <meshStandardMaterial color="#3a3f46" roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.86, 0.05]} castShadow>
          <boxGeometry args={[0.19, 0.1, 0.3]} />
          <meshStandardMaterial color="#1d1f22" roughness={0.9} />
        </mesh>
      </group>
      <group ref={legR} position={[0.12, 0.85, 0]}>
        <mesh position={[0, -0.42, 0]} castShadow>
          <boxGeometry args={[0.17, 0.84, 0.2]} />
          <meshStandardMaterial color="#3a3f46" roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.86, 0.05]} castShadow>
          <boxGeometry args={[0.19, 0.1, 0.3]} />
          <meshStandardMaterial color="#1d1f22" roughness={0.9} />
        </mesh>
      </group>
      {/* Torso */}
      <group ref={torso} position={[0, 0.85, 0]}>
        <mesh position={[0, 0.32, 0]} castShadow>
          <boxGeometry args={[0.46, 0.64, 0.26]} />
          <meshStandardMaterial color={shirt} roughness={0.85} />
        </mesh>
        {/* Teal chest logo / name badge */}
        <mesh position={[-0.1, 0.45, 0.135]}>
          <boxGeometry args={[0.1, 0.06, 0.01]} />
          <meshStandardMaterial color={PALETTE.egoTeal} emissive={PALETTE.egoTeal} emissiveIntensity={0.4} />
        </mesh>
        {/* Tool belt */}
        {role !== 'dispatcher' && role !== 'comfort-advisor' && (
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.5, 0.1, 0.3]} />
            <meshStandardMaterial color="#6b4a2c" roughness={0.9} />
          </mesh>
        )}
        {/* Head */}
        <mesh position={[0, 0.82, 0]} castShadow>
          <sphereGeometry args={[0.16, 14, 12]} />
          <meshStandardMaterial color={skin} roughness={0.8} />
        </mesh>
        {/* Cap or hair */}
        {role === 'technician' || role === 'installer' ? (
          <group position={[0, 0.9, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={PALETTE.egoTeal} roughness={0.8} />
            </mesh>
            <mesh position={[0, -0.02, 0.17]}>
              <boxGeometry args={[0.26, 0.03, 0.16]} />
              <meshStandardMaterial color={PALETTE.egoTeal} roughness={0.8} />
            </mesh>
          </group>
        ) : (
          <mesh position={[0, 0.9, 0]} castShadow>
            <sphereGeometry args={[0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={hair} roughness={0.9} />
          </mesh>
        )}
        {/* Arms */}
        <group ref={armL} position={[-0.3, 0.6, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <boxGeometry args={[0.13, 0.6, 0.14]} />
            <meshStandardMaterial color={shirt} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.62, 0]}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.8} />
          </mesh>
        </group>
        <group ref={armR} position={[0.3, 0.6, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <boxGeometry args={[0.13, 0.6, 0.14]} />
            <meshStandardMaterial color={shirt} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.62, 0]}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.8} />
          </mesh>
          {/* Multimeter in hand when working */}
          {anim === 'work' && (
            <mesh position={[0, -0.68, 0.08]}>
              <boxGeometry args={[0.1, 0.16, 0.04]} />
              <meshStandardMaterial color="#f2c230" roughness={0.6} />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}
