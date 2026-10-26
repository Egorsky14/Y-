import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { getGameState, useGame } from '@/app/store';
import { VehicleGltf, WHEEL_RADIUS, type VehicleRig } from '../vehicles/VehicleGltf';
import { useCallback } from 'react';
import { WORKDAY_END } from '@/game/simulation/time';
import { Worker, type WorkerAnim } from '../characters/Worker';
import { Selectable } from '../interactions/Selectable';
import { PALETTE } from '../assets/palette';
import { condenserPosition, condenserSideDir, inwardDir, lotById, workPosition } from '@/game/world/cityLayout';

declare global {
  interface Window {
    __egoWorkers?: Record<string, { x: number; z: number; y: number; status: string }>;
  }
}

/** Vehicles read their live position from the simulation every frame and smooth toward it. */
export function Vehicles() {
  const ids = useGame((s) => Object.keys(s.vehicles).join('|'));
  return (
    <>
      {ids.split('|').filter(Boolean).map((id) => (
        <VehicleView key={id} id={id} />
      ))}
    </>
  );
}

function VehicleView({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const rig = useRef<VehicleRig | null>(null);
  const lastPos = useRef(new THREE.Vector3());
  const lastHeading = useRef<number | null>(null);
  const lastSpeed = useRef(0);
  const steerAngle = useRef(0);
  const pitch = useRef(0);
  const roll = useRef(0);
  const descriptor = useGame((s) => {
    const v = s.vehicles[id];
    return v ? `${v.classId}|${v.paint}|${v.upgrades.join(',')}` : '';
  });
  const status = useGame((s) => s.vehicles[id]?.status);
  const vehicle = getGameState()?.vehicles[id];
  const onRig = useCallback((r: VehicleRig | null) => {
    rig.current = r;
  }, []);

  useFrame((_, dt) => {
    const state = getGameState();
    const v = state?.vehicles[id];
    const g = group.current;
    if (!v || !g || !state) return;
    const target = new THREE.Vector3(v.position.x, 0, v.position.z);
    const first = lastPos.current.lengthSq() === 0;
    if (first) {
      g.position.copy(target);
      g.rotation.y = v.heading;
      lastHeading.current = v.heading;
    } else {
      const k = Math.min(1, dt * 14);
      g.position.lerp(target, k);
      let d = v.heading - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * k;
    }
    const moved = g.position.distanceTo(lastPos.current);
    lastPos.current.copy(g.position);
    const speed = dt > 0 ? moved / dt : 0;
    const accel = dt > 0 ? (speed - lastSpeed.current) / dt : 0;
    lastSpeed.current = speed;
    const r = rig.current;
    if (!r) return;
    const wheelR = WHEEL_RADIUS[v.classId];
    if (moved > 0.0001) for (const w of r.wheels) w.rotation.x += moved / wheelR;
    // Steering from heading rate, smoothed; roll and pitch from lateral and longitudinal acceleration.
    const headingRate = lastHeading.current === null ? 0 : Math.atan2(Math.sin(g.rotation.y - lastHeading.current), Math.cos(g.rotation.y - lastHeading.current)) / Math.max(dt, 1e-3);
    lastHeading.current = g.rotation.y;
    const steerTarget = THREE.MathUtils.clamp(headingRate * 0.28, -0.55, 0.55) * (speed > 0.2 ? 1 : 0);
    steerAngle.current += (steerTarget - steerAngle.current) * Math.min(1, dt * 8);
    for (const s of r.steer) s.rotation.y = steerAngle.current;
    const rollTarget = -steerAngle.current * Math.min(1, speed / 12) * 0.08;
    const pitchTarget = THREE.MathUtils.clamp(-accel * 0.0025, -0.035, 0.035);
    roll.current += (rollTarget - roll.current) * Math.min(1, dt * 5);
    pitch.current += (pitchTarget - pitch.current) * Math.min(1, dt * 4);
    r.chassis.rotation.z = roll.current;
    r.chassis.rotation.x = pitch.current;
    // Headlights after dusk and before dawn.
    const minute = state.clock.minute;
    const night = minute > WORKDAY_END + 30 || minute < 6 * 60 + 30;
    const headlightIntensity = night ? 2.4 : 0.35;
    for (const m of r.headlights) if (Math.abs(m.emissiveIntensity - headlightIntensity) > 0.01) m.emissiveIntensity += (headlightIntensity - m.emissiveIntensity) * Math.min(1, dt * 3);
    // Tail lamps: running lights at night, brake lights while slowing or stopped with the engine on (en route or returning).
    const moving = v.status === 'enroute' || v.status === 'returning';
    const braking = moving && (accel < -0.8 || speed < 0.3);
    const tailIntensity = (night ? 1.2 : 0.4) + (braking ? 2.2 : 0);
    for (const m of r.taillights) if (Math.abs(m.emissiveIntensity - tailIntensity) > 0.01) m.emissiveIntensity += (tailIntensity - m.emissiveIntensity) * Math.min(1, dt * 6);
  });

  if (!vehicle) return null;
  const [classId, paint, upgrades] = descriptor.split('|');
  void status;
  return (
    <group ref={group} name={`vehicle:${id}`}>
      <Selectable selection={{ kind: 'vehicle', id }} ringRadius={4.2} ringOffset={[0, 0.07, 0]}>
        <VehicleGltf classId={classId as never} paint={paint as never} upgrades={(upgrades ? upgrades.split(',') : []) as never} onRig={onRig} />
        <mesh position={[0, 1.2, 0]} visible={false}>
          <boxGeometry args={[2.4, 2.6, 6]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
    </group>
  );
}

/** Employees: at HQ when idle/training, next to the unit when working, hidden while riding. */
export function Workers() {
  const ids = useGame((s) => Object.keys(s.employees).join('|'));
  return (
    <>
      {ids.split('|').filter(Boolean).map((id) => (
        <WorkerView key={id} id={id} />
      ))}
    </>
  );
}

function WorkerView({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const info = useGame((s) => {
    const e = s.employees[id];
    if (!e) return null;
    const job = e.jobId ? s.jobs[e.jobId] : undefined;
    return { role: e.role, look: e.look, status: e.status, jobId: e.jobId, jobStatus: job?.status };
  });

  useFrame((_, dt) => {
    const s = getGameState();
    const e = s?.employees[id];
    const g = group.current;
    if (!e || !g || !s) return;
    const inVehicle = e.status === 'driving' || e.status === 'returning';
    g.visible = !inVehicle;
    if (inVehicle) return;
    let target = new THREE.Vector3(e.position.x, 0, e.position.z);
    let face: number | null = null;
    if (e.status === 'working' && e.jobId) {
      const job = s.jobs[e.jobId];
      const lot = job ? lotById(s.customers[job.customerId].lotId) : undefined;
      if (lot) {
        const c = condenserPosition(lot);
        const idx = Math.max(0, [job!.technicianId, ...job!.crewIds].indexOf(e.id));
        const w = workPosition(lot, idx);
        target = new THREE.Vector3(w.x, 0, w.z);
        face = Math.atan2(c.x - w.x, c.z - w.z);
      }
    }
    const k = Math.min(1, dt * 10);
    const prev = g.position.clone();
    g.position.lerp(target, k);
    const delta = g.position.clone().sub(prev);
    let wanted: number | null = null;
    if (face !== null) wanted = face;
    else if (delta.lengthSq() > 1e-6) wanted = Math.atan2(delta.x, delta.z);
    else if (e.status === 'idle') wanted = -Math.PI / 2;
    if (wanted !== null) {
      // Turn smoothly toward the heading instead of snapping.
      const d = Math.atan2(Math.sin(wanted - g.rotation.y), Math.cos(wanted - g.rotation.y));
      g.rotation.y += d * Math.min(1, dt * 7);
    }
    (window.__egoWorkers ??= {})[id] = { x: g.position.x, z: g.position.z, y: g.position.y, status: e.status };
  });

  if (!info) return null;
  const anim: WorkerAnim =
    info.status === 'walking'
      ? 'carry'
      : info.status === 'working'
        ? info.jobStatus === 'diagnosing'
          ? 'inspect'
          : info.jobStatus === 'repairing'
            ? 'repair'
            : info.jobStatus === 'installing' || info.jobStatus === 'arriving'
              ? 'install'
              : 'stand-inspect'
        : info.status === 'training'
          ? 'train'
          : 'idle';
  return (
    <group ref={group} name={`employee:${id}`}>
      <Selectable selection={{ kind: 'employee', id }} ringRadius={1.1} ringOffset={[0, 0.07, 0]}>
        <Worker role={info.role} look={info.look} anim={anim} scale={1.12} />
        <mesh position={[0, 1.0, 0]} visible={false}>
          <boxGeometry args={[1, 2.1, 1]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
    </group>
  );
}

/** Blender-authored job-site kit (tools/blender/jobsite_kit.py): bag, gauge manifold with hoses, recovery cylinder. */
const KIT_URL = `${import.meta.env.BASE_URL}models/props/jobsite-kit.glb`;
useGLTF.preload(KIT_URL);

function JobSiteKit({ install }: { install: boolean }) {
  const { scene } = useGLTF(KIT_URL);
  const kit = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    return root;
  }, [scene]);
  const cylinder = kit.getObjectByName('cylinder');
  if (cylinder) cylinder.visible = install;
  return <primitive object={kit} />;
}

/** Tools staged beside the condenser while a technician is on site: tool bag, gauge manifold with hoses, a recovery cylinder on installs. */
export function JobSiteProps() {
  const sites = useGame((s) =>
    Object.values(s.jobs)
      .filter((j) => ['diagnosing', 'awaiting-diagnosis', 'quoted', 'awaiting-authorization', 'repairing', 'installing'].includes(j.status))
      .map((j) => `${j.id}:${s.customers[j.customerId].lotId}:${j.status === 'installing' ? 'i' : 'r'}`)
      .join('|'),
  );
  if (!sites) return null;
  return (
    <>
      {sites.split('|').map((entry) => {
        const [id, lotId, kind] = entry.split(':');
        const lot = lotById(lotId);
        if (!lot) return null;
        const c = condenserPosition(lot);
        const side = condenserSideDir(lot);
        const inward = inwardDir(lot.facing);
        // Stage the kit outward from the unit, offset along the house so it does not sit under the technician.
        const px = c.x + side.x * 1.2 - inward.x * 0.9;
        const pz = c.z + side.z * 1.2 - inward.z * 0.9;
        const yaw = Math.atan2(side.x, side.z);
        return (
          <group key={id} name="jobsite-kit" position={[px, 0, pz]} rotation={[0, yaw, 0]}>
            <Suspense fallback={null}>
              <JobSiteKit install={kind === 'i'} />
            </Suspense>
          </group>
        );
      })}
    </>
  );
}

/** 3D beacons over houses with open leads or active jobs; the clickable DOM pins live in WorldLabels. */
export function JobMarkers() {
  const markers = useGame((s) =>
    Object.values(s.jobs)
      .filter((j) => !['completed', 'declined', 'expired', 'cancelled'].includes(j.status))
      .map((j) => ({ id: j.id, lotId: s.customers[j.customerId].lotId, status: j.status })),
  );
  return (
    <>
      {markers.map((m) => {
        const lot = lotById(m.lotId);
        if (!lot) return null;
        const lead = m.status === 'lead';
        const decision = m.status === 'awaiting-diagnosis' || m.status === 'quoted';
        const color = lead ? '#ffb347' : decision ? PALETTE.egoTeal : '#ffffff';
        return (
          <Beacon key={m.id} position={[lot.center.x, 9.6, lot.center.z]} color={color} pulse={lead || decision} />
        );
      })}
    </>
  );
}

function Beacon({ position, color, pulse }: { position: [number, number, number]; color: string; pulse: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = position[1] + Math.sin(t * 2.2) * 0.35;
    ref.current.rotation.y = t * 1.2;
    const s = pulse ? 1 + Math.sin(t * 4) * 0.08 : 1;
    ref.current.scale.setScalar(s);
  });
  return (
    <group ref={ref} position={position}>
      <mesh rotation={[Math.PI, 0, 0]} castShadow>
        <coneGeometry args={[0.7, 1.8, 5]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} flatShading />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <octahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} flatShading />
      </mesh>
    </group>
  );
}
