import { test, expect, type Page } from '@playwright/test';

/**
 * Banking & Credit layout on three screens: the iPhone 14 project (390×844, touch), small-1024
 * (1024×768) and desktop-1080p (1920×1080). Checks the panel header, tabs, close button, every
 * banking control and the payment schedule fit and work, then closes the panel.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

// A control that cannot be reached (covered or off-screen) must fail fast, not wait for the suite timeout.
test.use({ actionTimeout: 20_000 });

const shot = (page: Page, name: string) => page.screenshot({ path: `docs/screenshots/banking-${name}-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` });

async function state<T>(page: Page, fn: (s: S) => T): Promise<T> {
  return page.evaluate((src) => new Function('s', `return (${src})(s)`)(window.__ego!.getState()! as S) as T, fn.toString());
}

/** Clicks with the device's own input: a tap on touch projects, a click elsewhere. */
async function press(page: Page, testId: string, touch: boolean) {
  const el = page.getByTestId(testId);
  await el.scrollIntoViewIfNeeded();
  if (touch) await el.tap();
  else await el.click();
}

/** Everything inside the element is within the viewport width and nothing scrolls sideways. */
async function noSidewaysOverflow(page: Page, testId: string) {
  const r = await page.getByTestId(testId).evaluate((el) => {
    const vw = window.innerWidth;
    const bad: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1) bad.push(`page ${document.documentElement.scrollWidth}>${vw}`);
    if (el.scrollWidth > el.clientWidth + 1) bad.push(`${(el as HTMLElement).dataset.testid} ${el.scrollWidth}>${el.clientWidth}`);
    for (const c of Array.from(el.querySelectorAll<HTMLElement>('button, input, .bank-terms, .bank-offer, .bank-loan, table'))) {
      const b = c.getBoundingClientRect();
      if (b.width === 0) continue;
      if (b.right > vw + 1 || b.left < -1) bad.push(`${c.tagName.toLowerCase()} "${(c.dataset.testid || c.textContent || '').trim().slice(0, 20)}" ${Math.round(b.left)}..${Math.round(b.right)}`);
    }
    return bad;
  });
  expect(r).toEqual([]);
}

/** On touch screens every banking control is finger-sized (36px, the game's compact minimum). */
async function fingerSized(page: Page) {
  const small = await page.getByTestId('banking-tab').evaluate((el) =>
    Array.from(el.querySelectorAll<HTMLElement>('button, input'))
      .map((c) => ({ c, b: c.getBoundingClientRect() }))
      .filter(({ b }) => b.width > 0 && Math.min(b.width, b.height) < 36)
      .map(({ c, b }) => `${(c.dataset.testid || c.textContent || '').trim().slice(0, 20)} ${Math.round(b.width)}x${Math.round(b.height)}`),
  );
  expect(small).toEqual([]);
}

test('banking panel layout: header, tabs, controls, schedule and close', async ({ page }, info) => {
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
  // Touch devices get a one-time gesture tutorial once the world is ready.
  if (touch) {
    await expect(page.getByTestId('touch-tutorial')).toBeVisible();
    await page.getByTestId('touch-tutorial-ok').tap();
  }
  await page.evaluate(() => ((window.__ego!.getState() as S).speed = 0)); // pause: time moves only when the test acts

  // Header: title, all four tabs reachable, the close button on screen.
  await press(page, 'nav-finance', touch);
  const panel = page.getByTestId('panel-finance');
  await expect(panel.getByRole('heading', { name: 'Finances' })).toBeVisible();
  const tabs = ['Overview', 'Banking & Credit', 'Ledger', 'A/R & Debt'];
  for (const t of tabs) {
    const b = panel.getByRole('button', { name: t, exact: true });
    await b.scrollIntoViewIfNeeded();
    await expect(b).toBeInViewport();
  }
  const close = panel.getByRole('button', { name: 'Close panel' });
  await expect(close).toBeInViewport({ ratio: 1 });
  const banking = panel.getByRole('button', { name: 'Banking & Credit', exact: true });
  if (touch) await banking.tap();
  else await banking.click();
  await expect(page.getByTestId('banking-tab')).toBeVisible();
  await expect(close).toBeInViewport({ ratio: 1 });
  await noSidewaysOverflow(page, 'banking-tab');
  await shot(page, 'overview');

  // Apply for a loan for less than the approval: the terms follow the amount.
  await press(page, 'apply-microloan', touch);
  const amount = page.getByTestId('bank-loan-amount');
  await amount.fill('4000');
  await expect(page.getByTestId('bank-loan-payment')).not.toHaveText('');
  const payment4000 = await page.getByTestId('bank-loan-payment').textContent();
  await amount.fill('5000');
  await expect(page.getByTestId('bank-loan-payment')).not.toHaveText(payment4000!);
  await amount.fill('4000');
  await noSidewaysOverflow(page, 'banking-tab');
  if (touch) await fingerSized(page);
  await shot(page, 'review');
  await press(page, 'bank-confirm', touch);
  await expect(page.getByTestId('bank-message')).toContainText('Loan funded');
  expect(await state(page, (s) => s.finance.loans[0].balance)).toBe(4000);

  // Line of credit: open, borrow, repay.
  await press(page, 'apply-online-line', touch);
  await press(page, 'bank-confirm', touch);
  await page.getByTestId('bank-draw-input').fill('1000');
  await press(page, 'bank-draw', touch);
  await expect(page.getByTestId('bank-message')).toContainText('Drew $1,000');
  await page.getByTestId('bank-repay-input').fill('400');
  await press(page, 'bank-repay', touch);
  await expect(page.getByTestId('bank-message')).toContainText('Repaid $400');
  expect(await state(page, (s) => s.finance.banking.creditLine.principal)).toBe(600);

  // Active loan: extra payment and the payment schedule.
  const loanId: string = await state(page, (s) => s.finance.loans[0].id);
  await page.getByTestId(`loan-extra-input-${loanId}`).fill('500');
  await press(page, `loan-extra-${loanId}`, touch);
  await expect(page.getByTestId('bank-message')).toContainText('Paid $500 extra');
  await page.getByTestId(`loan-${loanId}`).getByRole('button', { name: 'Schedule' }).click();
  const schedule = page.getByTestId(`loan-${loanId}`).locator('table.bank-schedule');
  await expect(schedule).toBeVisible();
  await expect(schedule.locator('tbody tr')).toHaveCount(12);
  await schedule.scrollIntoViewIfNeeded();
  await noSidewaysOverflow(page, 'banking-tab');
  if (touch) await fingerSized(page);
  await shot(page, 'schedule');

  // Close works from the bottom of a scrolled panel.
  await expect(close).toBeInViewport({ ratio: 1 });
  if (touch) await close.tap();
  else await close.click();
  await expect(panel).toBeHidden();
  expect(await state(page, (s) => Math.abs(s.finance.ledger.reduce((a: number, e: S) => a + e.amount, 0) - s.finance.cash) < 0.01)).toBe(true);
  expect(errors).toEqual([]);
});
