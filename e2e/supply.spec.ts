import { test, expect, type Page } from '@playwright/test';

/**
 * Pro Supply Depot: browse and filter the catalog, buy tools for a technician and a van rack,
 * move a tool through the inventory, compare loadouts, see the tools at work on a refrigerant
 * leak call (dispatch loadout, readings measured with a tool, the job's equipment report), the
 * Team equipment tab, and save, reload and continue with every tool where it was. Runs on desktop,
 * 1024×768 and phones (touch); screenshots go to docs/screenshots/supply-*-{W}x{H}.png.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

test.use({ actionTimeout: 20_000 });

const shot = (page: Page, name: string) => page.screenshot({ path: `docs/screenshots/supply-${name}-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` });

async function state<T, A = undefined>(page: Page, fn: (s: S, arg: A) => T, arg?: A): Promise<T> {
  return page.evaluate(([src, a]) => new Function('s', 'arg', `return (${src})(s, arg)`)(window.__ego!.getState()! as S, a) as T, [fn.toString(), arg] as const);
}

async function press(page: Page, testId: string, touch: boolean) {
  const el = page.getByTestId(testId);
  await el.scrollIntoViewIfNeeded();
  if (touch) await el.tap();
  else await el.click();
}

async function noSidewaysOverflow(page: Page, testId: string) {
  const r = await page.getByTestId(testId).evaluate((el) => {
    const vw = window.innerWidth;
    const bad: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1) bad.push(`page ${document.documentElement.scrollWidth}>${vw}`);
    if (el.scrollWidth > el.clientWidth + 1) bad.push(`${(el as HTMLElement).dataset.testid} ${el.scrollWidth}>${el.clientWidth}`);
    for (const c of Array.from(el.querySelectorAll<HTMLElement>('button, select, .tool-card, .inv-row, .perf-card'))) {
      const b = c.getBoundingClientRect();
      if (b.width === 0) continue;
      if (b.right > vw + 1 || b.left < -1) bad.push(`${c.tagName.toLowerCase()} "${(c.dataset.testid || c.textContent || '').trim().slice(0, 24)}" ${Math.round(b.left)}..${Math.round(b.right)}`);
    }
    return bad;
  });
  expect(r).toEqual([]);
}

/** On touch screens every control in the panel is finger-sized (36 px, the compact minimum). */
async function fingerSized(page: Page, testId: string) {
  const small = await page.getByTestId(testId).evaluate((el) =>
    Array.from(el.querySelectorAll<HTMLElement>('button, select'))
      .map((c) => ({ c, b: c.getBoundingClientRect() }))
      .filter(({ b }) => b.width > 0 && Math.min(b.width, b.height) < 36)
      .map(({ c, b }) => `${(c.dataset.testid || c.textContent || '').trim().slice(0, 24)} ${Math.round(b.width)}x${Math.round(b.height)}`),
  );
  expect(small).toEqual([]);
}

const toolOf = (page: Page, defId: string) => state(page, (s, d) => Object.values(s.tools as Record<string, S>).find((t) => t.defId === d) ?? null, defId);

test('supply depot: shop, equip, compare loadouts, tools on a call, save and reload', async ({ page }, info) => {
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

  // 1. Open the depot from the management bar: header, tabs and close on screen.
  await press(page, 'nav-supply', touch);
  const panel = page.getByTestId('panel-supply');
  await expect(panel.getByRole('heading', { name: 'Pro Supply Depot' })).toBeVisible();
  for (const t of ['Catalog', 'Inventory', 'Loadouts']) {
    const b = panel.getByRole('button', { name: t, exact: false }).first();
    await b.scrollIntoViewIfNeeded();
    await expect(b).toBeInViewport();
  }
  const close = panel.getByRole('button', { name: 'Close panel' });
  await expect(close).toBeInViewport({ ratio: 1 });

  // 2. Catalog: twelve products, category filter, starter kit marked as owned, live estimates.
  await expect(page.locator('.tool-card')).toHaveCount(12);
  await expect(page.getByTestId('owned-multimeter')).toContainText('Owned ×1');
  await expect(page.getByTestId('owned-hand-tools')).toContainText('Owned ×1');
  await press(page, 'cat-refrigerant', touch);
  await expect(page.locator('.tool-card')).toHaveCount(5);
  await expect(page.getByTestId('estimate-digital-manifold')).toContainText(/Refrigerant pressure: \d+% → \d+%/);
  await expect(page.getByTestId('estimate-recovery-machine')).toContainText(/Repairs it helps: \d+ min → \d+ min/);
  await noSidewaysOverflow(page, 'supply-catalog');
  if (touch) await fingerSized(page, 'panel-supply');
  await shot(page, 'catalog');

  // 3. Buy a digital manifold for the owner: confirmation, ledger, cash, holder.
  const cash0: number = await state(page, (s) => s.finance.cash);
  await press(page, 'buy-digital-manifold', touch);
  await page.getByTestId('buy-to-digital-manifold').selectOption('employee:emp-owner');
  if (touch) await fingerSized(page, 'panel-supply');
  await shot(page, 'confirm');
  await press(page, 'buy-confirm', touch);
  await expect(page.getByTestId('supply-message')).toContainText('Bought Digital refrigerant manifold for $780.');
  const manifold = await toolOf(page, 'digital-manifold');
  expect(manifold.holder).toEqual({ kind: 'employee', id: 'emp-owner' });
  expect(await state(page, (s) => s.finance.cash)).toBe(cash0 - 780);
  expect(await state(page, (s) => s.finance.ledger.at(-1))).toMatchObject({ amount: -780, category: 'tools' });
  await expect(page.getByTestId('owned-digital-manifold')).toContainText('Owned ×1');
  // The estimate now knows the owner has one.
  await expect(page.getByTestId('estimate-digital-manifold')).toContainText('already has one');

  // 4. A leak detector for the owner and a vacuum pump plus recovery machine for Unit 1's rack.
  await press(page, 'buy-leak-detector', touch);
  await page.getByTestId('buy-to-leak-detector').selectOption('employee:emp-owner');
  await press(page, 'buy-confirm', touch);
  await expect(page.getByTestId('supply-message')).toContainText('Bought Electronic leak detector');
  await press(page, 'cat-evacuation', touch);
  await press(page, 'buy-vacuum-pump', touch);
  await page.getByTestId('buy-to-vacuum-pump').selectOption('vehicle:veh-1');
  await press(page, 'buy-confirm', touch);
  await expect(page.getByTestId('supply-message')).toContainText('Bought Vacuum pump');
  await press(page, 'cat-refrigerant', touch);
  await press(page, 'buy-recovery-machine', touch);
  await page.getByTestId('buy-to-recovery-machine').selectOption('vehicle:veh-1');
  await press(page, 'buy-confirm', touch);
  await expect(page.getByTestId('supply-message')).toContainText('Bought Recovery machine');
  expect(await state(page, (s) => s.finance.ledger.filter((e: S) => e.category === 'equipment-purchase').map((e: S) => e.amount))).toEqual([-1150, -1650]);
  // A van rack holds only so much: the nitrogen kit no longer fits Unit 1 (6 space: 2 + 3 used).
  await press(page, 'buy-nitrogen-kit', touch);
  await page.getByTestId('buy-to-nitrogen-kit').selectOption('vehicle:veh-1');
  await press(page, 'buy-confirm', touch);
  await expect(page.getByTestId('supply-message')).toContainText('rack is full');
  expect(await toolOf(page, 'nitrogen-kit')).toBeNull();
  // The depot reports it inline; the game-wide error banner stays out of the way (it covered the panel on phones).
  await expect(page.getByTestId('error-banner')).toHaveCount(0);

  // 5. Inventory: move the owner's multimeter to the crib and back.
  await press(page, 'cat-all', touch);
  await panel.getByRole('button', { name: /^Inventory/ }).click();
  await expect(page.getByTestId('supply-inventory')).toBeVisible();
  const meter = await toolOf(page, 'multimeter');
  await page.getByTestId(`move-to-${meter.id}`).selectOption('inventory');
  await press(page, `move-${meter.id}`, touch);
  await expect(page.getByTestId('supply-message')).toContainText('Digital multimeter moved.');
  expect((await toolOf(page, 'multimeter')).holder).toEqual({ kind: 'inventory' });
  await page.getByTestId(`move-to-${meter.id}`).selectOption('employee:emp-owner');
  await press(page, `move-${meter.id}`, touch);
  expect((await toolOf(page, 'multimeter')).holder).toEqual({ kind: 'employee', id: 'emp-owner' });
  await noSidewaysOverflow(page, 'supply-inventory');
  if (touch) await fingerSized(page, 'panel-supply');
  await shot(page, 'inventory');

  // 6. Loadouts: effective performance with and without the van's rack.
  await panel.getByRole('button', { name: 'Loadouts' }).click();
  await expect(page.getByTestId('loadout-performance')).toBeVisible();
  await expect(page.getByTestId('loadout-kit')).toContainText('Digital refrigerant manifold');
  const repairWith = await page.getByTestId('loadout-performance').locator('.tile').nth(2).locator('.value').textContent();
  await page.getByTestId('loadout-van').selectOption('');
  const repairWithout = await page.getByTestId('loadout-performance').locator('.tile').nth(2).locator('.value').textContent();
  expect(parseInt(repairWith!)).toBeLessThan(parseInt(repairWithout!));
  await page.getByTestId('loadout-van').selectOption('veh-1');
  await expect(page.getByTestId('rack-veh-1')).toContainText('Rack 5 / 6');
  await noSidewaysOverflow(page, 'supply-loadouts');
  await shot(page, 'loadouts');
  if (touch) await close.tap();
  else await close.click();
  await expect(panel).toBeHidden();

  // 7. The depot in the world: selecting the store opens the same shop.
  await page.evaluate(() => (window.__ego!.app.getState() as S).select({ kind: 'lot', id: 'warehouse' }));
  await press(page, 'open-supply', touch);
  await expect(page.getByTestId('panel-supply')).toBeVisible();
  const close2 = page.getByTestId('panel-supply').getByRole('button', { name: 'Close panel' });
  if (touch) await close2.tap();
  else await close2.click();
  await expect(page.getByTestId('panel-supply')).toBeHidden();
  await page.evaluate(() => (window.__ego!.app.getState() as S).select(null));
  // The storefront: showroom, canopy sign, parking and the equipment display deck.
  await page.evaluate(() => (window.__ego!.app.getState() as S).camera({ type: 'focus', target: { x: 26, z: -124 }, distance: 24, azimuth: -0.45, elevation: 0.42, targetY: 2 }));
  await page.waitForTimeout(2500);
  await shot(page, 'depot');

  // 8. A refrigerant leak call: dispatch shows the loadout, readings name their tool, the job
  //    card reports what the equipment did.
  const jobId = await page.evaluate(() => window.__ego!.spawnLead({ channel: 'direct', preferredLotId: 'b-n-1', faultId: 'refrigerant-leak' }));
  expect(jobId).toBeTruthy();
  await page.evaluate((id) => {
    const s = window.__ego!.getState() as S;
    s.customers[s.jobs[id!].customerId].trust = 100;
    window.__ego!.dispatch({ type: 'accept-lead', jobId: id! });
    (window.__ego!.app.getState() as S).select({ kind: 'job', id: id! });
  }, jobId);
  await expect(page.getByTestId('dispatch-loadout')).toContainText('Recovery machine');
  await expect(page.getByTestId('dispatch-loadout')).toContainText(/All readings right \(typical call\)\d+%/);
  await press(page, 'dispatch-go', touch);
  await page.waitForFunction((id) => {
    window.__ego!.advanceMinutes(5);
    return (window.__ego!.getState() as S).jobs[id!].status === 'awaiting-diagnosis';
  }, jobId, { timeout: 60_000, polling: 50 });
  await expect(page.getByTestId('evidence')).toContainText('Measured with Electronic leak detector');
  await expect(page.getByTestId('evidence').getByTestId('evidence-tool')).toHaveCount(3);
  await shot(page, 'evidence');
  await press(page, 'diagnosis-refrigerant-leak', touch);
  await press(page, 'confirm-diagnosis', touch);
  await page.evaluate((id) => window.__ego!.dispatch({ type: 'submit-quote', jobId: id!, quote: { recommendation: 'repair', priceAdjust: 0.8 } }), jobId);
  expect(await state(page, (s, id) => s.jobs[id!].status, jobId)).toBe('repairing');
  // The van's vacuum pump and recovery machine are set out by the unit for this repair.
  const van = await state(page, (s) => s.employees['emp-owner'].position);
  await page.evaluate(() => (window.__ego!.app.getState() as S).select(null));
  await page.evaluate((p) => (window.__ego!.app.getState() as S).camera({ type: 'focus', target: p, distance: 6.5, azimuth: 2.35, elevation: 0.5, targetY: 0.4 }), van);
  await page.waitForTimeout(2500);
  await shot(page, 'jobsite');
  await page.evaluate((id) => (window.__ego!.app.getState() as S).select({ kind: 'job', id: id! }), jobId);
  await page.waitForFunction((id) => {
    window.__ego!.advanceMinutes(10);
    return (window.__ego!.getState() as S).jobs[id!].status === 'completed';
  }, jobId, { timeout: 60_000, polling: 50 });
  const report = await state(page, (s, id) => s.jobs[id!].toolReport, jobId);
  expect(report.toolIds).toHaveLength(6); // starter kit 2 + manifold + leak detector + pump + recovery machine
  expect(report.repairMinutesSaved).toBeGreaterThan(10);
  expect(report.quality).toBeGreaterThan(report.qualityBase);
  await expect(page.getByTestId('job-tool-report')).toContainText(/6 tools · saved \d+ min · workmanship \d+%/);
  await page.evaluate(() => (window.__ego!.app.getState() as S).select(null));

  // 9. Team panel: the Equipment tab shows each technician's effective performance.
  await press(page, 'nav-employees', touch);
  await page.getByTestId('panel-employees').getByRole('button', { name: 'Equipment' }).click();
  await expect(page.getByTestId('team-performance')).toBeVisible();
  await expect(page.getByTestId('equip-row-emp-owner')).toContainText('4 tools');
  await noSidewaysOverflow(page, 'team-equipment');
  await shot(page, 'team');
  await page.getByTestId('panel-employees').getByRole('button', { name: 'Close panel' }).click();

  // 10. Save, reload, continue: every tool, holder and use count survives exactly.
  const before = await state(page, (s) => JSON.stringify({ tools: s.tools, cash: s.finance.cash }));
  await press(page, 'save-game', touch);
  // Desktop confirms on the button (as in banking.spec); phones with a toast (as in mobile.spec).
  if (touch) await expect(page.getByTestId('toasts')).toContainText('Game saved');
  else await expect(page.getByTestId('save-game')).toContainText('Saved');
  await page.reload();
  await press(page, 'continue-game', touch);
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  const after = await state(page, (s) => JSON.stringify({ tools: s.tools, cash: s.finance.cash }));
  expect(after).toBe(before);
  expect(await state(page, (s) => Math.abs(s.finance.ledger.reduce((a: number, e: S) => a + e.amount, 0) - s.finance.cash) < 0.01)).toBe(true);
  expect(errors).toEqual([]);
});
