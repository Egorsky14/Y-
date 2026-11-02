import { useEffect, useRef, useState } from 'react';
import { useApp, useGame, type ServiceCameraMode } from '@/app/store';
import { faultById } from '@/game/jobs/faults';
import { MISSION_OBJECTIVE_COUNT, ROOFTOP_RESCUE, missionJob, missionStage, type MissionStage } from '@/game/progression/mission';
import type { MissionSummary } from '@/game/simulation/types';
import { cameraInput } from '@/world/scene/CameraRig';
import { missionEstablishingShot, missionFleetShot } from '@/world/scene/missionCamera';
import { mainCanvas } from '@/ui/safeArea';
import { Money } from '../components/common';
import { deviceProfile } from '@/app/device';

const OBJECTIVE_NAMES: Record<MissionStage, string> = {
  1: 'Accept the call',
  2: 'Dispatch the crew',
  3: 'Travel to the property',
  4: 'Access the roof',
  5: 'Diagnose the rooftop unit',
  6: 'Prepare the repair',
  7: 'Complete rooftop service',
  8: 'Mission complete',
};

/** What the technician is doing right now, in the player's words, from the choreography that is actually playing. */
const CLIMB_STEPS: Record<string, string> = {
  'to-rack': 'Walking to the ladder rack',
  retrieve: 'Taking the ladder off the rack',
  carry: 'Carrying the ladder to the building',
  raise: 'Setting the ladder at the access point',
  extend: 'Extending the ladder past the roof edge',
  mount: 'Stepping onto the ladder',
  climb: 'Climbing to the roof',
  transfer: 'Stepping over the parapet',
  'roof-walk': 'Walking to the rooftop unit',
  work: 'At the rooftop unit',
};
const PACK_UP_STEPS: Record<string, string> = {
  work: 'Finishing up at the unit',
  collect: 'Collecting the tools',
  'roof-walk': 'Walking back to the ladder',
  transfer: 'Stepping back onto the ladder',
  climb: 'Climbing down',
  dismount: 'Stepping off the ladder',
  retract: 'Retracting the ladder',
  lower: 'Lowering the ladder',
  'pick-up': 'Shouldering the ladder',
  carry: 'Carrying the ladder back to the van',
  stow: 'Securing the ladder on the rack',
  'to-door': 'Heading to the driver’s door',
  enter: 'Getting in the van',
};

/** How long the arrival shot of the van holds at 1× before the camera goes to the technician. */
const ARRIVAL_SHOT_MS = 6500;

function aspectRatio(): number {
  const c = mainCanvas();
  return c ? c.clientWidth / Math.max(1, c.clientHeight) : window.innerWidth / Math.max(1, window.innerHeight);
}

/**
 * Camera and panel moves when the job reaches a new phase, once each: the player can look anywhere in between, and a
 * player who left the service camera or picked another shot is not pulled back.
 */
function useMissionCues() {
  const ready = useApp((s) => s.sceneReady);
  const job = useGame((s) => {
    const j = s.mission?.status === 'active' ? missionJob(s) : undefined;
    // The job closes on the roof; the van driving off, ladder stowed, is its own moment.
    const departing = j?.status === 'completed' && !!j.vehicleId && s.vehicles[j.vehicleId]?.status !== 'onsite';
    return j ? { id: j.id, status: departing ? 'departing' : j.status, vehicleId: j.vehicleId } : null;
  });
  const status = job?.status ?? null;
  const last = useRef<string | null>(null);
  const cueMode = useRef<ServiceCameraMode | null>(null);
  // Whether the player closed the service camera themselves. It also closes by itself the moment the van leaves the
  // site, which is exactly when the van should be followed, so that closing does not count.
  const viewOn = useApp((s) => !!s.serviceView);
  const playerLeft = useRef(false);
  useEffect(() => {
    if (viewOn) {
      playerLeft.current = false;
      return;
    }
    const state = useApp.getState().engine?.state;
    const j = state ? missionJob(state) : undefined;
    const van = j?.vehicleId ? state?.vehicles[j.vehicleId] : undefined;
    if (cueMode.current && van?.status === 'onsite') playerLeft.current = true;
  }, [viewOn]);

  useEffect(() => {
    if (!ready || !job || status === last.current) return;
    const resumed = last.current === null;
    last.current = status;
    const app = useApp.getState();
    const lotId = ROOFTOP_RESCUE.lotId;
    // Only watching: the panel folds away, and on a small screen closes, so the technician has the view.
    const clearView = () => {
      if (smallScreen()) app.select(null);
      else app.setInspectorCompact(true);
    };
    const watch = (mode: ServiceCameraMode) => {
      const view = useApp.getState().serviceView;
      // The player left the service camera, or chose another shot: leave it to them.
      if (cueMode.current && (!view || view.mode !== cueMode.current)) return;
      cueMode.current = mode;
      useApp.getState().setServiceView({ jobId: job.id, lotId, mode });
    };
    switch (status) {
      case 'lead': {
        app.camera(missionEstablishingShot());
        const started = performance.now();
        const timer = setTimeout(() => {
          const now = useApp.getState();
          const van = now.engine?.state.vehicles['veh-1'];
          // Hands off once the player has touched the camera or opened anything.
          if (!van || now.selection || now.panel || cameraInput.lastInput > started) return;
          now.camera(missionFleetShot(van.position, aspectRatio()));
        }, 4800);
        return () => clearTimeout(timer);
      }
      case 'enroute':
        if (job.vehicleId) app.camera({ type: 'follow', vehicleId: job.vehicleId });
        break;
      case 'arriving':
      case 'diagnosing':
        if (smallScreen()) app.select(null);
        else {
          app.select({ kind: 'job', id: job.id });
          app.setInspectorCompact(true);
        }
        // Pulling up: first the van at the site, then the technician once he is out and working. (A reload mid-job goes straight to him.)
        if (status === 'arriving' && !resumed) {
          watch('property');
          const speed = useApp.getState().engine?.state.speed || 1;
          const timer = setTimeout(() => watch('work'), ARRIVAL_SHOT_MS / speed);
          return () => clearTimeout(timer);
        }
        watch('work');
        break;
      case 'awaiting-diagnosis':
      case 'quoted':
        // A decision: the panel opens so the player can make it.
        app.select({ kind: 'job', id: job.id });
        app.setInspectorCompact(false);
        break;
      case 'awaiting-authorization':
        clearView();
        break;
      case 'repairing':
        clearView();
        watch('detail');
        break;
      case 'completed':
        watch('work');
        break;
      case 'departing':
        // Unless the player has taken the camera elsewhere, see the van off.
        if (!playerLeft.current && job.vehicleId) {
          app.setServiceView(null);
          useApp.getState().camera({ type: 'follow', vehicleId: job.vehicleId });
        }
        break;
    }
  }, [ready, job?.id, status]);
}

function SecondaryButton({ label, testId, onClick }: { label: string; testId: string; onClick: () => void }) {
  return (
    <button className="btn small" onClick={onClick} data-testid={testId}>
      {label}
    </button>
  );
}

/** Mission 01's objective card and, at the end, its summary. Every line reads the real job. */
export function MissionCoach() {
  useMissionCues();
  const stage = useGame((s) => missionStage(s));
  const summary = useGame((s) => (s.mission?.status === 'completed' && !s.mission.acknowledged ? s.mission.summary : undefined));
  if (summary) return <MissionSummaryCard summary={summary} />;
  if (!stage || stage === 8) return null;
  return <ObjectiveCard stage={stage} />;
}

/** The same breakpoint as the compact (phone) layout in styles.css. */
function smallScreen(): boolean {
  return window.matchMedia?.('(max-width: 900px), (max-height: 560px)').matches ?? false;
}

/** On site with nothing to decide: the player is here to watch the technician, so a small screen keeps the card out of the way. */
const WATCHING = new Set(['arriving', 'diagnosing', 'awaiting-authorization', 'repairing', 'completed']);

function ObjectiveCard({ stage }: { stage: MissionStage }) {
  // The player's own choice for this phase; until they make one, the phase and the screen decide.
  const [choice, setChoice] = useState<{ status: string; minimized: boolean } | null>(null);
  const dispatch = useApp((s) => s.dispatch);
  const select = useApp((s) => s.select);
  const camera = useApp((s) => s.camera);
  const selection = useApp((s) => s.selection);
  const compact = useApp((s) => s.inspectorCompact);
  const serviceView = useApp((s) => s.serviceView);
  const panel = useApp((s) => s.panel);
  const info = useGame((s) => {
    const job = missionJob(s)!;
    const customer = s.customers[job.customerId];
    const tech = job.technicianId ? s.employees[job.technicianId] : undefined;
    const vehicle = job.vehicleId ? s.vehicles[job.vehicleId] : undefined;
    const workerStage = (job.technicianId && window.__egoWorkerStage?.[job.technicianId]) || '';
    const short = workerStage.replace('roof:', '');
    return { job, customer, techName: tech?.name.split(' ')[0] ?? 'Your technician', vehicle, step: (job.status === 'completed' ? PACK_UP_STEPS : CLIMB_STEPS)[short] };
  });
  const { job, customer, techName, vehicle, step } = info;
  const minimized = choice?.status === job.status ? choice.minimized : WATCHING.has(job.status) && smallScreen();
  const open = selection?.kind === 'job' && selection.id === job.id;
  const panelShows = open && !compact && !panel;
  const fault = faultById(job.faultId);
  const openCall = () => {
    select({ kind: 'job', id: job.id });
    useApp.getState().setInspectorCompact(false);
  };
  const tap = deviceProfile().touch ? 'Tap' : 'Press';

  let body: React.ReactNode = null;
  let action: React.ReactNode = null;
  const departing = job.status === 'completed' && vehicle?.status !== 'onsite';
  switch (job.status) {
    case 'lead':
      body = panelShows ? (
        <>Read the complaint, then {tap.toLowerCase()} <b>Accept call</b>.</>
      ) : (
        <><b>{customer.name}</b> at Mesquite Plaza: the rooftop unit is running, but the office isn’t cooling. A commercial account like this is good business, if you can get up there.</>
      );
      if (!panelShows) action = <button className="btn primary small" onClick={() => { openCall(); camera(missionEstablishingShot(1.6)); }} data-testid="mission-open-call">Open the service call</button>;
      break;
    case 'accepted':
      body = panelShows ? (
        <>{vehicle?.nickname ?? 'Unit 1'} carries the 24 ft ladder this roof needs. Check the crew, then {tap.toLowerCase()} <b>Dispatch</b>.</>
      ) : (
        <>Send your technician and a van with a ladder rack.</>
      );
      if (!panelShows) action = <button className="btn primary small" onClick={openCall} data-testid="mission-open-call">Open dispatch</button>;
      break;
    case 'enroute':
      body = <>{techName} is driving to Mesquite Plaza. Follow the van, look around, or change the game speed at the top.</>;
      action = (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {vehicle && <SecondaryButton label={`Follow ${vehicle.nickname}`} testId="mission-follow" onClick={() => camera({ type: 'follow', vehicleId: vehicle.id })} />}
          <SecondaryButton label="View property" testId="mission-property" onClick={() => camera(missionEstablishingShot(1.6))} />
        </div>
      );
      break;
    case 'arriving':
      body = <>{step ?? `${techName} is getting the ladder`}. <b>Watch work</b> stays on the technician; <b>Property</b> shows the whole site.</>;
      break;
    case 'diagnosing':
      body = <>{step === CLIMB_STEPS.work || !step ? `${techName} is measuring at the unit` : step}. Try <b>Detail</b> for a close look at the hands and tools.</>;
      break;
    case 'awaiting-diagnosis':
      body = panelShows ? (
        <>{techName}’s real readings. A packed coil plus high head pressure means the unit can’t shed heat. One misread can mislead, so cross-check.</>
      ) : (
        <>The findings are in. Open the panel to review them.</>
      );
      if (!panelShows) action = <button className="btn primary small" onClick={openCall} data-testid="mission-open-call">Review the findings</button>;
      break;
    case 'quoted': {
      const limit = job.authorization?.limit;
      body = panelShows ? (
        <>Book price is <Money value={fault.repairPrice} />{limit ? <>, and {customer.name} has approved up to <Money value={limit} /></> : null}. A higher price is more margin. Choose a repair: replacing a rooftop unit takes a crane.</>
      ) : (
        <>Your quote is ready to prepare.</>
      );
      if (!panelShows) action = <button className="btn primary small" onClick={openCall} data-testid="mission-open-call">Prepare the quote</button>;
      break;
    }
    case 'awaiting-authorization':
      body = <>{customer.name}’s practice manager is reviewing the quote. No work starts until it’s approved.</>;
      break;
    case 'repairing':
      body = <>Approved. {techName} is working on the unit. <b>Detail</b> shows the hands and tools.</>;
      break;
    case 'completed':
      body = departing ? <>Ladder secured. {techName} is heading back to HQ.</> : <>{step ?? 'Packing up'}. The van stays until the ladder is back on the rack.</>;
      break;
  }
  if (!serviceView && !action && !departing && stage >= 4 && stage <= 7) {
    action = (
      <SecondaryButton
        label="Watch technician"
        testId="mission-watch"
        onClick={() => {
          useApp.getState().setInspectorCompact(true);
          useApp.getState().setServiceView({ jobId: job.id, lotId: ROOFTOP_RESCUE.lotId, mode: 'work' });
        }}
      />
    );
  }

  return (
    <section className={`glass mission-card${minimized ? ' minimized' : ''}${serviceView ? ' with-bar' : ''}`} data-testid="mission-card" data-stage={stage} aria-live="polite">
      <div className="mission-head">
        <span className="mission-eyebrow">Mission 01 · {ROOFTOP_RESCUE.title}</span>
        <button className="close" onClick={() => setChoice({ status: job.status, minimized: !minimized })} aria-label={minimized ? 'Expand objective' : 'Minimize objective'} aria-pressed={minimized} data-testid="mission-minimize">
          <span style={{ display: 'inline-block', transform: minimized ? 'rotate(180deg)' : 'none', fontSize: 15, lineHeight: 1 }}>▾</span>
        </button>
      </div>
      <div className="mission-progress" role="img" aria-label={`Objective ${stage} of ${MISSION_OBJECTIVE_COUNT}`}>
        {Array.from({ length: MISSION_OBJECTIVE_COUNT }, (_, i) => (
          <i key={i} className={i + 1 < stage ? 'done' : i + 1 === stage ? 'now' : ''} />
        ))}
      </div>
      <div className="mission-title" data-testid="mission-objective">
        <span className="mission-num">{stage}</span>
        {OBJECTIVE_NAMES[stage]}
      </div>
      {minimized && (departing || step) && <div className="mission-step" data-testid="mission-step">{departing ? 'Ladder secured. Heading back to HQ' : step}</div>}
      {!minimized && (
        <>
          <div className="mission-body" data-testid="mission-body">{body}</div>
          <div className="mission-actions">
            {action}
            <button className="mission-skip" onClick={() => dispatch({ type: 'mission-skip' })} data-testid="mission-skip" title="Turn off the guide. The call stays open as a normal job.">
              Skip guide
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`mission-row${strong ? ' strong' : ''}`}>
      <span>{label}</span>
      <b>{children}</b>
    </div>
  );
}

function MissionSummaryCard({ summary: s }: { summary: MissionSummary }) {
  const dispatch = useApp((st) => st.dispatch);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  const reputation = s.reputationBefore.toFixed(2) === s.reputationAfter.toFixed(2) ? `${s.reputationAfter.toFixed(2)} (no change)` : `${s.reputationBefore.toFixed(2)} → ${s.reputationAfter.toFixed(2)}`;
  return (
    <div className="mission-summary-wrap" data-testid="mission-summary">
      <section className="glass mission-summary" role="dialog" aria-label="Mission 01 complete">
        <span className="mission-eyebrow">Mission 01 complete</span>
        <h2>Rooftop Rescue</h2>
        <p className="muted">{s.technicianName} found a {s.faultName.toLowerCase()} and the plaza is cooling again.</p>
        <div className="mission-figures">
          <div className="mission-rows" data-testid="mission-figures">
            <Row label="Diagnostic fee"><Money value={s.diagnosticFee} /></Row>
            <Row label="Repair"><Money value={s.repairRevenue} /></Row>
            <Row label="Service revenue" strong><span data-testid="mission-revenue"><Money value={s.revenue} /></span></Row>
            <Row label="Parts cost"><span data-testid="mission-parts"><Money value={-s.partsCost} /></span></Row>
            {s.laborCost > 0 && <Row label="Labor cost"><Money value={-s.laborCost} /></Row>}
            <Row label="Net job contribution" strong><span data-testid="mission-net"><Money value={s.netContribution} /></span></Row>
          </div>
          <div className="mission-rows">
            <Row label="Customer trust">{s.trustBefore} → {s.trustAfter}</Row>
            <Row label="Company reputation">{reputation}</Row>
            {s.reviewStars !== undefined && <Row label="Customer review"><span className="stars">{'★'.repeat(Math.round(s.reviewStars))}</span></Row>}
            <Row label={`${s.technicianName} experience`}>+{s.xpGained} XP{s.levelAfter > s.levelBefore ? ` · Level ${s.levelAfter}` : ''}</Row>
          </div>
        </div>
        <p className="muted mission-next" style={{ fontSize: 12.5 }}>Your van is heading back to HQ, and new calls will start coming in. The company is yours to run.</p>
        <button ref={button} className="btn primary block" onClick={() => dispatch({ type: 'mission-ack' })} data-testid="mission-continue">
          Start running the business
        </button>
      </section>
    </div>
  );
}
