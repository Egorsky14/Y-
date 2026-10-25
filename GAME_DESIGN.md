# Game design: HVAC Company Owner V3

## Fantasy

You run a premium, diagnostics-first HVAC company in Las Vegas. The city is the game: every
decision shows up in the world as a truck leaving the lot, a technician kneeling at a
condenser, a new van in a parking stall, or a new building on the HQ grounds.

## Core loop

```
Lead arrives → Accept → Dispatch (tech + vehicle) → Drive route → Walk to unit → Diagnose
→ Choose diagnosis → Present repair/replacement → (Warranty authorization) → Repair/Install
→ Payment or receivable → Review, trust, XP, fatigue → Return to HQ → Milestones
```

## Time

- One simulated minute is the base unit. At 1× one real second is one game minute; 2× and 5× scale everything (driving, work phases, authorizations). Pause freezes everything.
- Working hours 07:00–18:00. Leads only arrive in working hours. Midnight rollover runs payroll, upkeep, fuel, financing, receivables, marketing, competition, training, fatigue recovery, morale, turnover and schedules the next day's leads.
- The campaign is 90 days. A summary with a grade appears on day 91.

## Customers and channels

- 32 households, each with persistent equipment (type, brand, tonnage, age, refrigerant, SEER, condition) and trust (0–100).
- **Home warranty (≈80% at start):** diagnostic $75 and 65% of book repair price, billed as receivables net 35 days with an 18% chance of slipping 7–14 days per cycle; authorization takes 25–80 game minutes, approves 86% of repairs and 40% of replacements; limited reviews.
- **Direct (≈20% at start):** pays the diagnostic fee (default $95, configurable 49–199) and the quoted price immediately; acceptance depends on price vs. book, trust, communication, sales ability and diagnosis quality; 60% leave a review.
- Lead rates per day: warranty `1.5 + 0.45 × company level` (cap 5); direct `0.35 + 0.5 × max(0, reputation − 3) + LSA/45 × 0.55 + Search/70 × 0.5 + Flyers/60 × 0.35 + brand/40`, boosted by wrapped vehicles and market share. Leads expire after 4 hours (6 with a Dispatch Center). Without a dispatcher 10% of calls are missed, 30% while the owner is in the field.

## Diagnosis

Twelve faults (capacitor, condenser fan motor, blower motor, restricted airflow, refrigerant leak, contactor, compressor, thermostat, condensate drain, control board, dirty condenser, ductwork). Each has three evidence readings with an accurate and a misleading value, two look-alike faults offered as alternatives, parts cost, labor minutes, book price and a replacement-candidate flag with an age threshold.

Measurement accuracy per reading: `0.45 + diagnosticAccuracy/100 × 0.5 + attentionToDetail/100 × 0.08 − fatigue/100 × 0.2`.

A wrong diagnosis still "completes" the repair but lowers trust by 15, lowers review stars by 1.6 and has a 75% chance of scheduling a **callback** 1–3 days later (free repair of the true fault, parts at your cost, a 2-star review).

## Repairs and replacements

- Repair price slider 80%–130% of book; margin shown live. Duration `laborMinutes × durationMultiplier × toolCapacityPenalty`.
- Replacement tiers: Standard 14.3 SEER2 ($9,800 / cost $5,200), Two-Stage 16 ($13,900 / $7,400), Inverter 18 ($18,900 / $10,400), all R-454B. Existing R-22 and R-410A systems are **not** forced to be replaced; age and the fault's replacement flag make replacement sensible.
- Replacements require an installer and a full-size van or box truck. Equipment is paid up front when the crew is dispatched. Install time scales with tier, lead installer speed, crew size (−22% per extra member, floor 55%), staging area (−15%) and liftgate (−15%).

## Employees

Roles: Service Technician, Installer, Dispatcher/CSR, Comfort Advisor. Each has 13 attributes (1–100). Attribute effects:

| Attribute | Effect |
| --- | --- |
| Stamina | Fatigue per hour of field work: `9 − stamina/100 × 6` |
| Work capacity | Overtime threshold (planned; currently informational) |
| Learnability | XP multiplier `0.8 + 0.6 × learnability/100`; training gains `× (0.8 + 0.5 × learnability/100)` |
| Technical expertise | Duration multiplier term `1.1 − 0.2 × expertise/100` |
| Diagnostic accuracy | Probability each reading is accurate (above) |
| Speed | Duration multiplier term `1.3 − 0.6 × speed/100` |
| Reliability | Training gain target (sick days planned) |
| Customer service | Review stars `3.4 + 1.4 × cs/100 + 0.4 × comm/100` |
| Communication | Quote acceptance (+0.2 × comm/100), dispatcher missed-call rate |
| Sales ability | Replacement close rate (+0.4 × sales/100, advisor adds up to +0.2) |
| Leadership | Crew efficiency (planned) |
| Stress tolerance | Morale loss when overworked |
| Attention to detail | Measurement accuracy, install quality |

Progression: XP thresholds 120/300/560/900/1350/1900/2600/3400/4400. Each level adds +2 expertise, +2 diagnostic accuracy, +1 speed, +1 customer service, +8 morale. Nine training programs cost $400–$1,800 and 1–3 days (training room: −1 day), granting permanent attribute gains and certifications. Fatigue recovers 40 per night; fatigue above 70 costs 25% overtime pay. Morale under 20 risks resignation.

## Fleet

| Class | New / used | Cargo ft³ | Seats | Tools | Speed | Upkeep/day | Carries a system |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Compact Service Van | $31,500 / $15,800 | 130 | 2 | 6 | 13 | $22 | No |
| Full-Size Service Van | $52,000 / $26,500 | 280 | 2 | 10 | 12 | $31 | Yes |
| Pickup Truck | $46,000 / $22,000 | 70 | 5 | 5 | 14 | $27 | No |
| Installation Box Truck | $78,000 / $39,500 | 900 | 3 | 14 | 10 | $48 | Yes (liftgate compatible) |

Financing: cash; loan (15% down, 8.9% APR, 60 months, payments every 30 days); lease (new only, 2.1% of price monthly). Resale value depreciates with class rate, condition and time; loans are paid off from sale proceeds. Tool capacity under 10 extends repair time (up to +25%); shelving −5% repair time; wraps and decals add direct leads.

## Headquarters

Base: office, one service bay, two stalls, four staff seats. Upgrades: Expanded Garage (+2 stalls, slower depreciation), Additional Parking (+4 stalls, +4 seats), Dispatch Center (longer lead life), Training Room (faster training), Parts Warehouse (−12% parts cost), Installation Staging Area (−15% install time), Sales Office (+8% close rate), Fleet Maintenance Bay (−30% upkeep). Every upgrade adds visible geometry.

## Economy

All money moves through `postTransaction`; cash always equals the ledger sum (checked by tests and shown in the Finance panel). Daily costs: wages (8 h × rate), owner draw $150, vehicle upkeep, fuel per distance, marketing budgets, loan/lease payments on schedule. Receivables are collected at their due day with slippage.

## Competition

Three competitors with reputation, price level, marketing and capacity. Market share is a smoothed share of "strength" (`reputation`, `marketing`, `capacity`, brand). Competitors raise marketing when they lose share.

## Progression and celebrations

Company level 1–5 from revenue and milestones. Fifteen milestones across early/mid/late game trigger celebration banners; level-ups, five-star reviews, hires, vehicles, training completions and installs also celebrate.
