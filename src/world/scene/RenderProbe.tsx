import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

declare global {
  interface Window {
    __egoRender?: { calls: number; triangles: number; geometries: number; textures: number; frame: number; houses: number; vehicleModels: number; workers: number; instanced: number };
    __egoVehicles?: Record<string, { x: number; z: number; heading: number; wheelSpin: number; steer: number; roll: number; pitch: number }>;
    /** Live renderer, scene and camera for profiling tools. */
    __egoThree?: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera };
  }
}

/** Publishes renderer statistics and animation state for QA tooling. */
export function RenderProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  // Profiling handle: dev server, or a build made with VITE_PROFILE=1. Never in a normal production build.
  if (import.meta.env.DEV || import.meta.env.VITE_PROFILE === '1') window.__egoThree = { gl, scene, camera };
  let tick = 0;
  useFrame(() => {
    const i = gl.info;
    tick++;
    if (tick % 3 !== 0) return;
    let houses = 0;
    let vehicleModels = 0;
    let workers = 0;
    let instanced = 0;
    const vehicles: NonNullable<Window['__egoVehicles']> = {};
    scene.traverse((o) => {
      if (o.name.startsWith('house:') && !o.name.includes(':', 6)) houses++;
      if (o.name.startsWith('employee:')) workers++;
      if ((o as THREE.InstancedMesh).isInstancedMesh) instanced++;
      if (o.name.startsWith('vehicle-model:')) {
        vehicleModels++;
        const root = o.parent?.parent?.parent; // Selectable group → vehicle group
        const holder = root && root.name.startsWith('vehicle:') ? root : o.parent?.parent;
        const id = holder?.name.replace('vehicle:', '') ?? o.name;
        const chassis = o.getObjectByName('chassis');
        const wheel = o.getObjectByName('wheel_fl') ?? o.getObjectByName('wheel_rl');
        const steer = o.getObjectByName('steer_fl');
        vehicles[id] = {
          x: holder?.position.x ?? 0,
          z: holder?.position.z ?? 0,
          heading: holder?.rotation.y ?? 0,
          wheelSpin: wheel?.rotation.x ?? 0,
          steer: steer?.rotation.y ?? 0,
          roll: chassis?.rotation.z ?? 0,
          pitch: chassis?.rotation.x ?? 0,
        };
      }
    });
    window.__egoRender = { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, frame: i.render.frame, houses, vehicleModels, workers, instanced };
    window.__egoVehicles = vehicles;
  });
  return null;
}
