import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
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
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[size[0] + 0.16, size[1] + 0.16]} />
      <meshStandardMaterial map={map} color="#9cc4e0" roughness={0.25} metalness={0.35} emissive="#1c3550" emissiveIntensity={0.2} />
    </mesh>
  );
}

/** Live fan blades for a condenser whose cabinet is merged into the neighborhood mesh; spins while the unit runs. */
export function CondenserFan({ running = false, size = 0.92, top = 0.1 + 0.86 }: { running?: boolean; size?: number; top?: number }) {
  const hub = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (hub.current && running) hub.current.rotation.y += dt * 9;
  });
  return (
    <group ref={hub} position={[0, top - 0.055, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.cos((i / 3) * 6.283) * size * 0.17, 0, Math.sin((i / 3) * 6.283) * size * 0.17]} rotation={[0.5, -(i / 3) * 6.283, 0]}>
          <boxGeometry args={[size * 0.3, 0.01, 0.09]} />
          <meshStandardMaterial color="#b9bec3" roughness={0.4} metalness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
