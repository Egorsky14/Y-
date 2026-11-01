import { test, expect, type Page } from '@playwright/test';

/**
 * Character evidence: close in-game shots of the lead technician standing at HQ, walking up a front
 * yard, kneeling over the unit with the meter (diagnosis) and working with the wrench (repair), at a
 * real service call. Shots go to test-results/technician-showcase/<SHOWCASE_LABEL>-<shot>.png so the
 * same spec captures the before and after sets. The game is paused for each shot (clips freeze).
 */

test.use({ actionTimeout: 20_000 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

const LOT = process.env.SHOWCASE_LOT ?? 'n-o-1';
const LABEL = process.env.SHOWCASE_LABEL ?? 'shot';

async function frame(page: Page, azimuthOffset: number, distance: number, targetY: number, elevation = 0.18) {
  await page.evaluate(
    ({ azimuthOffset, distance, targetY, elevation }) => {
      const w = window.__egoWorkers?.['emp-owner'];
      if (!w) throw new Error('no worker');
      const head = (window as S).__egoWorkerHeading?.['emp-owner'] ?? 0;
      // The rig orbits a ground point: aim at the body by taking the ground point on the sight line through it.
      const az = head + azimuthOffset;
      const dir = { x: Math.sin(az) * Math.cos(elevation), y: Math.sin(elevation), z: Math.cos(az) * Math.cos(elevation) };
      const cam = { x: w.x + dir.x * distance, y: targetY + dir.y * distance, z: w.z + dir.z * distance };
      const reach = cam.y / dir.y;
      window.__ego!.app.getState().camera({ type: 'focus', target: { x: cam.x - dir.x * reach, z: cam.z - dir.z * reach }, distance: reach, azimuth: az, elevation, targetY: 0 } as S);
    },
    { azimuthOffset, distance, targetY, elevation },
  );
  await page.waitForTimeout(1600);
}

test('technician showcase', async ({ page }) => {
  const shot = (name: string) => page.screenshot({ path: `test-results/technician-showcase/${LABEL}-${name}.png` });
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  await page.evaluate(() => {
    window.__ego!.dispatch({ type: 'set-speed', speed: 0 });
    const s = window.__ego!.getState() as S;
    window.__ego!.advanceMinutes(600 - s.clock.minute);
  });
  // Hide the HUD for clean character shots.
  await page.addStyleTag({ content: '.top-hud, .action-bar, .world-controls, .toasts, [data-testid="inspector"], .world-labels, .labels-layer { display: none !important; }' });
  await page.waitForTimeout(1500);

  // 1. Standing at HQ (idle), front three-quarter and profile.
  await frame(page, 0.5, 3.4, 1.0, 0.32);
  await shot('1-standing-front');
  await frame(page, Math.PI / 2, 3.4, 1.0, 0.32);
  await shot('2-standing-side');

  // A service call at a house: dispatch, drive, arrive.
  const jobId = await page.evaluate((lotId) => {
    const s = window.__ego!.getState() as S;
    for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') window.__ego!.dispatch({ type: 'decline-lead', jobId: j.id });
    const id = window.__ego!.spawnLead({ preferredLotId: lotId, channel: 'direct' })!;
    const st = window.__ego!.getState() as S;
    st.customers[st.jobs[id].customerId].trust = 100;
    window.__ego!.dispatch({ type: 'accept-lead', jobId: id });
    window.__ego!.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    return id;
  }, LOT);
  await page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); return (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 90_000, polling: 30 });
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 1 }));
  // 2. Walking up the yard with the bag (mid-stride).
  await page.waitForFunction(() => (window as S).__egoWorkerStage?.['emp-owner'] === 'walk', null, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  await frame(page, 1.1, 3.4, 0.95, 0.32);
  await shot('3-walking');
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 1 }));

  // 3. Kneeling at the unit with the meter (diagnosis).
  await page.waitForFunction((id) => (window.__ego!.getState() as S).jobs[id].status === 'diagnosing' && (window as S).__egoWorkerStage?.['emp-owner'] === 'work', jobId, { timeout: 60_000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  await frame(page, 2.3, 2.8, 0.7, 0.3);
  await shot('4-kneeling-diagnosis');
  await frame(page, -2.3, 2.8, 0.7, 0.3);
  await shot('5-kneeling-other-side');

  // 4. Repair with the wrench.
  await page.evaluate((id) => {
    const e = window.__ego!;
    const s = e.getState() as S;
    e.advanceMinutes(s.jobs[id].phaseRemaining + 0.1);
    const j = (e.getState() as S).jobs[id];
    e.dispatch({ type: 'choose-diagnosis', jobId: id, faultId: j.faultId });
    e.dispatch({ type: 'submit-quote', jobId: id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
  }, jobId);
  const status = await page.evaluate((id) => (window.__ego!.getState() as S).jobs[id].status, jobId);
  expect(['repairing', 'completed']).toContain(status);
  if (status === 'repairing') {
    await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 1 }));
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
    await frame(page, 2.3, 2.8, 0.7, 0.3);
    await shot('6-repair');
  }
});
