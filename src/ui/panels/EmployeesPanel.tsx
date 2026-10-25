import { useState } from 'react';
import { useApp, useGame } from '@/app/store';
import { PanelShell, Tabs } from './PanelShell';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '@/game/employees/attributes';
import { ROLE_CORE_ATTRIBUTES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/game/employees/roles';
import { TRAINING_PROGRAMS } from '@/game/employees/training';
import { employeeCapacity } from '@/game/fleet/fleet';
import { Bar, Money, initials, roleAvatarClass } from '../components/common';
import type { Employee } from '@/game/simulation/types';

type Tab = 'team' | 'hire' | 'train';

export function EmployeesPanel() {
  const employees = useGame((s) => Object.values(s.employees));
  const candidates = useGame((s) => s.candidates);
  const capacity = useGame((s) => employeeCapacity(s));
  const cash = useGame((s) => s.finance.cash);
  const dispatch = useApp((s) => s.dispatch);
  const select = useApp((s) => s.select);
  const [tab, setTab] = useState<Tab>('team');
  const [selectedEmp, setSelectedEmp] = useState<string>(employees[0]?.id ?? '');
  const emp = employees.find((e) => e.id === selectedEmp) ?? employees[0];

  return (
    <PanelShell
      title="Team"
      subtitle={`${employees.length} of ${capacity} seats at headquarters`}
      testId="panel-employees"
      tabs={<Tabs value={tab} onChange={setTab} items={[{ id: 'team', label: 'Roster' }, { id: 'hire', label: 'Hiring market', badge: candidates.length }, { id: 'train', label: 'Training academy' }]} />}
    >
      {tab === 'team' && (
        <div className="panel-body split">
          <div className="list">
            {employees.map((e) => (
              <div key={e.id} className={`list-item ${emp?.id === e.id ? 'selected' : ''}`} onClick={() => setSelectedEmp(e.id)} data-testid={`emp-row-${e.id}`}>
                <div className="emp-card" style={{ gridTemplateColumns: '42px 1fr' }}>
                  <div className={roleAvatarClass(e.role)} style={{ width: 42, height: 42, fontSize: 14 }}>{initials(e.name)}</div>
                  <div>
                    <div className="name">{e.name}{e.isOwner && <span className="tag teal" style={{ marginLeft: 6 }}>Owner</span>}</div>
                    <div className="sub">{ROLE_LABELS[e.role]} · Level {e.level} · {e.jobsCompleted} jobs</div>
                  </div>
                </div>
                <span className={`tag ${e.status === 'idle' ? 'green' : e.status === 'training' ? 'amber' : 'teal'}`}>{e.status}</span>
              </div>
            ))}
          </div>
          <div className="col">
            {emp && <EmployeeDetail e={emp} onSelectWorld={() => { select({ kind: 'employee', id: emp.id }); useApp.getState().openPanel(null); }} />}
          </div>
        </div>
      )}
      {tab === 'hire' && (
        <div className="panel-body">
          <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
            Candidates rotate every few days. Onboarding costs one day of wages. Daily payroll is 8 hours × hourly rate. {employees.length >= capacity && <b style={{ color: 'var(--amber)' }}>Headquarters is full — upgrade parking or the dispatch center.</b>}
          </div>
          <div className="grid2">
            {candidates.map((c) => (
              <div key={c.id} className="card col" data-testid={`candidate-${c.id}`}>
                <div className="emp-card">
                  <div className={roleAvatarClass(c.role)}>{initials(c.name)}</div>
                  <div>
                    <div style={{ fontWeight: 800 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{ROLE_LABELS[c.role]} · {c.experienceYears} yrs experience</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800 }}><Money value={c.hourlyWage} />/hr</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>Leaves day {c.availableUntilDay}</div>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>{c.summary}</div>
                <div className="attr-grid">
                  {ROLE_CORE_ATTRIBUTES[c.role].map((k) => (
                    <div key={k} className="attr">
                      <div className="row"><span>{ATTRIBUTE_LABELS[k]}</span><b>{c.attributes[k]}</b></div>
                      <Bar value={c.attributes[k]} />
                    </div>
                  ))}
                </div>
                <button className="btn primary" disabled={employees.length >= capacity || cash < c.hourlyWage * 8} onClick={() => dispatch({ type: 'hire', candidateId: c.id })} data-testid={`hire-${c.id}`}>
                  Hire {c.name.split(' ')[0]} · onboarding <Money value={Math.round(c.hourlyWage * 8)} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'train' && (
        <div className="panel-body split">
          <div className="col">
            <h4>Choose an employee</h4>
            <div className="list">
              {employees.map((e) => (
                <div key={e.id} className={`list-item ${emp?.id === e.id ? 'selected' : ''}`} onClick={() => setSelectedEmp(e.id)}>
                  <div>
                    <div className="name">{e.name}</div>
                    <div className="sub">{ROLE_LABELS[e.role]} · {e.training ? `Training: ${e.training.daysRemaining}d left` : e.status}</div>
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>Learn {e.attributes.learnability}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="col">
            <h4>Programs for {emp?.name}</h4>
            {emp && TRAINING_PROGRAMS.filter((p) => p.roles.includes(emp.role)).map((p) => {
              const held = p.certification && emp.certifications.includes(p.certification);
              return (
                <div key={p.id} className="card col" style={{ gap: 6 }}>
                  <div className="row between">
                    <b>{p.name}</b>
                    <span className="muted" style={{ fontSize: 12.5 }}>{p.days} day{p.days > 1 ? 's' : ''} · <Money value={p.cost} /></span>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{p.description}</div>
                  <div className="chip-row">
                    {Object.entries(p.gains).map(([k, v]) => (
                      <span key={k} className="chip">{ATTRIBUTE_LABELS[k as keyof typeof ATTRIBUTE_LABELS]} +{v}</span>
                    ))}
                    {p.certification && <span className="chip active">Cert: {p.certification}</span>}
                  </div>
                  <button className="btn small primary" disabled={!!held || emp.status !== 'idle' || cash < p.cost} onClick={() => dispatch({ type: 'train', employeeId: emp.id, programId: p.id })} data-testid={`train-${p.id}`}>
                    {held ? 'Certified' : emp.status !== 'idle' ? `Unavailable (${emp.status})` : 'Enroll'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function EmployeeDetail({ e, onSelectWorld }: { e: Employee; onSelectWorld: () => void }) {
  const dispatch = useApp((s) => s.dispatch);
  return (
    <>
      <div className="emp-card">
        <div className={roleAvatarClass(e.role)}>{initials(e.name)}</div>
        <div>
          <h3>{e.name}</h3>
          <div className="muted" style={{ fontSize: 12.5 }}>{ROLE_DESCRIPTIONS[e.role]}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800 }}>{e.isOwner ? 'Owner draw' : <><Money value={e.hourlyWage} />/hr</>}</div>
          <div className="muted" style={{ fontSize: 12 }}>Hired day {e.hiredDay}</div>
        </div>
      </div>
      <div className="grid3">
        <div className="tile"><div className="label">Level</div><div className="value">{e.level}</div></div>
        <div className="tile"><div className="label">Morale</div><div className="value">{Math.round(e.morale)}</div></div>
        <div className="tile"><div className="label">Fatigue</div><div className="value">{Math.round(e.fatigue)}</div></div>
      </div>
      <div className="attr-grid">
        {ATTRIBUTE_KEYS.map((k) => (
          <div key={k} className="attr">
            <div className="row"><span>{ATTRIBUTE_LABELS[k]}</span><b>{e.attributes[k]}</b></div>
            <Bar value={e.attributes[k]} />
          </div>
        ))}
      </div>
      <div className="chip-row">
        {e.certifications.map((c) => <span key={c} className="chip active">{c}</span>)}
        {e.specialization && <span className="chip">Specialty: {e.specialization}</span>}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn small" onClick={onSelectWorld}>Find in world</button>
        {!e.isOwner && <button className="btn small" onClick={() => dispatch({ type: 'give-raise', employeeId: e.id, amount: 1 })}>Raise +$1/hr</button>}
        {!e.isOwner && <button className="btn small danger" onClick={() => dispatch({ type: 'fire', employeeId: e.id })}>Let go</button>}
      </div>
    </>
  );
}
