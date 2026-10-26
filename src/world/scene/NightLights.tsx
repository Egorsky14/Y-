import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getGameState, useApp } from '@/app/store';
import { sunAngles } from '@/game/simulation/weather';
import { HOUSE_LOTS, HQ_LOT, ROAD_WIDTH, SIDEWALK_WIDTH, STREETS, inwardDir } from '@/game/world/cityLayout';
import { HQ } from '../buildings/HeadquartersBuilder';

/**
 * Night lighting without per-fragment light cost: additive light pools on the ground under every
 * fixture (street lights, HQ pole lights, wall packs, porch lights) plus two real point lights at
 * the HQ entrance and the bay apron. Intensity follows the sun; everything is dark by day.
 */

interface Pool {
  x: number;
  z: number;
  radius: number;
  warmth: number; // 0 cool white (LED street light) → 1 warm (porch / wall pack)
}

function poolTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Street-light positions, mirroring the placement rule in Roads.tsx. */
export function streetLightPositions(): Pool[] {
  const out: Pool[] = [];
  const half = ROAD_WIDTH / 2;
  const walk = SIDEWALK_WIDTH;
  for (const s of STREETS) {
    const isX = s.axis === 'x';
    for (let a = s.from + 20, i = 0; a < s.to - 10; a += 44, i++) {
      if (Math.abs(a) < 9 || Math.abs(Math.abs(a) - (isX ? 130 : 100)) < 9) continue;
      const side = i % 2 === 0 ? 1 : -1;
      const across = side * (half + 0.55 + walk + 0.6 - 2.6);
      out.push(isX ? { x: a, z: s.at + across, radius: 9, warmth: 0.15 } : { x: s.at + across, z: a, radius: 9, warmth: 0.15 });
    }
  }
  return out;
}

export function hqLightPositions(): Pool[] {
  const cx = HQ_LOT.center.x;
  const cz = HQ_LOT.center.z;
  const out: Pool[] = [];
  for (const [x, z] of [[-50, -31], [-25.5, -8], [-25.5, 6], [-9, 8.5], [-16, 23]] as [number, number][]) out.push({ x: cx + x, z: cz + z, radius: 11, warmth: 0.2 });
  const sx0 = HQ.bays.x - HQ.bays.w / 2;
  for (const z of HQ.bayDoorZ) out.push({ x: cx + sx0 - 2.5, z: cz + z, radius: 6, warmth: 0.6 });
  out.push({ x: cx + HQ.tower.x - HQ.tower.w / 2 - 3, z: cz + HQ.tower.z, radius: 6, warmth: 0.5 });
  out.push({ x: cx + sx0 - 1.5, z: cz + 2.2, radius: 3, warmth: 0.7 });
  out.push({ x: cx - 54.5 - 1.5, z: cz - 16, radius: 3, warmth: 0.4 }); // monument uplights
  return out;
}

function porchLightPositions(): Pool[] {
  return HOUSE_LOTS.map((lot) => {
    const inward = inwardDir(lot.facing);
    const front = { x: lot.center.x - inward.x * (lot.depth / 2 - 6), z: lot.center.z - inward.z * (lot.depth / 2 - 6) };
    return { x: front.x, z: front.z, radius: 3.2, warmth: 0.9 };
  });
}

export function NightLights() {
  const pools = useMemo(() => [...streetLightPositions(), ...hqLightPositions(), ...porchLightPositions()], []);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const entrance = useRef<THREE.PointLight>(null);
  const apron = useRef<THREE.PointLight>(null);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false }), []);
  const setup = (im: THREE.InstancedMesh | null) => {
    if (!im) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const cool = new THREE.Color('#dfe9ff');
    const warm = new THREE.Color('#ffd79a');
    pools.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, 0.06, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(p.radius * 2, p.radius * 2, 1));
      im.setMatrixAt(i, m);
      c.copy(cool).lerp(warm, p.warmth);
      im.setColorAt(i, c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    (mesh as React.MutableRefObject<THREE.InstancedMesh | null>).current = im;
  };
  useFrame(() => {
    const state = getGameState();
    const photo = useApp.getState().photo;
    const minute = photo.on && photo.minute !== null ? photo.minute : (state?.clock.minute ?? 600);
    const { elevation } = sunAngles(minute);
    const night = 1 - THREE.MathUtils.clamp((elevation + 0.05) / 0.3, 0, 1);
    material.opacity = night * 0.55;
    if (mesh.current) mesh.current.visible = night > 0.02;
    if (entrance.current) entrance.current.intensity = night * 60;
    if (apron.current) apron.current.intensity = night * 90;
  });
  const cx = HQ_LOT.center.x;
  const cz = HQ_LOT.center.z;
  return (
    <group name="night-lights">
      <instancedMesh ref={setup} args={[undefined, undefined, pools.length]} material={material} frustumCulled={false} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      <pointLight ref={entrance} position={[cx + HQ.tower.x - HQ.tower.w / 2 - 2.6, 3.3, cz + HQ.tower.z]} color="#ffe2b8" intensity={0} distance={18} decay={2} />
      <pointLight ref={apron} position={[cx + HQ.bays.x - HQ.bays.w / 2 - 3, 5.5, cz + HQ.bayDoorZ[1]]} color="#fff0d6" intensity={0} distance={26} decay={2} />
    </group>
  );
}
