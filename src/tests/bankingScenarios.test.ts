import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/simulation/engine';
import type { GameState } from '@/game/simulation/types';
import { postTransaction, reconcileCash } from '@/game/economy/ledger';
import { balanceSheet, cashFlows, financingCosts } from '@/game/economy/balanceSheet';
import { availableCredit } from '@/game/economy/banking/banking';
import { banking } from '@/game/economy/banking/loans';
import { businessSnapshot, creditLineOffers, loanOffers } from '@/game/economy/banking/underwriting';
import { employeeCapacity, vehicleCapacity } from '@/game/fleet/fleet';

/**
 * Balance scenarios for business banking. Each scenario plays the 90-day campaign with the same
 * autopilot owner, in a given market, with a given funding policy, on several world seeds. One
 * seed is not enough: a few hundred dollars of difference flips a hiring decision and the runs
 * diverge, so comparisons use the mean over seeds and count the seeds where a strategy won.
 * Slow (several minutes), so it runs only on request:
 *   BANKING_SCENARIOS=1 npx vitest run src/tests/bankingScenarios.test.ts --reporter=verbose
 * Results are recorded in docs/design/BANKING.md.
 *
 * The autopilot accepts a lead only when it has a free crew (technician + van) for it, so demand
 * it cannot serve shows up as expired leads, which is the signal a real owner grows on. (Accepted
 * jobs never expire in the game, so accepting everything would hide capacity limits.)
 */

type Market = { name: string; reputation: number; brand: number; ads: number };

const MARKETS: Record<'normal' | 'high' | 'low', Market> = {
  normal: { name: 'Normal', reputation: 4.2, brand: 8, ads: 120 },
  // A hot summer market: strong reviews and brand, heavy local-services advertising.
  high: { name: 'High demand', reputation: 4.8, brand: 45, ads: 260 },
  // A soft market: middling reviews, unknown brand, no advertising budget.
  low: { name: 'Low demand', reputation: 3.3, brand: 0, ads: 0 },
};

interface Policy {
  /** How growth is paid for: own cash only, or borrowing for the shortfall. */
  funding: 'self' | 'financed';
  /** Grow when this many leads expired in the last 5 days (demand-led growth). */
  growOnExpired?: number;
  /** Grow on these days regardless of demand (optimistic growth). */
  growOnDays?: number[];
  maxTechs: number;
  /** Cash the owner keeps after any growth step (payroll reserve). */
  reserve: number;
  /** Keep borrowed money in the bank: outstanding debt is added to the reserve (the "held as cash" stunts). */
  reserveDebt?: boolean;
  /** Extra per-scenario behavior run every step (banking stunts, overdraws). */
  extra?: (engine: GameEngine, s: GameState, mem: Memory) => void;
}

interface Memory {
  expiredByDay: number[];
  lastGrowth: number;
  seenDay: number;
  lastExpired: number;
  [k: string]: unknown;
}

const techs = (s: GameState) => Object.values(s.employees).filter((e) => e.role === 'technician');
const vans = (s: GameState) => Object.values(s.vehicles);

function setupMarket(s: GameState, m: Market): void {
  s.company.reputation = m.reputation;
  s.marketing.brandRecognition = m.brand;
}

/** Borrow only the shortfall: the cheapest approved term loan first (at least its minimum), then the line. */
function borrowFor(engine: GameEngine, s: GameState, need: number): void {
  const offers = loanOffers(s).filter((o) => o.approved).sort((a, b) => a.aprPercent - b.aprPercent);
  for (const o of offers) {
    const short = need - s.finance.cash;
    if (short <= 0) return;
    // Proceeds arrive net of the origination fee, so gross up the request.
    const amount = Math.min(o.amount, Math.max(o.minAmount, Math.ceil(short / (1 - o.originationFeePercent / 100) / 500) * 500));
    engine.dispatch({ type: 'bank-accept-loan', offerId: o.id, amount });
  }
  if (s.finance.cash >= need) return;
  if (!banking(s).creditLine) {
    const lo = creditLineOffers(s).filter((o) => o.approved).sort((a, b) => a.aprPercent - b.aprPercent)[0];
    if (lo) engine.dispatch({ type: 'bank-open-credit-line', offerId: lo.id });
  }
  const line = banking(s).creditLine;
  const short = need - s.finance.cash;
  if (line && short > 0 && availableCredit(line) >= 100) engine.dispatch({ type: 'bank-credit-draw', amount: Math.max(100, Math.min(availableCredit(line), Math.ceil(short))) });
}

const cheapestVan = (s: GameState) => s.usedListings.filter((l) => l.classId === 'compact-van').sort((a, b) => a.price - b.price)[0];

/**
 * One growth step: a van for a technician without one, else a technician; parking when full.
 * A crew is a technician plus a van, so a hire is only made when the van that goes with it is also
 * affordable (no paying wages to a technician with nothing to drive).
 */
function grow(engine: GameEngine, s: GameState, p: Policy): boolean {
  const needVan = vans(s).length < techs(s).length;
  if (!needVan && techs(s).length >= p.maxTechs) return false;
  const full = needVan ? vans(s).length >= vehicleCapacity(s) : Object.keys(s.employees).length >= employeeCapacity(s);
  let cost: number;
  let act: () => boolean;
  if (full) {
    if (s.company.hqUpgrades.includes('additional-parking')) return false;
    cost = 7500;
    act = () => engine.dispatch({ type: 'hq-upgrade', upgradeId: 'additional-parking' }).ok;
  } else if (needVan) {
    const listing = cheapestVan(s);
    if (!listing) return false;
    cost = listing.price;
    act = () => engine.dispatch({ type: 'buy-vehicle', request: { classId: 'compact-van', listingId: listing.id, financing: 'cash' } }).ok;
  } else {
    const c = s.candidates.filter((x) => x.role === 'technician').sort((a, b) => b.attributes.technicalExpertise - a.attributes.technicalExpertise)[0];
    if (!c) return false;
    // A month of wages, plus the crew's van.
    cost = c.hourlyWage * 8 * 30 + (cheapestVan(s)?.price ?? 0);
    act = () => engine.dispatch({ type: 'hire', candidateId: c.id }).ok;
  }
  const reserve = p.reserve + (p.reserveDebt ? balanceSheet(s).totalLiabilities : 0);
  if (p.funding === 'financed') borrowFor(engine, s, cost + reserve);
  if (s.finance.cash < cost + reserve) return false;
  return act();
}

function operate(engine: GameEngine, p: Policy, m: Market, mem: Memory): void {
  const s = engine.state;
  // Day bookkeeping: expired leads per day, the growth decision once a day.
  if (mem.seenDay !== s.clock.day) {
    mem.expiredByDay.push(s.stats.leadsExpired - mem.lastExpired);
    mem.lastExpired = s.stats.leadsExpired;
    mem.seenDay = s.clock.day;
    if (s.clock.day === 3 && m.ads > 0) engine.dispatch({ type: 'set-marketing', channel: 'localServicesAds', dailyBudget: m.ads });
    const recent = mem.expiredByDay.slice(-5).reduce((a, b) => a + b, 0);
    const demandLed = p.growOnExpired !== undefined && recent >= p.growOnExpired && s.clock.day - mem.lastGrowth >= 4;
    const planned = p.growOnDays?.includes(s.clock.day) ?? false;
    // A planned day may take several steps (hire + van + parking); demand-led growth takes one.
    if (demandLed || planned) for (let i = 0; i < (planned ? 3 : 1); i++) if (grow(engine, s, p)) mem.lastGrowth = s.clock.day;
  }
  // A tired technician rests: overwork destroys morale and they quit (the game's turnover rule).
  const idleTechs = techs(s).filter((e) => e.status === 'idle' && !e.training && e.fatigue < 50);
  const freeVans = vans(s).filter((v) => v.status === 'parked');
  const waiting = Object.values(s.jobs).filter((j) => j.status === 'accepted' && j.kind !== 'replacement').length;
  let open = Math.min(idleTechs.length, freeVans.length) - waiting;
  for (const job of Object.values(s.jobs)) {
    if (job.status === 'lead' && open > 0 && engine.dispatch({ type: 'accept-lead', jobId: job.id }).ok) open--;
  }
  for (const job of Object.values(s.jobs)) {
    if (job.status !== 'accepted' || job.kind === 'replacement') continue;
    const tech = idleTechs.pop();
    const veh = freeVans.pop();
    if (!tech || !veh) break;
    engine.dispatch({ type: 'dispatch', jobId: job.id, technicianId: tech.id, vehicleId: veh.id });
  }
  for (const job of Object.values(s.jobs)) {
    if (job.status === 'awaiting-diagnosis') {
      engine.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: job.diagnosisOptions[0] });
      engine.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair' } });
    }
  }
  p.extra?.(engine, s, mem);
}

interface Scenario {
  id: string;
  name: string;
  market: Market;
  policy: Policy;
  /** Paired scenario the increment is measured against. */
  baseline?: string;
}

const DEMAND_LED = { growOnExpired: 4, maxTechs: 4, reserve: 8000 };

const takeOnce = (productId: string) => (e: GameEngine, s: GameState, mem: Memory) => {
  if (mem[`took-${productId}`]) return;
  const o = loanOffers(s).find((x) => x.productId === productId);
  if (o?.approved && e.dispatch({ type: 'bank-accept-loan', offerId: o.id }).ok) mem[`took-${productId}`] = true;
};

const SCENARIOS: Scenario[] = [
  // The original six, now with the demand-led autopilot and valued on equity.
  { id: 'conservative', name: 'Conservative: self-funded growth', market: MARKETS.normal, policy: { funding: 'self', ...DEMAND_LED } },
  { id: 'modest', name: 'Microloan on day 1, held as cash', market: MARKETS.normal, baseline: 'conservative', policy: { funding: 'self', ...DEMAND_LED, reserveDebt: true, extra: takeOnce('microloan') } },
  {
    id: 'seasonal',
    name: 'Seasonal line use',
    market: MARKETS.normal,
    baseline: 'conservative',
    policy: {
      funding: 'self',
      ...DEMAND_LED,
      extra: (e, s) => {
        const b = banking(s);
        if (!b.creditLine) {
          const o = creditLineOffers(s).find((x) => x.productId === 'online-line');
          if (o?.approved) e.dispatch({ type: 'bank-open-credit-line', offerId: o.id });
        }
        const line = b.creditLine;
        if (!line || line.status !== 'active') return;
        if (s.finance.cash < 5000 && availableCredit(line) >= 1000) e.dispatch({ type: 'bank-credit-draw', amount: Math.min(availableCredit(line), 2500) });
        const owed = line.principal + line.interestDue + line.feesDue;
        if (s.finance.cash > 12000 && owed > 0) e.dispatch({ type: 'bank-credit-repay', amount: Math.min(owed, s.finance.cash - 10000) });
      },
    },
  },
  {
    id: 'stack',
    name: 'Every offer on day 1, held as cash',
    market: MARKETS.normal,
    baseline: 'conservative',
    policy: {
      funding: 'self',
      ...DEMAND_LED,
      reserveDebt: true,
      extra: (e, s, mem) => {
        if (mem.stacked) return;
        mem.stacked = true;
        for (const o of loanOffers(s)) if (o.approved) e.dispatch({ type: 'bank-accept-loan', offerId: o.id });
        const lo = creditLineOffers(s).find((x) => x.productId === 'online-line');
        if (lo?.approved && e.dispatch({ type: 'bank-open-credit-line', offerId: lo.id }).ok) e.dispatch({ type: 'bank-credit-draw', amount: availableCredit(banking(s).creditLine) });
      },
    },
  },
  {
    id: 'struggling',
    name: 'Struggling: loan, owner overdraws',
    market: MARKETS.normal,
    baseline: 'conservative',
    policy: {
      funding: 'self',
      ...DEMAND_LED,
      reserveDebt: true,
      extra: (e, s, mem) => {
        takeOnce('online-term')(e, s, mem);
        if (s.clock.day >= 5 && mem.drawDay !== s.clock.day) {
          mem.drawDay = s.clock.day;
          postTransaction(s, { amount: -1500, category: 'owner-draw', memo: 'Owner draw (scenario)' });
        }
      },
    },
  },
  {
    id: 'payoff',
    name: 'Online loan held as cash, paid off day 45',
    market: MARKETS.normal,
    baseline: 'conservative',
    policy: {
      funding: 'self',
      ...DEMAND_LED,
      reserveDebt: true,
      extra: (e, s, mem) => {
        takeOnce('online-term')(e, s, mem);
        const loan = s.finance.loans.find((l) => l.kind === 'bank');
        if (loan && s.clock.day >= 45) e.dispatch({ type: 'bank-loan-payoff', loanId: loan.id });
      },
    },
  },
  { id: 'normal-fin', name: 'Normal demand: financed growth', market: MARKETS.normal, baseline: 'conservative', policy: { funding: 'financed', ...DEMAND_LED } },
  // Demand-led growth with and without credit, in a strong and a weak market.
  { id: 'high-self', name: 'High demand: self-funded growth', market: MARKETS.high, policy: { funding: 'self', ...DEMAND_LED } },
  { id: 'high-fin', name: 'High demand: financed growth', market: MARKETS.high, baseline: 'high-self', policy: { funding: 'financed', ...DEMAND_LED } },
  { id: 'low-self', name: 'Low demand: self-funded growth', market: MARKETS.low, policy: { funding: 'self', ...DEMAND_LED } },
  { id: 'low-fin', name: 'Low demand: financed growth', market: MARKETS.low, baseline: 'low-self', policy: { funding: 'financed', ...DEMAND_LED } },
  // Optimism: expand on a plan, not on demand, and borrow to do it.
  { id: 'low-plan', name: 'Low demand: borrow to expand on plan', market: MARKETS.low, baseline: 'low-self', policy: { funding: 'financed', growOnDays: [4, 11, 18], maxTechs: 3, reserve: 4000 } },
];

function play(sc: Scenario, seed: number) {
  const engine = GameEngine.newGame({ seed });
  setupMarket(engine.state, sc.market);
  const start = balanceSheet(engine.state);
  const mem: Memory = { expiredByDay: [], lastGrowth: -99, seenDay: 0, lastExpired: 0 };
  let guard = 0;
  while (!engine.state.campaignComplete && guard++ < 90 * 96 + 100) {
    operate(engine, sc.policy, sc.market, mem);
    engine.advanceMinutes(15);
  }
  const s = engine.state;
  const bs = balanceSheet(s);
  const cf = cashFlows(s);
  return {
    id: sc.id,
    name: sc.name,
    baseline: sc.baseline,
    reconciled: reconcileCash(s).ok,
    revenue: Math.round(s.stats.totalRevenue),
    jobs: s.stats.jobsCompleted,
    leadsExpired: s.stats.leadsExpired,
    techs: techs(s).length,
    vans: vans(s).length,
    operatingCF: Math.round(cf.operating),
    investingCF: Math.round(cf.investing),
    financingCF: Math.round(cf.financing),
    ownerDraws: Math.round(cf.owner),
    financingCost: Math.round(financingCosts(s)),
    cash: Math.round(bs.cash),
    vehicles: Math.round(bs.vehicles),
    liabilities: Math.round(bs.totalLiabilities),
    equity: Math.round(bs.equity),
    equityChange: Math.round(bs.equity - start.equity),
    status: businessSnapshot(s).worstStatus,
    misses: banking(s).history.filter((h) => h.type === 'late').length,
    rating: banking(s).creditScore,
  };
}

// The app tsconfig has no Node types; read the opt-in flag without them.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

const SEEDS = [2026, 7, 42, 1234, 99];
type Row = ReturnType<typeof play>;
const NUMERIC = ['revenue', 'jobs', 'leadsExpired', 'techs', 'vans', 'operatingCF', 'investingCF', 'financingCF', 'ownerDraws', 'financingCost', 'cash', 'vehicles', 'liabilities', 'equity', 'equityChange', 'misses', 'rating'] as const;
type Numeric = (typeof NUMERIC)[number];
const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

describe.skipIf(!env.BANKING_SCENARIOS)('banking balance scenarios', () => {
  it('plays every strategy through the campaign on several seeds', () => {
    const runs: Record<string, Row[]> = {};
    for (const sc of SCENARIOS) runs[sc.id] = SEEDS.map((seed) => play(sc, seed));
    for (const sc of SCENARIOS) for (const r of runs[sc.id]) expect(r.reconciled, `${sc.id} books`).toBe(true);
    const avg = (id: string) => Object.fromEntries(NUMERIC.map((k) => [k, mean(runs[id].map((r) => r[k] as number))])) as Record<Numeric, number>;
    const summary = SCENARIOS.map((sc) => {
      const a = avg(sc.id);
      const statuses = runs[sc.id].map((r) => r.status);
      return { id: sc.id, name: sc.name, ...a, delinquentSeeds: statuses.filter((x) => x !== 'current').length };
    });
    const increments = SCENARIOS.filter((sc) => sc.baseline).map((sc) => {
      const d = (k: Numeric) => runs[sc.id].map((r, i) => (r[k] as number) - (runs[sc.baseline!][i][k] as number));
      const dEq = d('equityChange');
      return {
        id: sc.id,
        scenario: sc.name,
        vs: sc.baseline!,
        dRevenue: mean(d('revenue')),
        dJobs: mean(d('jobs')),
        dExpired: mean(d('leadsExpired')),
        dOperatingCF: mean(d('operatingCF')),
        dFinancingCost: mean(d('financingCost')),
        dTechs: Math.round((d('techs').reduce((a, b) => a + b, 0) / SEEDS.length) * 10) / 10,
        dVans: Math.round((d('vans').reduce((a, b) => a + b, 0) / SEEDS.length) * 10) / 10,
        dEquity: mean(dEq),
        dEquityMin: Math.min(...dEq),
        dEquityMax: Math.max(...dEq),
        seedsBetter: dEq.filter((x) => x > 0).length,
      };
    });
    console.log('SCENARIO_JSON ' + JSON.stringify({ seeds: SEEDS, summary, increments, runs }));
    console.table(summary.map(({ id, name, revenue, jobs, leadsExpired, techs, vans, operatingCF, investingCF, financingCF, financingCost, liabilities, equityChange, rating, delinquentSeeds }) => (void id, { name, revenue, jobs, expired: leadsExpired, crew: `${techs}T/${vans}V`, opCF: operatingCF, invCF: investingCF, finCF: financingCF, finCost: financingCost, liab: liabilities, dEquity: equityChange, rating, delinquentSeeds })));
    console.table(increments.map(({ id, ...r }) => (void id, r)));
    const inc = Object.fromEntries(increments.map((r) => [r.id, r]));
    // Credit is a real choice. Where demand goes unmet, financed growth earns more equity than
    // waiting for cash, on most seeds; in a weak market, borrowing to grow loses on every seed.
    expect(inc['high-fin'].dEquity).toBeGreaterThan(0);
    expect(inc['high-fin'].seedsBetter).toBeGreaterThanOrEqual(3);
    expect(inc['low-fin'].dEquity).toBeLessThan(0);
    expect(inc['low-plan'].dEquity).toBeLessThan(0);
    expect(inc['low-plan'].seedsBetter).toBe(0);
  }, 3_600_000);
});
