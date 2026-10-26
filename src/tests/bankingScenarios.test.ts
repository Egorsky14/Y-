import { describe, expect, it } from 'vitest';
import { newEngine } from './helpers';
import type { GameEngine } from '@/game/simulation/engine';
import type { GameState } from '@/game/simulation/types';
import { openReceivablesTotal, postTransaction, reconcileCash, totalLoanBalance } from '@/game/economy/ledger';
import { availableCredit } from '@/game/economy/banking/banking';
import { banking } from '@/game/economy/banking/loans';
import { businessSnapshot, creditLineOffers, loanOffers } from '@/game/economy/banking/underwriting';

/**
 * Balance scenarios for business banking: six borrowing strategies played through the full 90-day
 * campaign by the same autopilot owner. Slow (a minute or so), so it runs only on request:
 *   BANKING_SCENARIOS=1 npx vitest run src/tests/bankingScenarios.test.ts
 * The printed table is recorded in docs/design/BANKING.md.
 */

type Strategy = (engine: GameEngine, s: GameState) => void;

/** The campaign autopilot, plus growth when demand and cash allow (so borrowed money gets used). */
function operate(engine: GameEngine, decided: { day: number; hiredDay: number }): void {
  const s = engine.state;
  for (const job of Object.values(s.jobs)) if (job.status === 'lead') engine.dispatch({ type: 'accept-lead', jobId: job.id });
  const idleTechs = Object.values(s.employees).filter((e) => e.role === 'technician' && e.status === 'idle' && !e.training);
  const freeVehicles = Object.values(s.vehicles).filter((v) => v.status === 'parked');
  for (const job of Object.values(s.jobs)) {
    if (job.status !== 'accepted' || job.kind === 'replacement') continue;
    const tech = idleTechs.pop();
    const veh = freeVehicles.pop();
    if (!tech || !veh) break;
    engine.dispatch({ type: 'dispatch', jobId: job.id, technicianId: tech.id, vehicleId: veh.id });
  }
  for (const job of Object.values(s.jobs)) {
    if (job.status === 'awaiting-diagnosis') {
      engine.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: job.diagnosisOptions[0] });
      engine.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair' } });
    }
  }
  if (decided.day !== s.clock.day && s.clock.minute >= 600) {
    decided.day = s.clock.day;
    const techs = Object.values(s.employees).filter((e) => e.role === 'technician').length;
    const vans = Object.keys(s.vehicles).length;
    // Hire only for demand: a backlog of accepted jobs, at most one hire every 10 days.
    const backlog = Object.values(s.jobs).filter((j) => j.status === 'accepted').length;
    if (techs < 4 && backlog >= 3 && s.clock.day - decided.hiredDay >= 10 && s.finance.cash > 9000) {
      const c = s.candidates.find((x) => x.role === 'technician');
      if (c && engine.dispatch({ type: 'hire', candidateId: c.id }).ok) decided.hiredDay = s.clock.day;
    }
    if (vans < techs && s.finance.cash > 16000) {
      const listing = s.usedListings.find((l) => l.classId === 'compact-van');
      engine.dispatch({ type: 'buy-vehicle', request: { classId: 'compact-van', listingId: listing?.id, financing: 'cash' } });
    }
  }
  if (s.clock.day === 10 && s.marketing.localServicesAds === 0) engine.dispatch({ type: 'set-marketing', channel: 'localServicesAds', dailyBudget: 120 });
}

const takeLoan = (engine: GameEngine, s: GameState, productId: string) => {
  const o = loanOffers(s).find((x) => x.productId === productId);
  return o?.approved ? engine.dispatch({ type: 'bank-accept-loan', offerId: o.id }).ok : false;
};
const openLine = (engine: GameEngine, s: GameState) => {
  const o = creditLineOffers(s).find((x) => x.productId === 'online-line');
  return o?.approved ? engine.dispatch({ type: 'bank-open-credit-line', offerId: o.id }).ok : false;
};

const once = (fn: Strategy): Strategy => {
  let done = false;
  return (e, s) => {
    if (!done) done = fn(e, s) !== undefined || true;
  };
};

const SCENARIOS: { name: string; strategy: () => Strategy; spend?: number }[] = [
  { name: 'Conservative (no credit)', strategy: () => () => {} },
  { name: 'Modest loan (microloan day 1)', strategy: () => once((e, s) => void takeLoan(e, s, 'microloan')) },
  {
    name: 'Seasonal line use',
    strategy: () => (e, s) => {
      const b = banking(s);
      if (!b.creditLine) openLine(e, s);
      const line = b.creditLine;
      if (!line || line.status === 'closed') return;
      if (s.finance.cash < 5000 && availableCredit(line) >= 1000) e.dispatch({ type: 'bank-credit-draw', amount: Math.min(availableCredit(line), 2500) });
      if (s.finance.cash > 12000 && line.principal > 0) e.dispatch({ type: 'bank-credit-repay', amount: Math.min(line.principal + line.interestDue + line.feesDue, s.finance.cash - 10000) });
    },
  },
  {
    name: 'Multiple loans (everything day 1)',
    strategy: () => once((e, s) => {
      takeLoan(e, s, 'microloan');
      takeLoan(e, s, 'online-term');
      if (openLine(e, s)) e.dispatch({ type: 'bank-credit-draw', amount: availableCredit(banking(s).creditLine) });
    }),
  },
  {
    name: 'Struggling (borrow, owner overdraws)',
    strategy: () => once((e, s) => void takeLoan(e, s, 'online-term')),
    spend: 1500,
  },
  {
    name: 'Early payoff (online loan, repaid day 45)',
    strategy: () => {
      let taken = false;
      return (e, s) => {
        if (!taken) taken = takeLoan(e, s, 'online-term');
        const loan = s.finance.loans.find((l) => l.kind === 'bank');
        if (loan && s.clock.day >= 45) e.dispatch({ type: 'bank-loan-payoff', loanId: loan.id });
      };
    },
  },
];

function play(name: string, strategy: Strategy, spend = 0) {
  const engine = newEngine(2026);
  let guard = 0;
  const decided = { day: 0, hiredDay: -99 };
  let drawDay = 0;
  while (!engine.state.campaignComplete && guard++ < 90 * 96 + 100) {
    strategy(engine, engine.state);
    operate(engine, decided);
    // Struggling: from day 5 the owner takes far more out of the business than it earns.
    if (spend && engine.state.clock.day >= 5 && drawDay !== engine.state.clock.day) {
      drawDay = engine.state.clock.day;
      postTransaction(engine.state, { amount: -spend, category: 'owner-draw', memo: 'Owner draw (scenario)' });
    }
    engine.advanceMinutes(15);
  }
  const s = engine.state;
  const cost = (c: string[]) => -s.finance.ledger.filter((e) => c.includes(e.category)).reduce((a, e) => a + e.amount, 0);
  const b = banking(s);
  return {
    name,
    reconciled: reconcileCash(s).ok,
    revenue: Math.round(s.stats.totalRevenue),
    jobs: s.stats.jobsCompleted,
    cash: Math.round(s.finance.cash),
    debt: Math.round(totalLoanBalance(s)),
    netPosition: Math.round(s.finance.cash + openReceivablesTotal(s) - totalLoanBalance(s)),
    interestAndFees: Math.round(cost(['loan-interest', 'loan-fee', 'late-fee', 'credit-interest'])),
    missed: b.history.filter((h) => h.type === 'late').length,
    status: businessSnapshot(s).worstStatus,
    onTime: b.onTimePayments,
    score: b.creditScore,
    vans: Object.keys(s.vehicles).length,
    techs: Object.values(s.employees).filter((e) => e.role === 'technician').length,
  };
}

// The app tsconfig has no Node types; read the opt-in flag without them.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

describe.skipIf(!env.BANKING_SCENARIOS)('banking balance scenarios', () => {
  it('plays six strategies through the campaign', () => {
    const rows = SCENARIOS.map((sc) => play(sc.name, sc.strategy(), sc.spend));
    console.table(rows);
    for (const r of rows) expect(r.reconciled).toBe(true);
    // Borrowing has a price: no strategy that borrowed paid zero interest.
    for (const r of rows.slice(1)) expect(r.interestAndFees).toBeGreaterThan(0);
  }, 600_000);
});
