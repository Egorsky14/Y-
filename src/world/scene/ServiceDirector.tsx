import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { getGameState, useApp, type ServiceView } from '@/app/store';
import { lotById, workPosition } from '@/game/world/cityLayout';
import type { JobStatus } from '@/game/simulation/types';
import { mainCanvas, measureSafeArea } from '@/ui/safeArea';
import type { SafeArea } from './cameraOcclusion';
import { cameraInput } from './CameraRig';
import { serviceViewCamera, type ServicePhase } from './serviceCall';

/**
 * The service camera's director. While the player uses the service camera at a job (Property,
 * Watch Work or Detail, from the inspector or the camera bar), it asks for the best-composed shot
 * (serviceViewCamera) and hands it to CameraRig as an orbit flight. It reframes on its own only
 * when something the shot depends on changes:
 *  - the mode, when the player picks another one;
 *  - the job phase (arrival, diagnosis, repair; the property view once the work is done);
 *  - the free part of the screen (the inspector collapses, expands or resizes);
 *  - the technician walking up to the unit (followed on a steady heading, then framed fully
 *    once he kneels).
 * It never reframes while the player drags, and holds off for HANDS_OFF ms after any drag, zoom or
 * key; panning away from the site (CameraRig) or any other camera command ends the service view,
 * after which nothing is forced again. The composition search runs only at these moments (a few
 * milliseconds each), never per frame.
 */

const CHECK_INTERVAL = 0.25;
const HANDS_OFF = 8000;
/** The technician counts as at his work spot within this distance (m); beyond it he is walking. */
const AT_SPOT = 0.6;
/** Walking: follow once he has moved this far (m) since the last framing. */
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
  }
}

interface Framed {
  rev: number;
  phase: ServicePhase | 'done' | null;
  safe: SafeArea;
  tech: { x: number; z: number } | null;
  atSpot: boolean;
  at: number;
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

  /** The lead technician's drawn position, or null while he is inside the van. */
  function techOf(v: ServiceView): { x: number; z: number } | null {
    const job = getGameState()?.jobs[v.jobId];
    const o = job?.technicianId ? scene.getObjectByName(`employee:${job.technicianId}`) : undefined;
    if (!o || !o.visible) return null;
    const p = o.getWorldPosition(new THREE.Vector3());
    return { x: p.x, z: p.z };
  }

  function frame(v: ServiceView, reason: string, follow = false) {
    const state = getGameState();
    const job = state?.jobs[v.jobId];
    const lot = lotById(v.lotId);
    if (!job || !lot) {
      useApp.getState().setServiceView(null);
      return;
    }
    const phase = phaseOf(job.status);
    const canvas = mainCanvas();
    const aspect = (canvas?.clientWidth ?? window.innerWidth) / Math.max(1, canvas?.clientHeight ?? window.innerHeight);
    const safe = measureSafeArea(canvas);
    const tech = techOf(v);
    const spot = workPosition(lot, 0);
    const atSpot = !tech || Math.hypot(tech.x - spot.x, tech.z - spot.z) < AT_SPOT;
    const offset = camera.position.clone().sub(controls?.target ?? new THREE.Vector3());
    // Once the work is done the shot goes back to the property (the technician packs up and leaves).
    const mode = phase === 'done' ? 'property' : v.mode;
    const shot = serviceViewCamera(lot, mode, aspect, safe, {
      phase: phase === 'done' || phase === null ? 'diagnosis' : phase,
      techPos: atSpot ? undefined : tech!,
      standing: !atSpot,
      keepAzimuth: follow ? Math.atan2(offset.x, offset.z) : undefined,
    });
    useApp.getState().camera(shot.command);
    framed.current = { rev: v.rev, phase, safe, tech, atSpot, at: performance.now() };
    window.__egoServiceView = { requested: v.mode, mode: shot.mode, phase, reason, ms: +shot.ms.toFixed(1), report: shot.report, aspect: +aspect.toFixed(3), safe };
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
    if (phase !== f.phase) return frame(v, 'phase');
    const safe = measureSafeArea(mainCanvas());
    if (Math.abs(safe.right - f.safe.right) + Math.abs(safe.bottom - f.safe.bottom) + Math.abs((safe.top ?? 0) - (f.safe.top ?? 0)) > 0.04) return frame(v, 'layout');
    if (v.mode === 'property') return;
    const lot = lotById(v.lotId)!;
    const tech = techOf(v);
    if (!tech) return;
    const spot = workPosition(lot, 0);
    const atSpot = Math.hypot(tech.x - spot.x, tech.z - spot.z) < AT_SPOT;
    if (atSpot && !f.atSpot) return frame(v, 'arrived');
    if (!atSpot && (!f.tech || Math.hypot(tech.x - f.tech.x, tech.z - f.tech.z) > FOLLOW_STEP)) return frame(v, 'follow', true);
  });

  return null;
}
