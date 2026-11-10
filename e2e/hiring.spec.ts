import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * P0 regression: hiring an installer "kicked the player out of the game".
 *
 * Cause: a new hire's look is an unsigned 32-bit name hash, and the character model decoded it with signed shifts. For
 * about half of all names (hash 2^31 or more) the face index went negative, drawing the new employee at headquarters
 * threw during React's render, and with no error boundary React unmounted the whole app: a blank page, game gone.
 * In campaign seed 42 the installer (and the dispatcher) have such names; the technicians do not, which is why the
 * gameplay spec's technician hire never caught it.
 *
 * This spec drives the real UI: hire the installer, the dispatcher and a technician (the HQ holds four with the owner),
 * check the game stays up and draws them, money moves once per hire, the limit holds, then save, reload and continue.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

const SHOT = (name: string) => `docs/screenshots/hiring/${test.info().project.name}-${name}.png`;

async function game(page: Page) {
  return page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    const app = window.__ego!.app.getState() as S;
    return {
      screen: app.screen as string,
      cash: s.finance.cash as number,
      employees: Object.values(s.employees).map((e: S) => ({ id: e.id as string, name: e.name as string, role: e.role as string, look: e.look as number })),
      onboarding: (s.finance.ledger as S[]).filter((l) => String(l.memo).startsWith('Onboarding')).map((l) => ({ memo: l.memo as string, amount: l.amount as number })),
      candidates: (s.candidates as S[]).map((c) => ({ id: c.id as string, name: c.name as string, role: c.role as string, wage: c.hourlyWage as number, look: c.look as number })),
      day: s.clock.day as number,
      milestones: (s.milestones as S[]).filter((m) => m.achievedDay !== undefined).map((m) => m.id as string),
    };
  });
}

/** The scene is up and drawing: frames advance and every employee has a drawn figure. */
async function expectDrawn(page: Page, ids: string[]) {
  const f0 = await page.evaluate(() => window.__egoRender?.frame ?? 0);
  await page.waitForFunction(
    ([list, start]) => (window.__egoRender?.frame ?? 0) > start + 20 && list.every((id) => !!window.__egoWorkers?.[id]),
    [ids, f0] as const,
    { timeout: 30_000, polling: 100 },
  );
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByTestId('main-menu')).toHaveCount(0);
}

/** Flies in close to the new hires standing at headquarters, checks each is on screen, and photographs them. */
async function closeUp(page: Page, ids: string[], name: string) {
  const at = await page.evaluate((list) => list.map((id) => window.__egoWorkers![id]), ids);
  const cx = at.reduce((s, p) => s + p.x, 0) / at.length;
  const cz = at.reduce((s, p) => s + p.z, 0) / at.length;
  await page.evaluate(([x, z]) => window.__ego!.app.getState().camera({ type: 'focus', target: { x, z }, targetY: 1, distance: 9, azimuth: 0.5, elevation: 0.32, service: true } as S), [cx, cz] as const);
  await page.waitForTimeout(2500);
  const cam = await page.evaluate(() => ({ cam: window.__egoRender!.cam, cmd: JSON.stringify((window.__ego!.app.getState() as S).cameraCommand) }));
  const off = Math.hypot(cam.cam[0] - cx, cam.cam[2] - cz);
  expect(off, `the camera came in to the staff (${off.toFixed(1)} m off; command ${cam.cmd})`).toBeLessThan(15);
  const view = page.viewportSize()!;
  for (const id of ids) {
    const p = await page.evaluate((w) => (window as S).__egoProject(w.x, w.y + 1, w.z), await page.evaluate((i) => window.__egoWorkers![i], id));
    expect(p.x > 0 && p.x < view.width && p.y > 0 && p.y < view.height, `${id} is in frame (${Math.round(p.x)}, ${Math.round(p.y)})`).toBe(true);
  }
  await page.screenshot({ path: SHOT(name) });
}

/** A tap on touch devices, a click elsewhere. */
async function press(target: Locator, timeout?: number) {
  if (test.info().project.use.hasTouch) await target.tap({ timeout });
  else await target.click({ timeout });
}

async function clearCelebrations(page: Page) {
  const c = page.getByTestId('celebration');
  for (let i = 0; i < 12 && (await c.count()) > 0; i++) await press(c.first(), 5_000).catch(() => undefined);
}

async function openHiringMarket(page: Page) {
  await clearCelebrations(page);
  if ((await page.getByTestId('panel-employees').count()) === 0) await press(page.getByTestId('nav-employees'));
  await expect(page.getByTestId('panel-employees')).toBeVisible();
  await press(page.getByRole('button', { name: /Hiring market/ }));
}

test('hiring an installer, a dispatcher and a technician keeps the game running, and they survive a save', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  const navigations: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 1 }));
  // Touch devices open a new game with the gesture tutorial over the bottom bar.
  if (test.info().project.use.hasTouch) {
    await expect(page.getByTestId('touch-tutorial')).toBeVisible();
    await press(page.getByTestId('touch-tutorial-ok'));
  }
  const start = await game(page);
  const navsAtStart = navigations.length;

  // The candidates this test is about: seed 42's installer and dispatcher have looks of 2^31 or more.
  const installer = start.candidates.find((c) => c.role === 'installer')!;
  const dispatcher = start.candidates.find((c) => c.role === 'dispatcher')!;
  const technician = start.candidates.find((c) => c.role === 'technician')!;
  expect(installer.look, 'the seed still produces the installer that used to crash').toBeGreaterThanOrEqual(2 ** 31);
  expect(dispatcher.look).toBeGreaterThanOrEqual(2 ** 31);

  // 1. Hire the installer through the UI.
  await openHiringMarket(page);
  await page.screenshot({ path: SHOT('01-hiring-market') });
  await press(page.getByTestId(`hire-${installer.id}`));
  const afterInstaller = await game(page);
  expect(afterInstaller.screen, 'still in the game').toBe('game');
  const inst = afterInstaller.employees.find((e) => e.name === installer.name)!;
  expect(inst?.role).toBe('installer');
  expect(afterInstaller.cash).toBe(start.cash - Math.round(installer.wage * 8));
  expect(afterInstaller.onboarding).toEqual([{ memo: `Onboarding — ${installer.name}`, amount: -Math.round(installer.wage * 8) }]);
  expect(afterInstaller.candidates.some((c) => c.id === installer.id), 'the candidate leaves the market').toBe(false);
  // The interface is still there (the bug left an empty page) and nothing threw.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SHOT('01b-right-after-hire') });
  expect(errors, errors.join('\n')).toEqual([]);
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  await expectDrawn(page, afterInstaller.employees.map((e) => e.id));
  // The roster shows them.
  await clearCelebrations(page);
  await press(page.getByRole('button', { name: 'Roster' }));
  await expect(page.getByTestId('panel-employees')).toContainText(installer.name);
  await page.screenshot({ path: SHOT('02-installer-on-roster') });

  // 2. A dispatcher (also a look of 2^31 or more) and a technician.
  await openHiringMarket(page);
  await press(page.getByTestId(`hire-${dispatcher.id}`));
  await openHiringMarket(page);
  await press(page.getByTestId(`hire-${technician.id}`));
  const full = await game(page);
  expect(full.screen).toBe('game');
  expect(full.employees.map((e) => e.role).sort()).toEqual(['dispatcher', 'installer', 'technician', 'technician']);
  expect(new Set(full.employees.map((e) => e.id)).size, 'no duplicates').toBe(4);
  const paid = [installer, dispatcher, technician].reduce((s, c) => s + Math.round(c.wage * 8), 0);
  expect(full.cash).toBe(start.cash - paid);
  expect(full.onboarding.length, 'one onboarding charge per hire').toBe(3);
  await expectDrawn(page, full.employees.map((e) => e.id));

  // 3. Headquarters holds four: the remaining candidates cannot be hired, and nothing is charged for trying.
  await openHiringMarket(page);
  const rest = full.candidates;
  expect(rest.length).toBeGreaterThan(0);
  for (const c of rest) await expect(page.getByTestId(`hire-${c.id}`)).toBeDisabled();
  const refused = await page.evaluate((id) => window.__ego!.dispatch({ type: 'hire', candidateId: id }), rest[0].id);
  expect(refused.ok).toBe(false);
  expect((await game(page)).cash).toBe(full.cash);
  await clearCelebrations(page);
  await press(page.getByTestId('panel-employees').getByRole('button', { name: 'Close panel' }));
  await expect(page.getByTestId('panel-employees')).toBeHidden();

  // 4. The new staff are drawn at headquarters: look at them.
  await page.evaluate(() => window.__ego!.app.getState().camera({ type: 'hq' }));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOT('03-staff-at-hq') });
  const atHq = await page.evaluate((ids) => ids.map((id) => window.__egoWorkers?.[id]), full.employees.map((e) => e.id));
  for (const w of atHq) expect(w, 'every employee has a drawn figure').toBeTruthy();
  const hires = full.employees.filter((e) => e.role !== 'technician' || e.name === technician.name).map((e) => e.id);
  await closeUp(page, hires, 'staff-close-up');

  // 5. The game keeps running with them: an hour of game time.
  await page.evaluate(() => window.__ego!.advanceMinutes(60));
  await page.waitForTimeout(800);
  expect((await game(page)).screen).toBe('game');

  // 6. Save, reload, continue.
  const before = await game(page);
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).save())).toBe(true);
  await page.reload();
  await page.getByTestId('continue-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  const after = await game(page);
  expect(after.screen).toBe('game');
  expect(after.employees).toEqual(before.employees);
  expect(after.cash).toBe(before.cash);
  expect(after.onboarding).toEqual(before.onboarding);
  expect(after.milestones).toEqual(before.milestones);
  expect(after.milestones).toContain('installer-hired');
  await expectDrawn(page, after.employees.map((e) => e.id));
  // Continuing at Mission 01's first step replays its two opening shots (MissionCoach: the second 4.8 s in). Let them play.
  await page.waitForFunction(() => {
    const c = (window.__ego!.app.getState() as S).cameraCommand;
    return !!c && c.orbit && c.targetY === 0 && c.duration === 2.6;
  }, null, { timeout: 15_000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__ego!.app.getState().camera({ type: 'hq' }));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOT('04-after-reload') });
  await closeUp(page, hires, 'staff-close-up-after-reload');

  // 7. Camera zoom still answers (desktop wheel; the touch path is camera-zoom.spec's).
  if (!test.info().project.use.hasTouch) {
    const h0 = await page.evaluate(() => window.__egoRender!.cam[1]);
    await page.mouse.move(800, 500);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(45); }
    await page.waitForTimeout(600);
    const h1 = await page.evaluate(() => window.__egoRender!.cam[1]);
    expect(h1, `wheel zooms in (height ${h0.toFixed(1)} → ${h1.toFixed(1)} m)`).toBeLessThan(h0 * 0.85);
  }

  // The only navigation is the deliberate reload.
  expect(navigations.length - navsAtStart, `navigations: ${navigations.join(', ')}`).toBe(1);
  expect(errors, errors.join('\n')).toEqual([]);
});
