import { DAYS_PER_MONTH, DAYS_PER_YEAR } from './config';

/** Round to cents. */
export const cents = (v: number) => Math.round(v * 100) / 100;

/**
 * Level monthly payment for a fixed-rate loan: P·r / (1 − (1 + r)^−n), r = APR / 12.
 * A 0% loan repays P / n each month.
 */
export function monthlyPayment(principal: number, aprPercent: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = aprPercent / 100 / 12;
  if (r === 0) return cents(principal / termMonths);
  return cents((principal * r) / (1 - Math.pow(1 + r, -termMonths)));
}

/** Interest for one monthly installment on the outstanding principal. */
export function monthlyInterest(balance: number, aprPercent: number): number {
  return cents(balance * (aprPercent / 100 / 12));
}

/**
 * How one installment splits: interest first, the rest reduces principal. The final installment
 * pays exactly what is left, so the schedule ends at zero without a stray cent.
 */
export function splitInstallment(balance: number, aprPercent: number, payment: number): { interest: number; principal: number; total: number } {
  const interest = monthlyInterest(balance, aprPercent);
  const principal = cents(Math.min(balance, Math.max(0, payment - interest)));
  return { interest, principal, total: cents(interest + principal) };
}

export interface ScheduleRow {
  n: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

/** Remaining amortization schedule from the current balance (at most `maxRows` rows). */
export function amortizationSchedule(balance: number, aprPercent: number, payment: number, maxRows = 600): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let b = cents(balance);
  for (let n = 1; b > 0.004 && n <= maxRows; n++) {
    const s = splitInstallment(b, aprPercent, payment);
    if (s.principal <= 0) break; // payment below interest: never amortizes (guarded at origination)
    b = cents(b - s.principal);
    rows.push({ n, payment: s.total, interest: s.interest, principal: s.principal, balance: b });
  }
  return rows;
}

/** Total cost of a new loan: payments over the term plus the origination fee. */
export function loanTotals(principal: number, aprPercent: number, termMonths: number, originationFeePercent: number): { payment: number; totalPayments: number; totalInterest: number; fee: number } {
  const payment = monthlyPayment(principal, aprPercent, termMonths);
  const schedule = amortizationSchedule(principal, aprPercent, payment);
  const totalPayments = cents(schedule.reduce((s, r) => s + r.payment, 0));
  const fee = cents((principal * originationFeePercent) / 100);
  return { payment, totalPayments, totalInterest: cents(totalPayments - principal), fee };
}

/** Interest accrued on a term loan between installments, prorated by days (30-day month). */
export function accruedLoanInterest(balance: number, aprPercent: number, days: number): number {
  return cents(balance * (aprPercent / 100 / 12) * (Math.max(0, days) / DAYS_PER_MONTH));
}

/** One day of credit-line interest on the drawn principal (unrounded; billed rounded to cents). */
export function dailyInterest(principal: number, aprPercent: number): number {
  return (principal * aprPercent) / 100 / DAYS_PER_YEAR;
}
