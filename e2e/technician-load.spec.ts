import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Load scenario (handoff 03 "Load/performance"): ten technicians and ten ladder-rack vans, all dispatched at once to
 * ground calls, Mesquite Plaza's rooftop unit and a modern home's rooftop unit, played at 2x. Records frame times
 * (requestAnimationFrame intervals) and renderer draw calls/triangles while the calls are under way, then advances
 * three game days with the Operations Center on (calls dispatched as they come) and checks nobody is stuck, every
 * van is home or working, and the books reconcile. Writes test-results/technician-load/<label>.json.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;
const LABEL = process.env.SHOWCASE_LABEL ?? 'load';

test('ten technicians with rooftop and ground calls', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  const dispatched = await page.evaluate(() => {
    const e = window.__ego!;
    const s = e.getState() as S;
    e.advanceMinutes(540 - s.clock.minute);
    const owner = s.employees['emp-owner'];
    const van = s.vehicles['veh-1'];
    for (let i = 1; i <= 9; i++) {
      s.employees[`emp-l${i}`] = { ...structuredClone(owner), id: `emp-l${i}`, name: `Tech ${i}`, isOwner: false, look: 300 + i * 613, status: 'idle', jobId: undefined, vehicleId: undefined, position: { x: 40 + i, z: 36 } };
      s.vehicles[`veh-l${i}`] = { ...structuredClone(van), id: `veh-l${i}`, nickname: `Unit ${i + 1}`, stall: i, status: 'parked', jobId: undefined, driverId: undefined, passengerIds: [], route: undefined, upgrades: ['ladder-rack'] };
    }
    s.company.hqUpgrades.push('operations-center');
    e.dispatch({ type: 'set-automation', diagnostics: true, closing: true });
    for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') e.dispatch({ type: 'decline-lead', jobId: j.id });
    const lots = ['cm-plaza', 'a-n-4', 'b-n-1', 'n-o-1', 'a-s-2', 'b-s-3', 'c-n-1', 'c-s-2', 's-o-1', 'a-n-1'];
    const techs = ['emp-owner', ...Array.from({ length: 9 }, (_, i) => `emp-l${i + 1}`)];
    const vans = ['veh-1', ...Array.from({ length: 9 }, (_, i) => `veh-l${i + 1}`)];
    let ok = 0;
    lots.forEach((lot, i) => {
      const id = e.spawnLead({ preferredLotId: lot, channel: 'direct' });
      if (!id) return;
      e.dispatch({ type: 'accept-lead', jobId: id });
      if (e.dispatch({ type: 'dispatch', jobId: id, technicianId: techs[i], vehicleId: vans[i] }).ok) ok++;
    });
    e.advanceMinutes(0.01);
    return ok;
  });
  expect(dispatched).toBe(10);
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 2 }));
  // Let the vans arrive, then sample while the crews are on site.
  await page.waitForFunction(() => Object.values((window.__ego!.getState() as S).vehicles).filter((v: S) => v.status === 'onsite').length >= 6, null, { timeout: 180_000 });
  await page.evaluate(() => window.__ego!.app.getState().camera({ type: 'reset' } as S));
  await page.waitForTimeout(3000);
  const sample = await page.evaluate(
    () =>
      new Promise<{ mean: number; p95: number; worst: number; frames: number; calls: number; triangles: number; onsite: number; workers: number }>((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        const t0 = last;
        let maxCalls = 0;
        let maxTris = 0;
        const tick = (now: number) => {
          times.push(now - last);
          last = now;
          const r = window.__egoRender!;
          maxCalls = Math.max(maxCalls, r.calls);
          maxTris = Math.max(maxTris, r.triangles);
          if (now - t0 < 8000) requestAnimationFrame(tick);
          else {
            const sorted = [...times].sort((a, b) => a - b);
            const s = window.__ego!.getState() as S;
            resolve({ mean: times.reduce((a, b) => a + b, 0) / times.length, p95: sorted[Math.floor(sorted.length * 0.95)], worst: sorted[sorted.length - 1], frames: times.length, calls: maxCalls, triangles: maxTris, onsite: Object.values(s.vehicles).filter((v: S) => v.status === 'onsite').length, workers: window.__egoRender!.workers });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.screenshot({ path: `test-results/technician-load/${LABEL}-overview.png` });

  // Three game days with automation on: calls dispatched as they come, decisions the owner would make answered.
  const days = await page.evaluate(() => {
    const e = window.__ego!;
    const s = e.getState() as S;
    const end = s.clock.day + 3;
    let stuck = 0;
    while ((e.getState() as S).clock.day < end) {
      const st = e.getState() as S;
      const idleTechs = Object.values(st.employees).filter((x: S) => x.role === 'technician' && x.status === 'idle' && !x.jobId) as S[];
      const freeVans = Object.values(st.vehicles).filter((v: S) => v.status === 'parked' && !v.jobId) as S[];
      for (const j of Object.values(st.jobs) as S[]) {
        if (j.status === 'lead') e.dispatch({ type: 'accept-lead', jobId: j.id });
        if (j.status === 'accepted' && j.kind !== 'replacement' && idleTechs.length && freeVans.length) e.dispatch({ type: 'dispatch', jobId: j.id, technicianId: idleTechs.pop().id, vehicleId: freeVans.pop().id });
        if (j.attention && !j.attention.resolved) {
          if (j.attention.kind === 'replacement-approval') e.dispatch({ type: 'submit-quote', jobId: j.id, quote: { recommendation: 'repair' } });
          else if (j.attention.kind === 'uncertain-diagnosis') e.dispatch({ type: 'choose-diagnosis', jobId: j.id, faultId: j.diagnosisOptions[0] });
          else e.dispatch({ type: 'ack-attention', jobId: j.id });
        }
        if ((j.status === 'awaiting-diagnosis' || j.status === 'quoted') && !(j.attention && !j.attention.resolved)) stuck++;
      }
      e.advanceMinutes(15);
    }
    const st = e.getState() as S;
    const completed = Object.values(st.jobs).filter((j: S) => j.status === 'completed').length;
    const roofDone = Object.values(st.jobs).filter((j: S) => j.status === 'completed' && (st.customers[j.customerId].lotId === 'cm-plaza' || st.customers[j.customerId].equipment.type === 'package-unit')).length;
    const packingOverAfterHours = Object.values(st.vehicles).filter((v: S) => v.packUp).length;
    return { completed, roofDone, stuck, packingOverAfterHours, cash: st.finance.cash };
  });
  mkdirSync('test-results/technician-load', { recursive: true });
  const result = { label: LABEL, viewport: page.viewportSize(), sample, days };
  writeFileSync(`test-results/technician-load/${LABEL}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  expect(sample.onsite).toBeGreaterThanOrEqual(6);
  expect(days.stuck).toBe(0);
  expect(days.completed).toBeGreaterThan(10);
  expect(errors, errors.join('\n')).toHaveLength(0);
});
