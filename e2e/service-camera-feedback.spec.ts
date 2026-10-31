import { test, expect, type Page } from '@playwright/test';

/**
 * Service camera state feedback, on desktop, laptop, 1024×768 and phones held either way:
 *  - the inspector's watch button sits under the job status, says "Watch technician" while the
 *    service camera is off and "Watching: <shot>" (pressed, teal) while it is on at this job, and
 *    follows Property / Watch Work / Detail as the camera bar switches them;
 *  - leaving with the bar's ✕ (or the button) restores it quietly; switching shots, however fast,
 *    never raises a notice;
 *  - Overview, picking another property and panning away end it with one "Service camera off"
 *    notice, never a stack of them;
 *  - the button, the notice and the bottom-row controls stay unobstructed.
 */

test.use({ actionTimeout: 20_000 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

const LOT = 'n-o-1';
const OFF = 'Service camera off';

async function press(page: Page, testId: string, touch: boolean) {
  if (touch) await page.getByTestId(testId).tap();
  else await page.getByTestId(testId).click();
}

const watchButton = (page: Page) => page.getByTestId('watch-technician');
const offNotices = (page: Page) => page.evaluate((title) => (window.__ego!.app.getState() as S).toasts.filter((t: S) => t.title === title).length, OFF);
const serviceMode = (page: Page) => page.evaluate(() => (window.__ego!.app.getState() as S).serviceView?.mode ?? null);

async function expandCard(page: Page, touch: boolean) {
  if (await page.locator('[data-testid="inspector"].compact').count()) await press(page, 'inspector-compact', touch);
  await page.waitForTimeout(300);
}

/**
 * The element is on screen and is the topmost element at its centre (nothing covers it). Inside the inspector it may
 * first be scrolled to, as a player would on a short screen (750×340: the open card is a few rows tall).
 */
async function unobstructed(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return `${sel}: missing`;
    if (el.closest('.inspector-body')) el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return `${sel}: not shown`;
    if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) return `${sel}: off screen ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top && (top === el || el.contains(top)) ? 'ok' : `${sel}: covered by ${top?.className}`;
  }, selector);
}

/** The "Service camera off" toast overlaps none of the inspector, the camera bar, the top HUD or the bottom row. */
async function noticeOverlaps(page: Page) {
  return page.evaluate((title) => {
    const toast = Array.from(document.querySelectorAll<HTMLElement>('.toasts > *')).find((t) => t.textContent?.includes(title));
    if (!toast) return ['no notice shown'];
    const a = toast.getBoundingClientRect();
    const problems: string[] = [];
    if (a.left < 0 || a.top < 0 || a.right > innerWidth + 0.5 || a.bottom > innerHeight + 0.5) problems.push('notice off screen');
    for (const sel of ['[data-testid="inspector"]', '[data-testid="service-camera-bar"]', '.top-hud > *', '.action-bar', '.world-controls']) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const ox = Math.min(a.right, r.right) - Math.max(a.left, r.left);
        const oy = Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top);
        if (ox > 1 && oy > 1) problems.push(`notice overlaps ${sel} by ${Math.round(ox)}x${Math.round(oy)}`);
      }
    }
    return problems;
  }, OFF);
}

test('service camera: inspector state and off notice', async ({ page }, info) => {
  const touch = !!info.project.use.hasTouch;
  const W = page.viewportSize()!.width;
  const H = page.viewportSize()!.height;
  const shot = (name: string) => page.screenshot({ path: `test-results/service-feedback/${name}-${W}x${H}.png` });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await press(page, 'new-game', touch);
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  if (touch) await page.getByTestId('touch-tutorial-ok').tap();
  await page.evaluate(() => {
    window.__ego!.dispatch({ type: 'set-speed', speed: 0 });
    const s = window.__ego!.getState() as S;
    window.__ego!.advanceMinutes(600 - s.clock.minute);
  });
  const jobId = await page.evaluate((lotId) => {
    const s = window.__ego!.getState() as S;
    for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') window.__ego!.dispatch({ type: 'decline-lead', jobId: j.id });
    const id = window.__ego!.spawnLead({ preferredLotId: lotId })!;
    const st = window.__ego!.getState() as S;
    st.customers[st.jobs[id].customerId].trust = 100;
    window.__ego!.dispatch({ type: 'accept-lead', jobId: id });
    window.__ego!.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    return id;
  }, LOT);
  await page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); return (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 90_000, polling: 30 });
  await page.evaluate((id) => window.__ego!.app.getState().select({ kind: 'job', id }), jobId);
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 1 }));

  // 1. Off: "Watch technician", not pressed, under the job status and above the job log, unobstructed.
  await expect(watchButton(page)).toHaveText('Watch technician');
  await expect(watchButton(page)).toHaveAttribute('aria-pressed', 'false');
  const order = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="watch-technician"]')!.getBoundingClientRect().top;
    const log = document.querySelector('[data-testid="inspector"] .log')?.getBoundingClientRect().top ?? Infinity;
    return { b, log };
  });
  expect(order.b, 'watch button above the job log').toBeLessThan(order.log);
  expect(await unobstructed(page, '[data-testid="watch-technician"]')).toBe('ok');
  await shot('1-inactive');

  // 2. On: the card collapses, the bar appears; opened again, the button shows the shot, pressed and teal.
  await press(page, 'watch-technician', touch);
  await page.waitForFunction(() => (window as unknown as { __egoServiceView?: { reason: string } }).__egoServiceView?.reason === 'arrived', null, { timeout: 40_000, polling: 100 });
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  await expect(page.getByTestId('service-camera-bar')).toBeVisible();
  await expandCard(page, touch);
  await expect(watchButton(page)).toHaveText('Watching: Work');
  await expect(watchButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(watchButton(page)).toHaveClass(/watching/);
  expect(await unobstructed(page, '[data-testid="watch-technician"]')).toBe('ok');
  await page.waitForTimeout(2000);
  await shot('2-active-work');

  // 3. The label follows the bar, and the bar's buttons stay reachable with the card open.
  for (const [mode, label] of [['property', 'Property'], ['detail', 'Detail'], ['work', 'Work']] as const) {
    expect(await unobstructed(page, `[data-testid="service-view-${mode}"]`)).toBe('ok');
    await press(page, `service-view-${mode}`, touch);
    await expect(watchButton(page)).toHaveText(`Watching: ${label}`);
    expect(await serviceMode(page)).toBe(mode);
    if (mode === 'detail') {
      await page.waitForTimeout(2000);
      await shot('3-active-detail');
    }
  }
  // Rapid switching: no notice, the last shot wins.
  for (const mode of ['property', 'detail', 'work', 'property', 'detail'] as const) await press(page, `service-view-${mode}`, touch);
  await expect(watchButton(page)).toHaveText('Watching: Detail');
  expect(await offNotices(page), 'notices after switching shots').toBe(0);

  // 4. Leaving with the bar's ✕: back to "Watch technician", no notice.
  await press(page, 'service-view-exit', touch);
  await expect(page.getByTestId('service-camera-bar')).toHaveCount(0);
  await expect(watchButton(page)).toHaveText('Watch technician');
  await expect(watchButton(page)).toHaveAttribute('aria-pressed', 'false');
  // Pressing the active button leaves too, quietly.
  await press(page, 'watch-technician', touch);
  await expandCard(page, touch);
  await expect(watchButton(page)).toHaveText('Watching: Work');
  await press(page, 'watch-technician', touch);
  await expect(watchButton(page)).toHaveText('Watch technician');
  await page.waitForTimeout(500);
  expect(await offNotices(page), 'notices after leaving on purpose').toBe(0);

  // 5. Overview ends it with one notice; HQ straight after adds none.
  await press(page, 'watch-technician', touch);
  await expect(page.getByTestId('service-camera-bar')).toBeVisible();
  // Phones hide the camera buttons while the card is open: the player closes it first (that keeps the service camera on).
  if (!(await page.getByTestId('cam-reset').isVisible())) {
    await page.evaluate(() => window.__ego!.app.getState().select(null));
    await expect(page.getByTestId('service-camera-bar')).toBeVisible();
  }
  await press(page, 'cam-reset', touch);
  await expect(page.getByTestId('service-camera-bar')).toHaveCount(0);
  expect(await offNotices(page), 'notices after Overview').toBe(1);
  await expect(page.locator('.toasts')).toContainText(OFF);
  await expect(page.locator('.toasts')).toContainText('Select Watch technician to return.');
  await page.waitForTimeout(500); // the toast slides in from 12 px left of its place
  expect(await noticeOverlaps(page), 'notice layout').toEqual([]);
  expect(await unobstructed(page, '[data-testid="cam-reset"]')).toBe('ok');
  await shot('4-off-notice');
  await press(page, 'cam-hq', touch);
  expect(await offNotices(page), 'notices after Overview then HQ').toBe(1);

  // 6. Picking another property ends it: still one notice while the first is on screen; a new one after it is dismissed.
  await page.evaluate((id) => window.__ego!.app.getState().select({ kind: 'job', id }), jobId);
  await expandCard(page, touch);
  await press(page, 'watch-technician', touch);
  await expect(page.getByTestId('service-camera-bar')).toBeVisible();
  await page.evaluate(() => window.__ego!.app.getState().select({ kind: 'lot', id: 'hq' }));
  await expect(page.getByTestId('service-camera-bar')).toHaveCount(0);
  expect(await offNotices(page), 'notices after picking another property').toBe(1);
  await page.evaluate((title) => {
    const app = window.__ego!.app.getState() as S;
    for (const t of app.toasts) if (t.title === title) app.dismissToast(t.id);
  }, OFF);

  // 7. Panning away from the site ends it, with the notice again.
  await page.evaluate((id) => window.__ego!.app.getState().select({ kind: 'job', id }), jobId);
  await expandCard(page, touch);
  await press(page, 'watch-technician', touch);
  await expect(page.getByTestId('service-camera-bar')).toBeVisible();
  await page.waitForTimeout(2500);
  // The drag runs over open ground (the earlier toasts cleared, clear of the top HUD and the bottom row).
  await page.evaluate(() => {
    const app = window.__ego!.app.getState() as S;
    for (const t of app.toasts) app.dismissToast(t.id);
  });
  const cx = Math.round(W * 0.35);
  const [y0, y1] = [Math.round(H * 0.3), Math.round(H * 0.75)];
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  for (let n = 0; n < 10 && (await serviceMode(page)); n++) {
    if (touch) {
      await cdp!.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: y0 }] });
      for (let i = 1; i <= 12; i++) {
        await cdp!.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: Math.round(y0 + ((y1 - y0) * i) / 12) }] });
        await page.waitForTimeout(16);
      }
      await cdp!.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(cx, y0);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(cx, y0 + ((y1 - y0) * i) / 12);
      await page.mouse.up();
    }
    await page.waitForTimeout(400);
  }
  expect(await serviceMode(page), 'service camera after panning away').toBeNull();
  expect(await offNotices(page), 'notices after panning away').toBe(1);
  await expandCard(page, touch);
  await expect(watchButton(page)).toHaveText('Watch technician');
  await expect(watchButton(page)).toHaveAttribute('aria-pressed', 'false');

  expect(errors).toEqual([]);
});
