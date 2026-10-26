import type { BankingEvent, BankingState, GameState, Loan } from '../../simulation/types';
import { postTransaction } from '../ledger';
import { BANKING, DAYS_PER_MONTH, STARTING_CREDIT_SCORE } from './config';
import { accruedLoanInterest, cents, monthlyPayment, splitInstallment } from './amortization';

/**
 * Term-loan bookkeeping shared by bank loans and vehicle financing. Every cash movement goes
 * through postTransaction with a category that keeps financing out of revenue and expenses:
 * proceeds and principal are financing; interest and fees are expenses.
 */

export function emptyBanking(): BankingState {
  return { creditScore: STARTING_CREDIT_SCORE, creditFactors: [], onTimePayments: 0, onTimeMonths: 0, missedPaymentDays: [], history: [] };
}

/** Banking state, created on first use for states built before schema 2 in tests. */
export function banking(state: GameState): BankingState {
  return (state.finance.banking ??= emptyBanking());
}

/** Records an on-time payment; the credit history counts each 30-day period once. */
export function recordOnTime(state: GameState): void {
  const b = banking(state);
  b.onTimePayments++;
  const month = Math.floor((state.clock.day - 1) / DAYS_PER_MONTH);
  if (b.lastOnTimeMonth !== month) {
    b.lastOnTimeMonth = month;
    b.onTimeMonths = (b.onTimeMonths ?? 0) + 1;
  }
}

export function logBanking(state: GameState, event: Omit<BankingEvent, 'day'>): void {
  const b = banking(state);
  b.history.push({ day: state.clock.day, ...event, amount: event.amount === undefined ? undefined : cents(event.amount) });
  if (b.history.length > BANKING.history.maxEntries) b.history.splice(0, b.history.length - BANKING.history.maxEntries);
}

export interface NewLoan {
  principal: number;
  aprPercent: number;
  termMonths: number;
  purpose: string;
  lender: string;
  kind: 'bank' | 'vehicle';
  prepaymentFeePercent: number;
  lateFee: number;
}

/** Books a new term loan (the caller posts any proceeds; vehicle loans pay the seller directly). */
export function createLoan(state: GameState, l: NewLoan): Loan {
  const loan: Loan = {
    id: `loan-${state.nextId++}`,
    principal: cents(l.principal),
    balance: cents(l.principal),
    monthlyPayment: monthlyPayment(l.principal, l.aprPercent, l.termMonths),
    aprPercent: l.aprPercent,
    nextPaymentDay: state.clock.day + DAYS_PER_MONTH,
    purpose: l.purpose,
    lender: l.lender,
    kind: l.kind,
    termMonths: l.termMonths,
    originationDay: state.clock.day,
    lastPaymentDay: state.clock.day,
    paymentsMade: 0,
    pastDue: 0,
    pastDueInterest: 0,
    pastDueFees: 0,
    status: 'current',
    prepaymentFeePercent: l.prepaymentFeePercent,
    lateFee: l.lateFee,
  };
  state.finance.loans.push(loan);
  return loan;
}

/** Pays the missed installments carried on a loan: fees, then interest, then principal. */
export function payLoanPastDue(state: GameState, loan: Loan, memo: string): number {
  const owed = cents(loan.pastDue ?? 0);
  if (owed <= 0) return 0;
  const fees = cents(loan.pastDueFees ?? 0);
  const interest = cents(loan.pastDueInterest ?? 0);
  const principal = cents(Math.max(0, owed - fees - interest));
  if (fees > 0) postTransaction(state, { amount: -fees, category: 'late-fee', memo: `Late fees — ${memo}` });
  if (interest > 0) postTransaction(state, { amount: -interest, category: 'loan-interest', memo: `Past-due interest — ${memo}` });
  if (principal > 0) postTransaction(state, { amount: -principal, category: 'loan-principal', memo: `Past-due principal — ${memo}` });
  loan.balance = cents(Math.max(0, loan.balance - principal));
  loan.pastDue = 0;
  loan.pastDueFees = 0;
  loan.pastDueInterest = 0;
  loan.pastDueSince = undefined;
  loan.status = 'current';
  return owed;
}

/** Principal already billed in missed installments (still part of the balance until paid). */
export function pastDuePrincipal(loan: Loan): number {
  return cents(Math.max(0, (loan.pastDue ?? 0) - (loan.pastDueFees ?? 0) - (loan.pastDueInterest ?? 0)));
}

/**
 * The scheduled installment due now, without posting it: interest on the whole outstanding
 * balance, principal only from the part not already billed in a missed installment (so a missed
 * final installment is never billed twice).
 */
export function installmentDue(loan: Loan) {
  const s = splitInstallment(loan.balance, loan.aprPercent, loan.monthlyPayment);
  const principal = cents(Math.max(0, Math.min(s.principal, loan.balance - pastDuePrincipal(loan))));
  return { interest: s.interest, principal, total: cents(s.interest + principal) };
}

/** Posts one scheduled installment (interest expense + principal reduction). */
export function payInstallment(state: GameState, loan: Loan): number {
  const due = installmentDue(loan);
  if (due.interest > 0) postTransaction(state, { amount: -due.interest, category: 'loan-interest', memo: `Interest — ${loan.purpose}` });
  if (due.principal > 0) postTransaction(state, { amount: -due.principal, category: 'loan-principal', memo: `Principal — ${loan.purpose}` });
  loan.balance = cents(Math.max(0, loan.balance - due.principal));
  loan.paymentsMade = (loan.paymentsMade ?? 0) + 1;
  loan.lastPaymentDay = state.clock.day;
  return due.total;
}

/** What it takes to close the loan today: past due + interest since the last installment + principal + prepayment fee. */
export function payoffQuote(state: GameState, loan: Loan): { pastDue: number; interest: number; principal: number; fee: number; total: number } {
  const since = state.clock.day - (loan.lastPaymentDay ?? loan.originationDay ?? state.clock.day);
  const interest = accruedLoanInterest(loan.balance, loan.aprPercent, since);
  const fee = cents((loan.balance * (loan.prepaymentFeePercent ?? 0)) / 100);
  const pastDue = cents(loan.pastDue ?? 0);
  return { pastDue, interest, principal: loan.balance, fee, total: cents(pastDue + interest + loan.balance + fee) };
}

/** Closes a loan: posts past due, accrued interest, the prepayment fee and the principal, then removes it. */
export function settleLoan(state: GameState, loan: Loan, memo: string, waiveFee = false): number {
  const q = payoffQuote(state, loan);
  payLoanPastDue(state, loan, memo);
  if (q.interest > 0) postTransaction(state, { amount: -q.interest, category: 'loan-interest', memo: `Interest to payoff — ${memo}` });
  if (!waiveFee && q.fee > 0) postTransaction(state, { amount: -q.fee, category: 'loan-fee', memo: `Prepayment fee — ${memo}` });
  if (loan.balance > 0) postTransaction(state, { amount: -loan.balance, category: 'loan-principal', memo: `Payoff — ${memo}` });
  loan.balance = 0;
  state.finance.loans = state.finance.loans.filter((l) => l.id !== loan.id);
  return waiveFee ? cents(q.total - q.fee) : q.total;
}

/** Normalizes a loan from schema 1 (vehicle loans had only the core fields). */
export function upgradeLoan(loan: Loan, today: number): Loan {
  loan.lender ??= 'Dealer financing';
  loan.kind ??= 'vehicle';
  loan.termMonths ??= 60;
  loan.originationDay ??= Math.max(1, loan.nextPaymentDay - DAYS_PER_MONTH);
  loan.lastPaymentDay ??= Math.min(today, loan.nextPaymentDay - DAYS_PER_MONTH);
  loan.paymentsMade ??= 0;
  loan.pastDue ??= 0;
  loan.pastDueInterest ??= 0;
  loan.pastDueFees ??= 0;
  loan.status ??= 'current';
  loan.prepaymentFeePercent ??= 0;
  loan.lateFee ??= 50;
  return loan;
}
