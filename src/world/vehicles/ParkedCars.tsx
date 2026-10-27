import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGame } from '@/app/store';
import { CIVILIAN_MODELS as MODELS, parkedCarSpots, type CivilianModel as Model, type ParkedCarSpot as Spot } from './parkedCarSpots';

/**
 * Parked civilian cars: residents' cars in about half the driveways, visitors at the HQ front row
 * and one car per staff member in the HQ employee row (so the lot fills as the company hires).
 * Purely decorative and not selectable: the unbranded sedan and SUV assets are merged per
 * material and drawn as one InstancedMesh each, with the paint tinted per car.
 */

const url = (m: Model) => `${import.meta.env.BASE_URL}models/vehicles/${m}.glb`;
for (const m of MODELS) useGLTF.preload(url(m));

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
