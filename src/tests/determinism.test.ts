import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/simulation/engine';
import { advanceUntil, expectOk, firstLead, newEngine } from './helpers';

function playScript(engine: GameEngine): void {
  const lead = firstLead(engine.state);
  expectOk(engine.dispatch({ type: 'accept-lead', jobId: lead.id }));
  expectOk(engine.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' }));
  advanceUntil(engine, (s) => s.jobs[lead.id].status === 'awaiting-diagnosis');
  expectOk(engine.dispatch({ type: 'choose-diagnosis', jobId: lead.id, faultId: engine.state.jobs[lead.id].faultId }));
  expectOk(engine.dispatch({ type: 'submit-quote', jobId: lead.id, quote: { recommendation: 'repair' } }));
  advanceUntil(engine, (s) => s.jobs[lead.id].status === 'completed');
  engine.advanceMinutes(600);
}

describe('determinism', () => {
  it('produces identical state for the same seed and actions', () => {
    const a = newEngine(7);
    const b = newEngine(7);
    playScript(a);
    playScript(b);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('produces different worlds for different seeds', () => {
    const a = newEngine(1);
    const b = newEngine(2);
    expect(JSON.stringify(a.state.customers)).not.toBe(JSON.stringify(b.state.customers));
  });

  it('is independent of step size', () => {
    const a = newEngine(9);
    const b = newEngine(9);
    for (let i = 0; i < 100; i++) a.advanceMinutes(1);
    b.advanceMinutes(100);
    expect(a.state.clock.minute).toBeCloseTo(b.state.clock.minute, 6);
    expect(Object.keys(a.state.jobs).sort()).toEqual(Object.keys(b.state.jobs).sort());
  });
});
