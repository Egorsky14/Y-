import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/game/simulation/newGame';
import { applyAction } from '@/game/simulation/actions';
import type { GameState, Loan } from '@/game/simulation/types';
import { FINANCING_CATEGORIES, postTransaction, reconcileCash, totalLoanBalance } from '@/game/economy/ledger';
import { amortizationSchedule, dailyInterest, loanTotals, monthlyPayment, splitInstallment } from '@/game/economy/banking/amortization';
import { availableCredit, creditLineOwed, processBankingDay } from '@/game/economy/banking/banking';
import { banking, installmentDue, pastDuePrincipal, payoffQuote } from '@/game/economy/banking/loans';
import { businessSnapshot, creditLineOffers, creditRating, loanOffers } from '@/game/economy/banking/underwriting';
import { BANKING } from '@/game/economy/banking/config';
import { deserialize, migrate, serialize, type SaveEnvelope } from '@/persistence/save';
import { newEngine } from './helpers';

/** Runs the banking part of endOfDay for each day up to and including `to`. */
function runDays(state: GameState, to: number): void {
  for (let d = state.clock.day + 1; d <= to; d++) {
    state.clock.day = d;
    processBankingDay(state);
  }
}

/** Leaves the company with `left` dollars (an owner draw: an ordinary operating expense). */
function drainCash(state: GameState, left = 0): void {
  postTransaction(state, { amount: -(state.finance.cash - left), category: 'owner-draw', memo: 'Test drain' });
}

function ok(r: { ok: boolean; reason?: string }) {
  if (!r.ok) throw new Error(`Action failed: ${r.reason}`);
}

function offer(state: GameState, productId: string) {
  const o = loanOffers(state).find((x) => x.productId === productId);
  if (!o) throw new Error(`No loan offer ${productId}`);
  return o;
}

function lineOffer(state: GameState, productId = 'online-line') {
  const o = creditLineOffers(state).find((x) => x.productId === productId);
  if (!o) throw new Error(`No line offer ${productId}`);
  return o;
}

function onlyLoan(state: GameState): Loan {
  expect(state.finance.loans).toHaveLength(1);
  return state.finance.loans[0];
}

function ledgerSum(state: GameState, category: string): number {
  return Math.round(state.finance.ledger.filter((e) => e.category === category).reduce((a, e) => a + e.amount, 0) * 100) / 100;
}

function openLine(state: GameState) {
  const o = lineOffer(state);
  expect(o.approved).toBe(true);
  ok(applyAction(state, { type: 'bank-open-credit-line', offerId: o.id }));
  return banking(state).creditLine!;
}

describe('amortization math', () => {
  it('matches the annuity formula and amortizes to exactly zero', () => {
    const p = monthlyPayment(10000, 12, 12);
    expect(p).toBeCloseTo(888.49, 2);
    const rows = amortizationSchedule(10000, 12, p);
    expect(rows).toHaveLength(12);
    expect(rows.at(-1)!.balance).toBe(0);
    expect(rows.reduce((a, r) => a + r.principal, 0)).toBeCloseTo(10000, 2);
    expect(rows[0].interest).toBeCloseTo(100, 2); // 1% of 10,000
    const t = loanTotals(10000, 12, 12, 2);
    expect(t.fee).toBe(200);
    expect(t.totalInterest).toBeCloseTo(rows.reduce((a, r) => a + r.interest, 0), 1);
  });

  it('handles zero interest exactly', () => {
    expect(monthlyPayment(1200, 0, 12)).toBe(100);
    const rows = amortizationSchedule(1200, 0, 100);
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.interest === 0)).toBe(true);
    expect(rows.at(-1)!.balance).toBe(0);
  });

  it('splits an installment interest-first and caps the final payment at the balance', () => {
    const s = splitInstallment(50, 12, 888.49);
    expect(s.interest).toBeCloseTo(0.5, 2);
    expect(s.principal).toBe(50);
    expect(s.total).toBeCloseTo(50.5, 2);
    expect(dailyInterest(36500, 10)).toBeCloseTo(10, 6);
  });
});

describe('underwriting', () => {
  it('approves startup products, declines the bank with plain-language reasons', () => {
    const s = createNewGame({ seed: 42 });
    const micro = offer(s, 'microloan');
    const bank = offer(s, 'bank-term');
    expect(micro.approved).toBe(true);
    expect(micro.amount).toBeGreaterThanOrEqual(3000);
    expect(bank.approved).toBe(false);
    expect(bank.reasons.join(' ')).toMatch(/30 days of operating history/);
    expect(lineOffer(s).approved).toBe(true);
  });

  it('rejects a declined application without moving money, and logs it', () => {
    const s = createNewGame({ seed: 42 });
    const cash = s.finance.cash;
    const r = applyAction(s, { type: 'bank-accept-loan', offerId: offer(s, 'bank-term').id });
    expect(r.ok).toBe(false);
    expect(s.finance.cash).toBe(cash);
    expect(s.finance.loans).toHaveLength(0);
    expect(banking(s).history.map((h) => h.type)).toEqual(['application', 'decline']);
  });

  it('offers are deterministic, stable within the quote week, and reading them changes nothing', () => {
    const a = createNewGame({ seed: 7 });
    const b = createNewGame({ seed: 7 });
    const before = JSON.stringify(a);
    const o1 = loanOffers(a);
    const o2 = loanOffers(a);
    expect(JSON.stringify(a)).toBe(before);
    expect(o1).toEqual(o2);
    expect(o1).toEqual(loanOffers(b));
    a.clock.day = 5; // same 7-day window
    expect(loanOffers(a).map((o) => [o.id, o.aprPercent])).toEqual(o1.map((o) => [o.id, o.aprPercent]));
  });

  it('refuses an expired quote and unknown products', () => {
    const s = createNewGame({ seed: 42 });
    const id = offer(s, 'microloan').id;
    s.clock.day = 9; // next quote window
    expect(applyAction(s, { type: 'bank-accept-loan', offerId: id })).toEqual({ ok: false, reason: 'This quote has expired. Review the new terms.' });
    expect(applyAction(s, { type: 'bank-accept-loan', offerId: 'free-money@7' }).ok).toBe(false);
  });
});

describe('term loans', () => {
  it('disburses net of the origination fee; principal is financing, the fee is an expense', () => {
    const s = createNewGame({ seed: 42 });
    const o = offer(s, 'microloan');
    const cash = s.finance.cash;
    ok(applyAction(s, { type: 'bank-accept-loan', offerId: o.id }));
    const loan = onlyLoan(s);
    expect(s.finance.cash).toBeCloseTo(cash + o.netProceeds, 2);
    expect(loan.balance).toBe(o.amount);
    expect(loan.monthlyPayment).toBe(o.monthlyPayment);
    expect(loan.nextPaymentDay).toBe(31);
    expect(s.stats.totalRevenue).toBe(0); // borrowed money is not revenue
    expect(s.stats.totalExpenses).toBeCloseTo(o.originationFee, 2);
    expect(ledgerSum(s, 'loan-proceeds')).toBe(o.amount);
    expect(reconcileCash(s).ok).toBe(true);
    expect(totalLoanBalance(s)).toBe(o.amount);
  });

  it('allows one open loan per lender', () => {
    const s = createNewGame({ seed: 42 });
    ok(applyAction(s, { type: 'bank-accept-loan', offerId: offer(s, 'microloan').id }));
    const again = offer(s, 'microloan');
    expect(again.approved).toBe(false);
    expect(applyAction(s, { type: 'bank-accept-loan', offerId: again.id }).ok).toBe(false);
    expect(s.finance.loans).toHaveLength(1);
  });

  it('pays every installment on schedule, exactly once, and retires the loan', () => {
    const s = createNewGame({ seed: 42 });
    const o = offer(s, 'microloan');
    ok(applyAction(s, { type: 'bank-accept-loan', offerId: o.id }));
    const loan = onlyLoan(s);
    const first = installmentDue(loan);
    expect(first.interest).toBeCloseTo((o.amount * o.aprPercent) / 100 / 12, 2);
    runDays(s, 30);
    expect(loan.paymentsMade).toBe(0);
    runDays(s, 31);
    expect(loan.paymentsMade).toBe(1);
    expect(loan.balance).toBeCloseTo(o.amount - first.principal, 2);
    runDays(s, 59);
    expect(loan.paymentsMade).toBe(1); // no double processing between due dates
    runDays(s, 31 + 30 * (o.termMonths - 1));
    expect(s.finance.loans).toHaveLength(0);
    expect(banking(s).onTimePayments).toBe(o.termMonths);
    expect(-ledgerSum(s, 'loan-principal')).toBeCloseTo(o.amount, 2);
    expect(-ledgerSum(s, 'loan-interest')).toBeCloseTo(o.totalInterest, 0);
    expect(reconcileCash(s).ok).toBe(true);
  });

  it('extra payments reduce principal; early payoff charges accrued interest and the prepayment fee', () => {
    const s = createNewGame({ seed: 42 });
    const o = offer(s, 'online-term');
    expect(o.prepaymentFeePercent).toBe(2);
    ok(applyAction(s, { type: 'bank-accept-loan', offerId: o.id }));
    const loan = onlyLoan(s);
    ok(applyAction(s, { type: 'bank-loan-extra-payment', loanId: loan.id, amount: 1020 }));
    expect(loan.balance).toBeCloseTo(o.amount - 1000, 2); // $20 of it was the 2% fee
    expect(applyAction(s, { type: 'bank-loan-extra-payment', loanId: loan.id, amount: o.amount * 2 }).ok).toBe(false);
    runDays(s, 16);
    const q = payoffQuote(s, loan);
    expect(q.interest).toBeCloseTo((loan.balance * o.aprPercent) / 100 / 12 / 2, 2); // half a month
    expect(q.fee).toBeCloseTo(loan.balance * 0.02, 2);
    const cash = s.finance.cash;
    ok(applyAction(s, { type: 'bank-loan-payoff', loanId: loan.id }));
    expect(s.finance.loans).toHaveLength(0);
    expect(s.finance.cash).toBeCloseTo(cash - q.total, 2);
    expect(reconcileCash(s).ok).toBe(true);
  });

  it('refuses a payoff or extra payment the company cannot afford', () => {
    const s = createNewGame({ seed: 42 });
    ok(applyAction(s, { type: 'bank-accept-loan', offerId: offer(s, 'microloan').id }));
    const loan = onlyLoan(s);
    drainCash(s, 100);
    expect(applyAction(s, { type: 'bank-loan-payoff', loanId: loan.id }).ok).toBe(false);
    expect(applyAction(s, { type: 'bank-loan-extra-payment', loanId: loan.id, amount: 500 }).ok).toBe(false);
    expect(s.finance.cash).toBe(100);
  });

  it('missed installments add late fees, escalate to delinquency and default, and cure when paid', () => {
    const s = createNewGame({ seed: 42 });
    ok(applyAction(s, { type: 'bank-accept-loan', offerId: offer(s, 'microloan').id }));
    const loan = onlyLoan(s);
    runDays(s, 25);
    const scoreBefore = creditRating(s).score;
    drainCash(s);
    const due = installmentDue(loan);
    runDays(s, 31);
    expect(loan.pastDue).toBeCloseTo(due.total + 50, 2);
    expect(loan.status).toBe('past-due');
    expect(loan.paymentsMade).toBe(0);
    expect(creditRating(s).score).toBeLessThan(scoreBefore);
    runDays(s, 61);
    expect(loan.status).toBe('delinquent');
    runDays(s, 91);
    expect(loan.status).toBe('default');
    expect(offer(s, 'online-term').approved).toBe(false);
    expect(offer(s, 'online-term').reasons[0]).toMatch(/default/);
    // Cash comes in; the past due is collected automatically the next day and the loan is current.
    postTransaction(s, { amount: 20000, category: 'service-revenue', memo: 'Big job' });
    runDays(s, 92);
    expect(loan.pastDue).toBe(0);
    expect(loan.status).toBe('current');
    expect(-ledgerSum(s, 'late-fee')).toBe(150); // three missed installments × $50
    expect(reconcileCash(s).ok).toBe(true);
  });

  it('never bills principal twice when every installment is missed', () => {
    const s = createNewGame({ seed: 42 });
    const o = offer(s, 'microloan');
    ok(applyAction(s, { type: 'bank-accept-loan', offerId: o.id }));
    const loan = onlyLoan(s);
    drainCash(s);
    for (let m = 1; m <= o.termMonths + 3; m++) {
      runDays(s, 1 + 30 * m);
      expect(pastDuePrincipal(loan)).toBeLessThanOrEqual(loan.balance + 0.01);
    }
    expect(pastDuePrincipal(loan)).toBeCloseTo(o.amount, 2);
    expect(installmentDue(loan).principal).toBe(0);
  });
});

describe('line of credit', () => {
  it('draws add cash and debt, never revenue; limits and minimums are enforced', () => {
    const s = createNewGame({ seed: 42 });
    const line = openLine(s);
    expect(availableCredit(line)).toBe(line.limit);
    expect(applyAction(s, { type: 'bank-credit-draw', amount: 50 }).ok).toBe(false);
    expect(applyAction(s, { type: 'bank-credit-draw', amount: line.limit + 1 }).ok).toBe(false);
    const cash = s.finance.cash;
    ok(applyAction(s, { type: 'bank-credit-draw', amount: 2000 }));
    expect(s.finance.cash).toBe(cash + 2000);
    expect(line.principal).toBe(2000);
    expect(s.stats.totalRevenue).toBe(0);
    ok(applyAction(s, { type: 'bank-credit-draw', amount: line.limit - 2000 }));
    expect(availableCredit(line)).toBe(0);
    expect(applyAction(s, { type: 'bank-credit-draw', amount: 100 }).ok).toBe(false);
    expect(totalLoanBalance(s)).toBe(line.limit);
  });

  it('accrues interest daily on the drawn balance and bills it on the statement', () => {
    const s = createNewGame({ seed: 42 });
    const line = openLine(s);
    runDays(s, 5);
    expect(line.accruedInterest).toBe(0); // nothing drawn, nothing owed
    ok(applyAction(s, { type: 'bank-credit-draw', amount: 2000 }));
    runDays(s, 15);
    expect(line.accruedInterest).toBeCloseTo(((2000 * line.aprPercent) / 100 / 365) * 10, 6);
    runDays(s, 31); // statement day (opened day 1 + 30)
    const interest = ((2000 * line.aprPercent) / 100 / 365) * 26;
    expect(line.interestDue).toBeCloseTo(interest, 2);
    expect(line.minimumDue).toBeCloseTo(line.interestDue + Math.max(BANKING.minimumPaymentFloor, 2000 * BANKING.minimumPaymentPercent), 2);
    expect(line.paymentDueDay).toBe(46);
    const minimum = line.minimumDue;
    runDays(s, 46); // autopay
    expect(line.minimumDue).toBe(0);
    expect(line.interestDue).toBe(0);
    expect(line.principal).toBeCloseTo(2000 - (minimum - interest), 1);
    expect(banking(s).onTimePayments).toBe(1);
    expect(reconcileCash(s).ok).toBe(true);
  });

  it('repays interest before principal, then closes only at zero', () => {
    const s = createNewGame({ seed: 42 });
    const line = openLine(s);
    ok(applyAction(s, { type: 'bank-credit-draw', amount: 1500 }));
    runDays(s, 31);
    expect(applyAction(s, { type: 'bank-close-credit-line' }).ok).toBe(false);
    const billed = line.interestDue;
    ok(applyAction(s, { type: 'bank-credit-repay', amount: 100 }));
    expect(line.interestDue).toBe(0);
    expect(line.principal).toBeCloseTo(1500 - (100 - billed), 2);
    expect(-ledgerSum(s, 'credit-interest')).toBeCloseTo(billed, 2);
    expect(applyAction(s, { type: 'bank-credit-repay', amount: creditLineOwed(line).payoff + 5 }).ok).toBe(false);
    ok(applyAction(s, { type: 'bank-credit-repay', amount: creditLineOwed(line).payoff }));
    expect(creditLineOwed(line).payoff).toBe(0);
    ok(applyAction(s, { type: 'bank-close-credit-line' }));
    expect(line.status).toBe('closed');
    expect(applyAction(s, { type: 'bank-credit-draw', amount: 200 }).ok).toBe(false);
    expect(reconcileCash(s).ok).toBe(true);
  });

  it('a missed minimum adds a late fee, pauses draws, then suspends the line', () => {
    const s = createNewGame({ seed: 42 });
    const line = openLine(s);
    ok(applyAction(s, { type: 'bank-credit-draw', amount: 2000 }));
    runDays(s, 31);
    drainCash(s);
    const minimum = line.minimumDue;
    runDays(s, 46);
    expect(line.feesDue).toBe(line.lateFee);
    expect(line.pastDue).toBeCloseTo(minimum + line.lateFee, 2);
    expect(banking(s).missedPaymentDays).toEqual([46]);
    expect(businessSnapshot(s).worstStatus).toBe('past-due');
    postTransaction(s, { amount: 50, category: 'service-revenue', memo: 'Small job' }); // not enough to cure
    expect(applyAction(s, { type: 'bank-credit-draw', amount: 100 }).ok).toBe(false);
    runDays(s, 76);
    expect(line.status).toBe('suspended');
    expect(availableCredit(line)).toBe(0);
  });
});

describe('credit rating and exploits', () => {
  it('rises with on-time payments and operating history', () => {
    const s = createNewGame({ seed: 42 });
    ok(applyAction(s, { type: 'bank-accept-loan', offerId: offer(s, 'microloan').id }));
    const start = creditRating(s).score;
    runDays(s, 31 + 30 * 3);
    expect(banking(s).onTimePayments).toBe(4);
    expect(banking(s).creditScore).toBeGreaterThan(start);
    expect(banking(s).creditFactors.some((f) => f.label.startsWith('On-time payments'))).toBe(true);
  });

  it('borrowing never creates net worth, and total credit is capped', () => {
    const s = createNewGame({ seed: 42 });
    const net = () => s.finance.cash - totalLoanBalance(s);
    const start = net();
    for (const o of loanOffers(s)) if (o.approved) ok(applyAction(s, { type: 'bank-accept-loan', offerId: o.id }));
    const lo = lineOffer(s);
    if (lo.approved) ok(applyAction(s, { type: 'bank-open-credit-line', offerId: lo.id }));
    const line = banking(s).creditLine;
    if (line) ok(applyAction(s, { type: 'bank-credit-draw', amount: availableCredit(line) }));
    expect(net()).toBeLessThanOrEqual(start); // only fees changed it, downward
    expect(totalLoanBalance(s)).toBeLessThanOrEqual(BANKING.debtCapFloor);
    // Nothing further is offered and repeating the actions borrows nothing more.
    for (const o of loanOffers(s)) expect(applyAction(s, { type: 'bank-accept-loan', offerId: o.id }).ok).toBe(false);
    expect(applyAction(s, { type: 'bank-credit-draw', amount: 100 }).ok).toBe(false);
    expect(reconcileCash(s).ok).toBe(true);
    const financing = s.finance.ledger.filter((e) => FINANCING_CATEGORIES.has(e.category)).reduce((a, e) => a + e.amount, 0);
    expect(financing).toBeCloseTo(totalLoanBalance(s), 2);
  });
});

describe('save and load', () => {
  it('round-trips loans, the credit line and history, and continues identically', () => {
    const s = createNewGame({ seed: 42 });
    ok(applyAction(s, { type: 'bank-accept-loan', offerId: offer(s, 'microloan').id }));
    openLine(s);
    ok(applyAction(s, { type: 'bank-credit-draw', amount: 1500 }));
    runDays(s, 40);
    const copy = deserialize(serialize(s));
    expect(JSON.stringify(copy)).toBe(JSON.stringify(s));
    runDays(s, 120);
    runDays(copy, 120);
    expect(JSON.stringify(copy.finance)).toBe(JSON.stringify(s.finance));
    // A payment already made before saving is not made again after loading.
    expect(copy.finance.loans[0].paymentsMade).toBe(s.finance.loans[0].paymentsMade);
  });

  it('migrates a schema-1 save with a vehicle loan', () => {
    const s = createNewGame({ seed: 42 });
    s.clock.day = 20;
    const legacy = JSON.parse(JSON.stringify(s));
    delete legacy.finance.banking;
    legacy.finance.loans = [{ id: 'loan-old', principal: 30000, balance: 29000, monthlyPayment: 621.13, aprPercent: 8.9, nextPaymentDay: 41, purpose: 'Full-size van Unit 2' }];
    const state = migrate({ schemaVersion: 1, savedAt: '', appVersion: '0.1.0', state: legacy } as SaveEnvelope);
    expect(state.schemaVersion).toBe(2);
    expect(state.finance.banking.creditScore).toBe(52);
    const loan = state.finance.loans[0];
    expect(loan.kind).toBe('vehicle');
    expect(loan.status).toBe('current');
    expect(loan.lastPaymentDay).toBe(11);
    runDays(state, 41);
    expect(loan.paymentsMade).toBe(1);
    expect(loan.balance).toBeLessThan(29000);
    expect(reconcileCash(state).ok).toBe(true);
  });
});

describe('engine integration', () => {
  it('processes the daily cycle once per game day through the real clock', () => {
    const engine = newEngine(42);
    const s = engine.state;
    ok(engine.dispatch({ type: 'bank-accept-loan', offerId: offer(s, 'microloan').id }));
    ok(engine.dispatch({ type: 'bank-open-credit-line', offerId: lineOffer(s).id }));
    ok(engine.dispatch({ type: 'bank-credit-draw', amount: 1000 }));
    while (engine.state.clock.day < 32) engine.advanceMinutes(60);
    const st = engine.state;
    expect(st.finance.loans.find((l) => l.kind === 'bank')!.paymentsMade).toBe(1);
    expect(banking(st).history.filter((h) => h.type === 'statement')).toHaveLength(1);
    expect(reconcileCash(st).ok).toBe(true);
  }, 60_000);

  it('vehicle financing shows up as a loan and is settled when the van is sold', () => {
    const engine = newEngine(42);
    const s = engine.state;
    const listing = s.usedListings.find((l) => l.classId === 'compact-van');
    ok(engine.dispatch({ type: 'buy-vehicle', request: { classId: 'compact-van', listingId: listing?.id, financing: 'loan' } }));
    const loan = s.finance.loans.find((l) => l.kind === 'vehicle')!;
    expect(loan.lender).toBe('Dealer financing');
    const vehicle = Object.values(s.vehicles).find((v) => v.financing && 'loanId' in v.financing)!;
    ok(engine.dispatch({ type: 'sell-vehicle', vehicleId: vehicle.id }));
    expect(s.finance.loans.find((l) => l.id === loan.id)).toBeUndefined();
    expect(reconcileCash(s).ok).toBe(true);
  });
});
