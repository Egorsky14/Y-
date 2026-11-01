import { test } from '@playwright/test';

/**
 * Rooftop evidence (G2): in-game camera views of Mesquite Plaza and its rooftop units, its roof deck close up,
 * Desert Ridge Offices, and a modern home's rooftop package unit (with no ground condenser), from a new game.
 * Shots go to test-results/rooftop-sites/.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

test('rooftop sites', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  await page.evaluate(() => {
    window.__ego!.dispatch({ type: 'set-speed', speed: 0 });
    const s = window.__ego!.getState() as S;
    window.__ego!.advanceMinutes(600 - s.clock.minute);
  });
  await page.addStyleTag({ content: '.toasts { display: none !important; }' });
  const view = async (name: string, target: { x: number; z: number }, distance: number, azimuth: number, elevation: number) => {
    await page.evaluate((c) => window.__ego!.app.getState().camera({ type: 'focus', target: { x: c.target.x, z: c.target.z }, distance: c.distance, azimuth: c.azimuth, elevation: c.elevation, targetY: 0 } as S), { target, distance, azimuth, elevation });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `test-results/rooftop-sites/${name}.png` });
  };
  await view('1-plaza', { x: 168, z: -55 }, 62, -1.2, 0.55);
  await view('2-plaza-roof', { x: 171, z: -62 }, 16, -0.6, 0.62);
  await view('3-plaza-access', { x: 170, z: -73 }, 18, -2.6, 0.35);
  await view('4-office', { x: 170, z: -150 }, 70, -1.1, 0.5);
  // a-n-4 is a modern home (cityLayout style cycle): its package unit is on the single-storey slab.
  await view('5-modern-roof', { x: -26, z: -73 }, 26, -0.7, 0.6);
  if (errors.length) throw new Error(errors.join('\n'));
});
