import { test, expect, type Page } from '@playwright/test';

/**
 * Rooftop call persistence and speed (R06, R11) in the real game: save half way up the ladder, reload the page and
 * continue: the technician resumes on the ladder (not back at the van, not teleported to the roof) with the ladder
 * still footed at the wall; then the rest of the call at 5×, saving and reloading again on the way down. The whole
 * sequence still plays (climb, roof, descent, stow), the van leaves only with the ladder back on its rack, and the
 * job's money is booked once. Shots: test-results/rooftop-persistence/.
 */

test.use({ actionTimeout: 20_000 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

const speed = (page: Page, v: 0 | 1 | 2 | 5) => page.evaluate((x) => window.__ego!.dispatch({ type: 'set-speed', speed: x }), v);
const stage = (page: Page) => page.evaluate(() => (window as S).__egoWorkerStage?.['emp-owner'] as string | undefined);
const tech = (page: Page) => page.evaluate(() => window.__egoWorkers?.['emp-owner']);
async function saveAndReload(page: Page) {
  await speed(page, 0);
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).save())).toBe(true);
  await page.reload();
  await page.getByTestId('continue-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
}

test('rooftop call: save/load mid-climb and mid-descent, 5x', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  await speed(page, 0);
  await page.addStyleTag({ content: '.toasts { display: none !important; }' });
  const jobId = await page.evaluate(() => {
    const e = window.__ego!;
    const s = e.getState() as S;
    e.advanceMinutes(600 - s.clock.minute);
    for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') e.dispatch({ type: 'decline-lead', jobId: j.id });
    const id = e.spawnLead({ preferredLotId: 'cm-plaza', channel: 'direct', faultId: 'contactor' })!;
    (e.getState() as S).customers['cust-cm-plaza'].trust = 100;
    e.dispatch({ type: 'accept-lead', jobId: id });
    e.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    return id;
  });
  await page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); return (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 120_000, polling: 30 });
  await speed(page, 1);

  // 1. Half way up the ladder: save, reload, continue.
  await page.waitForFunction(() => (window as S).__egoWorkerStage?.['emp-owner'] === 'roof:climb', null, { timeout: 120_000, polling: 20 });
  await page.waitForTimeout(2500);
  const before = await tech(page);
  const statusBefore = await page.evaluate((id) => (window.__ego!.getState() as S).jobs[id].status, jobId);
  await saveAndReload(page);
  const resumed = await stage(page);
  const after = await tech(page);
  const statusAfter = await page.evaluate((id) => (window.__ego!.getState() as S).jobs[id].status, jobId);
  console.log('mid-climb save:', statusBefore, JSON.stringify(before), '→ after reload:', statusAfter, resumed, JSON.stringify(after));
  expect(statusAfter).toBe(statusBefore);
  await page.evaluate(() => {
    const w = window.__egoWorkers!['emp-owner'];
    window.__ego!.app.getState().camera({ type: 'focus', target: { x: w.x + 3, z: w.z - 6 }, distance: 14, azimuth: Math.PI + 0.9, elevation: 0.4, targetY: 0 } as S);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/rooftop-persistence/1-resumed-mid-climb.png' });
  // Resumed on the ladder (or just past it), at height: not back at the van, not on the roof yet.
  expect(resumed, 'resumes on the ladder').toMatch(/roof:(climb|mount|transfer)/);
  expect(after!.y, 'technician still up the ladder').toBeGreaterThan(0.5);
  expect(Math.abs(after!.y - before!.y), 'close to where he was').toBeLessThan(1.6);

  // 2. The rest at 5×: decisions as they come, saving and reloading again on the way down.
  await speed(page, 5);
  const seen = new Set<string>();
  let reloadedDown = false;
  for (let i = 0; i < 3000; i++) {
    const st = await page.evaluate((id) => {
      const s = window.__ego!.getState() as S;
      const j = s.jobs[id];
      if (j.status === 'awaiting-diagnosis') window.__ego!.dispatch({ type: 'choose-diagnosis', jobId: id, faultId: j.faultId });
      if (j.status === 'quoted') window.__ego!.dispatch({ type: 'submit-quote', jobId: id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
      return { job: j.status, van: s.vehicles['veh-1'].status, stage: (window as S).__egoWorkerStage?.['emp-owner'] as string | undefined };
    }, jobId);
    if (st.stage) seen.add(st.stage);
    if (!reloadedDown && st.job === 'completed' && st.stage === 'roof:climb') {
      reloadedDown = true;
      await saveAndReload(page);
      expect(await stage(page), 'resumes on the way down').toMatch(/roof:(climb|dismount|retract|transfer)/);
      await page.screenshot({ path: 'test-results/rooftop-persistence/2-resumed-mid-descent.png' });
      await speed(page, 5);
    }
    if (st.job === 'completed' && st.van !== 'onsite') break;
    await page.waitForTimeout(100);
  }
  expect(reloadedDown, 'saved and reloaded on the way down').toBe(true);
  for (const s of ['roof:transfer', 'roof:roof-walk', 'roof:work', 'roof:collect', 'roof:climb', 'roof:lower', 'roof:stow']) expect([...seen], s).toContain(s);
  // Money booked once: one diagnostic fee, one repair, one parts entry for the job.
  const ledger = await page.evaluate((id) => (window.__ego!.getState() as S).finance.ledger.filter((l: S) => l.jobId === id).map((l: S) => l.memo + '|' + l.category) as string[], jobId);
  expect(ledger.filter((l) => l.startsWith('Diagnostic fee')).length).toBe(1);
  expect(ledger.filter((l) => l.startsWith('Repair')).length).toBe(1);
  expect(ledger.filter((l) => l.endsWith('|parts')).length).toBe(1);
  expect(errors, errors.join('\n')).toHaveLength(0);
});
