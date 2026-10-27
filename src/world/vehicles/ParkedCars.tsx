import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGame } from '@/app/store';
import { HOUSE_LOTS, HQ_LOT, lotLocalHeading, lotLocalToWorld } from '@/game/world/cityLayout';
import { hashLot } from '../city/yardLayout';
import { DRIVEWAYS } from '../buildings/HouseBuilder';

/**
 * Parked civilian cars: residents' cars in about half the driveways, visitors at the HQ front row
 * and one car per staff member in the HQ employee row (so the lot fills as the company hires).
 * Purely decorative and not selectable: the unbranded sedan and SUV assets are merged per
 * material and drawn as one InstancedMesh each, with the paint tinted per car.
 */

const MODELS = ['civilian-sedan', 'civilian-suv'] as const;
type Model = (typeof MODELS)[number];
const url = (m: Model) => `${import.meta.env.BASE_URL}models/vehicles/${m}.glb`;
for (const m of MODELS) useGLTF.preload(url(m));

const PAINTS = ['#e6e7e8', '#a7abb0', '#5b6068', '#8b2c2c', '#2f4c74', '#c8b998', '#34493f', '#d9d4c8', '#6f747b'];

interface Spot {
  x: number;
  z: number;
  heading: number;
  model: Model;
  paint: string;
}

function hqSpot(x: number, z: number, heading: number, seed: number): Spot {
  return { x: HQ_LOT.center.x + x, z: HQ_LOT.center.z + z, heading, model: MODELS[seed % 2], paint: PAINTS[(seed >> 2) % PAINTS.length] };
}

export function parkedCarSpots(staff: number): Spot[] {
  const out: Spot[] = [];
  // Residents: about half the houses have a car on the driveway, two on wide driveways.
  for (const lot of HOUSE_LOTS) {
    const d = DRIVEWAYS.get(lot.id);
    const h = hashLot(lot.id + 'car');
    if (!d || h % 9 > 3) continue;
    const cars = d.w > 7 && h % 2 === 0 ? [-1.4, 1.4] : [0];
    const heading = lotLocalHeading(lot, 0, 1); // nose toward the garage
    cars.forEach((off, i) => {
      const p = lotLocalToWorld(lot, d.x + off, d.frontZ - 3.4 - i * 0.4);
      out.push({ ...p, heading, model: MODELS[(h >> (3 + i)) % 2], paint: PAINTS[(h >> (5 + i * 3)) % PAINTS.length] });
    });
  }
  // HQ visitors (front row, nose to the north curb): three of six stalls.
  for (const i of [0, 2, 3]) out.push(hqSpot(-24.5 + (i + 0.5) * 2.8, -30.7, Math.PI, 11 + i * 7));
  // HQ staff row (nose to the south curb): one car per employee, up to nine.
  for (let i = 0; i < Math.min(9, staff); i++) out.push(hqSpot(-54 + (i + 0.5) * 3.0, 18.4, 0, 31 + i * 13));
  return out;
}

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  paint: boolean;
  castShadow: boolean;
}

/** One merged geometry per material for a model, in the model's own frame. */
function modelParts(scene: THREE.Object3D): Part[] {
  scene.updateMatrixWorld(true);
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const e = groups.get(mat.name) ?? groups.set(mat.name, { mat, geos: [] }).get(mat.name)!;
    e.geos.push(g.index ? g.toNonIndexed() : g);
  });
  return [...groups.entries()].map(([name, { mat, geos }]) => {
    const material = (mat as THREE.MeshStandardMaterial).clone();
    const paint = name === 'paint';
    if (paint) (material as THREE.MeshStandardMaterial).color.set('#ffffff');
    return { geometry: BGU.mergeGeometries(geos, false)!, material, paint, castShadow: name !== 'glass' };
  });
}

function ModelLayer({ model, spots }: { model: Model; spots: Spot[] }) {
  const { scene } = useGLTF(url(model));
  const parts = useMemo(() => modelParts(scene), [scene]);
  const mine = spots.filter((s) => s.model === model);
  const setup = (part: Part) => (im: THREE.InstancedMesh | null) => {
    if (!im) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    mine.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, 0, s.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.heading), new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m);
      if (part.paint) im.setColorAt(i, c.set(s.paint));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  };
  if (mine.length === 0) return null;
  return (
    <>
      {parts.map((p, i) => (
        <instancedMesh key={`${i}-${mine.length}`} ref={setup(p)} args={[p.geometry, p.material, mine.length]} castShadow={p.castShadow} receiveShadow raycast={() => null} />
      ))}
    </>
  );
}

export function ParkedCars() {
  const staff = useGame((s) => Object.keys(s.employees).length);
  const spots = useMemo(() => parkedCarSpots(staff), [staff]);
  return (
    <group name="parked-cars">
      {MODELS.map((m) => (
        <ModelLayer key={m} model={m} spots={spots} />
      ))}
    </group>
  );
}
