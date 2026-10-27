# Pro Supply Depot & Technician Equipment

The company buys professional HVAC tools at the Pro Supply Depot (the Mojave HVAC Supply
warehouse on Desert Bloom Ave), keeps them in an HQ tool crib, issues portable tools to
technicians and loads larger equipment onto van racks. Tools change the measurable mechanics of a
service call: the chance each reading comes back right, the time readings and repair steps take,
and the workmanship of refrigerant-circuit repairs. They never change a technician's attributes and
never make the diagnosis for the player.

## Where the code lives

| File | Role |
|---|---|
| `src/game/equipment/catalog.ts` | The 12 tools as data: price, tier, category, mount, rack bulk, accounting class, effects, plain-language use |
| `src/game/equipment/inventory.ts` | Purchases, assignment and transfer rules, resale, release on firing/quitting/vehicle sale, starter kit, book value |
| `src/game/equipment/performance.ts` | Effective performance: tools on site, read accuracy, time multipliers, workmanship, summaries and purchase estimates |
| `src/game/jobs/faults.ts` | Every reading is tagged with what it measures (`measure`), every fault lists its repair steps (`procedures`) |
| `src/game/jobs/workflow.ts` | The job phases use the tools on site (diagnostic time, each reading, repair time, workmanship, review stars) |
| `src/ui/panels/SupplyPanel.tsx` | Supply Depot: Catalog, Inventory, Loadouts |
| `src/ui/components/ToolArt.tsx` | Product illustrations (SVG) |
| `src/world/props/SupplyProps.tsx`, `tools/blender/supply_tools.py` | Blender-authored tool case, vacuum pump, recovery machine, nitrogen kit (GLB, 4,008 triangles) |
| `src/world/buildings/Commercial.tsx` | Depot storefront: showroom, canopy sign, parking, display counter |
| `src/tests/equipment.test.ts` | 21 unit tests |
| `src/tests/equipmentEconomics.test.ts` | Exact per-call value and payback of every tool (fast, always runs) |
| `src/tests/equipmentScenarios.test.ts` | 90-day campaign scenarios (opt-in: `EQUIPMENT_SCENARIOS=1`, add `--silent=false` to see the tables) |
| `e2e/supply.spec.ts` | Browser test: shop, equip, rack limits, inventory moves, loadouts, a leak call, Team tab, save/reload |

Player actions are `buy-tool` (optionally straight to a technician or van), `assign-tool` and
`sell-tool`. Every refusal has a plain reason (not enough cash, rack full, already carries one,
in the field, vehicle tools do not go in a technician's kit).

## Catalog

| Tool | Tier | Price | Carried | Accounting | What it does |
|---|---|---|---|---|---|
| Professional hand tool set | Basic | $450 | Technician | Expense | Every repair step 8% faster |
| Digital multimeter | Basic | $180 | Technician | Expense | Electrical readings (gap closed 35%), electrical reads 10% faster |
| Clamp meter | Basic | $260 | Technician | Expense | Amperage readings (45%), electrical (10%), electrical repair 5% faster |
| Digital refrigerant manifold | Professional | $780 | Technician | Expense | Pressure (50%) and temperature-split (30%) readings, charging 15% faster |
| Electronic leak detector | Professional | $390 | Technician | Expense | Leak search (60%), leak search 30% faster |
| Digital manometer | Professional | $340 | Technician | Expense | Airflow/static (55%), airflow work 15% faster |
| Refrigerant charging scale | Professional | $290 | Technician | Expense | Weighed-in charge: workmanship (50%), charging 10% faster |
| Micron gauge | Professional | $240 | Technician | Expense | Proven evacuation: workmanship (60%), evacuation 10% faster |
| Vacuum pump | Professional | $1,150 | Van (2 space) | Capital | Evacuation 40% faster, workmanship (15%) |
| Recovery machine | Advanced | $1,650 | Van (3 space) | Capital | Refrigerant recovery 50% faster |
| Nitrogen pressure-test kit | Advanced | $690 | Van (2 space) | Expense | Pressure test 35% faster and proven (50%), brazing 10%, leak readings (20%) |
| Thermal imaging camera | Advanced | $1,900 | Technician | Capital | Visual (35%), temperature (30%) and airflow (15%) readings |

Every new company (and every older save, on load) has the **starter kit**: the owner's hand tool
set and multimeter. It came with the business, so it has no purchase entry and no book value.

## Ownership rules

- Every physical tool has exactly one holder: the HQ tool crib, one technician, or one van rack.
  A tool can never benefit two technicians at once.
- Portable tools can also ride in a van as shared stock: they then serve whoever runs the job in
  that van (one job per van at a time). Vehicle tools ride only in vans.
- A van rack holds its tool capacity (compact 6, pickup 5, full-size 10, box truck 14, plus 2 each
  for shelving and tool storage). Recovery machine + vacuum pump fill a compact van to 5 of 6.
- No second tool of the same kind on the same technician or van (it would add nothing).
- Tools do not move while their technician or van is out on a job.
- Letting a technician go, a quit, or selling a van returns its tools to the crib; loading a save
  repairs any reference to someone who is gone.
- Surplus tools sell for 40% of their price less straight-line wear (never below 10%), so buying
  and selling can never make money.
- Each tool keeps a short history (bought, issued, moved, returned) and how many jobs it was used on.
- `condition` and `calibrationDueDay` are in the save for future wear and calibration; neither is
  simulated yet (no busywork on cheap hand tools).

## How tools act on a call

The tools on site are the lead technician's own kit plus the rack of the van they came in, if that
van is parked at this job. Several tools on the same thing combine with diminishing returns,
`gain = 1 − Π(1 − e)`, and every effect is capped:

| Mechanic | Formula | Cap |
|---|---|---|
| Each reading | `p' = p + (0.97 − p) · gain` for that reading's kind; `p` is the technician's own accuracy (skill, attention, fatigue) | 97%: no reading is ever certain |
| Diagnostic time | `t · (1 − Σ share · saving)`, share = 1/3 per reading | 35% saved |
| Repair time | `t · (1 − Σ share · saving)`, share = 1/n per repair step, hand tools apply to every step | 55% per step |
| Workmanship (leak and compressor repairs) | `q' = q + (0.98 − q) · gain`, `q` from attention to detail and expertise | 98% |
| Review stars | `+1.5 × (q' − q)` on a correct refrigerant-circuit repair | +0.5 |

A better technician keeps the lead with the same tools (a smaller gap to close, but from a higher
start), and the tools help a weak diagnostician more. One random draw per reading, as before:
tools change the odds, never the number of draws, so seeded games stay deterministic. The repair
uses the steps of the diagnosis the player chose. Installs are not affected (install crews keep the
replacement mechanics; a future milestone).

What the player sees: the catalog estimates each tool for a chosen technician and van ("Leak
search 82% → 91%", "Repairs it helps: 198 → 193 min"); dispatch shows the crew's equipment and
the chance all readings come back right; each reading names the tool that took it; a finished job
reports minutes saved and workmanship; Team › Equipment and Supply › Loadouts show each
technician's effective performance against their own skill alone.

## Accounting

- Tools under $1,000 are **expensed** (`tools`, operating): equity falls by the price at purchase.
- Equipment at or above $1,000 is **capital** (`equipment-purchase`, investing): cash becomes an
  asset at cost, depreciated straight-line over five years on the balance sheet, so equity is
  unchanged on the day of purchase.
- Sales post `equipment-sale` (investing). Loan proceeds stay financing flows, never revenue, also
  when they pay for tools. Cash still equals the ledger.

## Balance

### Per call (exact, `equipmentEconomics.test.ts`)

Each tool added to the starter kit, over the game's lead mix (capacitors and contactors are
common, refrigerant-circuit faults depend on equipment age). Readings use the careful-player rule
(right diagnosis when the correctly read evidence carries at least half the weight). A technician
hour is worth $190 busy / $117 normal (revenue per technician-hour in the campaign scenarios); a
wrong diagnosis costs about $526 busy / $400 normal (the 75% unpaid callback visit with its parts,
and the review hit).

| Tool | Price | Correct diagnoses (pts) | Min saved / call | Value / call (busy) | Payback busy | Payback normal | Typical hire, busy |
|---|---|---|---|---|---|---|---|
| Clamp meter | $260 | +0.6 | 1.5 | $7.70 | 34 calls | 50 | 23 |
| Digital manometer | $340 | +0.5 | 1.4 | $6.94 | 49 | 74 | 33 |
| Digital refrigerant manifold | $780 | +0.5 | 1.4 | $7.24 | 108 | 160 | 71 |
| Nitrogen pressure-test kit | $690 | +0.1 | 1.7 | $5.97 | 116 | 180 | 101 |
| Thermal imaging camera | $1,900 | +1.3 | 2.1 | $13.71 | 139 | 201 | 89 |
| Micron gauge | $240 | 0 | 0.4 | $1.53 | 157 | 223 | 142 |
| Refrigerant charging scale | $290 | 0 | 0.4 | $1.48 | 197 | 285 | 179 |
| Electronic leak detector | $390 | +0.2 | 0.3 | $1.86 | 210 | 303 | 126 |
| Vacuum pump | $1,150 | 0 | 1.5 | $4.85 | 237 | 381 | 219 |
| Recovery machine | $1,650 | 0 | 1.9 | $5.96 | 277 | 450 | 256 |

- Nothing is overpowered: the fastest payback is the cheap clamp meter at 34 calls (about 11 days of
  one technician's work). The test requires more than 20 calls for every tool.
- Nothing is useless: every tool earns something per call and pays back within a busy technician's
  year (the test requires under 700 calls).
- The most expensive tool is not the best buy: the thermal camera earns the most per call but pays
  back slower than the clamp meter, manometer or manifold.
- Specialised refrigerant equipment (vacuum pump, recovery machine, scale, micron gauge) pays only
  where leak and compressor work is frequent: a choice for a mature company, not a starter.
- Tuning made: the leak detector was $560, which took about 300 busy calls (435 normal) to pay
  back because it serves only leak calls (about 7% of leads). It is now $390 (210 busy, 126 for a
  typical hire), in line with real heated-diode detectors. No other change was justified.

### Campaign scenarios (`equipmentScenarios.test.ts`)

The same company in every scenario (the owner plus the best technician on the market and a used
compact van from day 1, no further growth), so only the equipment differs; five seeds, paired. The
autopilot reads the findings like a careful player (above). A 90-day campaign diverges after the
first different reading, so single seeds swing by ±$10–40k; the means show direction, and the
per-call table above is the precise measure.

| Scenario (vs) | Tool spend | Correct dx | Callbacks | Avg repair | Jobs | Revenue | Equity | Seeds better |
|---|---|---|---|---|---|---|---|---|
| B. A few professional tools (vs basic, normal) | +$3,020 | +0.9 pts | −0.2 | −1.8 min | +5.4 | +$5,283 | −$1,198 | 1 / 5 |
| D. Kits and van gear, busy market (vs basic) | +$9,080 | +3.0 pts | −7.0 | −8.0 min | +24.6 | +$5,781 | **+$4,242** | 3 / 5 |
| E. Same kits on credit (vs D) | — | −0.4 | +2.2 | −1.4 min | +5.0 | −$4,148 | −$1,659 (financing cost $301) | 1 / 5 |
| C. Everything, weak market (vs basic), 20 seeds | +$12,780 | | −3.4 | | −3.0 | | **−$4,714** | 6 / 20 |

Baselines (basic tools): normal market 340 jobs, 93.3% correct diagnoses, 15.6 callbacks, 68 min
average repair; busy market 456 jobs, 92.1%, 24.2 callbacks, 71 min.

- **B**: a few professional tools on one owner improve diagnoses slightly; over 90 days the gain is
  about the size of the spend (per call they pay back in 50–160 calls).
- **D**: where the phone is ringing, kitted technicians diagnose better (callbacks −29%), repair 11%
  faster and complete 5% more jobs; equity is higher on average.
- **E**: buying the same kits on credit right away instead of from cash costs the financing and
  gains nothing measurable over 90 days: tools are cheap relative to the business, so borrowing
  for them is rarely needed.
- **C**: gear the work cannot pay for loses money: fewer callbacks do not make up for $12.8k spent
  in a weak market, of which $7.3k of book value remains.

Banking scenarios were rerun with the starter kit in place; see `BANKING.md`.

## Known limits

- Wear, calibration and replacement are not simulated (fields reserved).
- Install jobs ignore tools.
- The careful-player model in the scenarios uses the readings' hidden accuracy as a stand-in for a
  player weighing the evidence; real players will do better or worse than it.
