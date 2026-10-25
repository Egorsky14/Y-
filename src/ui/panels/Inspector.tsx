import { useApp, useGame } from '@/app/store';
import { lotById, COMPETITOR_LOT, WAREHOUSE_LOT } from '@/game/world/cityLayout';
import { VEHICLE_SPECS, upgradeById } from '@/game/fleet/vehicleCatalog';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '@/game/employees/attributes';
import { ROLE_LABELS, xpToNextLevel } from '@/game/employees/roles';
import { etaMinutes, resaleValue, effectiveToolCapacity, effectiveCargo } from '@/game/fleet/fleet';
import { HQ_UPGRADES } from '@/game/progression/hqUpgrades';
import { Bar, Icon, KV, Money, Section, Stars, initials, minutesLabel, roleAvatarClass } from '../components/common';
import { JobFlow } from './JobFlow';
import { faultById } from '@/game/jobs/faults';

export function Inspector() {
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  if (!selection) return null;
  return (
    <aside className="glass inspector" data-testid="inspector">
      {selection.kind === 'lot' && <LotInspector lotId={selection.id} onClose={() => select(null)} />}
      {selection.kind === 'job' && <JobInspector jobId={selection.id} onClose={() => select(null)} />}
      {selection.kind === 'vehicle' && <VehicleInspector vehicleId={selection.id} onClose={() => select(null)} />}
      {selection.kind === 'employee' && <EmployeeInspector employeeId={selection.id} onClose={() => select(null)} />}
    </aside>
  );
}

function Head({ title, subtitle, onClose, tag }: { title: string; subtitle?: string; onClose: () => void; tag?: React.ReactNode }) {
  return (
    <div className="inspector-head">
      <div>
        <div className="title">{title}</div>
        {subtitle && <div className="subtitle">{subtitle}</div>}
        {tag && <div style={{ marginTop: 6 }}>{tag}</div>}
      </div>
      <button className="close" onClick={onClose} aria-label="Close">
        <Icon name="close" />
      </button>
    </div>
  );
}

function JobInspector({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const lotId = useGame((s) => (s.jobs[jobId] ? s.customers[s.jobs[jobId].customerId].lotId : undefined));
  if (!lotId) return <Head title="Job not found" onClose={onClose} />;
  return <LotInspector lotId={lotId} onClose={onClose} preferredJobId={jobId} />;
}

function LotInspector({ lotId, onClose, preferredJobId }: { lotId: string; onClose: () => void; preferredJobId?: string }) {
  const lot = lotById(lotId);
  if (!lot) return <Head title="Unknown" onClose={onClose} />;
  if (lot.kind === 'hq') return <HqInspector onClose={onClose} />;
  if (lot.kind === 'warehouse' || lot.kind === 'competitor') return <CommercialInspector lotId={lotId} onClose={onClose} />;
  if (lot.kind === 'park') return <Head title="Mesa Vista Park" subtitle="Decorative · Summerlin Ridge" onClose={onClose} />;
  return <CustomerInspector lotId={lotId} onClose={onClose} preferredJobId={preferredJobId} />;
}

function CustomerInspector({ lotId, onClose, preferredJobId }: { lotId: string; onClose: () => void; preferredJobId?: string }) {
  const customer = useGame((s) => Object.values(s.customers).find((c) => c.lotId === lotId));
  const jobs = useGame((s) => (customer ? Object.values(s.jobs).filter((j) => j.customerId === customer.id) : []));
  const camera = useApp((s) => s.camera);
  const lot = lotById(lotId)!;
  if (!customer) return <Head title="Vacant lot" onClose={onClose} />;
  const active = jobs.find((j) => j.id === preferredJobId && !['completed', 'declined', 'expired', 'cancelled'].includes(j.status)) ?? jobs.find((j) => !['completed', 'declined', 'expired', 'cancelled'].includes(j.status));
  const latest = active ?? jobs.filter((j) => j.id === preferredJobId)[0] ?? jobs[jobs.length - 1];
  const history = jobs.filter((j) => j.status === 'completed').slice().reverse();
  const tech = useApp.getState().engine?.state.employees[active?.technicianId ?? ''];
  return (
    <>
      <Head
        title={customer.name}
        subtitle={`${customer.address} · ${lot.style?.replace('-', ' ')} home`}
        onClose={onClose}
        tag={
          <span className="row" style={{ gap: 6 }}>
            <span className={`tag ${customer.channel === 'direct' ? 'teal' : 'blue'}`}>{customer.channel === 'direct' ? 'Direct customer' : customer.warrantyCompany}</span>
            <span className="tag">Trust {customer.trust}</span>
          </span>
        }
      />
      <div className="inspector-body">
        {latest && <JobFlow jobId={latest.id} />}
        {!latest && (
          <div className="card muted" style={{ fontSize: 13 }}>
            No open service call. Customers call when their equipment fails; reputation and marketing bring more direct calls.
          </div>
        )}
        <Section title="Equipment">
          <KV
            items={[
              ['System', customer.equipment.type === 'split-ac-gas-furnace' ? 'Split AC + gas furnace' : customer.equipment.type === 'heat-pump' ? 'Heat pump' : 'Rooftop package unit'],
              ['Brand / size', `${customer.equipment.brand} · ${customer.equipment.tonnage} ton`],
              ['Age', `${customer.equipment.ageYears} years · ${customer.equipment.seer} SEER`],
              ['Refrigerant', customer.equipment.refrigerant],
              ['Condition', <Bar key="c" value={customer.equipment.condition} tone={customer.equipment.condition < 40 ? 'red' : customer.equipment.condition < 65 ? 'amber' : 'green'} />],
            ]}
          />
        </Section>
        {active && (
          <Section title="Assignment">
            <KV
              items={[
                ['Status', <span key="s" className="tag teal">{active.status.replace(/-/g, ' ')}</span>],
                ['Technician', tech?.name ?? '—'],
                ['Vehicle', active.vehicleId ? useApp.getState().engine?.state.vehicles[active.vehicleId]?.nickname ?? '—' : '—'],
              ]}
            />
          </Section>
        )}
        {latest && (
          <Section title="Job log">
            <div className="log">
              <ul>
                {latest.log.slice(-8).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          </Section>
        )}
        {history.length > 0 && (
          <Section title="Service history">
            <div className="list">
              {history.slice(0, 4).map((j) => (
                <div key={j.id} className="list-item" style={{ cursor: 'default' }}>
                  <div>
                    <div className="name" style={{ fontSize: 13 }}>{j.chosenDiagnosis ? faultById(j.chosenDiagnosis).name : j.complaint}</div>
                    <div className="sub">Day {j.createdDay} · {j.kind}</div>
                  </div>
                  <Money value={j.financials.revenueCollected + (j.financials.receivableId ? j.financials.quoteAmount + j.financials.diagnosticFee : 0)} />
                </div>
              ))}
            </div>
          </Section>
        )}
        <button className="btn small ghost" onClick={() => camera({ type: 'focus', target: lot.center, distance: 55 })}>
          Center camera on property
        </button>
      </div>
    </>
  );
}

function VehicleInspector({ vehicleId, onClose }: { vehicleId: string; onClose: () => void }) {
  const vehicle = useGame((s) => s.vehicles[vehicleId]);
  const job = useGame((s) => (s.vehicles[vehicleId]?.jobId ? s.jobs[s.vehicles[vehicleId].jobId!] : undefined));
  const crew = useGame((s) => {
    const v = s.vehicles[vehicleId];
    return v ? [v.driverId, ...v.passengerIds].filter(Boolean).map((id) => s.employees[id!]).filter(Boolean) : [];
  });
  const customer = useGame((s) => (job ? s.customers[job.customerId] : undefined));
  const camera = useApp((s) => s.camera);
  const openPanel = useApp((s) => s.openPanel);
  const select = useApp((s) => s.select);
  const resale = useGame((s) => (s.vehicles[vehicleId] ? resaleValue(s, s.vehicles[vehicleId]) : 0));
  if (!vehicle) return <Head title="Vehicle sold" onClose={onClose} />;
  const spec = VEHICLE_SPECS[vehicle.classId];
  const moving = vehicle.status === 'enroute' || vehicle.status === 'returning';
  return (
    <>
      <Head title={vehicle.nickname} subtitle={`${spec.name} · ${vehicle.isUsed ? 'Used' : 'New'}`} onClose={onClose} tag={<span className={`tag ${moving ? 'teal' : vehicle.status === 'onsite' ? 'amber' : ''}`}>{vehicle.status}</span>} />
      <div className="inspector-body">
        {moving && (
          <Section title={vehicle.status === 'returning' ? 'Returning to HQ' : 'Assignment'}>
            <div className="card col" style={{ gap: 8 }}>
              {customer && (
                <div className="row between">
                  <span>{customer.name}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{customer.address}</span>
                </div>
              )}
              <Bar value={vehicle.route ? (vehicle.route.progress / vehicle.route.totalLength) * 100 : 0} />
              <div className="row between muted" style={{ fontSize: 12.5 }}>
                <span>Route {vehicle.route ? Math.round(vehicle.route.totalLength) : 0} m · {vehicle.route?.waypoints.length ?? 0} waypoints</span>
                <span className="tag teal">ETA {minutesLabel(etaMinutes(vehicle))}</span>
              </div>
            </div>
            <div className="grid2">
              <button className="btn" onClick={() => camera({ type: 'follow', vehicleId })}>Follow</button>
              {job && <button className="btn" onClick={() => select({ kind: 'job', id: job.id })}>Open job</button>}
            </div>
          </Section>
        )}
        {vehicle.status === 'onsite' && job && (
          <Section title="On site">
            <button className="btn block" onClick={() => select({ kind: 'job', id: job.id })}>Open job at {customer?.address}</button>
          </Section>
        )}
        <Section title="Crew">
          {crew.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Nobody aboard. Assign a technician when dispatching a job.</div> : crew.map((e) => (
            <div key={e.id} className="row between card" style={{ padding: '8px 10px' }}>
              <span>{e.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>{ROLE_LABELS[e.role]}</span>
            </div>
          ))}
        </Section>
        <Section title="Specifications">
          <div className="spec-grid">
            <div><span>Condition</span><b>{Math.round(vehicle.condition)}%</b></div>
            <div><span>Mileage</span><b>{Math.round(vehicle.mileage).toLocaleString()} mi</b></div>
            <div><span>Reliability</span><b>{vehicle.reliability}</b></div>
            <div><span>Cargo</span><b>{effectiveCargo(vehicle)} ft³</b></div>
            <div><span>Seats</span><b>{spec.seats}</b></div>
            <div><span>Tools</span><b>{effectiveToolCapacity(vehicle)} slots</b></div>
            <div><span>Speed</span><b>{spec.speed} m/min</b></div>
            <div><span>Upkeep</span><b><Money value={spec.upkeepPerDay} />/day</b></div>
            <div><span>Resale</span><b><Money value={resale} compact /></b></div>
          </div>
          <div className="chip-row">
            {vehicle.upgrades.map((u) => (
              <span key={u} className="chip active">{upgradeById(u).name}</span>
            ))}
            {vehicle.upgrades.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No upgrades installed.</span>}
          </div>
        </Section>
        <button className="btn block" onClick={() => openPanel('fleet')}>Manage in Fleet</button>
      </div>
    </>
  );
}

function EmployeeInspector({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const e = useGame((s) => s.employees[employeeId]);
  const openPanel = useApp((s) => s.openPanel);
  const select = useApp((s) => s.select);
  if (!e) return <Head title="Employee left" onClose={onClose} />;
  const xp = xpToNextLevel(e.xp);
  return (
    <>
      <Head title={e.name} subtitle={`${ROLE_LABELS[e.role]}${e.isOwner ? ' · Owner' : ''} · Level ${e.level}`} onClose={onClose} tag={<span className={`tag ${e.status === 'idle' ? 'green' : 'teal'}`}>{e.status}</span>} />
      <div className="inspector-body">
        <div className="emp-card">
          <div className={roleAvatarClass(e.role)}>{initials(e.name)}</div>
          <div className="col" style={{ gap: 6 }}>
            <div className="row between" style={{ fontSize: 12.5 }}>
              <span className="muted">XP to level {e.level + 1}</span>
              <span className="mono">{e.xp}/{xp.next}</span>
            </div>
            <Bar value={xp.progress * 100} />
          </div>
          <div style={{ textAlign: 'right', fontSize: 12.5 }}>
            <div><Money value={e.hourlyWage} />/hr</div>
            <div className="muted">{e.jobsCompleted} jobs</div>
          </div>
        </div>
        <div className="grid2">
          <div className="attr">
            <div className="row"><span>Morale</span><b>{Math.round(e.morale)}</b></div>
            <Bar value={e.morale} tone={e.morale < 35 ? 'red' : e.morale < 60 ? 'amber' : 'green'} />
          </div>
          <div className="attr">
            <div className="row"><span>Fatigue</span><b>{Math.round(e.fatigue)}</b></div>
            <Bar value={e.fatigue} tone={e.fatigue > 70 ? 'red' : e.fatigue > 45 ? 'amber' : undefined} />
          </div>
        </div>
        {e.training && (
          <div className="card" style={{ fontSize: 13 }}>
            In training · {e.training.daysRemaining} day{e.training.daysRemaining === 1 ? '' : 's'} remaining
          </div>
        )}
        {e.jobId && (
          <button className="btn block" onClick={() => select({ kind: 'job', id: e.jobId! })}>Open current job</button>
        )}
        <Section title="Attributes">
          <div className="attr-grid" data-testid="attributes">
            {ATTRIBUTE_KEYS.map((k) => (
              <div key={k} className="attr">
                <div className="row"><span>{ATTRIBUTE_LABELS[k]}</span><b data-testid={`attr-${k}`}>{e.attributes[k]}</b></div>
                <Bar value={e.attributes[k]} />
              </div>
            ))}
          </div>
        </Section>
        <Section title="Certifications">
          <div className="chip-row">
            {e.certifications.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>None yet.</span>}
            {e.certifications.map((c) => (
              <span key={c} className="chip active">{c}</span>
            ))}
          </div>
        </Section>
        <button className="btn block" onClick={() => openPanel('employees')}>Train or manage in Team</button>
      </div>
    </>
  );
}

function HqInspector({ onClose }: { onClose: () => void }) {
  const upgrades = useGame((s) => s.company.hqUpgrades);
  const vehicles = useGame((s) => Object.values(s.vehicles).length);
  const employees = useGame((s) => Object.values(s.employees).length);
  const level = useGame((s) => s.company.level);
  const openPanel = useApp((s) => s.openPanel);
  const camera = useApp((s) => s.camera);
  return (
    <>
      <Head title="EGO HVAC Headquarters" subtitle={`2 Palo Verde Way · Company level ${level}`} onClose={onClose} />
      <div className="inspector-body">
        <div className="stat-tiles" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="tile"><div className="label">Vehicles</div><div className="value">{vehicles}</div></div>
          <div className="tile"><div className="label">Staff</div><div className="value">{employees}</div></div>
        </div>
        <Section title="Facilities">
          <div className="chip-row">
            <span className="chip active">Office</span>
            <span className="chip active">Service Bay 1</span>
            {upgrades.map((u) => (
              <span key={u} className="chip active">{HQ_UPGRADES.find((x) => x.id === u)?.name}</span>
            ))}
          </div>
        </Section>
        <div className="grid2">
          <button className="btn primary" onClick={() => openPanel('hq')} data-testid="open-hq-panel">Upgrade HQ</button>
          <button className="btn" onClick={() => camera({ type: 'hq' })}>Center camera</button>
        </div>
      </div>
    </>
  );
}

function CommercialInspector({ lotId, onClose }: { lotId: string; onClose: () => void }) {
  const competitors = useGame((s) => s.competitors);
  const share = useGame((s) => s.company.marketShare);
  const openPanel = useApp((s) => s.openPanel);
  if (lotId === WAREHOUSE_LOT.id) {
    return (
      <>
        <Head title="Mojave HVAC Supply" subtitle="Wholesale distributor · Desert Bloom Ave" onClose={onClose} />
        <div className="inspector-body">
          <div className="card muted" style={{ fontSize: 13 }}>
            Your parts and equipment come from here. The Parts Warehouse HQ upgrade stocks common parts on site and lowers parts cost by 12%.
          </div>
          <button className="btn block" onClick={() => openPanel('hq')}>View HQ upgrades</button>
        </div>
      </>
    );
  }
  const comp = competitors[0];
  return (
    <>
      <Head title={COMPETITOR_LOT.name!} subtitle="Competitor · Red Rock Ln" onClose={onClose} />
      <div className="inspector-body">
        <KV items={[['Reputation', <Stars key="s" value={comp.reputation} />], ['Pricing', `${Math.round(comp.priceLevel * 100)}% of market`], ['Market share', `${Math.round(comp.marketShare * 100)}%`], ['EGO HVAC share', `${Math.round(share * 100)}%`]]} />
        <button className="btn block" onClick={() => openPanel('marketing')}>Compare in Marketing</button>
      </div>
    </>
  );
}
