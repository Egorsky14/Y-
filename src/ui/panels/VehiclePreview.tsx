import { Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { PaintId, VehicleClass, VehicleUpgradeId } from '@/game/fleet/vehicleCatalog';
import { VehicleGltf } from '@/world/vehicles/VehicleGltf';
import { StudioEnvironment } from '@/world/scene/StudioEnvironment';

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.5;
  });
  return <group ref={ref}>{children}</group>;
}

/** Small turntable render used in the fleet marketplace and garage. */
export function VehiclePreview({ classId, paint, upgrades }: { classId: VehicleClass; paint: PaintId; upgrades: VehicleUpgradeId[] }) {
  const size = classId === 'box-truck' ? 15 : classId === 'compact-van' ? 8 : 9.5;
  return (
    <div className="vehicle-preview">
      <Canvas dpr={[1, 1.5]} camera={{ position: [size * 0.72, size * 0.36, size * 0.72], fov: 32 }} gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }} shadows>
        <hemisphereLight args={['#eaf6ff', '#4a5563', 1.6]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[8, 12, 6]} intensity={3.2} color="#fff4e0" castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-8, 5, -6]} intensity={1.6} color="#9fd8ff" />
        <directionalLight position={[0, 4, -10]} intensity={1.2} color="#ffffff" />
        <StudioEnvironment intensity={1.1} />
        <Suspense fallback={null}>
          <Turntable>
            <group position={[0, -0.9, 0]}>
              <VehicleGltf classId={classId} paint={paint} upgrades={upgrades} />
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <circleGeometry args={[size * 0.5, 48]} />
                <meshStandardMaterial color="#3a4553" roughness={0.55} metalness={0.15} />
              </mesh>
            </group>
          </Turntable>
        </Suspense>
      </Canvas>
    </div>
  );
}
