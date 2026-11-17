import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Crash resilience: a rendering failure must cost the player only the part of the game that failed, never the page.
 *
 * Before the error boundaries, any exception while React rendered (the hiring bug of ed15557 was one) unmounted the
 * whole application and left an empty page. These tests break each part on purpose through the test hook
 * window.__ego.crash(scope) (a component that throws while rendering, placed inside each boundary; the 3D one is
 * inside the real canvas) and check what the player gets: a recovery screen that fits the screen, the rest of the
 * game still running, no save written or removed behind their back, and a way back to playing.
 *
 * Not covered here, deliberately: a lost WebGL context. It is not an exception, no boundary sees it, and it is
 * handled separately (the "Graphics paused" overlay); recovering from it is up to the browser and the device.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

const SHOT = (name: string) => `docs/screenshots/crash-recovery/${test.info().project.name}-${name}.png`;
const SIMULATED = /Simulated \w+ (rendering|simulation) failure \(window\.__ego\.crash\)/;

const touch = () => !!test.info().project.use.hasTouch;

/** A tap on touch devices, a click elsewhere. Either fails if something else covers the control. */
async function press(target: Locator, timeout = 15_000) {
  if (touch()) await target.tap({ timeout });
  else await target.click({ timeout });
}

async function game(page: Page) {
  return page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    const app = window.__ego!.app.getState() as S;
    return {
      screen: app.screen as string,
      panel: app.panel as string | null,
      speed: s.speed as number,
      cash: s.finance.cash as number,
      minutes: s.elapsedMinutes as number,
      employees: Object.values(s.employees).map((e: S) => e.id as string).sort(),
      jobs: Object.values(s.jobs).map((j: S) => `${j.id}:${j.status}`).sort(),
      mission: s.mission ? (s.mission.status as string) : null,
    };
  });
}

const saves = (page: Page) => page.evaluate(() => ({ save: localStorage.getItem('ego-hvac-v3:save'), autosave: localStorage.getItem('ego-hvac-v3:autosave') }));
const frame = (page: Page) => page.evaluate(() => window.__egoRender?.frame ?? 0);

/** The 3D world is drawing: the canvas is there and frames advance. */
async function expectWorldDrawing(page: Page) {
  await expect(page.locator('.app-world canvas')).toBeVisible();
  const f0 = await frame(page);
  await page.waitForFunction((start) => (window.__egoRender?.frame ?? 0) > start + 10, f0, { timeout: 30_000, polling: 100 });
}

/**
 * The recovery card is usable on this screen: inside the viewport side to side, never wider than the page, and
 * every button can be brought fully into view (the card's layer scrolls on short screens) at a size a finger can hit.
 */
async function expectUsable(page: Page, testId: string) {
  const card = page.getByTestId(testId);
  await expect(card).toBeVisible();
  const view = page.viewportSize()!;
  const box = (await card.boundingBox())!;
  expect(box.x, `${testId}: left edge on screen`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${testId}: right edge on screen (${view.width} wide)`).toBeLessThanOrEqual(view.width + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), 'the page does not scroll sideways').toBeLessThanOrEqual(view.width);
  /** Nothing else is drawn over the middle of it (the interface must not sit on top of a recovery card). */
  const onTop = (target: Locator) =>
    target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    });
  // From the top: the title can be read.
  await card.evaluate((el) => { el.scrollTo(0, 0); el.parentElement!.scrollTo(0, 0); });
  const title = card.locator('h2');
  await expect(title).toBeInViewport({ ratio: 1 });
  expect(await onTop(title), `${testId}: the title is not covered`).toBe(true);
  const buttons = card.locator('.recovery-actions button');
  expect(await buttons.count()).toBeGreaterThan(0);
  for (const b of await buttons.all()) {
    await b.scrollIntoViewIfNeeded();
    await expect(b).toBeInViewport({ ratio: 1 });
    const label = await b.textContent();
    expect(await onTop(b), `${testId}: "${label}" is not covered`).toBe(true);
    const r = (await b.boundingBox())!;
    expect(r.height, `"${label}" is tall enough to press`).toBeGreaterThanOrEqual(touch() ? 44 : 30);
    expect(r.width).toBeGreaterThanOrEqual(110);
  }
  // Anything that does not fit can be scrolled to: either the card or the layer it sits in scrolls.
  const fit = await card.evaluate((el) => {
    const layer = el.parentElement!;
    return { clipped: el.scrollHeight - el.clientHeight > 1 || layer.scrollHeight - layer.clientHeight > 1, scrolls: [el, layer].some((n) => /auto|scroll/.test(getComputedStyle(n).overflowY)) };
  });
  expect(!fit.clipped || fit.scrolls, `${testId}: content that does not fit can be scrolled to`).toBe(true);
  await card.evaluate((el) => { el.scrollTo(0, 0); el.parentElement!.scrollTo(0, 0); });
}

function watch(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const navigations: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
  return {
    navigations,
    /** Every error the page raised was one of the failures this test asked for. */
    onlySimulated: () => {
      expect(pageErrors.filter((e) => !SIMULATED.test(e)), 'unexpected page errors').toEqual([]);
      expect(consoleErrors.filter((e) => !SIMULATED.test(e) && !/\[crash\]/.test(e)), 'unexpected console errors').toEqual([]);
    },
  };
}

async function startCompany(page: Page) {
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 1 }));
  // Touch devices open a new game with the gesture tutorial over the bottom bar.
  if (touch()) {
    await expect(page.getByTestId('touch-tutorial')).toBeVisible();
    await press(page.getByTestId('touch-tutorial-ok'));
  }
}

test('a rendering failure in a panel, the interface, the 3D world or the whole app is recovered without losing the company', async ({ page }) => {
  test.setTimeout(600_000);
  const log = watch(page);
  await startCompany(page);
  const navsAtStart = log.navigations.length;
  await expectWorldDrawing(page);
  await expect(page.getByTestId('mission-card')).toBeVisible();
  const missionStage = await page.getByTestId('mission-card').getAttribute('data-stage');
  const start = await game(page);
  expect(start.mission).toBe('active');

  // ---- 1. One panel fails: only that panel is replaced. ----
  await page.evaluate(() => (window.__ego!.app.getState() as S).openPanel('employees'));
  await expect(page.getByTestId('panel-employees')).toBeVisible();
  await page.evaluate(() => window.__ego!.crash('panel'));
  await expectUsable(page, 'recovery-panel');
  await page.screenshot({ path: SHOT('01-panel') });
  await expect(page.getByTestId('panel-employees')).toHaveCount(0);
  await expect(page.getByTestId('hud-cash'), 'the rest of the interface is still there').toBeVisible();
  await expectWorldDrawing(page);
  expect((await game(page)).speed, 'a failed panel does not pause the game').toBe(1);
  // Try again: the panel comes back.
  await press(page.getByTestId('recovery-panel').getByTestId('recovery-retry'));
  await expect(page.getByTestId('panel-employees')).toBeVisible();
  await expect(page.getByTestId('recovery-panel')).toHaveCount(0);
  // A panel that keeps failing says so, and can be closed; another panel then opens normally.
  await page.evaluate(() => window.__ego!.crash('panel', true));
  await expect(page.getByTestId('recovery-panel')).toBeVisible();
  await press(page.getByTestId('recovery-panel').getByTestId('recovery-retry'));
  await expect(page.getByTestId('recovery-repeat')).toBeVisible();
  await expectUsable(page, 'recovery-panel');
  await page.evaluate(() => (window.__ego!.app.getState() as S).setCrashTest(null));
  await press(page.getByTestId('recovery-close'));
  await expect(page.getByTestId('recovery-panel')).toHaveCount(0);
  await page.evaluate(() => (window.__ego!.app.getState() as S).openPanel('finance'));
  await expect(page.getByTestId('panel-finance')).toBeVisible();
  await page.evaluate(() => (window.__ego!.app.getState() as S).openPanel(null));

  // ---- 2. The interface fails: the world keeps drawing, the game pauses, the controls can be restored. ----
  await page.evaluate(() => window.__ego!.crash('hud'));
  await expectUsable(page, 'recovery-hud');
  await expect(page.getByTestId('hud-cash')).toHaveCount(0);
  await expectWorldDrawing(page);
  expect((await game(page)).speed, 'the game is paused while the controls are gone').toBe(0);
  // The technical details: what failed and where, and nothing private.
  await press(page.getByTestId('crash-details').locator('summary'));
  const report = (await page.getByTestId('crash-report').textContent())!;
  expect(report).toContain('Where: hud');
  expect(report).toMatch(SIMULATED);
  expect(report).toContain('Campaign: seed 42');
  expect(report).toMatch(/Device: (phone|tablet|desktop)/);
  const privateData = await page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    return [s.company.name as string, ...Object.values(s.employees).map((e: S) => e.name as string), ...Object.values(s.customers).map((c: S) => c.name as string), location.host, location.origin, navigator.userAgent];
  });
  for (const value of privateData) expect(report, `"${value}" must not be in the report`).not.toContain(value);
  await expectUsable(page, 'recovery-hud');
  await page.screenshot({ path: SHOT('02-hud-details') });
  await press(page.getByTestId('recovery-hud').getByTestId('recovery-retry'));
  await expect(page.getByTestId('recovery-hud')).toHaveCount(0);
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  await expect(page.getByTestId('mission-card')).toBeVisible();
  // Resume with the game's own speed control.
  await press(page.getByTestId('speed-1'));
  expect((await game(page)).speed).toBe(1);

  // ---- 3. The 3D world fails (inside the real canvas): the interface carries on and the view can be restarted. ----
  await page.evaluate(() => window.__ego!.crash('world'));
  await expectUsable(page, 'recovery-world');
  await page.screenshot({ path: SHOT('03-world') });
  await expect(page.locator('.app-world canvas')).toHaveCount(0);
  await expect(page.getByTestId('hud-cash'), 'the interface is still running').toBeVisible();
  await expect(page.getByTestId('loading-screen'), 'nothing covers the recovery card').toHaveCount(0);
  // Removing the canvas releases its WebGL context (after half a second); that is not a device context loss.
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('context-lost'), 'tearing the canvas down is not reported as a lost context').toHaveCount(0);
  expect((await game(page)).speed, 'the game is paused while the world cannot be seen').toBe(0);
  // The interface really works: save through Settings, as the card says.
  const beforeManualSave = (await saves(page)).save;
  await press(page.getByTestId('world-settings'));
  await expect(page.getByTestId('panel-settings')).toBeVisible();
  await press(page.getByTestId('settings-save'));
  expect((await saves(page)).save, 'the player saved').not.toBe(beforeManualSave);
  await press(page.getByTestId('panel-settings').getByRole('button', { name: 'Close panel' }));
  await expect(page.getByTestId('panel-settings')).toBeHidden();
  // Restart the view: a new canvas, drawing again.
  await press(page.getByTestId('recovery-world').getByTestId('recovery-retry'));
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady && document.querySelector('.app-world canvas'), null, { timeout: 180_000 });
  await expect(page.getByTestId('recovery-world')).toHaveCount(0);
  await expectWorldDrawing(page);
  // A world that keeps failing says so and stays recoverable.
  await page.evaluate(() => window.__ego!.crash('world', true));
  await expect(page.getByTestId('recovery-world')).toBeVisible();
  await press(page.getByTestId('recovery-world').getByTestId('recovery-retry'));
  await expect(page.getByTestId('recovery-repeat')).toBeVisible({ timeout: 60_000 });
  await expectUsable(page, 'recovery-world');
  await page.evaluate(() => (window.__ego!.app.getState() as S).setCrashTest(null));
  await press(page.getByTestId('recovery-world').getByTestId('recovery-retry'));
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady && document.querySelector('.app-world canvas'), null, { timeout: 180_000 });
  await expectWorldDrawing(page);

  // ---- 4. The whole application fails: a recovery screen, not an empty page; nothing saved or deleted on its own. ----
  const beforeAppCrash = await game(page);
  const savedBefore = await saves(page);
  await page.evaluate(() => window.__ego!.crash('app'));
  await expectUsable(page, 'recovery-app');
  await page.screenshot({ path: SHOT('04-app') });
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByTestId('recovery-save-note')).toContainText('Reloading returns to the company saved today at');
  await page.waitForTimeout(1500);
  expect(await saves(page), 'no save was written or removed by the failure').toEqual(savedBefore);
  const during = await game(page);
  expect(during, 'the company is still in memory, and time has stopped').toEqual(beforeAppCrash);
  await press(page.getByTestId('recovery-app').getByTestId('recovery-retry'));
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady && document.querySelector('.app-world canvas'), null, { timeout: 180_000 });
  await expect(page.getByTestId('recovery-app')).toHaveCount(0);
  await expectWorldDrawing(page);
  const afterAll = await game(page);
  expect(afterAll.screen).toBe('game');
  expect(afterAll.cash).toBe(start.cash);
  expect(afterAll.employees).toEqual(start.employees);
  expect(afterAll.mission).toBe('active');
  expect(log.navigations.length - navsAtStart, 'the page was never reloaded or navigated').toBe(0);

  // ---- 5. Ordinary play still works after all of that. ----
  await press(page.getByTestId('speed-1'));
  // Mission 01 is where it was, and its next step works.
  await expect(page.getByTestId('mission-card')).toHaveAttribute('data-stage', missionStage!);
  await press(page.getByTestId('mission-open-call'));
  await press(page.getByTestId('accept-lead'));
  await expect(page.getByTestId('mission-card')).not.toHaveAttribute('data-stage', missionStage!);
  expect((await game(page)).jobs).not.toEqual(start.jobs);
  await page.evaluate(() => window.__ego!.app.getState().select(null));
  // Time runs.
  const t0 = (await game(page)).minutes;
  await page.waitForFunction((m) => (window.__ego!.getState() as S).elapsedMinutes > m + 1, t0, { timeout: 30_000 });
  // Hiring (the installer whose look used to blank the game), through the store's own action.
  const installer = await page.evaluate(() => ((window.__ego!.getState() as S).candidates as S[]).find((c) => c.role === 'installer').id as string);
  expect((await page.evaluate((id) => window.__ego!.dispatch({ type: 'hire', candidateId: id }), installer)).ok).toBe(true);
  const hired = await game(page);
  expect(hired.employees.length).toBe(start.employees.length + 1);
  await page.waitForFunction((ids) => ids.every((id) => !!window.__egoWorkers?.[id]), hired.employees, { timeout: 30_000 });
  await expectWorldDrawing(page);
  // Camera zoom (desktop wheel; camera-zoom.spec covers pinch).
  if (!touch()) {
    await page.evaluate(() => window.__ego!.app.getState().camera({ type: 'hq' }));
    await page.waitForTimeout(2500);
    const h0 = await page.evaluate(() => window.__egoRender!.cam[1]);
    await page.mouse.move(800, 500);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(45); }
    await page.waitForTimeout(600);
    const h1 = await page.evaluate(() => window.__egoRender!.cam[1]);
    expect(h1, `wheel zooms in (height ${h0.toFixed(1)} → ${h1.toFixed(1)} m)`).toBeLessThan(h0 * 0.85);
  }
  // Save, reload, continue: the company comes back as saved.
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  const beforeReload = await game(page);
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).save())).toBe(true);
  await page.reload();
  await page.getByTestId('continue-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  const afterReload = await game(page);
  expect({ ...afterReload, panel: null }).toEqual({ ...beforeReload, panel: null });
  await expectWorldDrawing(page);
  await page.screenshot({ path: SHOT('05-playing-after-recovery') });

  // The crash log kept the failures (newest last, capped), each attributed to the part that failed.
  const kept = await page.evaluate(() => window.__ego!.crashLog().map((r) => r.scope));
  expect(kept.length).toBeLessThanOrEqual(5);
  expect(kept).toContain('world');
  expect(kept[kept.length - 1]).toBe('app');
  log.onlySimulated();
});

test('a failed simulation step stops the game with a message and leaves the saves alone', async ({ page }) => {
  test.setTimeout(420_000);
  const log = watch(page);
  await startCompany(page);
  await page.evaluate(() => window.__ego!.advanceMinutes(45));
  // Saved paused, so the loaded company stands still and can be compared exactly.
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).save())).toBe(true);
  const saved = await game(page);
  // Play on past the save, so the difference between memory and the save is visible.
  await page.evaluate(() => window.__ego!.advanceMinutes(30));
  const manualSave = (await saves(page)).save;

  await page.evaluate(() => window.__ego!.crash('simulation'));
  await expectUsable(page, 'recovery-simulation');
  // (Read once the game has stopped: until then the 45-second autosave may still land.)
  const before = await saves(page);
  expect(before.save, 'the manual save is the one the player made').toBe(manualSave);
  await page.screenshot({ path: SHOT('06-simulation') });
  await expect(page.getByTestId('recovery-save-note')).toContainText('anything after that is not kept');
  const stopped = (await game(page)).minutes;
  // Nothing steps and nothing is saved from here: not on a timer, not when the page is hidden or left.
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
  await page.waitForTimeout(2000);
  expect((await game(page)).minutes).toBe(stopped);
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).save()), 'a save of the stopped state is refused').toBe(false);
  expect(await saves(page), 'the saves on the device are untouched').toEqual(before);
  await expectWorldDrawing(page);

  // Main menu without saving, then Continue: the company as it was last saved.
  await press(page.getByTestId('recovery-simulation').getByTestId('recovery-menu'));
  await expect(page.getByTestId('main-menu')).toBeVisible();
  expect(await saves(page)).toEqual(before);
  await page.getByTestId('continue-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  await expect(page.getByTestId('recovery-simulation')).toHaveCount(0);
  const back = await game(page);
  expect(back.minutes).toBe(saved.minutes);
  expect(back.cash).toBe(saved.cash);
  expect(back.employees).toEqual(saved.employees);
  // And it runs.
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 1 }));
  await page.waitForFunction((m) => (window.__ego!.getState() as S).elapsedMinutes > m + 1, back.minutes, { timeout: 30_000 });
  log.onlySimulated();
});

test('a failure that keeps coming back, and one that takes the recovery screen with it, still leave a way out', async ({ page }) => {
  test.setTimeout(420_000);
  const log = watch(page);
  await startCompany(page);
  await page.evaluate(() => window.__ego!.advanceMinutes(20));
  // Paused, so the company saved by the recovery screen can be compared exactly after Continue.
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  const playing = await game(page);

  // The whole app keeps failing: trying again says so, and "Save and go to the main menu" is offered.
  await page.evaluate(() => window.__ego!.crash('app', true));
  await expect(page.getByTestId('recovery-app')).toBeVisible();
  await press(page.getByTestId('recovery-app').getByTestId('recovery-retry'));
  await expect(page.getByTestId('recovery-repeat')).toBeVisible();
  await expectUsable(page, 'recovery-app');
  await page.screenshot({ path: SHOT('07-app-repeat') });
  await page.evaluate(() => (window.__ego!.app.getState() as S).setCrashTest(null));
  await press(page.getByTestId('recovery-app').getByTestId('recovery-menu'));
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('recovery-app')).toHaveCount(0);
  // That button saved, as it said: Continue returns to the moment of the failure.
  await page.getByTestId('continue-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  const back = await game(page);
  expect(back.minutes).toBe(playing.minutes);
  expect(back.cash).toBe(playing.cash);
  await expectWorldDrawing(page);

  // The worst case: the app fails and so does its recovery screen. A plain page takes over; the saves are as they were.
  const before = await saves(page);
  await page.evaluate(() => window.__ego!.crash('fatal'));
  const fallback = page.getByTestId('recovery-static');
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText('has not been changed or deleted');
  await page.screenshot({ path: SHOT('08-static') });
  const view = page.viewportSize()!;
  const button = fallback.getByTestId('recovery-reload');
  await expect(button).toBeInViewport({ ratio: 1 });
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(view.width);
  expect(await saves(page)).toEqual(before);
  await press(button);
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('continue-game')).toBeEnabled();
  expect(await saves(page)).toEqual(before);
  log.onlySimulated();
});
