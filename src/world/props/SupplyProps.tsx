import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';

/**
 * Blender-authored Supply Depot equipment (tools/blender/supply_tools.py): `tool-case`,
 * `vacuum-pump`, `recovery-machine`, `nitrogen-kit`. The parts are authored in the outdoor unit's
 * frame like the job-site kit, so on a job they are staged with the kit's transform; elsewhere
 * (the depot display) a part is re-centred on its own footprint.
 */
export const SUPPLY_URL = `${import.meta.env.BASE_URL}models/props/supply-tools.glb`;
useGLTF.preload(SUPPLY_URL);

export type SupplyPart = 'tool-case' | 'vacuum-pump' | 'recovery-machine' | 'nitrogen-kit';
export const SUPPLY_PARTS: SupplyPart[] = ['tool-case', 'vacuum-pump', 'recovery-machine', 'nitrogen-kit'];

function shadowed(root: THREE.Object3D): THREE.Object3D {
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return root;
}

/** The whole set in the unit frame (for job sites); part visibility is driven by node name. */
export function useSupplyKit(): THREE.Object3D {
  const { scene } = useGLTF(SUPPLY_URL);
  return useMemo(() => shadowed(scene.clone(true)), [scene]);
}

/** One part, moved so its footprint centre sits on the local origin and its base on the ground. */
export function SupplyDisplayPart({ part, position, rotation = 0, scale = 1 }: { part: SupplyPart; position: [number, number, number]; rotation?: number; scale?: number }) {
  const { scene } = useGLTF(SUPPLY_URL);
  const obj = useMemo(() => {
    const src = scene.getObjectByName(part);
    if (!src) return null;
    const clone = shadowed(src.clone(true));
    clone.position.set(0, 0, 0);
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const c = box.getCenter(new THREE.Vector3());
    clone.position.set(-c.x, -box.min.y, -c.z);
    return clone;
  }, [scene, part]);
  if (!obj) return null;
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <primitive object={obj} />
    </group>
  );
}
