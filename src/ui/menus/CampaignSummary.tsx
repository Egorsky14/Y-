import { useApp, useGame } from '@/app/store';
import { Money, Stars } from '../components/common';
import { MILESTONE_DEFS } from '@/game/progression/milestones';
import { openReceivablesTotal, totalLoanBalance } from '@/game/economy/ledger';

export function CampaignSummary() {
  const s = useGame((x) => x);
  const toMenu = useApp((x) => x.toMenu);
  const newGame = useApp((x) => x.newGame);
  if (!s) return null;
  const achieved = s.milestones.filter((m) => m.achievedDay !== undefined);
  const net = s.stats.totalRevenue - s.stats.totalExpenses;
  const grade = net > 120000 ? 'A' : net > 60000 ? 'B' : net > 20000 ? 'C' : net > 0 ? 'D' : 'F';
  return (
    <div className="summary">
      <div className="glass summary-card" data-testid="campaign-summary">
        <div className="row between">
          <div>
            <h2>The First 90 Days — complete</h2>
            <div className="muted">{s.company.name} · Grade {grade}</div>
          </div>
          <div style={{ fontSize: 44, fontWeight: 900, color: 'var(--teal)' }}>{grade}</div>
        </div>
        <div className="stat-tiles">
          <div className="tile"><div className="label">Cash</div><div className="value"><Money value={s.finance.cash} /></div></div>
          <div className="tile"><div className="label">Revenue</div><div className="value"><Money value={s.stats.totalRevenue} /></div></div>
          <div className="tile"><div className="label">Net income</div><div className="value"><Money value={net} signed /></div></div>
          <div className="tile"><div className="label">Net position</div><div className="value"><Money value={s.finance.cash + openReceivablesTotal(s) - totalLoanBalance(s)} /></div></div>
        </div>
        <div className="grid3">
          <div className="card"><div className="muted">Jobs completed</div><b style={{ fontSize: 20 }}>{s.stats.jobsCompleted}</b></div>
          <div className="card"><div className="muted">Replacements</div><b style={{ fontSize: 20 }}>{s.company.replacementsCompleted}</b></div>
          <div className="card"><div className="muted">Reputation</div><Stars value={s.company.reputation} count={s.company.reviews.length} /></div>
          <div className="card"><div className="muted">Team</div><b style={{ fontSize: 20 }}>{Object.keys(s.employees).length}</b></div>
          <div className="card"><div className="muted">Fleet</div><b style={{ fontSize: 20 }}>{Object.keys(s.vehicles).length}</b></div>
          <div className="card"><div className="muted">Market share</div><b style={{ fontSize: 20 }}>{Math.round(s.company.marketShare * 100)}%</b></div>
        </div>
        <div className="chip-row">
          {achieved.map((m) => (
            <span key={m.id} className="chip active">{MILESTONE_DEFS.find((d) => d.id === m.id)?.title}</span>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => newGame()}>Start a new company</button>
          <button className="btn" onClick={toMenu}>Main menu</button>
        </div>
      </div>
    </div>
  );
}
