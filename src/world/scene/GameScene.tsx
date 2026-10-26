import { Suspense } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { useApp, useGame } from '@/app/store';
import { CameraRig, DEFAULT_OFFSET, DEFAULT_TARGET } from './CameraRig';
import { Atmosphere } from './Atmosphere';
import { NightLights } from './NightLights';
import { Ground } from '../city/Ground';
import { Roads } from '../roads/Roads';
import { House } from '../buildings/House';
import { buildNeighborhood } from '../buildings/HouseBuilder';
import { useMemo } from 'react';
import { Headquarters } from '../buildings/Headquarters';
import { CompetitorBuilding, Park, SupplyWarehouse } from '../buildings/Commercial';
import { Vegetation } from '../city/Vegetation';
import { JobMarkers, JobSiteProps, Vehicles, Workers } from './LiveEntities';
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
  const statics = useMemo(() => buildNeighborhood(HOUSE_LOTS), []);
  return (
    <>
      <primitive object={statics} />
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
      dpr={quality === 'ultra' ? [1, 2] : quality === 'high' ? [1, 1.5] : quality === 'medium' ? [1, 1.25] : 1}
      camera={{ position: [initial.x, initial.y, initial.z], fov: 38, near: 1, far: 3000 }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        // Synchronous shader-log reads stall startup on slow drivers; errors still surface via the console.
        gl.debug.checkShaderErrors = import.meta.env.DEV;
      }}
      onPointerMissed={(e) => {
        if (e.button === 0) select(null);
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>
        <Atmosphere />
        <NightLights />
        <StudioEnvironment />
        <Ground />
        <Roads />
        <Vegetation />
        <Houses />
        <Headquarters />
        <SupplyWarehouse />
        <CompetitorBuilding />
        <Park />
        <Vehicles />
        <Workers />
        <JobSiteProps />
        <JobMarkers />
        <CameraRig />
        <LabelProjector />
        <RenderProbe />
      </Suspense>
    </Canvas>
  );
}
