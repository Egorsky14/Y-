import { useApp, useGame } from '@/app/store';
import { PanelShell } from './PanelShell';
import { HQ_UPGRADES } from '@/game/progression/hqUpgrades';
import { employeeCapacity, vehicleCapacity } from '@/game/fleet/fleet';
import { Money } from '../components/common';
import { MILESTONE_DEFS } from '@/game/progression/milestones';

export function HqPanel() {
  const owned = useGame((s) => s.company.hqUpgrades);
  const level = useGame((s) => s.company.level);
  const cash = useGame((s) => s.finance.cash);
  const vCap = useGame((s) => vehicleCapacity(s));
  const eCap = useGame((s) => employeeCapacity(s));
  const milestones = useGame((s) => s.milestones);
  const dispatch = useApp((s) => s.dispatch);
  const techs = useGame((s) => Object.values(s.employees).filter((e) => e.role === 'technician').length);
  return (
    <PanelShell title="Headquarters" subtitle={`Company level ${level} · ${vCap} vehicle stalls · ${eCap} staff seats`} testId="panel-hq">
      <div className="panel-body split">
        <div className="col">
          <h4>Facility upgrades</h4>
          {HQ_UPGRADES.map((u) => {
            const has = owned.includes(u.id);
            const short = (u.minTechnicians ?? 0) > techs;
            const locked = level < u.level || (u.requires ?? []).some((r) => !owned.includes(r)) || short;
            return (
              <div key={u.id} className={`card row between ${has ? 'selected' : ''}`} data-testid={`hq-upgrade-${u.id}`}>
                <div>
                  <div style={{ fontWeight: 800 }}>{u.name} {has && <span className="tag teal" style={{ marginLeft: 6 }}>Built</span>}{!has && locked && <span className="tag" style={{ marginLeft: 6 }} data-testid={`hq-lock-${u.id}`}>{short ? `Needs ${u.minTechnicians} technicians · you have ${techs}` : `Level ${u.level}${u.requires ? ` · needs ${u.requires.map((r) => HQ_UPGRADES.find((x) => x.id === r)?.name).join(', ')}` : ''}`}</span>}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{u.description}</div>
                  <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--teal)' }}>{u.effect}</div>
                </div>
                <button className="btn small primary" disabled={has || locked || cash < u.cost} onClick={() => dispatch({ type: 'hq-upgrade', upgradeId: u.id })} data-testid={`hq-buy-${u.id}`}>
                  {has ? 'Owned' : <Money value={u.cost} />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="col">
          <h4>The First 90 Days · milestones</h4>
          {(['early', 'mid', 'late'] as const).map((phase) => (
            <div key={phase} className="col" style={{ gap: 6 }}>
              <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{phase === 'early' ? 'Early game' : phase === 'mid' ? 'Mid game' : 'Late game'}</div>
              {MILESTONE_DEFS.filter((m) => m.phase === phase).map((m) => {
                const st = milestones.find((x) => x.id === m.id);
                return (
                  <div key={m.id} className="row between card" style={{ padding: '8px 10px', opacity: st?.achievedDay ? 1 : 0.75 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{m.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{m.description}</div>
                    </div>
                    <span className={`tag ${st?.achievedDay ? 'green' : ''}`}>{st?.achievedDay ? `Day ${st.achievedDay}` : 'Open'}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}
