import { useMemo } from 'react';
import * as THREE from 'three';
import { sandTexture, gravelTexture } from '../assets/textures';
import { PALETTE } from '../assets/palette';
import { HOUSE_LOTS, PARK_LOT, WORLD_HALF } from '@/game/world/cityLayout';

export function Ground() {
  const sand = useMemo(() => sandTexture(), []);
  const gravel = useMemo(() => gravelTexture(), []);
  return (
    <group>
      {/* Desert floor extends well beyond the neighborhood. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[WORLD_HALF * 8, WORLD_HALF * 8]} />
        <meshStandardMaterial map={sand} color="#efdcb6" roughness={1} />
      </mesh>
      {/* Residential lots use decorative gravel (xeriscape). */}
      {HOUSE_LOTS.map((lot) => (
        <mesh key={lot.id} rotation={[-Math.PI / 2, 0, 0]} position={[lot.center.x, 0.0, lot.center.z]} receiveShadow>
          <planeGeometry args={[lot.width - 0.6, lot.depth - 0.6]} />
          <meshStandardMaterial map={gravel} color={PALETTE.gravel} roughness={1} />
        </mesh>
      ))}
      {/* Park turf */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[PARK_LOT.center.x, 0.01, PARK_LOT.center.z]} receiveShadow>
        <planeGeometry args={[PARK_LOT.width - 2, PARK_LOT.depth - 2]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
      <Mountains />
    </group>
  );
}

function Mountains() {
  const peaks = useMemo(() => {
    const out: { x: number; z: number; r: number; h: number; far: boolean }[] = [];
    let s = 99;
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2 + rnd() * 0.1;
      const far = i % 2 === 0;
      const dist = far ? 760 + rnd() * 120 : 560 + rnd() * 100;
      out.push({ x: Math.cos(a) * dist, z: Math.sin(a) * dist, r: 90 + rnd() * 110, h: (far ? 70 : 45) + rnd() * 60, far });
    }
    return out;
  }, []);
  return (
    <group>
      {peaks.map((p, i) => (
        <mesh key={i} position={[p.x, 0, p.z]} frustumCulled>
          <coneGeometry args={[p.r, p.h, 6]} />
          <meshStandardMaterial color={p.far ? PALETTE.mountainsFar : PALETTE.mountains} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function useStandard(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }), [color]);
}
