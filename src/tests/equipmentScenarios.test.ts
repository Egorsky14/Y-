import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/simulation/engine';
import type { GameState, Job, ToolHolder } from '@/game/simulation/types';
import { reconcileCash } from '@/game/economy/ledger';
import { balanceSheet, financingCosts } from '@/game/economy/balanceSheet';
import { availableCredit } from '@/game/economy/banking/banking';
import { banking } from '@/game/economy/banking/loans';
import { creditLineOffers, loanOffers } from '@/game/economy/banking/underwriting';
import { faultById } from '@/game/jobs/faults';
import { toolDef, type ToolId } from '@/game/equipment/catalog';
import { checkDestination, toolsHeldBy } from '@/game/equipment/inventory';

/**
 * Balance scenarios for the Pro Supply Depot. Each scenario plays the 90-day campaign with an
 * autopilot owner who reads the findings (scores each candidate diagnosis by the readings that
 * a careful player is led by the weight of the evidence, see readFindings), so better readings
 * lead to better diagnoses. Every scenario runs the same company (the owner plus one hired
 * technician and two vans from day 1, no further growth), so only the equipment differs: growth
 * timing makes whole companies diverge by more than any tool is worth (crew growth with credit is
 * studied in the banking scenarios). Five seeds, paired comparisons, plus each tool on its own
 * against the basic kit. Slow, so it runs only on request:
 *   EQUIPMENT_SCENARIOS=1 npx vitest run src/tests/equipmentScenarios.test.ts
 * Results are recorded in docs/design/SUPPLY_DEPOT.md.
 */

type Market = { name: string; reputation: number; brand: number; ads: number };
const MARKETS: Record<'normal' | 'high' | 'low', Market> = {
  normal: { name: 'Normal', reputation: 4.2, brand: 8, ads: 120 },
  high: { name: 'High demand', reputation: 4.8, brand: 45, ads: 260 },
  low: { name: 'Low demand', reputation: 3.3, brand: 0, ads: 0 },
};

interface Policy {
  /** Tools each technician should carry (bought when affordable, while they are at HQ). */
  techKit: ToolId[];
  /** Equipment each van's rack should carry (what fits). */
  vanKit: ToolId[];
  /** Pay for growth and tools with own cash, or borrow the shortfall. */
  funding: 'self' | 'financed';
  /** Cash the owner keeps after a purchase (payroll reserve). */
  reserve: number;
  /** Tools come out of surplus: cash kept after a tool purchase (crews come first). */
  toolReserve: number;
}

const BASIC: ToolId[] = ['hand-tools', 'multimeter'];
const PRO_FEW: ToolId[] = [...BASIC, 'digital-manifold', 'leak-detector', 'manometer'];
const PRO_FULL: ToolId[] = [...BASIC, 'clamp-meter', 'digital-manifold', 'leak-detector', 'manometer', 'micron-gauge', 'charging-scale'];
const EVERYTHING: ToolId[] = ['hand-tools', 'multimeter', 'clamp-meter', 'digital-manifold', 'leak-detector', 'manometer', 'charging-scale', 'micron-gauge', 'thermal-camera'];
const VAN_PRO: ToolId[] = ['vacuum-pump', 'recovery-machine'];
const VAN_ALL: ToolId[] = ['vacuum-pump', 'recovery-machine', 'nitrogen-kit'];

interface Scenario {
  id: string;
  name: string;
  market: Market;
  policy: Policy;
  baseline?: string;
}

const kitPolicy = (techKit: ToolId[], vanKit: ToolId[], funding: Policy['funding'] = 'self', toolReserve = 6000): Policy => ({ techKit, vanKit, funding, reserve: 6000, toolReserve });

const SCENARIOS: Scenario[] = [
  { id: 'A-normal', name: 'A. Basic tools only', market: MARKETS.normal, policy: kitPolicy(BASIC, []) },
  { id: 'B-normal', name: 'B. A few professional tools', market: MARKETS.normal, baseline: 'A-normal', policy: kitPolicy(PRO_FEW, []) },
  { id: 'A-low', name: 'A. Basic tools, weak market', market: MARKETS.low, policy: kitPolicy(BASIC, []) },
  { id: 'C-low', name: 'C. Everything, weak market', market: MARKETS.low, baseline: 'A-low', policy: kitPolicy(EVERYTHING, VAN_ALL, 'self', 1000) },
  { id: 'A-high', name: 'A. Basic tools, busy market', market: MARKETS.high, policy: kitPolicy(BASIC, []) },
  { id: 'D-high', name: 'D. Technician kits and van gear, busy', market: MARKETS.high, baseline: 'A-high', policy: kitPolicy(PRO_FULL, VAN_PRO) },
  { id: 'E-high', name: 'E. Same kits bought on credit, busy', market: MARKETS.high, baseline: 'D-high', policy: kitPolicy(PRO_FULL, VAN_PRO, 'financed') },
];

/** Each tool on its own, on every technician (or every van), against the basic kit. */
const SINGLE: ToolId[] = ['clamp-meter', 'digital-manifold', 'leak-detector', 'manometer', 'charging-scale', 'micron-gauge', 'vacuum-pump', 'recovery-machine', 'nitrogen-kit', 'thermal-camera'];
for (const id of SINGLE) {
  const vanTool = toolDef(id).mount === 'vehicle';
  SCENARIOS.push({ id: `one-${id}`, name: `Basic + ${toolDef(id).name}`, market: MARKETS.normal, baseline: 'A-normal', policy: kitPolicy(vanTool ? BASIC : [...BASIC, id], vanTool ? [id] : []) });
}

const techs = (s: GameState) => Object.values(s.employees).filter((e) => e.role === 'technician');
const vans = (s: GameState) => Object.values(s.vehicles);

/** Borrow only the shortfall: the cheapest approved term loan first, then the line of credit. */
function borrowFor(engine: GameEngine, s: GameState, need: number): void {
  for (const o of loanOffers(s).filter((x) => x.approved).sort((a, b) => a.aprPercent - b.aprPercent)) {
    const short = need - s.finance.cash;
    if (short <= 0) return;
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

/** Buys the policy's missing tools for technicians and vans that are at headquarters. */
function equip(engine: GameEngine, s: GameState, p: Policy, mem: Memory): void {
  const wants: { holder: ToolHolder; id: ToolId }[] = [];
  for (const e of techs(s)) for (const id of p.techKit) wants.push({ holder: { kind: 'employee', id: e.id }, id });
  for (const v of vans(s)) for (const id of p.vanKit) wants.push({ holder: { kind: 'vehicle', id: v.id }, id });
  for (const w of wants) {
    const has = toolsHeldBy(s, w.holder).some((t) => t.defId === w.id);
    if (has || !checkDestination(s, w.id, w.holder).ok) continue;
    const price = toolDef(w.id).price;
    if (p.funding === 'financed' && s.finance.cash < price + p.toolReserve) borrowFor(engine, s, price + p.toolReserve);
    if (s.finance.cash < price + p.toolReserve) return;
    if (engine.dispatch({ type: 'buy-tool', toolId: w.id, assignTo: w.holder }).ok) mem.toolSpend += price;
  }
}

/**
 * A careful player. A misread is written to point elsewhere (a failed capacitor read as
 * "44 µF, within spec" says the capacitor is fine), so the player follows the weight of the
 * evidence: when the readings taken correctly carry at least half of it, the diagnosis is right;
 * when most of it was misread, the player is led to the closest lookalike. (The hidden accuracy
 * flag stands in for that reading of the story; the choice itself goes through the game's action.)
 */
function readFindings(job: Job): string {
  const truth = faultById(job.faultId);
  const total = truth.evidence.reduce((a, t) => a + t.weight, 0);
  const right = job.evidence.reduce((a, ev) => a + (ev.accurate ? (truth.evidence.find((t) => t.label === ev.label)?.weight ?? 0) : 0), 0);
  if (right >= total / 2) return job.faultId;
  return truth.lookalikes.find((id) => job.diagnosisOptions.includes(id)) ?? job.diagnosisOptions.find((id) => id !== job.faultId) ?? job.faultId;
}

interface Memory {
  expiredByDay: number[];
  lastGrowth: number;
  seenDay: number;
  lastExpired: number;
  toolSpend: number;
  repairMinutes: number;
  repairs: number;
  quoted: Set<string>;
}

function operate(engine: GameEngine, p: Policy, m: Market, mem: Memory): void {
  const s = engine.state;
  if (mem.seenDay !== s.clock.day) {
    mem.expiredByDay.push(s.stats.leadsExpired - mem.lastExpired);
    mem.lastExpired = s.stats.leadsExpired;
    mem.seenDay = s.clock.day;
    if (s.clock.day === 3 && m.ads > 0) engine.dispatch({ type: 'set-marketing', channel: 'localServicesAds', dailyBudget: m.ads });
    const recent = mem.expiredByDay.slice(-5).reduce((a, b) => a + b, 0);
    void recent;
  }
  equip(engine, s, p, mem);
  const idleTechs = techs(s).filter((e) => e.status === 'idle' && !e.training && e.fatigue < 50);
  const freeVans = vans(s).filter((v) => v.status === 'parked');
  const waiting = Object.values(s.jobs).filter((j) => j.status === 'accepted' && j.kind !== 'replacement').length;
  let open = Math.min(idleTechs.length, freeVans.length) - waiting;
  for (const job of Object.values(s.jobs)) if (job.status === 'lead' && open > 0 && engine.dispatch({ type: 'accept-lead', jobId: job.id }).ok) open--;
  for (const job of Object.values(s.jobs)) {
    if (job.status !== 'accepted' || job.kind === 'replacement') continue;
    const tech = idleTechs.pop();
    const veh = freeVans.pop();
    if (!tech || !veh) break;
    engine.dispatch({ type: 'dispatch', jobId: job.id, technicianId: tech.id, vehicleId: veh.id });
  }
  for (const job of Object.values(s.jobs)) {
    if (job.status === 'awaiting-diagnosis') {
      engine.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: readFindings(job) });
      engine.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair' } });
    }
    if (job.status === 'repairing' && !mem.quoted.has(job.id)) {
      mem.quoted.add(job.id);
      mem.repairMinutes += job.phaseTotal;
      mem.repairs++;
    }
  }
}

/** The same crew for every scenario: the owner plus the strongest technician on the market and a used compact van. */
function staff(engine: GameEngine): void {
  const s = engine.state;
  const c = s.candidates.filter((x) => x.role === 'technician').sort((a, b) => b.attributes.technicalExpertise - a.attributes.technicalExpertise)[0];
  if (c) engine.dispatch({ type: 'hire', candidateId: c.id });
  const van = cheapestVan(s);
  if (van) engine.dispatch({ type: 'buy-vehicle', request: { classId: 'compact-van', listingId: van.id, financing: 'cash' } });
}

function play(sc: Scenario, seed: number) {
  const engine = GameEngine.newGame({ seed });
  const s0 = engine.state;
  s0.company.reputation = sc.market.reputation;
  s0.marketing.brandRecognition = sc.market.brand;
  const start = balanceSheet(s0);
  staff(engine);
  const mem: Memory = { expiredByDay: [], lastGrowth: -99, seenDay: 0, lastExpired: 0, toolSpend: 0, repairMinutes: 0, repairs: 0, quoted: new Set() };
  let guard = 0;
  while (!engine.state.campaignComplete && guard++ < 90 * 96 + 100) {
    operate(engine, sc.policy, sc.market, mem);
    engine.advanceMinutes(15);
  }
  const s = engine.state;
  const bs = balanceSheet(s);
  const diag = s.stats.correctDiagnoses + s.stats.incorrectDiagnoses;
  return {
    reconciled: reconcileCash(s).ok,
    revenue: Math.round(s.stats.totalRevenue),
    jobs: s.stats.jobsCompleted,
    correctPct: diag ? Math.round((s.stats.correctDiagnoses / diag) * 1000) / 10 : 0,
    callbacks: s.stats.callbacks,
    avgRepairMin: mem.repairs ? Math.round(mem.repairMinutes / mem.repairs) : 0,
    reputation: Math.round(s.company.reputation * 100) / 100,
    toolSpend: Math.round(mem.toolSpend),
    tools: Object.keys(s.tools).length,
    techs: techs(s).length,
    financingCost: Math.round(financingCosts(s)),
    cash: Math.round(bs.cash),
    equipment: Math.round(bs.equipment),
    liabilities: Math.round(bs.totalLiabilities),
    equityChange: Math.round(bs.equity - start.equity),
  };
}

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const SEEDS = [2026, 7, 42, 1234, 99];
type Row = ReturnType<typeof play>;
const NUMERIC = ['revenue', 'jobs', 'correctPct', 'callbacks', 'avgRepairMin', 'reputation', 'toolSpend', 'tools', 'techs', 'financingCost', 'cash', 'equipment', 'liabilities', 'equityChange'] as const;
type Numeric = (typeof NUMERIC)[number];
const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

describe.skipIf(!env.EQUIPMENT_SCENARIOS)('equipment balance scenarios', () => {
  it('plays every equipment strategy through the campaign on several seeds', () => {
    const runs: Record<string, Row[]> = {};
    for (const sc of SCENARIOS) runs[sc.id] = SEEDS.map((seed) => play(sc, seed));
    for (const sc of SCENARIOS) for (const r of runs[sc.id]) expect(r.reconciled, `${sc.id} books`).toBe(true);
    const summary = SCENARIOS.map((sc) => ({ id: sc.id, name: sc.name, ...Object.fromEntries(NUMERIC.map((k) => [k, mean(runs[sc.id].map((r) => r[k] as number))])) }));
    const increments = SCENARIOS.filter((sc) => sc.baseline).map((sc) => {
      const d = (k: Numeric) => runs[sc.id].map((r, i) => (r[k] as number) - (runs[sc.baseline!][i][k] as number));
      const dEq = d('equityChange');
      return {
        id: sc.id,
        vs: sc.baseline!,
        dRevenue: mean(d('revenue')),
        dJobs: mean(d('jobs')),
        dCorrectPct: mean(d('correctPct')),
        dCallbacks: mean(d('callbacks')),
        dAvgRepairMin: mean(d('avgRepairMin')),
        dToolSpend: mean(d('toolSpend')),
        dFinancingCost: mean(d('financingCost')),
        dEquity: mean(dEq),
        dEquityMin: Math.min(...dEq),
        dEquityMax: Math.max(...dEq),
        seedsBetter: dEq.filter((x) => x > 0).length,
      };
    });
    const json = JSON.stringify({ seeds: SEEDS, summary, increments, runs });
    console.log('EQUIPMENT_JSON ' + json);
    console.table(summary.map(({ id, ...row }) => (void id, row)));
    console.table(increments);
    const inc = Object.fromEntries(increments.map((r) => [r.id, r]));
    // Better instruments read better: diagnoses improve with professional tools.
    expect(inc['B-normal'].dCorrectPct).toBeGreaterThan(0);
    expect(inc['D-high'].dCorrectPct).toBeGreaterThan(0);
    // Repairs are faster and callbacks rarer with the right equipment.
    expect(inc['D-high'].dAvgRepairMin).toBeLessThan(0);
    expect(inc['D-high'].dCallbacks).toBeLessThan(0);
    // Where there is work, a sensible kit pays for itself on average (busy market, fixed crew).
    expect(inc['D-high'].dEquity).toBeGreaterThan(0);
    // Overbuying in a weak market is measured on 20 seeds below (five are too few for it).
  }, 3_600_000);

  it('overbuying in a weak market, on 20 seeds', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);
    const a = SCENARIOS.find((x) => x.id === 'A-low')!;
    const c = SCENARIOS.find((x) => x.id === 'C-low')!;
    const d = seeds.map((seed) => {
      const ra = play(a, seed);
      const rc = play(c, seed);
      expect(ra.reconciled && rc.reconciled).toBe(true);
      return { seed, dEquity: rc.equityChange - ra.equityChange, dJobs: rc.jobs - ra.jobs, dCallbacks: rc.callbacks - ra.callbacks, toolSpend: rc.toolSpend, equipmentBook: rc.equipment };
    });
    const m = (k: keyof (typeof d)[number]) => mean(d.map((x) => x[k] as number));
    const out = { seeds: seeds.length, dEquity: m('dEquity'), dJobs: m('dJobs'), dCallbacks: m('dCallbacks'), toolSpend: m('toolSpend'), equipmentBook: m('equipmentBook'), seedsBetter: d.filter((x) => x.dEquity > 0).length };
    console.log('OVERBUY_JSON ' + JSON.stringify({ out, d }));
    console.table([out]);
    // Fewer callbacks do not make up for gear the work cannot pay for: equity falls on average and
    // on most seeds (measured: -$4.7k, 6 of 20 seeds ahead).
    expect(out.dEquity).toBeLessThan(0);
    expect(out.seedsBetter).toBeLessThan(seeds.length / 2);
  }, 3_600_000);
});
