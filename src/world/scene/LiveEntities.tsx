import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { getGameState, useApp, useGame } from '@/app/store';
import { VehicleGltf, WHEEL_RADIUS, type VehicleRig } from '../vehicles/VehicleGltf';
import { contactBlob } from '../assets/contactShadow';
import { useCallback } from 'react';
import { WORKDAY_END } from '@/game/simulation/time';
import { Worker, type WorkerAnim, type WorkerMotion } from '../characters/Worker';
import { isRoofJob, roofSpec, servicedUnit } from '@/game/world/rooftops';
import { frameAt, frameQuat, ladderVisuals, rackPose, ROOF_PARK_SHARE, roofPlanFor, type ChoreoFrame } from './rooftopChoreo';
import { ROOFTOP_KIT_URL } from '../buildings/CommercialSites';
import type { VehicleClass } from '@/game/fleet/vehicleCatalog';
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
    /** Debug and evidence capture: each worker's facing and service-call arrival stage. */
    __egoWorkerHeading?: Record<string, number>;
    __egoWorkerStage?: Record<string, string | null>;
    /** Evidence capture: a lot's roof data (rooftops.ts). */
    __egoRoofSpec?: typeof roofSpec;
  }
}
if (typeof window !== 'undefined') window.__egoRoofSpec = roofSpec;

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
        const a = first ? { x: site.pose.x, z: site.pose.z } : { x: g.position.x, z: g.position.z };
        // Longer pulls (into a commercial lot's side drive) take a wider curve and proportionally longer.
        const dist = Math.hypot(site.pose.x - a.x, site.pose.z - a.z);
        const reach = Math.max(uTurn ? 6 : 3, Math.min(14, dist * 0.35));
        pk.curve = [a, { x: a.x + fwd.x * reach, z: a.z + fwd.z * reach }, { x: site.pose.x - park.x * reach, z: site.pose.z - park.z * reach }, { x: site.pose.x, z: site.pose.z }];
        pk.t = first ? 1 : 0;
        pk.seconds = Math.max(PARK_SECONDS * (uTurn ? 2 : 1), dist / 6);
        pk.framed = first;
      }
      pk.t = Math.min(1, pk.t + (dt * visualPace(state.speed)) / pk.seconds);
      // Rooftop jobs: the pull-in takes at most the first share of the access phase (the choreography has the rest),
      // so it never holds the technician back and a loaded save resumes in step.
      const siteJob = v.jobId ? state.jobs[v.jobId] : undefined;
      if (siteJob?.status === 'arriving' && siteJob.phaseTotal > 0 && isRoofJob(state, siteJob)) pk.t = Math.max(pk.t, Math.min(1, (1 - siteJob.phaseRemaining / siteJob.phaseTotal) / ROOF_PARK_SHARE));
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
      <VanContactShadow classId={classId} />
      <Selectable selection={{ kind: 'vehicle', id }} ringRadius={4.2} ringOffset={[0, 0.07, 0]}>
        <VehicleGltf classId={classId as never} paint={paint as never} upgrades={(upgrades ? upgrades.split(',') : []) as never} wear={Number(wear) || 0} onRig={onRig} />
        <mesh position={[0, 1.2, 0]} visible={false}>
          <boxGeometry args={[2.4, 2.6, 6]} />
          <meshBasicMaterial />
        </mesh>
      </Selectable>
      {upgrades.split(',').includes('ladder-rack') && (
        <Suspense fallback={null}>
          <LadderView id={id} classId={classId as VehicleClass} rig={rig} />
        </Suspense>
      )}
    </group>
  );
}

/**
 * The vehicle's extension ladder (rooftop kit base and fly sections): one object, on the rack (following the chassis
 * as it rolls and pitches) or wherever the technician working with it has it this frame (rooftopChoreo.ts).
 */
function LadderView({ id, classId, rig }: { id: string; classId: VehicleClass; rig: React.RefObject<VehicleRig | null> }) {
  const { scene } = useGLTF(ROOFTOP_KIT_URL);
  const ladder = useMemo(() => {
    const root = new THREE.Group();
    root.name = 'ladder:' + id;
    const base = scene.getObjectByName('ladder-base')!.clone(true);
    const fly = scene.getObjectByName('ladder-fly')!.clone(true);
    for (const o of [base, fly]) {
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      root.add(o);
    }
    return { root, fly };
  }, [scene, id]);
  useFrame(() => {
    const pose = ladderVisuals.get(id) ?? rackPose(classId);
    const holder = ladder.root.parent;
    if (!holder) return;
    const q = frameQuat(pose);
    if (pose.mode === 'rack') {
      // On the rack: the vehicle's frame, turned with the chassis about the vehicle's origin.
      const ch = rig.current?.chassis;
      const cq = ch ? new THREE.Quaternion().setFromEuler(ch.rotation) : new THREE.Quaternion();
      ladder.root.position.copy(pose.foot).applyQuaternion(cq);
      ladder.root.quaternion.copy(cq).multiply(q);
    } else {
      // In the world: into the vehicle's frame.
      holder.updateMatrixWorld(true);
      const m = new THREE.Matrix4().compose(pose.foot, q, new THREE.Vector3(1, 1, 1));
      m.premultiply(holder.matrixWorld.clone().invert());
      m.decompose(ladder.root.position, ladder.root.quaternion, ladder.root.scale);
    }
    ladder.fly.position.set(0, pose.fly, 0);
  });
  return <primitive object={ladder.root} />;
}

/** Soft ground contact under a fleet vehicle (the sun shadow leaves the tyres floating otherwise). */
function VanContactShadow({ classId }: { classId: string }) {
  const blob = useMemo(() => contactBlob(2.75, classId === 'box-truck' ? 8.2 : classId === 'pickup' ? 6.2 : 6.4, 0.5, [0, 0.02, 0]), [classId]);
  return <primitive object={blob} />;
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
    const unit = job && isRoofJob(s, job) ? servicedUnit(roofSpec(s.customers[job.customerId].lotId)!) : null;
    return { role: e.role, look: e.look, status: e.status, jobId: e.jobId, jobStatus: job?.status, lotId: job ? s.customers[job.customerId]?.lotId : undefined, crew: job ? Math.max(0, [job.technicianId, ...job.crewIds].indexOf(id)) : 0, roofUnit: unit ? { height: unit.size.height } : null };
  });
  const pace = useGame((s) => visualPace(s.speed));
  const arrival = useRef<{ jobId: string | null; stage: ArrivalStage; t: number; walked: number; from: { x: number; z: number }; out: { x: number; z: number }; path: { x: number; z: number }[] }>({
    jobId: null, stage: 'work', t: 0, walked: 0, from: { x: 0, z: 0 }, out: { x: 0, z: 0 }, path: [],
  });
  // The stage drives the animation clip, so it is React state; it changes a handful of times per job.
  const [stage, setStage] = useState<ArrivalStage | null>(null);
  // Soft ground contact under the crew member (kneeling or standing).
  const contact = useMemo(() => contactBlob(0.95, 0.85, 0.34, [0, 0.022, 0.05]), []);
  // Rooftop jobs (rooftopChoreo.ts): which sequence plays and how far into it, the clip it asks for, and the
  // hand and foot targets the rig reads every frame.
  const roofRun = useRef<{ jobId: string | null; seq: 'up' | 'work' | 'down' | null; t: number }>({ jobId: null, seq: null, t: 0 });
  const [roofAnim, setRoofAnim] = useState<WorkerAnim | null>(null);
  const motion = useRef<WorkerMotion | null>(null);

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
    const r = roofRun.current;
    const vehicle = job?.vehicleId ? s.vehicles[job.vehicleId] : undefined;
    const spec = job && lot && isRoofJob(s, job) ? roofSpec(lot.id) : null;
    const plan = spec && vehicle ? roofPlanFor(spec, vehicle.classId) : null;
    if (job && plan && vehicle && (e.status === 'walking' || e.status === 'working')) {
      // The lead technician does the ladder; anyone else riding along waits by the van.
      const idx = Math.max(0, [job.technicianId, ...job.crewIds].indexOf(e.id));
      const down = vehicle.packUp?.jobId === job.id;
      const seq = down ? 'down' : job.status === 'arriving' ? 'up' : 'work';
      if (r.jobId !== job.id || r.seq !== seq) {
        r.jobId = job.id;
        r.seq = seq;
        r.t = 0;
      }
      // Own pace, but never behind the simulated phase (a loaded save resumes at the matching point; at high game
      // speed the sequence plays briskly instead of lagging).
      const step = dt * visualPace(s.speed);
      let frame: ChoreoFrame | null = null;
      if (seq === 'up') {
        if (!van?.settled) {
          g.visible = false;
          ladderVisuals.delete(vehicle.id);
          if (roofAnim !== 'walk') setRoofAnim('walk');
          (window.__egoWorkerStage ??= {})[id] = 'roof:riding';
          return;
        }
        // The van's pull-in has the first share of the access phase (VehicleView); the choreography the rest.
        const prog = job.phaseTotal > 0 ? 1 - Math.max(0, job.phaseRemaining) / job.phaseTotal : 1;
        const floor = Math.max(0, (prog - ROOF_PARK_SHARE) / (1 - ROOF_PARK_SHARE));
        r.t = Math.min(plan.upTotal, Math.max(r.t + step, floor * plan.upTotal));
        frame = frameAt(plan.up, r.t);
      } else if (seq === 'down') {
        const p = vehicle.packUp!;
        const prog = 1 - Math.max(0, p.remaining) / p.total;
        r.t = Math.min(plan.downTotal, Math.max(r.t + step, prog * plan.downTotal));
        frame = frameAt(plan.down, r.t);
      }
      if (idx > 0) {
        // A second crew member: beside the van's door.
        g.position.set(plan.van.x, 0, plan.van.z);
        g.visible = !!frame || seq === 'work';
      } else if (frame) {
        g.position.copy(frame.pos);
        g.rotation.order = 'YXZ';
        g.rotation.set(frame.lean, frame.heading, 0);
        g.visible = !(seq === 'down' && r.t >= plan.downTotal);
        ladderVisuals.set(vehicle.id, frame.ladder);
        // Hands and feet into the character's frame.
        g.updateMatrixWorld(true);
        const inv = g.matrixWorld.clone().invert();
        const local = (v?: THREE.Vector3) => (v ? v.clone().applyMatrix4(inv) : undefined);
        motion.current = { handL: local(frame.limbs.handL), handR: local(frame.limbs.handR), footL: local(frame.limbs.footL), footR: local(frame.limbs.footR), pace: frame.pace, u: frame.u, footPitch: -frame.lean };
        const wanted: WorkerAnim = frame.anim === 'hidden' || frame.anim === 'work' ? 'idle' : frame.anim;
        if (roofAnim !== wanted) setRoofAnim(wanted);
        if (seq === 'up' && r.t >= plan.upTotal) siteFor(job.id).arrived.add(e.id);
      } else {
        // At the rooftop unit: kneeling or standing at its service side, on the deck; the ladder stays footed.
        g.position.copy(plan.workSpot);
        g.rotation.order = 'YXZ';
        g.rotation.set(0, plan.workHeading, 0);
        ladderVisuals.set(vehicle.id, frameAt(plan.up, plan.upTotal).ladder);
        siteFor(job.id).arrived.add(e.id);
        if (roofAnim !== null) setRoofAnim(null);
      }
      if (stage !== null) setStage(null);
      (window.__egoWorkers ??= {})[id] = { x: g.position.x, z: g.position.z, y: g.position.y, status: e.status };
      (window.__egoWorkerHeading ??= {})[id] = g.rotation.y;
      (window.__egoWorkerStage ??= {})[id] = frame ? 'roof:' + frame.stage : 'roof:work';
      return;
    }
    if (r.jobId) {
      // Left the rooftop job (in the van, or reassigned): back to the plain frame.
      r.jobId = null;
      r.seq = null;
      g.rotation.order = 'XYZ';
      g.rotation.x = 0;
      g.position.y = 0;
      if (roofAnim !== null) setRoofAnim(null);
    }
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
      (window.__egoWorkerHeading ??= {})[id] = g.rotation.y;
      (window.__egoWorkerStage ??= {})[id] = a.stage;
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
    (window.__egoWorkerHeading ??= {})[id] = g.rotation.y;
    (window.__egoWorkerStage ??= {})[id] = null;
  });

  if (!info) return null;
  const anim: WorkerAnim = roofAnim ??
    (stage === 'exit' || stage === 'walk'
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
          : 'idle');
  // At a house unit: how far the work spot is from the cabinet's service face, so the rig's IK puts
  // hands and tools on the cabinet (cityLayout: workPosition and condenserPosition; unit 0.92 m, 1.08 m on premium homes).
  const workLot = info.lotId ? lotById(info.lotId) : undefined;
  const work = (() => {
    if (!workLot) return undefined;
    // At a rooftop unit: the work spot is 0.62 m from its service face; the cabinet stands on its curb or rails.
    const roof = info.roofUnit;
    if (roof) return { face: 0.62, top: roof.height, bag: info.crew === 0 ? BAG_LOCAL : undefined };
    if (workLot.kind !== 'house') return undefined;
    const c = condenserPosition(workLot);
    const w = workPosition(workLot, info.crew);
    const size = workLot.style === 'premium' ? 1.08 : 0.92;
    return { face: Math.hypot(c.x - w.x, c.z - w.z) - size / 2, top: size + 0.04, bag: info.crew === 0 ? BAG_LOCAL : undefined };
  })();
  return (
    <group ref={group} name={`employee:${id}`}>
      <primitive object={contact} />
      <Selectable selection={{ kind: 'employee', id }} ringRadius={1.1} ringOffset={[0, 0.07, 0]}>
        {/* The rig is modelled at ~1.8 m tall: draw it at true scale next to the 0.96 m condenser. */}
        <Suspense fallback={null}>
          <Worker role={info.role} look={info.look} anim={anim} pace={pace} work={work} motion={motion} />
        </Suspense>
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

/**
 * A contact shadow under each named part that stands on the ground, as its child so it shows and
 * hides with the part. Sized from the part's footprint in its own frame.
 */
export function addPartContactShadows(root: THREE.Object3D, names: string[]): void {
  root.updateMatrixWorld(true);
  for (const name of names) {
    const part = root.getObjectByName(name);
    if (!part || part.getObjectByName('contact-shadow')) continue;
    const inv = new THREE.Matrix4().copy(part.matrixWorld).invert();
    const box = new THREE.Box3();
    part.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
    });
    if (box.isEmpty()) continue;
    const c = box.getCenter(new THREE.Vector3());
    part.add(contactBlob((box.max.x - box.min.x) * 1.5 + 0.12, (box.max.z - box.min.z) * 1.5 + 0.12, 0.5, [c.x, box.min.y + 0.006, c.z]));
  }
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
    addPartContactShadows(root, ['bag', 'cylinder']);
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
  useMemo(() => addPartContactShadows(kit, Object.keys(EQUIPMENT_FLAGS)), [kit]);
  useFrame(() => {
    const arrived = (siteVisuals.get(jobId)?.arrived.size ?? 0) > 0;
    for (const [name, flag] of Object.entries(EQUIPMENT_FLAGS)) {
      const part = kit.getObjectByName(name);
      if (part) part.visible = arrived && flags.includes(flag);
    }
  });
  return <primitive object={kit} name="jobsite-equipment" />;
}

/**
 * Rooftop jobs: the tool bag set down on the roof deck beside the technician at the unit's service side (the gauge
 * manifold and hoses of the ground kit are built for a condenser's valves, so they stay in the van).
 */
function RoofSiteBag({ jobId, lotId }: { jobId: string; lotId: string }) {
  const { scene } = useGLTF(KIT_URL);
  const spec = roofSpec(lotId);
  const unit = spec ? servicedUnit(spec) : null;
  const bag = useMemo(() => {
    const src = scene.getObjectByName('bag');
    if (!src || !spec || !unit) return null;
    const b = src.clone(true);
    b.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    // Beside his hip on the free-hand side (BAG_LOCAL in his frame: +z toward the unit).
    const yaw = Math.atan2(-unit.serviceDir.x, -unit.serviceDir.z);
    const w = unit.workSpot;
    b.position.set(w.x + BAG_LOCAL.x * Math.cos(yaw) + BAG_LOCAL.z * Math.sin(yaw), spec.deckY + 0.06, w.z - BAG_LOCAL.x * Math.sin(yaw) + BAG_LOCAL.z * Math.cos(yaw));
    b.rotation.set(0, yaw, 0);
    b.visible = false;
    return b;
  }, [scene, spec, unit]);
  useEffect(() => () => void siteVisuals.delete(jobId), [jobId]);
  useFrame(() => {
    if (bag) bag.visible = (siteVisuals.get(jobId)?.arrived.size ?? 0) > 0;
  });
  return bag ? <primitive object={bag} name="roof-kit" /> : null;
}

/** Tools staged beside the condenser while a technician is on site: tool bag, gauge manifold with hoses, a recovery cylinder on installs, and the company equipment that came along. */
export function JobSiteProps() {
  const sites = useGame((s) =>
    Object.values(s.jobs)
      .filter((j) => ['arriving', 'diagnosing', 'awaiting-diagnosis', 'quoted', 'awaiting-authorization', 'repairing', 'installing'].includes(j.status))
      .map((j) => `${j.id}:${s.customers[j.customerId].lotId}:${isRoofJob(s, j) ? 'roof' : j.status === 'installing' ? 'i' : 'r'}:${siteEquipment(s, j)}`)
      .join('|'),
  );
  if (!sites) return null;
  return (
    <>
      {sites.split('|').map((entry) => {
        const [id, lotId, kind, equipment] = entry.split(':');
        const lot = lotById(lotId);
        if (!lot) return null;
        if (kind === 'roof') return <RoofSiteBag key={id} jobId={id} lotId={lotId} />;
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
