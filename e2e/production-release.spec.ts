import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * The standard production build, the one players get, as a player gets it: no test hooks.
 *
 * Every other spec drives the game through window.__ego (dispatch, advanceMinutes, the UI store), which exists only
 * in the test builds. This one runs against `vite build` with nothing but the real interface (playwright.release
 * .config.ts, or playwright.remote.config.ts against a deployed URL), and checks two things: that the hooks that can
 * change a company are not there, and that the game without them still plays: start a company, hire, take the
 * mission's call, pause, save, reload, continue.
 *
 * What it may read: the page, and the read-only telemetry the game publishes every frame (window.__egoRender).
 */

const touch = () => !!test.info().project.use.hasTouch;
const SHOT = (name: string) => `docs/screenshots/release-hardening/${test.info().project.name}-${name}.png`;

async function press(target: Locator, timeout = 15_000) {
  if (touch()) await target.tap({ timeout });
  else await target.click({ timeout });
}

/** The world is up: the loading screen has gone and frames are being drawn. No hook involved. */
async function worldReady(page: Page) {
  await expect(page.locator('.app-world canvas')).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('loading-screen')).toHaveCount(0, { timeout: 180_000 });
  const f0 = await page.evaluate(() => window.__egoRender?.frame ?? 0);
  await page.waitForFunction((start) => (window.__egoRender?.frame ?? 0) > start + 10, f0, { timeout: 60_000 });
}

const cash = async (page: Page) => Number(((await page.getByTestId('hud-cash').textContent()) ?? '').replace(/[^0-9.-]/g, '').replace(/\.$/, '') || NaN);

test('the production build exposes no way to change a company from outside the game', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // window.__ego: two read-only members, frozen.
  const hook = await page.evaluate(() => {
    const e = window.__ego as unknown as Record<string, unknown>;
    const before = Object.keys(e).sort();
    // Adding to it or replacing a member does nothing.
    try { e.dispatch = () => ({ ok: true }); } catch { /* strict mode throws on a frozen object */ }
    try { e.crashLog = () => 'replaced'; } catch { /* as above */ }
    return { keys: before, after: Object.keys(e).sort(), frozen: Object.isFrozen(e), build: e.build, log: (e.crashLog as () => unknown)() };
  });
  expect(hook.keys).toEqual(['build', 'crashLog']);
  expect(hook.after).toEqual(['build', 'crashLog']);
  expect(hook.frozen).toBe(true);
  expect(hook.build).toMatch(/^\d+\.\d+\.\d+\S* \([0-9a-f]{7}\)$/);
  expect(Array.isArray(hook.log), 'crashLog still reports (a copy of) the log').toBe(true);
  for (const name of ['dispatch', 'advanceMinutes', 'spawnLead', 'app', 'getState', 'crash']) expect(await page.evaluate((n) => typeof (window.__ego as unknown as Record<string, unknown>)[n], name), `window.__ego.${name}`).toBe('undefined');

  // The shipped scripts: no hook code and no injected failure.
  const scripts = await page.evaluate(async () => {
    const urls = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'), (s) => s.src);
    const seen = new Set<string>();
    const out: { name: string; size: number; found: string[] }[] = [];
    const marks = ['spawnLead', 'advanceMinutes:', '__egoRoofSpec', '__egoServiceZoom', 'Simulated', '__ego.crash'];
    while (urls.length) {
      const url = urls.pop()!;
      if (seen.has(url)) continue;
      seen.add(url);
      const text = await (await fetch(url)).text();
      out.push({ name: url.split('/').pop()!, size: text.length, found: marks.filter((m) => text.includes(m)) });
      for (const m of text.matchAll(/from\s*["'](\.\/[^"']+\.js)["']|import\(\s*["'](\.\/[^"']+\.js)["']\s*\)/g)) urls.push(new URL(m[1] ?? m[2], url).href);
    }
    return out;
  });
  expect(scripts.length, 'the app chunks were read').toBeGreaterThanOrEqual(3);
  expect(scripts.reduce((n, s) => n + s.size, 0)).toBeGreaterThan(500_000);
  expect(scripts.filter((s) => s.found.length), 'no script carries test-hook code').toEqual([]);

  // With a company running: every function the page can reach through a window.__ego* global is one of the two
  // that only read (the crash log, and where a world point is on screen).
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await worldReady(page);
  const reachable = await page.evaluate(() => {
    const found: string[] = [];
    const globals = Object.keys(window).filter((k) => k.startsWith('__ego'));
    for (const g of globals) {
      const v = (window as unknown as Record<string, unknown>)[g];
      if (typeof v === 'function') found.push(g);
      else if (v && typeof v === 'object') for (const [k, inner] of Object.entries(v as Record<string, unknown>)) if (typeof inner === 'function') found.push(`${g}.${k}`);
    }
    return { globals: globals.sort(), functions: found.sort() };
  });
  expect(reachable.functions).toEqual(['__ego.crashLog', '__egoProject']);
  for (const gone of ['__egoRoofSpec', '__egoServiceZoom', '__egoThree']) expect(reachable.globals, `${gone} is not published`).not.toContain(gone);
  expect(reachable.globals, 'the read-only telemetry is still there').toEqual(expect.arrayContaining(['__ego', '__egoRender', '__egoWorkers']));
  expect(errors).toEqual([]);
});

test('the production build plays through the real interface: new company, hire, mission call, save, reload, continue', async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });

  await page.goto('/');
  await expect(page.getByTestId('version')).toContainText(/Public beta \d/);
  await page.getByTestId('seed-input').fill('42');
  await press(page.getByTestId('new-game'));
  await worldReady(page);
  if (touch()) await press(page.getByTestId('touch-tutorial-ok'));
  const startCash = await cash(page);
  expect(startCash).toBeGreaterThan(1000);
  await expect(page.getByTestId('mission-card')).toBeVisible();
  const stage0 = await page.getByTestId('mission-card').getAttribute('data-stage');

  // Hire someone from the market.
  await press(page.getByTestId('nav-employees'));
  await expect(page.getByTestId('panel-employees')).toBeVisible();
  await press(page.getByRole('button', { name: /Hiring market/ }));
  const hire = page.locator('[data-testid^="hire-"]:not(:disabled)').first();
  await expect(hire).toBeVisible();
  await press(hire);
  await expect.poll(() => cash(page), { message: 'the onboarding cost is charged' }).toBeLessThan(startCash);
  const afterHire = await cash(page);
  // Close whatever the hire raised, then look at the roster.
  const banner = page.getByTestId('celebration');
  for (let i = 0; i < 12 && (await banner.count()) > 0; i++) await press(banner.first(), 5_000).catch(() => undefined);
  await press(page.getByRole('button', { name: 'Roster' }));
  const roster = (await page.getByTestId('panel-employees').innerText()).replace(/\s+/g, ' ');
  await page.screenshot({ path: SHOT('01-roster-after-hire') });
  await press(page.getByTestId('panel-employees').getByRole('button', { name: 'Close panel' }));
  await expect(page.getByTestId('panel-employees')).toBeHidden();
  // The new hire is drawn in the world (two figures now), and the world is still drawing.
  await page.waitForFunction(() => Object.keys(window.__egoWorkers ?? {}).length >= 2, null, { timeout: 60_000 });

  // Mission 01: open the call and accept it.
  await press(page.getByTestId('mission-open-call'));
  await press(page.getByTestId('accept-lead'));
  await expect(page.getByTestId('mission-card')).not.toHaveAttribute('data-stage', stage0!);
  const stage1 = await page.getByTestId('mission-card').getAttribute('data-stage');

  // Pause, close the job sheet, save with the game's own button.
  await press(page.getByTestId('speed-controls').getByRole('button', { name: 'Pause' }));
  const closeSheet = page.getByTestId('inspector').getByRole('button', { name: 'Close' });
  if (await closeSheet.count()) await press(closeSheet.first());
  const clock = await page.getByTestId('hud-clock').textContent();
  await press(page.getByTestId('save-game'));
  // The game confirms a save on the button itself, and with a toast on touch devices, where the label is hidden.
  if (touch()) await expect(page.getByTestId('toasts')).toContainText('Game saved');
  else await expect(page.getByTestId('save-game')).toContainText('Saved');
  await page.screenshot({ path: SHOT('02-saved') });

  // Close and reopen the game.
  await page.reload();
  await expect(page.getByTestId('continue-source')).toContainText(/(Autosave|Manual save) · Day 1, /);
  await page.screenshot({ path: SHOT('03-menu-after-reload') });
  await press(page.getByTestId('continue-game'));
  await worldReady(page);

  // The same company: cash, clock, mission step, and the hire on the roster.
  expect(await cash(page)).toBe(afterHire);
  await expect(page.getByTestId('hud-clock')).toHaveText(clock!);
  await expect(page.getByTestId('mission-card')).toHaveAttribute('data-stage', stage1!);
  await press(page.getByTestId('nav-employees'));
  await expect.poll(async () => (await page.getByTestId('panel-employees').innerText()).replace(/\s+/g, ' ')).toBe(roster);
  await press(page.getByTestId('panel-employees').getByRole('button', { name: 'Close panel' }));
  await page.waitForFunction(() => Object.keys(window.__egoWorkers ?? {}).length >= 2, null, { timeout: 60_000 });
  // And time runs again when the player says so.
  await press(page.getByTestId('speed-2'));
  await expect(page.getByTestId('hud-clock')).not.toHaveText(clock!, { timeout: 30_000 });
  await page.screenshot({ path: SHOT('04-playing-after-continue') });
  expect(errors, errors.join('\n')).toEqual([]);
});
