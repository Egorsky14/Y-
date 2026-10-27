import { test, expect, type Page } from '@playwright/test';

/**
 * Automated Operations Center: locked below three technicians (owner included), bought for $1,000
 * at headquarters, both settings off until switched on in Settings, a routine call that runs to
 * payment on its own (Auto tag, no per-call toast), a replacement that waits in Jobs › Owner
 * attention until the owner decides, and the settings surviving save, reload and continue.
 * Desktop, 1024×768 and a 390×844 touch phone; screenshots in docs/screenshots/ops-*-{W}x{H}.png.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

test.use({ actionTimeout: 20_000 });

const shot = (page: Page, name: string) => page.screenshot({ path: `docs/screenshots/ops-${name}-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` });

async function state<T, A = undefined>(page: Page, fn: (s: S, arg: A) => T, arg?: A): Promise<T> {
  return page.evaluate(([src, a]) => new Function('s', 'arg', `return (${src})(s, arg)`)(window.__ego!.getState()! as S, a) as T, [fn.toString(), arg] as const);
}

async function press(page: Page, testId: string, touch: boolean) {
  const el = page.getByTestId(testId);
  await el.scrollIntoViewIfNeeded();
  if (touch) await el.tap();
  else await el.click();
}

async function closePanel(page: Page, testId: string, touch: boolean) {
  const b = page.getByTestId(testId).getByRole('button', { name: 'Close panel' });
  if (touch) await b.tap();
  else await b.click();
  await expect(page.getByTestId(testId)).toBeHidden();
}

/** Celebration banners (hires, upgrades, milestones) sit above panels; a player taps them away. */
async function clearCelebrations(page: Page, touch: boolean) {
  const c = page.getByTestId('celebration');
  for (let i = 0; i < 12 && (await c.count()) > 0; i++) {
    if (touch) await c.first().tap({ timeout: 5_000 }).catch(() => undefined);
    else await c.first().click({ timeout: 5_000 }).catch(() => undefined);
  }
  await expect(c).toHaveCount(0);
}

/** Advances the game in small chunks until the predicate holds (the page polls between chunks). */
async function runUntil(page: Page, jobId: string, predicate: string) {
  await page.waitForFunction(
    ([id, src]) => {
      window.__ego!.advanceMinutes(5);
      return new Function('j', `return ${src}`)((window.__ego!.getState() as S).jobs[id]) as boolean;
    },
    [jobId, predicate] as const,
    { timeout: 60_000, polling: 50 },
  );
}

test('operations center: locked, bought, routine call on its own, replacement waits for the owner, persists', async ({ page }, info) => {
  const touch = !!info.project.use.hasTouch;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await press(page, 'new-game', touch);
  await expect(page.getByTestId('hud-cash')).toBeVisible({ timeout: 120_000 });
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  if (touch) {
    await expect(page.getByTestId('touch-tutorial')).toBeVisible();
    await page.getByTestId('touch-tutorial-ok').tap();
  }
  await page.evaluate(() => ((window.__ego!.getState() as S).speed = 0));

  // 1. Locked: Settings explains the price and the requirement; HQ shows the technician count.
  await press(page, 'world-settings', touch);
  await expect(page.getByTestId('automation-locked')).toContainText('one-time $1,000');
  await expect(page.getByTestId('automation-locked')).toContainText('3 or more technicians (the owner counts). You have 1.');
  await page.waitForTimeout(400); // the sheet slides in
  await shot(page, 'locked');
  await press(page, 'automation-open-hq', touch);
  await expect(page.getByTestId('hq-lock-operations-center')).toHaveText('Needs 3 technicians · you have 1');
  await expect(page.getByTestId('hq-buy-operations-center')).toBeDisabled();

  // 2. Two hires make three technicians with the owner; the upgrade unlocks and costs $1,000 once.
  await page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    for (let i = 0; i < 2; i++) {
      const c = s.candidates.find((x: S) => x.role === 'technician') ?? s.candidates[0];
      c.role = 'technician';
      window.__ego!.dispatch({ type: 'hire', candidateId: c.id });
    }
  });
  await expect(page.getByTestId('hq-lock-operations-center')).toHaveCount(0);
  const cash0: number = await state(page, (s) => s.finance.cash);
  await press(page, 'hq-buy-operations-center', touch);
  await expect(page.getByTestId('hq-buy-operations-center')).toHaveText('Owned');
  expect(await state(page, (s) => s.finance.cash)).toBe(cash0 - 1000);
  expect(await state(page, (s) => s.finance.ledger.at(-1))).toMatchObject({ amount: -1000, category: 'facility', memo: 'HQ upgrade — Automated Operations Center' });
  await closePanel(page, 'panel-hq', touch);

  // 3. Settings: both switches start off, then on.
  await press(page, 'world-settings', touch);
  await expect(page.getByTestId('automation-diagnostics')).not.toBeChecked();
  await expect(page.getByTestId('automation-closing')).not.toBeChecked();
  for (const k of ['diagnostics', 'closing']) {
    const box = page.getByTestId(`automation-${k}`);
    await box.scrollIntoViewIfNeeded();
    if (touch) await box.tap();
    else await box.check();
    await expect(box).toBeChecked();
    // The whole row is the touch target on phones.
    const row = await box.evaluate((el) => el.closest('label')!.getBoundingClientRect().height);
    expect(row).toBeGreaterThanOrEqual(44);
  }
  expect(await state(page, (s) => s.company.automation)).toEqual({ diagnostics: true, closing: true });
  await shot(page, 'settings');
  await closePanel(page, 'panel-settings', touch);

  // 4. A routine contactor call: dispatched by the player, then diagnosed, quoted and paid on its own.
  const routine = await page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    s.employees['emp-owner'].attributes.diagnosticAccuracy = 100;
    s.employees['emp-owner'].attributes.attentionToDetail = 100;
    const id = window.__ego!.spawnLead({ channel: 'direct', preferredLotId: 'b-n-1', faultId: 'contactor' })!;
    s.customers[s.jobs[id].customerId].trust = 100;
    window.__ego!.dispatch({ type: 'accept-lead', jobId: id });
    window.__ego!.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    return id;
  });
  await runUntil(page, routine, "j.status === 'completed'");
  const r = await state(page, (s, id) => ({ auto: s.jobs[id].auto, att: s.jobs[id].attention, toasts: s.events.filter((e: S) => e.title.startsWith('Findings ready')).length }), routine);
  expect(r.auto).toEqual({ diagnosis: true, estimate: true });
  expect(r.att).toBeUndefined();
  expect(r.toasts).toBe(0);
  await page.evaluate((id) => (window.__ego!.app.getState() as S).select({ kind: 'job', id }), routine);
  await expect(page.getByTestId('auto-tag')).toBeVisible();
  await shot(page, 'auto-job');
  await page.evaluate(() => (window.__ego!.app.getState() as S).select(null));

  // 5. A failed compressor on an 18-year-old system: the technician stops and asks the owner.
  // (First the owner and Unit 1 drive back from the last call.)
  await page.waitForFunction(() => {
    window.__ego!.advanceMinutes(5);
    const s = window.__ego!.getState() as S;
    return s.vehicles['veh-1'].status === 'parked' && s.employees['emp-owner'].status === 'idle';
  }, null, { timeout: 60_000, polling: 50 });
  const big = await page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    const id = window.__ego!.spawnLead({ channel: 'direct', preferredLotId: 'b-n-1', faultId: 'compressor' })!;
    s.customers[s.jobs[id].customerId].equipment.ageYears = 18;
    window.__ego!.dispatch({ type: 'accept-lead', jobId: id });
    const sent = window.__ego!.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    if (!sent.ok) throw new Error(sent.reason);
    return id;
  });
  await runUntil(page, big, "!!j.attention");
  expect(await state(page, (s, id) => ({ kind: s.jobs[id].attention.kind, status: s.jobs[id].status, quote: s.jobs[id].financials.quoteAmount }), big)).toEqual({ kind: 'replacement-approval', status: 'quoted', quote: 0 });
  // It waits: more time passes, nothing is quoted, the toast was raised once.
  await page.evaluate(() => window.__ego!.advanceMinutes(60));
  expect(await state(page, (s, id) => s.jobs[id].status, big)).toBe('quoted');
  expect(await state(page, (s) => s.events.filter((e: S) => e.title.startsWith('Replacement needs your approval')).length)).toBe(1);

  // 6. The queue: Jobs › Owner attention lists it; the owner opens it and decides (repair).
  await clearCelebrations(page, touch);
  await press(page, 'nav-jobs', touch);
  await expect(page.getByTestId(`attention-row-${big}`)).toContainText('Decide: Compressor failure on an 18-year-old system');
  await press(page, `job-row-${big}`, touch);
  await expect(page.getByTestId('attention-card')).toContainText('Needs your decision');
  await shot(page, 'queue');
  await press(page, 'quote-repair', touch);
  await press(page, 'present-quote', touch);
  await page.evaluate(() => window.__ego!.advanceMinutes(1));
  await clearCelebrations(page, touch);
  const owner = page.getByTestId('panel-jobs').getByRole('button', { name: /Owner attention/ });
  if (touch) await owner.tap();
  else await owner.click();
  await expect(page.getByTestId('attention-empty')).toBeVisible();
  expect(await state(page, (s, id) => !!s.jobs[id].attention.resolved, big)).toBe(true);
  await closePanel(page, 'panel-jobs', touch);

  // 7. Save, reload, continue: the settings and the job marks come back.
  const before = await state(page, (s) => JSON.stringify({ a: s.company.automation, j: Object.values(s.jobs).map((j: S) => [j.id, j.auto, j.attention]) }));
  await press(page, 'save-game', touch);
  if (touch) await expect(page.getByTestId('toasts')).toContainText('Game saved');
  else await expect(page.getByTestId('save-game')).toContainText('Saved');
  await page.reload();
  await press(page, 'continue-game', touch);
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  expect(await state(page, (s) => JSON.stringify({ a: s.company.automation, j: Object.values(s.jobs).map((j: S) => [j.id, j.auto, j.attention]) }))).toBe(before);
  expect(await state(page, (s) => Math.abs(s.finance.ledger.reduce((a: number, e: S) => a + e.amount, 0) - s.finance.cash) < 0.01)).toBe(true);
  expect(errors).toEqual([]);
});
