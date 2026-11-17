import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/simulation/engine';
import { SAVE_SCHEMA_VERSION, type GameState } from '@/game/simulation/types';
import { useApp } from '@/app/store';
import { startGameLoop } from '@/app/gameLoop';
import { recordCrash } from '@/app/diagnostics';
import {
  AUTOSAVE_KEY, KEPT_SUFFIX, LOAD_GUARD_KEY, SAVE_KEY, SAVE_SEQ_KEY,
  beginSession, compareNewest, currentPlan, describeNotice, describeSlot, deserialize, inspectJson, inspectSlot, isSuspect,
  planRecovery, readLoadGuard, saveToStorage, serialize, validateState, type SlotInfo,
} from '@/persistence/save';

/**
 * Save recovery: which save "Continue" loads, what happens when one cannot be read, and what is never written.
 * Deterministic: a map stands in for localStorage, the order of saves is the order they are written here (the
 * write counter), and no test depends on the wall clock. The browser side (a real reload and resume, the menu) is
 * e2e/save-recovery.spec.ts.
 */

function fakeStorage(): Storage & { writes: string[] } {
  const map = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => { writes.push(k); map.set(k, String(v)); },
  };
}

const g = globalThis as unknown as { localStorage?: Storage & { writes: string[] } };
const store = () => g.localStorage!;
const raw = (key: string) => store().getItem(key);
const app = () => useApp.getState();
const minutes = () => app().engine!.state.elapsedMinutes;
/** Every save slot as stored, to prove something did not change. */
const slots = () => ({ save: raw(SAVE_KEY), autosave: raw(AUTOSAVE_KEY), saveKept: raw(SAVE_KEY + KEPT_SUFFIX), autosaveKept: raw(AUTOSAVE_KEY + KEPT_SUFFIX) });

beforeEach(() => {
  g.localStorage = fakeStorage();
  beginSession(null);
  useApp.setState({ engine: null, screen: 'menu', simFault: null, crashTest: null, panel: null, selection: null, loadedFrom: null, loadPending: false });
});
afterEach(() => {
  delete g.localStorage;
});

/** A company at a given game time, as a state (not the store's). */
function companyAt(gameMinutes: number, seed = 42): GameState {
  const engine = GameEngine.newGame({ seed });
  engine.advanceMinutes(gameMinutes);
  return engine.state;
}

/** Leaves the game as a closed tab would: nothing in memory, only what is stored. */
function closeGame() {
  useApp.setState({ engine: null, screen: 'menu', loadedFrom: null, loadPending: false, simFault: null });
  beginSession(null);
}

describe('which save Continue loads', () => {
  it('1. the autosave when it is newer than the manual save, and the manual save is left exactly as it was', () => {
    saveToStorage(companyAt(60), SAVE_KEY);
    saveToStorage(companyAt(200), AUTOSAVE_KEY);
    const before = slots();

    const plan = currentPlan();
    expect(plan.primary).toMatchObject({ kind: 'autosave', kept: false, status: 'valid' });
    expect(plan.notice, 'the newest save loading is the normal case: nothing to explain').toBeNull();
    expect(plan.others.map((s) => s.kind), 'the manual save is still offered').toEqual(['manual']);
    expect(describeSlot(plan.primary!)).toMatch(/^Autosave · Day 1, \d+:\d\d [AP]M · saved today at /);

    expect(app().continueGame()).toBe(true);
    expect(minutes()).toBe(200);
    expect(app().loadedFrom).toMatchObject({ kind: 'autosave' });
    expect(slots(), 'loading wrote no save slot').toEqual(before);

    // Playing on: the autosave slot is this game's own, so it is simply updated; the manual save still holds minute 60.
    app().engine!.advanceMinutes(30);
    saveToStorage(app().engine!.state, AUTOSAVE_KEY);
    expect(raw(SAVE_KEY)).toBe(before.save);
    expect(raw(SAVE_KEY + KEPT_SUFFIX)).toBeNull();
    expect(raw(AUTOSAVE_KEY + KEPT_SUFFIX), 'its own earlier autosave needs no copy').toBeNull();
    // Only the player's own Save writes the manual slot.
    expect(app().save()).toBe(true);
    expect(deserialize(raw(SAVE_KEY)!).elapsedMinutes).toBe(230);
  });

  it('2. the manual save when it is newer than the autosave', () => {
    saveToStorage(companyAt(200), AUTOSAVE_KEY);
    saveToStorage(companyAt(260), SAVE_KEY);
    const plan = currentPlan();
    expect(plan.primary).toMatchObject({ kind: 'manual' });
    expect(plan.notice).toBeNull();
    expect(plan.others.map((s) => s.kind)).toEqual(['autosave']);
    expect(app().continueGame()).toBe(true);
    expect(minutes()).toBe(260);
  });

  it('3. the autosave when there is no manual save', () => {
    saveToStorage(companyAt(90), AUTOSAVE_KEY);
    const plan = currentPlan();
    expect(plan.primary).toMatchObject({ kind: 'autosave' });
    expect(plan.notice).toBeNull();
    expect(plan.others).toEqual([]);
    expect(plan.unreadable).toEqual([]);
    expect(app().continueGame()).toBe(true);
    expect(minutes()).toBe(90);
    expect(raw(SAVE_KEY), 'no manual save was made up').toBeNull();
  });

  it('4. the manual save when there is no autosave; and nothing when there is no save at all', () => {
    expect(currentPlan()).toEqual({ primary: null, notice: null, others: [], unreadable: [] });
    expect(app().continueGame()).toBe(false);
    expect(app().engine).toBeNull();

    saveToStorage(companyAt(75), SAVE_KEY);
    expect(currentPlan().primary).toMatchObject({ kind: 'manual' });
    expect(app().continueGame()).toBe(true);
    expect(minutes()).toBe(75);
    expect(raw(AUTOSAVE_KEY)).toBeNull();
  });

  it('two saves of the same moment are one choice', () => {
    const state = companyAt(120);
    saveToStorage(state, SAVE_KEY);
    saveToStorage(state, AUTOSAVE_KEY);
    const plan = currentPlan();
    expect(plan.primary).toMatchObject({ kind: 'autosave' });
    expect(plan.others, 'the same progress is not listed twice').toEqual([]);
  });

  it('the write counter decides, not the wall clock', () => {
    // The manual save is written first but stamped a day later (a clock that was wrong, or changed since).
    const s = store();
    s.setItem(SAVE_KEY, serialize(companyAt(60), { seq: 7, now: new Date('2026-06-02T12:00:00Z') }));
    s.setItem(AUTOSAVE_KEY, serialize(companyAt(200), { seq: 8, now: new Date('2026-06-01T12:00:00Z') }));
    expect(currentPlan().primary).toMatchObject({ kind: 'autosave', seq: 8 });
    // The next write goes above everything already stored, even with the counter key gone.
    expect(store().getItem(SAVE_SEQ_KEY)).toBeNull();
    saveToStorage(companyAt(10), SAVE_KEY);
    expect(inspectSlot(SAVE_KEY).seq).toBe(9);
    expect(currentPlan().primary).toMatchObject({ kind: 'manual' });
  });

  it('a new company is never passed over for the previous company\'s leftover autosave', () => {
    saveToStorage(companyAt(5000, 7), AUTOSAVE_KEY);
    app().newGame(42);
    closeGame();
    const plan = currentPlan();
    expect(plan.primary).toMatchObject({ kind: 'manual' });
    expect(plan.primary!.summary).toMatchObject({ seed: 42, day: 1 });
  });
});

describe('saves from before this version', () => {
  /** An envelope exactly as the previous build wrote it: no counter, no checksum. */
  const legacy = (state: GameState, savedAt: string, schemaVersion = SAVE_SCHEMA_VERSION) => JSON.stringify({ schemaVersion, savedAt, appVersion: '0.1.0', state });

  it('load as before and are ordered by the time they were written', () => {
    store().setItem(SAVE_KEY, legacy(companyAt(60), '2026-05-01T10:00:00.000Z'));
    store().setItem(AUTOSAVE_KEY, legacy(companyAt(200), '2026-05-01T10:07:00.000Z'));
    const plan = currentPlan();
    expect(plan.unreadable).toEqual([]);
    expect(plan.primary).toMatchObject({ kind: 'autosave', seq: 0, status: 'valid' });
    expect(app().continueGame()).toBe(true);
    expect(minutes()).toBe(200);
  });

  it('are older than anything this version writes', () => {
    store().setItem(AUTOSAVE_KEY, legacy(companyAt(200), '2099-01-01T00:00:00.000Z'));
    saveToStorage(companyAt(230), SAVE_KEY);
    expect(currentPlan().primary).toMatchObject({ kind: 'manual' });
  });

  it('an older schema is upgraded on load and the stored save is not rewritten', () => {
    const old = JSON.parse(JSON.stringify(companyAt(300))) as GameState;
    delete old.mission;
    delete (old.company as { automation?: unknown }).automation;
    old.schemaVersion = 3;
    const stored = legacy(old, '2026-05-01T10:00:00.000Z', 3);
    store().setItem(SAVE_KEY, stored);
    expect(inspectSlot(SAVE_KEY)).toMatchObject({ status: 'valid' });
    expect(app().continueGame()).toBe(true);
    expect(app().engine!.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(app().engine!.state.company.automation).toEqual({ diagnostics: false, closing: false });
    expect(raw(SAVE_KEY)).toBe(stored);
  });
});

describe('a save that cannot be read', () => {
  /** Ways a stored save goes bad, each applied to a good one. */
  const damage: Record<string, (good: string) => string> = {
    'cut short': (s) => s.slice(0, Math.floor(s.length * 0.6)),
    'not JSON': () => 'undefined',
    'empty': () => '',
    'not a save': () => JSON.stringify({ hello: 'world' }),
    'one digit changed': (s) => s.replace(/"cash":(\d)/, (_, d: string) => `"cash":${(Number(d) + 1) % 10}`),
    'half the company missing': (s) => {
      const e = JSON.parse(s) as { state: Partial<GameState>; checksum?: string };
      delete e.state.employees;
      delete e.state.finance;
      delete e.checksum;
      return JSON.stringify(e);
    },
    'a job without its customer': (s) => {
      const e = JSON.parse(s) as { state: GameState; checksum?: string };
      delete e.checksum;
      Object.values(e.state.jobs)[0].customerId = 'cust-nobody';
      return JSON.stringify(e);
    },
  };

  for (const [name, breakIt] of Object.entries(damage)) {
    it(`5. corrupted autosave (${name}): Continue falls back to the manual save and says so`, () => {
      saveToStorage(companyAt(60), SAVE_KEY);
      saveToStorage(companyAt(200), AUTOSAVE_KEY);
      store().setItem(AUTOSAVE_KEY, breakIt(raw(AUTOSAVE_KEY)!));
      const before = slots();

      expect(inspectSlot(AUTOSAVE_KEY).status).toBe('corrupt');
      const plan = currentPlan();
      expect(plan.primary).toMatchObject({ kind: 'manual', status: 'valid' });
      expect(plan.unreadable.map((s) => s.kind)).toEqual(['autosave']);
      expect(plan.notice).toMatchObject({ kind: 'unreadable-skipped' });
      expect(describeNotice(plan)).toBe('Your autosave is damaged and cannot be opened, so this continues from your manual save. Nothing has been deleted.');

      expect(app().continueGame()).toBe(true);
      expect(minutes()).toBe(60);
      expect(slots(), 'the damaged autosave is still there, untouched').toEqual(before);
      // The first autosave of the resumed game would replace it: it is copied aside first.
      saveToStorage(app().engine!.state, AUTOSAVE_KEY);
      expect(raw(AUTOSAVE_KEY + KEPT_SUFFIX)).toBe(before.autosave);
      expect(inspectSlot(AUTOSAVE_KEY).status).toBe('valid');
      expect(raw(SAVE_KEY)).toBe(before.save);
    });
  }

  it('6. corrupted manual save: recovery from the autosave is offered, and the manual save is not overwritten by it', () => {
    saveToStorage(companyAt(60), AUTOSAVE_KEY);
    saveToStorage(companyAt(200), SAVE_KEY);
    store().setItem(SAVE_KEY, damage['cut short'](raw(SAVE_KEY)!));
    const before = slots();

    const plan = currentPlan();
    expect(plan.primary).toMatchObject({ kind: 'autosave' });
    expect(plan.notice).toMatchObject({ kind: 'unreadable-skipped', skipped: { kind: 'manual', status: 'corrupt' } });
    expect(describeNotice(plan)).toBe('Your manual save is damaged and cannot be opened, so this continues from your autosave. Nothing has been deleted.');

    expect(app().continueGame()).toBe(true);
    expect(minutes()).toBe(60);
    expect(slots()).toEqual(before);
    // Autosaving the recovered game leaves the manual slot alone.
    saveToStorage(app().engine!.state, AUTOSAVE_KEY);
    expect(raw(SAVE_KEY)).toBe(before.save);
    // When the player does save, the damaged manual save is copied aside before it is replaced.
    expect(app().save()).toBe(true);
    expect(raw(SAVE_KEY + KEPT_SUFFIX)).toBe(before.save);
    expect(inspectSlot(SAVE_KEY).status).toBe('valid');
  });

  it('a damaged save that is known to be older than the one being loaded needs no explanation', () => {
    saveToStorage(companyAt(60), AUTOSAVE_KEY);
    store().setItem(AUTOSAVE_KEY, damage['one digit changed'](raw(AUTOSAVE_KEY)!));
    saveToStorage(companyAt(200), SAVE_KEY);
    const plan = currentPlan();
    expect(plan.primary).toMatchObject({ kind: 'manual' });
    expect(plan.notice).toBeNull();
    expect(plan.unreadable.map((s) => s.kind), 'it is still listed').toEqual(['autosave']);
  });

  it('7. incompatible (from a newer version of the game): never loaded, never deleted, and set aside before anything replaces it', () => {
    saveToStorage(companyAt(60), SAVE_KEY);
    const future = JSON.parse(serialize(companyAt(900), { seq: 50 })) as { schemaVersion: number; state: GameState; checksum?: string };
    future.schemaVersion = SAVE_SCHEMA_VERSION + 3;
    (future.state as unknown as Record<string, unknown>).somethingNew = { franchises: 2 };
    delete future.checksum;
    store().setItem(AUTOSAVE_KEY, JSON.stringify(future));
    const before = slots();

    expect(inspectSlot(AUTOSAVE_KEY)).toMatchObject({ status: 'incompatible', seq: 50 });
    const plan = currentPlan();
    expect(plan.primary).toMatchObject({ kind: 'manual' });
    expect(describeNotice(plan)).toBe('Your autosave was made by a newer version of the game and cannot be opened here, so this continues from your manual save. Nothing has been deleted.');
    expect(app().continueGame()).toBe(true);
    expect(minutes()).toBe(60);
    expect(slots()).toEqual(before);
    // Playing on in this older version must not destroy the newer version's progress.
    saveToStorage(app().engine!.state, AUTOSAVE_KEY);
    expect(raw(AUTOSAVE_KEY + KEPT_SUFFIX)).toBe(before.autosave);
    expect(inspectSlot(AUTOSAVE_KEY + KEPT_SUFFIX)).toMatchObject({ status: 'incompatible', kept: true, kind: 'autosave' });
  });

  it('7. unmigratable (the upgrade from its version fails): reported as incompatible, and Continue uses the other save', () => {
    saveToStorage(companyAt(60), AUTOSAVE_KEY);
    const old = JSON.parse(JSON.stringify(companyAt(300))) as GameState;
    // A schema 1 save whose loans cannot be upgraded.
    (old.finance as unknown as { loans: unknown }).loans = null;
    old.schemaVersion = 1;
    store().setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 1, savedAt: '2026-05-01T10:00:00.000Z', appVersion: '0.0.9', state: old }));
    const before = slots();

    const info = inspectSlot(SAVE_KEY);
    expect(info.status).toBe('incompatible');
    expect(info.reason).toMatch(/could not be brought up to this version/);
    expect(currentPlan().primary).toMatchObject({ kind: 'autosave' });
    expect(app().continueGame()).toBe(true);
    expect(minutes()).toBe(60);
    expect(slots()).toEqual(before);
  });

  it('when no save can be read, Continue does nothing and nothing is removed; a new company sets the unreadable save aside', () => {
    store().setItem(SAVE_KEY, '{"schemaVersion":99,"savedAt":"2026-05-01T10:00:00.000Z","state":{}}');
    store().setItem(AUTOSAVE_KEY, 'garbage');
    const before = slots();
    const plan = currentPlan();
    expect(plan.primary).toBeNull();
    expect(plan.unreadable.map((s) => [s.kind, s.status])).toEqual([['manual', 'incompatible'], ['autosave', 'corrupt']]);
    expect(app().continueGame()).toBe(false);
    expect(app().engine).toBeNull();
    expect(slots()).toEqual(before);

    app().newGame(42);
    expect(raw(SAVE_KEY + KEPT_SUFFIX), 'the newer-version save survives a new company').toBe(before.save);
    expect(raw(AUTOSAVE_KEY), 'a slot nothing wrote to is untouched').toBe(before.autosave);
    expect(inspectSlot(SAVE_KEY)).toMatchObject({ status: 'valid' });
  });

  it('inspecting never throws and never writes, whatever is stored', () => {
    const junk = ['', ' ', 'null', '[]', '0', '"text"', '{', '{"schemaVersion":"6","state":{}}', '{"schemaVersion":6,"state":null}', '{"schemaVersion":6,"state":[]}', '{"schemaVersion":6,"savedAt":12,"state":{"clock":null}}', '\u0000￿'];
    for (const text of junk) {
      store().setItem(SAVE_KEY, text);
      store().writes.length = 0;
      expect(() => inspectSlot(SAVE_KEY)).not.toThrow();
      expect(inspectSlot(SAVE_KEY).status, JSON.stringify(text)).toBe('corrupt');
      expect(() => currentPlan()).not.toThrow();
      expect(app().continueGame()).toBe(false);
      expect(store().writes, `reading ${JSON.stringify(text)} wrote nothing`).toEqual([]);
    }
    // A blocked localStorage is "no saves", not an error.
    g.localStorage = { ...fakeStorage(), getItem: () => { throw new Error('SecurityError'); } };
    expect(currentPlan().primary).toBeNull();
    expect(app().continueGame()).toBe(false);
  });
});

describe('8. a simulation failure suppresses saving', () => {
  it('no autosave on the timer, at midnight, or when the page is hidden or left; no manual save; the stored saves stay loadable', () => {
    const w = globalThis as unknown as Record<string, unknown>;
    const saved = { raf: w.requestAnimationFrame, caf: w.cancelAnimationFrame, doc: w.document, win: w.window };
    let queued: ((t: number) => void) | null = null;
    let now = performance.now();
    const handlers: Record<string, () => void> = {};
    const doc = { visibilityState: 'visible', addEventListener: (n: string, f: () => void) => { handlers[n] = f; }, removeEventListener: () => undefined };
    w.requestAnimationFrame = (cb: (t: number) => void) => { queued = cb; return 1; };
    w.cancelAnimationFrame = () => { queued = null; };
    w.document = doc;
    w.window = { addEventListener: (n: string, f: () => void) => { handlers[n] = f; }, removeEventListener: () => undefined };
    const frame = (ms: number) => { const cb = queued; queued = null; now += ms; cb?.(now); };
    const stop = startGameLoop();
    try {
      app().newGame(42);
      const engine = app().engine!;
      engine.dispatch({ type: 'set-speed', speed: 1 });
      // Healthy: leaving the page autosaves.
      frame(100);
      doc.visibilityState = 'hidden';
      handlers.visibilitychange();
      doc.visibilityState = 'visible';
      expect(inspectSlot(AUTOSAVE_KEY).status).toBe('valid');
      const before = slots();

      engine.tick = () => { throw new Error('ledger out of balance'); };
      frame(100);
      expect(app().simFault).toMatchObject({ scope: 'simulation' });

      // Two real minutes of frames (well past the 45 s timer), a hidden page, a closed page, a manual save, save and exit.
      for (let i = 0; i < 150; i++) frame(1000);
      doc.visibilityState = 'hidden';
      handlers.visibilitychange();
      handlers.pagehide();
      expect(app().save()).toBe(false);
      app().toMenu();
      expect(slots(), 'not one save slot changed after the failure').toEqual(before);

      // What was saved before the failure is what Continue returns to.
      const plan = currentPlan();
      expect(plan.primary).toMatchObject({ kind: 'autosave', status: 'valid' });
      expect(app().continueGame()).toBe(true);
      expect(app().simFault).toBeNull();
    } finally {
      stop();
      Object.assign(w, { requestAnimationFrame: saved.raf, cancelAnimationFrame: saved.caf, document: saved.doc, window: saved.win });
    }
  });
});

describe('9. a save and load keeps the company', () => {
  /** A company with some history: three hires, an HQ upgrade, a changed fee, the mission under way, three days played. */
  function builtUp(): GameEngine {
    app().newGame(42);
    const engine = app().engine!;
    const s = engine.state;
    const ok = (r: { ok: boolean; reason?: string }) => expect(r.ok, r.reason).toBe(true);
    for (const role of ['technician', 'installer', 'dispatcher'] as const) ok(engine.dispatch({ type: 'hire', candidateId: s.candidates.find((c) => c.role === role)!.id }));
    ok(engine.dispatch({ type: 'hq-upgrade', upgradeId: 'additional-parking' }));
    ok(engine.dispatch({ type: 'set-diagnostic-fee', fee: 119 }));
    ok(engine.dispatch({ type: 'accept-lead', jobId: s.mission!.jobId }));
    engine.dispatch({ type: 'set-speed', speed: 2 });
    engine.advanceMinutes(3 * 1440 + 137);
    return engine;
  }

  for (const key of [SAVE_KEY, AUTOSAVE_KEY]) {
    it(`staff, cash, upgrades, the mission and progress come back identical from the ${key === SAVE_KEY ? 'manual save' : 'autosave'}`, () => {
      const engine = builtUp();
      const original = JSON.parse(JSON.stringify(engine.state)) as GameState;
      expect(Object.keys(original.employees).length).toBe(4);
      expect(original.company.hqUpgrades).toContain('additional-parking');
      expect(original.mission).toBeTruthy();
      expect(original.clock.day).toBe(4);
      expect(original.finance.ledger.length).toBeGreaterThan(5);

      store().removeItem(SAVE_KEY);
      expect(saveToStorage(engine.state, key)).toBe(true);
      closeGame();
      expect(app().continueGame()).toBe(true);
      const loaded = app().engine!.state;

      expect(loaded.employees).toEqual(original.employees);
      expect(loaded.finance.cash).toBe(original.finance.cash);
      expect(loaded.finance).toEqual(original.finance);
      expect(loaded.company).toEqual(original.company);
      expect(loaded.mission).toEqual(original.mission);
      expect(loaded.milestones).toEqual(original.milestones);
      expect(loaded.jobs).toEqual(original.jobs);
      expect(loaded.tools).toEqual(original.tools);
      expect(loaded.vehicles).toEqual(original.vehicles);
      expect(loaded.clock).toEqual(original.clock);
      expect(loaded.stats).toEqual(original.stats);
      expect(JSON.parse(JSON.stringify(loaded)), 'the whole state, not just the parts named above').toEqual(original);

      // And it is the same company going forward: the loaded game and the original play out identically.
      const a = new GameEngine(JSON.parse(JSON.stringify(original)) as GameState);
      a.advanceMinutes(1440);
      app().engine!.advanceMinutes(1440);
      expect(JSON.parse(JSON.stringify(app().engine!.state))).toEqual(JSON.parse(JSON.stringify(a.state)));
    });
  }

  it('the stored text is checked against its checksum, and validation names what is missing', () => {
    const state = companyAt(60);
    const text = serialize(state, { seq: 3 });
    expect(inspectJson(SAVE_KEY, text).info).toMatchObject({ status: 'valid', seq: 3, kind: 'manual', kept: false });
    expect(JSON.parse(text).state).toEqual(JSON.parse(JSON.stringify(state)));
    expect(() => validateState(state)).not.toThrow();
    const broken = JSON.parse(JSON.stringify(state)) as GameState;
    (broken.finance as { cash: unknown }).cash = 'lots';
    expect(() => validateState(broken)).toThrow('Save is missing the finances.');
    for (const employee of Object.values(broken.employees)) employee.isOwner = false;
    (broken.finance as { cash: unknown }).cash = 1;
    expect(() => validateState(broken)).toThrow('Save is missing the owner.');
  });
});

describe('10. reloading after a failure, and crash-on-load loops', () => {
  /** A manual save at minute 60 and a newer autosave at minute 200. */
  function twoSaves() {
    saveToStorage(companyAt(60), SAVE_KEY);
    saveToStorage(companyAt(200), AUTOSAVE_KEY);
    return slots();
  }

  it('a reload from a recovery screen returns to the newest save, autosave included', () => {
    app().newGame(42);
    app().engine!.advanceMinutes(60);
    expect(app().save()).toBe(true);
    // Play on; the timer autosaves; then the game fails to draw.
    app().engine!.advanceMinutes(140);
    saveToStorage(app().engine!.state, AUTOSAVE_KEY);
    const at = minutes();
    const before = slots();
    recordCrash('app', new Error('render failed'));
    expect(slots(), 'the failure wrote no save').toEqual(before);
    // "Reload the game": the page starts again with only what is stored.
    closeGame();
    expect(currentPlan().primary).toMatchObject({ kind: 'autosave' });
    expect(app().continueGame()).toBe(true);
    expect(minutes(), 'back at the autosave, not the older manual save').toBe(at);
    expect(readLoadGuard(), 'a failure in an established game says nothing against its saves').toMatchObject({ failed: false, attempts: 1 });
  });

  it('a save that fails as it loads is not picked again while another save can be loaded; nothing is deleted', () => {
    const before = twoSaves();
    expect(app().continueGame()).toBe(true);
    expect(app().loadPending).toBe(true);
    // The game goes down before it has been seen running from this save.
    recordCrash('world', new Error('cannot draw the new hire'));
    expect(readLoadGuard()).toMatchObject({ key: AUTOSAVE_KEY, failed: true });
    closeGame();

    const plan = currentPlan();
    expect(plan.primary, 'Continue now uses the other save').toMatchObject({ kind: 'manual' });
    expect(plan.notice).toMatchObject({ kind: 'suspect-skipped', skipped: { kind: 'autosave' } });
    expect(plan.others.map((s) => s.kind), 'the autosave is still offered, by choice').toEqual(['autosave']);
    expect(describeNotice(plan)).toBe('The game did not start properly from your autosave last time, so this continues from your manual save instead. The autosave is still here if you want to try it again.');
    expect(slots()).toEqual(before);

    expect(app().continueGame()).toBe(true);
    expect(minutes()).toBe(60);
    // The game runs: the load is confirmed and the guard is cleared.
    app().confirmLoaded();
    expect(app().loadPending).toBe(false);
    expect(raw(LOAD_GUARD_KEY)).toBeNull();
    // Its first autosave would replace the newer autosave it did not come from: that one is copied aside first.
    saveToStorage(app().engine!.state, AUTOSAVE_KEY);
    expect(raw(AUTOSAVE_KEY + KEPT_SUFFIX)).toBe(before.autosave);
    closeGame();
    const later = currentPlan();
    expect(later.primary).toMatchObject({ kind: 'autosave', kept: false });
    expect(later.others.map((s) => [s.kind, s.kept]), 'the set-aside progress can still be loaded').toEqual([['autosave', true]]);
    expect(later.others[0].summary!.elapsedMinutes).toBe(200);
    expect(useApp.getState().loadFromKey(AUTOSAVE_KEY + KEPT_SUFFIX)).toBe(true);
    expect(minutes()).toBe(200);
  });

  it('two loads that never finish (a tab that dies while loading) count as a failure; one does not', () => {
    twoSaves();
    expect(app().continueGame()).toBe(true);
    closeGame();
    expect(currentPlan().primary, 'once could be the player closing the tab').toMatchObject({ kind: 'autosave' });
    expect(app().continueGame()).toBe(true);
    closeGame();
    expect(readLoadGuard()).toMatchObject({ attempts: 2, failed: false });
    const plan = currentPlan();
    expect(plan.primary).toMatchObject({ kind: 'manual' });
    expect(plan.notice).toMatchObject({ kind: 'suspect-skipped' });
  });

  it('failures that do not take the game down, and failures after the load is confirmed, do not count', () => {
    twoSaves();
    expect(app().continueGame()).toBe(true);
    recordCrash('panel', new Error('one panel'));
    recordCrash('runtime', new Error('a stray script error'));
    recordCrash('preview', new Error('preview warm-up'));
    expect(readLoadGuard()).toMatchObject({ failed: false });
    app().confirmLoaded();
    recordCrash('app', new Error('much later'));
    expect(readLoadGuard()).toBeNull();
    closeGame();
    expect(currentPlan()).toMatchObject({ primary: { kind: 'autosave' }, notice: null });
  });

  it('the only save on the device is still offered after it failed, with a warning', () => {
    saveToStorage(companyAt(60), SAVE_KEY);
    const before = slots();
    expect(app().continueGame()).toBe(true);
    recordCrash('simulation', new Error('tick failed on load'));
    closeGame();
    const plan = currentPlan();
    expect(plan.primary).toMatchObject({ kind: 'manual' });
    expect(plan.notice).toMatchObject({ kind: 'suspect-only' });
    expect(describeNotice(plan)).toBe('The game did not start properly from this save last time. You can try it again; nothing will be deleted.');
    expect(slots()).toEqual(before);
    expect(app().continueGame(), 'trying again is allowed').toBe(true);
  });

  it('when both saves have failed, the newest is offered again rather than nothing', () => {
    twoSaves();
    const info = (key: string) => inspectSlot(key);
    const both = [info(SAVE_KEY), info(AUTOSAVE_KEY)];
    const failedAuto = { key: AUTOSAVE_KEY, stamp: both[1].stamp, attempts: 1, failed: true };
    expect(isSuspect(both[1], failedAuto)).toBe(true);
    expect(isSuspect(both[0], failedAuto)).toBe(false);
    // The guard holds one save at a time: after the manual save fails too, the autosave is the newest sound choice again.
    const failedManual = { key: SAVE_KEY, stamp: both[0].stamp, attempts: 1, failed: true };
    expect(planRecovery(both, failedManual)).toMatchObject({ primary: { kind: 'autosave' }, notice: { kind: 'suspect-skipped', skipped: { kind: 'manual' } } });
  });

  it('a save written again is a different save: the old suspicion does not carry over', () => {
    twoSaves();
    expect(app().continueGame()).toBe(true);
    recordCrash('app', new Error('failed on load'));
    closeGame();
    expect(currentPlan().primary).toMatchObject({ kind: 'manual' });
    saveToStorage(companyAt(300), AUTOSAVE_KEY);
    expect(currentPlan()).toMatchObject({ primary: { kind: 'autosave' }, notice: null });
  });

  it('a damaged guard record is ignored', () => {
    twoSaves();
    for (const text of ['garbage', '{}', '{"key":1}', 'null']) {
      store().setItem(LOAD_GUARD_KEY, text);
      expect(readLoadGuard()).toBeNull();
      expect(currentPlan().primary).toMatchObject({ kind: 'autosave' });
    }
  });
});

describe('the policy as a pure function', () => {
  const slot = (kind: 'manual' | 'autosave', seq: number, over: Partial<SlotInfo> = {}): SlotInfo => ({
    key: kind === 'manual' ? SAVE_KEY : AUTOSAVE_KEY, kind, kept: false, status: 'valid', reason: null, savedAt: new Date(Date.UTC(2026, 0, 1, 0, seq)), seq, stamp: `${kind}-${seq}`,
    summary: { company: 'Test Co', day: 1, time: '7:00 AM', cash: 1000 + seq, staff: 1, seed: 1, elapsedMinutes: seq * 10 }, ...over,
  });

  it('orders by the write counter, then time, then game time', () => {
    expect(compareNewest(slot('manual', 5), slot('autosave', 4))).toBeGreaterThan(0);
    expect(compareNewest(slot('manual', 0, { savedAt: new Date(10) }), slot('autosave', 0, { savedAt: new Date(20) }))).toBeLessThan(0);
    expect(compareNewest(slot('manual', 0, { savedAt: null }), slot('autosave', 0, { savedAt: null, summary: { ...slot('autosave', 9).summary! } }))).toBeLessThan(0);
  });

  it('gives the same plan for the same inputs, in any slot order', () => {
    const a = slot('manual', 3);
    const b = slot('autosave', 8);
    const c = slot('autosave', 9, { key: AUTOSAVE_KEY + KEPT_SUFFIX, kept: true });
    const empty: SlotInfo = { ...slot('manual', 0), key: SAVE_KEY + KEPT_SUFFIX, status: 'empty', summary: null, kept: true };
    const one = planRecovery([a, b, c, empty], null);
    const two = planRecovery([empty, c, b, a], null);
    expect(two).toEqual(one);
    expect(one.primary, 'a kept copy is never picked while a live slot can be loaded, even when it is newer').toBe(b);
    expect(one.others).toEqual([c, a]);
  });

  it('falls back to a kept copy only when no live slot can be loaded', () => {
    const kept = slot('autosave', 4, { key: AUTOSAVE_KEY + KEPT_SUFFIX, kept: true });
    const dead = slot('manual', 9, { status: 'corrupt', summary: null });
    expect(planRecovery([dead, kept], null)).toMatchObject({ primary: { kept: true }, unreadable: [dead] });
  });
});
