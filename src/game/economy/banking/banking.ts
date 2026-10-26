import type { CreditLine, DebtStatus, GameState, Loan } from '../../simulation/types';
import { pushEvent } from '../../simulation/events';
import { postTransaction } from '../ledger';
import { BANKING, CREDIT_LINE_PRODUCTS, DAYS_PER_MONTH, LOAN_PRODUCTS } from './config';
import { cents, dailyInterest } from './amortization';
import { banking, createLoan, installmentDue, logBanking, payInstallment, payLoanPastDue, payoffQuote, settleLoan } from './loans';
import { businessSnapshot, creditLineOffer, creditRating, loanOffer, ratingBand } from './underwriting';

/**
 * Business banking: player actions (accept a loan, prepay, pay off; open, draw on, repay and
 * close a line of credit) and the daily cycle run from endOfDay (installments, interest accrual,
 * statements, autopay, late fees, delinquency, limit reviews, credit rating). Every cash movement
 * goes through the ledger; nothing here keeps a separate balance.
 */

export type BankingResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): BankingResult => ({ ok: false, reason });
const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

// ---------------------------------------------------------------- term loans

export function acceptLoanOffer(state: GameState, offerId: string): BankingResult {
  const productId = offerId.split('@')[0];
  const product = LOAN_PRODUCTS.find((p) => p.id === productId);
  if (!product) return fail('That offer is no longer available.');
  const offer = loanOffer(state, product);
  if (offer.id !== offerId) return fail('This quote has expired. Review the new terms.');
  logBanking(state, { type: 'application', text: `Applied to ${offer.lender} for ${money(offer.amount)}` });
  if (!offer.approved) {
    logBanking(state, { type: 'decline', text: `${offer.lender} declined: ${offer.reasons[0]}` });
    return fail(offer.reasons[0] ?? 'Application declined.');
  }
  const loan = createLoan(state, {
    principal: offer.amount,
    aprPercent: offer.aprPercent,
    termMonths: offer.termMonths,
    purpose: `${offer.lender} business loan`,
    lender: offer.lender,
    kind: 'bank',
    prepaymentFeePercent: offer.prepaymentFeePercent,
    lateFee: offer.lateFee,
  });
  postTransaction(state, { amount: offer.amount, category: 'loan-proceeds', memo: `Loan proceeds — ${offer.lender}` });
  if (offer.originationFee > 0) postTransaction(state, { amount: -offer.originationFee, category: 'loan-fee', memo: `Origination fee — ${offer.lender}` });
  logBanking(state, { type: 'approval', text: `${offer.lender} approved ${money(offer.amount)} at ${offer.aprPercent}% APR for ${offer.termMonths} months`, amount: offer.amount });
  logBanking(state, { type: 'disbursement', text: `Deposited ${money(offer.netProceeds)} after a ${money(offer.originationFee)} origination fee`, amount: offer.netProceeds });
  pushEvent(state, { type: 'money', title: `Loan approved: ${money(offer.amount)}`, body: `${offer.lender} · ${money(loan.monthlyPayment)}/month for ${offer.termMonths} months. First payment day ${loan.nextPaymentDay}.` });
  return { ok: true };
}

/** Extra payment: clears anything past due first, then reduces principal (the payment stays the same; the term shortens). */
export function extraLoanPayment(state: GameState, loanId: string, amount: number): BankingResult {
  const loan = state.finance.loans.find((l) => l.id === loanId);
  if (!loan) return fail('Unknown loan.');
  const value = cents(amount);
  if (!(value > 0)) return fail('Enter an amount to pay.');
  const owed = cents((loan.pastDue ?? 0) + loan.balance);
  if (value > owed + 0.004) return fail(`That is more than you owe (${money(owed)}). Use Pay off to close the loan.`);
  if (value > state.finance.cash + 0.004) return fail('Not enough cash for that payment.');
  let left = value;
  if ((loan.pastDue ?? 0) > 0) {
    if (left + 0.004 < (loan.pastDue ?? 0)) return fail(`Pay at least the past-due amount (${money(loan.pastDue ?? 0)}) first.`);
    left = cents(left - payLoanPastDue(state, loan, loan.purpose));
  }
  // The prepayment fee is a percent of the principal prepaid, so split the payment into principal + fee.
  const rate = (loan.prepaymentFeePercent ?? 0) / 100;
  const principal = cents(Math.min(left / (1 + rate), loan.balance));
  const fee = cents(Math.min(left - principal, principal * rate));
  if (principal > 0) {
    if (fee > 0) postTransaction(state, { amount: -fee, category: 'loan-fee', memo: `Prepayment fee — ${loan.purpose}` });
    postTransaction(state, { amount: -principal, category: 'loan-principal', memo: `Extra principal — ${loan.purpose}` });
    loan.balance = cents(loan.balance - principal);
  }
  logBanking(state, { type: 'payment', text: `Extra payment on ${loan.purpose}${fee > 0 ? ` (incl. ${money(fee)} prepayment fee)` : ''}`, amount: value });
  if (loan.balance <= 0.004 && (loan.pastDue ?? 0) <= 0) {
    state.finance.loans = state.finance.loans.filter((l) => l.id !== loan.id);
    logBanking(state, { type: 'payoff', text: `${loan.purpose} paid in full` });
  }
  return { ok: true };
}

export function payoffLoan(state: GameState, loanId: string): BankingResult {
  const loan = state.finance.loans.find((l) => l.id === loanId);
  if (!loan) return fail('Unknown loan.');
  const q = payoffQuote(state, loan);
  if (q.total > state.finance.cash + 0.004) return fail(`Payoff is ${money(q.total)}; you have ${money(state.finance.cash)}.`);
  const paid = settleLoan(state, loan, loan.purpose);
  logBanking(state, { type: 'payoff', text: `Paid off ${loan.purpose} early${q.fee > 0 ? ` (incl. ${money(q.fee)} prepayment fee)` : ''}`, amount: paid });
  pushEvent(state, { type: 'success', title: 'Loan paid off', body: `${loan.purpose}: ${money(paid)} including interest to date${q.fee > 0 ? ' and the prepayment fee' : ''}.` });
  return { ok: true };
}

// ---------------------------------------------------------------- line of credit

export function creditLineOwed(line: CreditLine): { fees: number; interest: number; accrued: number; principal: number; payoff: number } {
  const accrued = cents(line.accruedInterest);
  return { fees: cents(line.feesDue), interest: cents(line.interestDue), accrued, principal: cents(line.principal), payoff: cents(line.feesDue + line.interestDue + accrued + line.principal) };
}

export function availableCredit(line: CreditLine | undefined): number {
  if (!line || line.status !== 'active') return 0;
  return Math.max(0, cents(line.limit - line.principal));
}

export function openCreditLine(state: GameState, offerId: string): BankingResult {
  const productId = offerId.split('@')[0];
  const product = CREDIT_LINE_PRODUCTS.find((p) => p.id === productId);
  if (!product) return fail('That offer is no longer available.');
  const offer = creditLineOffer(state, product);
  if (offer.id !== offerId) return fail('This quote has expired. Review the new terms.');
  logBanking(state, { type: 'application', text: `Applied to ${offer.lender} for a ${money(offer.limit)} line of credit` });
  if (!offer.approved) {
    logBanking(state, { type: 'decline', text: `${offer.lender} declined: ${offer.reasons[0]}` });
    return fail(offer.reasons[0] ?? 'Application declined.');
  }
  const day = state.clock.day;
  banking(state).creditLine = {
    id: `loc-${state.nextId++}`,
    lender: offer.lender,
    limit: offer.limit,
    aprPercent: offer.aprPercent,
    principal: 0,
    accruedInterest: 0,
    interestDue: 0,
    feesDue: 0,
    minimumDue: 0,
    pastDue: 0,
    openedDay: day,
    nextStatementDay: day + BANKING.statementCycleDays,
    paymentDueDay: 0,
    status: 'active',
    lateFee: offer.lateFee,
    lastReviewDay: day,
  };
  logBanking(state, { type: 'approval', text: `${offer.lender} opened a ${money(offer.limit)} line at ${offer.aprPercent}% APR`, amount: offer.limit });
  pushEvent(state, { type: 'money', title: `Line of credit open: ${money(offer.limit)}`, body: `${offer.lender} · ${offer.aprPercent}% APR on what you draw. No cost until you use it.` });
  return { ok: true };
}

export function drawCredit(state: GameState, amount: number): BankingResult {
  const line = banking(state).creditLine;
  if (!line || line.status === 'closed') return fail('Open a line of credit first.');
  if (line.status === 'suspended') return fail('Your line is suspended until past-due payments are made and the lender reviews it.');
  const value = cents(amount);
  if (!(value >= 100)) return fail('Draws start at $100.');
  if (line.pastDue > 0) return fail('Bring the past-due payment current before drawing again.');
  const available = availableCredit(line);
  if (value > available + 0.004) return fail(`Only ${money(available)} is available.`);
  line.principal = cents(line.principal + value);
  postTransaction(state, { amount: value, category: 'credit-draw', memo: `Draw on ${line.lender} line` });
  logBanking(state, { type: 'draw', text: `Drew from the ${line.lender} line`, amount: value });
  return { ok: true };
}

/** Applies a credit-line payment: late fees, then billed interest, then principal (a full payoff also settles interest accrued since the statement). */
function applyLinePayment(state: GameState, line: CreditLine, value: number): void {
  let left = value;
  const owed = creditLineOwed(line);
  if (left >= owed.payoff - 0.004 && owed.accrued > 0) {
    line.interestDue = cents(line.interestDue + owed.accrued);
    line.accruedInterest = 0;
  }
  const fees = Math.min(left, cents(line.feesDue));
  if (fees > 0) {
    postTransaction(state, { amount: -fees, category: 'late-fee', memo: `Late fees — ${line.lender} line` });
    line.feesDue = cents(line.feesDue - fees);
    left = cents(left - fees);
  }
  const interest = Math.min(left, cents(line.interestDue));
  if (interest > 0) {
    postTransaction(state, { amount: -interest, category: 'credit-interest', memo: `Interest — ${line.lender} line` });
    line.interestDue = cents(line.interestDue - interest);
    left = cents(left - interest);
  }
  const principal = Math.min(left, cents(line.principal));
  if (principal > 0) {
    postTransaction(state, { amount: -principal, category: 'credit-repayment', memo: `Principal repaid — ${line.lender} line` });
    line.principal = cents(line.principal - principal);
  }
  line.minimumDue = cents(Math.max(0, line.minimumDue - value));
  line.pastDue = cents(Math.max(0, line.pastDue - value));
  if (line.pastDue <= 0) line.pastDueSince = undefined;
}

export function repayCredit(state: GameState, amount: number): BankingResult {
  const line = banking(state).creditLine;
  if (!line || line.status === 'closed') return fail('No line of credit to repay.');
  const value = cents(amount);
  if (!(value > 0)) return fail('Enter an amount to repay.');
  const owed = creditLineOwed(line);
  if (owed.payoff <= 0) return fail('Nothing is owed on the line.');
  if (value > owed.payoff + 0.004) return fail(`You owe ${money(owed.payoff)} in total.`);
  if (value > state.finance.cash + 0.004) return fail('Not enough cash for that payment.');
  applyLinePayment(state, line, value);
  logBanking(state, { type: 'repayment', text: `Repaid the ${line.lender} line`, amount: value });
  return { ok: true };
}

export function closeCreditLine(state: GameState): BankingResult {
  const line = banking(state).creditLine;
  if (!line || line.status === 'closed') return fail('No open line of credit.');
  if (creditLineOwed(line).payoff > 0) return fail('Repay the full balance before closing the line.');
  line.status = 'closed';
  logBanking(state, { type: 'status', text: `Closed the ${line.lender} line of credit` });
  return { ok: true };
}

// ---------------------------------------------------------------- daily cycle

function statusFor(daysPastDue: number): DebtStatus {
  return daysPastDue >= BANKING.defaultAfterDays ? 'default' : daysPastDue >= BANKING.delinquentAfterDays ? 'delinquent' : 'past-due';
}

const STATUS_TEXT: Record<DebtStatus, string> = {
  current: 'current',
  'past-due': 'past due',
  delinquent: 'delinquent (30+ days late)',
  default: 'in default (60+ days late)',
};

function processLoan(state: GameState, loan: Loan, day: number): void {
  const b = banking(state);
  // Missed installments are collected automatically as soon as cash allows.
  if ((loan.pastDue ?? 0) > 0 && state.finance.cash >= (loan.pastDue ?? 0)) {
    const paid = payLoanPastDue(state, loan, loan.purpose);
    logBanking(state, { type: 'payment', text: `Collected past-due payment on ${loan.purpose}`, amount: paid });
    pushEvent(state, { type: 'success', title: 'Past-due loan payment collected', body: `${loan.purpose} is current again.` });
  }
  const due = installmentDue(loan);
  if (day === loan.nextPaymentDay - 3 && due.total > 0 && state.finance.cash < due.total + (loan.pastDue ?? 0)) {
    pushEvent(state, { type: 'warning', title: `Loan payment of ${money(due.total)} due in 3 days`, body: `${loan.purpose} · cash ${money(state.finance.cash)}. Missed payments add a ${money(loan.lateFee ?? 0)} late fee and lower your credit rating.` });
  }
  if (day >= loan.nextPaymentDay) {
    if (due.total <= 0) {
      loan.nextPaymentDay += DAYS_PER_MONTH;
    } else if ((loan.pastDue ?? 0) <= 0 && state.finance.cash >= due.total) {
      const paid = payInstallment(state, loan);
      b.onTimePayments++;
      logBanking(state, { type: 'payment', text: `Installment ${loan.paymentsMade}${loan.termMonths ? ` of ${loan.termMonths}` : ''} · ${loan.purpose} (interest ${money(due.interest)}, principal ${money(due.principal)})`, amount: paid });
    } else {
      const fee = loan.lateFee ?? 0;
      loan.pastDue = cents((loan.pastDue ?? 0) + due.total + fee);
      loan.pastDueInterest = cents((loan.pastDueInterest ?? 0) + due.interest);
      loan.pastDueFees = cents((loan.pastDueFees ?? 0) + fee);
      loan.pastDueSince ??= day;
      loan.lastPaymentDay = day; // this period's interest is billed in pastDue
      b.missedPaymentDays.push(day);
      logBanking(state, { type: 'late', text: `Missed installment on ${loan.purpose}: ${money(due.total)} + ${money(fee)} late fee now past due`, amount: due.total + fee });
      pushEvent(state, { type: 'warning', title: `Missed loan payment: ${money(due.total)}`, body: `${loan.purpose}. A ${money(fee)} late fee was added and your credit rating dropped. It is collected automatically when cash allows, or pay it in Finances › Banking.` });
    }
    if (due.total > 0) loan.nextPaymentDay += DAYS_PER_MONTH;
  }
  const next: DebtStatus = (loan.pastDue ?? 0) > 0 ? statusFor(day - (loan.pastDueSince ?? day)) : 'current';
  if (next !== (loan.status ?? 'current')) {
    if (next === 'delinquent' || next === 'default') {
      logBanking(state, { type: 'status', text: `${loan.purpose} is ${STATUS_TEXT[next]}` });
      pushEvent(state, { type: 'warning', title: `Loan ${STATUS_TEXT[next]}`, body: next === 'default' ? 'Lenders will not offer new credit and your line of credit is suspended until it is paid.' : 'Pay the past-due amount to stop further damage to your credit rating.' });
    }
    loan.status = next;
  }
  if (loan.balance <= 0.004 && (loan.pastDue ?? 0) <= 0) {
    state.finance.loans = state.finance.loans.filter((l) => l.id !== loan.id);
    logBanking(state, { type: 'payoff', text: `${loan.purpose} paid in full` });
    pushEvent(state, { type: 'success', title: 'Loan paid in full', body: loan.purpose });
  }
}

function processCreditLine(state: GameState, line: CreditLine, day: number): void {
  const b = banking(state);
  if (line.status === 'closed') return;
  // Interest accrues on the drawn principal only, one day at a time.
  line.accruedInterest += dailyInterest(line.principal, line.aprPercent);
  if (line.pastDue > 0 && state.finance.cash >= line.pastDue) {
    const amount = line.pastDue;
    applyLinePayment(state, line, amount);
    logBanking(state, { type: 'repayment', text: 'Collected the past-due minimum on the line', amount });
  }
  if (line.paymentDueDay > 0 && day === line.paymentDueDay - 3 && line.minimumDue > state.finance.cash) {
    pushEvent(state, { type: 'warning', title: `Credit line minimum ${money(line.minimumDue)} due in 3 days`, body: `Cash ${money(state.finance.cash)}. A missed minimum adds a ${money(line.lateFee)} late fee.` });
  }
  if (line.paymentDueDay > 0 && day >= line.paymentDueDay) {
    if (line.minimumDue <= 0.004) {
      b.onTimePayments++; // paid ahead of the due date
    } else if (state.finance.cash >= line.minimumDue) {
      const amount = line.minimumDue;
      applyLinePayment(state, line, amount);
      b.onTimePayments++;
      logBanking(state, { type: 'repayment', text: 'Autopay: credit-line minimum payment', amount });
    } else {
      line.feesDue = cents(line.feesDue + line.lateFee);
      line.pastDue = cents(line.pastDue + line.minimumDue + line.lateFee);
      line.pastDueSince ??= day;
      b.missedPaymentDays.push(day);
      logBanking(state, { type: 'late', text: `Missed the ${money(line.minimumDue)} minimum; ${money(line.lateFee)} late fee added`, amount: line.minimumDue + line.lateFee });
      pushEvent(state, { type: 'warning', title: `Missed credit line payment: ${money(line.minimumDue)}`, body: `A ${money(line.lateFee)} late fee was added and draws are paused until it is paid.` });
    }
    line.minimumDue = 0;
    line.paymentDueDay = 0;
  }
  if (day >= line.nextStatementDay) {
    const billed = cents(line.accruedInterest);
    line.interestDue = cents(line.interestDue + billed);
    line.accruedInterest = Math.max(0, line.accruedInterest - billed);
    const owed = cents(line.feesDue + line.interestDue + line.principal);
    if (owed > 0) {
      line.minimumDue = cents(Math.min(owed, line.feesDue + line.interestDue + Math.max(BANKING.minimumPaymentFloor, line.principal * BANKING.minimumPaymentPercent)));
      line.paymentDueDay = day + BANKING.paymentDueAfterStatementDays;
    }
    logBanking(state, { type: 'statement', text: owed > 0 ? `Statement: ${money(billed)} interest; minimum ${money(line.minimumDue)} due day ${line.paymentDueDay}` : 'Statement: nothing owed', amount: billed });
    line.nextStatementDay += BANKING.statementCycleDays;
  }
  if (line.status === 'active' && line.pastDue > 0 && day - (line.pastDueSince ?? day) >= BANKING.suspendAfterDays) {
    line.status = 'suspended';
    logBanking(state, { type: 'status', text: `${line.lender} suspended the line (payment ${BANKING.suspendAfterDays}+ days late)` });
    pushEvent(state, { type: 'warning', title: 'Line of credit suspended', body: 'Pay the past-due amount; the lender reviews the line monthly.' });
  }
  if (day - line.lastReviewDay >= BANKING.limitReviewDays) reviewCreditLine(state, line, day);
}

/** Monthly credit-limit review: raise for good standing, cut or suspend for distress, reinstate when cured. */
function reviewCreditLine(state: GameState, line: CreditLine, day: number): void {
  line.lastReviewDay = day;
  const product = CREDIT_LINE_PRODUCTS.find((p) => p.lender === line.lender) ?? CREDIT_LINE_PRODUCTS[0];
  const snap = businessSnapshot(state);
  const score = creditRating(state, snap).score;
  if (snap.worstStatus === 'default') {
    if (line.status === 'active') {
      line.status = 'suspended';
      logBanking(state, { type: 'status', text: `${line.lender} suspended the line: an account is in default` });
    }
    return;
  }
  if (line.status === 'suspended') {
    if (line.pastDue <= 0 && score >= product.minCreditScore) {
      line.status = 'active';
      logBanking(state, { type: 'status', text: `${line.lender} reinstated the line` });
      pushEvent(state, { type: 'success', title: 'Line of credit reinstated', body: 'Draws are available again.' });
    }
    return;
  }
  const offer = creditLineOffer(state, product, snap, score, true);
  const recentMiss = banking(state).missedPaymentDays.some((d) => day - d <= DAYS_PER_MONTH);
  if (offer.approved && !recentMiss && offer.limit >= line.limit * 1.1) {
    const from = line.limit;
    line.limit = offer.limit;
    logBanking(state, { type: 'limit', text: `${line.lender} raised the limit from ${money(from)} to ${money(offer.limit)}`, amount: offer.limit });
    pushEvent(state, { type: 'success', title: `Credit limit raised to ${money(offer.limit)}`, body: `${line.lender} reviewed your account: good standing.` });
  } else if (score < product.minCreditScore || recentMiss) {
    const cut = Math.max(Math.ceil(line.principal / 500) * 500, Math.floor((line.limit * 0.75) / 500) * 500);
    if (cut < line.limit) {
      const from = line.limit;
      line.limit = cut;
      logBanking(state, { type: 'limit', text: `${line.lender} lowered the limit from ${money(from)} to ${money(cut)}`, amount: cut });
      pushEvent(state, { type: 'warning', title: `Credit limit lowered to ${money(cut)}`, body: recentMiss ? 'A recent missed payment.' : 'Your credit rating is below the lender\'s standard.' });
    }
  }
}

/** Recomputes the credit rating and explains meaningful moves. */
export function updateCreditRating(state: GameState): void {
  const b = banking(state);
  const { score, factors } = creditRating(state);
  const before = b.creditScore;
  b.creditFactors = factors;
  if (score === before) return;
  b.creditScore = score;
  const bandBefore = ratingBand(before).label;
  const bandAfter = ratingBand(score).label;
  if (bandBefore !== bandAfter || Math.abs(score - before) >= 5) {
    const driver = [...factors].sort((a, c) => Math.abs(c.points) - Math.abs(a.points)).find((f) => f.label !== 'New business baseline');
    const text = `Credit rating ${score > before ? 'rose' : 'fell'} to ${score} (${bandAfter})${driver ? `: ${driver.label.toLowerCase()}` : ''}`;
    logBanking(state, { type: 'rating', text });
    if (bandBefore !== bandAfter) pushEvent(state, { type: score > before ? 'success' : 'warning', title: `Business credit: ${bandAfter}`, body: text });
  }
}

/** Runs once per game day from endOfDay. */
export function processBankingDay(state: GameState): void {
  const day = state.clock.day;
  for (const loan of [...state.finance.loans]) processLoan(state, loan, day);
  const line = banking(state).creditLine;
  if (line) processCreditLine(state, line, day);
  // Forget misses older than 120 days entirely (they already weigh almost nothing).
  const b = banking(state);
  b.missedPaymentDays = b.missedPaymentDays.filter((d) => day - d <= 120);
  updateCreditRating(state);
}
