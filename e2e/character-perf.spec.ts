import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Character performance, in the production build, measured the same way for any build of the game (PERF_URL points this
 * at another copy, which is how the baseline is measured): frame-interval percentiles, draw calls, triangles, renderer
 * memory counts, the characters' own CPU time per frame where the build reports it, and how long the game took to load.
 *
 * Scenarios: the opening; ten technicians working in front of a close camera; two technicians on rooftop jobs at once.
 * PERF_CPU=4 slows the page's CPU fourfold through the browser's emulation, to approximate a midrange phone's CPU. It does
 * not emulate a phone's GPU, heat or memory: real hardware is still the real test.
 *
 * Numbers depend on this machine, and vsync caps the frame interval from below; compare runs on the same machine.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;
const LABEL = process.env.PERF_LABEL ?? 'run';
const URL_ = process.env.PERF_URL ?? '/';
const CPU = Number(process.env.PERF_CPU ?? 1);

async function sample(page: Page, seconds: number) {
  return page.evaluate(
    (ms) =>
      new Promise<Record<string, number | null>>((resolve) => {
        const times: number[] = [];
        const w = window as S;
        if ('__egoCharCost' in w || w.__egoCharCostEnabled) w.__egoCharCost = { ms: 0 };
        let last = performance.now();
        const t0 = last;
        const tick = (now: number) => {
          times.push(now - last);
          last = now;
          if (now - t0 < ms) requestAnimationFrame(tick);
          else {
            const s = [...times].sort((a, b) => a - b);
            const at = (q: number) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
            const r = window.__egoRender!;
            resolve({
              frames: times.length,
              meanMs: times.reduce((a, b) => a + b, 0) / times.length,
              p50Ms: at(0.5),
              p95Ms: at(0.95),
              p99Ms: at(0.99),
              worstMs: s[s.length - 1],
              over33ms: times.filter((t) => t > 33.4).length,
              characterCpuMsPerFrame: w.__egoCharCost ? w.__egoCharCost.ms / times.length : null,
              calls: r.calls,
              triangles: r.triangles,
              geometries: r.geometries,
              textures: r.textures,
              jsHeapMB: (performance as S).memory ? (performance as S).memory.usedJSHeapSize / 1048576 : null,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds * 1000,
  );
}

test('character frame-time benchmark', async ({ page, context }) => {
  test.setTimeout(900_000);
  if (CPU > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  }
  await page.addInitScript(() => { (window as S).__egoCharCostEnabled = true; (window as S).__egoCharCost = { ms: 0 }; });
  const t0 = Date.now();
  await page.goto(URL_);
  await page.getByTestId('seed-input').fill('42');
  const t1 = Date.now();
  const touch = !!(await page.evaluate(() => matchMedia('(pointer: coarse)').matches));
  if (touch) await page.getByTestId('new-game').tap();
  else await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 400_000 });
  const load = { titleMs: t1 - t0, newGameToSceneMs: Date.now() - t1 };
  const assets = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /technician|characters\/tex/.test(e.name)).map((e) => ({ file: e.name.split('/').pop(), kb: Math.round((e as PerformanceResourceTiming).encodedBodySize / 1024), ms: Math.round(e.duration) })));
  const tutorial = page.getByTestId('touch-tutorial-ok');
  if (await tutorial.isVisible().catch(() => false)) await tutorial.tap();
  await page.addStyleTag({ content: '.mission-card { display: none !important; }' });
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 1 }));
  await page.waitForTimeout(4000);
  const opening = await sample(page, 6);

  // Ten technicians in front of a close camera, all animating.
  await page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    const owner = s.employees['emp-owner'];
    for (let i = 0; i < 10; i++) {
      const id = `emp-bench-${i}`;
      s.employees[id] = { ...structuredClone(owner), id, name: `Bench ${i}`, isOwner: false, look: 1000 + i * 977, status: 'idle', position: { x: 40 + (i % 5) * 1.6, z: 30 + Math.floor(i / 5) * 2.2 } };
    }
    window.__ego!.advanceMinutes(0.01);
    window.__ego!.app.getState().camera({ type: 'focus', target: { x: 43.2, z: 31.1 }, distance: 9, azimuth: -Math.PI / 2 + 0.3, elevation: 0.35, targetY: 0 } as S);
  });
  await page.waitForTimeout(4000);
  const tenTechs = await sample(page, 6);
  mkdirSync('test-results/character-perf', { recursive: true });
  await page.screenshot({ path: `test-results/character-perf/${LABEL}-ten-techs.png` });

  // Those ten out of the way; two rooftop jobs at once, watched from nearby.
  const started = await page.evaluate(() => {
    const e = window.__ego!;
    const s = e.getState() as S;
    for (let i = 0; i < 10; i++) delete s.employees[`emp-bench-${i}`];
    e.dispatch({ type: 'mission-skip' });
    for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') e.dispatch({ type: 'decline-lead', jobId: j.id });
    const owner = s.employees['emp-owner'];
    s.employees['emp-second'] = { ...structuredClone(owner), id: 'emp-second', name: 'Second', isOwner: false, look: 4242, status: 'idle' };
    s.vehicles['veh-2'] = { ...structuredClone(s.vehicles['veh-1']), id: 'veh-2', name: 'Unit 2' };
    const go = (lotId: string, tech: string, veh: string) => {
      const id = e.spawnLead({ preferredLotId: lotId, channel: 'direct', faultId: 'contactor' })!;
      const st = e.getState() as S;
      st.customers[st.jobs[id].customerId].trust = 100;
      e.dispatch({ type: 'accept-lead', jobId: id });
      return e.dispatch({ type: 'dispatch', jobId: id, technicianId: tech, vehicleId: veh }).ok;
    };
    return [go('cm-plaza', 'emp-owner', 'veh-1'), go('a-n-4', 'emp-second', 'veh-2')];
  });
  await page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); const s = window.__ego!.getState() as S; return s.vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 300_000, polling: 50 });
  await page.waitForFunction(() => /carry|raise|climb/.test(String((window as S).__egoWorkerStage?.['emp-owner'])), null, { timeout: 200_000, polling: 100 });
  await page.evaluate(() => {
    const w = window.__egoWorkers!['emp-owner'];
    window.__ego!.app.getState().camera({ type: 'focus', target: { x: w.x, z: w.z }, distance: 16, azimuth: 0.9, elevation: 0.7, targetY: 0 } as S);
  });
  await page.waitForTimeout(1500);
  const rooftops = await sample(page, 14);
  const stages = await page.evaluate(() => (window as S).__egoWorkerStage);

  const result = { label: LABEL, cpuThrottle: CPU, viewport: page.viewportSize(), load, assets, opening, tenTechs, rooftops: { jobsStarted: started, stagesAtEnd: stages, ...rooftops } };
  writeFileSync(`test-results/character-perf/${LABEL}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
});
