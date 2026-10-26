import { useState } from 'react';
import { useApp, useGame } from '@/app/store';
import { Bar, Money } from '../components/common';
import { availableCredit, creditLineOwed } from '@/game/economy/banking/banking';
import { banking, installmentDue, payoffQuote } from '@/game/economy/banking/loans';
import { businessSnapshot, creditLineOffers, creditRating, loanOfferForAmount, loanOffers, ratingBand, type CreditLineOffer, type LoanOffer } from '@/game/economy/banking/underwriting';
import { amortizationSchedule } from '@/game/economy/banking/amortization';
import { BANKING } from '@/game/economy/banking/config';
import type { DebtStatus, Loan } from '@/game/simulation/types';
import type { GameAction } from '@/game/simulation/actions';

/**
 * Banking & Credit: the business's lending dashboard. Everything shown is computed from game
 * state by the banking module (offers, rating, obligations), so the UI never invents numbers.
 */

const STATUS_LABEL: Record<DebtStatus, string> = { current: 'Current', 'past-due': 'Past due', delinquent: 'Delinquent', default: 'Default' };
const STATUS_TONE: Record<DebtStatus, string> = { current: 'green', 'past-due': 'amber', delinquent: 'red', default: 'red' };

type Review = { kind: 'loan'; offer: LoanOffer } | { kind: 'line'; offer: CreditLineOffer };

function parseAmount(text: string): number {
  const v = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

export function BankingTab() {
  const dispatch = useApp((s) => s.dispatch);
  const cash = useGame((s) => s.finance.cash);
  const day = useGame((s) => s.clock.day);
  const loans = useGame((s) => s.finance.loans.slice());
  const b = useGame((s) => banking(s));
  const snap = useGame((s) => businessSnapshot(s));
  const rating = useGame((s) => creditRating(s));
  const offers = useGame((s) => loanOffers(s));
  const lineOffers = useGame((s) => creditLineOffers(s));
  const quotes = useGame((s) => Object.fromEntries(s.finance.loans.map((l) => [l.id, payoffQuote(s, l)])));
  const [review, setReview] = useState<Review | null>(null);
  const [loanAmountText, setLoanAmountText] = useState('');
  // The loan terms update live with the amount; an out-of-range amount shows the approval's terms.
  const loanAmount = Math.floor(parseAmount(loanAmountText) / 100) * 100;
  const loanAmountValid = review?.kind === 'loan' && loanAmount >= review.offer.minAmount && loanAmount <= review.offer.amount;
  const loanTerms = review?.kind === 'loan' ? loanOfferForAmount(review.offer, loanAmountValid ? loanAmount : review.offer.amount) : null;
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [drawText, setDrawText] = useState('');
  const [repayText, setRepayText] = useState('');
  const [extraText, setExtraText] = useState<Record<string, string>>({});
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  const line = b.creditLine && b.creditLine.status !== 'closed' ? b.creditLine : undefined;
  const band = ratingBand(rating.score);
  const available = availableCredit(line);
  const termDebt = loans.reduce((s, l) => s + l.balance, 0);

  const run = (action: GameAction, success: string) => {
    const r = dispatch(action);
    setMessage(r.ok ? { ok: true, text: success } : { ok: false, text: r.reason });
    return r.ok;
  };

  // Next scheduled payment across loans and the line.
  const upcoming: { label: string; day: number; amount: number }[] = loans.map((l) => ({ label: l.purpose, day: l.nextPaymentDay, amount: installmentDue(l).total + (l.pastDue ?? 0) }));
  if (line && line.paymentDueDay > 0 && line.minimumDue > 0) upcoming.push({ label: `${line.lender} line minimum`, day: line.paymentDueDay, amount: line.minimumDue });
  upcoming.sort((a, c) => a.day - c.day);
  const next = upcoming[0];

  return (
    <div className="panel-body col bank" style={{ gap: 14 }} data-testid="banking-tab">
      <div className="stat-tiles bank-tiles">
        <div className="tile"><div className="label">Cash</div><div className="value"><Money value={cash} /></div></div>
        <div className="tile"><div className="label">Loans outstanding</div><div className="value" data-testid="bank-term-debt"><Money value={termDebt} /></div></div>
        <div className="tile"><div className="label">Available credit</div><div className="value" data-testid="bank-available"><Money value={available} /></div></div>
        <div className="tile"><div className="label">Monthly obligations</div><div className="value"><Money value={snap.monthlyObligations} /></div></div>
        <div className="tile"><div className="label">Next payment</div><div className="value">{next ? <><Money value={next.amount} /><span className="tile-sub">day {next.day}{next.day - day <= 3 ? ' · soon' : ''}</span></> : <span className="muted">None</span>}</div></div>
        <div className="tile"><div className="label">Credit rating</div><div className={`value tone-${band.tone}`} data-testid="bank-score">{rating.score}<span className="tile-sub">{band.label}</span></div></div>
      </div>

      {message && (
        <div className={`bank-msg ${message.ok ? 'ok' : 'err'}`} role="status" data-testid="bank-message">
          <span>{message.text}</span>
          <button className="btn small ghost" onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      )}

      {review && (
        <div className="card bank-review" data-testid="bank-review">
          <h4>Review terms · {review.offer.lender}</h4>
          {review.kind === 'loan' && loanTerms ? (
            <>
              <div className="bank-inputs">
                <label>
                  <span>Amount to borrow</span>
                  <input inputMode="decimal" value={loanAmountText} onChange={(e) => setLoanAmountText(e.target.value)} data-testid="bank-loan-amount" />
                </label>
                <span className="muted" style={{ fontSize: 12 }}>
                  <Money value={review.offer.minAmount} /> to <Money value={review.offer.amount} /> approved. Borrow only what the plan needs: every dollar costs interest.
                </span>
              </div>
              {!loanAmountValid && <div className="bank-reasons">Enter an amount between ${review.offer.minAmount.toLocaleString()} and ${review.offer.amount.toLocaleString()}.</div>}
              <div className="bank-terms">
                <span>Loan amount</span><Money value={loanTerms.amount} />
                <span>Origination fee ({loanTerms.originationFeePercent}%)</span><Money value={-loanTerms.originationFee} />
                <span>Deposited to cash</span><b><Money value={loanTerms.netProceeds} /></b>
                <span>APR · term</span><span>{loanTerms.aprPercent}% · {loanTerms.termMonths} months</span>
                <span>Monthly payment</span><b data-testid="bank-loan-payment"><Money value={loanTerms.monthlyPayment} /></b>
                <span>Total interest</span><Money value={loanTerms.totalInterest} />
                <span>Total repayment</span><Money value={loanTerms.totalRepayment} />
                <span>Prepayment fee</span><span>{loanTerms.prepaymentFeePercent ? `${loanTerms.prepaymentFeePercent}% of principal prepaid` : 'None'}</span>
                <span>Late fee</span><Money value={loanTerms.lateFee} />
              </div>
            </>
          ) : review.kind === 'line' ? (
            <div className="bank-terms">
              <span>Credit limit</span><b><Money value={review.offer.limit} /></b>
              <span>APR on drawn balance</span><span>{review.offer.aprPercent}% (interest accrues daily)</span>
              <span>Statements</span><span>Every {BANKING.statementCycleDays} days, due {BANKING.paymentDueAfterStatementDays} days later</span>
              <span>Minimum payment</span><span>Interest + fees + {review.offer.minimumPaymentPercent}% of balance (min ${BANKING.minimumPaymentFloor})</span>
              <span>Late fee</span><Money value={review.offer.lateFee} />
            </div>
          ) : null}
          <div className="muted" style={{ fontSize: 12 }}>Payments are drafted automatically from cash on the due day. If cash runs short the payment is missed: late fees, a lower rating and, after {BANKING.delinquentAfterDays} days, delinquency.</div>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn small ghost" onClick={() => setReview(null)}>Cancel</button>
            <button
              className="btn small primary"
              data-testid="bank-confirm"
              disabled={review.kind === 'loan' && !loanAmountValid}
              onClick={() => {
                const ok = review.kind === 'loan'
                  ? run({ type: 'bank-accept-loan', offerId: review.offer.id, amount: loanTerms!.amount }, `Loan funded: ${review.offer.lender} deposited $${loanTerms!.netProceeds.toLocaleString()}.`)
                  : run({ type: 'bank-open-credit-line', offerId: review.offer.id }, `Line of credit open: $${review.offer.limit.toLocaleString()} available.`);
                if (ok) setReview(null);
              }}
            >
              {review.kind === 'loan' ? 'Accept loan' : 'Open line'}
            </button>
          </div>
        </div>
      )}

      <div className="bank-grid">
        <div className="col" style={{ gap: 12 }}>
          <div className="card col" style={{ gap: 8 }} data-testid="bank-line">
            <div className="row between"><h4>Line of credit</h4>{line && <span className={`bank-status tone-${line.status === 'active' ? (line.pastDue > 0 ? 'amber' : 'green') : 'red'}`}>{line.status === 'active' ? (line.pastDue > 0 ? 'Past due' : 'Active') : 'Suspended'}</span>}</div>
            {!line && <div className="muted" style={{ fontSize: 13 }}>No line open. A line of credit covers payroll and parts between jobs and warranty payouts; you only pay interest on what you draw.</div>}
            {line && (() => {
              const owed = creditLineOwed(line);
              return (
                <>
                  <div className="muted" style={{ fontSize: 12.5 }}>{line.lender} · {line.aprPercent}% APR · statement day {line.nextStatementDay}</div>
                  <div className="bank-meter" aria-label="Credit used">
                    <span style={{ width: `${Math.min(100, (line.principal / Math.max(1, line.limit)) * 100)}%` }} />
                  </div>
                  <div className="bank-terms">
                    <span>Limit</span><Money value={line.limit} />
                    <span>Drawn</span><Money value={line.principal} />
                    <span>Available</span><b><Money value={available} /></b>
                    <span>Interest accrued (unbilled)</span><Money value={owed.accrued} />
                    {owed.interest > 0 && <><span>Interest billed</span><Money value={owed.interest} /></>}
                    {owed.fees > 0 && <><span>Late fees</span><Money value={owed.fees} /></>}
                    {line.minimumDue > 0 && <><span>Minimum due day {line.paymentDueDay}</span><b><Money value={line.minimumDue} /></b></>}
                    {line.pastDue > 0 && <><span className="tone-red">Past due since day {line.pastDueSince}</span><b className="tone-red"><Money value={line.pastDue} /></b></>}
                    <span>Payoff today</span><Money value={owed.payoff} />
                  </div>
                  <div className="bank-inputs">
                    <label>
                      <span>Borrow</span>
                      <input inputMode="decimal" placeholder="Amount" value={drawText} onChange={(e) => setDrawText(e.target.value)} data-testid="bank-draw-input" />
                    </label>
                    <button className="btn small primary" disabled={line.status !== 'active' || parseAmount(drawText) <= 0} onClick={() => run({ type: 'bank-credit-draw', amount: parseAmount(drawText) }, `Drew $${parseAmount(drawText).toLocaleString()} from the line.`) && setDrawText('')} data-testid="bank-draw">Borrow</button>
                    <label>
                      <span>Repay</span>
                      <input inputMode="decimal" placeholder="Amount" value={repayText} onChange={(e) => setRepayText(e.target.value)} data-testid="bank-repay-input" />
                    </label>
                    <button className="btn small" disabled={parseAmount(repayText) <= 0} onClick={() => run({ type: 'bank-credit-repay', amount: parseAmount(repayText) }, `Repaid $${parseAmount(repayText).toLocaleString()} to the line.`) && setRepayText('')} data-testid="bank-repay">Repay</button>
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <button className="chip" onClick={() => setRepayText(String(owed.payoff))} disabled={owed.payoff <= 0}>Repay all</button>
                    <button className="chip" onClick={() => setDrawText(String(Math.floor(available)))} disabled={available <= 0}>Borrow max</button>
                    <button className="btn small ghost" style={{ marginLeft: 'auto' }} disabled={owed.payoff > 0} onClick={() => run({ type: 'bank-close-credit-line' }, 'Line of credit closed.')}>Close line</button>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="card col" style={{ gap: 8 }} data-testid="bank-loans">
            <h4>Active loans</h4>
            {loans.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No loans. Vehicle financing from the Fleet market also appears here.</div>}
            {loans.map((l) => <LoanCard key={l.id} loan={l} quote={quotes[l.id]} extra={extraText[l.id] ?? ''} setExtra={(v) => setExtraText((m) => ({ ...m, [l.id]: v }))} showSchedule={scheduleFor === l.id} toggleSchedule={() => setScheduleFor(scheduleFor === l.id ? null : l.id)} run={run} />)}
          </div>
        </div>

        <div className="col" style={{ gap: 12 }}>
          <div className="card col" style={{ gap: 8 }} data-testid="bank-rating">
            <div className="row between"><h4>Business credit rating</h4><span className={`bank-status tone-${band.tone}`}>{band.label}</span></div>
            <Bar value={rating.score} tone={band.tone === 'teal' ? undefined : band.tone} />
            <div className="muted" style={{ fontSize: 12 }}>An internal lender score (0–100) built from your history in this game. It sets which offers you qualify for and the rate you pay.</div>
            {rating.factors.map((f) => (
              <div key={f.label} className="row between" style={{ fontSize: 12.5 }}><span className="muted">{f.label}</span><b className={f.points > 0 ? 'tone-green' : f.points < 0 ? 'tone-red' : 'muted'}>{f.points > 0 ? '+' : ''}{f.points}</b></div>
            ))}
            <div className="row between muted" style={{ fontSize: 12 }}><span>On-time payments ({b.onTimeMonths ?? 0} month{(b.onTimeMonths ?? 0) === 1 ? '' : 's'} of history)</span><b>{b.onTimePayments}</b></div>
          </div>

          <div className="card col" style={{ gap: 8 }} data-testid="bank-offers">
            <h4>Financing offers</h4>
            <div className="muted" style={{ fontSize: 12 }}>Quotes hold through day {offers[0]?.quoteExpiresDay}. They update weekly as your revenue and rating change.</div>
            {offers.map((o) => (
              <div key={o.id} className={`bank-offer ${o.approved ? '' : 'declined'}`} data-testid={`offer-${o.productId}`}>
                <div className="row between"><b>{o.lender}</b><span className="muted" style={{ fontSize: 12 }}>Term loan</span></div>
                <div className="muted" style={{ fontSize: 12 }}>{o.blurb}</div>
                {o.approved ? (
                  <div className="row between" style={{ alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ fontSize: 12.5 }}>Up to <b><Money value={o.amount} /></b> · {o.aprPercent}% APR · {o.termMonths} mo · <Money value={o.monthlyPayment} />/mo</div>
                    <button className="btn small primary" onClick={() => { setReview({ kind: 'loan', offer: o }); setLoanAmountText(String(o.amount)); }} data-testid={`apply-${o.productId}`}>Apply</button>
                  </div>
                ) : (
                  <ul className="bank-reasons">{o.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                )}
              </div>
            ))}
            {lineOffers.map((o) => (
              <div key={o.id} className={`bank-offer ${o.approved ? '' : 'declined'}`} data-testid={`offer-${o.productId}`}>
                <div className="row between"><b>{o.lender}</b><span className="muted" style={{ fontSize: 12 }}>Line of credit</span></div>
                <div className="muted" style={{ fontSize: 12 }}>{o.blurb}</div>
                {o.approved ? (
                  <div className="row between" style={{ alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ fontSize: 12.5 }}>Limit <b><Money value={o.limit} /></b> · {o.aprPercent}% APR on drawn balance</div>
                    <button className="btn small primary" onClick={() => setReview({ kind: 'line', offer: o })} data-testid={`apply-${o.productId}`}>Apply</button>
                  </div>
                ) : (
                  <ul className="bank-reasons">{o.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                )}
              </div>
            ))}
          </div>

          <div className="card col" style={{ gap: 4 }} data-testid="bank-history">
            <h4>Banking history</h4>
            {b.history.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Applications, payments and statements appear here.</div>}
            {b.history.slice(-40).reverse().map((h, i) => (
              <div key={`${h.day}-${i}`} className="row between bank-hist" style={{ gap: 8 }}>
                <span><span className="muted">Day {h.day} · </span>{h.text}</span>
                {h.amount !== undefined && <Money value={h.amount} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoanCard({ loan, quote, extra, setExtra, showSchedule, toggleSchedule, run }: {
  loan: Loan;
  quote: { pastDue: number; interest: number; principal: number; fee: number; total: number };
  extra: string;
  setExtra: (v: string) => void;
  showSchedule: boolean;
  toggleSchedule: () => void;
  run: (action: GameAction, success: string) => boolean;
}) {
  const status = loan.status ?? 'current';
  const due = installmentDue(loan);
  const paidShare = loan.principal > 0 ? 1 - loan.balance / loan.principal : 1;
  const schedule = showSchedule ? amortizationSchedule(loan.balance, loan.aprPercent, loan.monthlyPayment, 12) : [];
  const amount = parseAmount(extra);
  return (
    <div className="bank-loan" data-testid={`loan-${loan.id}`}>
      <div className="row between"><b>{loan.purpose}</b><span className={`bank-status tone-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span></div>
      <div className="muted" style={{ fontSize: 12 }}>{loan.lender ?? 'Lender'} · {loan.aprPercent}% APR · {loan.paymentsMade ?? 0}/{loan.termMonths ?? '—'} payments</div>
      <Bar value={paidShare * 100} tone="green" />
      <div className="bank-terms">
        <span>Balance</span><b><Money value={loan.balance} /></b>
        <span>Next installment · day {loan.nextPaymentDay}</span><span><Money value={due.total} /> <span className="muted">(<Money value={due.interest} /> interest)</span></span>
        {(loan.pastDue ?? 0) > 0 && <><span className="tone-red">Past due since day {loan.pastDueSince}</span><b className="tone-red"><Money value={loan.pastDue ?? 0} /></b></>}
        <span>Payoff today</span><span><Money value={quote.total} />{quote.fee > 0 && <span className="muted"> (incl. <Money value={quote.fee} /> fee)</span>}</span>
      </div>
      <div className="bank-inputs">
        <label>
          <span>Extra principal</span>
          <input inputMode="decimal" placeholder="Amount" value={extra} onChange={(e) => setExtra(e.target.value)} data-testid={`loan-extra-input-${loan.id}`} />
        </label>
        <button className="btn small" disabled={amount <= 0} onClick={() => run({ type: 'bank-loan-extra-payment', loanId: loan.id, amount }, `Paid $${amount.toLocaleString()} extra toward ${loan.purpose}.`) && setExtra('')} data-testid={`loan-extra-${loan.id}`}>Pay extra</button>
        <button className="btn small primary" onClick={() => run({ type: 'bank-loan-payoff', loanId: loan.id }, `${loan.purpose} paid off.`)} data-testid={`loan-payoff-${loan.id}`}>Pay off</button>
        <button className="btn small ghost" onClick={toggleSchedule}>{showSchedule ? 'Hide schedule' : 'Schedule'}</button>
      </div>
      {showSchedule && (
        <table className="ledger bank-schedule">
          <thead><tr><th>#</th><th>Day</th><th>Payment</th><th>Interest</th><th>Principal</th><th>Balance</th></tr></thead>
          <tbody>
            {schedule.map((r) => (
              <tr key={r.n}>
                <td>{r.n}</td>
                <td>{loan.nextPaymentDay + (r.n - 1) * 30}</td>
                <td><Money value={r.payment} /></td>
                <td><Money value={r.interest} /></td>
                <td><Money value={r.principal} /></td>
                <td><Money value={r.balance} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
