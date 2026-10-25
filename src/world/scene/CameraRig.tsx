import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import { getGameState, useApp } from '@/app/store';
import { HQ_LOT } from '@/game/world/cityLayout';

export const DEFAULT_TARGET = new THREE.Vector3(10, 0, 0);
export const DEFAULT_OFFSET = new THREE.Vector3(-70, 92, 118);
const HQ_TARGET = new THREE.Vector3(HQ_LOT.center.x - 10, 0, HQ_LOT.center.z - 5);
const PAN_LIMIT = 250;

interface Flight {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  t: number;
  duration: number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Tycoon camera: left-drag pans, right-drag orbits, wheel zooms, WASD/arrows pan, Q/E rotate.
 * Supports smooth flights to focus targets, HQ shortcut, reset, and following a vehicle.
 */
export function CameraRig() {
  const controls = useRef<MapControlsImpl>(null);
  const { camera } = useThree();
  const command = useApp((s) => s.cameraCommand);
  const flight = useRef<Flight | null>(null);
  const keys = useRef<Set<string>>(new Set());
  const followLast = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const c = controls.current;
    if (!command || !c) return;
    const fromTarget = c.target.clone();
    const fromPos = camera.position.clone();
    const offset = fromPos.clone().sub(fromTarget);
    let toTarget: THREE.Vector3;
    let toPos: THREE.Vector3;
    if (command.type === 'reset') {
      toTarget = DEFAULT_TARGET.clone();
      toPos = DEFAULT_TARGET.clone().add(DEFAULT_OFFSET);
    } else if (command.type === 'hq') {
      toTarget = HQ_TARGET.clone();
      toPos = HQ_TARGET.clone().add(new THREE.Vector3(-45, 55, 70));
    } else if (command.type === 'focus' && command.target) {
      toTarget = new THREE.Vector3(command.target.x, 0, command.target.z);
      const dist = command.distance ?? Math.min(offset.length(), 70);
      const dir = offset.clone().normalize();
      if (dir.y < 0.45) dir.y = 0.6; // never fly in flat
      toPos = toTarget.clone().add(dir.normalize().multiplyScalar(dist));
    } else if (command.type === 'follow' && command.vehicleId) {
      const v = getGameState()?.vehicles[command.vehicleId];
      if (!v) return;
      toTarget = new THREE.Vector3(v.position.x, 0, v.position.z);
      toPos = toTarget.clone().add(new THREE.Vector3(-18, 22, 26));
      followLast.current = toTarget.clone();
    } else {
      return;
    }
    flight.current = { fromTarget, toTarget, fromPos, toPos, t: 0, duration: 0.9 };
  }, [command, camera]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const follow = useApp.getState().followVehicleId;
    if (flight.current) {
      const f = flight.current;
      f.t = Math.min(1, f.t + dt / f.duration);
      const k = easeInOut(f.t);
      c.target.lerpVectors(f.fromTarget, f.toTarget, k);
      camera.position.lerpVectors(f.fromPos, f.toPos, k);
      if (f.t >= 1) flight.current = null;
    } else if (follow) {
      const v = getGameState()?.vehicles[follow];
      if (v) {
        const next = new THREE.Vector3(v.position.x, 0, v.position.z);
        const prev = followLast.current ?? next;
        const delta = next.clone().sub(prev);
        c.target.add(delta);
        camera.position.add(delta);
        followLast.current = next;
        if (v.status === 'parked') useApp.getState().setFollow(null);
      } else {
        useApp.getState().setFollow(null);
      }
    } else {
      // Keyboard pan/rotate relative to the camera heading.
      const k = keys.current;
      if (k.size > 0) {
        const speed = (c.target.distanceTo(camera.position) * 0.9 + 10) * dt;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
        const move = new THREE.Vector3();
        if (k.has('w') || k.has('arrowup')) move.add(forward);
        if (k.has('s') || k.has('arrowdown')) move.sub(forward);
        if (k.has('a') || k.has('arrowleft')) move.sub(right);
        if (k.has('d') || k.has('arrowright')) move.add(right);
        if (move.lengthSq() > 0) {
          move.normalize().multiplyScalar(speed);
          c.target.add(move);
          camera.position.add(move);
        }
        const rot = (k.has('q') ? 1 : 0) - (k.has('e') ? 1 : 0);
        if (rot !== 0) {
          const offset = camera.position.clone().sub(c.target);
          offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * dt * 1.6);
          camera.position.copy(c.target.clone().add(offset));
        }
      }
    }
    // Keep the target on the map.
    const clamped = c.target.clone();
    clamped.x = THREE.MathUtils.clamp(clamped.x, -PAN_LIMIT, PAN_LIMIT);
    clamped.z = THREE.MathUtils.clamp(clamped.z, -PAN_LIMIT, PAN_LIMIT);
    clamped.y = 0;
    const correction = clamped.sub(c.target);
    if (correction.lengthSq() > 0) {
      c.target.add(correction);
      camera.position.add(correction);
    }
    c.update();
  });

  return (
    <MapControls
      ref={controls}
      makeDefault
      target={DEFAULT_TARGET}
      enableDamping
      dampingFactor={0.12}
      minDistance={18}
      maxDistance={340}
      minPolarAngle={0.2}
      maxPolarAngle={1.22}
      zoomSpeed={1.1}
      panSpeed={1.0}
      rotateSpeed={0.6}
      screenSpacePanning={false}
      onStart={() => {
        flight.current = null;
        if (useApp.getState().followVehicleId) useApp.getState().setFollow(null);
      }}
    />
  );
}
