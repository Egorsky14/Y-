import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import { getGameState, useApp } from '@/app/store';
import { HQ_LOT } from '@/game/world/cityLayout';
import { solveClearView, verticalFovFor, viewOffsetFor, visibility, type SafeArea, type V3 } from './cameraOcclusion';
import { occludersOf } from './serviceCall';
import { obstaclesNear } from './cameraObstacles';
import { measureSafeArea } from '@/ui/safeArea';

export const DEFAULT_TARGET = new THREE.Vector3(22, 0, 14);
export const DEFAULT_OFFSET = new THREE.Vector3(-74, 54, 92);
const HQ_TARGET = new THREE.Vector3(HQ_LOT.center.x - 10, 0, HQ_LOT.center.z - 5);
const PAN_LIMIT = 250;

interface Flight {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  t: number;
  duration: number;
  /** Orbit flight: ease azimuth, elevation and distance around the moving target instead of a straight line. */
  orbit?: { from: Sph; to: Sph };
}

interface Sph {
  azimuth: number;
  elevation: number;
  distance: number;
}

/** A close view being watched: the points that must stay visible and what can hide them. */
interface Watch {
  target: THREE.Vector3;
  points: V3[];
  boxes: THREE.Box3[];
  /** Clock time at which to check the view after the player lets go (damping settles first). */
  checkAt: number | null;
  /** The serviced cabinet (service views), which zoom stops short of. */
  cabinet: THREE.Box3 | null;
}

function sphericalOf(offset: THREE.Vector3): Sph {
  const distance = offset.length();
  return { azimuth: Math.atan2(offset.x, offset.z), elevation: Math.asin(THREE.MathUtils.clamp(offset.y / Math.max(distance, 1e-6), -1, 1)), distance };
}

function offsetOf(s: Sph): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(s.azimuth) * Math.cos(s.elevation), Math.sin(s.elevation), Math.cos(s.azimuth) * Math.cos(s.elevation)).multiplyScalar(s.distance);
}

/** Watched views settle back to a clear angle only while the target stays this close to the watched site. */
const WATCH_RADIUS = 8;

/**
 * The player's hands on the camera: dragging now, and when they last dragged, zoomed or used the
 * keys (performance.now() ms). The service camera (ServiceDirector) never reframes during a drag
 * and holds off for a while after one, so it never fights the player.
 */
export const cameraInput = { dragging: false, lastInput: -Infinity };

/** A walking crew member the view follows (CameraCommand.track) and how far it has slid so far. */
interface Track {
  object: string;
  anchor: THREE.Vector3;
  weight: number;
  shift: THREE.Vector3;
}

/** How quickly the followed view catches up with the walker (1/s): at walking pace it trails by ~0.3 m, and never jerks. */
const TRACK_RATE = 3.5;

/**
 * Room the service camera keeps around the technician's body (radius from his axis, up to head
 * height) and the serviced cabinet, so zooming in stops short of them instead of passing inside.
 * Smaller than the composer's own clearances, so composed shots never touch them.
 */
const BODY_CLEARANCE = 0.95;
const BODY_HEIGHT = 2.1;
const CABINET_CLEARANCE = 0.35;

/** Closest zoom and lowest angle: tighter while a service camera frames the work (Detail shots sit 2-3 m off, 12° up). */
const MIN_DISTANCE = 5;
const SERVICE_MIN_DISTANCE = 2.5;
const MAX_POLAR = 1.22;
const SERVICE_MAX_POLAR = 1.38;

/** A camera position pulled back within free-play zoom and tilt limits around its target. */
function withinFreeLimits(target: THREE.Vector3, pos: THREE.Vector3): THREE.Vector3 {
  const s = sphericalOf(pos.clone().sub(target));
  s.distance = Math.max(MIN_DISTANCE, s.distance);
  s.elevation = Math.max(Math.PI / 2 - MAX_POLAR, s.elevation);
  return target.clone().add(offsetOf(s));
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
  const size = useThree((s) => s.size);

  // Portrait screens (phones held upright): a fixed 38° vertical field of view leaves only ~18° of
  // city across. Widen the vertical angle (to at most 75°) so the horizontal view stays close to a
  // landscape screen's; landscape and desktop keep 38°.
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || size.height === 0) return;
    const aspect = size.width / size.height;
    const fov = verticalFovFor(aspect);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height]);
  const command = useApp((s) => s.cameraCommand);
  const flight = useRef<Flight | null>(null);
  const keys = useRef<Set<string>>(new Set());
  const followLast = useRef<THREE.Vector3 | null>(null);
  const watch = useRef<Watch | null>(null);
  const track = useRef<Track | null>(null);
  const interacting = useRef(false);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // UI-covered part of the view (open inspector), measured a few times a second and eased.
  const safe = useRef<Required<Omit<SafeArea, 'avoid'>>>({ right: 0, bottom: 0, top: 0 });
  const safeTarget = useRef<SafeArea>({ right: 0, bottom: 0, top: 0 });
  const safeTick = useRef(0);

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
    track.current = command.track ? { object: command.track.object, anchor: new THREE.Vector3(command.track.anchor.x, 0, command.track.anchor.z), weight: command.track.weight, shift: new THREE.Vector3() } : null;
    let toTarget: THREE.Vector3;
    let toPos: THREE.Vector3;
    if (command.type === 'reset') {
      toTarget = DEFAULT_TARGET.clone();
      toPos = DEFAULT_TARGET.clone().add(DEFAULT_OFFSET);
    } else if (command.type === 'hq') {
      toTarget = HQ_TARGET.clone();
      toPos = HQ_TARGET.clone().add(new THREE.Vector3(-45, 55, 70));
    } else if (command.type === 'focus' && command.target) {
      toTarget = new THREE.Vector3(command.target.x, command.targetY ?? 0, command.target.z);
      const dist = command.distance ?? Math.min(offset.length(), 70);
      let dir: THREE.Vector3;
      if (command.azimuth !== undefined) {
        const el = command.elevation ?? 0.62;
        dir = new THREE.Vector3(Math.sin(command.azimuth) * Math.cos(el), Math.sin(el), Math.cos(command.azimuth) * Math.cos(el));
      } else {
        dir = offset.clone().normalize();
        if (dir.y < 0.45) dir.y = 0.6; // never fly in flat
      }
      toPos = toTarget.clone().add(dir.normalize().multiplyScalar(dist));
      // Any other focus keeps to free-play zoom and tilt (only the service camera comes closer and lower).
      if (!command.service && !useApp.getState().photo.on) toPos = withinFreeLimits(toTarget, toPos);
      if (command.watch) {
        const boxes = [...occludersOf(command.watch.lotIds), ...obstaclesNear(command.target.x, command.target.z, 20)];
        const cab = command.watch.cabinet;
        watch.current = { target: new THREE.Vector3(command.target.x, 0, command.target.z), points: command.watch.points, boxes, checkAt: null, cabinet: cab ? new THREE.Box3(new THREE.Vector3(cab.min.x, cab.min.y, cab.min.z), new THREE.Vector3(cab.max.x, cab.max.y, cab.max.z)) : null };
      } else {
        watch.current = null;
      }
      if (command.orbit) {
        const from = sphericalOf(offset);
        const to = sphericalOf(toPos.clone().sub(toTarget));
        // Swing the short way round.
        to.azimuth = from.azimuth + Math.atan2(Math.sin(to.azimuth - from.azimuth), Math.cos(to.azimuth - from.azimuth));
        flight.current = { fromTarget, toTarget, fromPos, toPos, t: 0, duration: command.duration ?? 1.1, orbit: { from, to } };
        return;
      }
    } else if (command.type === 'follow' && command.vehicleId) {
      const v = getGameState()?.vehicles[command.vehicleId];
      if (!v) return;
      toTarget = new THREE.Vector3(v.position.x, 0, v.position.z);
      toPos = toTarget.clone().add(new THREE.Vector3(-18, 22, 26));
      followLast.current = toTarget.clone();
    } else {
      return;
    }
    if (command.type !== 'focus') watch.current = null;
    flight.current = { fromTarget, toTarget, fromPos, toPos, t: 0, duration: 0.9 };
  }, [command, camera]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const follow = useApp.getState().followVehicleId;
    followWalker(c, dt);
    if (flight.current) {
      const f = flight.current;
      f.t = Math.min(1, f.t + dt / f.duration);
      const k = easeInOut(f.t);
      c.target.lerpVectors(f.fromTarget, f.toTarget, k);
      if (f.orbit) {
        const { from, to } = f.orbit;
        // Wide swings rise and pull back a little mid-flight so the camera passes over the roof, not through it.
        const swing = Math.min(1, Math.abs(to.azimuth - from.azimuth) / Math.PI);
        const arc = Math.sin(Math.PI * k) * swing;
        const sph = {
          azimuth: from.azimuth + (to.azimuth - from.azimuth) * k,
          elevation: Math.min(1.25, from.elevation + (to.elevation - from.elevation) * k + arc * 0.35),
          distance: (from.distance + (to.distance - from.distance) * k) * (1 + arc * 0.3),
        };
        camera.position.copy(c.target).add(offsetOf(sph));
      } else {
        camera.position.lerpVectors(f.fromPos, f.toPos, k);
      }
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
        // Keyboard orbit or pan of a watched view: check it once the keys are released.
        if (watch.current) watch.current.checkAt = performance.now() + 450;
        cameraInput.lastInput = performance.now();
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
    applyLimits(c);
    c.update();
    if (!flight.current) keepClearOfWork(c);
    applySafeArea(dt);
    settleWatchedView(c);
  });

  /**
   * Following a walking technician (CameraCommand.track): the whole view slides with him, target and
   * camera together, so the heading the player or the director chose is kept. The slide is eased
   * every frame (no stop-and-go between updates) and carries on through a flight in progress (its
   * end points slide too), so landing and following join up without a jolt.
   */
  function followWalker(c: MapControlsImpl, dt: number) {
    const t = track.current;
    if (!t) return;
    if (!useApp.getState().serviceView) {
      track.current = null;
      return;
    }
    const o = scene.getObjectByName(t.object);
    if (!o || !o.visible) return;
    const p = o.getWorldPosition(new THREE.Vector3());
    const want = new THREE.Vector3((p.x - t.anchor.x) * t.weight, 0, (p.z - t.anchor.z) * t.weight);
    const step = want.sub(t.shift).multiplyScalar(1 - Math.exp(-dt * TRACK_RATE));
    if (step.lengthSq() < 1e-10) return;
    t.shift.add(step);
    const f = flight.current;
    if (f) {
      f.fromTarget.add(step);
      f.toTarget.add(step);
      f.fromPos.add(step);
      f.toPos.add(step);
    } else {
      c.target.add(step);
      camera.position.add(step);
    }
    watch.current?.target.add(step);
  }

  /**
   * While the service camera is on, zooming or orbiting stops short of the technician's body and
   * the serviced cabinet: the camera is moved back out along its line to the target, never sideways,
   * so the player's angle is kept and only the zoom is limited.
   */
  function keepClearOfWork(c: MapControlsImpl) {
    const view = useApp.getState().serviceView;
    if (!view) return;
    const job = getGameState()?.jobs[view.jobId];
    const tech = job?.technicianId ? scene.getObjectByName(`employee:${job.technicianId}`) : undefined;
    const body = tech?.visible ? tech.getWorldPosition(new THREE.Vector3()) : null;
    const unit = watch.current?.cabinet ?? null;
    const inside = (p: THREE.Vector3) =>
      p.y < 0.45 ||
      (body !== null && p.y < BODY_HEIGHT && Math.hypot(p.x - body.x, p.z - body.z) < BODY_CLEARANCE) ||
      (unit !== null && p.x > unit.min.x - CABINET_CLEARANCE && p.x < unit.max.x + CABINET_CLEARANCE && p.y < unit.max.y + CABINET_CLEARANCE && p.z > unit.min.z - CABINET_CLEARANCE && p.z < unit.max.z + CABINET_CLEARANCE);
    if (!inside(camera.position)) return;
    const dir = camera.position.clone().sub(c.target);
    const dist = dir.length();
    dir.normalize();
    for (let d = dist + 0.05; d < dist + 6; d += 0.05) {
      const p = c.target.clone().addScaledVector(dir, d);
      if (!inside(p)) {
        camera.position.copy(p);
        return;
      }
    }
  }

  /**
   * Zoom and tilt limits. A service camera may come closer and lower than free play allows; after
   * it ends, the limits relax back only as far as the camera already is (they tighten again as the
   * player zooms out or tilts up), so leaving a close-up never makes the view jump.
   */
  function applyLimits(c: MapControlsImpl) {
    const { photo: ph, serviceView } = useApp.getState();
    const offset = camera.position.clone().sub(c.target);
    const dist = offset.length();
    const polar = Math.acos(THREE.MathUtils.clamp(offset.y / Math.max(dist, 1e-6), -1, 1));
    if (ph.on) {
      c.minDistance = 1.5;
      c.maxPolarAngle = 1.5;
    } else if (serviceView) {
      c.minDistance = SERVICE_MIN_DISTANCE;
      c.maxPolarAngle = SERVICE_MAX_POLAR;
    } else {
      c.minDistance = THREE.MathUtils.clamp(dist - 0.01, SERVICE_MIN_DISTANCE, MIN_DISTANCE);
      c.maxPolarAngle = THREE.MathUtils.clamp(polar + 0.001, MAX_POLAR, SERVICE_MAX_POLAR);
    }
  }

  /**
   * Centre the scene in the part of the view the inspector leaves free: shift the projection centre
   * by half the covered width (or sheet height). Eased, so opening or closing the panel glides.
   * Picking and label projection use the same projection matrix, so they stay aligned.
   */
  function applySafeArea(dt: number) {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if ((safeTick.current += dt) > 0.2) {
      safeTick.current = 0;
      safeTarget.current = useApp.getState().photo.on ? { right: 0, bottom: 0, top: 0 } : measureSafeArea(gl.domElement);
    }
    const k = Math.min(1, dt * 6);
    const cur = safe.current;
    const tgt = safeTarget.current;
    const sized = !camera.view || (camera.view.fullWidth === size.width && camera.view.fullHeight === size.height);
    const tTop = tgt.top ?? 0;
    if (cur.right === tgt.right && cur.bottom === tgt.bottom && cur.top === tTop && sized) return;
    cur.right += (tgt.right - cur.right) * k;
    cur.bottom += (tgt.bottom - cur.bottom) * k;
    cur.top += (tTop - cur.top) * k;
    if (Math.abs(cur.right - tgt.right) < 1e-4) cur.right = tgt.right;
    if (Math.abs(cur.bottom - tgt.bottom) < 1e-4) cur.bottom = tgt.bottom;
    if (Math.abs(cur.top - tTop) < 1e-4) cur.top = tTop;
    const w = size.width;
    const h = size.height;
    const off = viewOffsetFor(cur, w, h);
    if (off.x === 0 && off.y === 0) camera.clearViewOffset();
    else camera.setViewOffset(w, h, off.x, off.y, w, h);
  }

  /**
   * A watched close view (serviceCloseUpCamera) that the player has orbited or zoomed into a blocked
   * angle eases to the nearest clear one, once, shortly after they let go: never during a drag, and
   * never in Photo Mode. With the service camera on, the player's angle wins: only a camera left
   * inside solid geometry is moved, closer along its own line. Panning away from the site ends the watch.
   */
  function settleWatchedView(c: MapControlsImpl) {
    const w = watch.current;
    if (!w || flight.current || interacting.current || useApp.getState().photo.on) return;
    if (Math.hypot(c.target.x - w.target.x, c.target.z - w.target.z) > WATCH_RADIUS) {
      // The player panned away from the site: the watch ends, and so does the service camera (it will not pull them back).
      watch.current = null;
      if (useApp.getState().serviceView) useApp.getState().setServiceView(null);
      return;
    }
    if (w.checkAt === null || performance.now() < w.checkAt) return;
    w.checkAt = null;
    if (useApp.getState().serviceView) {
      // The service camera respects the player's own angle: it only steps in when the camera has been
      // left inside a wall, roof, trunk or crown, and then just slides closer along the same line.
      const from = sphericalOf(camera.position.clone().sub(c.target));
      const solid = (d: number) => {
        const p = c.target.clone().add(offsetOf({ ...from, distance: d }));
        return w.boxes.some((b) => p.x > b.min.x - 0.15 && p.x < b.max.x + 0.15 && p.y > b.min.y - 0.15 && p.y < b.max.y + 0.15 && p.z > b.min.z - 0.15 && p.z < b.max.z + 0.15);
      };
      if (!solid(from.distance)) return;
      for (let d = from.distance - 0.25; d >= SERVICE_MIN_DISTANCE; d -= 0.25) {
        if (solid(d)) continue;
        const toPos = c.target.clone().add(offsetOf({ ...from, distance: d }));
        flight.current = { fromTarget: c.target.clone(), toTarget: c.target.clone(), fromPos: camera.position.clone(), toPos, t: 0, duration: 0.5 };
        return;
      }
      return;
    }
    const current = { target: { x: c.target.x, y: c.target.y, z: c.target.z }, ...sphericalOf(camera.position.clone().sub(c.target)) };
    if (visibility(current, w.points, w.boxes) === 1) return;
    const solved = solveClearView(current, w.points, w.boxes, size.width / Math.max(1, size.height));
    if (!solved.clear) return;
    const from = sphericalOf(camera.position.clone().sub(c.target));
    const to = { azimuth: from.azimuth + Math.atan2(Math.sin(solved.azimuth - from.azimuth), Math.cos(solved.azimuth - from.azimuth)), elevation: solved.elevation, distance: solved.distance };
    const toPos = c.target.clone().add(offsetOf(to));
    flight.current = { fromTarget: c.target.clone(), toTarget: c.target.clone(), fromPos: camera.position.clone(), toPos, t: 0, duration: 0.8, orbit: { from, to } };
  }

  return (
    <MapControls
      ref={controls}
      makeDefault
      target={DEFAULT_TARGET}
      enableDamping
      dampingFactor={0.12}
      maxDistance={340}
      minPolarAngle={0.2}
      zoomSpeed={1.1}
      panSpeed={1.0}
      rotateSpeed={0.6}
      screenSpacePanning={false}
      onStart={() => {
        interacting.current = true;
        cameraInput.dragging = true;
        cameraInput.lastInput = performance.now();
        flight.current = null;
        if (useApp.getState().followVehicleId) useApp.getState().setFollow(null);
      }}
      onEnd={() => {
        interacting.current = false;
        cameraInput.dragging = false;
        cameraInput.lastInput = performance.now();
        // Let damping settle before checking whether the watched view is blocked.
        if (watch.current) watch.current.checkAt = performance.now() + 450;
      }}
    />
  );
}
