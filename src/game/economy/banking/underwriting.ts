import type { CreditRatingFactor, GameState, LedgerEntry } from '../../simulation/types';
import { resaleValue } from '../../fleet/fleet';
import { BANKING, CREDIT_LINE_PRODUCTS, DAYS_PER_MONTH, LOAN_PRODUCTS, RATING_BANDS, type CreditLineProduct, type LoanProduct } from './config';
import { cents, loanTotals, monthlyPayment } from './amortization';
import { banking } from './loans';

/**
 * Underwriting: a snapshot of the business as a lender sees it, the internal credit rating, and
 * the loan and credit-line offers that follow from both. Everything here is a pure function of
 * the game state (plus a hash of the world seed for weekly rate variation), so offers are
 * reproducible: reopening the panel or reloading never re-rolls them.
 */

const OPERATING_REVENUE = new Set<LedgerEntry['category']>(['service-revenue', 'replacement-revenue', 'warranty-collection']);
const OPERATING_COSTS = new Set<LedgerEntry['category']>(['payroll', 'parts', 'fuel', 'vehicle-upkeep', 'vehicle-upgrade', 'lease-payment', 'training', 'marketing', 'refund', 'owner-draw', 'loan-interest', 'loan-fee', 'late-fee', 'credit-interest', 'loan-payment']);

const DEBT_COSTS = new Set<LedgerEntry['category']>(['loan-interest', 'loan-fee', 'late-fee', 'credit-interest']);

export interface BusinessSnapshot {
  day: number;
  daysInBusiness: number;
  cash: number;
  /** Operating revenue and costs (incl. interest) over the last 30 days. */
  revenue30: number;
  costs30: number;
  profit30: number;
  /** Interest and lender fees within costs30 (so coverage can be measured before debt costs). */
  interest30: number;
  termDebt: number;
  lineBalance: number;
  lineLimit: number;
  totalDebt: number;
  /** Scheduled monthly debt service: loan installments, the line's projected minimum, leases. */
  monthlyObligations: number;
  collateral: number;
  utilization: number;
  pastDue: boolean;
  worstStatus: 'current' | 'past-due' | 'delinquent' | 'default';
}

export function businessSnapshot(state: GameState): BusinessSnapshot {
  const day = state.clock.day;
  const from = day - DAYS_PER_MONTH;
  let revenue30 = 0;
  let costs30 = 0;
  let interest30 = 0;
  for (let i = state.finance.ledger.length - 1; i >= 0; i--) {
    const e = state.finance.ledger[i];
    if (e.day <= from) break;
    if (OPERATING_REVENUE.has(e.category)) revenue30 += e.amount;
    else if (OPERATING_COSTS.has(e.category)) costs30 -= e.amount;
    if (DEBT_COSTS.has(e.category)) interest30 -= e.amount;
  }
  const line = banking(state).creditLine;
  const lineBalance = line && line.status !== 'closed' ? line.principal : 0;
  const lineLimit = line && line.status !== 'closed' ? line.limit : 0;
  const termDebt = state.finance.loans.reduce((s, l) => s + l.balance, 0);
  const lineMinimum = lineBalance > 0 ? Math.max(BANKING.minimumPaymentFloor, lineBalance * BANKING.minimumPaymentPercent) + (lineBalance * (line?.aprPercent ?? 0)) / 100 / 12 : 0;
  const monthlyObligations = state.finance.loans.reduce((s, l) => s + l.monthlyPayment, 0) + lineMinimum + state.finance.leases.reduce((s, l) => s + l.monthlyPayment, 0);
  const collateral = Object.values(state.vehicles).reduce((s, v) => s + resaleValue(state, v), 0);
  const statuses = [...state.finance.loans.map((l) => l.status ?? 'current'), line && line.pastDue > 0 ? (day - (line.pastDueSince ?? day) >= BANKING.defaultAfterDays ? 'default' : day - (line.pastDueSince ?? day) >= BANKING.delinquentAfterDays ? 'delinquent' : 'past-due') : 'current'];
  const order = ['current', 'past-due', 'delinquent', 'default'] as const;
  const worstStatus = statuses.reduce<(typeof order)[number]>((w, s) => (order.indexOf(s as never) > order.indexOf(w) ? (s as (typeof order)[number]) : w), 'current');
  return {
    day,
    daysInBusiness: day,
    cash: state.finance.cash,
    revenue30: cents(revenue30),
    costs30: cents(costs30),
    profit30: cents(revenue30 - costs30),
    interest30: cents(interest30),
    termDebt: cents(termDebt),
    lineBalance: cents(lineBalance),
    lineLimit,
    totalDebt: cents(termDebt + lineBalance),
    monthlyObligations: cents(monthlyObligations),
    collateral,
    utilization: lineLimit > 0 ? lineBalance / lineLimit : 0,
    pastDue: worstStatus !== 'current',
    worstStatus,
  };
}

// ---------------------------------------------------------------- credit rating

/**
 * Internal business credit score, 0-100. A game mechanic built from named factors so the player
 * can see why it moves. Missed payments weigh heavily when recent and fade over ~90 days, so one
 * early mistake is not permanent.
 */
export function creditRating(state: GameState, snap = businessSnapshot(state)): { score: number; factors: CreditRatingFactor[] } {
  const b = banking(state);
  const factors: CreditRatingFactor[] = [{ label: 'New business baseline', points: 52 }];
  const history = Math.min(12, Math.floor(snap.daysInBusiness / 7) * 1.5);
  if (history > 0) factors.push({ label: `Operating history (${snap.daysInBusiness} days)`, points: history });
  // Payment history grows by months of on-time payments, so opening more accounts does not speed it up.
  const months = b.onTimeMonths ?? 0;
  if (months > 0) factors.push({ label: `On-time payment history (${months} month${months === 1 ? '' : 's'})`, points: Math.min(15, months * 3) });
  const missed = b.missedPaymentDays.reduce((s, d) => {
    const age = snap.day - d;
    return s + (age <= 30 ? -12 : age <= 60 ? -7 : age <= 90 ? -3 : -1);
  }, 0);
  if (missed < 0) factors.push({ label: `Missed payments (${b.missedPaymentDays.length})`, points: Math.max(-36, missed) });
  if (snap.worstStatus !== 'current') factors.push({ label: snap.worstStatus === 'default' ? 'Account in default' : snap.worstStatus === 'delinquent' ? 'Account delinquent (30+ days)' : 'Payment past due', points: snap.worstStatus === 'default' ? -30 : snap.worstStatus === 'delinquent' ? -18 : -8 });
  if (snap.lineLimit > 0) {
    const u = snap.utilization;
    const pts = u > 0.9 ? -8 : u > 0.7 ? -5 : u > 0.5 ? -2 : 0;
    if (pts !== 0) factors.push({ label: `Credit line use ${Math.round(u * 100)}%`, points: pts });
  }
  // Leverage counts once there is a revenue history to measure it against (as for payment-to-revenue).
  if (snap.totalDebt > 0 && snap.daysInBusiness > BANKING.startupGraceDays) {
    const months = snap.totalDebt / Math.max(1, snap.revenue30);
    const pts = months > 4 ? -10 : months > 2.5 ? -6 : months > 1.5 ? -2 : 0;
    if (pts !== 0) factors.push({ label: `Debt vs. monthly revenue (${months.toFixed(1)}×)`, points: pts });
  }
  if (snap.daysInBusiness >= 10 && snap.revenue30 > 0) {
    const margin = snap.profit30 / snap.revenue30;
    const pts = Math.max(-10, Math.min(10, Math.round(margin * 40)));
    if (pts !== 0) factors.push({ label: `30-day profit margin ${Math.round(margin * 100)}%`, points: pts });
  }
  if (snap.cash < 0) factors.push({ label: 'Negative cash balance', points: -8 });
  else if (snap.daysInBusiness >= 10 && snap.costs30 > 0) {
    // Reserves count only cash the company owns: cash minus what it owes. Borrowed money sitting
    // in the account is not a reserve, so holding it cannot raise the rating.
    const net = snap.cash - snap.totalDebt;
    const cover = net / snap.costs30;
    if (cover >= 1) factors.push({ label: `Cash reserves net of debt (${cover.toFixed(1)} months of costs)`, points: 6 });
    else if (cover >= 0.5) factors.push({ label: `Cash reserves net of debt (${cover.toFixed(1)} months of costs)`, points: 3 });
    if (snap.cash / snap.costs30 < 0.15) factors.push({ label: 'Thin cash buffer (under 5 days of costs)', points: -3 });
  }
  // Debt service coverage: operating profit before interest vs. monthly debt payments. A penalty
  // only, like utilization and leverage: profitability is rewarded by the margin factor, and
  // taking on debt must never raise the rating by itself (only months of on-time payments do).
  if (snap.monthlyObligations > 0 && snap.daysInBusiness > BANKING.startupGraceDays) {
    const dscr = (snap.profit30 + snap.interest30) / snap.monthlyObligations;
    const pts = dscr < 1 ? -6 : dscr < 1.25 ? -3 : 0;
    if (pts !== 0) factors.push({ label: `Debt service coverage ${dscr.toFixed(1)}×`, points: pts });
  }
  const score = Math.round(Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0))));
  return { score, factors: factors.map((f) => ({ ...f, points: Math.round(f.points * 10) / 10 })) };
}

export function ratingBand(score: number) {
  return RATING_BANDS.find((b) => score >= b.min) ?? RATING_BANDS[RATING_BANDS.length - 1];
}

// ---------------------------------------------------------------- offers

/** Deterministic 0..1 from the world seed, a product and the weekly quote window. */
function seededUnit(seed: number, key: string, window: number): number {
  let h = 2166136261 ^ seed;
  for (const ch of `${key}:${window}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function quoteApr(state: GameState, base: number, min: number, max: number, key: string, score: number): number {
  const window = Math.floor((state.clock.day - 1) / BANKING.quoteWindowDays);
  const jitter = (seededUnit(state.seed, key, window) * 2 - 1) * BANKING.aprJitter;
  return Math.round(Math.max(min, Math.min(max, base + (70 - score) * BANKING.aprPerScorePoint + jitter)) * 10) / 10;
}

/** Largest principal whose payment fits `payment` at this rate and term (inverse annuity). */
function principalForPayment(payment: number, aprPercent: number, termMonths: number): number {
  if (payment <= 0) return 0;
  const r = aprPercent / 100 / 12;
  return r === 0 ? payment * termMonths : (payment * (1 - Math.pow(1 + r, -termMonths))) / r;
}

export interface LoanOffer {
  id: string;
  productId: string;
  lender: string;
  blurb: string;
  approved: boolean;
  /** Plain-language reasons when the offer is declined or limited. */
  reasons: string[];
  /** The most this lender approves; the player may borrow any amount from minAmount up to it. */
  amount: number;
  minAmount: number;
  originationFeePercent: number;
  aprPercent: number;
  termMonths: number;
  monthlyPayment: number;
  totalRepayment: number;
  totalInterest: number;
  originationFee: number;
  netProceeds: number;
  prepaymentFeePercent: number;
  lateFee: number;
  quoteExpiresDay: number;
}

export interface CreditLineOffer {
  id: string;
  productId: string;
  lender: string;
  blurb: string;
  approved: boolean;
  reasons: string[];
  limit: number;
  aprPercent: number;
  lateFee: number;
  minimumPaymentPercent: number;
  quoteExpiresDay: number;
}

function quoteWindowEnd(day: number): number {
  return (Math.floor((day - 1) / BANKING.quoteWindowDays) + 1) * BANKING.quoteWindowDays;
}

function commonDeclines(p: { minDaysInBusiness: number; minCreditScore: number; minMonthlyRevenue: number }, snap: BusinessSnapshot, score: number): string[] {
  const reasons: string[] = [];
  if (snap.worstStatus === 'default') reasons.push('An account is in default. Lenders will not extend new credit until it is brought current.');
  else if (snap.pastDue) reasons.push('A payment is past due. Bring your accounts current first.');
  if (snap.daysInBusiness < p.minDaysInBusiness) reasons.push(`Needs ${p.minDaysInBusiness} days of operating history (you have ${snap.daysInBusiness}).`);
  if (score < p.minCreditScore) reasons.push(`Credit rating ${score} is below this lender's minimum of ${p.minCreditScore}.`);
  if (snap.revenue30 < p.minMonthlyRevenue) reasons.push(`Needs $${p.minMonthlyRevenue.toLocaleString()} of revenue in the last 30 days (you have $${Math.round(snap.revenue30).toLocaleString()}).`);
  return reasons;
}

/** Room left under the total-debt cap. */
function debtHeadroom(snap: BusinessSnapshot): number {
  const cap = Math.max(BANKING.debtCapFloor, snap.revenue30 * BANKING.debtCapRevenueMonths);
  return Math.max(0, cap - snap.termDebt - snap.lineLimit);
}

/** Room left under the payment-to-revenue limit (monthly), after the startup grace period. */
function paymentHeadroom(snap: BusinessSnapshot): number {
  if (snap.daysInBusiness <= BANKING.startupGraceDays) return Infinity;
  return Math.max(0, snap.revenue30 * BANKING.maxPaymentToRevenue - snap.monthlyObligations);
}

function scoreScale(score: number): number {
  return Math.max(0.25, Math.min(1.25, (score - 30) / 40));
}

export function loanOffer(state: GameState, p: LoanProduct, snap = businessSnapshot(state), score = creditRating(state, snap).score): LoanOffer {
  const aprPercent = quoteApr(state, p.baseApr, p.minApr, p.maxApr, p.id, score);
  const reasons = commonDeclines(p, snap, score);
  if (state.finance.loans.some((l) => l.lender === p.lender && l.kind === 'bank')) reasons.push(`You already have an open loan with ${p.lender}.`);
  const capacity = (p.startupAmount + snap.revenue30 * p.revenueMultiple + snap.collateral * p.collateralShare) * scoreScale(score);
  const byPayment = principalForPayment(paymentHeadroom(snap), aprPercent, p.termMonths);
  const amount = Math.floor(Math.min(p.maxAmount, capacity, debtHeadroom(snap), byPayment) / 500) * 500;
  if (reasons.length === 0 && amount < p.minAmount) {
    if (debtHeadroom(snap) < p.minAmount) reasons.push('Total debt is already at the limit lenders accept for your revenue.');
    else if (byPayment < p.minAmount) reasons.push('Existing monthly debt payments already use most of your revenue.');
    else reasons.push('Not enough revenue or collateral yet for this lender\'s minimum loan.');
  }
  const approved = reasons.length === 0;
  const principal = approved ? amount : p.minAmount;
  const t = loanTotals(principal, aprPercent, p.termMonths, p.originationFeePercent);
  return {
    id: `${p.id}@${quoteWindowEnd(snap.day)}`,
    productId: p.id,
    lender: p.lender,
    blurb: p.blurb,
    approved,
    reasons,
    amount: principal,
    minAmount: p.minAmount,
    originationFeePercent: p.originationFeePercent,
    aprPercent,
    termMonths: p.termMonths,
    monthlyPayment: t.payment,
    totalRepayment: t.totalPayments,
    totalInterest: t.totalInterest,
    originationFee: t.fee,
    netProceeds: cents(principal - t.fee),
    prepaymentFeePercent: p.prepaymentFeePercent,
    lateFee: p.lateFee,
    quoteExpiresDay: quoteWindowEnd(snap.day),
  };
}

export function creditLineOffer(state: GameState, p: CreditLineProduct, snap = businessSnapshot(state), score = creditRating(state, snap).score, ignoreOwnLine = false): CreditLineOffer {
  const aprPercent = quoteApr(state, p.baseApr, p.minApr, p.maxApr, p.id, score);
  const reasons = commonDeclines(p, snap, score);
  const line = banking(state).creditLine;
  if (!ignoreOwnLine && line && line.status !== 'closed') reasons.push('You already have a business line of credit. Close it (balance $0) to switch lenders.');
  const headroom = debtHeadroom(ignoreOwnLine ? { ...snap, lineLimit: 0 } : snap);
  const capacity = (p.startupLimit + snap.revenue30 * p.revenueMultiple) * scoreScale(score);
  const limit = Math.floor(Math.min(p.maxLimit, capacity, headroom) / 500) * 500;
  if (reasons.length === 0 && limit < p.minLimit) reasons.push(headroom < p.minLimit ? 'Total debt is already at the limit lenders accept for your revenue.' : 'Not enough revenue history yet for this credit line.');
  return {
    id: `${p.id}@${quoteWindowEnd(snap.day)}`,
    productId: p.id,
    lender: p.lender,
    blurb: p.blurb,
    approved: reasons.length === 0,
    reasons,
    limit: reasons.length === 0 ? limit : p.minLimit,
    aprPercent,
    lateFee: p.lateFee,
    minimumPaymentPercent: BANKING.minimumPaymentPercent * 100,
    quoteExpiresDay: quoteWindowEnd(snap.day),
  };
}

export function loanOffers(state: GameState): LoanOffer[] {
  const snap = businessSnapshot(state);
  const score = creditRating(state, snap).score;
  return LOAN_PRODUCTS.map((p) => loanOffer(state, p, snap, score));
}

export function creditLineOffers(state: GameState): CreditLineOffer[] {
  const snap = businessSnapshot(state);
  const score = creditRating(state, snap).score;
  return CREDIT_LINE_PRODUCTS.map((p) => creditLineOffer(state, p, snap, score));
}

/** The same quote for a smaller amount (the player chooses how much of the approval to borrow). */
export function loanOfferForAmount(offer: LoanOffer, amount: number): LoanOffer {
  const t = loanTotals(amount, offer.aprPercent, offer.termMonths, offer.originationFeePercent);
  return { ...offer, amount, monthlyPayment: t.payment, totalRepayment: t.totalPayments, totalInterest: t.totalInterest, originationFee: t.fee, netProceeds: cents(amount - t.fee) };
}

/** Monthly payment for a principal at a product's quoted terms (used by the UI's what-if). */
export function quotePayment(principal: number, aprPercent: number, termMonths: number): number {
  return monthlyPayment(principal, aprPercent, termMonths);
}
