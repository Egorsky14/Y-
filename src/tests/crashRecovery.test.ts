import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CRASH_LOG_KEY, CRASH_LOG_LIMIT, appendReport, browserFamily, buildReport, clearCrashLog, crashLog, formatReport, recordCrash, scrubLine, type CrashReport } from '@/app/diagnostics';
import { useApp } from '@/app/store';
import { startGameLoop } from '@/app/gameLoop';
import { ErrorBoundary } from '@/ui/overlays/ErrorBoundary';
import { AUTOSAVE_KEY, SAVE_KEY, deserialize } from '@/persistence/save';

/**
 * Crash resilience, the parts that run without a browser: what a crash report keeps and leaves out, the rule that
 * recovery never writes over or removes a save on its own, and the simulation-step guard. The rendering failures
 * themselves (a real React tree and a real canvas failing, and each recovery screen) are e2e/crash-recovery.spec.ts.
 */

/** A minimal localStorage for the persistence layer (which looks it up at call time). */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

const g = globalThis as { localStorage?: Storage };

beforeEach(() => {
  g.localStorage = fakeStorage();
  clearCrashLog();
  useApp.setState({ engine: null, screen: 'menu', simFault: null, crashTest: null, panel: null, selection: null });
});
afterEach(() => {
  delete g.localStorage;
});

describe('crash report: private data is scrubbed', () => {
  it('cuts addresses down to a file name and position', () => {
    expect(scrubLine('    at Worker (https://hvaccompanyownerv3.vercel.app/assets/index-B3x9.js?token=abc123#frag:41:1203)')).toBe('at Worker (index-B3x9.js:41:1203)');
    expect(scrubLine('at http://127.0.0.1:4173/assets/r3f-Dk2.js:9:88')).toBe('at r3f-Dk2.js:9:88');
    expect(scrubLine('at render (http://localhost:5173/src/world/characters/Worker.tsx?t=1731:120:9)')).toBe('at render (Worker.tsx:120:9)');
    expect(scrubLine('Failed to fetch https://example.com/private/customer?id=77')).toBe('Failed to fetch [page]');
  });

  it('cuts local paths down to a file name and hides email addresses', () => {
    expect(scrubLine('at C:\\Users\\someone\\Projects\\game\\src\\App.tsx:10:2')).toBe('at App.tsx:10:2');
    expect(scrubLine('at /Users/someone/work/game/src/App.tsx:10:2')).toBe('at App.tsx:10:2');
    expect(scrubLine('at /home/someone/game/src/store.ts:3:1')).toBe('at store.ts:3:1');
    expect(scrubLine('owner someone@example.com could not be loaded')).toBe('owner [email] could not be loaded');
  });

  it('keeps only the browser family and major version of a user agent', () => {
    expect(browserFamily('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.55 Safari/537.36')).toBe('Chrome 141');
    expect(browserFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1')).toBe('Safari 18');
    expect(browserFamily('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0')).toBe('Edge 141');
    expect(browserFamily('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0')).toBe('Firefox 140');
    expect(browserFamily('something else entirely')).toBe('Other');
  });

  it('bounds the size of a report whatever is thrown', () => {
    const huge = new Error('x'.repeat(5000));
    huge.stack = `Error: ${'x'.repeat(5000)}\n${Array.from({ length: 200 }, (_, i) => `    at fn${i} (https://host.example/a/b/c.js:${i}:1)`).join('\n')}`;
    const r = buildReport('world', huge, { componentStack: Array.from({ length: 200 }, (_, i) => `    at Component${i}`).join('\n') });
    expect(r.message.length).toBeLessThanOrEqual(300);
    expect(r.stack.length).toBeLessThanOrEqual(12);
    expect(r.componentStack.length).toBeLessThanOrEqual(16);
    expect(r.stack[0]).toBe('at fn0 (c.js:0:1)');
    expect(JSON.stringify(r)).not.toContain('host.example');
  });

  it('describes anything that can be thrown', () => {
    expect(buildReport('hud', 'a plain string').message).toBe('a plain string');
    expect(buildReport('hud', { code: 7 }).message).toBe('{"code":7}');
    expect(buildReport('hud', undefined).name).toBe('NonError');
    expect(buildReport('hud', null).message).toBe('null');
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(() => buildReport('hud', loop)).not.toThrow();
    const typed = buildReport('panel', new TypeError("Cannot read properties of undefined (reading 'skin')"));
    expect(typed.name).toBe('TypeError');
    expect(typed.message).toBe("Cannot read properties of undefined (reading 'skin')");
  });

  it('a report from a running company holds no names, no money and nothing else from the save', () => {
    useApp.getState().newGame(42);
    const engine = useApp.getState().engine!;
    for (const c of engine.state.candidates.slice(0, 2)) engine.dispatch({ type: 'hire', candidateId: c.id });
    useApp.getState().openPanel('employees');
    const s = engine.state;
    const report = recordCrash('world', new TypeError("Cannot read properties of undefined (reading 'skin')"), '\n    at Worker\n    at Workers\n    at GameScene');
    const text = formatReport(report);
    const stored = g.localStorage!.getItem(CRASH_LOG_KEY)!;

    const names = [s.company.name, ...Object.values(s.employees).map((e) => e.name), ...Object.values(s.customers).map((c) => c.name), ...s.candidates.map((c) => c.name)];
    expect(names.length).toBeGreaterThan(20);
    for (const where of [text, stored]) {
      for (const name of names) expect(where, `"${name}" must not be in a crash report`).not.toContain(name);
      expect(where).not.toContain(String(s.finance.cash));
    }
    // What it does hold: enough to find the failure again.
    expect(report.context).toMatchObject({ screen: 'game', panel: 'employees', selection: null, photoMode: false });
    expect(report.context!.game).toMatchObject({ seed: 42, day: s.clock.day, employees: Object.keys(s.employees).length, schema: s.schemaVersion });
    expect(text).toContain('Where: world');
    expect(text).toContain("TypeError: Cannot read properties of undefined (reading 'skin')");
    expect(text).toContain('seed 42');
    expect(text).toContain('at Workers');
    // The whole report is a fixed set of fields: nothing was copied wholesale from the game state.
    expect(Object.keys(report).sort()).toEqual(['at', 'build', 'componentStack', 'context', 'count', 'device', 'id', 'message', 'name', 'scope', 'stack']);
    expect(Object.keys(report.context!.game!).sort()).toEqual(['day', 'employees', 'jobs', 'minute', 'schema', 'seed', 'speed', 'vehicles']);
  });
});

describe('crash log', () => {
  const report = (message: string, scope: CrashReport['scope'] = 'world') => buildReport(scope, new Error(message));

  it('keeps the newest few and counts a repeat instead of storing it again', () => {
    let log: CrashReport[] = [];
    for (let i = 0; i < 9; i++) log = appendReport(log, report(`failure ${i}`));
    expect(log.map((r) => r.message)).toEqual(['failure 4', 'failure 5', 'failure 6', 'failure 7', 'failure 8']);
    expect(log.length).toBe(CRASH_LOG_LIMIT);
    for (let i = 0; i < 300; i++) log = appendReport(log, report('failure 8'));
    expect(log.length).toBe(CRASH_LOG_LIMIT);
    expect(log[log.length - 1].count).toBe(301);
    // The same message from a different part of the game is a different failure.
    expect(appendReport(log, report('failure 8', 'hud')).length).toBe(CRASH_LOG_LIMIT);
    expect(appendReport(log, report('failure 8', 'hud'))[CRASH_LOG_LIMIT - 1]).toMatchObject({ scope: 'hud', count: 1 });
  });

  it('one failure seen by a boundary and as a script error is one report (the one from the boundary)', () => {
    // The 3D renderer reports the error (a script error) and then passes it to the boundary around the canvas.
    let log = appendReport([], report('scene failed', 'runtime'));
    log = appendReport(log, report('scene failed', 'world'));
    expect(log.map((r) => r.scope)).toEqual(['world']);
    // The other order: the echo is counted, not stored.
    log = appendReport(log, report('scene failed', 'runtime'));
    expect(log.map((r) => [r.scope, r.count])).toEqual([['world', 2]]);
    expect(appendReport(log, report('something else', 'runtime')).map((r) => r.scope)).toEqual(['world', 'runtime']);
  });

  it('a failure that repeats every frame is one stored report, and a flood of different ones is capped', () => {
    for (let i = 0; i < 500; i++) recordCrash('runtime', new Error('thrown in a frame callback'));
    expect(crashLog().length).toBe(1);
    expect(crashLog()[0].count).toBe(500);
    for (let i = 0; i < 200; i++) recordCrash('runtime', new Error(`different ${i}`));
    expect(crashLog().length).toBe(CRASH_LOG_LIMIT);
    expect(JSON.parse(g.localStorage!.getItem(CRASH_LOG_KEY)!).length).toBeLessThanOrEqual(CRASH_LOG_LIMIT);
  });

  it('recording never throws, with storage blocked or missing', () => {
    g.localStorage = { ...fakeStorage(), setItem: () => { throw new Error('QuotaExceededError'); }, getItem: () => { throw new Error('SecurityError'); } };
    expect(() => recordCrash('app', new Error('one'))).not.toThrow();
    delete g.localStorage;
    expect(() => recordCrash('app', new Error('two'))).not.toThrow();
    expect(recordCrash('app', new Error('three')).message).toBe('three');
  });
});

describe('error boundary', () => {
  it('switches to its recovery view when a child throws while rendering', () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const fallback = () => 'recovery';
    const boundary = new ErrorBoundary({ scope: 'panel', fallback, children: 'children' });
    expect(boundary.render()).toBe('children');
    boundary.state = { failed: true, report: null, failures: 1 };
    expect(boundary.render()).toBe('recovery');
  });
});

describe('recovery never changes a save on its own', () => {
  /** A running company with a manual save and an older-looking autosave on the device. */
  function companyWithSaves() {
    useApp.getState().newGame(42);
    const app = useApp.getState();
    app.engine!.advanceMinutes(90);
    expect(app.save()).toBe(true);
    g.localStorage!.setItem(AUTOSAVE_KEY, g.localStorage!.getItem(SAVE_KEY)!);
    app.engine!.advanceMinutes(30);
    return { save: g.localStorage!.getItem(SAVE_KEY)!, autosave: g.localStorage!.getItem(AUTOSAVE_KEY)! };
  }
  const slots = () => ({ save: g.localStorage!.getItem(SAVE_KEY), autosave: g.localStorage!.getItem(AUTOSAVE_KEY) });

  it('recording a rendering failure writes the crash log and nothing else', () => {
    const before = companyWithSaves();
    recordCrash('app', new Error('render failed'));
    recordCrash('world', new Error('scene failed'));
    expect(slots()).toEqual(before);
    expect(useApp.getState().engine, 'the company is still in memory').toBeTruthy();
    expect(useApp.getState().screen).toBe('game');
  });

  it('after a simulation fault nothing can be saved over the saves, and leaving keeps them', () => {
    const before = companyWithSaves();
    useApp.getState().setSimFault(recordCrash('simulation', new Error('tick failed')));
    expect(useApp.getState().save(), 'a manual save is refused').toBe(false);
    expect(slots()).toEqual(before);
    useApp.getState().leaveWithoutSaving();
    expect(useApp.getState().screen).toBe('menu');
    expect(slots()).toEqual(before);
    // Continue brings back the company exactly as it was saved, and the fault is gone.
    expect(useApp.getState().continueGame()).toBe(true);
    expect(useApp.getState().simFault).toBeNull();
    expect(useApp.getState().engine!.state.elapsedMinutes).toBe(deserialize(before.save).elapsedMinutes);
  });
});

describe('simulation step guard', () => {
  /** Runs the game loop against a hand-cranked requestAnimationFrame. */
  function crank() {
    const w = globalThis as unknown as Record<string, unknown>;
    const saved = { raf: w.requestAnimationFrame, caf: w.cancelAnimationFrame, doc: w.document, win: w.window };
    let queued: ((t: number) => void) | null = null;
    let now = performance.now();
    w.requestAnimationFrame = (cb: (t: number) => void) => { queued = cb; return 1; };
    w.cancelAnimationFrame = () => { queued = null; };
    w.document = { addEventListener: () => undefined, removeEventListener: () => undefined, visibilityState: 'visible' };
    w.window = { addEventListener: () => undefined, removeEventListener: () => undefined };
    const stop = startGameLoop();
    return {
      frame: (ms = 100) => { const cb = queued; queued = null; now += ms; cb?.(now); return queued !== null; },
      stop: () => { stop(); Object.assign(w, { requestAnimationFrame: saved.raf, cancelAnimationFrame: saved.caf, document: saved.doc, window: saved.win }); },
    };
  }

  it('an exception in the simulation step stops the step, not the loop, and is reported once', () => {
    useApp.getState().newGame(42);
    const engine = useApp.getState().engine!;
    engine.dispatch({ type: 'set-speed', speed: 1 });
    const saves = { save: g.localStorage!.getItem(SAVE_KEY), autosave: g.localStorage!.getItem(AUTOSAVE_KEY) };
    const loop = crank();
    try {
      expect(loop.frame()).toBe(true);
      const ticked = engine.state.elapsedMinutes;
      expect(ticked, 'the loop steps the simulation').toBeGreaterThan(0);

      const tick = engine.tick.bind(engine);
      let calls = 0;
      engine.tick = () => { calls++; throw new Error('division by zero in pricing'); };
      expect(loop.frame(), 'the next frame is still requested').toBe(true);
      const fault = useApp.getState().simFault!;
      expect(fault).toMatchObject({ scope: 'simulation', message: 'division by zero in pricing' });
      expect(calls).toBe(1);

      // Stopped: no further steps, no autosave of a state that may be half-updated, however long it sits there.
      engine.tick = tick;
      for (let i = 0; i < 600; i++) loop.frame();
      expect(engine.state.elapsedMinutes).toBe(ticked);
      expect({ save: g.localStorage!.getItem(SAVE_KEY), autosave: g.localStorage!.getItem(AUTOSAVE_KEY) }).toEqual(saves);
      expect(crashLog().filter((r) => r.scope === 'simulation').length).toBe(1);

      // A loaded game runs again.
      expect(useApp.getState().continueGame()).toBe(true);
      useApp.getState().engine!.dispatch({ type: 'set-speed', speed: 1 });
      const start = useApp.getState().engine!.state.elapsedMinutes;
      loop.frame();
      expect(useApp.getState().engine!.state.elapsedMinutes).toBeGreaterThan(start);
    } finally {
      loop.stop();
    }
  });
});
