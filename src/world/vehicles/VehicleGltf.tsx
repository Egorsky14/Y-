import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { PaintId, VehicleClass, VehicleUpgradeId } from '@/game/fleet/vehicleCatalog';
import { VEHICLE_PAINT } from '../assets/palette';
import { wordmarkTexture } from '../assets/textures';

export const VEHICLE_CLASSES: VehicleClass[] = ['compact-van', 'full-size-van', 'pickup', 'box-truck'];
export const WHEEL_RADIUS: Record<VehicleClass, number> = { 'compact-van': 0.34, 'full-size-van': 0.39, pickup: 0.42, 'box-truck': 0.47 };

export function vehicleModelUrl(classId: VehicleClass): string {
  return `${import.meta.env.BASE_URL}models/vehicles/${classId}.glb`;
}

export function preloadVehicleModels(): void {
  for (const c of VEHICLE_CLASSES) useGLTF.preload(vehicleModelUrl(c));
}

/** Handles to the animated parts of a vehicle instance. */
export interface VehicleRig {
  root: THREE.Group;
  chassis: THREE.Group;
  wheels: THREE.Object3D[];
  steer: THREE.Object3D[];
  headlights: THREE.MeshStandardMaterial[];
}

let decalTextures: { light: THREE.Texture; dark: THREE.Texture } | null = null;
function decalTexture(darkPaint: boolean): THREE.Texture {
  if (!decalTextures) {
    const light = wordmarkTexture('light').clone();
    const dark = wordmarkTexture('dark').clone();
    for (const t of [light, dark]) {
      // The exporter already rewrote V for glTF, so a canvas texture keeps three's default flipY.
      t.flipY = true;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
    }
    decalTextures = { light, dark };
  }
  return darkPaint ? decalTextures.light : decalTextures.dark;
}

/**
 * Builds a per-instance scene graph from the shared glTF: cloned paint and decal materials,
 * upgrade-driven rack visibility, and a chassis group that can roll and pitch over the wheels.
 */
export function buildVehicleRig(source: THREE.Group, classId: VehicleClass, paint: PaintId, upgrades: VehicleUpgradeId[]): VehicleRig {
  const root = source.clone(true);
  root.name = `vehicle-model:${classId}`;
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  const wheels: THREE.Object3D[] = [];
  const steer: THREE.Object3D[] = [];
  const headlights: THREE.MeshStandardMaterial[] = [];
  const paintHex = VEHICLE_PAINT[paint] ?? VEHICLE_PAINT['ego-black'];
  const darkPaint = paint === 'ego-black' || paint === 'graphite';
  const wrapped = upgrades.includes('full-wrap');
  const decals = upgrades.includes('basic-decals');

  // The exporter wraps the asset in one named group; animated parts live directly under it.
  const container = root.children.length === 1 && root.children[0].children.length > 1 ? root.children[0] : root;
  for (const child of [...container.children]) {
    if (child.name.startsWith('wheel_')) wheels.push(child);
    else if (child.name.startsWith('steer_')) {
      steer.push(child);
      child.children.forEach((w) => wheels.push(w));
    } else {
      chassis.add(child);
    }
  }
  container.add(chassis);
  const rack = chassis.getObjectByName('rack');
  if (rack) rack.visible = upgrades.includes('ladder-rack');

  chassis.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    switch (mat.name) {
      case 'paint': {
        const m = mat.clone();
        m.color.set(paintHex);
        mesh.material = m;
        break;
      }
      case 'decal-left':
      case 'decal-right':
      case 'decal-rear': {
        const show = wrapped || (decals && mat.name !== 'decal-rear');
        mesh.visible = show;
        if (show) {
          const m = mat.clone();
          m.map = decalTexture(darkPaint);
          m.color.set('#ffffff');
          m.transparent = true;
          m.alphaTest = 0.05;
          m.depthWrite = false;
          m.polygonOffset = true;
          m.polygonOffsetFactor = -2;
          m.roughness = 0.5;
          m.needsUpdate = true;
          mesh.material = m;
          if (decals && !wrapped) mesh.scale.set(0.55, 0.55, 1);
        }
        break;
      }
      case 'accent': {
        // Teal trim reads as the EGO spec; without any branding keep it subtle.
        if (!wrapped && !decals) {
          const m = mat.clone();
          m.color.set('#3a3f45');
          m.emissiveIntensity = 0;
          mesh.material = m;
        }
        break;
      }
      case 'headlight': {
        const m = mat.clone();
        mesh.material = m;
        headlights.push(m);
        break;
      }
      case 'glass':
        mesh.castShadow = false;
        break;
    }
  });
  for (const w of wheels) w.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null));
  return { root, chassis, wheels, steer, headlights };
}

interface VehicleGltfProps {
  classId: VehicleClass;
  paint: PaintId;
  upgrades: VehicleUpgradeId[];
  onRig?: (rig: VehicleRig | null) => void;
}

/** Renders a vehicle class from its glTF asset. */
export function VehicleGltf({ classId, paint, upgrades, onRig }: VehicleGltfProps) {
  const { scene } = useGLTF(vehicleModelUrl(classId));
  const upgradeKey = upgrades.join(',');
  const rig = useMemo(() => buildVehicleRig(scene, classId, paint, upgradeKey ? (upgradeKey.split(',') as VehicleUpgradeId[]) : []), [scene, classId, paint, upgradeKey]);
  useEffect(() => {
    onRig?.(rig);
    return () => onRig?.(null);
  }, [rig, onRig]);
  return <primitive object={rig.root} />;
}
