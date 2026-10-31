import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { getGameState, useApp, type CameraCommand, type ServiceView } from '@/app/store';
import { curbParking, lotById, workPosition } from '@/game/world/cityLayout';
import type { JobStatus } from '@/game/simulation/types';
import { mainCanvas, measureSafeArea } from '@/ui/safeArea';
import type { SafeArea } from './cameraOcclusion';
import { scoreView } from './cameraComposition';
import { cameraInput } from './CameraRig';
import { curbDoor, serviceObstacles, serviceSubject, serviceViewCamera, siteFor, WALK_TRACK_WEIGHT, WALKING, type ServicePhase } from './serviceCall';

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

  function frame(v: ServiceView, reason: string, follow = false) {
    const state = getGameState();
    const job = state?.jobs[v.jobId];
    const lot = lotById(v.lotId);
    if (!job || !lot || !controls) {
      useApp.getState().setServiceView(null);
      return;
    }
    const phase = phaseOf(job.status);
    const canvas = mainCanvas();
    const aspect = (canvas?.clientWidth ?? window.innerWidth) / Math.max(1, canvas?.clientHeight ?? window.innerHeight);
    const safe = measureSafeArea(canvas);
    const tech = techOf(v);
    const walking = !!tech?.walking && phase !== 'done';
    const offset = camera.position.clone().sub(controls.target);
    // Where he will be on his way to the unit (a straight walk from the van door): the walking shot must keep him in view there.
    const spot = workPosition(lot, 0);
    const ahead = walking ? [0.25, 0.5, 0.75, 0.95].map((k) => ({ x: tech!.pos.x + (spot.x - tech!.pos.x) * k, z: tech!.pos.z + (spot.z - tech!.pos.z) * k })) : undefined;
    // Once the work is done the shot goes back to the property (the technician packs up and leaves).
    const mode = phase === 'done' ? 'property' : v.mode;
    const shot = serviceViewCamera(lot, mode, aspect, safe, {
      phase: phase === 'done' || phase === null ? 'diagnosis' : phase,
      techPos: walking ? tech!.pos : undefined,
      standing: walking,
      keepAzimuth: follow ? Math.atan2(offset.x, offset.z) : undefined,
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
      command = { ...command, track: { object: tech!.object, anchor: tech!.pos, weight: WALK_TRACK_WEIGHT } };
    }
    // Re-aiming a followed view mid-walk and settling into the work shot on arrival glide more slowly than a mode change.
    if (reason === 'follow') command = { ...command, duration: 2 };
    else if (reason === 'arrived') command = { ...command, duration: 1.6 };
    useApp.getState().camera(command);
    framed.current = { rev: v.rev, phase, safe, tech: tech?.pos ?? null, walking, at: performance.now() };
    window.__egoServiceView = { requested: v.mode, mode: shot.mode, phase, reason, walking, ms: +shot.ms.toFixed(1), report: shot.report, aspect: +aspect.toFixed(3), safe };
  }

  /** Whether the followed view (as CameraRig has slid it) still shows the walking technician and the unit. */
  function followStillWorks(v: ServiceView, pos: { x: number; z: number }): boolean {
    const lot = lotById(v.lotId);
    const canvas = mainCanvas();
    if (!lot || !controls || !canvas) return true;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const subject = serviceSubject(lot, 'work', { techPos: pos, standing: true });
    const offset = camera.position.clone().sub(controls.target);
    const distance = offset.length();
    const pose = { target: { x: controls.target.x, y: controls.target.y, z: controls.target.z }, azimuth: Math.atan2(offset.x, offset.z), elevation: Math.asin(offset.y / Math.max(distance, 1e-6)), distance };
    const r = scoreView(pose, subject, serviceObstacles(lot, 'work', subject.focus), aspect, 'work', measureSafeArea(canvas), true, WALKING);
    window.__egoServiceFollow = typeof r === 'string' ? r : 'ok';
    return typeof r !== 'string';
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
    if (!walking || !tech) return;
    if (f.tech && Math.hypot(tech.pos.x - f.tech.x, tech.pos.z - f.tech.z) < FOLLOW_STEP) return;
    f.tech = tech.pos;
    if (!followStillWorks(v, tech.pos)) frame(v, 'follow', true);
  });

  return null;
}
