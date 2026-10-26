import { describe, expect, it } from 'vitest';
import { newEngine } from './helpers';
import { FINANCING_CATEGORIES, reconcileCash, openReceivablesTotal } from '@/game/economy/ledger';
import type { GameEngine } from '@/game/simulation/engine';

/** A simple autopilot that plays like a reasonable owner. */
function autopilot(engine: GameEngine): void {
  const s = engine.state;
  for (const job of Object.values(s.jobs)) {
    if (job.status === 'lead') engine.dispatch({ type: 'accept-lead', jobId: job.id });
  }
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
      // Pick the diagnosis with the most "accurate-looking" evidence: use the true fault 70% deterministically via options order.
      const guess = job.diagnosisOptions[0];
      engine.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: guess });
      engine.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair' } });
    }
  }
  if (s.clock.day === 5 && s.finance.cash > 12000 && Object.keys(s.employees).length < 2) {
    const c = s.candidates.find((x) => x.role === 'technician');
    if (c) engine.dispatch({ type: 'hire', candidateId: c.id });
  }
  if (s.clock.day === 8 && Object.keys(s.vehicles).length < 2) {
    engine.dispatch({ type: 'buy-vehicle', request: { classId: 'compact-van', listingId: s.usedListings.find((l) => l.classId === 'compact-van')?.id, financing: 'loan' } });
  }
  if (s.clock.day === 10) engine.dispatch({ type: 'set-marketing', channel: 'localServicesAds', dailyBudget: 120 });
}

describe('90-day campaign', () => {
  it('runs to completion with reconciled books', () => {
    const engine = newEngine(2026);
    let guard = 0;
    while (!engine.state.campaignComplete && guard < 90 * 24 * 4 + 100) {
      autopilot(engine);
      engine.advanceMinutes(15);
      guard++;
      if (guard % 96 === 0) {
        const rec = reconcileCash(engine.state);
        if (!rec.ok) throw new Error(`Ledger drift on day ${engine.state.clock.day}: ${JSON.stringify(rec)}`);
      }
    }
    expect(reconcileCash(engine.state).ok).toBe(true);
    const s = engine.state;
    expect(s.campaignComplete).toBe(true);
    expect(s.clock.day).toBe(91);
    expect(s.finance.history.length).toBe(90);
    expect(s.stats.jobsCompleted).toBeGreaterThan(20);
    expect(s.stats.totalRevenue).toBeGreaterThan(10000);
    // Revenue and expenses tie out to the ledger. Financing (borrowed money in, principal repaid
    // out) moves cash but is neither revenue nor expense.
    const operating = s.finance.ledger.filter((e) => !FINANCING_CATEGORIES.has(e.category));
    const revenue = operating.filter((e) => e.amount > 0 && e.category !== 'opening-balance').reduce((a, e) => a + e.amount, 0);
    const expenses = operating.filter((e) => e.amount < 0).reduce((a, e) => a - e.amount, 0);
    expect(Math.abs(revenue - s.stats.totalRevenue)).toBeLessThan(0.01);
    expect(Math.abs(expenses - s.stats.totalExpenses)).toBeLessThan(0.01);
    expect(openReceivablesTotal(s)).toBeGreaterThanOrEqual(0);
    // Nothing is stuck: no vehicle still enroute without a route, no employee assigned to a missing job.
    for (const v of Object.values(s.vehicles)) if (v.status === 'enroute' || v.status === 'returning') expect(v.route).toBeDefined();
    for (const e of Object.values(s.employees)) if (e.jobId) expect(s.jobs[e.jobId]).toBeDefined();
    // Every completed job that collected revenue has matching ledger entries.
    for (const job of Object.values(s.jobs)) {
      if (job.status !== 'completed') continue;
      const posted = s.finance.ledger.filter((e) => e.jobId === job.id && e.amount > 0).reduce((a, e) => a + e.amount, 0);
      const collectedReceivable = s.finance.receivables.filter((r) => r.jobId === job.id && r.status === 'paid').reduce((a, r) => a + r.amount, 0);
      expect(Math.abs(posted - job.financials.revenueCollected - collectedReceivable)).toBeLessThan(0.01);
    }
  }, 120_000);
});
