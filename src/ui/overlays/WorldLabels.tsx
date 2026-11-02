import { useCallback, useMemo } from 'react';
import { vanVisuals } from '@/world/scene/serviceCall';
import * as THREE from 'three';
import { getGameState, useApp, useGame } from '@/app/store';
import { registerLabel } from '@/world/interactions/labels';
import { lotById } from '@/game/world/cityLayout';
import { etaMinutes } from '@/game/fleet/fleet';
import { equipmentPlacement, vehicleHasLadder } from '@/game/world/rooftops';
import { missionStage } from '@/game/progression/mission';

/**
 * DOM layer for world-anchored labels: job pins over houses, status tags over moving
 * vehicles, and training badges over employees. Positioned every frame by LabelProjector.
 */
export function WorldLabels() {
  const showLabels = useApp((s) => s.settings.showLabels);
  const jobs = useGame((s) =>
    Object.values(s.jobs)
      .filter((j) => !['completed', 'declined', 'expired', 'cancelled'].includes(j.status))
      .map((j) => ({ id: j.id, lotId: s.customers[j.customerId].lotId, status: j.status, kind: j.kind, roof: equipmentPlacement(s.customers[j.customerId]) === 'roof' })),
  );
  const vehicles = useGame((s) => Object.values(s.vehicles).filter((v) => v.status === 'enroute' || v.status === 'returning').map((v) => ({ id: v.id, nickname: v.nickname, status: v.status, eta: Math.max(0, Math.round(etaMinutes(v))) })));
  const trainees = useGame((s) => Object.values(s.employees).filter((e) => e.status === 'training').map((e) => ({ id: e.id, name: e.name })));
  const missionJobId = useGame((s) => (s.mission?.status === 'active' ? s.mission.jobId : null));
  // Mission 01, before dispatch: which van the job will use.
  const missionVan = useGame((s) => {
    const stage = missionStage(s);
    if (stage !== 1 && stage !== 2) return null;
    const van = Object.values(s.vehicles).find((v) => vehicleHasLadder(v) && v.status === 'parked');
    return van ? { id: van.id, nickname: van.nickname } : null;
  });
  return (
    <div className="world-labels" aria-hidden={false}>
      {jobs.map((j) => (
        <JobPin key={j.id} {...j} mission={j.id === missionJobId} />
      ))}
      {missionVan && <MissionVanTag {...missionVan} />}
      {showLabels && vehicles.map((v) => <VehicleTag key={v.id} {...v} />)}
      {trainees.map((t) => (
        <TraineeTag key={t.id} {...t} />
      ))}
    </div>
  );
}

function useAnchor(id: string, getPosition: (out: THREE.Vector3) => boolean, referenceDistance: number, minScale?: number) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) registerLabel(id, { el, getPosition, referenceDistance, minScale });
      else registerLabel(id, null);
    },
    [id, getPosition, referenceDistance, minScale],
  );
}

function JobPin({ id, lotId, status, kind, roof, mission }: { id: string; lotId: string; status: string; kind: string; roof: boolean; mission: boolean }) {
  const select = useApp((s) => s.select);
  const camera = useApp((s) => s.camera);
  const lot = lotById(lotId);
  const getPosition = useMemo(() => {
    const c = lot?.center ?? { x: 0, z: 0 };
    return (out: THREE.Vector3) => {
      out.set(c.x, 12.5, c.z);
      return true;
    };
  }, [lot]);
  const ref = useAnchor(`job:${id}`, getPosition, 110, mission ? 1 : undefined);
  if (!lot) return null;
  const tone = status === 'lead' ? 'lead' : status === 'awaiting-diagnosis' || status === 'quoted' ? 'decision' : status === 'accepted' ? 'accepted' : 'active';
  const label =
    status === 'lead'
      ? kind === 'callback'
        ? 'Callback'
        : mission
          ? 'Mission 01 · New call'
          : 'New call'
      : status === 'accepted'
        ? kind === 'replacement'
          ? 'Install ready'
          : 'Dispatch'
        : status === 'awaiting-diagnosis'
          ? 'Findings ready'
          : status === 'quoted'
            ? 'Quote'
            : status === 'awaiting-authorization'
              ? 'Authorizing'
              : status === 'enroute'
                ? 'Tech en route'
                : status === 'installing'
                  ? 'Installing'
                  : status === 'repairing'
                    ? 'Repairing'
                    : 'Diagnosing';
  return (
    <button
      ref={ref}
      className={`job-pin ${tone}${mission ? ' mission' : ''}`}
      style={{ display: 'none' }}
      data-testid={`job-pin-${id}`}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'job', id });
        camera({ type: 'focus', target: { x: lot.center.x, z: lot.center.z }, distance: 60 });
      }}
    >
      <span className="job-pin-dot" />
      {label}
      {/* Rooftop calls (a ladder climb) are marked so they stand out among the ground calls. */}
      {roof && <span className="job-pin-roof">· Rooftop</span>}
    </button>
  );
}

/** Mission 01: the van waiting at headquarters, with the rack that makes the job possible. */
function MissionVanTag({ id, nickname }: { id: string; nickname: string }) {
  const getPosition = useMemo(
    () => (out: THREE.Vector3) => {
      const v = getGameState()?.vehicles[id];
      if (!v) return false;
      out.set(v.position.x, 4.2, v.position.z);
      return true;
    },
    [id],
  );
  const ref = useAnchor(`mission-van:${id}`, getPosition, 80, 0.95);
  const select = useApp((s) => s.select);
  return (
    <button ref={ref} className="world-label vehicle mission-van" style={{ display: 'none' }} onClick={() => select({ kind: 'vehicle', id })} data-testid="mission-van-tag">
      {nickname} · Ladder rack · Ready
    </button>
  );
}

function VehicleTag({ id, nickname, status, eta }: { id: string; nickname: string; status: string; eta: number }) {
  const getPosition = useMemo(
    () => (out: THREE.Vector3) => {
      const v = getGameState()?.vehicles[id];
      if (!v) return false;
      // Parked at a job, the van is drawn in the curb lane rather than at the route's end.
      const parked = vanVisuals.get(id);
      out.set(parked?.x ?? v.position.x, 4.2, parked?.z ?? v.position.z);
      return true;
    },
    [id],
  );
  const ref = useAnchor(`veh:${id}`, getPosition, 80);
  const select = useApp((s) => s.select);
  return (
    <button ref={ref} className="world-label vehicle" style={{ display: 'none' }} onClick={() => select({ kind: 'vehicle', id })} data-testid={`vehicle-tag-${id}`}>
      {nickname} · {status === 'returning' ? 'Returning' : 'En route'} · ETA {eta} min
    </button>
  );
}

function TraineeTag({ id, name }: { id: string; name: string }) {
  const getPosition = useMemo(
    () => (out: THREE.Vector3) => {
      const e = getGameState()?.employees[id];
      if (!e) return false;
      out.set(e.position.x, 2.6, e.position.z);
      return true;
    },
    [id],
  );
  const ref = useAnchor(`emp:${id}`, getPosition, 60);
  return (
    <div ref={ref} className="world-label training" style={{ display: 'none' }}>
      {name.split(' ')[0]} · training
    </div>
  );
}
