import { test, expect, type Page } from '@playwright/test';

/**
 * Business banking end to end, through the real UI of the production build: apply for a loan and a
 * line of credit, receive the money, spend it on the business, let a month of interest and
 * payments run, repay, save, reload, and pay off — with the ledger reconciled at every step.
 */

const SHOT = (name: string) => `docs/screenshots/${name}.png`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

async function state<T, A = undefined>(page: Page, fn: (s: S, arg: A) => T, arg?: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = window.__ego!.getState()! as S;
      return new Function('s', 'arg', `return (${src})(s, arg)`)(s, a) as T;
    },
    [fn.toString(), arg] as const,
  );
}

const money = (v: number) => Math.round(v * 100) / 100;

async function reconciled(page: Page): Promise<boolean> {
  return state(page, (s) => Math.abs(s.finance.ledger.reduce((a: number, e: S) => a + e.amount, 0) - s.finance.cash) < 0.01);
}

async function openBanking(page: Page) {
  await page.getByTestId('nav-finance').click();
  await page.getByTestId('panel-finance').getByRole('button', { name: /Banking & Credit/ }).click();
  await expect(page.getByTestId('banking-tab')).toBeVisible();
}

test('borrow, spend, accrue, repay, save/load and pay off through the Banking tab', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  await page.keyboard.press(' '); // pause: time moves only when the test advances it
  await expect.poll(() => state(page, (s) => s.speed)).toBe(0);

  // 1. Offers: the startup lenders approve, the bank explains why it will not yet.
  await openBanking(page);
  await expect(page.getByTestId('offer-bank-term')).toContainText('30 days of operating history');
  await expect(page.getByTestId('bank-score')).toContainText('52');
  await page.screenshot({ path: SHOT('20-banking-offers') });

  // 2. Apply for the microloan: review the terms, accept, and the money arrives net of the fee.
  const cash0: number = await state(page, (s) => s.finance.cash);
  await page.getByTestId('apply-microloan').click();
  await expect(page.getByTestId('bank-review')).toContainText('Deposited to cash');
  await page.screenshot({ path: SHOT('21-banking-review') });
  await page.getByTestId('bank-confirm').click();
  await expect(page.getByTestId('bank-message')).toContainText('Loan funded');
  const loan = await state(page, (s) => ({ ...s.finance.loans[0] }));
  expect(loan.kind).toBe('bank');
  const fee: number = await state(page, (s) => -s.finance.ledger.filter((e: S) => e.category === 'loan-fee').reduce((a: number, e: S) => a + e.amount, 0));
  expect(money(await state(page, (s) => s.finance.cash))).toBe(money(cash0 + loan.balance - fee));
  expect(await state(page, (s) => s.stats.totalRevenue)).toBe(0);

  // 3. Open the starter line of credit and borrow against it.
  await page.getByTestId('apply-online-line').click();
  await page.getByTestId('bank-confirm').click();
  await expect(page.getByTestId('bank-message')).toContainText('Line of credit open');
  await page.getByTestId('bank-draw-input').fill('2000');
  await page.getByTestId('bank-draw').click();
  await expect(page.getByTestId('bank-message')).toContainText('Drew $2,000');
  const line = await state(page, (s) => ({ ...s.finance.banking.creditLine }));
  expect(line.principal).toBe(2000);
  // Over-limit draws are refused with an explanation.
  await page.getByTestId('bank-draw-input').fill(String(line.limit));
  await page.getByTestId('bank-draw').click();
  await expect(page.getByTestId('bank-message')).toContainText('available');
  expect(await state(page, (s) => s.finance.banking.creditLine.principal)).toBe(2000);
  await page.screenshot({ path: SHOT('22-banking-active') });
  expect(await reconciled(page)).toBe(true);
  await page.keyboard.press('Escape');

  // 4. Spend the borrowed money on the business: a second van, paid in cash.
  const vehicles0: number = await state(page, (s) => Object.keys(s.vehicles).length);
  const bought = await page.evaluate(() => {
    const s = window.__ego!.getState()! as S;
    const listing = s.usedListings.find((l: S) => l.classId === 'compact-van');
    return window.__ego!.dispatch({ type: 'buy-vehicle', request: { classId: 'compact-van', listingId: listing?.id, financing: 'cash' } });
  });
  expect(bought.ok).toBe(true);
  expect(await state(page, (s) => Object.keys(s.vehicles).length)).toBe(vehicles0 + 1);

  // 5. A month passes: line interest accrues daily and is billed; the first installment is paid.
  await page.evaluate(() => window.__ego!.advanceMinutes(1440 * 31));
  const month = await state(page, (s) => ({
    paymentsMade: s.finance.loans.find((l: S) => l.kind === 'bank')?.paymentsMade,
    interestDue: s.finance.banking.creditLine.interestDue,
    statements: s.finance.banking.history.filter((h: S) => h.type === 'statement').length,
    loanInterest: -s.finance.ledger.filter((e: S) => e.category === 'loan-interest').reduce((a: number, e: S) => a + e.amount, 0),
  }));
  expect(month.paymentsMade).toBe(1);
  expect(month.statements).toBe(1);
  expect(month.interestDue).toBeGreaterThan(0);
  expect(month.loanInterest).toBeGreaterThan(0);
  expect(await reconciled(page)).toBe(true);

  // 6. Repay the whole line from the UI.
  await openBanking(page);
  await expect(page.getByTestId('bank-history')).toContainText('Statement');
  await page.getByTestId('bank-line').getByRole('button', { name: 'Repay all' }).click();
  await page.getByTestId('bank-repay').click();
  await expect(page.getByTestId('bank-message')).toContainText('Repaid');
  const afterRepay = await state(page, (s) => ({ ...s.finance.banking.creditLine }));
  expect(afterRepay.principal).toBe(0);
  expect(afterRepay.interestDue).toBe(0);
  await page.screenshot({ path: SHOT('23-banking-after-month') });
  await page.keyboard.press('Escape');

  // 7. Save, reload, continue: every banking record survives exactly.
  const before = await state(page, (s) => JSON.stringify({ loans: s.finance.loans, banking: s.finance.banking, cash: s.finance.cash }));
  await page.getByTestId('save-game').click();
  await expect(page.getByTestId('save-game')).toContainText('Saved');
  await page.reload();
  await page.getByTestId('continue-game').click();
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  const after = await state(page, (s) => JSON.stringify({ loans: s.finance.loans, banking: s.finance.banking, cash: s.finance.cash }));
  expect(after).toBe(before);

  // 8. Pay the loan off early from the reloaded game.
  await page.keyboard.press(' ');
  await openBanking(page);
  const loanId: string = await state(page, (s) => s.finance.loans.find((l: S) => l.kind === 'bank').id);
  await page.getByTestId(`loan-payoff-${loanId}`).click();
  await expect(page.getByTestId('bank-message')).toContainText('paid off');
  expect(await state(page, (s) => s.finance.loans.filter((l: S) => l.kind === 'bank').length)).toBe(0);
  expect(await reconciled(page)).toBe(true);
  await expect(page.getByTestId('panel-finance')).toContainText('Books reconciled');

  // 9. The tab stays usable on a phone-sized viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('bank-offers')).toBeVisible();
  const overflow = await page.getByTestId('banking-tab').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: SHOT('24-banking-phone') });

  expect(errors).toEqual([]);
});
