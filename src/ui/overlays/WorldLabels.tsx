import { useCallback, useMemo } from 'react';
import { vanVisuals } from '@/world/scene/serviceCall';
import * as THREE from 'three';
import { getGameState, useApp, useGame } from '@/app/store';
import { registerLabel } from '@/world/interactions/labels';
import { lotById } from '@/game/world/cityLayout';
import { etaMinutes } from '@/game/fleet/fleet';

/**
 * DOM layer for world-anchored labels: job pins over houses, status tags over moving
 * vehicles, and training badges over employees. Positioned every frame by LabelProjector.
 */
export function WorldLabels() {
  const showLabels = useApp((s) => s.settings.showLabels);
  const jobs = useGame((s) =>
    Object.values(s.jobs)
      .filter((j) => !['completed', 'declined', 'expired', 'cancelled'].includes(j.status))
      .map((j) => ({ id: j.id, lotId: s.customers[j.customerId].lotId, status: j.status, kind: j.kind })),
  );
  const vehicles = useGame((s) => Object.values(s.vehicles).filter((v) => v.status === 'enroute' || v.status === 'returning').map((v) => ({ id: v.id, nickname: v.nickname, status: v.status, eta: Math.max(0, Math.round(etaMinutes(v))) })));
  const trainees = useGame((s) => Object.values(s.employees).filter((e) => e.status === 'training').map((e) => ({ id: e.id, name: e.name })));
  return (
    <div className="world-labels" aria-hidden={false}>
      {jobs.map((j) => (
        <JobPin key={j.id} {...j} />
      ))}
      {showLabels && vehicles.map((v) => <VehicleTag key={v.id} {...v} />)}
      {trainees.map((t) => (
        <TraineeTag key={t.id} {...t} />
      ))}
    </div>
  );
}

function useAnchor(id: string, getPosition: (out: THREE.Vector3) => boolean, referenceDistance: number) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) registerLabel(id, { el, getPosition, referenceDistance });
      else registerLabel(id, null);
    },
    [id, getPosition, referenceDistance],
  );
}

function JobPin({ id, lotId, status, kind }: { id: string; lotId: string; status: string; kind: string }) {
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
  const ref = useAnchor(`job:${id}`, getPosition, 110);
  if (!lot) return null;
  const tone = status === 'lead' ? 'lead' : status === 'awaiting-diagnosis' || status === 'quoted' ? 'decision' : status === 'accepted' ? 'accepted' : 'active';
  const label =
    status === 'lead'
      ? kind === 'callback'
        ? 'Callback'
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
      className={`job-pin ${tone}`}
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
