import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { getGameState, useApp } from '@/app/store';
import { sunAngles, weatherForDay, type WeatherKind } from '@/game/simulation/weather';
import { STATIC_MATERIALS } from '../buildings/materials';

/**
 * Time-of-day and weather driven lighting: a sun that follows the game clock, hemisphere
 * sky light, a gradient sky dome, matched fog, exposure, and monsoon rain. All parameters
 * ease toward their targets so day changes and weather shifts never pop.
 */

interface Look {
  sunIntensity: number;
  sunColor: THREE.Color;
  skyZenith: THREE.Color;
  skyHorizon: THREE.Color;
  ground: THREE.Color;
  hemi: number;
  ambient: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
  rain: number;
  envIntensity: number;
}


function lookFor(minute: number, weather: WeatherKind): Look {
  const { elevation } = sunAngles(minute);
  const day = THREE.MathUtils.clamp(elevation / 0.35, 0, 1); // 0 night → 1 full day
  const golden = THREE.MathUtils.clamp(1 - Math.abs(elevation - 0.18) / 0.2, 0, 1) * day; // low sun warmth
  const night = 1 - THREE.MathUtils.clamp((elevation + 0.1) / 0.25, 0, 1);

  const sunDay = new THREE.Color('#fff1dc').lerp(new THREE.Color('#ffb36b'), golden * 0.8);
  const zenithDay = new THREE.Color('#5f9fd8');
  const horizonDay = new THREE.Color('#d8e6ee');
  const zenithNight = new THREE.Color('#0b1626');
  const horizonNight = new THREE.Color('#1d2a3d');
  const horizonGolden = new THREE.Color('#f2b27a');

  let look: Look = {
    sunIntensity: 2.6 * day,
    sunColor: sunDay,
    skyZenith: zenithDay.clone().lerp(zenithNight, night),
    skyHorizon: horizonDay.clone().lerp(horizonGolden, golden * 0.7).lerp(horizonNight, night),
    ground: new THREE.Color('#c9a97a').lerp(new THREE.Color('#2a2d36'), night),
    hemi: 0.85 * (0.25 + 0.75 * day),
    ambient: 0.25 * (0.3 + 0.7 * day),
    fogNear: 420,
    fogFar: 1400,
    exposure: 1.0 - night * 0.35,
    rain: 0,
    envIntensity: 0.45 * (0.3 + 0.7 * day),
  };
  switch (weather) {
    case 'heat-wave':
      look = { ...look, sunIntensity: look.sunIntensity * 1.08, sunColor: look.sunColor.clone().lerp(new THREE.Color('#ffd9a8'), 0.4), skyHorizon: look.skyHorizon.clone().lerp(new THREE.Color('#e9d6b8'), 0.5 * day), fogNear: 260, fogFar: 1000, exposure: look.exposure * 1.04 };
      break;
    case 'overcast':
      look = { ...look, sunIntensity: look.sunIntensity * 0.45, sunColor: new THREE.Color('#e6e9ee'), skyZenith: look.skyZenith.clone().lerp(new THREE.Color('#7d8894'), 0.85 * day), skyHorizon: look.skyHorizon.clone().lerp(new THREE.Color('#aab3bc'), 0.85 * day), hemi: look.hemi * 1.25, ambient: look.ambient * 1.3, fogNear: 300, fogFar: 1100, exposure: look.exposure * 0.95 };
      break;
    case 'monsoon':
      look = { ...look, sunIntensity: look.sunIntensity * 0.18, sunColor: new THREE.Color('#cfd5df'), skyZenith: look.skyZenith.clone().lerp(new THREE.Color('#3f4953'), 0.92 * day), skyHorizon: look.skyHorizon.clone().lerp(new THREE.Color('#6f7a85'), 0.92 * day), ground: look.ground.clone().lerp(new THREE.Color('#4e4c48'), 0.6), hemi: look.hemi * 0.9, ambient: look.ambient * 1.0, fogNear: 150, fogFar: 700, exposure: look.exposure * 0.78, rain: day > 0.2 ? 1 : 0.6, envIntensity: look.envIntensity * 1.2 };
      break;
  }
  return look;
}

const SKY_VERT = `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SKY_FRAG = `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunTint; uniform float sunGlow; varying vec3 vWorld;
void main(){ vec3 d = normalize(vWorld - cameraPosition); float h = clamp(d.y, 0.0, 1.0); float t = pow(h, 0.55);
vec3 col = mix(horizon, zenith, t); float s = max(dot(d, sunDir), 0.0); col += sunTint * (pow(s, 180.0) * 1.2 + pow(s, 8.0) * 0.12) * sunGlow;
gl_FragColor = vec4(col, 1.0); }`;

declare global {
  interface Window {
    __egoAtmo?: { minute: number; weather: string; elevation: number; sunIntensity: number; exposure: number; fogNear: number; rain: number };
  }
}

export function Atmosphere() {
  const quality = useApp((s) => s.settings.quality);
  const shadows = useApp((s) => s.settings.shadows);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const sky = useRef<THREE.Mesh>(null);
  const current = useRef<Look | null>(null);
  const mapSize = quality === 'ultra' ? 4096 : quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
  const shadowRadius = quality === 'ultra' ? 180 : quality === 'high' ? 230 : 260;
  const skyMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { zenith: { value: new THREE.Color('#5f9fd8') }, horizon: { value: new THREE.Color('#d8e6ee') }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunTint: { value: new THREE.Color('#fff0d0') }, sunGlow: { value: 1 } },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  const fog = useMemo(() => new THREE.Fog('#cfe0ea', 420, 1400), []);

  useFrame((_, dt) => {
    const state = getGameState();
    const minute = state?.clock.minute ?? 10 * 60;
    const weather = state ? weatherForDay(state.seed, state.clock.day).kind : 'clear';
    const target = lookFor(minute, weather);
    const k = Math.min(1, dt * 1.5);
    if (!current.current) current.current = target;
    const c = current.current;
    c.sunIntensity += (target.sunIntensity - c.sunIntensity) * k;
    c.hemi += (target.hemi - c.hemi) * k;
    c.ambient += (target.ambient - c.ambient) * k;
    c.fogNear += (target.fogNear - c.fogNear) * k;
    c.fogFar += (target.fogFar - c.fogFar) * k;
    c.exposure += (target.exposure - c.exposure) * k;
    c.rain += (target.rain - c.rain) * k;
    c.envIntensity += (target.envIntensity - c.envIntensity) * k;
    c.sunColor.lerp(target.sunColor, k);
    c.skyZenith.lerp(target.skyZenith, k);
    c.skyHorizon.lerp(target.skyHorizon, k);
    c.ground.lerp(target.ground, k);

    const { elevation, azimuth } = sunAngles(minute);
    const el = Math.max(elevation, 0.06);
    const dir = new THREE.Vector3(Math.cos(azimuth) * Math.cos(el), Math.sin(el), Math.sin(azimuth) * Math.cos(el));
    if (sun.current) {
      sun.current.position.copy(dir.clone().multiplyScalar(320));
      sun.current.intensity = c.sunIntensity;
      sun.current.color.copy(c.sunColor);
      sun.current.target.position.set(0, 0, 0);
      sun.current.target.updateMatrixWorld();
    }
    if (hemi.current) {
      hemi.current.intensity = c.hemi;
      hemi.current.color.copy(c.skyHorizon);
      hemi.current.groundColor.copy(c.ground);
    }
    if (ambient.current) ambient.current.intensity = c.ambient;
    skyMaterial.uniforms.zenith.value.copy(c.skyZenith);
    skyMaterial.uniforms.horizon.value.copy(c.skyHorizon);
    skyMaterial.uniforms.sunDir.value.copy(dir);
    skyMaterial.uniforms.sunTint.value.copy(c.sunColor);
    skyMaterial.uniforms.sunGlow.value = weather === 'overcast' || weather === 'monsoon' ? 0.15 : 1;
    fog.color.copy(c.skyHorizon);
    fog.near = c.fogNear;
    fog.far = c.fogFar;
    if (scene.fog !== fog) scene.fog = fog;
    gl.toneMappingExposure = c.exposure;
    scene.environmentIntensity = c.envIntensity;
    // Exterior lamps come on as the sun drops.
    const night = 1 - THREE.MathUtils.clamp((elevation + 0.05) / 0.3, 0, 1);
    (STATIC_MATERIALS.lamp() as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + night * 3.2;
    (STATIC_MATERIALS.storefront() as THREE.MeshStandardMaterial).emissive.setRGB(0.9 * night, 0.75 * night, 0.45 * night);
    window.__egoAtmo = { minute, weather, elevation, sunIntensity: c.sunIntensity, exposure: c.exposure, fogNear: c.fogNear, rain: c.rain };
    if (sky.current) sky.current.position.copy(camera.position);
  });

  return (
    <>
      <mesh ref={sky} material={skyMaterial} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[2000, 32, 16]} />
      </mesh>
      <hemisphereLight ref={hemi} args={['#dff1ff', '#c9a97a', 0.8]} />
      <ambientLight ref={ambient} intensity={0.22} />
      <directionalLight
        ref={sun}
        position={[140, 180, 90]}
        intensity={2.4}
        color="#fff1dc"
        castShadow={shadows && quality !== 'low'}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.04}
        shadow-camera-left={-shadowRadius}
        shadow-camera-right={shadowRadius}
        shadow-camera-top={shadowRadius}
        shadow-camera-bottom={-shadowRadius}
        shadow-camera-near={20}
        shadow-camera-far={760}
      />
      <Rain />
    </>
  );
}

/** Instanced rain streaks that follow the camera target during monsoon weather. */
function Rain() {
  const quality = useApp((s) => s.settings.quality);
  const count = quality === 'low' ? 0 : quality === 'medium' ? 900 : quality === 'high' ? 1800 : 3000;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((s) => s.camera);
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({ x: (Math.sin(i * 12.9898) * 43758.5453) % 1, z: (Math.sin(i * 78.233) * 12345.678) % 1, y: (Math.sin(i * 3.1) * 999) % 1 })), [count]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const state = getGameState();
    const weather = state ? weatherForDay(state.seed, state.clock.day).kind : 'clear';
    const active = weather === 'monsoon';
    const im = mesh.current;
    if (!im) return;
    im.visible = active;
    if (!active) return;
    const t = clock.getElapsedTime();
    const cx = camera.position.x;
    const cz = camera.position.z;
    const spread = 90;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      const y = 40 - (((t * 38 + s.y * 40) % 40) + 0);
      m.makeTranslation(cx + (Math.abs(s.x) - 0.5) * spread * 2, y, cz + (Math.abs(s.z) - 0.5) * spread * 2 - 30);
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
  });
  if (count === 0) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false} visible={false}>
      <boxGeometry args={[0.03, 0.9, 0.03]} />
      <meshBasicMaterial color="#cfe3f2" transparent opacity={0.45} depthWrite={false} />
    </instancedMesh>
  );
}
