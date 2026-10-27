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
  const day = THREE.MathUtils.clamp(elevation / 0.32, 0, 1); // 0 night → 1 full day
  // Sun strength also falls with sun height (atmospheric path length), so late afternoon reads
  // as evening instead of noon: noon 1, 08:00 ≈ 0.79, 18:30 ≈ 0.55 of full sun.
  const sunHeight = Math.pow(THREE.MathUtils.clamp(elevation / 1.22, 0, 1), 0.55);
  const daylight = day * (0.35 + 0.65 * sunHeight);
  // Low-sun warmth builds through the late afternoon (about 16:30 in summer) and peaks just
  // before sunset, so the hours before dusk read as golden hour rather than noon.
  const golden = Math.pow(THREE.MathUtils.clamp((0.86 - elevation) / 0.72, 0, 1), 0.9) * THREE.MathUtils.clamp(elevation / 0.05, 0, 1);
  const twilight = THREE.MathUtils.clamp(1 - Math.abs(elevation + 0.08) / 0.16, 0, 1); // just below the horizon: magenta sky
  const night = 1 - THREE.MathUtils.clamp((elevation + 0.12) / 0.26, 0, 1);

  const sunDay = new THREE.Color('#fff4e2').lerp(new THREE.Color('#ffb066'), golden * 0.85);
  const zenithDay = new THREE.Color('#3f86d0');
  const horizonDay = new THREE.Color('#d7e4ec');
  const zenithNight = new THREE.Color('#0b1730');
  const horizonNight = new THREE.Color('#1f3049');
  const horizonGolden = new THREE.Color('#f1b07a');
  const horizonTwilight = new THREE.Color('#c97482');

  let look: Look = {
    // Night keeps a cool moon so forms stay readable; day is a strong warm sun with real contrast.
    sunIntensity: 3.0 * daylight + 0.42 * night,
    sunColor: sunDay.clone().lerp(new THREE.Color('#6a8de6'), night),
    skyZenith: zenithDay.clone().lerp(new THREE.Color('#4a74a8'), golden * 0.35).lerp(new THREE.Color('#3b5f8e'), twilight * 0.6).lerp(zenithNight, night),
    skyHorizon: horizonDay.clone().lerp(horizonGolden, golden * 0.8).lerp(horizonTwilight, twilight * 0.7).lerp(horizonNight, night),
    ground: new THREE.Color('#c4a47a').lerp(new THREE.Color('#b0805a'), golden * 0.45).lerp(new THREE.Color('#18233a'), night),
    hemi: 0.74 * (0.22 + 0.78 * day) * (0.78 + 0.22 * sunHeight) + 0.12 * twilight + 0.1 * night,
    ambient: 0.16 * (0.3 + 0.7 * day) + 0.05 * night,
    fogNear: 240,
    fogFar: 2100,
    exposure: 0.98 - night * 0.22 + golden * 0.05 - (1 - sunHeight) * day * 0.05,
    rain: 0,
    envIntensity: 0.55 * (0.2 + 0.8 * day),
  };
  switch (weather) {
    case 'heat-wave':
      look = { ...look, sunIntensity: look.sunIntensity * 1.06, sunColor: look.sunColor.clone().lerp(new THREE.Color('#ffd9a8'), 0.4), skyZenith: look.skyZenith.clone().lerp(new THREE.Color('#9fb6c8'), 0.3 * day), skyHorizon: look.skyHorizon.clone().lerp(new THREE.Color('#e9d6b8'), 0.55 * day), fogNear: 220, fogFar: 900, exposure: look.exposure * 1.03 };
      break;
    case 'overcast':
      look = { ...look, sunIntensity: look.sunIntensity * 0.42, sunColor: new THREE.Color('#e6e9ee'), skyZenith: look.skyZenith.clone().lerp(new THREE.Color('#7d8894'), 0.85 * day), skyHorizon: look.skyHorizon.clone().lerp(new THREE.Color('#aab3bc'), 0.85 * day), hemi: look.hemi * 1.3, ambient: look.ambient * 1.35, fogNear: 280, fogFar: 1100, exposure: look.exposure * 0.94 };
      break;
    case 'monsoon':
      look = { ...look, sunIntensity: look.sunIntensity * 0.16, sunColor: new THREE.Color('#cfd5df'), skyZenith: look.skyZenith.clone().lerp(new THREE.Color('#3a434d'), 0.92 * day), skyHorizon: look.skyHorizon.clone().lerp(new THREE.Color('#6a747f'), 0.92 * day), ground: look.ground.clone().lerp(new THREE.Color('#4e4c48'), 0.6), hemi: look.hemi * 0.95, ambient: look.ambient * 1.1, fogNear: 140, fogFar: 650, exposure: look.exposure * 0.76, rain: day > 0.2 ? 1 : 0.6, envIntensity: look.envIntensity * 1.3 };
      break;
  }
  return look;
}

/** Soft cumulus layer: a few hundred overlapping discs on an alpha canvas, tiled over the valley. */
function cloudTexture(): THREE.Texture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 9; k++) {
    const cx = rnd() * size;
    const cy = rnd() * size;
    const n = 14 + Math.floor(rnd() * 12);
    for (let i = 0; i < n; i++) {
      const r = 18 + rnd() * 34;
      const x = cx + (rnd() - 0.5) * 120;
      const y = cy + (rnd() - 0.5) * 50;
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.7, 'rgba(255,255,255,0.22)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  const lastMinute = useRef<number | null>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const cloudMaterial = useMemo(() => new THREE.MeshBasicMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, opacity: 0.4, color: '#ffffff', fog: false }), []);
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
    const photo = useApp.getState().photo;
    const minute = photo.on && photo.minute !== null ? photo.minute : (state?.clock.minute ?? 10 * 60);
    const weather = photo.on && photo.weather ? photo.weather : state ? weatherForDay(state.seed, state.clock.day).kind : 'clear';
    const target = lookFor(minute, weather);
    // Ease between frames, but snap when the clock jumps (fast-forward, load) so captures and
    // day changes never show a half-blended sky.
    const jumped = lastMinute.current !== null && Math.abs(minute - lastMinute.current) > 20;
    lastMinute.current = minute;
    const k = jumped ? 1 : Math.min(1, dt * 1.5);
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
    const day = THREE.MathUtils.clamp(elevation / 0.32, 0, 1);
    const el = Math.max(elevation, 0.07);
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
      hemi.current.color.copy(c.skyHorizon).lerp(c.skyZenith, 0.35);
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
    (STATIC_MATERIALS.interiorLight() as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + night * 2.5;
    (STATIC_MATERIALS.glass() as THREE.MeshStandardMaterial).emissive.setRGB(0.55 * night, 0.42 * night, 0.2 * night);
    // EGO teal trim and sign bands glow after dusk.
    (STATIC_MATERIALS.teal() as THREE.MeshStandardMaterial).emissiveIntensity = 0.18 + night * 0.9;
    // Wet pavement during monsoon: asphalt turns glossy and reflects the sky.
    const asphalt = STATIC_MATERIALS.asphalt() as THREE.MeshStandardMaterial;
    const wet = c.rain;
    asphalt.roughness = 0.95 - wet * 0.55;
    asphalt.envMapIntensity = 1 + wet * 1.5;
    // Clouds: sparse and bright on clear days, a dense gray deck in overcast and monsoon weather.
    const cover = weather === 'clear' ? 0.35 : weather === 'heat-wave' ? 0.12 : weather === 'overcast' ? 0.85 : 0.95;
    cloudMaterial.opacity += (cover - cloudMaterial.opacity) * k;
    const shade = weather === 'monsoon' ? 0.35 : weather === 'overcast' ? 0.6 : 1;
    cloudMaterial.color.setRGB(shade * (0.55 + 0.45 * day), shade * (0.55 + 0.45 * day), shade * (0.6 + 0.4 * day));
    if (clouds.current) {
      clouds.current.position.set(camera.position.x, 420, camera.position.z);
      cloudMaterial.map!.offset.x += dt * 0.0012;
    }
    window.__egoAtmo = { minute, weather, elevation, sunIntensity: c.sunIntensity, exposure: c.exposure, fogNear: c.fogNear, rain: c.rain };
    if (sky.current) sky.current.position.copy(camera.position);
  });

  return (
    <>
      <mesh ref={sky} material={skyMaterial} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[2000, 32, 16]} />
      </mesh>
      <mesh ref={clouds} material={cloudMaterial} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[4200, 4200]} />
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
    const photo = useApp.getState().photo;
    const weather = photo.on && photo.weather ? photo.weather : state ? weatherForDay(state.seed, state.clock.day).kind : 'clear';
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
