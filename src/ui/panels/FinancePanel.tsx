import { useState } from 'react';
import { useGame } from '@/app/store';
import { PanelShell, Tabs } from './PanelShell';
import { FINANCING_CATEGORIES, openReceivablesTotal, totalLoanBalance, reconcileCash } from '@/game/economy/ledger';
import { BankingTab } from './BankingTab';
import { Money } from '../components/common';
import type { LedgerEntry } from '@/game/simulation/types';
import { formatClock } from '@/game/simulation/time';

type Tab = 'overview' | 'banking' | 'ledger' | 'receivables';

const CATEGORY_LABEL: Record<LedgerEntry['category'], string> = {
  'service-revenue': 'Service revenue',
  'replacement-revenue': 'Replacement revenue',
  'warranty-collection': 'Warranty collections',
  payroll: 'Payroll',
  parts: 'Parts & equipment',
  fuel: 'Fuel',
  'vehicle-upkeep': 'Vehicle upkeep',
  'vehicle-purchase': 'Vehicle purchases',
  'vehicle-sale': 'Vehicle sales',
  'vehicle-upgrade': 'Vehicle upgrades',
  'loan-payment': 'Loan payments (legacy)',
  'loan-proceeds': 'Loan proceeds',
  'loan-principal': 'Loan principal',
  'loan-interest': 'Loan interest',
  'loan-fee': 'Loan fees',
  'late-fee': 'Late fees',
  'credit-draw': 'Credit line draws',
  'credit-repayment': 'Credit line repayments',
  'credit-interest': 'Credit line interest',
  'lease-payment': 'Lease payments',
  training: 'Training',
  marketing: 'Marketing',
  facility: 'Facility upgrades',
  refund: 'Refunds',
  'owner-draw': 'Owner draw',
  'opening-balance': 'Opening balance',
};

export function FinancePanel() {
  const finance = useGame((s) => s.finance);
  const stats = useGame((s) => s.stats);
  const reconcile = useGame((s) => reconcileCash(s));
  const ar = useGame((s) => openReceivablesTotal(s));
  const debt = useGame((s) => totalLoanBalance(s));
  const pastDueCount = useGame((s) => s.finance.loans.filter((l) => (l.pastDue ?? 0) > 0).length + ((s.finance.banking?.creditLine?.pastDue ?? 0) > 0 ? 1 : 0));
  const [tab, setTab] = useState<Tab>('overview');
  const line = finance.banking?.creditLine && finance.banking.creditLine.status !== 'closed' ? finance.banking.creditLine : undefined;
  const byCategory = new Map<string, number>();
  // Financing (proceeds, principal, draws, repayments) moves cash but is not income or expense.
  for (const e of finance.ledger) if (e.category !== 'opening-balance' && !FINANCING_CATEGORIES.has(e.category)) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const grossRevenue = stats.totalRevenue;
  const cogs = -(byCategory.get('parts') ?? 0);
  const grossProfit = grossRevenue - cogs;
  const opex = stats.totalExpenses - cogs;
  const history = finance.history.slice(-30);
  const maxCash = Math.max(1, ...history.map((h) => Math.abs(h.cash)), Math.abs(finance.cash));
  return (
    <PanelShell title="Finances" subtitle={reconcile.ok ? 'Books reconciled: cash equals the ledger.' : `Reconciliation drift: ${reconcile.expected} vs ${reconcile.actual}`} testId="panel-finance" tabs={<Tabs value={tab} onChange={setTab} items={[{ id: 'overview', label: 'Overview' }, { id: 'banking', label: 'Banking & Credit', badge: pastDueCount }, { id: 'ledger', label: 'Ledger' }, { id: 'receivables', label: 'A/R & Debt' }]} />}>
      {tab === 'banking' && <BankingTab />}
      {tab === 'overview' && (
        <div className="panel-body col" style={{ gap: 16 }}>
          <div className="stat-tiles">
            <div className="tile"><div className="label">Cash</div><div className="value"><Money value={finance.cash} /></div></div>
            <div className="tile"><div className="label">Receivables</div><div className="value"><Money value={ar} /></div></div>
            <div className="tile"><div className="label">Debt</div><div className="value"><Money value={debt} /></div></div>
            <div className="tile"><div className="label">Net position</div><div className="value"><Money value={finance.cash + ar - debt} /></div></div>
          </div>
          <div className="grid2">
            <div className="card col" style={{ gap: 6 }}>
              <h4>Campaign P&amp;L</h4>
              <div className="row between"><span>Revenue</span><Money value={grossRevenue} /></div>
              <div className="row between"><span>Parts &amp; equipment</span><Money value={-cogs} /></div>
              <div className="row between" style={{ fontWeight: 800 }}><span>Gross profit</span><Money value={grossProfit} /> </div>
              <div className="muted" style={{ fontSize: 12 }}>Gross margin {grossRevenue > 0 ? Math.round((grossProfit / grossRevenue) * 100) : 0}%</div>
              <div className="divider" />
              {[...byCategory.entries()].filter(([k, v]) => v < 0 && k !== 'parts').sort((a, b) => a[1] - b[1]).map(([k, v]) => (
                <div key={k} className="row between muted" style={{ fontSize: 13 }}><span>{CATEGORY_LABEL[k as LedgerEntry['category']]}</span><Money value={v} /></div>
              ))}
              <div className="row between" style={{ fontWeight: 800 }}><span>Operating expenses</span><Money value={-opex} /></div>
              <div className="row between" style={{ fontWeight: 800, fontSize: 15 }}><span>Net income</span><Money value={grossProfit - opex} signed /></div>
            </div>
            <div className="card col" style={{ gap: 6 }}>
              <h4>Cash · last {history.length} days</h4>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }}>
                {history.map((h) => (
                  <div key={h.day} title={`Day ${h.day}: $${Math.round(h.cash).toLocaleString()}`} style={{ flex: 1, height: `${Math.max(2, (Math.abs(h.cash) / maxCash) * 100)}%`, background: h.cash >= 0 ? 'var(--teal)' : 'var(--red)', borderRadius: 3, opacity: 0.85 }} />
                ))}
                {history.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>History appears after the first day closes.</div>}
              </div>
              <div className="divider" />
              <div className="row between muted" style={{ fontSize: 13 }}><span>Jobs completed</span><b>{stats.jobsCompleted}</b></div>
              <div className="row between muted" style={{ fontSize: 13 }}><span>Diagnostic accuracy</span><b>{stats.correctDiagnoses + stats.incorrectDiagnoses > 0 ? Math.round((stats.correctDiagnoses / (stats.correctDiagnoses + stats.incorrectDiagnoses)) * 100) : 0}%</b></div>
              <div className="row between muted" style={{ fontSize: 13 }}><span>Callbacks</span><b>{stats.callbacks}</b></div>
              <div className="row between muted" style={{ fontSize: 13 }}><span>Leads lost / expired</span><b>{stats.leadsLost} / {stats.leadsExpired}</b></div>
              <div className="row between muted" style={{ fontSize: 13 }}><span>Distance driven</span><b>{(stats.distanceDriven * 0.0006).toFixed(1)} mi</b></div>
            </div>
          </div>
        </div>
      )}
      {tab === 'ledger' && (
        <div className="panel-body">
          <table className="ledger" data-testid="ledger">
            <thead><tr><th>Day</th><th>Time</th><th>Category</th><th>Memo</th><th>Amount</th></tr></thead>
            <tbody>
              {finance.ledger.slice().reverse().slice(0, 150).map((e) => (
                <tr key={e.id}>
                  <td>{e.day}</td>
                  <td>{formatClock({ day: e.day, minute: e.minute })}</td>
                  <td className="muted">{CATEGORY_LABEL[e.category]}</td>
                  <td>{e.memo}</td>
                  <td><Money value={e.amount} signed /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'receivables' && (
        <div className="panel-body split">
          <div className="col">
            <h4>Open receivables · <Money value={ar} /></h4>
            {finance.receivables.filter((r) => r.status === 'open').length === 0 && <div className="card muted">No open receivables. Warranty work bills net 35 days.</div>}
            {finance.receivables.filter((r) => r.status === 'open').slice().reverse().map((r) => (
              <div key={r.id} className="card row between">
                <div><b>{r.payer}</b><div className="muted" style={{ fontSize: 12.5 }}>Issued day {r.issuedDay} · due day {r.dueDay}</div></div>
                <Money value={r.amount} />
              </div>
            ))}
          </div>
          <div className="col">
            <h4>Loans &amp; leases</h4>
            {finance.loans.length === 0 && finance.leases.length === 0 && !line && <div className="card muted">Debt free.</div>}
            {finance.loans.map((l) => (
              <div key={l.id} className="card">
                <div className="row between"><b>{l.purpose}</b><Money value={l.balance} /></div>
                <div className="muted" style={{ fontSize: 12.5 }}>{l.lender ? `${l.lender} · ` : ''}{l.aprPercent}% APR · <Money value={l.monthlyPayment} />/mo · next payment day {l.nextPaymentDay}{(l.pastDue ?? 0) > 0 ? ' · past due' : ''}</div>
              </div>
            ))}
            {line && (
              <div className="card">
                <div className="row between"><b>Line of credit · {line.lender}</b><Money value={line.principal} /></div>
                <div className="muted" style={{ fontSize: 12.5 }}>{line.aprPercent}% APR · limit <Money value={line.limit} />{line.minimumDue > 0 ? <> · minimum <Money value={line.minimumDue} /> due day {line.paymentDueDay}</> : null}{line.pastDue > 0 ? ' · past due' : ''}</div>
              </div>
            )}
            {finance.leases.map((l) => (
              <div key={l.id} className="card">
                <div className="row between"><b>Lease {l.vehicleId}</b><Money value={l.monthlyPayment} /></div>
                <div className="muted" style={{ fontSize: 12.5 }}>Next payment day {l.nextPaymentDay}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PanelShell>
  );
}
