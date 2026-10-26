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
| `src/game/economy/balanceSheet.ts` | Book-value balance sheet and cash-flow groups used to compare strategies |
| `src/tests/banking.test.ts` | 28 unit tests |
| `src/tests/bankingScenarios.test.ts` | Balance scenarios (opt-in, see below) |
| `e2e/banking.spec.ts` | Browser test of the whole borrow → spend → repay → save/load → payoff flow |
| `e2e/banking-layout.spec.ts` | Banking tab layout at 390×844 and 390×664 (touch), 1024×768 and 1920×1080 |

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
- **Amount:** an offer is the most the lender approves. The player borrows any amount from the
  product minimum up to the approval, in $100 steps, and the review step recomputes the fee,
  payment and total interest live. Before this change, accepting always took the whole
  approval, so financed growth over-borrowed: $128k of debt to cover a few van-sized shortfalls.
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
not a consumer credit score, and it starts at 52. The Banking tab shows every factor.

**The rule: taking on debt can only lower the rating.** The one way borrowing builds the rating
is months of on-time payments, which take time and cost interest. Idle borrowed cash earns
nothing. A unit test checks six borrowing patterns against the same company without debt: two
microloan sizes, an online loan, a line drawn 10%, a line drawn fully, and everything at once. In
every pattern the rating stays the same or drops. Under the earlier rules, holding the microloan
raised it from 73 to 77.

| Factor | Points |
|---|---|
| New business baseline | +52 |
| Operating history | +1.5 per week, up to +12 |
| On-time payment history | +3 per 30-day period with an on-time payment, up to +15 (more accounts do not speed it up) |
| Missed payments, by age (≤30, ≤60, ≤90, older days) | −12, −7, −3, −1 each; total capped at −36; forgotten after 120 days |
| Account status | past due −8, delinquent −18, default −30 |
| Credit line use | >90% −8, >70% −5, >50% −2 (no bonus) |
| Debt vs. 30-day revenue (after the 14-day grace) | >4× −10, >2.5× −6, >1.5× −2 (no bonus) |
| Debt service coverage: (profit + interest) ÷ monthly debt payments, after the grace | <1× −6, <1.25× −3 (no bonus) |
| 30-day profit margin | margin × 40, capped at ±10 |
| Cash reserves net of debt, vs. 30-day costs | ≥1 month +6, ≥0.5 month +3 |
| Thin cash buffer (gross cash under 0.15 month of costs) | −3 |
| Negative cash | −8 |

**Bands:** Excellent ≥ 80, Good ≥ 65, Fair ≥ 50, Weak ≥ 35, Poor below that.

**What changed in this refinement, and why:**

- **Reserves:** reserves used to count gross cash, so borrowed cash sitting in the bank looked
  like a reserve. They now count cash minus debt.
- **Debt service coverage:** "Cash covers 3+ months of debt payments" (+4) was replaced by debt
  service coverage. Coverage is earned by operations, so idle cash can't inflate it. Like
  utilization and leverage, it only penalizes; profitability is already rewarded by the margin
  factor.
- **No small-borrowing bonuses:** the +2 for debt under half a month of revenue and the +3 for
  using 1–30% of a line are gone. Both let a company raise its rating by borrowing a little and
  holding it.
- **Payment history by month:** history counted each payment (+2), so three accounts built it
  three times as fast. It now counts months with an on-time payment (+3 each).
- **Existing saves:** `onTimeMonths` and `lastOnTimeMonth` are optional fields. Schema-2 saves
  made before this change start their monthly history at 0.

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

## Valuation: book equity, not cash

`src/game/economy/balanceSheet.ts` gives every comparison one definition, and it is unit tested.

- **Assets:**
  - Cash and open receivables.
  - Owned vans at resale value (what the Fleet panel offers). Leased vans are excluded.
  - HQ improvements at cost, depreciated straight-line over 10 years. They have no resale
    market in the game.
- **Liabilities:** everything owed today without a prepayment fee. For loans: principal,
  past-due interest and fees, and interest accrued since the last installment. For the line:
  principal, billed and accrued interest, and fees.
- **Equity:** assets minus liabilities. The scenarios compare equity change over the campaign.
  Borrowed cash is matched by its liability, so it is never income.
- **Cash flows:**
  - Operating includes interest and fees, as under US GAAP. They are also reported separately
    as financing cost.
  - Investing covers vans, upgrades and HQ improvements.
  - Financing covers proceeds, principal, draws and repayments.
  - Owner draws and opening capital are kept separate.
- **Controlled test:** two identical companies, one of which takes a loan and a line and holds
  the cash. After 75 days, their equity differs by exactly the interest and fees paid plus the
  interest accrued.

The earlier "net position" (cash + receivables − debt) left out the vans. A strategy that turned
cash into vans looked poorer than one sitting on cash, and a loan spent on a van looked like pure
loss.

## Balance scenarios

To reproduce:

```
BANKING_SCENARIOS=1 npx vitest run src/tests/bankingScenarios.test.ts --reporter=verbose
```

The run takes about 11 minutes and prints a `SCENARIO_JSON` line with every run.

**Method.** Every scenario plays the 90-day campaign on five world seeds (2026, 7, 42, 1234 and
99) with the same autopilot owner:

- **Accepting work:** the owner accepts a lead only when a crew (a technician plus a van) is free
  for it, so unserved demand shows up as expired leads. Accepted jobs never expire in the game,
  so the old autopilot, which accepted everything, hid capacity limits.
- **Fatigue:** a technician over 50 fatigue rests, because overwork destroys morale and
  technicians quit.
- **Growth:** when 4 or more leads expired in the last 5 days, the owner adds one step at a
  time: a van for a technician without one, otherwise a technician, and the parking upgrade when
  HQ is full. A hire is only made when the van that goes with it is affordable as well, after
  keeping an $8k reserve.
  - **Self-funded:** the owner waits until cash covers the step.
  - **Financed:** the owner borrows the shortfall, using the cheapest approved loan for just the
    amount needed, then the line.
- **Markets:**

  | Market | Reputation | Brand | Ads |
  |---|---|---|---|
  | Normal | 4.2 | 8 | $120/day |
  | High demand | 4.8 | 45 | $260/day |
  | Low demand | 3.3 | 0 | none |

- **Why five seeds:** one seed is not enough. A few hundred dollars of difference flips a hiring
  decision and the runs diverge, so results are means over seeds, with the number of seeds where
  a strategy beat its baseline.

### Results (means over five seeds, current rules)

| Scenario | Revenue | Jobs | Expired leads | Crew T/V | Operating CF | Investing CF | Financing CF | Financing cost | Liabilities | Δ Equity | Rating |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Conservative: self-funded growth | $91,979 | 267 | 143 | 2/2 | $10,857 | −$10,000 | $0 | $0 | $0 | +$28,616 | 68 |
| Microloan on day 1, held as cash | $94,083 | 271 | 145 | 2/2 | $13,279 | −$10,000 | $5,089 | $216 | $5,139 | +$29,705 | 78 |
| Seasonal line use | $91,979 | 267 | 143 | 2/2 | $10,836 | −$10,000 | $1,985 | $21 | $2,022 | +$28,558 | 69 |
| Every offer on day 1, held as cash | $92,187 | 268 | 149 | 1/1 | $14,205 | −$3,460 | $14,707 | $889 | $14,950 | +$28,132 | 81 |
| Struggling: loan, owner draws $1,500/day | $84,574 | 254 | 133 | 1/1 | $23,615 | $0 | $8,000 | $240 | $9,823 | −$93,740 | 3 |
| Online loan held as cash, paid off day 45 | $92,750 | 268 | 147 | 2/1 | $14,094 | −$6,800 | $0 | $617 | $0 | +$30,531 | 78 |
| Normal demand: financed growth | $112,519 | 369 | 91 | 2/2 | $49 | −$29,400 | $33,182 | $997 | $33,476 | +$21,059 | 54 |
| High demand: self-funded growth | $161,230 | 384 | 270 | 2/2 | $42,734 | −$21,500 | $0 | $0 | $0 | +$60,614 | 74 |
| High demand: financed growth | $216,151 | 547 | 152 | 2/4 | $41,527 | −$51,080 | $33,269 | $997 | $33,539 | +$66,657 | 73 |
| Low demand: self-funded growth | $57,810 | 223 | 79 | 2/1 | $7,182 | −$3,160 | $0 | $0 | $0 | +$20,618 | 76 |
| Low demand: financed growth | $60,111 | 257 | 52 | 1/2 | −$3,274 | −$16,940 | $13,519 | $720 | $14,069 | +$9,466 | 42 |
| Low demand: borrow to expand on plan | $69,210 | 270 | 45 | 1/2 | −$10,870 | −$20,020 | $9,957 | $465 | $10,964 | +$2,895 | 30 |

"Struggling" was delinquent on 5 of 5 seeds; "low demand: borrow on plan" on 3 of 5; "low demand:
financed" on 1 of 5. Operating cash flow excludes owner draws, which is why the struggling run
shows a positive figure.

### Financed against self-funded growth (same seed, then averaged)

| Pair | Δ Revenue | Δ Jobs | Δ Expired leads | Δ Operating CF | Financing cost | Δ Crew (T/V) | Δ Equity (mean, range) | Seeds better |
|---|---|---|---|---|---|---|---|---|
| High demand | +$54,921 | +163 | −118 | −$1,207 | $997 | 0 / +1.6 | **+$6,043** (−$2,129 … +$16,270) | 4 of 5 |
| Normal demand | +$20,540 | +102 | −53 | −$10,807 | $997 | +0.8 / +0.8 | −$7,558 (−$18,722 … +$1,173) | 1 of 5 |
| Low demand | +$2,301 | +35 | −27 | −$10,457 | $720 | −0.4 / +0.8 | −$11,152 (−$22,988 … −$3,900) | 0 of 5 |
| Low demand, borrow on plan | +$11,400 | +47 | −35 | −$18,052 | $465 | −0.4 / +0.8 | **−$17,723** (−$43,444 … −$103) | 0 of 5 |

What this shows:

- **Financing pays where demand goes unmet.** In the high-demand market, borrowing to add vans
  as soon as leads expire served 163 more jobs and $55k more revenue. Equity rose $6k more than
  waiting for cash, on 4 of 5 seeds. The extra vans earn more than their price, depreciation and
  about $1k of interest and fees.
- **It is not a free win.** In a normal market, financed growth brings more jobs (+102) but less
  equity (−$7.6k on average, better on 1 of 5 seeds). The extra crew's wages and the vans'
  depreciation eat the margin, because demand only partly fills the new capacity.
- **In a weak market, borrowing to grow loses on every seed.** Demand-led financed growth lost
  $11k of equity on average. An owner who expanded on a plan rather than on demand lost $18k on
  average and up to $43k, and ended delinquent on 3 of 5 seeds with a rating of 30 (Weak).
- **Holding borrowed cash: equity effect within noise, rating gain only from payment history.**
  - Borrowing without using the money changes equity by −$0.5k to +$1.9k on average. That is
    inside the ±$7k seed noise; with the cash held, the different runs come from tiny decision
    differences.
  - The controlled unit test isolates the real effect: equity falls by exactly the interest and
    fees.
  - Ratings are 78–81 against 68. Like-for-like on the same seed, the microloan rates 4–6 points
    higher, which matches its two on-time installments (+3 each). That is the intended way to
    build credit, and it costs interest.
- **Distress still escalates as designed.** The overdrawing owner reached delinquent on every
  seed, and the rating collapsed to 3.

### Before and after this refinement

The same harness, seeds and valuation were run against the previous rules (commit `6983358`):
no amount choice, so loans took the full approval, and the old rating factors.

| | Liabilities, day 90 | Financing cost | Δ Equity vs. self-funded | Seeds better | Rating |
|---|---|---|---|---|---|
| High demand, financed: before | $127,755 | $3,205 | +$460 | 3 of 5 | 89 |
| High demand, financed: after | $33,539 | $997 | **+$6,043** | 4 of 5 | 73 |
| Normal demand, financed: before | $91,973 | $2,491 | −$22,380 | 0 of 5 | 74 |
| Normal demand, financed: after | $33,476 | $997 | −$7,558 | 1 of 5 | 54 |
| Low demand, financed: before | $57,877 | $1,491 | −$16,612 | 0 of 5 | 41 |
| Low demand, financed: after | $14,069 | $720 | −$11,152 | 0 of 5 | 42 |
| Every offer held as cash: before | $16,723 | $1,003 | −$277 | 2 of 5 | **99** |
| Every offer held as cash: after | $14,950 | $889 | −$485 | 1 of 5 | 81 |
| Microloan held as cash: before | $5,139 | $216 | +$1,088 | 1 of 5 | 82 |
| Microloan held as cash: after | $5,139 | $216 | +$1,088 | 1 of 5 | 78 |

What changed:

- **Choosing the amount:** this turned financed expansion from roughly break-even in a hot
  market (+$0.5k) into a real advantage (+$6k), and cut needless debt by about 75%.
- **Rating incentives:** holding every offer as cash no longer reaches 99. Its remaining edge
  over the conservative run is payment history.

## Tuning notes and assumptions

- **Fictional numbers:** rates are game-economy numbers chosen to feel plausible. They are not
  market data.
- **Starter line on day 1:** the starter line is approved on day 1 with a $3k limit. Its startup
  limit was raised from $5k to $6k so that the rating-52 scaling (×0.55) still clears the $3k
  product minimum.
- **Leverage grace period:** the debt-to-revenue and coverage factors wait out the 14-day
  startup grace. Without it, any loan on day 1 divided debt by $0 revenue.
- **Normal market ads:** advertising at $120/day lowers equity in the normal market when crews
  are already full; the low-demand runs save that spend. This is a property of the marketing
  economy, not of banking, and is worth its own balance pass.
- **Where to tune lending:** `revenueMultiple`, `debtCapRevenueMonths`, `maxPaymentToRevenue` and
  `aprPerScorePoint` in `config.ts`.
