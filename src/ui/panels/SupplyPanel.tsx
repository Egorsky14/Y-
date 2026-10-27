import { useState } from 'react';
import { useApp, useGame, useGameWith } from '@/app/store';
import { PanelShell, Tabs } from './PanelShell';
import { Bar, Money } from '../components/common';
import { ToolArt } from '../components/ToolArt';
import { CATEGORY_LABELS, TIER_LABELS, TOOLS, toolDef, type ToolCategory, type ToolDef, type ToolId } from '@/game/equipment/catalog';
import { holderLabel, lockedReason, rackCapacity, rackUsed, resalePrice, sameHolder, toolsHeldBy } from '@/game/equipment/inventory';
import { performanceSummary, toolEstimate, toolsOnSite, type PerformanceSummary } from '@/game/equipment/performance';
import { ROLE_LABELS } from '@/game/employees/roles';
import type { Employee, GameState, ToolHolder, ToolItem, Vehicle } from '@/game/simulation/types';
import type { GameAction } from '@/game/simulation/actions';

/**
 * Pro Supply Depot: buy tools, manage the company's equipment and compare loadouts. Every number
 * comes from the equipment module (equipment/performance.ts), never from the interface.
 */

type Tab = 'catalog' | 'inventory' | 'loadouts';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const mins = (v: number) => `${Math.round(v)} min`;

function holderKey(h: ToolHolder): string {
  return h.kind === 'inventory' ? 'inventory' : `${h.kind}:${h.id}`;
}
function parseHolder(key: string): ToolHolder {
  if (key === 'inventory') return { kind: 'inventory' };
  const [kind, id] = key.split(':');
  return kind === 'employee' ? { kind: 'employee', id } : { kind: 'vehicle', id };
}

function fieldStaff(s: GameState): Employee[] {
  return Object.values(s.employees).filter((e) => e.role === 'technician' || e.role === 'installer');
}

/** Destinations a tool can go to (technicians for portable tools, every vehicle, the crib). */
function Destinations({ def }: { def: ToolDef }) {
  const staff = useGame((s) => fieldStaff(s));
  const vehicles = useGame((s) => Object.values(s.vehicles));
  return (
    <>
      <option value="inventory">HQ tool crib</option>
      {def.mount === 'technician' && staff.map((e) => <option key={e.id} value={`employee:${e.id}`}>{e.name} ({ROLE_LABELS[e.role]})</option>)}
      {vehicles.map((v) => <option key={v.id} value={`vehicle:${v.id}`}>{v.nickname} rack</option>)}
    </>
  );
}

export function SupplyPanel() {
  const owned = useGame((s) => Object.keys(s.tools ?? {}).length);
  const inCrib = useGame((s) => toolsHeldBy(s, { kind: 'inventory' }).length);
  const [tab, setTab] = useState<Tab>('catalog');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dispatch = useApp((s) => s.dispatch);
  const run = (action: GameAction, success: string) => {
    const r = dispatch(action, { inline: true });
    setMessage(r.ok ? { ok: true, text: success } : { ok: false, text: r.reason });
    return r.ok;
  };
  return (
    <PanelShell
      title="Pro Supply Depot"
      subtitle={`Mojave HVAC Supply · ${owned} tool${owned === 1 ? '' : 's'} owned`}
      testId="panel-supply"
      tabs={<Tabs value={tab} onChange={setTab} items={[{ id: 'catalog', label: 'Catalog' }, { id: 'inventory', label: 'Inventory', badge: inCrib }, { id: 'loadouts', label: 'Loadouts' }]} />}
    >
      {message && (
        <div className={`supply-message ${message.ok ? 'ok' : 'err'}`} data-testid="supply-message" role="status">
          {message.text}
        </div>
      )}
      {tab === 'catalog' && <Catalog run={run} />}
      {tab === 'inventory' && <Inventory run={run} />}
      {tab === 'loadouts' && <Loadouts />}
    </PanelShell>
  );
}

type Run = (action: GameAction, success: string) => boolean;

function Catalog({ run }: { run: Run }) {
  const cash = useGame((s) => s.finance.cash);
  const staff = useGame((s) => fieldStaff(s));
  const vehicles = useGame((s) => Object.values(s.vehicles));
  const ownedBy = useGame((s) => {
    const m: Record<string, number> = {};
    for (const t of Object.values(s.tools ?? {})) m[t.defId] = (m[t.defId] ?? 0) + 1;
    return m;
  });
  const [category, setCategory] = useState<ToolCategory | 'all'>('all');
  const [techId, setTechId] = useState(staff[0]?.id ?? '');
  const [vanId, setVanId] = useState(vehicles[0]?.id ?? '');
  const [confirm, setConfirm] = useState<{ id: ToolId; to: string } | null>(null);
  const tech = staff.find((e) => e.id === techId) ?? staff[0];
  const van = vehicles.find((v) => v.id === vanId);
  // The loadout the estimate is for: the technician's kit plus the chosen van's rack.
  const current = useGameWith((s) => (tech ? uniqueDefs(toolsOnSite(s, s.employees[tech.id], van ? s.vehicles[van.id] : undefined)) : []), [tech?.id, van?.id]);
  const list = TOOLS.filter((t) => category === 'all' || t.category === category);
  const categories = Object.keys(CATEGORY_LABELS) as ToolCategory[];

  return (
    <div className="panel-body col supply" style={{ gap: 12 }} data-testid="supply-catalog">
      <div className="supply-filters">
        <div className="chip-row" role="tablist" aria-label="Categories">
          <button className={`chip ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')} data-testid="cat-all">All</button>
          {categories.map((c) => (
            <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)} data-testid={`cat-${c}`}>{CATEGORY_LABELS[c]}</button>
          ))}
        </div>
        <label className="supply-estimate">
          <span className="muted">Estimate for</span>
          <select className="select" value={tech?.id ?? ''} onChange={(e) => setTechId(e.target.value)} data-testid="estimate-tech">
            {staff.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select className="select" value={van?.id ?? ''} onChange={(e) => setVanId(e.target.value)} data-testid="estimate-van">
            <option value="">No van</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>with {v.nickname}</option>)}
          </select>
        </label>
      </div>
      <div className="supply-grid">
        {list.map((def) => {
          const est = tech ? toolEstimate(tech.attributes, 0, current, def) : null;
          const asking = confirm?.id === def.id;
          return (
            <article key={def.id} className={`card tool-card tier-${def.tier}`} data-testid={`tool-card-${def.id}`}>
              <div className="tool-card-head">
                <div className="tool-art-wrap"><ToolArt id={def.id} size={60} /></div>
                <div className="col" style={{ gap: 3, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span className={`tag ${def.tier === 'basic' ? '' : def.tier === 'professional' ? 'teal' : 'amber'}`}>{TIER_LABELS[def.tier]}</span>
                    <span className="tag">{CATEGORY_LABELS[def.category]}</span>
                    {ownedBy[def.id] ? <span className="tag green" data-testid={`owned-${def.id}`}>Owned ×{ownedBy[def.id]}</span> : null}
                  </div>
                  <b className="tool-name">{def.name}</b>
                  <span className="tool-price"><Money value={def.price} /></span>
                </div>
              </div>
              <div className="muted tool-desc">{def.description}</div>
              <div className="tool-meta">
                <span>{def.mount === 'vehicle' ? `Van rack · ${def.bulk} space` : 'Technician kit (or van stock)'}</span>
                <span>{def.accounting === 'capital' ? 'Capital asset · depreciates' : 'Expensed tool'}</span>
              </div>
              <div className="tool-help"><b>Helps with:</b> {def.helpsWith}</div>
              {est && (
                <div className="tool-estimate" data-testid={`estimate-${def.id}`}>
                  {est.already ? (
                    <span className="muted">{tech!.name.split(' ')[0]}'s loadout already has one: a second adds nothing.</span>
                  ) : (
                    <>
                      {est.reads.map((r) => (
                        <span key={r.kind}>{r.label}: <b>{pct(r.before)} → {pct(r.after)}</b></span>
                      ))}
                      {est.diagMinutes && est.diagMinutes.after < est.diagMinutes.before - 0.05 && <span>Diagnostic: <b>{mins(est.diagMinutes.before)} → {mins(est.diagMinutes.after)}</b></span>}
                      {est.repairMinutes && est.repairMinutes.after < est.repairMinutes.before - 0.05 && <span>Repairs it helps: <b>{mins(est.repairMinutes.before)} → {mins(est.repairMinutes.after)}</b></span>}
                      {est.workmanship && <span>Refrigerant workmanship: <b>{pct(est.workmanship.before)} → {pct(est.workmanship.after)}</b></span>}
                    </>
                  )}
                  <span className="muted tool-jobs">{est.faults.length === 12 ? 'Every service call' : est.faults.map((f) => f.name).join(' · ')}</span>
                </div>
              )}
              {asking ? (
                <div className="tool-confirm col" style={{ gap: 6 }}>
                  <label className="col" style={{ gap: 4 }}>
                    <span className="muted" style={{ fontSize: 12 }}>Deliver to</span>
                    <select className="select" value={confirm.to} onChange={(e) => setConfirm({ id: def.id, to: e.target.value })} data-testid={`buy-to-${def.id}`}>
                      <Destinations def={def} />
                    </select>
                  </label>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn small primary" disabled={cash < def.price} onClick={() => run({ type: 'buy-tool', toolId: def.id, assignTo: parseHolder(confirm.to) }, `Bought ${def.name} for $${def.price.toLocaleString()}.`) && setConfirm(null)} data-testid="buy-confirm">
                      Confirm <Money value={def.price} />
                    </button>
                    <button className="btn small" onClick={() => setConfirm(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn small primary" disabled={cash < def.price} onClick={() => setConfirm({ id: def.id, to: 'inventory' })} data-testid={`buy-${def.id}`}>
                  {cash < def.price ? 'Not enough cash' : <>Buy · <Money value={def.price} /></>}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function uniqueDefs(items: ToolItem[]): ToolDef[] {
  return [...new Set(items.map((t) => t.defId))].map((id) => toolDef(id));
}

function Inventory({ run }: { run: Run }) {
  const items = useGame((s) => Object.values(s.tools ?? {}).map((t) => ({ t, where: holderLabel(s, t.holder), locked: lockedReason(s, t), resale: resalePrice(s, t) })));
  const [target, setTarget] = useState<Record<string, string>>({});
  const [selling, setSelling] = useState<string | null>(null);
  const groups: { key: string; label: string; rows: typeof items }[] = [];
  for (const row of items) {
    const key = holderKey(row.t.holder);
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, label: row.where, rows: [] }));
    g.rows.push(row);
  }
  groups.sort((a, b) => (a.key === 'inventory' ? -1 : b.key === 'inventory' ? 1 : a.label.localeCompare(b.label)));
  if (items.length === 0) return <div className="panel-body muted">No equipment yet. Buy tools in the Catalog.</div>;
  return (
    <div className="panel-body col" style={{ gap: 14 }} data-testid="supply-inventory">
      <div className="muted" style={{ fontSize: 12.5 }}>Every tool is in exactly one place. Move tools while technicians and vans are at headquarters.</div>
      {groups.map((g) => (
        <section key={g.key} className="col" style={{ gap: 6 }}>
          <h4>{g.label} <span className="muted" style={{ fontWeight: 600 }}>· {g.rows.length}</span></h4>
          {g.rows.map(({ t, locked, resale }) => {
            const def = toolDef(t.defId);
            const to = target[t.id] ?? (t.holder.kind === 'inventory' ? '' : 'inventory');
            return (
              <div key={t.id} className="card inv-row" data-testid={`tool-item-${t.id}`}>
                <ToolArt id={def.id} size={40} />
                <div className="col" style={{ gap: 2, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{def.name}</b>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {TIER_LABELS[def.tier]} · used on {t.jobsUsed} job{t.jobsUsed === 1 ? '' : 's'} · {t.history.at(-1)?.text ?? ''}
                  </span>
                  {locked && <span className="tag amber" style={{ alignSelf: 'flex-start' }}>{locked}</span>}
                </div>
                <div className="inv-actions">
                  <select className="select" value={to} disabled={!!locked} onChange={(e) => setTarget({ ...target, [t.id]: e.target.value })} data-testid={`move-to-${t.id}`} aria-label={`Move ${def.name} to`}>
                    <option value="" disabled>Move to…</option>
                    <Destinations def={def} />
                  </select>
                  <button className="btn small" disabled={!!locked || !to || sameHolder(parseHolder(to), t.holder)} onClick={() => run({ type: 'assign-tool', itemId: t.id, to: parseHolder(to) }, `${def.name} moved.`)} data-testid={`move-${t.id}`}>Move</button>
                  {selling === t.id ? (
                    <button className="btn small danger" onClick={() => run({ type: 'sell-tool', itemId: t.id }, `Sold ${def.name} for $${resale.toLocaleString()}.`) && setSelling(null)} data-testid={`sell-confirm-${t.id}`}>Sell for <Money value={resale} /></button>
                  ) : (
                    <button className="btn small" disabled={!!locked} onClick={() => setSelling(t.id)} data-testid={`sell-${t.id}`}>Sell</button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** Effective performance of one technician with one loadout. */
export function PerformanceCard({ title, perf, testId }: { title: string; perf: PerformanceSummary; testId?: string }) {
  const tiles: [string, string, string][] = [
    ['All readings right', pct(perf.allReadingsRight.base), pct(perf.allReadingsRight.effective)],
    ['Avg diagnostic', mins(perf.avgDiagMinutes.base), mins(perf.avgDiagMinutes.effective)],
    ['Avg repair', mins(perf.avgRepairMinutes.base), mins(perf.avgRepairMinutes.effective)],
    ['Refrigerant workmanship', pct(perf.workmanship.base), pct(perf.workmanship.effective)],
  ];
  return (
    <div className="card col perf-card" style={{ gap: 8 }} data-testid={testId}>
      <b>{title}</b>
      <div className="perf-tiles">
        {tiles.map(([label, base, eff]) => (
          <div key={label} className="tile">
            <div className="label">{label}</div>
            <div className="value">{eff}</div>
            <div className="tile-sub">{base === eff ? 'no tool effect' : `without tools ${base}`}</div>
          </div>
        ))}
      </div>
      <div className="col" style={{ gap: 4 }}>
        {perf.measures.map((m) => (
          <div key={m.kind} className="perf-line">
            <span>{m.label}</span>
            <Bar value={m.effective * 100} tone={m.effective > m.base + 0.001 ? 'green' : undefined} />
            <b>{pct(m.effective)}</b>
            <span className="muted">{m.tools.length ? m.tools.join(', ') : 'own skill'}</span>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 11.5 }}>Read accuracy is the chance each reading comes back right. Skill sets the base; tools close part of the gap to 97%.</div>
    </div>
  );
}

function Loadouts() {
  const staff = useGame((s) => fieldStaff(s));
  const vehicles = useGame((s) => Object.values(s.vehicles));
  const [techId, setTechId] = useState(staff[0]?.id ?? '');
  const [vanId, setVanId] = useState(vehicles[0]?.id ?? '');
  const [compareId, setCompareId] = useState('');
  const tech = staff.find((e) => e.id === techId) ?? staff[0];
  const van = vehicles.find((v) => v.id === vanId);
  const other = staff.find((e) => e.id === compareId && e.id !== tech?.id);
  const perf = useGameWith((s) => (tech ? performanceSummary(s, s.employees[tech.id], van ? s.vehicles[van.id] : undefined) : null), [tech?.id, van?.id]);
  const otherPerf = useGameWith((s) => (other ? performanceSummary(s, s.employees[other.id], van ? s.vehicles[van.id] : undefined) : null), [other?.id, van?.id]);
  const kit = useGameWith((s) => (tech ? toolsHeldBy(s, { kind: 'employee', id: tech.id }).map((t) => toolDef(t.defId)) : []), [tech?.id]);
  return (
    <div className="panel-body split" data-testid="supply-loadouts">
      <div className="col" style={{ gap: 12 }}>
        <h4>Technicians</h4>
        <div className="list">
          {staff.map((e) => (
            <div key={e.id} className={`list-item ${tech?.id === e.id ? 'selected' : ''}`} onClick={() => setTechId(e.id)} data-testid={`loadout-tech-${e.id}`}>
              <div>
                <div className="name">{e.name}</div>
                <div className="sub">{ROLE_LABELS[e.role]} · Diag {e.attributes.diagnosticAccuracy} · Detail {e.attributes.attentionToDetail}</div>
              </div>
              <KitCount employeeId={e.id} />
            </div>
          ))}
        </div>
        <h4>Vehicle racks</h4>
        <div className="col" style={{ gap: 6 }}>
          {vehicles.map((v) => <RackCard key={v.id} vehicle={v} selected={van?.id === v.id} onSelect={() => setVanId(v.id)} />)}
        </div>
      </div>
      <div className="col" style={{ gap: 12 }}>
        {tech && perf && (
          <>
            <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <h3>{tech.name}</h3>
              <select className="select" value={van?.id ?? ''} onChange={(e) => setVanId(e.target.value)} data-testid="loadout-van" style={{ maxWidth: 200 }}>
                <option value="">Kit only (no van)</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>with {v.nickname}</option>)}
              </select>
            </div>
            <div className="chip-row" data-testid="loadout-kit">
              {kit.length === 0 ? <span className="muted" style={{ fontSize: 12.5 }}>No personal tools. Equip from the Inventory tab.</span> : kit.map((d) => <span key={d.id} className="chip active">{d.name}</span>)}
            </div>
            <PerformanceCard title={`Effective performance${van ? ` with ${van.nickname}` : ''}`} perf={perf} testId="loadout-performance" />
            <label className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Compare with</span>
              <select className="select" value={other?.id ?? ''} onChange={(e) => setCompareId(e.target.value)} data-testid="loadout-compare" style={{ maxWidth: 220 }}>
                <option value="">Nobody</option>
                {staff.filter((e) => e.id !== tech.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            {other && otherPerf && <PerformanceCard title={`${other.name}${van ? ` with ${van.nickname}` : ''}`} perf={otherPerf} testId="loadout-compare-performance" />}
          </>
        )}
      </div>
    </div>
  );
}

function KitCount({ employeeId }: { employeeId: string }) {
  const n = useGameWith((s) => toolsHeldBy(s, { kind: 'employee', id: employeeId }).length, [employeeId]);
  return <span className={`tag ${n ? 'teal' : ''}`}>{n} tool{n === 1 ? '' : 's'}</span>;
}

function RackCard({ vehicle, selected, onSelect }: { vehicle: Vehicle; selected: boolean; onSelect: () => void }) {
  const used = useGameWith((s) => rackUsed(s, vehicle.id), [vehicle.id]);
  const items = useGameWith((s) => toolsHeldBy(s, { kind: 'vehicle', id: vehicle.id }).map((t) => toolDef(t.defId).name), [vehicle.id]);
  const cap = rackCapacity(vehicle);
  return (
    <div className={`card selectable ${selected ? 'selected' : ''}`} onClick={onSelect} data-testid={`rack-${vehicle.id}`}>
      <div className="row between">
        <b>{vehicle.nickname}</b>
        <span className="muted" style={{ fontSize: 12 }}>Rack {used} / {cap}</span>
      </div>
      <Bar value={used} max={cap} tone={used >= cap ? 'amber' : undefined} />
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{items.length ? items.join(' · ') : 'Empty rack'}</div>
    </div>
  );
}
