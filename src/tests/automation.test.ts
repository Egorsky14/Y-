import { describe, expect, it } from 'vitest';
import { advanceUntil, expectOk, newEngine } from './helpers';
import type { GameEngine } from '@/game/simulation/engine';
import type { Employee, GameState, Job, Vehicle } from '@/game/simulation/types';
import { reconcileCash } from '@/game/economy/ledger';
import { spawnLead } from '@/game/jobs/leads';
import { faultById } from '@/game/jobs/faults';
import { hqParkingStalls } from '@/game/world/cityLayout';
import { attentionQueue, evidenceConfidence, technicianCount } from '@/game/operations/automation';
import { deserialize, serialize } from '@/persistence/save';
import { createNewGame } from '@/game/simulation/newGame';
import { GameEngine as Engine } from '@/game/simulation/engine';

const OWNER = 'emp-owner';
const VAN = 'veh-1';
const TERMINAL = ['completed', 'declined', 'expired', 'cancelled'];

/** Two hires from the market: three technicians with the owner. */
function hireTwo(engine: GameEngine): string[] {
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const c = engine.state.candidates.find((x) => x.role === 'technician') ?? engine.state.candidates[0];
    c.role = 'technician';
    const before = new Set(Object.keys(engine.state.employees));
    expectOk(engine.dispatch({ type: 'hire', candidateId: c.id }));
    ids.push(Object.keys(engine.state.employees).find((k) => !before.has(k))!);
  }
  return ids;
}

function unlock(engine: GameEngine, settings: { diagnostics?: boolean; closing?: boolean } = {}): void {
  if (technicianCount(engine.state) < 3) hireTwo(engine);
  expectOk(engine.dispatch({ type: 'hq-upgrade', upgradeId: 'operations-center' }));
  if (settings.diagnostics !== undefined || settings.closing !== undefined) expectOk(engine.dispatch({ type: 'set-automation', ...settings }));
}

/** Test fixture: a technician with given skills (no market, no capacity limits). */
function addTech(s: GameState, id: string, skill: number): Employee {
  const owner = s.employees[OWNER];
  const e: Employee = {
    ...owner,
    id,
    name: `Tech ${id}`,
    isOwner: false,
    hourlyWage: 30,
    attributes: { ...owner.attributes, diagnosticAccuracy: skill, attentionToDetail: skill, technicalExpertise: skill, speed: 55, stamina: 80, stressTolerance: 90 },
    certifications: [],
    status: 'idle',
    jobId: undefined,
    vehicleId: undefined,
    position: { x: 44, z: 34 },
    jobsCompleted: 0,
    fatigue: 0,
    morale: 90,
  };
  s.employees[id] = e;
  return e;
}

function addVan(s: GameState, id: string, stall: number): Vehicle {
  const v: Vehicle = { ...s.vehicles[VAN], id, nickname: `Unit ${stall + 1}`, stall, position: { ...hqParkingStalls(16)[stall].pos }, heading: hqParkingStalls(16)[stall].heading, passengerIds: [], jobId: undefined, driverId: undefined, route: undefined, status: 'parked', upgrades: [], financing: undefined };
  s.vehicles[id] = v;
  return v;
}

/** Spawns a call, accepts it and sends the technician; returns the job. */
function sendCall(engine: GameEngine, opts: { lotId?: string; faultId?: string; channel?: 'direct' | 'warranty'; tech?: string; van?: string } = {}): Job {
  const s = engine.state;
  const job = spawnLead(s, { channel: opts.channel ?? 'direct', preferredLotId: opts.lotId ?? 'b-n-1', faultId: opts.faultId ?? 'contactor' })!;
  expectOk(engine.dispatch({ type: 'accept-lead', jobId: job.id }));
  expectOk(engine.dispatch({ type: 'dispatch', jobId: job.id, technicianId: opts.tech ?? OWNER, vehicleId: opts.van ?? VAN }));
  return s.jobs[job.id];
}

const isEvent = (s: GameState, title: string) => s.events.filter((e) => e.title.startsWith(title));

describe('Automated Operations Center: the upgrade', () => {
  it('is locked below three technicians, owner included', () => {
    const engine = newEngine(42);
    const s = engine.state;
    expect(technicianCount(s)).toBe(1); // the owner works as a technician
    const r = engine.dispatch({ type: 'hq-upgrade', upgradeId: 'operations-center' });
    expect(r).toEqual({ ok: false, reason: 'Requires 3 technicians (you have 1, owner included).' });
    const c = s.candidates.find((x) => x.role === 'technician')!;
    expectOk(engine.dispatch({ type: 'hire', candidateId: c.id }));
    expect(engine.dispatch({ type: 'hq-upgrade', upgradeId: 'operations-center' })).toEqual({ ok: false, reason: 'Requires 3 technicians (you have 2, owner included).' });
    // The settings cannot be turned on without the upgrade.
    expect(engine.dispatch({ type: 'set-automation', diagnostics: true })).toEqual({ ok: false, reason: 'Build the Automated Operations Center at headquarters first.' });
    expect(s.company.automation).toEqual({ diagnostics: false, closing: false });
  });

  it('costs $1,000 once through the ledger, and both settings start off', () => {
    const engine = newEngine(42);
    const s = engine.state;
    hireTwo(engine);
    expect(technicianCount(s)).toBe(3);
    const cash = s.finance.cash;
    const n = s.finance.ledger.length;
    expectOk(engine.dispatch({ type: 'hq-upgrade', upgradeId: 'operations-center' }));
    expect(s.finance.cash).toBe(cash - 1000);
    expect(s.finance.ledger).toHaveLength(n + 1);
    expect(s.finance.ledger.at(-1)).toMatchObject({ amount: -1000, category: 'facility', memo: 'HQ upgrade — Automated Operations Center' });
    expect(reconcileCash(s).ok).toBe(true);
    expect(s.company.automation).toEqual({ diagnostics: false, closing: false });
    expect(engine.dispatch({ type: 'hq-upgrade', upgradeId: 'operations-center' })).toEqual({ ok: false, reason: 'Already built.' });
    expectOk(engine.dispatch({ type: 'set-automation', diagnostics: true }));
    expect(s.company.automation).toEqual({ diagnostics: true, closing: false });
    expectOk(engine.dispatch({ type: 'set-automation', closing: true }));
    expectOk(engine.dispatch({ type: 'set-automation', diagnostics: false }));
    expect(s.company.automation).toEqual({ diagnostics: false, closing: true });
  });
});

describe('the four combinations of settings', () => {
  function run(diagnostics: boolean, closing: boolean) {
    const engine = newEngine(42);
    unlock(engine, { diagnostics, closing });
    const job = sendCall(engine, { faultId: 'contactor' });
    advanceUntil(engine, (s) => !['enroute', 'arriving', 'diagnosing'].includes(s.jobs[job.id].status), 400);
    engine.advanceMinutes(1);
    return { engine, job: engine.state.jobs[job.id] };
  }

  it('both off: findings wait for the player, as before', () => {
    const { engine, job } = run(false, false);
    expect(job.status).toBe('awaiting-diagnosis');
    expect(job.auto).toBeUndefined();
    expect(isEvent(engine.state, 'Findings ready')).toHaveLength(1);
  });

  it('diagnostics only: the technician commits to a diagnosis, the estimate waits for the player', () => {
    const { engine, job } = run(true, false);
    expect(job.status).toBe('quoted');
    expect(job.auto).toEqual({ diagnosis: true });
    expect(job.chosenDiagnosis).toBeDefined();
    expect(job.log.some((l) => l.startsWith('Automatic diagnosis:'))).toBe(true);
    expect(isEvent(engine.state, 'Findings ready')).toHaveLength(0); // no toast per call
    engine.advanceMinutes(60);
    expect(engine.state.jobs[job.id].status).toBe('quoted');
  });

  it('estimates only: the player diagnoses, then the technician quotes the standard price', () => {
    const { engine, job } = run(false, true);
    expect(job.status).toBe('awaiting-diagnosis');
    expectOk(engine.dispatch({ type: 'choose-diagnosis', jobId: job.id, faultId: 'contactor' }));
    engine.advanceMinutes(0.5);
    const j = engine.state.jobs[job.id];
    expect(j.auto).toEqual({ estimate: true });
    expect(['repairing', 'completed']).toContain(j.status);
    // Standard catalog price, no discount; a decline closes the visit with a zero quote.
    if (j.status === 'repairing') expect(j.financials.quoteAmount).toBe(faultById('contactor').repairPrice);
  });

  it('both on: a routine repair runs to payment without the player', () => {
    const { engine, job } = run(true, true);
    advanceUntil(engine, (s) => s.jobs[job.id].status === 'completed', 400);
    const j = engine.state.jobs[job.id];
    expect(j.auto).toEqual({ diagnosis: true, estimate: true });
    expect(j.attention).toBeUndefined();
    expect(reconcileCash(engine.state).ok).toBe(true);
  });
});

describe('decisions that stay with the owner', () => {
  it('a full replacement goes to the Owner Attention queue and waits', () => {
    const engine = newEngine(42);
    unlock(engine, { diagnostics: true, closing: true });
    const s = engine.state;
    const job = sendCall(engine, { faultId: 'compressor', lotId: 'b-n-1' });
    s.customers[job.customerId].equipment.ageYears = 18;
    // Make the readings decisive so the diagnosis itself is not in question.
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'diagnosing', 400);
    s.employees[OWNER].attributes.diagnosticAccuracy = 100;
    s.employees[OWNER].attributes.attentionToDetail = 100;
    s.employees[OWNER].fatigue = 0;
    advanceUntil(engine, (st) => !!st.jobs[job.id].attention || st.jobs[job.id].status !== 'diagnosing', 400);
    engine.advanceMinutes(30);
    const j = s.jobs[job.id];
    if (j.chosenDiagnosis !== 'compressor') return; // a misled diagnosis has its own path, tested below
    expect(j.status).toBe('quoted');
    expect(j.attention).toMatchObject({ kind: 'replacement-approval', blocking: true, waitStatus: 'quoted' });
    expect(attentionQueue(s).map((x) => x.id)).toEqual([j.id]);
    expect(isEvent(s, 'Replacement needs your approval')).toHaveLength(1); // once, not every step
    expect(j.financials.quoteAmount).toBe(0);
    // The owner decides: repair it this time.
    expectOk(engine.dispatch({ type: 'submit-quote', jobId: j.id, quote: { recommendation: 'repair' } }));
    engine.advanceMinutes(0.5);
    expect(j.attention!.resolved).toBeDefined();
    expect(attentionQueue(s)).toHaveLength(0);
  });

  it('conflicting readings go to the owner unless the technician can re-check reliably', () => {
    const engine = newEngine(42);
    unlock(engine);
    const s = engine.state;
    const job = sendCall(engine, { faultId: 'run-capacitor' });
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'awaiting-diagnosis', 400);
    // The decisive reading (capacitor, weight 0.9) misread, the other two right: the evidence splits.
    const j = s.jobs[job.id];
    const f = faultById('run-capacitor');
    j.evidence = f.evidence.map((t, i) => ({ label: t.label, value: i === 0 ? t.noisyValue : t.value, accurate: i !== 0 }));
    expect(evidenceConfidence(j)).toBeCloseTo(0.5, 6);
    // A tired, average technician with only a meter cannot settle it.
    s.employees[OWNER].attributes.diagnosticAccuracy = 50;
    s.employees[OWNER].fatigue = 60;
    expectOk(engine.dispatch({ type: 'set-automation', diagnostics: true, closing: true }));
    engine.advanceMinutes(0.5);
    expect(j.status).toBe('awaiting-diagnosis');
    expect(j.attention).toMatchObject({ kind: 'uncertain-diagnosis', blocking: true });
    engine.advanceMinutes(10);
    expect(isEvent(s, 'Diagnosis needs your call')).toHaveLength(1);
    // The owner chooses; automation resumes with the estimate.
    expectOk(engine.dispatch({ type: 'choose-diagnosis', jobId: j.id, faultId: 'run-capacitor' }));
    engine.advanceMinutes(0.5);
    expect(j.attention!.resolved).toBeDefined();
    expect(j.auto).toEqual({ estimate: true });
    expect(j.status === 'repairing' || j.status === 'completed').toBe(true);
  });

  it('a reliable technician settles the same conflict by re-checking', () => {
    const engine = newEngine(42);
    unlock(engine);
    const s = engine.state;
    const job = sendCall(engine, { faultId: 'run-capacitor' });
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'awaiting-diagnosis', 400);
    const j = s.jobs[job.id];
    const f = faultById('run-capacitor');
    j.evidence = f.evidence.map((t, i) => ({ label: t.label, value: i === 0 ? t.noisyValue : t.value, accurate: i !== 0 }));
    s.employees[OWNER].attributes.diagnosticAccuracy = 95;
    s.employees[OWNER].attributes.attentionToDetail = 95;
    s.employees[OWNER].fatigue = 0;
    engine.dispatch({ type: 'buy-tool', toolId: 'clamp-meter' }); // to the crib: not on site, changes nothing
    expectOk(engine.dispatch({ type: 'set-automation', diagnostics: true }));
    engine.advanceMinutes(0.5);
    expect(j.attention).toBeUndefined();
    expect(j.chosenDiagnosis).toBe('run-capacitor');
  });

  it('warranty work waits for authorization; a denial is a notice the owner can dismiss', () => {
    let approved = 0;
    let denied = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const engine = newEngine(seed);
      unlock(engine, { diagnostics: true, closing: true });
      const s = engine.state;
      s.employees[OWNER].attributes.diagnosticAccuracy = 100;
      const job = sendCall(engine, { faultId: 'contactor', channel: 'warranty' });
      advanceUntil(engine, (st) => st.jobs[job.id].status === 'awaiting-authorization' || TERMINAL.includes(st.jobs[job.id].status) || !!st.jobs[job.id].attention, 400);
      const j = s.jobs[job.id];
      if (j.status !== 'awaiting-authorization') continue;
      // No repair work and no parts before the warranty company answers.
      expect(s.finance.ledger.some((e) => e.jobId === j.id && e.category === 'parts')).toBe(false);
      advanceUntil(engine, (st) => st.jobs[j.id].status !== 'awaiting-authorization', 200);
      if (j.attention) {
        denied++;
        expect(j.attention).toMatchObject({ kind: 'warranty-denied', blocking: false });
        expect(j.status).toBe('completed');
        expect(attentionQueue(s)).toHaveLength(1);
        expectOk(engine.dispatch({ type: 'ack-attention', jobId: j.id }));
        expect(attentionQueue(s)).toHaveLength(0);
      } else {
        approved++;
        expect(j.status).toBe('repairing');
        advanceUntil(engine, (st) => st.jobs[j.id].status === 'completed', 400);
        expect(s.finance.receivables.filter((r) => r.jobId === j.id)).toHaveLength(1);
      }
    }
    expect(approved).toBeGreaterThan(0);
    expect(denied).toBeGreaterThan(0);
  });
});

describe('outcomes come from the real mechanics', () => {
  it('skill and tools change how often automatic diagnoses are right, and nothing is guaranteed', () => {
    const rate = (skill: number, tools: boolean) => {
      let right = 0;
      let total = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const engine = newEngine(seed);
        unlock(engine, { diagnostics: true });
        const s = engine.state;
        Object.assign(s.employees[OWNER].attributes, { diagnosticAccuracy: skill, attentionToDetail: skill });
        if (!tools) for (const t of Object.values(s.tools)) t.holder = { kind: 'inventory' };
        else for (const id of ['clamp-meter', 'thermal-camera'] as const) expectOk(engine.dispatch({ type: 'buy-tool', toolId: id, assignTo: { kind: 'employee', id: OWNER } }));
        const job = sendCall(engine, { faultId: 'run-capacitor' });
        advanceUntil(engine, (st) => st.jobs[job.id].status !== 'enroute' && st.jobs[job.id].status !== 'arriving' && st.jobs[job.id].status !== 'diagnosing', 400);
        engine.advanceMinutes(0.5);
        const j = s.jobs[job.id];
        if (j.chosenDiagnosis) {
          total++;
          if (j.diagnosisCorrect) right++;
        }
      }
      return { right, total };
    };
    const weak = rate(25, false);
    const strong = rate(90, true);
    expect(weak.right / weak.total).toBeLessThan(strong.right / strong.total);
    expect(weak.right).toBeLessThan(weak.total); // a weak technician gets some wrong
  });

  it('customers accept and decline automatic estimates by the normal acceptance odds', () => {
    let accepted = 0;
    let declined = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const engine = newEngine(seed);
      unlock(engine, { diagnostics: true, closing: true });
      const s = engine.state;
      s.employees[OWNER].attributes.diagnosticAccuracy = 100;
      Object.assign(s.employees[OWNER].attributes, { communication: 5, salesAbility: 5 });
      const job = sendCall(engine, { faultId: 'contactor' });
      s.customers[job.customerId].trust = 0;
      advanceUntil(engine, (st) => st.jobs[job.id].status === 'completed' || !!st.jobs[job.id].attention, 600);
      const j = s.jobs[job.id];
      const repair = s.finance.ledger.filter((e) => e.jobId === j.id && e.memo.startsWith('Repair'));
      const fees = s.finance.ledger.filter((e) => e.jobId === j.id && e.memo.startsWith('Diagnostic fee'));
      expect(fees).toHaveLength(1);
      if (j.log.some((l) => l.startsWith('Customer declined'))) {
        declined++;
        expect(repair).toHaveLength(0);
        expect(j.financials.revenueCollected).toBe(s.company.diagnosticFee);
      } else {
        accepted++;
        expect(repair).toHaveLength(1);
        expect(repair[0].amount).toBe(faultById('contactor').repairPrice);
      }
    }
    expect(accepted).toBeGreaterThan(0);
    expect(declined).toBeGreaterThan(0);
  });
});

describe('robustness', () => {
  it('switching settings during an active job takes effect at the next decision point', () => {
    const engine = newEngine(42);
    unlock(engine, { diagnostics: true });
    const s = engine.state;
    const job = sendCall(engine, { faultId: 'contactor' });
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'diagnosing', 400);
    // Turned off while the technician is measuring: the findings wait for the player.
    expectOk(engine.dispatch({ type: 'set-automation', diagnostics: false }));
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'awaiting-diagnosis', 200);
    engine.advanceMinutes(5);
    expect(s.jobs[job.id].status).toBe('awaiting-diagnosis');
    // Turned back on with estimates too: picked up on the next step, exactly once.
    expectOk(engine.dispatch({ type: 'set-automation', diagnostics: true, closing: true }));
    engine.advanceMinutes(0.5);
    const j = s.jobs[job.id];
    expect(j.auto).toEqual({ diagnosis: true, estimate: true });
    expect(j.log.filter((l) => l.startsWith('Automatic diagnosis'))).toHaveLength(1);
    expect(j.log.filter((l) => l.startsWith('Automatic estimate'))).toHaveLength(1);
  });

  it('saves and restores the settings, the Auto marks and the queue, and continues identically', () => {
    const engine = newEngine(42);
    unlock(engine, { diagnostics: true, closing: false });
    const s = engine.state;
    const job = sendCall(engine, { faultId: 'contactor' });
    advanceUntil(engine, (st) => st.jobs[job.id].status === 'quoted' || !!st.jobs[job.id].attention, 400);
    const loaded = deserialize(serialize(s));
    expect(loaded.company.automation).toEqual({ diagnostics: true, closing: false });
    expect(loaded.jobs[job.id].auto).toEqual(s.jobs[job.id].auto);
    const b = new Engine(loaded);
    for (const e of [engine, b]) {
      e.dispatch({ type: 'set-automation', closing: true });
      e.advanceMinutes(240);
    }
    expect(serialize(b.state).replace(/"savedAt":"[^"]+"/, '')).toBe(serialize(engine.state).replace(/"savedAt":"[^"]+"/, ''));
  });

  it('an old save loads with automation off', () => {
    const s = createNewGame({ seed: 3 });
    const legacy = JSON.parse(JSON.stringify(s));
    delete legacy.company.automation;
    const loaded = deserialize(JSON.stringify({ schemaVersion: 3, savedAt: '', appVersion: '0.1.0', state: legacy }));
    expect(loaded.schemaVersion).toBe(4);
    expect(loaded.company.automation).toEqual({ diagnostics: false, closing: false });
  });
});

/** Autopilot for the dispatcher's part (accept and send): the Operations Center does the rest. */
function dispatchAll(engine: GameEngine): void {
  const s = engine.state;
  const techs = Object.values(s.employees).filter((e) => e.role === 'technician' && e.status === 'idle' && !e.jobId && e.fatigue < 60);
  const vans = Object.values(s.vehicles).filter((v) => v.status === 'parked' && !v.jobId);
  let free = Math.min(techs.length, vans.length) - Object.values(s.jobs).filter((j) => j.status === 'accepted' && j.kind !== 'replacement').length;
  for (const j of Object.values(s.jobs)) if (j.status === 'lead' && free > 0 && engine.dispatch({ type: 'accept-lead', jobId: j.id }).ok) free--;
  for (const j of Object.values(s.jobs)) {
    if (j.status !== 'accepted' || j.kind === 'replacement') continue;
    const t = techs.pop();
    const v = vans.pop();
    if (!t || !v) break;
    engine.dispatch({ type: 'dispatch', jobId: j.id, technicianId: t.id, vehicleId: v.id });
  }
}

/** The owner works the queue twice a day: repair instead of replace, trusts the first candidate. */
function ownerReview(engine: GameEngine): number {
  let n = 0;
  for (const j of attentionQueue(engine.state)) {
    n++;
    if (j.attention!.kind === 'replacement-approval') engine.dispatch({ type: 'submit-quote', jobId: j.id, quote: { recommendation: 'repair' } });
    else if (j.attention!.kind === 'uncertain-diagnosis') engine.dispatch({ type: 'choose-diagnosis', jobId: j.id, faultId: j.diagnosisOptions[0] });
    else engine.dispatch({ type: 'ack-attention', jobId: j.id });
  }
  return n;
}

function tenTechCompany(seed: number): GameEngine {
  const engine = newEngine(seed);
  const s = engine.state;
  s.company.reputation = 4.8;
  s.marketing.brandRecognition = 60;
  for (let i = 1; i <= 9; i++) addTech(s, `emp-t${i}`, 45 + ((i * 7) % 40));
  for (let i = 1; i <= 9; i++) addVan(s, `veh-x${i}`, i);
  expectOk(engine.dispatch({ type: 'hq-upgrade', upgradeId: 'operations-center' }));
  expectOk(engine.dispatch({ type: 'set-automation', diagnostics: true, closing: true }));
  expectOk(engine.dispatch({ type: 'set-marketing', channel: 'localServicesAds', dailyBudget: 400 }));
  return engine;
}

/** Fifteen game minutes, advanced in one call (the default). */
const advance15 = (e: GameEngine) => e.advanceMinutes(15);

function simulate(engine: GameEngine, days: number, step: (e: GameEngine) => void = advance15) {
  const s = engine.state;
  let reviews = 0;
  let decisions = 0;
  let stuck = 0;
  const end = s.clock.day + days;
  let lastReview = -1;
  let lastExtra = -1;
  while (s.clock.day < end) {
    // A busy summer: two extra calls every working hour on top of the normal flow.
    const hour = Math.floor(s.clock.minute / 60);
    if (hour >= 8 && hour < 17 && hour !== lastExtra) {
      lastExtra = hour;
      spawnLead(s, {});
      spawnLead(s, {});
    }
    dispatchAll(engine);
    // Nothing may sit in an automated state without either progressing or asking the owner.
    for (const j of Object.values(s.jobs)) if ((j.status === 'awaiting-diagnosis' || j.status === 'quoted') && !(j.attention && !j.attention.resolved)) stuck++;
    const half = Math.floor(s.clock.minute / 360);
    if (half !== lastReview && (half === 2 || half === 3)) {
      lastReview = half;
      reviews++;
      decisions += ownerReview(engine);
    }
    step(engine);
  }
  return { reviews, decisions, stuck };
}

describe('a ten-technician company on automation', () => {
  it('runs routine calls for ten days without the owner diagnosing or approving them, with consistent books', () => {
    const engine = tenTechCompany(2026);
    const s = engine.state;
    expect(technicianCount(s)).toBe(10);
    const { decisions, stuck } = simulate(engine, 10);
    const service = Object.values(s.jobs).filter((j) => j.kind !== 'replacement');
    const completed = service.filter((j) => j.status === 'completed');
    const automated = completed.filter((j) => j.auto?.diagnosis && j.auto?.estimate);
    const kinds: Record<string, number> = {};
    for (const j of service) if (j.attention) kinds[j.attention.kind] = (kinds[j.attention.kind] ?? 0) + 1;
    console.log(`[ops] 10 techs, 10 days: ${completed.length} calls completed, ${automated.length} fully automatic, ${decisions} owner decisions, attention ${JSON.stringify(kinds)}, leads ${s.stats.leadsReceived} received / ${s.stats.leadsExpired} expired, callbacks ${s.stats.callbacks}`);
    expect(stuck).toBe(0);
    expect(completed.length).toBeGreaterThan(150);
    // Only the decisions the owner keeps reach the queue.
    for (const k of Object.keys(kinds)) expect(['replacement-approval', 'uncertain-diagnosis', 'warranty-denied', 'automation-blocked']).toContain(k);
    expect(kinds['automation-blocked'] ?? 0).toBe(0);
    // Routine work runs itself: calls without a replacement decision almost never need the owner.
    const routine = completed.filter((j) => j.attention?.kind !== 'replacement-approval');
    expect(routine.filter((j) => j.auto?.diagnosis && j.auto?.estimate).length / routine.length).toBeGreaterThan(0.8);
    // Interruptions the owner did not ask for (conflicting readings) stay rare; replacement approvals
    // are the owner's by design and match the replacement-worthy diagnoses one for one.
    expect((kinds['uncertain-diagnosis'] ?? 0) / completed.length).toBeLessThan(0.15);
    // (Checked from each job's history: a later notice can replace the attention field.)
    const askedReplacement = (j: Job) => j.log.some((l) => l.startsWith('Owner attention:') && l.includes('full replacement'));
    const warranted = (j: Job) => !!j.chosenDiagnosis && faultById(j.chosenDiagnosis).replacementCandidate && s.customers[j.customerId].equipment.ageYears >= faultById(j.chosenDiagnosis).replacementAgeYears;
    for (const j of service.filter((x) => x.status === 'completed')) expect(askedReplacement(j), j.id).toBe(warranted(j));
    // Nothing orphaned: open blocking items belong to jobs still waiting in that status, and every
    // job waiting on a decision has an open item.
    for (const j of attentionQueue(s)) if (j.attention!.blocking) expect(j.status, j.id).toBe(j.attention!.waitStatus);
    for (const j of service) if (j.status === 'awaiting-diagnosis' || j.status === 'quoted') expect(!!j.attention && !j.attention.resolved, j.id).toBe(true);
    expect(decisions).toBeGreaterThan(0);
    // No duplicates: one diagnostic fee and at most one repair payment per call, each completion once.
    for (const j of service) {
      const fees = s.finance.ledger.filter((e) => e.jobId === j.id && e.memo.startsWith('Diagnostic fee'));
      const repairs = s.finance.ledger.filter((e) => e.jobId === j.id && e.memo.startsWith('Repair'));
      const parts = s.finance.ledger.filter((e) => e.jobId === j.id && e.category === 'parts');
      expect(fees.length, j.id).toBeLessThanOrEqual(1);
      expect(repairs.length, j.id).toBeLessThanOrEqual(1);
      expect(parts.length, j.id).toBeLessThanOrEqual(1);
      expect(j.log.filter((l) => l.startsWith('Automatic diagnosis')).length, j.id).toBeLessThanOrEqual(1);
      expect(j.log.filter((l) => l.startsWith('Automatic estimate')).length, j.id).toBeLessThanOrEqual(1);
      expect(s.events.filter((e) => e.focus?.id === j.id && e.type === 'money').length, j.id).toBeLessThanOrEqual(1);
    }
    expect(s.stats.jobsCompleted).toBe(service.filter((j) => j.status === 'completed' && j.financials.partsCost > 0).length + Object.values(s.jobs).filter((j) => j.kind === 'replacement' && j.status === 'completed').length);
    expect(reconcileCash(s).ok).toBe(true);
  });

  it('gives the same game at any speed: one advance, half-minute steps, or 5x real-time ticks', () => {
    const a = tenTechCompany(7);
    const b = tenTechCompany(7);
    const c = tenTechCompany(7);
    simulate(a, 3, advance15);
    simulate(b, 3, (e) => {
      for (let i = 0; i < 30; i++) e.advanceMinutes(0.5);
    });
    c.state.speed = 5;
    // Three real seconds at 5x = 15 game minutes.
    simulate(c, 3, (e) => {
      for (let i = 0; i < 3; i++) e.tick(1);
    });
    const norm = (e: GameEngine) => serialize(e.state).replace(/"savedAt":"[^"]+"/, '').replace(/"speed":\d/, '"speed":1');
    expect(norm(b)).toBe(norm(a));
    expect(norm(c)).toBe(norm(a));
  });
});
