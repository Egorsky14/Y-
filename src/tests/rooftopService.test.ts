import { describe, expect, it } from 'vitest';
import { advanceUntil, expectOk, newEngine } from './helpers';
import type { GameEngine } from '@/game/simulation/engine';
import type { GameState, Job } from '@/game/simulation/types';
import { SAVE_SCHEMA_VERSION } from '@/game/simulation/types';
import { spawnLead } from '@/game/jobs/leads';
import { reconcileCash } from '@/game/economy/ledger';
import { BALANCE } from '@/game/simulation/newGame';
import { HOUSE_LOTS } from '@/game/world/cityLayout';
import { accessFor, equipmentPlacement, ladderLength, roofAccess, roofSpec, ROOF_LADDER, servicedUnit } from '@/game/world/rooftops';
import { deserialize, serialize } from '@/persistence/save';
import { jobWorkSpot } from '@/game/jobs/workflow';

/**
 * Rooftop service in the simulation: which systems are on a roof, which roofs a technician may reach and
 * with what, the extra access and pack-up phases, and that none of it changes the money (one fee, one
 * repair, one parts entry), survives save/load mid-phase, and is identical however time is advanced.
 */

const OWNER = 'emp-owner';
const VAN = 'veh-1';
const PLAZA = 'cm-plaza';

function rooftopCall(engine: GameEngine, lotId = PLAZA): Job {
  const s = engine.state;
  for (const j of Object.values(s.jobs)) if (j.status === 'lead') engine.dispatch({ type: 'decline-lead', jobId: j.id });
  const job = spawnLead(s, { channel: 'direct', preferredLotId: lotId, faultId: 'contactor' })!;
  s.customers[job.customerId].trust = 100;
  expectOk(engine.dispatch({ type: 'accept-lead', jobId: job.id }));
  expectOk(engine.dispatch({ type: 'dispatch', jobId: job.id, technicianId: OWNER, vehicleId: VAN }));
  return s.jobs[job.id];
}

/** Diagnose correctly and get a repair approved (direct customers may decline: retry the quote at the lowest price). */
function approveRepair(engine: GameEngine, jobId: string): void {
  const s = engine.state;
  advanceUntil(engine, (st) => st.jobs[jobId].status === 'awaiting-diagnosis');
  expectOk(engine.dispatch({ type: 'choose-diagnosis', jobId, faultId: s.jobs[jobId].faultId }));
  expectOk(engine.dispatch({ type: 'submit-quote', jobId, quote: { recommendation: 'repair', priceAdjust: 0.8 } }));
}

const ledgerFor = (s: GameState, jobId: string) => s.finance.ledger.filter((e) => e.jobId === jobId);

describe('rooftop equipment placement', () => {
  it('puts packaged units on flat roofs with a unit spot, and keeps split systems on the ground', () => {
    const s = newEngine().state;
    expect(equipmentPlacement(s.customers['cust-cm-plaza'])).toBe('roof');
    expect(equipmentPlacement(s.customers['cust-cm-office'])).toBe('roof');
    for (const lot of HOUSE_LOTS) {
      const c = s.customers[`cust-${lot.id}`];
      // Modern homes are built round a rooftop package unit; every other home keeps its ground equipment.
      expect(equipmentPlacement(c), lot.id).toBe(lot.style === 'modern' ? 'roof' : 'ground');
      expect(c.equipment.type === 'package-unit' || lot.style !== 'modern', lot.id).toBe(true);
    }
    // A packaged unit on a pitched-roof home stays on the ground.
    const ranch = HOUSE_LOTS.find((l) => l.style === 'ranch')!;
    expect(equipmentPlacement({ lotId: ranch.id, equipment: { ...s.customers[`cust-${ranch.id}`].equipment, type: 'package-unit' } })).toBe('ground');
  });

  it('defines a reachable access point and a serviced unit on the plaza and the modern homes, none on the office', () => {
    const plaza = roofSpec(PLAZA)!;
    expect(accessFor(plaza)).not.toBeNull();
    expect(ladderLength(accessFor(plaza)!)).toBeLessThanOrEqual(ROOF_LADDER.maxLength);
    expect(servicedUnit(plaza)?.kind).toBe('rtu');
    for (const lot of HOUSE_LOTS.filter((l) => l.style === 'modern')) {
      const spec = roofSpec(lot.id)!;
      expect(accessFor(spec), lot.id).not.toBeNull();
      expect(servicedUnit(spec)?.kind).toBe('rtu-res');
      // The work spot is on the deck, clear of the unit.
      const u = servicedUnit(spec)!;
      expect(u.workSpot.x >= spec.deck.x0 - 0.01 && u.workSpot.x <= spec.deck.x1 + 0.01 && u.workSpot.z >= spec.deck.z0 - 0.01 && u.workSpot.z <= spec.deck.z1 + 0.01, lot.id).toBe(true);
    }
    expect(accessFor(roofSpec('cm-office')!)).toBeNull();
  });
});

describe('roof access eligibility', () => {
  it('blocks the office roof with a reason: the lead cannot be accepted and expires normally', () => {
    const engine = newEngine();
    const s = engine.state;
    const job = spawnLead(s, { preferredLotId: 'cm-office', channel: 'direct' })!;
    const access = roofAccess(s, job);
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.reason).toBe('unsupported-roof');
    const r = engine.dispatch({ type: 'accept-lead', jobId: job.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Roof access unavailable/);
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'expired', BALANCE.leadLifetimeMinutes + 30, 5);
    // No Owner Attention item, no retry loop.
    expect(s.jobs[job.id].attention).toBeUndefined();
  });

  it('refuses to send a vehicle without a ladder rack, and accepts one that has it', () => {
    const engine = newEngine();
    const s = engine.state;
    const job = spawnLead(s, { preferredLotId: PLAZA, channel: 'direct' })!;
    expectOk(engine.dispatch({ type: 'accept-lead', jobId: job.id }));
    s.vehicles[VAN].upgrades = s.vehicles[VAN].upgrades.filter((u) => u !== 'ladder-rack');
    const r = engine.dispatch({ type: 'dispatch', jobId: job.id, technicianId: OWNER, vehicleId: VAN });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no ladder rack/);
    expect(s.jobs[job.id].status).toBe('accepted');
    expect(s.vehicles[VAN].status).toBe('parked');
    s.vehicles[VAN].upgrades.push('ladder-rack');
    expectOk(engine.dispatch({ type: 'dispatch', jobId: job.id, technicianId: OWNER, vehicleId: VAN }));
  });
});

describe('a rooftop repair call', () => {
  it('takes the access phase, works at the rooftop unit, books the money once and packs up before leaving', () => {
    const engine = newEngine();
    const s = engine.state;
    const cashBefore = s.finance.cash;
    const job = rooftopCall(engine);
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'arriving');
    expect(s.jobs[job.id].phaseTotal).toBe(roofSpec(PLAZA)!.accessMinutes);
    // The technician ends the access phase at the rooftop unit's work spot (on the roof).
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'diagnosing');
    const spot = jobWorkSpot(s, s.jobs[job.id], 0);
    expect(spot).toEqual(servicedUnit(roofSpec(PLAZA)!)!.workSpot);
    expect(Math.hypot(s.employees[OWNER].position.x - spot.x, s.employees[OWNER].position.z - spot.z)).toBeLessThan(0.01);
    approveRepair(engine, job.id);
    // A rooftop package unit is not replaced up a ladder.
    expect(s.jobs[job.id].status === 'repairing' || s.jobs[job.id].status === 'completed').toBe(true);
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'completed');
    const v = s.vehicles[VAN];
    // Closed and paid, but the crew is still on site stowing the ladder.
    expect(v.status).toBe('onsite');
    expect(v.packUp?.jobId).toBe(job.id);
    expect(s.employees[OWNER].jobId).toBe(job.id);
    const entries = ledgerFor(s, job.id);
    advanceUntil(engine, () => !s.vehicles[VAN].packUp, roofSpec(PLAZA)!.packUpMinutes + 1);
    expect(['returning', 'parked']).toContain(s.vehicles[VAN].status);
    expect(s.employees[OWNER].jobId).toBeUndefined();
    // Nothing more booked by the pack-up; one fee, one repair, one parts entry.
    expect(ledgerFor(s, job.id)).toEqual(entries);
    expect(entries.filter((e) => e.memo.startsWith('Diagnostic fee'))).toHaveLength(1);
    expect(entries.filter((e) => e.memo.startsWith('Repair'))).toHaveLength(1);
    expect(entries.filter((e) => e.category === 'parts')).toHaveLength(1);
    expect(reconcileCash(s).ok).toBe(true);
    expect(s.finance.cash).not.toBe(cashBefore);
    advanceUntil(engine, () => s.vehicles[VAN].status === 'parked');
    expect(s.employees[OWNER].status).toBe('idle');
  });

  it('refuses a replacement quote for a rooftop package unit (crane lift not offered)', () => {
    const engine = newEngine();
    const job = rooftopCall(engine);
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'awaiting-diagnosis');
    expectOk(engine.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: job.faultId }));
    const r = engine.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'replace', equipmentTierId: 'standard' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/crane/);
    expect(engine.state.jobs[job.id].status).toBe('quoted');
  });

  it('works on a modern home: the residential rooftop unit and its west-side ladder', () => {
    const engine = newEngine();
    const lot = HOUSE_LOTS.find((l) => l.style === 'modern')!;
    const job = rooftopCall(engine, lot.id);
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'diagnosing');
    expect(engine.state.jobs[job.id].phaseTotal).toBeGreaterThan(0);
    expect(jobWorkSpot(engine.state, engine.state.jobs[job.id], 0)).toEqual(servicedUnit(roofSpec(lot.id)!)!.workSpot);
  });

  it('a ground call is unchanged: no access phase, no pack-up', () => {
    const engine = newEngine();
    const lot = HOUSE_LOTS.find((l) => l.style === 'ranch')!;
    const job = rooftopCall(engine, lot.id);
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'arriving');
    expect(engine.state.jobs[job.id].phaseTotal).toBe(BALANCE.arrivalWalkMinutes);
    approveRepair(engine, job.id);
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'completed');
    expect(engine.state.vehicles[VAN].packUp).toBeUndefined();
    expect(engine.state.vehicles[VAN].status).not.toBe('onsite');
  });
});

describe('rooftop persistence and time', () => {
  /** Runs one rooftop call to the van parking at HQ, saving and loading at the given checkpoints. */
  function run(saveAt: ((s: GameState) => boolean)[], step = 0.5): { cash: number; ledger: number; status: string; log: number } {
    let engine = newEngine(7);
    const job = rooftopCall(engine);
    const pending = [...saveAt];
    let guard = 0;
    while (engine.state.vehicles[VAN].status !== 'parked' || engine.state.jobs[job.id].status !== 'completed') {
      if (pending.length && pending[0](engine.state)) {
        pending.shift();
        const json = serialize(engine.state);
        engine = newEngine(1);
        engine.replace(deserialize(json));
      }
      const st = engine.state.jobs[job.id].status;
      if (st === 'awaiting-diagnosis') engine.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: engine.state.jobs[job.id].faultId });
      if (st === 'quoted') engine.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
      engine.advanceMinutes(step);
      if (++guard > 20000) throw new Error('call never finished');
    }
    const s = engine.state;
    return { cash: s.finance.cash, ledger: s.finance.ledger.length, status: s.jobs[job.id].status, log: s.jobs[job.id].log.length };
  }

  it('saving and loading mid-climb, mid-diagnosis and mid-pack-up changes nothing', () => {
    const straight = run([]);
    const resumed = run([
      (s) => Object.values(s.jobs).some((j) => j.status === 'arriving' && j.phaseRemaining < j.phaseTotal / 2),
      (s) => Object.values(s.jobs).some((j) => j.status === 'diagnosing'),
      (s) => !!s.vehicles[VAN].packUp && s.vehicles[VAN].packUp.remaining < s.vehicles[VAN].packUp.total / 2,
    ]);
    expect(resumed).toEqual(straight);
  });

  it('the outcome is the same whether time advances in half-minute or five-minute chunks', () => {
    expect(run([], 5)).toEqual(run([], 0.5));
  });

  it('an older (schema 4) campaign loads: the commercial customers join, existing customers keep their equipment', () => {
    const engine = newEngine(3);
    const s = engine.state;
    const before = structuredClone(s.customers);
    delete s.customers['cust-cm-plaza'];
    delete s.customers['cust-cm-office'];
    const json = JSON.stringify({ schemaVersion: 4, savedAt: 0, state: { ...s, schemaVersion: 4 } });
    const loaded = deserialize(json);
    expect(loaded.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.customers['cust-cm-plaza']).toEqual(before['cust-cm-plaza']);
    for (const id of Object.keys(before)) expect(loaded.customers[id].equipment, id).toEqual(before[id].equipment);
  });
});
