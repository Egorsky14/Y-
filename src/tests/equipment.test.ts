import { describe, expect, it } from 'vitest';
import { advanceUntil, expectOk, newEngine } from './helpers';
import type { GameEngine } from '@/game/simulation/engine';
import type { GameState, Job } from '@/game/simulation/types';
import { reconcileCash } from '@/game/economy/ledger';
import { balanceSheet, cashFlows } from '@/game/economy/balanceSheet';
import { spawnLead } from '@/game/jobs/leads';
import { FAULTS, faultById } from '@/game/jobs/faults';
import { CAPITALIZATION_THRESHOLD, READ_CEILING, STARTER_KIT, TOOLS, toolDef, type ToolId } from '@/game/equipment/catalog';
import { equipmentBookValue, rackCapacity, rackUsed, resalePrice, toolsHeldBy } from '@/game/equipment/inventory';
import { diagMultiplier, effectiveAccuracy, performanceSummary, readGain, repairMultiplier, summarize, workmanship } from '@/game/equipment/performance';
import { measurementAccuracy } from '@/game/employees/attributes';
import { deserialize, serialize } from '@/persistence/save';
import { createNewGame } from '@/game/simulation/newGame';
import { loanOffers } from '@/game/economy/banking/underwriting';
import { durationMultiplier } from '@/game/employees/attributes';

const OWNER = 'emp-owner';
const VAN = 'veh-1';

function buy(engine: GameEngine, toolId: ToolId, assignTo?: Parameters<GameEngine['dispatch']>[0] extends infer A ? (A extends { type: 'buy-tool'; assignTo?: infer H } ? H : never) : never): string {
  const before = new Set(Object.keys(engine.state.tools));
  expectOk(engine.dispatch({ type: 'buy-tool', toolId, assignTo }));
  const id = Object.keys(engine.state.tools).find((k) => !before.has(k));
  if (!id) throw new Error('no tool created');
  return id;
}

function itemOf(state: GameState, defId: ToolId, holderId?: string): string {
  const t = Object.values(state.tools).find((x) => x.defId === defId && (holderId === undefined || (x.holder.kind !== 'inventory' && x.holder.id === holderId)));
  if (!t) throw new Error(`no ${defId}`);
  return t.id;
}

/** A second technician on the payroll (from the hiring market). */
function hireTech(engine: GameEngine): string {
  const c = engine.state.candidates.find((x) => x.role === 'technician')!;
  const before = new Set(Object.keys(engine.state.employees));
  expectOk(engine.dispatch({ type: 'hire', candidateId: c.id }));
  return Object.keys(engine.state.employees).find((k) => !before.has(k))!;
}

/** Runs a service call with the owner and the starter van to the point the repair starts. */
function toRepair(engine: GameEngine, faultId: string, lotId = 'b-n-1'): Job {
  const s = engine.state;
  const job = spawnLead(s, { channel: 'direct', preferredLotId: lotId, faultId })!;
  s.customers[job.customerId].trust = 100;
  expectOk(engine.dispatch({ type: 'accept-lead', jobId: job.id }));
  expectOk(engine.dispatch({ type: 'dispatch', jobId: job.id, technicianId: OWNER, vehicleId: VAN }));
  advanceUntil(engine, (st) => st.jobs[job.id].status === 'awaiting-diagnosis', 400);
  expectOk(engine.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId }));
  expectOk(engine.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair', priceAdjust: 0.8 } }));
  return s.jobs[job.id];
}

describe('catalog', () => {
  it('has 12 data-driven tools with every required field and consistent accounting', () => {
    expect(TOOLS).toHaveLength(12);
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(12);
    for (const t of TOOLS) {
      expect(t.name.length).toBeGreaterThan(3);
      expect(t.price).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(10);
      expect(['basic', 'professional', 'advanced']).toContain(t.tier);
      expect(t.read || t.diag || t.work || t.quality).toBeTruthy();
      // Capital equipment is exactly what costs at least the capitalization threshold.
      expect(t.accounting === 'capital').toBe(t.price >= CAPITALIZATION_THRESHOLD);
    }
    for (const tier of ['basic', 'professional', 'advanced'] as const) expect(TOOLS.some((t) => t.tier === tier)).toBe(true);
    // Every reading and repair step in the fault catalog has at least one tool that serves it.
    for (const f of FAULTS) {
      for (const ev of f.evidence) expect(TOOLS.some((t) => (t.read?.[ev.measure] ?? 0) > 0)).toBe(true);
    }
  });

  it('starts every company with the starter kit on the owner, and nothing else', () => {
    const s = createNewGame({ seed: 7 });
    const kit = toolsHeldBy(s, { kind: 'employee', id: OWNER }).map((t) => t.defId).sort();
    expect(kit).toEqual([...STARTER_KIT].sort());
    expect(Object.keys(s.tools)).toHaveLength(STARTER_KIT.length);
    // It came with the business: no purchase and no book value.
    expect(s.finance.ledger.filter((e) => e.category === 'tools' || e.category === 'equipment-purchase')).toHaveLength(0);
    expect(equipmentBookValue(s)).toBe(0);
  });
});

describe('purchasing', () => {
  it('buys a small tool as an expense and a capital tool as an asset, through the ledger', () => {
    const engine = newEngine(42);
    const s = engine.state;
    const cash0 = s.finance.cash;
    const eq0 = balanceSheet(s).equity;
    const exp0 = s.stats.totalExpenses;

    const manifold = buy(engine, 'digital-manifold');
    const tx1 = s.finance.ledger.at(-1)!;
    expect(tx1.category).toBe('tools');
    expect(tx1.amount).toBe(-780);
    expect(s.tools[manifold].holder).toEqual({ kind: 'inventory' });
    // An expensed tool lowers equity by its price.
    expect(balanceSheet(s).equity).toBeCloseTo(eq0 - 780, 2);

    buy(engine, 'recovery-machine');
    const tx2 = s.finance.ledger.at(-1)!;
    expect(tx2.category).toBe('equipment-purchase');
    expect(tx2.amount).toBe(-1650);
    // A capital purchase swaps cash for an asset: equity unchanged on the day of purchase.
    expect(balanceSheet(s).equipment).toBe(1650);
    expect(balanceSheet(s).equity).toBeCloseTo(eq0 - 780, 2);
    expect(s.finance.cash).toBe(cash0 - 780 - 1650);
    expect(s.stats.totalExpenses).toBe(exp0 + 780 + 1650);
    expect(cashFlows(s).operating).toBeLessThan(0);
    expect(cashFlows(s).investing).toBe(-1650);
    expect(reconcileCash(s).ok).toBe(true);
  });

  it('refuses a purchase the company cannot pay for and changes nothing', () => {
    const engine = newEngine(42);
    const s = engine.state;
    s.finance.ledger.push({ id: 'tx-drain', day: 1, minute: 0, amount: -(s.finance.cash - 1000), category: 'owner-draw', memo: 'test' });
    s.finance.cash = 1000;
    const before = JSON.stringify({ tools: s.tools, ledger: s.finance.ledger.length, cash: s.finance.cash });
    const r = engine.dispatch({ type: 'buy-tool', toolId: 'thermal-camera' });
    expect(r).toEqual({ ok: false, reason: 'Thermal imaging camera costs $1,900. Not enough cash.' });
    expect(JSON.stringify({ tools: s.tools, ledger: s.finance.ledger.length, cash: s.finance.cash })).toBe(before);
  });

  it('pays for equipment with borrowed money without counting the loan as revenue', () => {
    const engine = newEngine(42);
    const s = engine.state;
    const rev0 = s.stats.totalRevenue;
    const eq0 = balanceSheet(s).equity;
    // Spend down, borrow, then buy a capital tool with the loan proceeds.
    s.finance.ledger.push({ id: 'tx-spend', day: 1, minute: 0, amount: -(s.finance.cash - 200), category: 'owner-draw', memo: 'test' });
    s.finance.cash = 200;
    expect(engine.dispatch({ type: 'buy-tool', toolId: 'vacuum-pump' }).ok).toBe(false);
    const micro = loanOffers(s).find((o) => o.productId === 'microloan')!;
    expectOk(engine.dispatch({ type: 'bank-accept-loan', offerId: micro.id, amount: 3000 }));
    const eqAfterLoan = balanceSheet(s).equity;
    buy(engine, 'vacuum-pump', { kind: 'vehicle', id: VAN });
    expect(s.stats.totalRevenue).toBe(rev0);
    expect(s.finance.ledger.some((e) => e.category === 'loan-proceeds' && e.amount === 3000)).toBe(true);
    // The pump is an asset: buying it with the loan leaves equity where the loan left it.
    expect(balanceSheet(s).equity).toBeCloseTo(eqAfterLoan, 2);
    expect(eqAfterLoan).toBeLessThan(eq0 + 0.01); // borrowing never creates equity (fee is a cost)
    expect(reconcileCash(s).ok).toBe(true);
  });
});


describe('ownership and assignment', () => {
  it('assigns, transfers and returns a tool, and only its holder benefits', () => {
    const engine = newEngine(42);
    const s = engine.state;
    const b = hireTech(engine);
    const m = buy(engine, 'digital-manifold', { kind: 'employee', id: OWNER });
    const owner = s.employees[OWNER];
    const tech = s.employees[b];
    const pressure = (e: typeof owner) => performanceSummary(s, e).measures.find((x) => x.kind === 'pressure')!;
    expect(pressure(owner).effective).toBeGreaterThan(pressure(owner).base);
    expect(pressure(tech).effective).toBe(pressure(tech).base);

    expectOk(engine.dispatch({ type: 'assign-tool', itemId: m, to: { kind: 'employee', id: b } }));
    expect(pressure(owner).effective).toBe(pressure(owner).base);
    expect(pressure(tech).effective).toBeGreaterThan(pressure(tech).base);
    expect(s.tools[m].history.at(-1)!.text).toContain(`to ${tech.name}`);

    expectOk(engine.dispatch({ type: 'assign-tool', itemId: m, to: { kind: 'inventory' } }));
    expect(pressure(tech).effective).toBe(pressure(tech).base);
    // Still exactly one manifold, now in the crib.
    expect(Object.values(s.tools).filter((t) => t.defId === 'digital-manifold')).toHaveLength(1);
  });

  it('prevents duplicates, wrong mounts, full racks and moves while in the field', () => {
    const engine = newEngine(42);
    const s = engine.state;
    // A second multimeter for the owner (who already has one).
    const r1 = engine.dispatch({ type: 'buy-tool', toolId: 'multimeter', assignTo: { kind: 'employee', id: OWNER } });
    expect(r1).toEqual({ ok: false, reason: `${s.employees[OWNER].name} already carries a digital multimeter.` });
    // Vehicle equipment does not go in a technician's kit.
    const pump = buy(engine, 'vacuum-pump');
    expect(engine.dispatch({ type: 'assign-tool', itemId: pump, to: { kind: 'employee', id: OWNER } })).toEqual({ ok: false, reason: "Vacuum pump rides in a vehicle, not in a technician's kit." });
    // The compact van's rack holds 6: pump (2) + recovery machine (3) fit, the nitrogen kit (2) does not.
    expectOk(engine.dispatch({ type: 'assign-tool', itemId: pump, to: { kind: 'vehicle', id: VAN } }));
    buy(engine, 'recovery-machine', { kind: 'vehicle', id: VAN });
    expect(rackUsed(s, VAN)).toBe(5);
    expect(rackCapacity(s.vehicles[VAN])).toBe(6);
    const n2 = buy(engine, 'nitrogen-kit');
    const full = engine.dispatch({ type: 'assign-tool', itemId: n2, to: { kind: 'vehicle', id: VAN } });
    expect(full.ok).toBe(false);
    expect(!full.ok && full.reason).toContain('rack is full');
    // A second pump in the same van is a duplicate.
    const pump2 = buy(engine, 'vacuum-pump');
    expect(engine.dispatch({ type: 'assign-tool', itemId: pump2, to: { kind: 'vehicle', id: VAN } })).toEqual({ ok: false, reason: 'Unit 1 already carries a vacuum pump.' });

    // Out on a call: neither the owner's kit nor the van's rack can move.
    const lead = spawnLead(s, { channel: 'direct', preferredLotId: 'b-n-1', faultId: 'contactor' })!;
    expectOk(engine.dispatch({ type: 'accept-lead', jobId: lead.id }));
    expectOk(engine.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: OWNER, vehicleId: VAN }));
    const meter = itemOf(s, 'multimeter', OWNER);
    expect(engine.dispatch({ type: 'assign-tool', itemId: meter, to: { kind: 'inventory' } })).toEqual({ ok: false, reason: `${s.employees[OWNER].name} has it in the field.` });
    expect(engine.dispatch({ type: 'assign-tool', itemId: pump, to: { kind: 'inventory' } })).toEqual({ ok: false, reason: 'Unit 1 is out with it.' });
    expect(engine.dispatch({ type: 'sell-tool', itemId: pump }).ok).toBe(false);
    expect(engine.dispatch({ type: 'assign-tool', itemId: pump2, to: { kind: 'vehicle', id: VAN } }).ok).toBe(false);
  });

  it('returns tools to the crib when a technician is let go or a van is sold', () => {
    const engine = newEngine(42);
    const s = engine.state;
    const b = hireTech(engine);
    const cam = buy(engine, 'thermal-camera', { kind: 'employee', id: b });
    const meter = buy(engine, 'clamp-meter', { kind: 'employee', id: b });
    expectOk(engine.dispatch({ type: 'fire', employeeId: b }));
    expect(s.tools[cam].holder).toEqual({ kind: 'inventory' });
    expect(s.tools[meter].holder).toEqual({ kind: 'inventory' });

    s.finance.ledger.push({ id: 'tx-cap', day: 1, minute: 0, amount: 60000, category: 'opening-balance', memo: 'test' });
    s.finance.cash += 60000;
    expectOk(engine.dispatch({ type: 'buy-vehicle', request: { classId: 'full-size-van', financing: 'cash' } }));
    const van2 = Object.keys(s.vehicles).find((k) => k !== VAN)!;
    const rec = buy(engine, 'recovery-machine', { kind: 'vehicle', id: van2 });
    expectOk(engine.dispatch({ type: 'sell-vehicle', vehicleId: van2 }));
    expect(s.tools[rec].holder).toEqual({ kind: 'inventory' });
    expect(Object.values(s.tools).every((t) => t.holder.kind === 'inventory' || (t.holder.kind === 'employee' ? !!s.employees[t.holder.id] : !!s.vehicles[t.holder.id]))).toBe(true);
    expect(reconcileCash(s).ok).toBe(true);
  });

  it('sells surplus equipment for less than it cost (no money from buying and selling)', () => {
    const engine = newEngine(42);
    const s = engine.state;
    const cash0 = s.finance.cash;
    const eq0 = balanceSheet(s).equity;
    const cam = buy(engine, 'thermal-camera');
    const price = resalePrice(s, s.tools[cam]);
    expect(price).toBe(760);
    expectOk(engine.dispatch({ type: 'sell-tool', itemId: cam }));
    expect(s.tools[cam]).toBeUndefined();
    expect(s.finance.cash).toBe(cash0 - 1900 + 760);
    expect(balanceSheet(s).equity).toBeCloseTo(eq0 - 1140, 2);
    expect(s.finance.ledger.at(-1)!.category).toBe('equipment-sale');
  });
});

describe('effective performance', () => {
  it('closes part of the gap to the ceiling: skill still leads, nobody is perfect', () => {
    const novice = measurementAccuracy({ ...createNewGame().employees[OWNER].attributes, diagnosticAccuracy: 30, attentionToDetail: 30 }, 0);
    const expert = measurementAccuracy({ ...createNewGame().employees[OWNER].attributes, diagnosticAccuracy: 90, attentionToDetail: 80 }, 0);
    const gain = readGain([toolDef('digital-manifold'), toolDef('thermal-camera')], 'temperature');
    // Two tools on the same reading stack with diminishing returns: 1 − (1 − 0.3)(1 − 0.3).
    expect(gain).toBeCloseTo(0.51, 6);
    const n = effectiveAccuracy(novice, gain);
    const x = effectiveAccuracy(expert, gain);
    expect(n).toBeGreaterThan(novice);
    expect(x).toBeGreaterThan(n);
    expect(x).toBeLessThan(READ_CEILING);
    const all = readGain(TOOLS, 'pressure');
    expect(effectiveAccuracy(novice, all)).toBeLessThan(READ_CEILING);
  });

  it('helps only the work a tool is for: the costliest tool does nothing for a capacitor', () => {
    const cap = faultById('run-capacitor');
    const leak = faultById('refrigerant-leak');
    expect(repairMultiplier(cap, [toolDef('thermal-camera')])).toBe(1);
    expect(repairMultiplier(cap, [toolDef('recovery-machine')])).toBe(1);
    expect(repairMultiplier(leak, [toolDef('recovery-machine')])).toBeCloseTo(1 - 0.5 / 5, 6);
    expect(diagMultiplier(cap, [toolDef('multimeter')])).toBeCloseTo(1 - 0.1 / 3, 6);
    expect(diagMultiplier(cap, [toolDef('leak-detector')])).toBe(1);
    // Everything at once is capped well short of free.
    expect(repairMultiplier(leak, TOOLS)).toBeGreaterThan(0.45);
    expect(diagMultiplier(leak, TOOLS)).toBeGreaterThanOrEqual(0.65);
    const q = workmanship(leak, createNewGame().employees[OWNER].attributes, TOOLS)!;
    expect(q.quality).toBeGreaterThan(q.base);
    expect(q.quality).toBeLessThan(1);
    expect(workmanship(cap, createNewGame().employees[OWNER].attributes, TOOLS)).toBeUndefined();
  });

  it('reports a technician-specific summary that reacts to the van they take', () => {
    const engine = newEngine(42);
    const s = engine.state;
    buy(engine, 'recovery-machine', { kind: 'vehicle', id: VAN });
    const owner = s.employees[OWNER];
    const walking = performanceSummary(s, owner);
    const withVan = performanceSummary(s, owner, s.vehicles[VAN]);
    expect(withVan.avgRepairMinutes.effective).toBeLessThan(walking.avgRepairMinutes.effective);
    expect(walking.avgRepairMinutes.effective).toBeLessThan(walking.avgRepairMinutes.base); // hand tools
    const bare = summarize(owner.attributes, owner.fatigue, []);
    expect(bare.avgRepairMinutes.effective).toBe(bare.avgRepairMinutes.base);
    expect(bare.allReadingsRight.effective).toBe(bare.allReadingsRight.base);
  });
});

describe('tools on real service calls', () => {
  it('a refrigerant leak goes faster, reads better and is done better with the right equipment', () => {
    const plain = newEngine(42);
    const kitted = newEngine(42);
    for (const id of ['digital-manifold', 'leak-detector', 'charging-scale', 'micron-gauge'] as ToolId[]) buy(kitted, id, { kind: 'employee', id: OWNER });
    for (const id of ['vacuum-pump', 'recovery-machine'] as ToolId[]) buy(kitted, id, { kind: 'vehicle', id: VAN });
    const a = toRepair(plain, 'refrigerant-leak');
    const b = toRepair(kitted, 'refrigerant-leak');
    expect(a.status).toBe('repairing');
    expect(b.status).toBe('repairing');
    expect(b.toolReport!.diagMinutesSaved).toBeGreaterThan(a.toolReport!.diagMinutesSaved);
    expect(b.phaseTotal).toBeLessThan(a.phaseTotal);
    expect(b.toolReport!.repairMinutesSaved).toBeCloseTo(b.phaseTotal / repairMultiplier(faultById('refrigerant-leak'), plainDefs(kitted)) - b.phaseTotal, 6);
    // Readings taken with a tool name it on the job card.
    expect(b.evidence.find((e) => e.label === 'Leak search')!.tools).toEqual(['Electronic leak detector']);
    expect(a.evidence.find((e) => e.label === 'Leak search')!.tools).toBeUndefined();
    advanceUntil(plain, (s) => s.jobs[a.id].status === 'completed', 600);
    advanceUntil(kitted, (s) => s.jobs[b.id].status === 'completed', 600);
    expect(b.toolReport!.quality!).toBeGreaterThan(a.toolReport!.quality!);
    expect(a.toolReport!.quality).toBeCloseTo(a.toolReport!.qualityBase!, 6);
    expect(b.toolReport!.toolIds.length).toBe(8); // starter kit 2 + 4 personal + 2 on the rack
    expect(Object.values(kitted.state.tools).every((t) => t.jobsUsed === 1)).toBe(true);
    expect(reconcileCash(kitted.state).ok).toBe(true);
  });

  it('van equipment only counts when that van is at the job', () => {
    const engine = newEngine(42);
    const s = engine.state;
    buy(engine, 'recovery-machine', { kind: 'vehicle', id: VAN });
    s.finance.ledger.push({ id: 'tx-cap', day: 1, minute: 0, amount: 40000, category: 'opening-balance', memo: 'test' });
    s.finance.cash += 40000;
    expectOk(engine.dispatch({ type: 'buy-vehicle', request: { classId: 'compact-van', financing: 'cash' } }));
    const van2 = Object.keys(s.vehicles).find((k) => k !== VAN)!;
    const job = spawnLead(s, { channel: 'direct', preferredLotId: 'b-n-1', faultId: 'refrigerant-leak' })!;
    expectOk(engine.dispatch({ type: 'accept-lead', jobId: job.id }));
    expectOk(engine.dispatch({ type: 'dispatch', jobId: job.id, technicianId: OWNER, vehicleId: van2 }));
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'diagnosing', 400);
    const rec = itemOf(s, 'recovery-machine', VAN);
    expect(s.jobs[job.id].toolReport!.toolIds).not.toContain(rec);
    expect(s.jobs[job.id].toolReport!.toolIds).toHaveLength(2); // the owner's own kit only
  });

  it('keeps the dice the same: tools change odds, not the number of random draws', () => {
    const plain = newEngine(42);
    const kitted = newEngine(42);
    buy(kitted, 'clamp-meter', { kind: 'employee', id: OWNER });
    buy(kitted, 'thermal-camera', { kind: 'employee', id: OWNER });
    const draws: number[] = [];
    for (const e of [plain, kitted]) {
      const job = spawnLead(e.state, { channel: 'direct', preferredLotId: 'b-n-1', faultId: 'run-capacitor' })!;
      expectOk(e.dispatch({ type: 'accept-lead', jobId: job.id }));
      expectOk(e.dispatch({ type: 'dispatch', jobId: job.id, technicianId: OWNER, vehicleId: VAN }));
      advanceUntil(e, (st) => st.jobs[job.id].status === 'diagnosing', 400);
      // Jump to the end of the measurements and count the draws the readings take.
      e.state.jobs[job.id].phaseRemaining = 0.001;
      const before = e.state.rng.seed;
      e.advanceMinutes(0.01);
      expect(e.state.jobs[job.id].status).toBe('awaiting-diagnosis');
      draws.push(drawsBetween(before, e.state.rng.seed));
    }
    // One draw per reading, with or without tools.
    expect(draws).toEqual([3, 3]);
  });

  it('is deterministic: the same seed and loadout give the same game', () => {
    const run = () => {
      const e = newEngine(99);
      buy(e, 'digital-manifold', { kind: 'employee', id: OWNER });
      buy(e, 'vacuum-pump', { kind: 'vehicle', id: VAN });
      const j = toRepair(e, 'compressor', 'a-n-2');
      advanceUntil(e, (s) => s.jobs[j.id].status === 'completed', 900);
      e.advanceMinutes(300);
      return serialize(e.state).replace(/"savedAt":"[^"]+"/, '');
    };
    expect(run()).toBe(run());
  });

  it('leaves an ordinary electrical call unchanged for a technician without tools', () => {
    // A new hire with an empty kit runs a capacitor call exactly as the game did before equipment.
    const engine = newEngine(42);
    const s = engine.state;
    const b = hireTech(engine);
    const tech = s.employees[b];
    tech.status = 'idle';
    const job = spawnLead(s, { channel: 'direct', preferredLotId: 'b-n-1', faultId: 'run-capacitor' })!;
    expectOk(engine.dispatch({ type: 'accept-lead', jobId: job.id }));
    expectOk(engine.dispatch({ type: 'dispatch', jobId: job.id, technicianId: b, vehicleId: VAN }));
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'diagnosing', 400);
    const j = s.jobs[job.id];
    expect(j.toolReport).toEqual({ toolIds: [], diagMinutesSaved: 0, repairMinutesSaved: 0 });
    expect(j.phaseTotal).toBeCloseTo(40 * durationOf(tech), 6);
  });
});

describe('save and load', () => {
  it('keeps every tool, holder and history through save and reload, and keeps playing', () => {
    const engine = newEngine(42);
    const s = engine.state;
    const b = hireTech(engine);
    buy(engine, 'thermal-camera', { kind: 'employee', id: b });
    buy(engine, 'vacuum-pump', { kind: 'vehicle', id: VAN });
    buy(engine, 'micron-gauge');
    expectOk(engine.dispatch({ type: 'assign-tool', itemId: itemOf(s, 'multimeter', OWNER), to: { kind: 'employee', id: b } }));
    const loaded = deserialize(serialize(s));
    expect(loaded.tools).toEqual(s.tools);
    expect(balanceSheet(loaded)).toEqual(balanceSheet(s));
    expect(reconcileCash(loaded).ok).toBe(true);
  });

  it('migrates a schema-2 save: the owner gets the starter kit, books unchanged', () => {
    const s = createNewGame({ seed: 42 });
    const legacy = JSON.parse(JSON.stringify(s));
    delete legacy.tools;
    const loaded = deserialize(JSON.stringify({ schemaVersion: 2, savedAt: '', appVersion: '0.1.0', state: legacy }));
    expect(loaded.schemaVersion).toBe(3);
    expect(toolsHeldBy(loaded, { kind: 'employee', id: OWNER }).map((t) => t.defId).sort()).toEqual([...STARTER_KIT].sort());
    expect(balanceSheet(loaded).equity).toBe(balanceSheet(s).equity);
    expect(loaded.finance.ledger).toEqual(s.finance.ledger);
  });

  it('repairs a tool held by someone who no longer exists', () => {
    const s = createNewGame({ seed: 42 });
    const t = Object.values(s.tools)[0];
    t.holder = { kind: 'employee', id: 'emp-gone' };
    const loaded = deserialize(serialize(s));
    expect(loaded.tools[t.id].holder).toEqual({ kind: 'inventory' });
  });
});

function plainDefs(engine: GameEngine) {
  const s = engine.state;
  const ids = new Set(Object.values(s.tools).map((t) => t.defId));
  return TOOLS.filter((d) => ids.has(d.id));
}

/** mulberry32 adds a fixed increment per draw, so the number of draws between two states is exact. */
function drawsBetween(before: number, after: number): number {
  const M = 2n ** 32n;
  const inc = 0x6d2b79f5n;
  // Modular inverse of the increment (odd, so it exists modulo 2^32).
  let inv = 1n;
  for (let i = 0; i < 5; i++) inv = (inv * (2n - ((inc * inv) % M) + M)) % M;
  const diff = ((BigInt(after) - BigInt(before)) % M + M) % M;
  return Number((diff * inv) % M);
}

function durationOf(e: GameState['employees'][string]): number {
  return durationMultiplier(e.attributes, e.fatigue);
}
