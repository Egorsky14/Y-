import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getGameState, useApp } from '@/app/store';
import { sunAngles } from '@/game/simulation/weather';
import { makeDecoRng } from '../assets/random';
import { scenicRoads } from '../city/hinterlandLayout';
import { visualPace } from '../scene/serviceCall';

/**
 * Ambient traffic on the valley's section-line arterials and parkways (hinterlandLayout.ts). Those
 * roads are scenery: they are not in the routing graph, never enter the playable district, and so
 * never meet the company's vehicles. Cars keep to the right-hand lanes at steady speeds, run the
 * full length of each road and pass out of sight where the road sinks under the rising bajada at
 * both ends, so none appears or vanishes in view. Motion follows the game pace (paused: stopped).
 * Drawn as two instanced meshes (bodies tinted per car, glass), plus head and tail lights at night;
 * fewer cars on Medium and none on Battery Saver.
 */

const SPAN = 1520; // cars run between -SPAN and SPAN along each road (ends are under the terrain)
const PAINTS = [0xe6e7e8, 0xa7abb0, 0x5b6068, 0x8b2c2c, 0x2f4c74, 0xc8b998, 0x34493f, 0xd9d4c8, 0x6f747b, 0x1f2226, 0xf2f2ee];

interface Car {
  axis: 'x' | 'z';
  at: number;
  /** +1 or -1 along the road's axis. */
  dir: number;
  /** Lateral offset from the road centre (right-hand lane). */
  lane: number;
  s: number;
  speed: number;
  paint: number;
  len: number;
}

export function ambientCars(density: number): Car[] {
  const rnd = makeDecoRng(4242);
  const cars: Car[] = [];
  for (const r of scenicRoads()) {
    if (r.kind === 'collector') continue;
    const lanes = r.kind === 'parkway' ? [r.width / 2 - 5.3, r.width / 2 - 2.0] : [r.width / 4 + 0.2, r.width / 2 - 1.6];
    for (const dir of [-1, 1]) {
      for (const laneOffset of lanes) {
        // One car every ~170 m per lane on average, gaps irregular.
        const n = Math.round(((2 * SPAN) / 170) * density);
        let s = -SPAN + rnd() * 120;
        for (let i = 0; i < n && s < SPAN; i++) {
          cars.push({ axis: r.axis, at: r.at, dir, lane: laneOffset, s, speed: (laneOffset > r.width / 4 + 1 ? 12 : 15) + rnd() * 4, paint: PAINTS[Math.floor(rnd() * PAINTS.length)], len: rnd() < 0.25 ? 5.2 : 4.6 });
          s += (2 * SPAN) / Math.max(1, n) * (0.5 + rnd());
        }
      }
    }
  }
  return cars;
}

/** A car silhouette that reads at strategy distance: lower body, cabin, wheels (unit length 4.6 m). */
function carGeometry(): { body: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const part = (g: THREE.BufferGeometry) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k);
    return n;
  };
  const body = BGU.mergeGeometries([
    part(new THREE.BoxGeometry(1.8, 0.62, 4.6).translate(0, 0.62, 0)),
    part(new THREE.BoxGeometry(1.62, 0.12, 2.3).translate(0, 1.5, -0.25)),
    ...[-1.45, 1.45].flatMap((z) => [-0.82, 0.82].map((x) => part(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 8).rotateZ(Math.PI / 2).translate(x, 0.33, z)))),
  ])!;
  const glass = BGU.mergeGeometries([part(new THREE.BoxGeometry(1.66, 0.56, 2.4).translate(0, 1.2, -0.25))])!;
  return { body, glass };
}

export function AmbientTraffic() {
  const quality = useApp((s) => s.settings.quality);
  const density = quality === 'low' ? 0 : quality === 'medium' ? 0.5 : 1;
  const cars = useMemo(() => ambientCars(density), [density]);
  const geo = useMemo(() => carGeometry(), []);
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 }),
      glass: new THREE.MeshStandardMaterial({ color: '#1c2229', roughness: 0.2, metalness: 0.5 }),
      lights: new THREE.PointsMaterial({ size: 1.1, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    }),
    [],
  );
  const body = useRef<THREE.InstancedMesh>(null);
  const glass = useRef<THREE.InstancedMesh>(null);
  const lights = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cars.length * 2 * 3), 3));
    const col = new Float32Array(cars.length * 2 * 3);
    for (let i = 0; i < cars.length; i++) col.set([1, 0.95, 0.8, 1, 0.12, 0.08], i * 6);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const p = new THREE.Points(g, mats.lights);
    p.frustumCulled = false;
    p.raycast = () => undefined;
    p.visible = false;
    return p;
  }, [cars, mats.lights]);
  useEffect(() => {
    const im = body.current;
    if (!im) return;
    const c = new THREE.Color();
    cars.forEach((car, i) => im.setColorAt(i, c.setHex(car.paint)));
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [cars]);
  useEffect(() => () => lights.geometry.dispose(), [lights]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame((_, dt) => {
    const b = body.current;
    const g = glass.current;
    if (!b || !g || cars.length === 0) return;
    const st = getGameState();
    const step = Math.min(dt, 0.1) * Math.min(visualPace(st?.speed ?? 1), 1.5);
    const minute = st?.clock.minute ?? 600;
    const night = 1 - THREE.MathUtils.clamp((sunAngles(minute).elevation + 0.05) / 0.3, 0, 1);
    const pos = lights.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      car.s += car.dir * car.speed * step;
      if (car.s > SPAN) car.s -= 2 * SPAN;
      else if (car.s < -SPAN) car.s += 2 * SPAN;
      // Right-hand traffic: +x travel keeps to +z, +z travel keeps to -x.
      const x = car.axis === 'x' ? car.s : car.at - car.dir * car.lane;
      const z = car.axis === 'x' ? car.at + car.dir * car.lane : car.s;
      const heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.dir > 0 ? 0 : Math.PI;
      q.setFromAxisAngle(up, heading);
      m.compose(v.set(x, 0, z), q, sc.set(1, 1, car.len / 4.6));
      b.setMatrixAt(i, m);
      g.setMatrixAt(i, m);
      if (night > 0.02) {
        const fx = Math.sin(heading);
        const fz = Math.cos(heading);
        const half = car.len / 2;
        pos.setXYZ(i * 2, x + fx * half, 0.7, z + fz * half);
        pos.setXYZ(i * 2 + 1, x - fx * half, 0.8, z - fz * half);
      }
    }
    b.instanceMatrix.needsUpdate = true;
    g.instanceMatrix.needsUpdate = true;
    lights.visible = night > 0.02;
    if (lights.visible) {
      pos.needsUpdate = true;
      mats.lights.opacity = night;
    }
  });
  if (cars.length === 0) return null;
  return (
    <group name="ambient-traffic">
      <instancedMesh ref={body} args={[geo.body, mats.body, cars.length]} frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={glass} args={[geo.glass, mats.glass, cars.length]} frustumCulled={false} raycast={() => null} />
      <primitive object={lights} />
    </group>
  );
}
