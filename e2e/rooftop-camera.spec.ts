import { test, expect, type Page } from '@playwright/test';

/**
 * Rooftop service camera (R13): during a real Mesquite Plaza call, Property, Watch Work and Detail at three moments,
 * with the inspector open: on the ground with the ladder, half way up it, and at the rooftop unit. Each shot must be a
 * composed view (cameraComposition found one that shows the subject, clear of the roof, parapets and UI cards) for the
 * rooftop group he is in. Shots: test-results/rooftop-camera/<moment>-<mode>-<w>x<h>.png.
 */

test.use({ actionTimeout: 20_000 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

const speed = (page: Page, v: 0 | 1 | 2 | 5) => page.evaluate((x) => window.__ego!.dispatch({ type: 'set-speed', speed: x }), v);

test('rooftop service camera', async ({ page }, info) => {
  test.setTimeout(900_000);
  const touch = !!info.project.use.hasTouch;
  const W = page.viewportSize()!.width;
  const H = page.viewportSize()!.height;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  if (touch) await page.getByTestId('new-game').tap();
  else await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  if (touch) await page.getByTestId('touch-tutorial-ok').tap();
  await speed(page, 0);
  await page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    window.__ego!.advanceMinutes(600 - s.clock.minute);
  });
  const jobId = await page.evaluate(() => {
    const e = window.__ego!;
    const s = e.getState() as S;
    for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') e.dispatch({ type: 'decline-lead', jobId: j.id });
    const id = e.spawnLead({ preferredLotId: 'cm-plaza', channel: 'direct', faultId: 'contactor' })!;
    e.dispatch({ type: 'accept-lead', jobId: id });
    e.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    return id;
  });
  await page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); return (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 120_000, polling: 30 });
  await page.evaluate((id) => window.__ego!.app.getState().select({ kind: 'job', id }), jobId);
  await speed(page, 1);

  const results: { moment: string; mode: string; shown: string; group: string | null; composed: boolean }[] = [];
  const shoot = async (moment: string, group: string) => {
    for (const mode of ['property', 'work', 'detail'] as const) {
      await page.evaluate(({ id, mode }) => (window.__ego!.app.getState() as S).setServiceView({ jobId: id, lotId: 'cm-plaza', mode }), { id: jobId, mode });
      await page.waitForTimeout(2600);
      const v = await page.evaluate(() => window.__egoServiceView as S);
      results.push({ moment, mode, shown: v?.mode, group: v?.roof ?? null, composed: !!v?.report });
      await page.screenshot({ path: `test-results/rooftop-camera/${moment}-${mode}-${W}x${H}.png` });
      expect(v?.report, `${moment} ${mode}: a composed view`).toBeTruthy();
      expect(v?.roof, `${moment} ${mode}: rooftop framing`).toBe(group);
    }
  };
  // On the ground with the ladder (carrying it to the wall).
  await page.waitForFunction(() => (window as S).__egoWorkerStage?.['emp-owner'] === 'roof:carry', null, { timeout: 120_000, polling: 20 });
  await page.waitForTimeout(1200);
  await speed(page, 0);
  await shoot('ground', 'ground');
  await speed(page, 1);
  // Half way up the ladder.
  await page.waitForFunction(() => (window as S).__egoWorkerStage?.['emp-owner'] === 'roof:climb', null, { timeout: 120_000, polling: 20 });
  await page.waitForTimeout(2500);
  await speed(page, 0);
  await shoot('ladder', 'ladder');
  await speed(page, 1);
  // At the rooftop unit, diagnosing.
  await page.waitForFunction((id) => (window.__ego!.getState() as S).jobs[id].status === 'diagnosing' && (window as S).__egoWorkerStage?.['emp-owner'] === 'roof:work', jobId, { timeout: 120_000 });
  await page.waitForTimeout(2500);
  await speed(page, 0);
  await shoot('roof', 'roof');
  console.log(JSON.stringify(results));
  expect(errors, errors.join('\n')).toHaveLength(0);
});
