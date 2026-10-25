import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getGameState, useGame } from '@/app/store';
import { VehicleModel } from '../vehicles/ServiceVehicle';
import { Worker, type WorkerAnim } from '../characters/Worker';
import { Selectable } from '../interactions/Selectable';
import { PALETTE } from '../assets/palette';
import { condenserPosition, lotById, workPosition } from '@/game/world/cityLayout';

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
  const wheels = useRef<THREE.Group[]>([]);
  const lastPos = useRef(new THREE.Vector3());
  const descriptor = useGame((s) => {
    const v = s.vehicles[id];
    return v ? `${v.classId}|${v.paint}|${v.upgrades.join(',')}` : '';
  });
  const status = useGame((s) => s.vehicles[id]?.status);
  const vehicle = getGameState()?.vehicles[id];

  useFrame((_, dt) => {
    const state = getGameState();
    const v = state?.vehicles[id];
    const g = group.current;
    if (!v || !g) return;
    const target = new THREE.Vector3(v.position.x, 0, v.position.z);
    const first = lastPos.current.lengthSq() === 0;
    if (first) {
      g.position.copy(target);
      g.rotation.y = v.heading;
    } else {
      const k = Math.min(1, dt * 14);
      g.position.lerp(target, k);
      // Shortest-arc heading interpolation
      let d = v.heading - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * k;
    }
    const moved = g.position.distanceTo(lastPos.current);
    lastPos.current.copy(g.position);
    if (moved > 0.0001) for (const w of wheels.current) w.rotation.x += moved / 0.36;
  });

  if (!vehicle) return null;
  const [classId, paint, upgrades] = descriptor.split('|');
  void status;
  return (
    <group ref={group} name={`vehicle:${id}`}>
      <Selectable selection={{ kind: 'vehicle', id }} ringRadius={4.2} ringOffset={[0, 0.07, 0]}>
        <VehicleModel classId={classId as never} paint={paint as never} upgrades={(upgrades ? upgrades.split(',') : []) as never} wheelsRef={wheels} />
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
    return e ? { role: e.role, look: e.look, status: e.status, jobId: e.jobId } : null;
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
    if (face !== null) g.rotation.y = face;
    else if (delta.lengthSq() > 1e-6) g.rotation.y = Math.atan2(delta.x, delta.z);
    else if (e.status === 'idle') g.rotation.y = -Math.PI / 2;
  });

  if (!info) return null;
  const anim: WorkerAnim = info.status === 'walking' ? 'walk' : info.status === 'working' ? 'work' : info.status === 'training' ? 'train' : 'idle';
  return (
    <group ref={group} name={`employee:${id}`}>
      <Selectable selection={{ kind: 'employee', id }} ringRadius={1.1} ringOffset={[0, 0.07, 0]}>
        <Worker role={info.role} look={info.look} anim={anim} />
        <mesh position={[0, 0.9, 0]} visible={false}>
          <boxGeometry args={[1, 1.9, 1]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
    </group>
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
