import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { getGameState, useApp, type CameraCommand, type ServiceView } from '@/app/store';
import { curbParking, lotById, workPosition } from '@/game/world/cityLayout';
import type { JobStatus } from '@/game/simulation/types';
import { mainCanvas, measureSafeArea } from '@/ui/safeArea';
import type { SafeArea } from './cameraOcclusion';
import { cameraInput, cameraMotion } from './CameraRig';
import { curbDoor, followFailure, serviceViewCamera, siteFor, WALK_AHEAD, type ServicePhase } from './serviceCall';
import { isRoofJob, roofSpec } from '@/game/world/rooftops';
import { ladderVisuals, roofPlanFor } from './rooftopChoreo';
import { roofStageGroup, rooftopServiceCamera, type RoofStageGroup } from './rooftopCamera';

/** Rooftop calls: follow the technician once he has moved this far on the ground (m), and up the ladder (the ladder shot frames the rungs round him). */
const ROOF_FOLLOW_STEP = 3;
const ROOF_LADDER_FOLLOW_STEP = 1.4;
const ROOF_FOLLOW_MIN_INTERVAL = 1200;
/** How far ahead of the technician (m, up or down the ladder) a followed ladder shot aims. */
const ROOF_LADDER_LOOK_AHEAD = 1.1;
/** Rooftop follow moves run this much quicker at the top game speed; at 1× and 2× they are unchanged. */
const roofFollowPace = (speed: number) => (speed >= 5 ? 0.4 : 1);
/** At top speed the way up, the ladder and the whole pack-up pass faster than a camera move: the service camera holds the site view for them. */
const holdsSite = (speed: number, group: RoofStageGroup, status: JobStatus) => speed >= 5 && (group === 'ladder' || status === 'arriving' || status === 'completed');

/**
 * The service camera's director. While the player uses the service camera at a job (Property,
 * Watch Work or Detail, from the inspector or the camera bar), it asks for the best-composed shot
 * (serviceViewCamera) and hands it to CameraRig as an orbit flight. It reframes on its own only
 * when something the shot depends on changes:
 *  - the mode, when the player picks another one;
 *  - the job phase (arrival, diagnosis, repair; the property view once the work is done);
 *  - the free part of the screen (the inspector collapses, expands or resizes);
 *  - the technician reaching the unit after walking up to it.
 * While he walks up (or is still stepping out of the van) the shot frames him and the unit, and
 * CameraRig slides the view after him every frame (CameraCommand.track) on the same heading; the
 * director only checks every FOLLOW_STEP that the followed view still sees him, and re-aims if not.
 * It never reframes while the player drags, and holds off for HANDS_OFF ms after any drag, zoom or
 * key; panning away from the site (CameraRig) or any other camera command ends the service view,
 * after which nothing is forced again. The composition search runs only at these moments (a few
 * milliseconds each), never per frame.
 */

const CHECK_INTERVAL = 0.25;
const HANDS_OFF = 8000;
/** The technician counts as at his work spot within this distance (m); beyond it he is walking. */
const AT_SPOT = 0.6;
/** Walking: check the followed view each time he has moved this far (m). */
const FOLLOW_STEP = 1.2;

function phaseOf(status: JobStatus): ServicePhase | 'done' | null {
  if (status === 'arriving') return 'arrival';
  if (status === 'diagnosing' || status === 'awaiting-diagnosis' || status === 'quoted' || status === 'awaiting-authorization') return 'diagnosis';
  if (status === 'repairing' || status === 'installing') return 'repair';
  if (status === 'completed') return 'done';
  return null;
}

declare global {
  interface Window {
    /** The last service framing (mode asked and shown, phase, composition report, solve time), for evidence captures. */
    __egoServiceView?: unknown;
    __egoServiceViewApi?: boolean;
    /** The last check of the followed walking view: 'ok' or why it no longer works. */
    __egoServiceFollow?: string;
  }
}

interface Framed {
  rev: number;
  phase: ServicePhase | 'done' | null;
  safe: SafeArea;
  /** Where the technician (or his stand-in at the van door) was when last framed or checked. */
  tech: { x: number; z: number } | null;
  walking: boolean;
  at: number;
  /** Consecutive follow checks that found the followed view no longer working. */
  misses: number;
  /** The walk being followed (from where he was framed to his spot) and the share of it from which its plan keeps him in sight. */
  walk: { from: { x: number; z: number }; spot: { x: number; z: number }; holdsFrom: number } | null;
  /** Rooftop calls: the stage group framed (on the ground, on the ladder, on the roof) and where he was in 3D. */
  roof?: { group: RoofStageGroup; at3: THREE.Vector3 };
}

/** Two measured free areas differ enough to recompose (bars and panels moved, a card appeared). */
function layoutChanged(a: SafeArea, b: SafeArea): boolean {
  if (Math.abs(a.right - b.right) + Math.abs(a.bottom - b.bottom) + Math.abs((a.top ?? 0) - (b.top ?? 0)) > 0.04) return true;
  const ra = a.avoid ?? [];
  const rb = b.avoid ?? [];
  if (ra.length !== rb.length) return true;
  return ra.some((r, i) => r.some((v, k) => Math.abs(v - rb[i][k]) > 0.04));
}

export function ServiceDirector() {
  const view = useApp((s) => s.serviceView);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const framed = useRef<Framed | null>(null);
  const tick = useRef(0);

  useEffect(() => {
    window.__egoServiceViewApi = true;
  }, []);

  /**
   * The lead technician's drawn position and whether he is still on his way to the unit. Before he
   * has stepped out of the van his stand-in is the van's curb door, so the first shot already frames
   * the path he is about to walk. Null once he is back in the van after the work.
   */
  function techOf(v: ServiceView): { pos: { x: number; z: number }; walking: boolean; object: string } | null {
    const job = getGameState()?.jobs[v.jobId];
    const lot = lotById(v.lotId);
    if (!job?.technicianId || !lot) return null;
    const object = `employee:${job.technicianId}`;
    const o = scene.getObjectByName(object);
    if (o?.visible) {
      const p = o.getWorldPosition(new THREE.Vector3());
      const spot = workPosition(lot, 0);
      return { pos: { x: p.x, z: p.z }, walking: Math.hypot(p.x - spot.x, p.z - spot.z) >= AT_SPOT, object };
    }
    if (siteFor(job.id).leadArrivedAt === null && phaseOf(job.status) !== 'done') return { pos: curbDoor(curbParking(lot), 0.4), walking: true, object };
    return null;
  }

  /** The rooftop call's lead technician: drawn position (with height), facing, stage group, and the vehicle's ladder. */
  function roofTech(v: ServiceView) {
    const state = getGameState();
    const job = state?.jobs[v.jobId];
    if (!state || !job?.technicianId || !job.vehicleId) return null;
    const o = scene.getObjectByName(`employee:${job.technicianId}`);
    if (!o) return null;
    const pos = o.getWorldPosition(new THREE.Vector3());
    const stage = window.__egoWorkerStage?.[job.technicianId];
    return { pos, heading: o.rotation.y, group: roofStageGroup(stage), ladder: ladderVisuals.get(job.vehicleId) ?? null, visible: o.visible };
  }

  function frameRoof(v: ServiceView, reason: string, follow = false) {
    const state = getGameState()!;
    const job = state.jobs[v.jobId];
    const lot = lotById(v.lotId)!;
    const vehicle = job.vehicleId ? state.vehicles[job.vehicleId] : undefined;
    const spec = roofSpec(lot.id);
    const plan = spec && vehicle ? roofPlanFor(spec, vehicle.classId) : null;
    const tech = roofTech(v);
    const canvas = mainCanvas();
    const aspect = (canvas?.clientWidth ?? window.innerWidth) / Math.max(1, canvas?.clientHeight ?? window.innerHeight);
    const safe = measureSafeArea(canvas);
    if (!plan || !controls) return;
    const offset = camera.position.clone().sub(controls.target);
    // Before he steps out (or once back in the van) the van stands in for him; the property view frames the site.
    const stand = tech?.visible ? tech : { pos: new THREE.Vector3(plan.van.x, 0, plan.van.z), heading: plan.van.heading, group: 'ground' as RoofStageGroup, ladder: tech?.ladder ?? null };
    // On the ladder the view aims a little ahead of him in the direction he is moving: the next follow move is still
    // to come, and a tall upright screen has little room above his head.
    const last = framed.current?.roof;
    const climbed = stand.group === 'ladder' && last?.group === 'ladder' ? stand.pos.y - last.at3.y : 0;
    const aimAt = climbed === 0 ? stand.pos : stand.pos.clone().setY(Math.max(0, stand.pos.y + Math.sign(climbed) * ROOF_LADDER_LOOK_AHEAD));
    const shot = rooftopServiceCamera(lot, plan, v.mode, aspect, safe, { group: stand.group, tech: { pos: aimAt, heading: stand.heading }, ladder: stand.ladder, keepAzimuth: follow ? Math.atan2(offset.x, offset.z) : undefined, holdSite: holdsSite(state.speed, stand.group, job.status) });
    if (!shot) return;
    let command: Omit<CameraCommand, 'id'> = shot.command;
    // At high game speed a whole climb can take less time than one slow glide: the camera keeps up with him.
    const pace = roofFollowPace(state.speed);
    if (reason === 'follow') command = { ...command, duration: 1.6 * pace };
    else if (reason === 'stage') command = { ...command, duration: 1.8 * pace };
    useApp.getState().camera(command);
    const phase = phaseOf(job.status);
    framed.current = { rev: v.rev, phase, safe, tech: { x: stand.pos.x, z: stand.pos.z }, walking: false, at: performance.now(), misses: 0, walk: null, roof: { group: stand.group, at3: stand.pos.clone() } };
    window.__egoServiceView = { requested: v.mode, mode: shot.mode, phase, reason, roof: stand.group, ms: +shot.ms.toFixed(1), report: shot.report, aspect: +aspect.toFixed(3), safe };
  }

  function frame(v: ServiceView, reason: string, follow = false) {
    const state = getGameState();
    const job = state?.jobs[v.jobId];
    const lot = lotById(v.lotId);
    if (!job || !lot || !controls) {
      useApp.getState().setServiceView(null);
      return;
    }
    if (isRoofJob(state!, job)) return frameRoof(v, reason, follow);
    const phase = phaseOf(job.status);
    const canvas = mainCanvas();
    const aspect = (canvas?.clientWidth ?? window.innerWidth) / Math.max(1, canvas?.clientHeight ?? window.innerHeight);
    const safe = measureSafeArea(canvas);
    const tech = techOf(v);
    const walking = !!tech?.walking && phase !== 'done';
    const offset = camera.position.clone().sub(controls.target);
    // Where he will be on his way to the unit (a straight walk from the van door): the walking shot must keep him in view there.
    const spot = workPosition(lot, 0);
    const ahead = walking ? WALK_AHEAD.map((k) => ({ x: tech!.pos.x + (spot.x - tech!.pos.x) * k, z: tech!.pos.z + (spot.z - tech!.pos.z) * k })) : undefined;
    // Once the work is done the shot goes back to the property (the technician packs up and leaves).
    const mode = phase === 'done' ? 'property' : v.mode;
    const shot = serviceViewCamera(lot, mode, aspect, safe, {
      phase: phase === 'done' || phase === null ? 'diagnosis' : phase,
      techPos: walking ? tech!.pos : undefined,
      standing: walking,
      keepAzimuth: follow ? Math.atan2(offset.x, offset.z) : undefined,
      // A walking view that lost him re-aims to the best heading that keeps him in sight, only leaning toward the current one.
      keepWeight: reason === 'follow' ? 0.5 : undefined,
      ahead,
    });
    let command: Omit<CameraCommand, 'id'> = shot.command;
    if (walking && mode !== 'property') {
      // No composed shot of him walking from here: keep the view the player has and follow him in it,
      // rather than jumping to the unit's fixed close-up (where he is not).
      if (!shot.report) {
        const dist = offset.length();
        command = { type: 'focus', target: { x: controls.target.x, z: controls.target.z }, targetY: 0, distance: dist, azimuth: Math.atan2(offset.x, offset.z), elevation: Math.asin(offset.y / Math.max(dist, 1e-6)), orbit: true, service: true, watch: 'watch' in shot.command ? shot.command.watch : undefined };
      }
      const plan = 'plan' in shot ? shot.plan : null;
      if (plan) command = { ...command, track: { object: tech!.object, plan } };
    }
    // Re-aiming a followed view mid-walk and settling into the work shot on arrival glide more slowly than a mode change.
    if (reason === 'follow') command = { ...command, duration: 2.5 };
    else if (reason === 'arrived') command = { ...command, duration: 1.6 };
    useApp.getState().camera(command);
    const holdsFrom = 'holdsFrom' in shot ? shot.holdsFrom : 0;
    framed.current = { rev: v.rev, phase, safe, tech: tech?.pos ?? null, walking, at: performance.now(), misses: 0, walk: walking ? { from: tech!.pos, spot, holdsFrom } : null };
    window.__egoServiceView = { requested: v.mode, mode: shot.mode, phase, reason, walking, ms: +shot.ms.toFixed(1), report: shot.report, aspect: +aspect.toFixed(3), safe };
  }

  /**
   * Whether the followed view (as CameraRig has slid it) still shows the walking technician: the camera is not inside
   * anything, the group is still in the free part of the screen and clear of the UI cards, and his head or body is in
   * sight. Brushing past a bush or a head briefly behind a post is not worth a re-aim.
   */
  function followStillWorks(v: ServiceView, pos: { x: number; z: number }): boolean {
    const lot = lotById(v.lotId);
    const canvas = mainCanvas();
    if (!lot || !controls || !canvas) return true;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const offset = camera.position.clone().sub(controls.target);
    const distance = offset.length();
    const pose = { target: { x: controls.target.x, y: controls.target.y, z: controls.target.z }, azimuth: Math.atan2(offset.x, offset.z), elevation: Math.asin(offset.y / Math.max(distance, 1e-6)), distance };
    const why = followFailure(pose, lot, pos, aspect, measureSafeArea(canvas));
    window.__egoServiceFollow = why ?? 'ok';
    return why === null;
  }

  // Entering or changing mode: frame after the layout has settled (the inspector may just have collapsed).
  useEffect(() => {
    if (!view) {
      framed.current = null;
      return;
    }
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => {
      const v = useApp.getState().serviceView;
      if (v && v.rev === view.rev) frame(v, 'mode');
    })));
    return () => cancelAnimationFrame(raf);
  }, [view?.rev]);

  useFrame((_, dt) => {
    const v = useApp.getState().serviceView;
    const f = framed.current;
    if (!v || !f || f.rev !== v.rev) return;
    if ((tick.current += dt) < CHECK_INTERVAL) return;
    tick.current = 0;
    const state = getGameState();
    const job = state?.jobs[v.jobId];
    if (!job) {
      useApp.getState().setServiceView(null);
      return;
    }
    const phase = phaseOf(job.status);
    // The job is over and the crew has driven off: nothing left to watch.
    const vehicle = job.vehicleId ? state!.vehicles[job.vehicleId] : undefined;
    if (phase === null || (phase === 'done' && vehicle?.status !== 'onsite')) {
      useApp.getState().setServiceView(null);
      return;
    }
    if (useApp.getState().photo.on || cameraInput.dragging || performance.now() - cameraInput.lastInput < HANDS_OFF) return;
    if (isRoofJob(state!, job)) {
      // Rooftop call: reframe when he moves between the ground, the ladder and the roof, when the job moves on or the
      // layout changes, and follow him (on the player's heading) as he walks or climbs.
      const rt = roofTech(v);
      const group = rt?.visible ? rt.group : 'ground';
      if (!f.roof || group !== f.roof.group) return frameRoof(v, 'stage');
      if (phase !== f.phase) return frameRoof(v, 'phase');
      if (layoutChanged(measureSafeArea(mainCanvas()), f.safe)) return frameRoof(v, 'layout');
      if (v.mode === 'property' || !rt?.visible || cameraMotion.flying) return;
      // A held site view has nothing to follow.
      if (holdsSite(state!.speed, group, job.status)) return;
      if (group !== 'roof' && rt.pos.distanceTo(f.roof.at3) > (group === 'ladder' ? ROOF_LADDER_FOLLOW_STEP : ROOF_FOLLOW_STEP) && performance.now() - f.at > ROOF_FOLLOW_MIN_INTERVAL * roofFollowPace(state!.speed)) frameRoof(v, 'follow', true);
      return;
    }
    const tech = techOf(v);
    const walking = !!tech?.walking && phase !== 'done';
    // The simulation moves the job on (arriving → diagnosing) while he is still walking up: the
    // walking shot does not depend on it, so it is not re-aimed mid-walk.
    if (phase !== f.phase) {
      if (walking && f.walking) f.phase = phase;
      else return frame(v, 'phase');
    }
    if (layoutChanged(measureSafeArea(mainCanvas()), f.safe)) return frame(v, 'layout');
    if (v.mode === 'property') return;
    // He has reached the unit: the full Watch Work or Detail shot (on the player's heading if they turned the view meanwhile).
    if (f.walking && tech && !walking) return frame(v, 'arrived', cameraInput.lastInput > f.at);
    if (!walking || !tech || cameraMotion.flying) return;
    if (f.tech && Math.hypot(tech.pos.x - f.tech.x, tech.pos.z - f.tech.z) < FOLLOW_STEP) return;
    f.tech = tech.pos;
    // Re-aim only once he has been out of the view for two checks running: a head passing behind a trunk for a moment
    // is not worth moving the camera for.
    f.misses = followStillWorks(v, tech.pos) ? 0 : f.misses + 1;
    // Where the plan was picked knowing the first stretch beside the van hides him, it is not re-aimed there; nor over the
    // last metre or so, where he kneels and the arrival framing takes over (WALK_AHEAD ends short of the spot).
    const w = f.walk;
    const progress = w ? 1 - Math.hypot(w.spot.x - tech.pos.x, w.spot.z - tech.pos.z) / (Math.hypot(w.spot.x - w.from.x, w.spot.z - w.from.z) || 1) : 1;
    if (f.misses >= 2 && (!w || (progress >= w.holdsFrom && progress <= WALK_AHEAD[WALK_AHEAD.length - 1]))) frame(v, 'follow', true);
  });

  return null;
}
