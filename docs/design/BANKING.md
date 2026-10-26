# Business Banking & Financing

The player's HVAC company can borrow: term loans from three fictional lenders and a revolving
business line of credit. Lenders underwrite from the company's real in-game numbers. Payments,
interest and late fees run on the game calendar. Missed payments have consequences that the
player can see and recover from. Everything lives inside the simulation: there are no real banks,
APIs, payment processors or credit bureaus, and all names and rates are fictional.

## Where the code lives

| File | Role |
|---|---|
| `src/game/economy/banking/config.ts` | Every tunable number: products, lenders, thresholds, fees, cycles, rating bands |
| `src/game/economy/banking/amortization.ts` | Pure math: payment formula, installment split, schedule, daily and prorated interest |
| `src/game/economy/banking/loans.ts` | Loan bookkeeping shared with vehicle financing: create, installment, past due, payoff quote, settle, schema-1 upgrade |
| `src/game/economy/banking/underwriting.ts` | Business snapshot (30-day operating revenue and costs, debt, obligations, collateral), credit rating, offers |
| `src/game/economy/banking/banking.ts` | Player actions and the daily cycle (`processBankingDay`, called once per day from `endOfDay`) |
| `src/ui/panels/BankingTab.tsx` | Finances › Banking & Credit |
| `src/tests/banking.test.ts` | 24 unit tests |
| `src/tests/bankingScenarios.test.ts` | Balance scenarios (opt-in, see below) |
| `e2e/banking.spec.ts` | Browser test of the whole borrow → spend → repay → save/load → payoff flow |

Player actions are ordinary `GameAction`s: `bank-accept-loan`, `bank-loan-extra-payment`,
`bank-loan-payoff`, `bank-open-credit-line`, `bank-credit-draw`, `bank-credit-repay` and
`bank-close-credit-line`. Every rule returns a plain-language reason when it refuses.

## Accounting

All cash moves through `postTransaction`, so cash always equals the sum of the ledger. Books are
reconciled after every unit test and at every step of the browser test.

- **Financing, which is neither revenue nor expense:** `loan-proceeds`, `loan-principal`,
  `credit-draw` and `credit-repayment`. These are listed in `FINANCING_CATEGORIES`. Borrowed money
  is not income, and repaying principal is not a cost.
- **Expenses:** `loan-interest`, `loan-fee` (origination and prepayment), `late-fee` and
  `credit-interest`.
- **Earlier defect, now fixed:**
  - Before this milestone, any positive amount counted as revenue and vehicle-loan payments
    booked principal as an expense.
  - The campaign test's revenue and expense tie-out now excludes financing. It is exactly as
    strict as before.
- **Debt in the Overview:** the Debt tile and net position include the drawn line balance.
- **P&L:** the profit and loss statement shows interest and fees among operating expenses.

## Calendar

A game month is 30 days, the same as the existing leases and vehicle loans. `processBankingDay`
runs once per day as the clock rolls over, so fast-forwarding can never skip or double a payment.
A test drives the real clock through day 32 to confirm exactly one installment and one statement.

## Term loans

| Product | Lender | Amount | Term | Base APR* | Origination | Prepayment | Requirements |
|---|---|---|---|---|---|---|---|
| Microloan | Silver State Small Business Fund | $3k–15k | 24 mo | 9.5% | 2% | none | rating ≥ 40 |
| Online term | Summit Business Capital | $5k–40k | 12 mo | 21.9% | 3% | 2% | rating ≥ 35 |
| Bank term | Desert Community Bank | $10k–120k | 36 mo | 8.9% | 1% | none | 30 days, rating ≥ 60, $12k revenue in 30 days |

\*Base APR is quoted at a rating of 70. The quoted rate moves 0.12 points per rating point, plus a
seeded weekly variation of ±0.4, clamped to each product's range.

- **Offer size:** the product's startup amount, plus a revenue multiple, plus a share of fleet
  resale value as collateral, scaled by the rating. Three caps then apply:
  - **Debt cap:** total term debt plus credit limits may not exceed
    max($30k, 4 × 30-day revenue).
  - **Payment cap:** monthly debt service may not exceed 35% of 30-day revenue. This cap starts
    after a 14-day startup grace period.
  - **One per lender:** only one open loan per lender.
- **Determinism:**
  - Quotes are fixed for 7-day windows using a hash of the world seed, the product and the
    window. They do not use the game's RNG.
  - Reopening the panel or reloading never re-rolls a quote, and reading offers never changes
    state.
  - An offer id includes its window (`microloan@7`), so accepting an expired quote is refused.
- **Payments:**
  - The installment is P·r / (1 − (1+r)^−n), with an exact P/n when the rate is zero.
  - Each installment pays interest on the balance first, then principal.
  - Payments are drafted automatically on the due day.
  - The player gets a warning three days ahead if cash is short.
- **Extra payments:**
  - An extra payment clears any past-due amount first, then reduces principal. The payment
    stays the same and the term shortens.
  - The prepayment fee is a percent of the principal prepaid. For example, $1,020 pays $1,000
    of principal plus a 2% fee.
- **Early payoff:** past due, plus interest prorated since the last installment, plus principal,
  plus the prepayment fee. The Banking tab shows this as "Payoff today".
- **Vehicle financing:** uses the same loan model ("Dealer financing", 8.9%, 60 months). Selling
  the van settles the loan with no prepayment fee.

## Line of credit

| Product | Lender | Limit | Base APR | Requirements |
|---|---|---|---|---|
| Starter line | Summit Business Capital | $3k–15k | 22.9% | rating ≥ 40 |
| Bank line | Desert Community Bank | $10k–75k | 11.5% | 21 days, rating ≥ 58, $9k revenue in 30 days |

- **Drawing:**
  - Draws start at $100 and may not exceed the available credit.
  - The line must be active, with nothing past due.
- **Interest:** accrues daily as principal × APR / 365.
- **Statements:**
  - A statement is issued every 30 days and bills the accrued interest.
  - The minimum payment is fees + billed interest + max($50, 3% of principal), due 15 days
    after the statement.
  - Autopay pays the minimum on the due day.
- **Repayments:** a voluntary repayment pays fees first, then interest, then principal. A full
  repayment also settles interest accrued since the last statement, so a line repaid in full is
  truly at $0 and can be closed.
- **Monthly review:**
  - Good standing can raise the limit by at least 10%, up to what a fresh offer would allow.
  - A recent miss or a rating below the lender's minimum cuts the limit by 25%, never below
    the drawn balance.
  - A default suspends the line.

## Missed payments and delinquency

Cash can go negative in this game and there is no game over, so a missed payment hurts but is
recoverable:

1. **Missed payment:**
   - The installment or minimum becomes past due, plus a late fee: $40–100 depending on the
     lender.
   - The miss is recorded and lowers the rating.
   - Loan installments keep accruing interest. A missed final installment is never billed twice.
     A test misses every installment for the whole term and checks this.
2. **Draws paused:** draws on the line stop until the past due is paid.
3. **After 30 days:** the account is **delinquent**, and the line is suspended.
4. **After 60 days:** the account is in **default**. Every lender declines new credit and the
   line is suspended.
5. **Recovery:**
   - The past-due amount is collected automatically as soon as cash allows, and the account
     returns to current.
   - The player can also pay it from the Banking tab.
   - A suspended line is reinstated at the next monthly review once nothing is past due and the
     rating meets the lender's minimum.

## Credit rating

The credit rating is an internal 0–100 score that this game's lenders use. It is a game mechanic,
not a consumer credit score, and it starts at 52. The Banking tab shows every factor:

| Factor | Points |
|---|---|
| New business baseline | +52 |
| Operating history | +1.5 per week, up to +12 |
| On-time payments | +2 each, up to +15 |
| Missed payments, by age (≤30, ≤60, ≤90, older days) | −12, −7, −3, −1 each; total capped at −36; forgotten after 120 days |
| Account status | past due −8, delinquent −18, default −30 |
| Credit line use | >90% −8, >70% −5, >50% −2, 1–30% +3 |
| Debt vs. 30-day revenue (after the 14-day grace) | >4× −10, >2.5× −6, >1.5× −2, <0.5× +2 |
| 30-day profit margin | margin × 40, capped at ±10 |
| Cash reserves vs. 30-day costs | ≥1 month +6, ≥0.5 +3, <0.15 −3 |
| Cash covers 3+ months of debt payments | +4 |
| Negative cash | −8 |

**Bands:** Excellent ≥ 80, Good ≥ 65, Fair ≥ 50, Weak ≥ 35, Poor below that.

## Save and load

- **Schema bump:** `SAVE_SCHEMA_VERSION` is now 2. Banking state is stored in
  `finance.banking`: the line, score, factors, payment record and the last 250 history events.
  Loans carry their full record.
- **Migration from schema 1:**
  - The migration adds empty banking state.
  - Old vehicle loans are upgraded with lender, term, last-payment day and status. A test
    loads a schema-1 loan and pays its next installment.
- **Round trip:** a save and reload is byte-identical, and the loaded game continues exactly like
  the original. Unit tests and the browser test both check this.

## Balance scenarios

To reproduce: `BANKING_SCENARIOS=1 npx vitest run src/tests/bankingScenarios.test.ts`. The run
takes about a minute.

Every scenario plays the full 90-day campaign with seed 2026 and the same autopilot owner. The
owner accepts every lead, dispatches idle technicians, and hires when three or more accepted jobs
are waiting (at most once every 10 days). The owner buys a van when there are more technicians
than vans and cash allows. Ten days in, local-services ads go on.

| Scenario | Revenue | Ending cash | Debt left | Net position† | Interest + fees | Misses | Status | Rating |
|---|---|---|---|---|---|---|---|---|
| Conservative: no credit | $106,512 | $8,414 | $0 | $52,652 | $0 | 0 | current | 62 |
| Modest: microloan on day 1 | $106,512 | $13,286 | $5,090 | $52,434 | $218 | 0 | current | 72 |
| Seasonal line use (draw below $5k, repay above $12k) | $106,512 | $8,308 | $0 | $52,546 | $106 | 1 | current | 57 |
| Multiple loans: every approved offer plus a full line on day 1 | $117,834 | $26,803 | $16,449 | $48,572 | $1,006 | 0 | current | 98 |
| Struggling: online loan, owner draws $1,500/day from day 5 | $114,350 | −$82,860 | $8,000 | −$46,987 | $240 | 2 | delinquent | 11 |
| Early payoff: online loan repaid on day 45 | $106,512 | $7,739 | $0 | $51,977 | $675 | 0 | current | 64 |

†Net position is cash + receivables − debt.

What the table shows:

- **Borrowing never creates value by itself.** Every borrowing scenario ends with a net position
  at or below the conservative run. The difference is the interest and fees paid. A unit test
  enforces this: taking every offer and maxing the line lowers cash minus debt.
- **The early economy doesn't need credit.** With $25k of starting cash, the autopilot's growth
  was never cash-constrained, so a modest loan changes nothing operationally. It costs $218 and
  builds 10 rating points. Loans pay off when growth is limited by cash: a second van and
  technician before the cash exists, or covering payroll while warranty receivables (net 35) are
  outstanding. This is a reasonable baseline: credit is a tool, not free money.
- **Using the line without reserves causes a miss.** The seasonal strategy drew only when cash
  fell below $5k. One statement came due when cash was below the minimum, so one late fee and a
  rating 5 points lower than the conservative run.
- **Leverage is rated well while it is serviced.** "Multiple loans" keeps $16k of debt but pays
  on time with borrowed cash in the bank, so it rates 98. On day 1 the rating-scaled offer sizes
  limit how much it can borrow: about $16.5k in total, well under the $30k debt cap. Weakness:
  idle borrowed cash counts toward the reserves factor. Lenders would normally net it out. Watch
  this when the economy gets harder.
- **Distress escalates as designed.** The overdrawing owner missed both installments, reached
  delinquent, and the rating collapsed to 11 (Poor). After day 91 the account would reach
  default, and no lender will extend more credit at that point.
- **Early payoff stops the interest.** The online loan's total cost was $675: the 3% origination
  fee, one installment of interest, interest up to the payoff, and the 2% prepayment fee.
  Holding an $8k, 12-month loan at about 24% to term costs about $1,080 in interest on top of
  the origination fee. The prepayment fee softens the saving but does not erase it.

## Tuning notes and assumptions

- **Fictional numbers:** rates are game-economy numbers chosen to feel plausible. They are not
  market data.
- **Starter line on day 1:** the starter line is approved on day 1 with a $3k limit. Its startup
  limit was raised from $5k to $6k so that the rating-52 scaling (×0.55) still clears the $3k
  product minimum. A product described as "for young companies" should be usable on day 1.
- **Leverage grace period:** the debt-to-revenue factor waits out the 14-day startup grace.
  Without it, accepting any loan on day 1 divided debt by $0 revenue, cost 10 points, and locked
  the player out of the line.
- **Reviewing the economy:** if the economy gets harder, for example with seasonal demand, start
  with `revenueMultiple`, `debtCapRevenueMonths`, `maxPaymentToRevenue` and `aprPerScorePoint`
  in `config.ts`.
