import { useMemo, useState } from 'react';
import { useApp, useGame } from '@/app/store';
import type { Job } from '@/game/simulation/types';
import { EQUIPMENT_TIERS, faultById } from '@/game/jobs/faults';
import { absoluteMinutes } from '@/game/simulation/time';
import { employeeAvailable, replacementAvailable, vehicleAvailable } from '@/game/jobs/workflow';
import { VEHICLE_SPECS } from '@/game/fleet/vehicleCatalog';
import { etaMinutes } from '@/game/fleet/fleet';
import { Bar, Money, Section, minutesLabel } from '../components/common';
import { ROLE_LABELS } from '@/game/employees/roles';

/** The interactive heart of a service call: accept → dispatch → diagnose → quote → complete. */
export function JobFlow({ jobId }: { jobId: string }) {
  const job = useGame((s) => s.jobs[jobId]);
  if (!job) return null;
  switch (job.status) {
    case 'lead':
      return <LeadStep job={job} />;
    case 'accepted':
      return job.kind === 'replacement' ? <InstallDispatchStep job={job} /> : <DispatchStep job={job} />;
    case 'enroute':
      return <EnrouteStep job={job} />;
    case 'arriving':
    case 'diagnosing':
      return <PhaseStep job={job} title={job.status === 'arriving' ? 'Technician walking to the equipment' : 'Diagnostic in progress'} body="Measuring: static pressure, capacitance, amperage, refrigerant pressures." />;
    case 'awaiting-diagnosis':
      return <DiagnosisStep job={job} />;
    case 'quoted':
      return <QuoteStep job={job} />;
    case 'awaiting-authorization':
      return <PhaseStep job={job} title="Waiting for warranty authorization" body="The warranty company reviews the findings before approving the work." />;
    case 'repairing':
      return <PhaseStep job={job} title="Repair in progress" body={`Replacing: ${job.chosenDiagnosis ? faultById(job.chosenDiagnosis).name : ''}`} />;
    case 'installing':
      return <PhaseStep job={job} title="Installation in progress" body="Recovering refrigerant, setting the new condenser, brazing, pressure test, commissioning." />;
    default:
      return <CompletedStep job={job} />;
  }
}

function LeadStep({ job }: { job: Job }) {
  const dispatch = useApp((s) => s.dispatch);
  const now = useGame((s) => absoluteMinutes(s.clock));
  const remaining = Math.max(0, job.expiresAt - now);
  return (
    <Section title={job.kind === 'callback' ? 'Callback request' : 'Incoming service call'}>
      <div className="card">
        <div style={{ fontStyle: 'italic' }}>“{job.complaint}”</div>
        <div className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>
          Lead expires in <b style={{ color: remaining < 60 ? 'var(--amber)' : undefined }}>{minutesLabel(remaining)}</b>
        </div>
      </div>
      <div className="grid2">
        <button className="btn primary" onClick={() => dispatch({ type: 'accept-lead', jobId: job.id })} data-testid="accept-lead">
          Accept call
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'decline-lead', jobId: job.id })}>
          Decline
        </button>
      </div>
    </Section>
  );
}

function DispatchStep({ job }: { job: Job }) {
  const dispatch = useApp((s) => s.dispatch);
  const techs = useGame((s) => Object.values(s.employees).filter((e) => e.role === 'technician'));
  const vehicles = useGame((s) => Object.values(s.vehicles));
  const availableTechs = techs.filter(employeeAvailable);
  const availableVehicles = vehicles.filter(vehicleAvailable);
  const [techId, setTechId] = useState(availableTechs[0]?.id ?? '');
  const [vehicleId, setVehicleId] = useState(availableVehicles[0]?.id ?? '');
  const tech = availableTechs.find((t) => t.id === techId) ?? availableTechs[0];
  const vehicle = availableVehicles.find((v) => v.id === vehicleId) ?? availableVehicles[0];
  return (
    <Section title="Dispatch">
      <div className="card" style={{ fontStyle: 'italic' }}>“{job.complaint}”</div>
      <label className="col" style={{ gap: 4 }}>
        <span className="muted" style={{ fontSize: 12 }}>Technician</span>
        <select className="select" value={tech?.id ?? ''} onChange={(e) => setTechId(e.target.value)} data-testid="dispatch-tech">
          {availableTechs.length === 0 && <option value="">No technician available</option>}
          {availableTechs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · Lv {t.level} · Diag {t.attributes.diagnosticAccuracy} · Fatigue {Math.round(t.fatigue)}
            </option>
          ))}
        </select>
      </label>
      <label className="col" style={{ gap: 4 }}>
        <span className="muted" style={{ fontSize: 12 }}>Vehicle</span>
        <select className="select" value={vehicle?.id ?? ''} onChange={(e) => setVehicleId(e.target.value)} data-testid="dispatch-vehicle">
          {availableVehicles.length === 0 && <option value="">No vehicle at headquarters</option>}
          {availableVehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nickname} · {VEHICLE_SPECS[v.classId].name}
            </option>
          ))}
        </select>
      </label>
      {techs.some((t) => !employeeAvailable(t)) && <div className="muted" style={{ fontSize: 12 }}>{techs.filter((t) => !employeeAvailable(t)).map((t) => `${t.name}: ${t.status}`).join(' · ')}</div>}
      <button className="btn primary block" disabled={!tech || !vehicle} onClick={() => tech && vehicle && dispatch({ type: 'dispatch', jobId: job.id, technicianId: tech.id, vehicleId: vehicle.id })} data-testid="dispatch-go">
        Dispatch {vehicle?.nickname ?? ''}
      </button>
    </Section>
  );
}

function InstallDispatchStep({ job }: { job: Job }) {
  const dispatch = useApp((s) => s.dispatch);
  const crewPool = useGame((s) => Object.values(s.employees).filter((e) => (e.role === 'installer' || e.role === 'technician') && employeeAvailable(e)));
  const vehicles = useGame((s) => Object.values(s.vehicles).filter((v) => VEHICLE_SPECS[v.classId].canCarryReplacement && vehicleAvailable(v)));
  const cash = useGame((s) => s.finance.cash);
  const [crew, setCrew] = useState<string[]>(() => crewPool.filter((e) => e.role === 'installer').slice(0, 2).map((e) => e.id));
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const tier = EQUIPMENT_TIERS.find((t) => t.id === job.equipmentTierId) ?? EQUIPMENT_TIERS[0];
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicles[0];
  const seats = vehicle ? VEHICLE_SPECS[vehicle.classId].seats : 0;
  const toggle = (id: string) => setCrew((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < seats ? [...c, id] : c));
  const hasInstaller = crew.some((id) => crewPool.find((e) => e.id === id)?.role === 'installer');
  return (
    <Section title="Schedule installation">
      <div className="card">
        <b>{tier.name}</b>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{tier.description}</div>
        <div className="row between" style={{ marginTop: 8, fontSize: 13 }}>
          <span>Equipment cost <Money value={tier.cost} /></span>
          <span>Sale <Money value={job.financials.quoteAmount} /></span>
        </div>
        {cash < tier.cost && <div style={{ color: 'var(--amber)', fontSize: 12.5, marginTop: 6 }}>Not enough cash to purchase the equipment yet.</div>}
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>Crew ({crew.length}/{seats || '–'} seats) — at least one installer</span>
        {crewPool.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No installers or technicians available. Hire an installer from the Team panel.</div>}
        {crewPool.map((e) => (
          <button key={e.id} className={`option ${crew.includes(e.id) ? 'selected' : ''}`} onClick={() => toggle(e.id)}>
            <span>
              {e.name}
              <small>{ROLE_LABELS[e.role]} · Expertise {e.attributes.technicalExpertise} · Detail {e.attributes.attentionToDetail}</small>
            </span>
            <span className="tag">{crew.includes(e.id) ? 'On crew' : 'Add'}</span>
          </button>
        ))}
      </div>
      <label className="col" style={{ gap: 4 }}>
        <span className="muted" style={{ fontSize: 12 }}>Vehicle (must carry a full system)</span>
        <select className="select" value={vehicle?.id ?? ''} onChange={(e) => setVehicleId(e.target.value)}>
          {vehicles.length === 0 && <option value="">No full-size van or box truck available</option>}
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nickname} · {VEHICLE_SPECS[v.classId].name} · {VEHICLE_SPECS[v.classId].seats} seats
            </option>
          ))}
        </select>
      </label>
      <button className="btn primary block" disabled={!vehicle || crew.length === 0 || !hasInstaller || cash < tier.cost} onClick={() => vehicle && dispatch({ type: 'dispatch-install', jobId: job.id, crewIds: crew, vehicleId: vehicle.id })}>
        Dispatch install crew
      </button>
    </Section>
  );
}

function EnrouteStep({ job }: { job: Job }) {
  const vehicle = useGame((s) => (job.vehicleId ? s.vehicles[job.vehicleId] : undefined));
  const tech = useGame((s) => (job.technicianId ? s.employees[job.technicianId] : undefined));
  const camera = useApp((s) => s.camera);
  if (!vehicle) return null;
  const eta = etaMinutes(vehicle);
  const progress = vehicle.route ? vehicle.route.progress / vehicle.route.totalLength : 1;
  return (
    <Section title="En route">
      <div className="card col" style={{ gap: 8 }}>
        <div className="row between">
          <b>{vehicle.nickname}</b>
          <span className="tag teal">ETA {minutesLabel(eta)}</span>
        </div>
        <Bar value={progress * 100} />
        <div className="muted" style={{ fontSize: 12.5 }}>
          {tech?.name} driving · {vehicle.route ? `${Math.round(vehicle.route.totalLength - vehicle.route.progress)} m remaining` : ''}
        </div>
      </div>
      <button className="btn block" onClick={() => camera({ type: 'follow', vehicleId: vehicle.id })} data-testid="follow-vehicle">
        Follow {vehicle.nickname}
      </button>
    </Section>
  );
}

function PhaseStep({ job, title, body }: { job: Job; title: string; body: string }) {
  const progress = job.phaseTotal > 0 ? 1 - job.phaseRemaining / job.phaseTotal : 0;
  return (
    <Section title={title}>
      <div className="card col" style={{ gap: 8 }}>
        <Bar value={progress * 100} tone={job.status === 'awaiting-authorization' ? 'amber' : undefined} />
        <div className="row between muted" style={{ fontSize: 12.5 }}>
          <span>{body}</span>
          <span className="mono">{minutesLabel(Math.max(0, job.phaseRemaining))} left</span>
        </div>
      </div>
    </Section>
  );
}

function DiagnosisStep({ job }: { job: Job }) {
  const dispatch = useApp((s) => s.dispatch);
  const [choice, setChoice] = useState<string | null>(null);
  return (
    <>
      <Section title="Findings">
        <div className="evidence" data-testid="evidence">
          {job.evidence.map((ev) => (
            <div key={ev.label} className="evidence-item">
              <span className="label">{ev.label}</span>
              <span>{ev.value}</span>
            </div>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Readings reflect the technician’s skill. Cross-check them: one misread can point at the wrong part.</div>
      </Section>
      <Section title="Diagnosis">
        <div className="col" style={{ gap: 6 }}>
          {job.diagnosisOptions.map((id) => {
            const f = faultById(id);
            return (
              <button key={id} className={`option ${choice === id ? 'selected' : ''}`} onClick={() => setChoice(id)} data-testid={`diagnosis-${id}`}>
                <span>
                  {f.name}
                  <small>Repair <Money value={f.repairPrice} /> · parts <Money value={f.partsCost} /> · {f.laborMinutes} min</small>
                </span>
              </button>
            );
          })}
        </div>
        <button className="btn primary block" disabled={!choice} onClick={() => choice && dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: choice })} data-testid="confirm-diagnosis">
          Confirm diagnosis
        </button>
      </Section>
    </>
  );
}

function QuoteStep({ job }: { job: Job }) {
  const dispatch = useApp((s) => s.dispatch);
  const customer = useGame((s) => s.customers[job.customerId]);
  const replacement = useGame((s) => replacementAvailable(s));
  const [mode, setMode] = useState<'repair' | 'replace'>('repair');
  const [priceAdjust, setPriceAdjust] = useState(1);
  const [tierId, setTierId] = useState(EQUIPMENT_TIERS[0].id);
  const [financed, setFinanced] = useState(true);
  const fault = faultById(job.chosenDiagnosis!);
  const price = Math.round(fault.repairPrice * priceAdjust);
  const margin = price - fault.partsCost;
  const tier = EQUIPMENT_TIERS.find((t) => t.id === tierId)!;
  const replaceSensible = useMemo(() => customer.equipment.ageYears >= fault.replacementAgeYears || customer.equipment.ageYears >= 14, [customer, fault]);
  const isWarranty = customer.channel === 'warranty';
  return (
    <Section title="Recommendation">
      <div className="card" style={{ fontSize: 13 }}>
        Diagnosis: <b>{fault.name}</b>
        <div className="muted" style={{ marginTop: 4, fontSize: 12.5 }}>
          Equipment: {customer.equipment.brand} {customer.equipment.tonnage}-ton, {customer.equipment.ageYears} yrs, {customer.equipment.refrigerant}, condition {customer.equipment.condition}%
          {replaceSensible && <span className="tag amber" style={{ marginLeft: 8 }}>Replacement candidate</span>}
        </div>
      </div>
      <div className="grid2">
        <button className={`option ${mode === 'repair' ? 'selected' : ''}`} onClick={() => setMode('repair')} data-testid="quote-repair">
          <span>Repair<small>Fix the diagnosed part</small></span>
        </button>
        <button className={`option ${mode === 'replace' ? 'selected' : ''}`} onClick={() => setMode('replace')} data-testid="quote-replace">
          <span>Replace system<small>{replacement.ok ? 'Sell a new system' : 'Needs installer + truck'}</small></span>
        </button>
      </div>
      {mode === 'repair' ? (
        <div className="card col" style={{ gap: 8 }}>
          <div className="row between">
            <span className="muted">Repair price</span>
            <b><Money value={isWarranty ? Math.round(price * 0.65) : price} /></b>
          </div>
          {!isWarranty && (
            <>
              <input className="range" type="range" min={0.8} max={1.3} step={0.05} value={priceAdjust} onChange={(e) => setPriceAdjust(parseFloat(e.target.value))} />
              <div className="row between muted" style={{ fontSize: 12 }}>
                <span>{Math.round(priceAdjust * 100)}% of book price</span>
                <span>Gross margin <Money value={margin} /> ({Math.round((margin / price) * 100)}%)</span>
              </div>
            </>
          )}
          {isWarranty && <div className="muted" style={{ fontSize: 12 }}>{customer.warrantyCompany} pays 65% of book rate, net 35 days. Authorization required.</div>}
        </div>
      ) : (
        <div className="card col" style={{ gap: 8 }}>
          {!replacement.ok && <div style={{ color: 'var(--amber)', fontSize: 12.5 }}>{replacement.reason}</div>}
          {EQUIPMENT_TIERS.map((t) => (
            <button key={t.id} className={`option ${tierId === t.id ? 'selected' : ''}`} onClick={() => setTierId(t.id)}>
              <span>
                {t.name}
                <small>{t.description}</small>
              </span>
              <span style={{ textAlign: 'right' }}>
                <Money value={t.price} />
                <small style={{ display: 'block', color: 'var(--muted)' }}>cost <Money value={t.cost} /></small>
              </span>
            </button>
          ))}
          <label className="row" style={{ fontSize: 13 }}>
            <input type="checkbox" checked={financed} onChange={(e) => setFinanced(e.target.checked)} /> Offer financing (improves close rate)
          </label>
          <div className="muted" style={{ fontSize: 12 }}>Gross profit <Money value={tier.price - tier.cost} /> before labor. Older systems and financing raise acceptance.</div>
        </div>
      )}
      <button
        className="btn primary block"
        disabled={mode === 'replace' && !replacement.ok}
        onClick={() => dispatch({ type: 'submit-quote', jobId: job.id, quote: mode === 'repair' ? { recommendation: 'repair', priceAdjust } : { recommendation: 'replace', equipmentTierId: tierId, financed } })}
        data-testid="present-quote"
      >
        Present to {isWarranty ? customer.warrantyCompany : customer.name}
      </button>
    </Section>
  );
}

function CompletedStep({ job }: { job: Job }) {
  const f = job.chosenDiagnosis ? faultById(job.chosenDiagnosis) : undefined;
  const truth = faultById(job.faultId);
  return (
    <Section title={job.status === 'completed' ? 'Job complete' : job.status === 'expired' ? 'Lead expired' : 'Declined'}>
      <div className="card col" style={{ gap: 6, fontSize: 13 }}>
        {job.status === 'completed' && (
          <>
            <div className="row between">
              <span className="muted">Collected</span>
              <b><Money value={job.financials.revenueCollected} /></b>
            </div>
            {job.financials.receivableId && (
              <div className="row between">
                <span className="muted">Billed to warranty</span>
                <b><Money value={job.financials.quoteAmount + job.financials.diagnosticFee} /></b>
              </div>
            )}
            <div className="row between">
              <span className="muted">Parts</span>
              <b><Money value={-job.financials.partsCost} /></b>
            </div>
            {f && (
              <div className="row between">
                <span className="muted">Diagnosis</span>
                <span className={`tag ${job.diagnosisCorrect ? 'green' : 'red'}`}>{job.diagnosisCorrect ? 'Correct' : `Wrong — was ${truth.name}`}</span>
              </div>
            )}
            {job.reviewStars !== undefined && (
              <div className="row between">
                <span className="muted">Review</span>
                <span className="stars">{'★'.repeat(Math.round(job.reviewStars))}</span>
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
