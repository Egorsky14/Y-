/**
 * Business banking configuration: lenders, products, underwriting thresholds, fees, cycles and the
 * credit-rating model. Fictional game-economy numbers (see docs/design/BANKING.md for the reasoning);
 * every rule in the banking code reads from here so the balance can be tuned in one place.
 *
 * Calendar: the game's "month" is 30 game days (as for the existing vehicle loans and leases).
 */

export const DAYS_PER_MONTH = 30;
export const DAYS_PER_YEAR = 365;

export interface LoanProduct {
  id: string;
  lender: string;
  /** Short description for the offer card. */
  blurb: string;
  minAmount: number;
  maxAmount: number;
  termMonths: number;
  /** APR at a credit score of 70; moves with the score (see aprPerScorePoint). */
  baseApr: number;
  minApr: number;
  maxApr: number;
  originationFeePercent: number;
  /** Percent of remaining principal charged on an early payoff. */
  prepaymentFeePercent: number;
  lateFee: number;
  /** Underwriting requirements. */
  minDaysInBusiness: number;
  minCreditScore: number;
  /** Trailing 30-day operating revenue required (0 = none). */
  minMonthlyRevenue: number;
  /** Offer size as a multiple of trailing 30-day operating revenue (plus collateral credit). */
  revenueMultiple: number;
  /** Share of fleet resale value counted toward the offer size. */
  collateralShare: number;
  /** Startup floor: the offer size before any revenue history (still subject to the score). */
  startupAmount: number;
}

export interface CreditLineProduct {
  id: string;
  lender: string;
  blurb: string;
  minLimit: number;
  maxLimit: number;
  baseApr: number;
  minApr: number;
  maxApr: number;
  lateFee: number;
  minDaysInBusiness: number;
  minCreditScore: number;
  minMonthlyRevenue: number;
  /** Limit as a multiple of trailing 30-day operating revenue. */
  revenueMultiple: number;
  startupLimit: number;
}

export const BANKING = {
  /** APR change per credit-score point away from 70 (higher score → cheaper). */
  aprPerScorePoint: 0.12,
  /** ± APR spread from the seeded weekly market variation. */
  aprJitter: 0.4,
  /** Offers are re-quoted once a week; reopening the panel never re-rolls them. */
  quoteWindowDays: 7,
  /**
   * Total debt (term principal + credit-line limit in use) may not exceed
   * max(debtCapFloor, trailing 30-day operating revenue × debtCapRevenueMonths).
   */
  debtCapFloor: 30000,
  debtCapRevenueMonths: 4,
  /** Monthly debt payments may not exceed this share of trailing 30-day operating revenue (after the startup grace). */
  maxPaymentToRevenue: 0.35,
  startupGraceDays: 14,
  /** Delinquency ladder (days past due). */
  delinquentAfterDays: 30,
  defaultAfterDays: 60,
  /** Credit line billing. */
  statementCycleDays: DAYS_PER_MONTH,
  paymentDueAfterStatementDays: 15,
  minimumPaymentPercent: 0.03,
  minimumPaymentFloor: 50,
  /** Credit-line suspension once the oldest unpaid minimum is this many days late. */
  suspendAfterDays: 30,
  /** Credit-limit review cadence (days). */
  limitReviewDays: 30,
  history: { maxEntries: 250 },
} as const;

export const LOAN_PRODUCTS: LoanProduct[] = [
  {
    id: 'microloan',
    lender: 'Silver State Small Business Fund',
    blurb: 'Startup-friendly community microloan. Small amounts, fair rate, two-year term.',
    minAmount: 3000,
    maxAmount: 15000,
    termMonths: 24,
    baseApr: 9.5,
    minApr: 7.5,
    maxApr: 13.5,
    originationFeePercent: 2,
    prepaymentFeePercent: 0,
    lateFee: 50,
    minDaysInBusiness: 0,
    minCreditScore: 40,
    minMonthlyRevenue: 0,
    revenueMultiple: 0.5,
    collateralShare: 0,
    startupAmount: 10000,
  },
  {
    id: 'online-term',
    lender: 'Summit Business Capital',
    blurb: 'Fast online lender. Approves young companies, but money costs more and early payoff has a fee.',
    minAmount: 5000,
    maxAmount: 40000,
    termMonths: 12,
    baseApr: 21.9,
    minApr: 16.9,
    maxApr: 29.9,
    originationFeePercent: 3,
    prepaymentFeePercent: 2,
    lateFee: 75,
    minDaysInBusiness: 0,
    minCreditScore: 35,
    minMonthlyRevenue: 0,
    revenueMultiple: 1.2,
    collateralShare: 0.2,
    startupAmount: 12000,
  },
  {
    id: 'bank-term',
    lender: 'Desert Community Bank',
    blurb: 'Traditional business term loan. Best rates and largest amounts for established, profitable companies.',
    minAmount: 10000,
    maxAmount: 120000,
    termMonths: 36,
    baseApr: 8.9,
    minApr: 6.4,
    maxApr: 12.9,
    originationFeePercent: 1,
    prepaymentFeePercent: 0,
    lateFee: 100,
    minDaysInBusiness: 30,
    minCreditScore: 60,
    minMonthlyRevenue: 12000,
    revenueMultiple: 2,
    collateralShare: 0.5,
    startupAmount: 0,
  },
];

export const CREDIT_LINE_PRODUCTS: CreditLineProduct[] = [
  {
    id: 'online-line',
    lender: 'Summit Business Capital',
    blurb: 'Starter business line. Draw when cash is tight, repay when jobs pay. Interest only on what you use.',
    minLimit: 3000,
    maxLimit: 15000,
    baseApr: 22.9,
    minApr: 17.9,
    maxApr: 29.9,
    lateFee: 40,
    minDaysInBusiness: 0,
    minCreditScore: 40,
    minMonthlyRevenue: 0,
    revenueMultiple: 0.4,
    startupLimit: 6000,
  },
  {
    id: 'bank-line',
    lender: 'Desert Community Bank',
    blurb: 'Business line of credit for established companies: higher limit, lower rate, reviewed monthly.',
    minLimit: 10000,
    maxLimit: 75000,
    baseApr: 11.5,
    minApr: 8.5,
    maxApr: 15.9,
    lateFee: 60,
    minDaysInBusiness: 21,
    minCreditScore: 58,
    minMonthlyRevenue: 9000,
    revenueMultiple: 1,
    startupLimit: 0,
  },
];

/** Credit rating bands (score 0-100). */
export const RATING_BANDS: { min: number; label: string; tone: 'green' | 'teal' | 'amber' | 'red' }[] = [
  { min: 80, label: 'Excellent', tone: 'green' },
  { min: 65, label: 'Good', tone: 'teal' },
  { min: 50, label: 'Fair', tone: 'amber' },
  { min: 35, label: 'Weak', tone: 'red' },
  { min: 0, label: 'Poor', tone: 'red' },
];

/** A new company starts here: no history, no misses. */
export const STARTING_CREDIT_SCORE = 52;
