import { test, expect } from '@playwright/test';

/**
 * The test build (`vite build --mode e2e`, what every spec but production-release and crash-recovery runs against)
 * carries exactly the hooks the specs use and nothing else: in particular no crash injection, which has its own
 * build. The production build's side of this is e2e/production-release.spec.ts.
 */

test('the test build exposes the test hooks the specs use, and only those', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => Object.keys(window.__ego ?? {}).sort())).toEqual(['advanceMinutes', 'app', 'build', 'crashLog', 'dispatch', 'getState', 'spawnLead']);
  expect(await page.evaluate(() => typeof window.__ego!.crash), 'crash injection is not in this build').toBe('undefined');
  // And they work: this is the build the rest of the suite depends on.
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  // Paused first, so the only time that passes is the half hour asked for.
  await page.evaluate(() => { window.__ego!.dispatch({ type: 'set-speed', speed: 0 }); });
  const before = await page.evaluate(() => (window.__ego!.getState() as unknown as { elapsedMinutes: number }).elapsedMinutes);
  await page.evaluate(() => { window.__ego!.advanceMinutes(30); });
  expect(await page.evaluate(() => (window.__ego!.getState() as unknown as { elapsedMinutes: number }).elapsedMinutes)).toBeCloseTo(before + 30, 5);
  // Arming a crash through the store does nothing here either.
  await page.evaluate(() => (window.__ego!.app.getState() as unknown as { setCrashTest: (t: unknown) => void }).setCrashTest({ scope: 'app', sticky: true }));
  await page.waitForTimeout(700);
  await expect(page.getByTestId('recovery-app')).toHaveCount(0);
  await expect(page.getByTestId('hud-cash')).toBeVisible();
});
