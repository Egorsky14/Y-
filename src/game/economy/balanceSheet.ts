import type { GameState, LedgerEntry } from '../simulation/types';
import { resaleValue } from '../fleet/fleet';
import { openReceivablesTotal } from './ledger';
import { creditLineOwed } from './banking/banking';
import { banking, payoffQuote } from './banking/loans';
import { cents } from './banking/amortization';
import { equipmentBookValue } from '../equipment/inventory';

/**
 * A book-value balance sheet built only from what the game tracks. Used by the balance
 * scenarios to compare strategies on equity rather than cash, so a strategy that turns cash into
 * vans, or borrows cash it has not spent, is valued correctly.
 *
 * - Vehicles are valued at their resale value (what the Fleet panel offers on a sale). Leased
 *   vehicles are not owned and are excluded; lease payments are treated as operating costs.
 * - HQ upgrades are carried at cost less straight-line depreciation over FACILITY_LIFE_DAYS
 *   (they have no resale market in the game).
 * - Capital equipment (vacuum pump, recovery machine, thermal camera: price at or above the
 *   capitalization threshold) is carried at cost less straight-line depreciation over its life.
 *   Small tools are expensed when bought and carry no book value, like any consumable cost.
 * - Liabilities are everything owed today without a prepayment fee: loan principal, past-due
 *   interest and fees, interest accrued since the last installment, and the line's principal,
 *   billed and accrued interest and fees.
 */

export const FACILITY_LIFE_DAYS = 3650;

export interface BalanceSheet {
  cash: number;
  receivables: number;
  vehicles: number;
  facility: number;
  equipment: number;
  totalAssets: number;
  loans: number;
  creditLine: number;
  totalLiabilities: number;
  equity: number;
}

export function balanceSheet(state: GameState): BalanceSheet {
  const day = state.clock.day;
  const receivables = openReceivablesTotal(state);
  const vehicles = Object.values(state.vehicles)
    .filter((v) => !(v.financing && 'leaseId' in v.financing))
    .reduce((s, v) => s + resaleValue(state, v), 0);
  let facility = 0;
  for (const e of state.finance.ledger) {
    if (e.category !== 'facility') continue;
    facility += -e.amount * Math.max(0, 1 - (day - e.day) / FACILITY_LIFE_DAYS);
  }
  const loans = state.finance.loans.reduce((s, l) => {
    const q = payoffQuote(state, l);
    return s + q.total - q.fee;
  }, 0);
  const line = banking(state).creditLine;
  const creditLine = line && line.status !== 'closed' ? creditLineOwed(line).payoff : 0;
  const equipment = equipmentBookValue(state);
  const totalAssets = state.finance.cash + receivables + vehicles + facility + equipment;
  const totalLiabilities = loans + creditLine;
  return {
    cash: cents(state.finance.cash),
    receivables: cents(receivables),
    vehicles: cents(vehicles),
    facility: cents(facility),
    equipment: cents(equipment),
    totalAssets: cents(totalAssets),
    loans: cents(loans),
    creditLine: cents(creditLine),
    totalLiabilities: cents(totalLiabilities),
    equity: cents(totalAssets - totalLiabilities),
  };
}

/** Cash-flow groups for a ledger (an indirect statement would need accruals the game does not track). */
export type CashFlowGroup = 'operating' | 'investing' | 'financing' | 'owner' | 'capital';

const GROUP: Record<LedgerEntry['category'], CashFlowGroup> = {
  'service-revenue': 'operating',
  'replacement-revenue': 'operating',
  'warranty-collection': 'operating',
  payroll: 'operating',
  parts: 'operating',
  fuel: 'operating',
  'vehicle-upkeep': 'operating',
  'lease-payment': 'operating',
  training: 'operating',
  marketing: 'operating',
  tools: 'operating',
  refund: 'operating',
  // Interest and fees are operating cash flows (US GAAP); they are also reported as financing cost.
  'loan-interest': 'operating',
  'loan-fee': 'operating',
  'late-fee': 'operating',
  'credit-interest': 'operating',
  'vehicle-purchase': 'investing',
  'vehicle-sale': 'investing',
  'vehicle-upgrade': 'investing',
  facility: 'investing',
  'equipment-purchase': 'investing',
  'equipment-sale': 'investing',
  'loan-proceeds': 'financing',
  'loan-principal': 'financing',
  'credit-draw': 'financing',
  'credit-repayment': 'financing',
  // Legacy schema-1 installments mixed interest and principal; they are classified as financing.
  'loan-payment': 'financing',
  'owner-draw': 'owner',
  'opening-balance': 'capital',
};

export function cashFlows(state: GameState): Record<CashFlowGroup, number> {
  const out: Record<CashFlowGroup, number> = { operating: 0, investing: 0, financing: 0, owner: 0, capital: 0 };
  for (const e of state.finance.ledger) out[GROUP[e.category]] += e.amount;
  for (const k of Object.keys(out) as CashFlowGroup[]) out[k] = cents(out[k]);
  return out;
}

/** Interest and fees paid to lenders (the cost of financing). */
export function financingCosts(state: GameState): number {
  return cents(-state.finance.ledger.filter((e) => e.category === 'loan-interest' || e.category === 'loan-fee' || e.category === 'late-fee' || e.category === 'credit-interest').reduce((s, e) => s + e.amount, 0));
}
