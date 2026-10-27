# Automated Operations Center

A headquarters upgrade that lets technicians run routine service calls on their own, so a growing
company does not need the owner to diagnose every call and present every estimate. The owner keeps
the decisions that matter: full replacements, readings that genuinely conflict, and anything the
automation cannot do. Those collect in one place, the **Owner Attention** queue.

## Upgrade and settings

| | |
|---|---|
| Where | Headquarters › Facility upgrades › Automated Operations Center |
| Price | $1,000, one time (a `facility` entry: carried at cost, depreciated like other HQ upgrades) |
| Unlock | 3 or more technicians. The owner counts: the owner is a working technician (role `technician`), dispatched like any other. Below the requirement HQ shows "Needs 3 technicians · you have N" |
| Settings | Settings › Operations Automation: **Automatic diagnostics** and **Automatic estimates & deal closing**, independent, both off after purchase, changeable at any time, saved with the game |

## What each setting does

**Automatic diagnostics.** When a technician's findings are in, the technician commits to a
diagnosis from their own readings. Those readings were already rolled with the technician's skill,
training, fatigue and the tools on site (Supply Depot), so the decision inherits all of it; no new
random draw is made.

| Share of the evidence weight read correctly | Decision |
|---|---|
| ≥ 60% | The right fault |
| ≤ 40% | Misled into the closest lookalike (the normal consequences: wrong part, likely callback, lower review) |
| Between | Conflicting readings. A technician whose instruments read reliably on these measurements (worst reading ≥ 85% with tools) re-checks and gets it right; otherwise the job goes to the owner |

Equipping technicians therefore cuts the owner's interruptions as well as misdiagnoses.

**Automatic estimates & deal closing.** After a diagnosis (automatic or the owner's), the technician
presents the repair at the standard catalog price (no discounts) through the normal quote:

- Direct customers accept or decline by the existing acceptance odds (communication, sales ability,
  trust). A decline closes the visit with the diagnostic fee, as before.
- Warranty customers: the quote goes to the warranty company and the job waits for its authorization
  as before; no repair work or parts before approval. A denial closes the visit with the diagnostic
  fee and leaves a notice for the owner.
- A fault that makes a replacement the sensible recommendation (the game's own rule: a replacement
  candidate on a system at or past its replacement age) is never quoted automatically: it goes to the
  owner, who chooses repair or replacement on the job.

Turning a setting on or off takes effect at the job's next decision point. Jobs already past that
point carry on normally; jobs waiting for the player are picked up on the next simulation step.

## Owner Attention queue

Jobs › **Owner attention** (badge on the tab; notices also count on the Jobs button):

| Item | Kind | What the owner does |
|---|---|---|
| Replacement needs your approval | Decision (the job waits, the technician stays on site) | Open the job, choose repair or replacement |
| Diagnosis needs your call | Decision | Open the job, review the findings, choose the diagnosis |
| Automation could not continue | Decision | Open the job, act on the stated reason |
| Warranty denied the work | Notice | Read it, "Got it" |
| Waiting on warranty authorization | Listed, no action | Nothing; it resolves itself |

Each item is raised once, with one warning toast, and is written to the job's history. A decision
resolves itself when the owner acts on the job; automation then continues from there. Ordinary
successes produce no popups: a quiet digest ("Operations: 6 diagnosed · 5 estimates presented") at
most every two game hours. Jobs handled by automation carry an **Auto** tag.

## Integrity

- The automation pass runs once per half-minute simulation step, after the job phases, and only acts
  on a job in `awaiting-diagnosis` or `quoted`. Each action moves the job out of that status, so a
  job can never be diagnosed, quoted, approved, completed or paid twice. Open blocking items stop
  automation on that job until the owner decides.
- The engine splits every advance into the same half-minute steps, so 1×, 2×, 5× and fast-forward
  give the same game (tested: identical saves after three days of a ten-technician company).
- Deterministic: no new random draws; the quote's customer and warranty decisions use the same draws
  as a manual quote.
- Save schema 4: `company.automation`, and per job `auto` and `attention`. Older saves load with
  automation off.

## Measured: a ten-technician company

Ten technicians and vans, both settings on, busy market (two extra calls an hour), the owner working
the queue twice a day; ten game days (`automation.test.ts`):

| | |
|---|---|
| Calls completed | 280 (2 of 284 leads expired) |
| Diagnosed and quoted with no owner involvement | 197 (70%); among calls without a replacement decision, over 80% |
| Replacement approvals | 60 (21% of calls; the game's lead mix has many old systems) |
| Conflicting readings sent to the owner | 24 (8.6% of calls) |
| Warranty denial notices | 19 |
| Duplicate fees, repair payments, parts, completions or money toasts | 0 |
| Books | Reconciled |

## Files

| File | Role |
|---|---|
| `src/game/operations/automation.ts` | Settings, technician count, the automation pass, the attention queue |
| `src/game/progression/hqUpgrades.ts`, `facility.ts` | The upgrade and its technician requirement |
| `src/ui/panels/SettingsPanel.tsx` | Operations Automation switches (locked state explains price and requirement) |
| `src/ui/panels/JobsPanel.tsx`, `JobFlow.tsx` | Owner attention tab, Auto tags, attention card on the job |
| `src/tests/automation.test.ts` | 17 tests |
| `e2e/automation.spec.ts` | Browser test: desktop, 1024×768, 390×844 touch |
