import { useMemo } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../assets/palette';
import { windowTexture } from '../assets/textures';

/** Gable roof: triangular prism along the x axis (ridge runs along x). */
export function GableRoof({ width, depth, height, y, color, overhang = 0.6 }: { width: number; depth: number; height: number; y: number; color: string; overhang?: number }) {
  const geometry = useMemo(() => {
    const w = depth / 2 + overhang;
    const shape = new THREE.Shape();
    shape.moveTo(-w, 0);
    shape.lineTo(w, 0);
    shape.lineTo(0, height);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: width + overhang * 2, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-(width / 2 + overhang), 0, 0);
    return geo;
  }, [width, depth, height, overhang]);
  return (
    <mesh geometry={geometry} position={[0, y, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

/** Hip roof approximated with a 4-sided pyramid scaled to the footprint. */
export function HipRoof({ width, depth, height, y, color, overhang = 0.7 }: { width: number; depth: number; height: number; y: number; color: string; overhang?: number }) {
  return (
    <mesh position={[0, y + height / 2, 0]} rotation={[0, Math.PI / 4, 0]} scale={[(width + overhang * 2) / Math.SQRT2, 1, (depth + overhang * 2) / Math.SQRT2]} castShadow receiveShadow>
      <coneGeometry args={[1, height, 4]} />
      <meshStandardMaterial color={color} roughness={0.9} flatShading />
    </mesh>
  );
}

export function Box({ size, position, color, rotation, castShadow = true, roughness = 0.85, metalness = 0, emissive, emissiveIntensity, map }: { size: [number, number, number]; position: [number, number, number]; color: string; rotation?: [number, number, number]; castShadow?: boolean; roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number; map?: THREE.Texture }) {
  return (
    <mesh position={position} rotation={rotation} castShadow={castShadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive ?? '#000000'} emissiveIntensity={emissiveIntensity ?? 0} map={map} />
    </mesh>
  );
}

export function Window({ position, size = [1.3, 1.1], rotation }: { position: [number, number, number]; size?: [number, number]; rotation?: [number, number, number] }) {
  const map = useMemo(() => windowTexture(), []);
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={size} />
        <meshStandardMaterial map={map} color={PALETTE.glass} roughness={0.2} metalness={0.4} emissive="#1c3550" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[size[0] + 0.16, size[1] + 0.16]} />
        <meshStandardMaterial color={PALETTE.trim} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Outdoor condenser unit: the heart of HVAC gameplay, so it is detailed. */
export function Condenser({ position, running = false }: { position: [number, number, number]; running?: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[1.3, 0.12, 1.3]} />
        <meshStandardMaterial color="#9b9b9b" roughness={1} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.95, 0.85, 0.95]} />
        <meshStandardMaterial color={PALETTE.condenser} roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Louvered panels */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.sin((i * Math.PI) / 2) * 0.48, 0.5, Math.cos((i * Math.PI) / 2) * 0.48]} rotation={[0, (i * Math.PI) / 2, 0]}>
          <planeGeometry args={[0.8, 0.7]} />
          <meshStandardMaterial color="#8d949b" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, 0.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.12, 0.42, 20]} />
        <meshStandardMaterial color="#2b2f33" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.97, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.1, 12]} />
        <meshStandardMaterial color={running ? PALETTE.egoTeal : '#55595e'} emissive={running ? PALETTE.egoTeal : '#000'} emissiveIntensity={running ? 0.6 : 0} />
      </mesh>
      {/* Line set and disconnect box on the wall side */}
      <mesh position={[0.5, 0.35, 0.3]}>
        <boxGeometry args={[0.18, 0.28, 0.12]} />
        <meshStandardMaterial color="#c7c7c7" roughness={0.7} metalness={0.3} />
      </mesh>
    </group>
  );
}
