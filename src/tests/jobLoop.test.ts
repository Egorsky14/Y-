import { describe, expect, it } from 'vitest';
import { advanceUntil, expectOk, firstLead, newEngine } from './helpers';
import { reconcileCash } from '@/game/economy/ledger';
import { faultById } from '@/game/jobs/faults';
import { condenserPosition, lotById } from '@/game/world/cityLayout';
import { etaMinutes } from '@/game/fleet/fleet';
import { spawnLead } from '@/game/jobs/leads';

describe('vertical slice job loop', () => {
  it('drives the van along the road, diagnoses, repairs, collects payment, and returns home', () => {
    const engine = newEngine(42);
    const state = engine.state;
    const lead = firstLead(state);
    const customer = state.customers[lead.customerId];
    expect(customer.channel).toBe('direct');
    const startCash = state.finance.cash;

    expectOk(engine.dispatch({ type: 'accept-lead', jobId: lead.id }));
    expect(state.jobs[lead.id].status).toBe('accepted');

    // Cannot dispatch a non-technician or an unavailable vehicle.
    expectOk(engine.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' }));
    const van = state.vehicles['veh-1'];
    expect(van.status).toBe('enroute');
    expect(van.route).toBeDefined();
    const eta = etaMinutes(van);
    expect(eta).toBeGreaterThan(5);
    expect(eta).toBeLessThan(60);
    expect(state.employees['emp-owner'].status).toBe('driving');

    // Second dispatch of the same vehicle must fail.
    const second = engine.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    expect(second.ok).toBe(false);

    // Vehicle moves and eventually arrives near the curb.
    const before = { ...van.position };
    engine.advanceMinutes(2);
    expect(Math.hypot(van.position.x - before.x, van.position.z - before.z)).toBeGreaterThan(5);
    const travel = advanceUntil(engine, (s) => s.vehicles['veh-1'].status === 'onsite', 200);
    expect(Math.abs(travel - eta)).toBeLessThan(3);
    const curb = lotById(customer.lotId)!.curb;
    expect(Math.hypot(van.position.x - curb.x, van.position.z - curb.z)).toBeLessThan(4);

    // Technician walks to the condenser and diagnoses.
    advanceUntil(engine, (s) => s.jobs[lead.id].status === 'diagnosing', 10);
    const tech = state.employees['emp-owner'];
    const unit = condenserPosition(lotById(customer.lotId)!);
    expect(Math.hypot(tech.position.x - unit.x, tech.position.z - unit.z)).toBeLessThan(3);
    expect(tech.status).toBe('working');

    advanceUntil(engine, (s) => s.jobs[lead.id].status === 'awaiting-diagnosis', 120);
    const job = state.jobs[lead.id];
    expect(job.evidence.length).toBe(3);
    expect(job.diagnosisOptions).toContain(job.faultId);

    // Choose the right diagnosis and quote the repair.
    expectOk(engine.dispatch({ type: 'choose-diagnosis', jobId: lead.id, faultId: job.faultId }));
    expect(job.diagnosisCorrect).toBe(true);
    expectOk(engine.dispatch({ type: 'submit-quote', jobId: lead.id, quote: { recommendation: 'repair' } }));
    expect(['repairing', 'completed']).toContain(job.status);

    advanceUntil(engine, (s) => s.jobs[lead.id].status === 'completed', 400);
    const fault = faultById(job.faultId);
    if (job.financials.quoteAmount > 0) {
      expect(job.financials.revenueCollected).toBe(state.company.diagnosticFee + fault.repairPrice);
    } else {
      expect(job.financials.revenueCollected).toBe(state.company.diagnosticFee);
    }
    expect(state.finance.cash).toBeGreaterThan(startCash);
    expect(reconcileCash(state).ok).toBe(true);

    // Van returns and parks; tech becomes idle.
    expect(van.status).toBe('returning');
    advanceUntil(engine, (s) => s.vehicles['veh-1'].status === 'parked', 200);
    expect(tech.status).toBe('idle');
    expect(tech.jobId).toBeUndefined();
    expect(van.jobId).toBeUndefined();
    expect(tech.xp).toBeGreaterThan(0);
  });

  it('pausing freezes vehicles and job phases', () => {
    const engine = newEngine(42);
    const lead = firstLead(engine.state);
    expectOk(engine.dispatch({ type: 'accept-lead', jobId: lead.id }));
    expectOk(engine.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' }));
    engine.dispatch({ type: 'set-speed', speed: 0 });
    const before = { ...engine.state.vehicles['veh-1'].position };
    engine.tick(5);
    expect(engine.state.vehicles['veh-1'].position).toEqual(before);
    engine.dispatch({ type: 'set-speed', speed: 5 });
    engine.tick(1);
    expect(engine.state.vehicles['veh-1'].position).not.toEqual(before);
  });

  it('speed multipliers scale travelled distance proportionally', () => {
    const a = newEngine(42);
    const b = newEngine(42);
    for (const e of [a, b]) {
      const lead = firstLead(e.state);
      e.dispatch({ type: 'accept-lead', jobId: lead.id });
      e.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    }
    a.dispatch({ type: 'set-speed', speed: 1 });
    b.dispatch({ type: 'set-speed', speed: 5 });
    a.tick(2);
    b.tick(0.4);
    expect(a.state.vehicles['veh-1'].route!.progress).toBeCloseTo(b.state.vehicles['veh-1'].route!.progress, 6);
  });

  it('wrong diagnosis schedules a callback and lowers trust', () => {
    const engine = newEngine(42);
    const lead = firstLead(engine.state);
    const customer = engine.state.customers[lead.customerId];
    const trustBefore = customer.trust;
    engine.dispatch({ type: 'accept-lead', jobId: lead.id });
    engine.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    advanceUntil(engine, (s) => s.jobs[lead.id].status === 'awaiting-diagnosis');
    const wrong = engine.state.jobs[lead.id].diagnosisOptions.find((f) => f !== lead.faultId)!;
    expectOk(engine.dispatch({ type: 'choose-diagnosis', jobId: lead.id, faultId: wrong }));
    expect(engine.state.jobs[lead.id].diagnosisCorrect).toBe(false);
    expectOk(engine.dispatch({ type: 'submit-quote', jobId: lead.id, quote: { recommendation: 'repair' } }));
    advanceUntil(engine, (s) => s.jobs[lead.id].status === 'completed', 400);
    expect(customer.trust).toBeLessThan(trustBefore);
    expect(engine.state.stats.incorrectDiagnoses).toBe(1);
  });

  it('warranty jobs create receivables instead of cash', () => {
    const engine = newEngine(42);
    // Force a warranty lead for a specific lot.
    const job = spawnLead(engine.state, { channel: 'warranty', preferredLotId: 'b-n-1', faultId: 'contactor' })!;
    const cashBefore = engine.state.finance.cash;
    engine.dispatch({ type: 'accept-lead', jobId: job.id });
    expectOk(engine.dispatch({ type: 'dispatch', jobId: job.id, technicianId: 'emp-owner', vehicleId: 'veh-1' }));
    advanceUntil(engine, (s) => s.jobs[job.id].status === 'awaiting-diagnosis');
    engine.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: 'contactor' });
    expectOk(engine.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair' } }));
    expect(engine.state.jobs[job.id].status).toBe('awaiting-authorization');
    advanceUntil(engine, (s) => s.jobs[job.id].status === 'completed', 600);
    const receivables = engine.state.finance.receivables.filter((r) => r.jobId === job.id);
    expect(receivables.length).toBe(1);
    expect(receivables[0].amount).toBeGreaterThan(0);
    // Only parts were paid in cash.
    expect(engine.state.finance.cash).toBeLessThanOrEqual(cashBefore);
    expect(reconcileCash(engine.state).ok).toBe(true);
  });
});
