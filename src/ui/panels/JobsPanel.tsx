import { useState } from 'react';
import { useApp, useGame } from '@/app/store';
import { PanelShell, Tabs } from './PanelShell';
import { JobFlow } from './JobFlow';
import { faultById } from '@/game/jobs/faults';
import { lotById } from '@/game/world/cityLayout';
import { serviceSiteCamera } from '@/world/scene/serviceCall';
import { Money } from '../components/common';
import { attentionQueue, waitingOnWarranty } from '@/game/operations/automation';

type Tab = 'attention' | 'open' | 'active' | 'done';
const OPEN = ['lead', 'accepted', 'awaiting-diagnosis', 'quoted'];
const ACTIVE = ['enroute', 'arriving', 'diagnosing', 'awaiting-authorization', 'repairing', 'installing'];

export function JobsPanel() {
  const jobs = useGame((s) => Object.values(s.jobs));
  const customers = useGame((s) => s.customers);
  const queueIds = useGame((s) => attentionQueue(s).map((j) => j.id));
  const waitingIds = useGame((s) => waitingOnWarranty(s).map((j) => j.id));
  const [tab, setTab] = useState<Tab>(queueIds.length ? 'attention' : 'open');
  const [selected, setSelected] = useState<string | null>(null);
  const camera = useApp((s) => s.camera);
  const select = useApp((s) => s.select);
  const open = jobs.filter((j) => OPEN.includes(j.status));
  const active = jobs.filter((j) => ACTIVE.includes(j.status));
  const done = jobs.filter((j) => ['completed', 'declined', 'expired'].includes(j.status)).slice().reverse();
  const queue = queueIds.map((id) => jobs.find((j) => j.id === id)!).filter(Boolean);
  const waiting = waitingIds.map((id) => jobs.find((j) => j.id === id)!).filter(Boolean);
  const list = tab === 'attention' ? [...queue, ...waiting.filter((w) => !queueIds.includes(w.id))] : tab === 'open' ? open : tab === 'active' ? active : done;
  const current = jobs.find((j) => j.id === selected) ?? list[0];
  return (
    <PanelShell title="Jobs" subtitle="Service calls, dispatch board and history" testId="panel-jobs" tabs={<Tabs value={tab} onChange={setTab} items={[{ id: 'attention', label: 'Owner attention', badge: queue.length }, { id: 'open', label: 'Needs action', badge: open.length }, { id: 'active', label: 'In progress', badge: active.length }, { id: 'done', label: 'History' }]} />}>
      <div className="panel-body split">
        <div className="list">
          {list.length === 0 && <div className="card muted" data-testid={tab === 'attention' ? 'attention-empty' : undefined}>{tab === 'attention' ? 'Nothing needs you. Decisions that stay yours (replacements, conflicting readings, warranty denials) appear here.' : 'Nothing here right now.'}{tab === 'open' ? ' New calls arrive during working hours (7 AM – 6 PM).' : ''}</div>}
          {list.map((j) => {
            const c = customers[j.customerId];
            return (
              <div key={j.id} className={`list-item ${current?.id === j.id ? 'selected' : ''}`} onClick={() => setSelected(j.id)} data-testid={`job-row-${j.id}`}>
                <div>
                  <div className="name">{c.name} <span className={`tag ${c.channel === 'direct' ? 'teal' : 'blue'}`} style={{ marginLeft: 6 }}>{c.channel === 'direct' ? 'Direct' : 'Warranty'}</span>{j.kind !== 'service' && <span className="tag amber" style={{ marginLeft: 6 }}>{j.kind}</span>}</div>
                  <div className="sub">{c.address} · {j.status === 'completed' && j.chosenDiagnosis ? faultById(j.chosenDiagnosis).name : j.complaint}</div>
                  {tab === 'attention' && (j.attention && !j.attention.resolved ? <div className="sub attention-text" data-testid={`attention-row-${j.id}`}>{j.attention.blocking ? 'Decide: ' : 'Note: '}{j.attention.text}</div> : <div className="sub">Waiting on the warranty company's authorization. Nothing to do.</div>)}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {j.auto && <span className="tag teal" style={{ marginRight: 4 }}>Auto</span>}
                  <span className="tag">{j.status.replace(/-/g, ' ')}</span>
                  {j.status === 'completed' && <div style={{ marginTop: 4 }}><Money value={j.financials.revenueCollected + (j.financials.receivableId ? j.financials.quoteAmount + j.financials.diagnosticFee : 0)} /></div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="col">
          {current ? (
            <>
              <div className="row between">
                <div>
                  <h3>{customers[current.customerId].name}</h3>
                  <div className="muted" style={{ fontSize: 12.5 }}>{customers[current.customerId].address}</div>
                </div>
                <button
                  className="btn small"
                  data-testid="job-show-on-map"
                  onClick={() => {
                    const lot = lotById(customers[current.customerId].lotId)!;
                    select({ kind: 'job', id: current.id });
                    useApp.getState().openPanel(null);
                    camera(serviceSiteCamera(lot));
                  }}
                >
                  Show on map
                </button>
              </div>
              <JobFlow jobId={current.id} />
            </>
          ) : (
            <div className="card muted">Select a job to see details.</div>
          )}
        </div>
      </div>
    </PanelShell>
  );
}
