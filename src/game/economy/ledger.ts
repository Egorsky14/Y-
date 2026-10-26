import type { GameState, LedgerEntry, Receivable } from '../simulation/types';

/**
 * Financing flows: borrowed money in, principal repaid out. They change cash (and the ledger)
 * but are not revenue or expense, so they never inflate revenue milestones, the P&L or the
 * credit rating's profitability. Interest and fees are ordinary expenses.
 */
export const FINANCING_CATEGORIES: ReadonlySet<LedgerEntry['category']> = new Set(['loan-proceeds', 'loan-principal', 'credit-draw', 'credit-repayment']);

/**
 * All money movement goes through postTransaction so cash always equals the sum of the
 * ledger. Positive amounts increase cash, negative amounts decrease it.
 */
export function postTransaction(state: GameState, entry: Omit<LedgerEntry, 'id' | 'day' | 'minute'>): LedgerEntry {
  const amount = Math.round(entry.amount * 100) / 100;
  const full: LedgerEntry = {
    id: `tx-${state.nextId++}`,
    day: state.clock.day,
    minute: Math.floor(state.clock.minute),
    amount,
    category: entry.category,
    memo: entry.memo,
    jobId: entry.jobId,
  };
  state.finance.ledger.push(full);
  state.finance.cash = Math.round((state.finance.cash + amount) * 100) / 100;
  if (FINANCING_CATEGORIES.has(full.category)) return full;
  if (amount >= 0) {
    state.finance.today.revenue += amount;
    state.stats.totalRevenue += amount;
  } else {
    state.finance.today.expenses += -amount;
    state.stats.totalExpenses += -amount;
  }
  return full;
}

export function openReceivable(state: GameState, r: Omit<Receivable, 'id' | 'status'>): Receivable {
  const full: Receivable = { ...r, id: `ar-${state.nextId++}`, status: 'open', amount: Math.round(r.amount * 100) / 100 };
  state.finance.receivables.push(full);
  return full;
}

export function openReceivablesTotal(state: GameState): number {
  return state.finance.receivables.filter((r) => r.status === 'open').reduce((s, r) => s + r.amount, 0);
}

/** Cash must equal the sum of all ledger entries (including the opening balance). */
export function reconcileCash(state: GameState): { ok: boolean; expected: number; actual: number } {
  const expected = Math.round(state.finance.ledger.reduce((s, e) => s + e.amount, 0) * 100) / 100;
  return { ok: Math.abs(expected - state.finance.cash) < 0.005, expected, actual: state.finance.cash };
}

/** Outstanding borrowing: term-loan principal plus the drawn credit-line principal. */
export function totalLoanBalance(state: GameState): number {
  const line = state.finance.banking?.creditLine;
  return state.finance.loans.reduce((s, l) => s + l.balance, 0) + (line && line.status !== 'closed' ? line.principal : 0);
}

export function formatMoney(value: number, compact = false): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (compact && abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (compact && abs >= 10_000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
