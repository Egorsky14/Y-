import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { getGameState, useApp, useGame } from '@/app/store';
import { VehicleGltf, WHEEL_RADIUS, type VehicleRig } from '../vehicles/VehicleGltf';
import { useCallback } from 'react';
import { WORKDAY_END } from '@/game/simulation/time';
import { Worker, type WorkerAnim } from '../characters/Worker';
import { Selectable } from '../interactions/Selectable';
import { PALETTE } from '../assets/palette';
import { HOUSE_HALF_WIDTH, condenserPosition, condenserSideDir, lotById, lotLocalToWorld, workPosition } from '@/game/world/cityLayout';
import { useSupplyKit } from '../props/SupplyProps';
import { toolsHeldBy } from '@/game/equipment/inventory';
import { vehicleAtJob } from '@/game/equipment/performance';
import { faultById } from '@/game/jobs/faults';
import type { GameState, Job } from '@/game/simulation/types';
import { BAG_LOCAL, bagWorldPosition, EXIT_DELAY, EXIT_SECONDS, GAUGES_DELAY, PARK_SECONDS, WALK_SPEED, approachPath, curbDoor, ease, pathLength, samplePath, siteFor, siteParking, siteVisuals, vanVisuals, visualPace } from './serviceCall';

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
  const parking = useRef<{ curve: { x: number; z: number }[] | null; t: number; seconds: number; leaving: number; framed: boolean }>({ curve: null, t: 0, seconds: PARK_SECONDS, leaving: 0, framed: false });
  const descriptor = useGame((s) => {
    const v = s.vehicles[id];
    // Wear in three buckets so the model only rebuilds when condition crosses 80 or 60.
    return v ? `${v.classId}|${v.paint}|${v.upgrades.join(',')}|${v.condition >= 80 ? 0 : v.condition >= 60 ? 1 : 2}` : '';
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
    const site = siteParking(state, id);
    const pk = parking.current;
    if (site) {
      // On site: pull from the route's end into the curb lane along a curve that leaves along the
      // arrival heading and ends along the parking heading (a U-turn if the van arrived the other way).
      if (!pk.curve) {
        const fwd = { x: Math.sin(g.rotation.y), z: Math.cos(g.rotation.y) };
        const park = { x: Math.sin(site.pose.heading), z: Math.cos(site.pose.heading) };
        const uTurn = fwd.x * park.x + fwd.z * park.z < 0;
        const reach = uTurn ? 6 : 3;
        const a = first ? { x: site.pose.x, z: site.pose.z } : { x: g.position.x, z: g.position.z };
        pk.curve = [a, { x: a.x + fwd.x * reach, z: a.z + fwd.z * reach }, { x: site.pose.x - park.x * reach, z: site.pose.z - park.z * reach }, { x: site.pose.x, z: site.pose.z }];
        pk.t = first ? 1 : 0;
        pk.seconds = PARK_SECONDS * (uTurn ? 2 : 1);
        pk.framed = first;
      }
      pk.t = Math.min(1, pk.t + (dt * visualPace(state.speed)) / pk.seconds);
      const [p0, p1, p2, p3] = pk.curve;
      const u = ease(pk.t);
      const m = 1 - u;
      const bx = m * m * m * p0.x + 3 * m * m * u * p1.x + 3 * m * u * u * p2.x + u * u * u * p3.x;
      const bz = m * m * m * p0.z + 3 * m * m * u * p1.z + 3 * m * u * u * p2.z + u * u * u * p3.z;
      const tx = 3 * m * m * (p1.x - p0.x) + 6 * m * u * (p2.x - p1.x) + 3 * u * u * (p3.x - p2.x);
      const tz = 3 * m * m * (p1.z - p0.z) + 6 * m * u * (p2.z - p1.z) + 3 * u * u * (p3.z - p2.z);
      g.position.set(bx, 0, bz);
      g.rotation.y = pk.t >= 1 || Math.hypot(tx, tz) < 1e-4 ? site.pose.heading : Math.atan2(tx, tz);
      if (first) lastHeading.current = g.rotation.y;
      vanVisuals.set(id, { x: bx, z: bz, heading: g.rotation.y, settled: pk.t >= 1 });
      pk.leaving = 0;
      if (pk.t >= 1 && !pk.framed) {
        pk.framed = true;
        // A player following this van gets the arrival framed: van, walkway and unit from the street side.
        const app = useApp.getState();
        if (app.followVehicleId === id) {
          const unit = condenserPosition(site.lot);
          const target = { x: (bx + unit.x) / 2, z: (bz + unit.z) / 2 };
          app.camera({ type: 'focus', target, distance: 27, azimuth: Math.atan2(bx - unit.x, bz - unit.z) + 0.55, elevation: 0.6, targetY: 0.6 });
        }
      }
    } else {
      if (pk.curve) {
        // Just left the site: pull out of the curb lane gently instead of snapping back to the lane.
        pk.curve = null;
        pk.leaving = 1.5;
      }
      vanVisuals.delete(id);
      if (first) {
        g.position.copy(target);
        g.rotation.y = v.heading;
        lastHeading.current = v.heading;
      } else {
        const k = Math.min(1, dt * (pk.leaving > 0 ? 3 : 14));
        pk.leaving = Math.max(0, pk.leaving - dt);
        g.position.lerp(target, k);
        let d = v.heading - g.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        g.rotation.y += d * k;
      }
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
  const [classId, paint, upgrades, wear] = descriptor.split('|');
  void status;
  return (
    <group ref={group} name={`vehicle:${id}`}>
      <Selectable selection={{ kind: 'vehicle', id }} ringRadius={4.2} ringOffset={[0, 0.07, 0]}>
        <VehicleGltf classId={classId as never} paint={paint as never} upgrades={(upgrades ? upgrades.split(',') : []) as never} wear={Number(wear) || 0} onRig={onRig} />
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

/** Visual stages of a crew member's arrival at a house (see serviceCall.ts). */
type ArrivalStage = 'riding' | 'exit' | 'walk' | 'turn' | 'work';

function WorkerView({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const info = useGame((s) => {
    const e = s.employees[id];
    if (!e) return null;
    const job = e.jobId ? s.jobs[e.jobId] : undefined;
    return { role: e.role, look: e.look, status: e.status, jobId: e.jobId, jobStatus: job?.status, lotId: job ? s.customers[job.customerId]?.lotId : undefined, crew: job ? Math.max(0, [job.technicianId, ...job.crewIds].indexOf(id)) : 0 };
  });
  const pace = useGame((s) => visualPace(s.speed));
  const arrival = useRef<{ jobId: string | null; stage: ArrivalStage; t: number; walked: number; from: { x: number; z: number }; out: { x: number; z: number }; path: { x: number; z: number }[] }>({
    jobId: null, stage: 'work', t: 0, walked: 0, from: { x: 0, z: 0 }, out: { x: 0, z: 0 }, path: [],
  });
  // The stage drives the animation clip, so it is React state; it changes a handful of times per job.
  const [stage, setStage] = useState<ArrivalStage | null>(null);

  useFrame((_, dt) => {
    const s = getGameState();
    const e = s?.employees[id];
    const g = group.current;
    if (!e || !g || !s) return;
    const inVehicle = e.status === 'driving' || e.status === 'returning';
    if (inVehicle) {
      g.visible = false;
      arrival.current.jobId = null;
      return;
    }
    g.visible = true;
    // Service-call arrival at a house: park, door, walk, turn, work, paced in real time.
    const job = e.jobId ? s.jobs[e.jobId] : undefined;
    const lot = job ? lotById(s.customers[job.customerId].lotId) : undefined;
    const van = job?.vehicleId ? vanVisuals.get(job.vehicleId) : undefined;
    const a = arrival.current;
    if (job && lot?.kind === 'house' && (e.status === 'walking' || e.status === 'working')) {
      const idx = Math.max(0, [job.technicianId, ...job.crewIds].indexOf(e.id));
      if (a.jobId !== job.id) {
        // A fresh arrival plays out; a job already under way (a loaded game) starts at the unit.
        a.jobId = job.id;
        a.stage = e.status === 'walking' && van ? 'riding' : 'work';
        a.t = 0;
        a.walked = 0;
        if (a.stage === 'work') siteFor(job.id).arrived.add(e.id);
      }
      const step = dt * visualPace(s.speed);
      const go = (next: ArrivalStage) => {
        a.stage = next;
        a.t = 0;
      };
      if (a.stage === 'riding') {
        g.visible = false;
        if (!van) go('work');
        else if (van.settled && (a.t += step) > EXIT_DELAY + idx * 0.7) {
          a.from = curbDoor(van, -0.55);
          a.out = curbDoor(van, 0.4);
          a.path = approachPath(lot, a.out, idx);
          g.position.set(a.from.x, 0, a.from.z);
          g.rotation.y = Math.atan2(a.out.x - a.from.x, a.out.z - a.from.z);
          go('exit');
        }
      } else if (a.stage === 'exit') {
        a.t = Math.min(1, a.t + step / EXIT_SECONDS);
        const k = ease(a.t);
        g.position.set(a.from.x + (a.out.x - a.from.x) * k, 0, a.from.z + (a.out.z - a.from.z) * k);
        if (a.t >= 1) go('walk');
      } else if (a.stage === 'walk') {
        const total = pathLength(a.path);
        // Ease into the stride over the first metre and out of it over the last.
        const gait = Math.max(0.35, Math.min(1, 0.45 + a.walked / 1.6, (total - a.walked) / 1.2 + 0.25));
        a.walked = Math.min(total, a.walked + step * WALK_SPEED * gait);
        const p = samplePath(a.path, a.walked);
        g.position.set(p.x, 0, p.z);
        const d = Math.atan2(Math.sin(p.heading - g.rotation.y), Math.cos(p.heading - g.rotation.y));
        g.rotation.y += d * Math.min(1, dt * 8);
        if (a.walked >= total) go('turn');
      } else if (a.stage === 'turn' || a.stage === 'work') {
        const c = condenserPosition(lot);
        const w = workPosition(lot, idx);
        if (a.stage === 'turn' && (a.t += step / 0.5) >= 1) {
          go('work');
          const site = siteFor(job.id);
          site.arrived.add(e.id);
        }
        g.position.lerp(new THREE.Vector3(w.x, 0, w.z), Math.min(1, dt * 10));
        const wanted = Math.atan2(c.x - w.x, c.z - w.z);
        const d = Math.atan2(Math.sin(wanted - g.rotation.y), Math.cos(wanted - g.rotation.y));
        g.rotation.y += d * Math.min(1, dt * 6);
      }
      if (stage !== a.stage) setStage(a.stage);
      (window.__egoWorkers ??= {})[id] = { x: g.position.x, z: g.position.z, y: g.position.y, status: e.status };
      return;
    }
    a.jobId = null;
    if (stage !== null) setStage(null);
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
    stage === 'exit' || stage === 'walk'
      ? 'carry'
      : stage === 'turn' || stage === 'riding'
        ? 'idle'
        : info.status === 'walking'
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
  // At a house unit: how far the work spot is from the cabinet's service face, so the rig's IK puts
  // hands and tools on the cabinet (cityLayout: workPosition and condenserPosition; unit 0.92 m, 1.08 m on premium homes).
  const workLot = info.lotId ? lotById(info.lotId) : undefined;
  const work = (() => {
    if (!workLot || workLot.kind !== 'house') return undefined;
    const c = condenserPosition(workLot);
    const w = workPosition(workLot, info.crew);
    const size = workLot.style === 'premium' ? 1.08 : 0.92;
    return { face: Math.hypot(c.x - w.x, c.z - w.z) - size / 2, top: size + 0.04, bag: info.crew === 0 ? BAG_LOCAL : undefined };
  })();
  return (
    <group ref={group} name={`employee:${id}`}>
      <Selectable selection={{ kind: 'employee', id }} ringRadius={1.1} ringOffset={[0, 0.07, 0]}>
        {/* The rig is modelled at ~1.8 m tall: draw it at true scale next to the 0.96 m condenser. */}
        <Worker role={info.role} look={info.look} anim={anim} pace={pace} work={work} />
        <mesh position={[0, 1.0, 0]} visible={false}>
          <boxGeometry args={[1, 2.1, 1]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
    </group>
  );
}

/** The tool bag's position in the kit frame (unit-centred, rotated by `rot` about y at `origin`). */
function bagInKit(lot: NonNullable<ReturnType<typeof lotById>>, origin: { x: number; z: number }, rot: number): { x: number; z: number } {
  const wb = bagWorldPosition(lot);
  const dx = wb.x - origin.x;
  const dz = wb.z - origin.z;
  return { x: dx * Math.cos(rot) - dz * Math.sin(rot), z: dx * Math.sin(rot) + dz * Math.cos(rot) };
}

/** Blender-authored job-site kit (tools/blender/jobsite_kit.py): bag, gauge manifold with hoses, recovery cylinder. */
const KIT_URL = `${import.meta.env.BASE_URL}models/props/jobsite-kit.glb`;
useGLTF.preload(KIT_URL);

/**
 * The kit is authored in the outdoor unit's frame (tools/blender/jobsite_kit.py), so it sits on the
 * unit: manifold hung on the cabinet, hoses on the service valves. It appears when the technician
 * has walked up and set the bag down; the gauges follow a moment later, as if just hooked up.
 */
function JobSiteKit({ jobId, install, bagAt }: { jobId: string; install: boolean; bagAt?: { x: number; z: number } }) {
  const { scene } = useGLTF(KIT_URL);
  const kit = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    root.visible = false;
    // The bag is set down where the technician reaches for it (serviceCall.ts BAG_LOCAL).
    const bag = root.getObjectByName('bag');
    if (bag && bagAt) bag.position.set(bagAt.x, bag.position.y, bagAt.z);
    return root;
  }, [scene, bagAt?.x, bagAt?.z]);
  const staged = useRef(0);
  useEffect(() => () => void siteVisuals.delete(jobId), [jobId]);
  useFrame((_, dt) => {
    const arrived = (siteVisuals.get(jobId)?.arrived.size ?? 0) > 0;
    if (arrived) staged.current += dt * visualPace(getGameState()?.speed ?? 1);
    kit.visible = arrived;
    const manifold = kit.getObjectByName('manifold');
    if (manifold) manifold.visible = staged.current >= GAUGES_DELAY;
    const cylinder = kit.getObjectByName('cylinder');
    if (cylinder) cylinder.visible = install;
  });
  return <primitive object={kit} />;
}

/**
 * Company equipment that is really on site (equipment/inventory.ts): c = the technician's hard tool
 * case, v / r / n = the van's vacuum pump, recovery machine and nitrogen kit, set out only while a
 * repair that uses them (evacuation, recovery, pressure test) is under way and that van is at the job.
 */
function siteEquipment(s: GameState, j: Job): string {
  let flags = '';
  if (j.technicianId && toolsHeldBy(s, { kind: 'employee', id: j.technicianId }).some((t) => t.defId === 'hand-tools')) flags += 'c';
  const van = vehicleAtJob(s, j);
  if (van && j.status === 'repairing' && j.chosenDiagnosis) {
    const steps = faultById(j.chosenDiagnosis).procedures;
    const rack = new Set(toolsHeldBy(s, { kind: 'vehicle', id: van.id }).map((t) => t.defId));
    if (rack.has('vacuum-pump') && steps.includes('evacuation')) flags += 'v';
    if (rack.has('recovery-machine') && steps.includes('recovery')) flags += 'r';
    if (rack.has('nitrogen-kit') && steps.includes('pressure-test')) flags += 'n';
  }
  return flags;
}

const EQUIPMENT_FLAGS: Record<string, string> = { 'tool-case': 'c', 'vacuum-pump': 'v', 'recovery-machine': 'r', 'nitrogen-kit': 'n' };

/** Supply Depot equipment staged in the unit frame (tools/blender/supply_tools.py), shown once the technician is set up. */
function JobSiteEquipment({ jobId, flags }: { jobId: string; flags: string }) {
  const kit = useSupplyKit();
  useFrame(() => {
    const arrived = (siteVisuals.get(jobId)?.arrived.size ?? 0) > 0;
    for (const [name, flag] of Object.entries(EQUIPMENT_FLAGS)) {
      const part = kit.getObjectByName(name);
      if (part) part.visible = arrived && flags.includes(flag);
    }
  });
  return <primitive object={kit} name="jobsite-equipment" />;
}

/** Tools staged beside the condenser while a technician is on site: tool bag, gauge manifold with hoses, a recovery cylinder on installs, and the company equipment that came along. */
export function JobSiteProps() {
  const sites = useGame((s) =>
    Object.values(s.jobs)
      .filter((j) => ['arriving', 'diagnosing', 'awaiting-diagnosis', 'quoted', 'awaiting-authorization', 'repairing', 'installing'].includes(j.status))
      .map((j) => `${j.id}:${s.customers[j.customerId].lotId}:${j.status === 'installing' ? 'i' : 'r'}:${siteEquipment(s, j)}`)
      .join('|'),
  );
  if (!sites) return null;
  return (
    <>
      {sites.split('|').map((entry) => {
        const [id, lotId, kind, equipment] = entry.split(':');
        const lot = lotById(lotId);
        if (!lot) return null;
        // The kit's frame is the unit's: house-local axes, origin at the unit centre. The premium
        // house has a larger unit (1.08 m): shift so the couplers still meet its valves and face.
        const premium = lot.style === 'premium';
        const p = lotLocalToWorld(lot, HOUSE_HALF_WIDTH[lot.style ?? 'ranch'] + 0.9 + (premium ? -0.062 : 0), -3 + (premium ? -0.08 : 0));
        const side = condenserSideDir(lot);
        return (
          <group key={id} name="jobsite-kit" position={[p.x, 0, p.z]} rotation={[0, Math.atan2(-side.z, side.x), 0]}>
            <Suspense fallback={null}>
              <JobSiteKit jobId={id} install={kind === 'i'} bagAt={bagInKit(lot, p, Math.atan2(-side.z, side.x))} />
            </Suspense>
            {equipment && (
              <Suspense fallback={null}>
                <JobSiteEquipment jobId={id} flags={equipment} />
              </Suspense>
            )}
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
