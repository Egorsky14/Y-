import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Save recovery in the real game, across real page reloads: "Continue my company" loads the newest save that is
 * valid, manual or autosave, says which, never rewrites the other slot, and falls back (with an explanation) when
 * a save cannot be read. The policy itself is src/persistence/save.ts (planRecovery); its deterministic cases are
 * src/tests/saveRecovery.test.ts.
 *
 * Before this, Continue always loaded the manual save when one existed, and a new company writes one, so the
 * 45-second autosave was never loaded: closing the tab lost everything since the last manual save.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

const SAVE = 'ego-hvac-v3:save';
const AUTO = 'ego-hvac-v3:autosave';
const SHOT = (name: string) => `docs/screenshots/save-recovery/${test.info().project.name}-${name}.png`;
const touch = () => !!test.info().project.use.hasTouch;

async function press(target: Locator, timeout = 15_000) {
  if (touch()) await target.tap({ timeout });
  else await target.click({ timeout });
}

const game = (page: Page) =>
  page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    return {
      minutes: s.elapsedMinutes as number,
      cash: s.finance.cash as number,
      day: s.clock.day as number,
      employees: Object.values(s.employees).map((e: S) => `${e.id}:${e.name}:${e.role}`).sort(),
      upgrades: [...(s.company.hqUpgrades as string[])].sort(),
      mission: s.mission ? `${s.mission.status}:${s.jobs[s.mission.jobId]?.status}` : null,
      milestones: (s.milestones as S[]).filter((m) => m.achievedDay !== undefined).map((m) => m.id as string).sort(),
      jobs: Object.keys(s.jobs).length,
    };
  });

const stored = (page: Page) =>
  page.evaluate(([save, auto]) => ({ save: localStorage.getItem(save), autosave: localStorage.getItem(auto), saveKept: localStorage.getItem(`${save}:kept`), autosaveKept: localStorage.getItem(`${auto}:kept`) }), [SAVE, AUTO] as const);

/** What the page does when it is hidden or closed: the game autosaves. */
const leavePage = (page: Page) => page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });

async function ready(page: Page) {
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  if (touch() && (await page.getByTestId('touch-tutorial').count())) await press(page.getByTestId('touch-tutorial-ok'));
}

/** A company with a manual save at an earlier moment and an autosave at a later one; returns both moments. */
async function companyWithTwoSaves(page: Page) {
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await ready(page);
  // Paused, and moved on by the test's own hand, so every moment below is exact.
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  await page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    window.__ego!.dispatch({ type: 'hire', candidateId: (s.candidates as S[]).find((c) => c.role === 'installer').id });
    window.__ego!.dispatch({ type: 'hq-upgrade', upgradeId: 'additional-parking' });
    window.__ego!.dispatch({ type: 'accept-lead', jobId: s.mission.jobId });
    window.__ego!.advanceMinutes(30);
  });
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).save())).toBe(true);
  const manual = await game(page);
  await page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    window.__ego!.dispatch({ type: 'hire', candidateId: (s.candidates as S[]).find((c) => c.role === 'technician').id });
    window.__ego!.advanceMinutes(75);
  });
  await leavePage(page);
  const auto = await game(page);
  expect(auto.minutes).toBeGreaterThan(manual.minutes);
  expect(auto.employees.length).toBe(manual.employees.length + 1);
  return { manual, auto };
}

/**
 * The menu is usable on this screen: the card on screen side to side, no sideways scroll, and each control can be
 * scrolled to, is not covered by anything, and is big enough to press. Being "in view" is checked by what a player
 * needs (at least 98% showing: a control scrolled to the edge of a short screen can sit a fraction of a pixel under
 * it), and never on its own: the control must also be the thing a tap in its middle would hit.
 */
async function expectMenuFits(page: Page) {
  const view = page.viewportSize()!;
  const card = (await page.getByTestId('main-menu').boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(view.width + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(view.width);
  for (const id of ['continue-game', 'continue-source', 'new-game']) {
    const el = page.getByTestId(id);
    await el.scrollIntoViewIfNeeded();
    await expect(el).toBeInViewport({ ratio: 0.98 });
    const box = (await el.boundingBox())!;
    expect(box.x, `${id} inside the card`).toBeGreaterThanOrEqual(card.x);
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
    // Whatever sliver is out of view is under a pixel and a half, not a hidden row of the control.
    const hidden = Math.max(0, -box.y) + Math.max(0, box.y + box.height - view.height);
    expect(hidden, `${id}: ${hidden.toFixed(2)} px out of view`).toBeLessThanOrEqual(1.5);
    const hit = await el.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (top === node || node.contains(top));
    });
    expect(hit, `${id} is not covered by another element`).toBe(true);
  }
  if (touch()) for (const id of ['continue-game', 'new-game']) expect((await page.getByTestId(id).boundingBox())!.height, `${id} is tall enough for a finger`).toBeGreaterThanOrEqual(44);
}

/** The control answers a real tap (or click): starting a company asks first, and the question can be dismissed. */
async function expectNewGameResponds(page: Page) {
  await page.getByTestId('new-game').scrollIntoViewIfNeeded();
  await press(page.getByTestId('new-game'));
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await press(page.getByTestId('cancel-new-game'));
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
}

/** Turning the phone: the menu is still usable the other way up, and again when turned back. */
async function expectMenuSurvivesRotation(page: Page) {
  const view = page.viewportSize()!;
  await page.setViewportSize({ width: view.height, height: view.width });
  await expectMenuFits(page);
  await expectNewGameResponds(page);
  await page.setViewportSize(view);
  await expectMenuFits(page);
  await expectNewGameResponds(page);
}

test('Continue resumes from the newer autosave after a real reload, and the manual save is still there to load', async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { manual, auto } = await companyWithTwoSaves(page);
  const before = await stored(page);
  expect(before.save).not.toBeNull();
  expect(before.autosave).not.toBeNull();

  // Close and reopen the game.
  await page.reload();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  // (Reloading hid the page, which autosaved once more: the same paused moment, written again.)
  const atMenu = await stored(page);
  expect(atMenu.save, 'the manual save is byte for byte what the player saved').toBe(before.save);

  // The menu says what Continue will load.
  const source = page.getByTestId('continue-source');
  await expect(source).toHaveAttribute('data-slot', 'autosave');
  await expect(source).toContainText(/^Autosave · Day 1, \d+:\d\d [AP]M · saved today at /);
  await expect(page.getByTestId('continue-notice'), 'loading the newest save needs no warning').toHaveCount(0);
  await expectMenuFits(page);
  await page.screenshot({ path: SHOT('01-menu-autosave-newer') });
  await press(page.getByTestId('other-saves').locator('summary'));
  await expect(page.getByTestId('load-manual')).toBeVisible();
  await expect(page.getByTestId('other-saves')).toContainText('Manual save · Day 1');
  await expectMenuFits(page);
  await page.screenshot({ path: SHOT('02-menu-other-saves') });

  await press(page.getByTestId('continue-game'));
  await ready(page);
  expect(await game(page), 'the company as it was when the page was left: staff, cash, upgrade, mission, progress').toEqual(auto);
  expect(await stored(page), 'loading wrote no save').toEqual(atMenu);
  // The scene really is up and drawing the staff.
  await page.waitForFunction((n) => Object.keys(window.__egoWorkers ?? {}).length >= n, auto.employees.length, { timeout: 60_000 });
  await page.screenshot({ path: SHOT('03-resumed-from-autosave') });

  // After a few seconds of running the load is confirmed, and autosaves go on without touching the manual save.
  await page.waitForFunction(() => localStorage.getItem('ego-hvac-v3:load-guard') === null, null, { timeout: 30_000 });
  await leavePage(page);
  expect((await stored(page)).save).toBe(before.save);
  expect((await stored(page)).saveKept).toBeNull();

  // Reopen and choose the older manual save instead.
  await page.reload();
  await expect(page.getByTestId('continue-source')).toHaveAttribute('data-slot', 'autosave');
  const beforeOlder = await stored(page);
  await press(page.getByTestId('other-saves').locator('summary'));
  await press(page.getByTestId('load-manual'));
  await ready(page);
  expect(await game(page)).toEqual(manual);
  expect(await stored(page)).toEqual(beforeOlder);
  // Playing on from the older save would let its autosave replace the newer one: that one is set aside, not lost.
  await leavePage(page);
  const afterOlder = await stored(page);
  expect(afterOlder.autosaveKept, 'the newer autosave was copied aside before being replaced').toBe(beforeOlder.autosave);
  expect(afterOlder.save).toBe(before.save);
  await page.reload();
  await press(page.getByTestId('other-saves').locator('summary'));
  await expect(page.getByTestId('load-autosave-kept')).toBeVisible();
  await expect(page.getByTestId('other-saves')).toContainText('Set-aside autosave · Day 1');
  await page.screenshot({ path: SHOT('04-menu-set-aside') });
  await press(page.getByTestId('load-autosave-kept'));
  await ready(page);
  expect(await game(page), 'the set-aside progress loads').toEqual(auto);
  expect(errors).toEqual([]);
});

test('a damaged or incompatible save is skipped with an explanation, never deleted, and the other save loads', async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { manual, auto } = await companyWithTwoSaves(page);
  const good = await stored(page);
  await page.reload();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  // From the menu the game writes nothing, so the slots can be arranged freely.
  const arrange = async (save: string | null, autosave: string | null) => {
    await page.evaluate(([k1, k2, a, b]) => {
      for (const [k, v] of [[k1, a], [k2, b]] as const) if (v === null) localStorage.removeItem(k as string); else localStorage.setItem(k as string, v);
      for (const k of [`${k1}:kept`, `${k2}:kept`, 'ego-hvac-v3:load-guard']) localStorage.removeItem(k);
    }, [SAVE, AUTO, save, autosave] as const);
    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    return stored(page);
  };

  // The autosave is cut short (a write that did not finish): Continue falls back to the manual save.
  let before = await arrange(good.save, good.autosave!.slice(0, Math.floor(good.autosave!.length * 0.7)));
  await expect(page.getByTestId('continue-source')).toHaveAttribute('data-slot', 'manual');
  await expect(page.getByTestId('continue-notice')).toHaveText('Your autosave is damaged and cannot be opened, so this continues from your manual save. Nothing has been deleted.');
  await expect(page.getByTestId('unreadable-autosave')).toContainText('damaged, cannot be opened. It is kept on this device.');
  await expectMenuFits(page);
  await expectNewGameResponds(page);
  // The longest menu (a notice and the list of other saves) is the one to turn the phone on.
  if (touch()) await expectMenuSurvivesRotation(page);
  await page.screenshot({ path: SHOT('05-menu-autosave-damaged') });
  await press(page.getByTestId('continue-game'));
  await ready(page);
  expect(await game(page)).toEqual(manual);
  expect(await stored(page), 'the damaged autosave was left exactly as it was').toEqual(before);
  await page.evaluate(() => (window.__ego!.app as S).setState({ screen: 'menu' }));

  // The manual save is damaged: recovery from the autosave is offered.
  before = await arrange('{"schemaVersion":6,"savedAt":"2026-01-01T00:00:00.000Z","state":{"clock":{"day":1', good.autosave);
  await expect(page.getByTestId('continue-source')).toHaveAttribute('data-slot', 'autosave');
  await expect(page.getByTestId('continue-notice')).toHaveText('Your manual save is damaged and cannot be opened, so this continues from your autosave. Nothing has been deleted.');
  await page.screenshot({ path: SHOT('06-menu-manual-damaged') });
  await press(page.getByTestId('continue-game'));
  await ready(page);
  expect(await game(page)).toEqual(auto);
  expect(await stored(page)).toEqual(before);
  // Autosaving the recovered company does not touch the manual slot; the player's own save sets the damaged one aside first.
  await leavePage(page);
  expect((await stored(page)).save).toBe(before.save);
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).save())).toBe(true);
  const afterSave = await stored(page);
  expect(afterSave.saveKept).toBe(before.save);
  expect(afterSave.save).not.toBe(before.save);
  await page.evaluate(() => (window.__ego!.app as S).setState({ screen: 'menu' }));

  // A save from a newer version of the game, and a previous build's save format.
  const newer = await page.evaluate((text) => { const e = JSON.parse(text!); e.schemaVersion = 99; e.seq = 100000; delete e.checksum; return JSON.stringify(e); }, good.autosave);
  const legacy = await page.evaluate((text) => { const e = JSON.parse(text!); return JSON.stringify({ schemaVersion: e.schemaVersion, savedAt: e.savedAt, appVersion: '0.1.0', state: e.state }); }, good.save);
  before = await arrange(legacy, newer);
  await expect(page.getByTestId('continue-source')).toHaveAttribute('data-slot', 'manual');
  await expect(page.getByTestId('continue-notice')).toHaveText('Your autosave was made by a newer version of the game and cannot be opened here, so this continues from your manual save. Nothing has been deleted.');
  await expect(page.getByTestId('unreadable-autosave')).toContainText('from a newer version of the game');
  await press(page.getByTestId('continue-game'));
  await ready(page);
  expect(await game(page), 'a save written by the previous build still loads').toEqual(manual);
  expect(await stored(page)).toEqual(before);
  await leavePage(page);
  expect((await stored(page)).autosaveKept, 'the newer version\'s save is set aside before this version autosaves over it').toBe(newer);
  await page.evaluate(() => (window.__ego!.app as S).setState({ screen: 'menu' }));

  // Nothing readable at all: Continue is not offered, nothing is removed, and a new company is still possible.
  before = await arrange(newer, 'not a save');
  await expect(page.getByTestId('continue-game')).toBeDisabled();
  await expect(page.getByTestId('continue-game')).toHaveText('No saved company can be opened');
  await expect(page.getByTestId('other-saves')).toContainText('Manual save · from a newer version of the game');
  await page.screenshot({ path: SHOT('07-menu-nothing-readable') });
  await press(page.getByTestId('new-game'));
  await expect(page.getByRole('alertdialog')).toContainText('set aside, not deleted');
  await press(page.getByTestId('cancel-new-game'));
  expect(await stored(page)).toEqual(before);
  expect(errors).toEqual([]);
});
