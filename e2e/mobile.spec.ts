import { test, expect, type Page, type CDPSession } from '@playwright/test';

/**
 * Mobile playtest: runs in the emulated phone projects (touch, coarse pointer, mobile viewport).
 * Plays a complete service job with taps only, checks the touch camera (drag and pinch) without
 * page scrolling or zooming, the compact layout, the static vehicle preview (one WebGL context),
 * and save, reload and continue. Emulation is not a real phone: see docs/release/MOBILE_BETA.md.
 */

// A tap that cannot reach its target (covered or off-screen) must fail, not wait for the suite timeout.
test.use({ actionTimeout: 20_000 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;
async function state<T, A = undefined>(page: Page, fn: (s: S, arg: A) => T, arg?: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => new Function('s', 'arg', `return (${src})(s, arg)`)(window.__ego!.getState()! as S, a) as T,
    [fn.toString(), arg] as const,
  );
}
async function waitForJob(page: Page, id: string, statuses: string[]) {
  await page.waitForFunction(([j, list]) => list.includes((window.__ego?.getState() as S)?.jobs[j]?.status), [id, statuses] as const, { timeout: 120_000, polling: 200 });
}

/** Layout checks: nothing wider than the screen, every visible control on screen and finger-sized. */
async function auditLayout(page: Page, where: string) {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const problems: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1) problems.push(`horizontal overflow ${document.documentElement.scrollWidth}>${vw}`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, input, select, .job-pin'))) {
      const b = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (b.width === 0 || b.height === 0 || st.visibility === 'hidden') continue;
      if (el.closest('.world-labels, .panel-tabs, .ledger')) continue;
      const name = (el.dataset.testid || el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24);
      const inScroller = !!el.closest('.panel-body, .inspector-body, .menu');
      if (!inScroller && (b.right > vw + 1 || b.bottom > vh + 1 || b.left < -1 || b.top < -1)) problems.push(`off-screen: ${name}`);
      if (!inScroller && Math.min(b.width, b.height) < 36) problems.push(`small target: ${name} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return problems;
  });
  expect(r, where).toEqual([]);
}

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
}
const cam = (page: Page) => page.evaluate(() => window.__egoRender!.cam);
const pageScroll = (page: Page) => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, scale: window.visualViewport?.scale ?? 1, top: document.scrollingElement?.scrollTop ?? 0 }));

test('mobile: a complete job by touch, touch camera, save and continue', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // Welcome screen.
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('share-game')).toBeVisible();
  await expect(page.getByTestId('version')).toContainText('Public beta');
  await auditLayout(page, 'menu');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').tap();

  // Loading screen, then the world. Phones start on a mobile preset, never High/Ultra.
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  await expect(page.getByTestId('loading-screen')).toBeHidden({ timeout: 5_000 });
  const quality = await page.evaluate(() => window.__ego!.app.getState().settings.quality);
  expect(['low', 'medium']).toContain(quality);
  await expect(page.getByTestId('touch-tutorial')).toBeVisible();
  await page.getByTestId('touch-tutorial-ok').tap();
  await page.getByTestId('speed-controls').locator('button').first().tap(); // pause
  await auditLayout(page, 'game HUD');

  // Touch camera: one-finger drag pans, pinch zooms; the page itself never scrolls or zooms.
  const box = (await page.locator('.app-world canvas').first().boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const before = await cam(page);
  await touch(cdp, 'touchStart', [[cx, cy]]);
  for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', [[cx - i * 18, cy - i * 10]]);
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(600);
  const afterDrag = await cam(page);
  expect(Math.hypot(afterDrag[0] - before[0], afterDrag[2] - before[2])).toBeGreaterThan(2);
  const dist = (c: number[]) => Math.hypot(c[0], c[1], c[2]);
  const d0 = dist(afterDrag);
  await touch(cdp, 'touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', [[cx - 30 - i * 14, cy], [cx + 30 + i * 14, cy]]);
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(600);
  expect(Math.abs(dist(await cam(page)) - d0)).toBeGreaterThan(1);
  expect(await pageScroll(page)).toEqual({ x: 0, y: 0, scale: 1, top: 0 });
  await page.getByTestId('cam-reset').tap();
  await page.waitForTimeout(1500);

  // A service call: tap the glowing pin, accept, dispatch.
  const leadId: string = await state(page, (s) => (Object.values(s.jobs) as S[]).find((j) => j.status === 'lead').id);
  const faultId: string = await state(page, (s, id) => s.jobs[id].faultId, leadId);
  const startCash: number = await state(page, (s) => s.finance.cash);
  await page.locator('.job-pin').first().tap();
  await expect(page.getByTestId('inspector')).toBeVisible();
  await page.getByTestId('accept-lead').tap();
  await page.getByTestId('dispatch-go').tap();
  expect(await state(page, (s) => s.vehicles['veh-1'].status)).toBe('enroute');
  await auditLayout(page, 'dispatched');

  // Diagnose, quote, complete and get paid, all by tapping.
  await page.getByTestId('speed-5').tap();
  await waitForJob(page, leadId, ['awaiting-diagnosis']);
  await page.getByTestId('speed-1').tap();
  await page.getByTestId(`diagnosis-${faultId}`).tap();
  await page.getByTestId('confirm-diagnosis').tap();
  expect(await state(page, (s, id) => s.jobs[id].diagnosisCorrect, leadId)).toBe(true);
  await page.getByTestId('quote-repair').tap();
  await page.getByTestId('present-quote').tap();
  await page.getByTestId('speed-5').tap();
  await waitForJob(page, leadId, ['completed']);
  expect(await state(page, (s) => s.finance.cash)).toBeGreaterThan(startCash);
  await page.getByTestId('speed-controls').locator('button').first().tap();

  // Fleet on a phone: a static preview image, no second WebGL context.
  await page.getByTestId('nav-fleet').tap();
  await expect(page.getByTestId('panel-fleet')).toBeVisible();
  await page.getByRole('button', { name: 'Marketplace' }).tap();
  await expect(page.getByTestId('vehicle-preview-static')).toBeVisible();
  expect(await page.locator('canvas').count()).toBe(1);
  await auditLayout(page, 'fleet panel');
  await page.getByTestId('panel-fleet').getByRole('button', { name: 'Close panel' }).tap();

  // Save, reload, continue: the same company comes back. The job sheet is still open; close it
  // first, as a player would (the camera and save buttons step aside while a sheet is open).
  await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).tap();
  const saved = await state(page, (s) => ({ cash: s.finance.cash, jobs: Object.keys(s.jobs).length, day: s.clock.day }));
  await page.getByTestId('save-game').tap();
  await expect(page.getByTestId('toasts')).toContainText('Game saved');
  await page.reload();
  await expect(page.getByTestId('continue-game')).toBeVisible();
  await page.getByTestId('continue-game').tap();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  const restored = await state(page, (s) => ({ cash: s.finance.cash, jobs: Object.keys(s.jobs).length, day: s.clock.day }));
  expect(restored.jobs).toBe(saved.jobs);
  expect(restored.day).toBe(saved.day);
  expect(restored.cash).toBeCloseTo(saved.cash, 2);

  expect(errors).toEqual([]);
});
