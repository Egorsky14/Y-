import { Suspense } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { useApp, useGame } from '@/app/store';
import { CameraRig, DEFAULT_OFFSET, DEFAULT_TARGET } from './CameraRig';
import { Lighting } from './Lighting';
import { Ground } from '../city/Ground';
import { Roads } from '../roads/Roads';
import { House } from '../buildings/House';
import { Headquarters } from '../buildings/Headquarters';
import { CompetitorBuilding, Park, SupplyWarehouse } from '../buildings/Commercial';
import { Landscaping } from '../city/Landscaping';
import { JobMarkers, Vehicles, Workers } from './LiveEntities';
import { HOUSE_LOTS } from '@/game/world/cityLayout';
import { LabelProjector } from '../interactions/LabelProjector';
import { RenderProbe } from './RenderProbe';
import { StudioEnvironment } from './StudioEnvironment';
import { preloadVehicleModels } from '../vehicles/VehicleGltf';

preloadVehicleModels();

function Houses() {
  const activeLots = useGame((s) =>
    Object.values(s.jobs)
      .filter((j) => !['completed', 'declined', 'expired', 'cancelled', 'lead'].includes(j.status))
      .map((j) => s.customers[j.customerId].lotId)
      .sort()
      .join('|'),
  );
  const active = new Set(activeLots.split('|'));
  return (
    <>
      {HOUSE_LOTS.map((lot) => (
        <House key={lot.id} lot={lot} hasActiveJob={active.has(lot.id)} />
      ))}
    </>
  );
}

export function GameScene() {
  const select = useApp((s) => s.select);
  const quality = useApp((s) => s.settings.quality);
  const initial = DEFAULT_TARGET.clone().add(DEFAULT_OFFSET);
  return (
    <Canvas
      shadows={quality !== 'low'}
      dpr={quality === 'high' ? [1, 1.75] : quality === 'medium' ? [1, 1.25] : 1}
      camera={{ position: [initial.x, initial.y, initial.z], fov: 42, near: 1, far: 2500 }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onPointerMissed={(e) => {
        if (e.button === 0) select(null);
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <fog attach="fog" args={['#cfe0ea', 420, 1300]} />
      <Suspense fallback={null}>
        <Lighting />
        <StudioEnvironment />
        <Ground />
        <Roads />
        <Landscaping />
        <Houses />
        <Headquarters />
        <SupplyWarehouse />
        <CompetitorBuilding />
        <Park />
        <Vehicles />
        <Workers />
        <JobMarkers />
        <CameraRig />
        <LabelProjector />
        <RenderProbe />
      </Suspense>
    </Canvas>
  );
}
