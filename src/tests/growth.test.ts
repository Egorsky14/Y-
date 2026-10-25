import { describe, expect, it } from 'vitest';
import { advanceUntil, expectOk, newEngine } from './helpers';
import { reconcileCash } from '@/game/economy/ledger';
import { durationMultiplier, measurementAccuracy } from '@/game/employees/attributes';
import { vehicleCapacity } from '@/game/fleet/fleet';
import { spawnLead } from '@/game/jobs/leads';
import { serialize, deserialize } from '@/persistence/save';
import { GameEngine } from '@/game/simulation/engine';

describe('employees and fleet', () => {
  it('hiring a technician and buying a second van doubles concurrent dispatch capacity', () => {
    const engine = newEngine(11);
    const s = engine.state;
    const tech = s.candidates.find((c) => c.role === 'technician')!;
    expectOk(engine.dispatch({ type: 'hire', candidateId: tech.id }));
    const hired = Object.values(s.employees).find((e) => !e.isOwner)!;
    expect(hired.role).toBe('technician');
    expect(Object.keys(s.vehicles).length).toBeLessThan(vehicleCapacity(s));
    expectOk(engine.dispatch({ type: 'buy-vehicle', request: { classId: 'compact-van', listingId: s.usedListings.find((l) => l.classId === 'compact-van')?.id, financing: 'loan' } }));
    expect(Object.keys(s.vehicles).length).toBe(2);
    const second = Object.values(s.vehicles).find((v) => v.id !== 'veh-1')!;
    expect(second.stall).not.toBe(s.vehicles['veh-1'].stall);

    const a = spawnLead(s, { channel: 'direct', preferredLotId: 'a-n-1', faultId: 'run-capacitor' })!;
    const b = spawnLead(s, { channel: 'direct', preferredLotId: 'c-s-3', faultId: 'thermostat' })!;
    engine.dispatch({ type: 'accept-lead', jobId: a.id });
    engine.dispatch({ type: 'accept-lead', jobId: b.id });
    expectOk(engine.dispatch({ type: 'dispatch', jobId: a.id, technicianId: 'emp-owner', vehicleId: 'veh-1' }));
    expectOk(engine.dispatch({ type: 'dispatch', jobId: b.id, technicianId: hired.id, vehicleId: second.id }));
    expect(s.vehicles['veh-1'].status).toBe('enroute');
    expect(second.status).toBe('enroute');
    advanceUntil(engine, (st) => st.jobs[a.id].status === 'awaiting-diagnosis' && st.jobs[b.id].status === 'awaiting-diagnosis', 300);
    expect(reconcileCash(s).ok).toBe(true);
  });

  it('cannot exceed vehicle capacity', () => {
    const engine = newEngine(11);
    expectOk(engine.dispatch({ type: 'buy-vehicle', request: { classId: 'pickup', financing: 'loan' } }));
    const r = engine.dispatch({ type: 'buy-vehicle', request: { classId: 'pickup', financing: 'loan' } });
    expect(r.ok).toBe(false);
  });

  it('training produces measurable, persistent improvement', () => {
    const engine = newEngine(11);
    const s = engine.state;
    const owner = s.employees['emp-owner'];
    const accBefore = measurementAccuracy(owner.attributes, 0);
    const durBefore = durationMultiplier(owner.attributes, 0);
    const cashBefore = s.finance.cash;
    expectOk(engine.dispatch({ type: 'train', employeeId: owner.id, programId: 'advanced-troubleshooting' }));
    expect(owner.status).toBe('training');
    expect(s.finance.cash).toBe(cashBefore - 1500);
    // Training employees cannot be dispatched.
    const lead = spawnLead(s, { channel: 'direct', preferredLotId: 'a-n-1' })!;
    engine.dispatch({ type: 'accept-lead', jobId: lead.id });
    expect(engine.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: owner.id, vehicleId: 'veh-1' }).ok).toBe(false);
    advanceUntil(engine, (st) => !st.employees['emp-owner'].training, 1440 * 4);
    expect(measurementAccuracy(owner.attributes, 0)).toBeGreaterThan(accBefore);
    expect(durationMultiplier(owner.attributes, 0)).toBeLessThan(durBefore);
    expect(owner.status).toBe('idle');
  });

  it('save/load round-trips the full state and continues deterministically', () => {
    const engine = newEngine(5);
    engine.dispatch({ type: 'hire', candidateId: engine.state.candidates[0].id });
    engine.advanceMinutes(300);
    const json = serialize(engine.state);
    const loaded = deserialize(json);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(engine.state));
    const a = new GameEngine(loaded);
    const b = engine;
    a.advanceMinutes(500);
    b.advanceMinutes(500);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('vehicle purchase with a loan posts the down payment and creates a liability', () => {
    const engine = newEngine(5);
    const s = engine.state;
    const cash = s.finance.cash;
    expectOk(engine.dispatch({ type: 'buy-vehicle', request: { classId: 'full-size-van', financing: 'loan' } }));
    expect(s.finance.cash).toBe(cash - Math.round(52000 * 0.15));
    expect(s.finance.loans.length).toBe(1);
    expect(s.finance.loans[0].balance).toBe(52000 - Math.round(52000 * 0.15));
    expect(reconcileCash(s).ok).toBe(true);
  });
});
