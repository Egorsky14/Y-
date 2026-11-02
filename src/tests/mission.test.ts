import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/simulation/engine';
import { SAVE_SCHEMA_VERSION, type GameState, type Job } from '@/game/simulation/types';
import { MISSION_DEPART_DISTANCE, ROOFTOP_RESCUE, missionStage } from '@/game/progression/mission';
import { faultById } from '@/game/jobs/faults';
import { reconcileCash } from '@/game/economy/ledger';
import { equipmentPlacement, roofAccess, roofSpec, vehicleHasLadder } from '@/game/world/rooftops';
import { deserialize, serialize } from '@/persistence/save';
import { spawnLead } from '@/game/jobs/leads';
import { advanceUntil, expectOk, newEngine } from './helpers';
import { BALANCE } from '@/game/simulation/newGame';

/**
 * Mission 01 in the simulation: what a brand-new campaign offers, that each step runs through the real job workflow
 * and its rules, that the money is booked once and reported truthfully, and that older campaigns are left alone.
 * (The browser side, with the real ladder choreography on screen, is e2e/rooftop-mission.spec.ts.)
 */

const OWNER = 'emp-owner';
const VAN = 'veh-1';

const fresh = (seed = 42) => GameEngine.newGame({ seed });
const missionJobOf = (e: GameEngine): Job => e.state.jobs[e.state.mission!.jobId];
const ledgerFor = (s: GameState, jobId: string) => s.finance.ledger.filter((l) => l.jobId === jobId);

function dispatched(e: GameEngine): Job {
  const job = missionJobOf(e);
  expectOk(e.dispatch({ type: 'accept-lead', jobId: job.id }));
  expectOk(e.dispatch({ type: 'dispatch', jobId: job.id, technicianId: OWNER, vehicleId: VAN }));
  return e.state.jobs[job.id];
}

function toFindings(e: GameEngine): Job {
  const job = dispatched(e);
  advanceUntil(e, (s) => s.jobs[job.id].status === 'awaiting-diagnosis');
  return e.state.jobs[job.id];
}

function toRepair(e: GameEngine, priceAdjust = 1): Job {
  const job = toFindings(e);
  expectOk(e.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: job.faultId }));
  expectOk(e.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair', priceAdjust } }));
  advanceUntil(e, (s) => s.jobs[job.id].status === 'repairing');
  return e.state.jobs[job.id];
}

function complete(e: GameEngine): Job {
  const job = toRepair(e);
  advanceUntil(e, (s) => s.mission!.status === 'completed');
  return e.state.jobs[job.id];
}

describe('a new campaign opens with Rooftop Rescue', () => {
  it('offers the mission call at Mesquite Plaza, and only that call, on every seed', () => {
    for (const seed of [1, 42, 777, 20260101, 999_999]) {
      const s = fresh(seed).state;
      const leads = Object.values(s.jobs);
      expect(leads, `seed ${seed}`).toHaveLength(1);
      const job = leads[0];
      expect(s.mission).toMatchObject({ id: 'rooftop-rescue', jobId: job.id, status: 'active' });
      expect(job.status).toBe('lead');
      expect(job.customerId).toBe('cust-cm-plaza');
      expect(s.customers[job.customerId].lotId).toBe('cm-plaza');
      expect(job.faultId).toBe(ROOFTOP_RESCUE.faultId);
      expect(job.complaint).toBe(ROOFTOP_RESCUE.complaint);
      expect(missionStage(s)).toBe(1);
    }
  });

  it('starts with a really eligible crew, van, roof and fault, with no free equipment added', () => {
    const e = fresh();
    const s = e.state;
    const job = missionJobOf(e);
    const owner = s.employees[OWNER];
    const van = s.vehicles[VAN];
    expect(owner.role).toBe('technician');
    expect(owner.status).toBe('idle');
    expect(Object.keys(s.employees)).toEqual([OWNER]);
    expect(Object.keys(s.vehicles)).toEqual([VAN]);
    expect(van.status).toBe('parked');
    expect(vehicleHasLadder(van)).toBe(true);
    expect(equipmentPlacement(s.customers[job.customerId])).toBe('roof');
    expect(roofAccess(s, job, van).ok).toBe(true);
    expect(s.finance.cash).toBe(BALANCE.startingCash);
    expect(faultById(job.faultId).partsCost).toBeLessThan(s.finance.cash);
    // Same starter loadout as a campaign without the mission.
    const plain = newEngine(42).state;
    expect(van.upgrades).toEqual(plain.vehicles[VAN].upgrades);
    expect(Object.keys(s.tools).sort()).toEqual(Object.keys(plain.tools).sort());
  });

  it('still enforces the ladder rule: the same van without its rack is refused', () => {
    const e = fresh();
    const job = missionJobOf(e);
    expectOk(e.dispatch({ type: 'accept-lead', jobId: job.id }));
    e.state.vehicles[VAN].upgrades = e.state.vehicles[VAN].upgrades.filter((u) => u !== 'ladder-rack');
    const r = e.dispatch({ type: 'dispatch', jobId: job.id, technicianId: OWNER, vehicleId: VAN });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ladder rack/);
  });

  it('is deterministic for a seed, and draws the same randomness as any other opening', () => {
    expect(JSON.stringify(fresh(7).state)).toBe(JSON.stringify(fresh(7).state));
    const a = fresh(7).state;
    const b = newEngine(7).state;
    expect(a.rng).toEqual(b.rng);
    expect(a.leadSchedule).toEqual(b.leadSchedule);
  });

  it('holds other leads back and never lets the mission call expire while the player looks around', () => {
    const e = fresh();
    const job = missionJobOf(e);
    expect(e.state.leadSchedule.length).toBeGreaterThan(0);
    e.advanceMinutes(3 * 1440);
    expect(Object.keys(e.state.jobs)).toEqual([job.id]);
    expect(e.state.jobs[job.id].status).toBe('lead');
    expect(e.state.stats.leadsExpired).toBe(0);
    expect(e.state.stats.leadsLost).toBe(0);
  });
});

describe('the objectives follow the real job', () => {
  it('walks through objectives 1 to 8 as the job and the van really progress', () => {
    const e = fresh();
    const job = missionJobOf(e);
    const seen: number[] = [missionStage(e.state)!];
    const see = () => {
      const stage = missionStage(e.state)!;
      if (stage !== seen[seen.length - 1]) seen.push(stage);
    };
    expectOk(e.dispatch({ type: 'accept-lead', jobId: job.id }));
    see();
    expectOk(e.dispatch({ type: 'dispatch', jobId: job.id, technicianId: OWNER, vehicleId: VAN }));
    see();
    advanceUntil(e, (s) => { see(); return s.jobs[job.id].status === 'awaiting-diagnosis'; });
    expectOk(e.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: job.faultId }));
    see();
    expectOk(e.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair' } }));
    advanceUntil(e, (s) => { see(); return s.mission!.status === 'completed'; });
    see();
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('uses the real access and pack-up phases, and the van stays until pack-up ends', () => {
    const e = fresh();
    const job = dispatched(e);
    advanceUntil(e, (s) => s.jobs[job.id].status === 'arriving');
    const spec = roofSpec('cm-plaza')!;
    expect(e.state.jobs[job.id].phaseTotal).toBe(spec.accessMinutes);
    expect(e.state.vehicles[VAN].status).toBe('onsite');
    advanceUntil(e, (s) => s.jobs[job.id].status === 'awaiting-diagnosis');
    expectOk(e.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: job.faultId }));
    expectOk(e.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair' } }));
    advanceUntil(e, (s) => s.jobs[job.id].status === 'completed');
    // The job closed on the roof: the summary waits for the descent and the ladder.
    const van = e.state.vehicles[VAN];
    expect(van.packUp?.total).toBe(spec.packUpMinutes);
    expect(van.status).toBe('onsite');
    expect(e.state.mission!.status).toBe('active');
    expect(missionStage(e.state)).toBe(7);
    advanceUntil(e, (s) => !s.vehicles[VAN].packUp);
    expect(e.state.mission!.status).toBe('active');
    advanceUntil(e, (s) => s.mission!.status === 'completed');
    const route = e.state.vehicles[VAN].route;
    expect(route === undefined || route.progress >= MISSION_DEPART_DISTANCE).toBe(true);
  });

  it('refuses a wrong diagnosis without touching the job, then accepts the correct one', () => {
    const e = fresh();
    const job = toFindings(e);
    expect(job.evidence).toHaveLength(faultById(job.faultId).evidence.length);
    const wrong = job.diagnosisOptions.filter((f) => f !== job.faultId);
    expect(wrong.length).toBeGreaterThan(0);
    for (const faultId of wrong) {
      const r = e.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId });
      expect(r.ok).toBe(false);
    }
    expect(e.state.jobs[job.id].status).toBe('awaiting-diagnosis');
    expect(e.state.jobs[job.id].chosenDiagnosis).toBeUndefined();
    expect(e.state.stats.incorrectDiagnoses).toBe(0);
    expectOk(e.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: job.faultId }));
    expect(e.state.jobs[job.id].diagnosisCorrect).toBe(true);
    expect(e.state.stats.correctDiagnoses).toBe(1);
  });

  it('does not bypass authorization: no work before the review, a limit on the quote, no replacement', () => {
    const e = fresh();
    const job = toFindings(e);
    expectOk(e.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: job.faultId }));
    // Above the approved limit: refused, and the quote can be corrected.
    const over = e.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair', priceAdjust: 1.3 } });
    expect(over.ok).toBe(false);
    expect(e.state.jobs[job.id].status).toBe('quoted');
    expect(e.state.jobs[job.id].financials.quoteAmount).toBe(0);
    // A rooftop replacement needs a crane, as on any other call.
    const replace = e.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'replace', equipmentTierId: 'standard' } });
    expect(replace.ok).toBe(false);
    if (!replace.ok) expect(replace.reason).toMatch(/crane/);
    // Within the limit: reviewed first, with nothing booked and no repair started until it is approved.
    const before = ledgerFor(e.state, job.id).length;
    expectOk(e.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair', priceAdjust: 1.15 } }));
    const quoted = e.state.jobs[job.id];
    expect(quoted.status).toBe('awaiting-authorization');
    expect(quoted.phaseTotal).toBe(ROOFTOP_RESCUE.authorizationMinutes);
    e.advanceMinutes(ROOFTOP_RESCUE.authorizationMinutes - 1);
    expect(e.state.jobs[job.id].status).toBe('awaiting-authorization');
    expect(ledgerFor(e.state, job.id).length).toBe(before);
    advanceUntil(e, (s) => s.jobs[job.id].status === 'repairing', 5);
  });
});

describe('the money and the summary', () => {
  it('books the job once and the summary repeats those exact figures', () => {
    const e = fresh();
    const startCash = e.state.finance.cash;
    const job = complete(e);
    const entries = ledgerFor(e.state, job.id);
    expect(entries.filter((l) => l.memo.startsWith('Diagnostic fee'))).toHaveLength(1);
    expect(entries.filter((l) => l.memo.startsWith('Repair'))).toHaveLength(1);
    expect(entries.filter((l) => l.category === 'parts')).toHaveLength(1);
    expect(entries).toHaveLength(3);
    const fault = faultById(job.faultId);
    const s = e.state.mission!.summary!;
    expect(s.diagnosticFee).toBe(BALANCE.diagnosticFee);
    expect(s.repairRevenue).toBe(fault.repairPrice);
    expect(s.revenue).toBe(job.financials.revenueCollected);
    expect(s.partsCost).toBe(fault.partsCost);
    expect(s.partsCost).toBe(job.financials.partsCost);
    expect(s.netContribution).toBe(BALANCE.diagnosticFee + fault.repairPrice - fault.partsCost);
    expect(e.state.finance.cash).toBe(startCash + s.netContribution);
    expect(reconcileCash(e.state).ok).toBe(true);
    // Completing and acknowledging the mission pays nothing more.
    const ledgerSize = e.state.finance.ledger.length;
    expectOk(e.dispatch({ type: 'mission-ack' }));
    expectOk(e.dispatch({ type: 'mission-ack' }));
    expect(e.state.finance.ledger.length).toBe(ledgerSize);
  });

  it('reports what really changed: price chosen, trust, reputation, experience', () => {
    const e = fresh();
    const job = toRepair(e, 1.1);
    const trustBefore = e.state.customers[job.customerId].trust;
    const repBefore = e.state.mission!.baseline.reputation;
    const xpBefore = e.state.employees[OWNER].xp;
    advanceUntil(e, (s) => s.mission!.status === 'completed');
    const s = e.state.mission!.summary!;
    expect(s.repairRevenue).toBe(Math.round(faultById(job.faultId).repairPrice * 1.1));
    expect(s.trustBefore).toBe(trustBefore);
    expect(s.trustAfter).toBe(e.state.customers[job.customerId].trust);
    expect(s.trustAfter).toBeGreaterThan(s.trustBefore);
    expect(s.reputationBefore).toBe(repBefore);
    expect(s.reputationAfter).toBe(e.state.company.reputation);
    expect(s.xpGained).toBe(e.state.employees[OWNER].xp - xpBefore);
    expect(s.xpGained).toBeGreaterThan(0);
    expect(s.diagnosisCorrect).toBe(true);
    expect(e.state.company.completedJobs).toBe(1);
  });

  it('holds the clock on the summary, then restores the speed and opens regular business', () => {
    const e = fresh();
    expectOk(e.dispatch({ type: 'set-speed', speed: 5 }));
    complete(e);
    expect(e.state.speed).toBe(0);
    expectOk(e.dispatch({ type: 'mission-ack' }));
    expect(e.state.speed).toBe(5);
    // Calls resume, and a whole ordinary job can be played.
    const start = Object.keys(e.state.jobs).length;
    advanceUntil(e, (s) => Object.keys(s.jobs).length > start, 1440 * 2);
    const lead = Object.values(e.state.jobs).find((j) => j.status === 'lead')!;
    advanceUntil(e, (s) => s.vehicles[VAN].status === 'parked');
    const current = Object.values(e.state.jobs).find((j) => j.status === 'lead') ?? lead;
    expect(current.status).toBe('lead');
    expectOk(e.dispatch({ type: 'accept-lead', jobId: current.id }));
    expect(e.state.jobs[current.id].authorization).toBeUndefined();
  });

  it('spaces out the leads it held rather than delivering them all at once', () => {
    const e = fresh(42);
    e.advanceMinutes(240);
    const held = e.state.leadSchedule.filter((l) => l.day === 1 && l.minute <= e.state.clock.minute).length;
    expect(held).toBeGreaterThan(1);
    expectOk(e.dispatch({ type: 'mission-skip' }));
    const minutes = e.state.leadSchedule.filter((l) => l.day === 1).map((l) => l.minute);
    expect(Math.min(...minutes)).toBeGreaterThan(e.state.clock.minute);
    expect(new Set(minutes.slice(0, held)).size).toBe(held);
    expect(Object.keys(e.state.jobs)).toHaveLength(1);
  });
});

describe('speed and persistence', () => {
  it('finishes with the same figures at 1x and 5x (real ticks, as the game loop does)', () => {
    const play = (speed: 1 | 5) => {
      const e = fresh(11);
      const job = missionJobOf(e);
      expectOk(e.dispatch({ type: 'set-speed', speed }));
      expectOk(e.dispatch({ type: 'accept-lead', jobId: job.id }));
      expectOk(e.dispatch({ type: 'dispatch', jobId: job.id, technicianId: OWNER, vehicleId: VAN }));
      for (let i = 0; i < 400_000 && e.state.mission!.status === 'active'; i++) {
        const j = e.state.jobs[job.id];
        if (j.status === 'awaiting-diagnosis') expectOk(e.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: j.faultId }));
        if (j.status === 'quoted') expectOk(e.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair' } }));
        e.tick(1 / 30);
      }
      expect(e.state.mission!.status).toBe('completed');
      const s = e.state.mission!.summary!;
      return { revenue: s.revenue, parts: s.partsCost, net: s.netContribution, entries: ledgerFor(e.state, job.id).length };
    };
    expect(play(5)).toEqual(play(1));
  });

  it('save and load at every objective resumes the same mission, with no second call and no double payment', () => {
    let e = fresh();
    const reload = () => {
      const before = serialize(e.state);
      e = new GameEngine(deserialize(before));
      expect(JSON.parse(serialize(e.state)).state).toEqual(JSON.parse(before).state);
    };
    const jobId = e.state.mission!.jobId;
    reload();
    expect(missionStage(e.state)).toBe(1);
    expectOk(e.dispatch({ type: 'accept-lead', jobId }));
    reload();
    expect(missionStage(e.state)).toBe(2);
    expectOk(e.dispatch({ type: 'dispatch', jobId, technicianId: OWNER, vehicleId: VAN }));
    reload();
    expect(missionStage(e.state)).toBe(3);
    advanceUntil(e, (s) => s.jobs[jobId].status === 'arriving');
    e.advanceMinutes(15);
    const left = e.state.jobs[jobId].phaseRemaining;
    reload();
    expect(missionStage(e.state)).toBe(4);
    expect(e.state.jobs[jobId].phaseRemaining).toBe(left);
    advanceUntil(e, (s) => s.jobs[jobId].status === 'awaiting-diagnosis');
    reload();
    expect(missionStage(e.state)).toBe(5);
    expectOk(e.dispatch({ type: 'choose-diagnosis', jobId, faultId: e.state.jobs[jobId].faultId }));
    expectOk(e.dispatch({ type: 'submit-quote', jobId, quote: { recommendation: 'repair' } }));
    reload();
    expect(e.state.jobs[jobId].status).toBe('awaiting-authorization');
    advanceUntil(e, (s) => s.jobs[jobId].status === 'repairing');
    reload();
    advanceUntil(e, (s) => s.jobs[jobId].status === 'completed');
    reload();
    expect(e.state.vehicles[VAN].packUp).toBeDefined();
    advanceUntil(e, (s) => s.mission!.status === 'completed');
    reload();
    expect(missionStage(e.state)).toBe(8);
    expect(e.state.mission!.acknowledged).toBeUndefined();
    expect(Object.keys(e.state.jobs).filter((id) => e.state.jobs[id].customerId === 'cust-cm-plaza')).toEqual([jobId]);
    expect(ledgerFor(e.state, jobId)).toHaveLength(3);
    expect(reconcileCash(e.state).ok).toBe(true);
  });

  it('continues identically after a load (same seed, same remaining play)', () => {
    const a = fresh(5);
    const job = toFindings(a);
    const b = new GameEngine(deserialize(serialize(a.state)));
    for (const e of [a, b]) {
      expectOk(e.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: job.faultId }));
      expectOk(e.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair' } }));
      advanceUntil(e, (s) => s.mission!.status === 'completed');
      e.dispatch({ type: 'mission-ack' });
      e.advanceMinutes(600);
    }
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
  });
});

describe('existing campaigns', () => {
  /** A campaign saved by the previous version: schema 5, no mission, jobs already on the books. */
  function schema5Save(): { json: string; state: GameState; jobId: string } {
    const e = newEngine(42);
    const lead = Object.values(e.state.jobs).find((j) => j.status === 'lead')!;
    expectOk(e.dispatch({ type: 'accept-lead', jobId: lead.id }));
    expectOk(e.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: OWNER, vehicleId: VAN }));
    e.advanceMinutes(30);
    const json = JSON.stringify({ schemaVersion: 5, savedAt: '2026-10-31T00:00:00.000Z', appVersion: '0.1.0', state: { ...e.state, schemaVersion: 5 } });
    return { json, state: e.state, jobId: lead.id };
  }

  it('loads an older save unchanged: no mission, same jobs, money, customers and progression', () => {
    const { json, state } = schema5Save();
    const loaded = deserialize(json);
    expect(loaded.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.mission).toBeUndefined();
    expect(missionStage(loaded)).toBeNull();
    expect(loaded.jobs).toEqual(state.jobs);
    expect(loaded.finance.ledger).toEqual(state.finance.ledger);
    expect(loaded.customers).toEqual(state.customers);
    expect(loaded.stats).toEqual(state.stats);
    expect(loaded.company).toEqual(state.company);
  });

  it('never inserts a mission or a tutorial call into a running campaign, and its leads keep arriving', () => {
    const { json, jobId } = schema5Save();
    const e = new GameEngine(deserialize(json));
    const before = Object.keys(e.state.jobs);
    expect(before.every((id) => e.state.customers[e.state.jobs[id].customerId].lotId !== 'cm-plaza')).toBe(true);
    advanceUntil(e, (s) => Object.keys(s.jobs).length > before.length, 1440 * 3);
    expect(e.state.mission).toBeUndefined();
    expect(e.state.jobs[jobId]).toBeDefined();
    expect(Object.values(e.state.jobs).every((j) => j.authorization === undefined)).toBe(true);
  });

  it('keeps ordinary rules on ordinary calls: wrong diagnoses are accepted, with their usual consequences', () => {
    const e = newEngine(42);
    const lead = Object.values(e.state.jobs).find((j) => j.status === 'lead')!;
    expectOk(e.dispatch({ type: 'accept-lead', jobId: lead.id }));
    expectOk(e.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: OWNER, vehicleId: VAN }));
    advanceUntil(e, (s) => s.jobs[lead.id].status === 'awaiting-diagnosis');
    const wrong = lead.diagnosisOptions.find((f) => f !== lead.faultId)!;
    expectOk(e.dispatch({ type: 'choose-diagnosis', jobId: lead.id, faultId: wrong }));
    expect(e.state.jobs[lead.id].diagnosisCorrect).toBe(false);
  });
});

describe('leaving the mission', () => {
  it('skipping keeps the same job, with its state and money intact, and normal rules from there on', () => {
    const e = fresh();
    const job = toFindings(e);
    const ledger = e.state.finance.ledger.length;
    const snapshot = JSON.stringify(e.state.jobs[job.id].evidence);
    expectOk(e.dispatch({ type: 'mission-skip' }));
    expect(e.state.mission!.status).toBe('skipped');
    expect(missionStage(e.state)).toBeNull();
    const after = e.state.jobs[job.id];
    expect(after.status).toBe('awaiting-diagnosis');
    expect(JSON.stringify(after.evidence)).toBe(snapshot);
    expect(after.authorization).toBeUndefined();
    expect(e.state.finance.ledger.length).toBe(ledger);
    expect(Object.keys(e.state.jobs)).toEqual([job.id]);
    expect(e.dispatch({ type: 'mission-skip' }).ok).toBe(false);
    // A wrong diagnosis now stands, as on any other call.
    const wrong = after.diagnosisOptions.find((f) => f !== after.faultId)!;
    expectOk(e.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: wrong }));
    expect(e.state.jobs[job.id].diagnosisCorrect).toBe(false);
  });

  it('skipping during the review lets it finish, without a stuck job or a second charge', () => {
    const e = fresh();
    const job = toFindings(e);
    expectOk(e.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: job.faultId }));
    expectOk(e.dispatch({ type: 'submit-quote', jobId: job.id, quote: { recommendation: 'repair' } }));
    expectOk(e.dispatch({ type: 'mission-skip' }));
    advanceUntil(e, (s) => s.jobs[job.id].status === 'completed');
    expect(ledgerFor(e.state, job.id)).toHaveLength(3);
    expect(e.state.mission!.summary).toBeUndefined();
  });

  it('a skipped lead expires on the normal clock', () => {
    const e = fresh();
    const job = missionJobOf(e);
    expectOk(e.dispatch({ type: 'mission-skip' }));
    advanceUntil(e, (s) => s.jobs[job.id].status === 'expired', BALANCE.leadLifetimeMinutes + 10);
  });

  it('declining the call ends the mission and opens regular business, even while paused', () => {
    const e = fresh();
    expectOk(e.dispatch({ type: 'set-speed', speed: 0 }));
    expectOk(e.dispatch({ type: 'decline-lead', jobId: missionJobOf(e).id }));
    expect(e.state.mission!.status).toBe('abandoned');
    expect(missionStage(e.state)).toBeNull();
    const other = spawnLead(e.state, { preferredLotId: 'c-n-4', channel: 'direct' })!;
    expectOk(e.dispatch({ type: 'accept-lead', jobId: other.id }));
  });

  it('automation stays out of the mission job even if the Operations Center is bought mid-call', () => {
    const e = fresh();
    const job = dispatched(e);
    e.state.company.hqUpgrades.push('operations-center');
    e.state.company.automation = { diagnostics: true, closing: true };
    advanceUntil(e, (s) => s.jobs[job.id].status === 'awaiting-diagnosis');
    e.advanceMinutes(10);
    expect(e.state.jobs[job.id].status).toBe('awaiting-diagnosis');
    expect(e.state.jobs[job.id].auto).toBeUndefined();
  });
});
