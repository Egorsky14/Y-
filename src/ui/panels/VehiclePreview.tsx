import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PaintId, VehicleClass, VehicleUpgradeId } from '@/game/fleet/vehicleCatalog';
import { VehicleGltf } from '@/world/vehicles/VehicleGltf';
import { StudioEnvironment } from '@/world/scene/StudioEnvironment';
import { deviceProfile } from '@/app/device';
import { VEHICLE_PAINT } from '@/world/assets/palette';

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.5;
  });
  return <group ref={ref}>{children}</group>;
}

/**
 * Compiles the preview's shaders off the main thread (KHR_parallel_shader_compile through
 * renderer.compileAsync) before the first frame. Compiling them on the first render froze the
 * whole game for ~0.9 s when the Fleet panel opened.
 */
function Warmup({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let alive = true;
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .then(() => {
        if (alive) onReady();
      });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

/**
 * Phones and tablets: a pre-rendered image per vehicle class (public/previews, rendered from this
 * same preview on desktop by docs/art/scripts/previews.cjs) instead of a second WebGL context.
 */
function StaticPreview({ classId, paint }: { classId: VehicleClass; paint: PaintId }) {
  return (
    <div className="vehicle-preview static" data-testid="vehicle-preview-static">
      <img src={`${import.meta.env.BASE_URL}previews/${classId}.webp`} alt={`${classId.replace('-', ' ')} preview`} loading="lazy" decoding="async" />
      <span className="paint-swatch" style={{ background: VEHICLE_PAINT[paint] }} title={paint} />
    </div>
  );
}

/** Small turntable render used in the fleet marketplace and garage (static image on touch devices). */
export function VehiclePreview(props: { classId: VehicleClass; paint: PaintId; upgrades: VehicleUpgradeId[]; onReady?: () => void }) {
  if (deviceProfile().touch && !props.onReady) return <StaticPreview classId={props.classId} paint={props.paint} />;
  return <TurntablePreview {...props} />;
}

function TurntablePreview({ classId, paint, upgrades, onReady: notify }: { classId: VehicleClass; paint: PaintId; upgrades: VehicleUpgradeId[]; onReady?: () => void }) {
  const size = classId === 'box-truck' ? 15 : classId === 'compact-van' ? 8 : 9.5;
  const [ready, setReady] = useState(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const [onReady] = useState(() => () => {
    setReady(true);
    notifyRef.current?.();
  });
  return (
    <div className="vehicle-preview">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={ready ? 'always' : 'never'}
        style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.25s ease-out' }}
        camera={{ position: [size * 0.72, size * 0.36, size * 0.72], fov: 32 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
        shadows
        onCreated={({ gl }) => {
          // As in GameScene: synchronous shader-log reads stall on slow drivers.
          gl.debug.checkShaderErrors = import.meta.env.DEV;
        }}
      >
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
          <Warmup onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}

let warmed = false;

/**
 * Once per session, while a game is starting, renders a hidden preview off-screen and removes it.
 * The preview has its own WebGL context, and ANGLE (D3D11) finishes its shader programs only on
 * first draw; Chrome then caches the binaries, so the first Fleet panel opens without a ~0.5-0.9 s
 * freeze. The cost lands in the start-up frames, where the world is compiling anyway.
 */
export function PreviewWarmup() {
  const [done, setDone] = useState(warmed);
  const [onReady] = useState(() => () => {
    // Keep it a few frames after the first draw so every program (shadow pass included) is built.
    setTimeout(() => {
      warmed = true;
      setDone(true);
    }, 400);
  });
  if (done) return null;
  return (
    <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 320, height: 200, pointerEvents: 'none' }}>
      <VehiclePreview classId="compact-van" paint="ego-black" upgrades={['full-wrap', 'ladder-rack']} onReady={onReady} />
    </div>
  );
}
