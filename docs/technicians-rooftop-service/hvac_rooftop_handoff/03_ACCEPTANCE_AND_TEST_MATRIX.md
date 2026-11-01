# Acceptance and Test Matrix — Technician + Rooftop Mission

## Proof tiers
- **Code compiles** is not sufficient proof of a feature.
- **Visual proof** requires actual rendered game frames (desktop and phone-sized).
- **Functional proof** requires the complete choreography in a playable browser session.
- **Economy proof** requires normal receipts/ledger entries/authorizations and no duplication.

## Automated tests
| ID | Test | Required assertion |
|---|---|---|
| C01 | Character visual loads | GLB/materials load, no console errors, animated skeleton mounts |
| C02 | Ground-call regression | Walking/diagnose/repair/close still works with new character |
| C03 | Character identity | Appearance is stable for same tech/save; unrelated skills unchanged |
| R01 | Correct equipment assignment | Rooftop service only when building/customer system is roof based |
| R02 | Unsupported roof | No magic ladder service; explicit blocked/escalation status |
| R03 | Ladder on rack | Correct vehicle has one ladder, no duplicate mesh |
| R04 | Ladder transfer | Exactly one logical ladder through rack→held→placed→stowed |
| R05 | Access choreography | Retrieval, carry, placement, ascent, rooftop navigation, descent all reachable |
| R06 | Mid-sequence save/load | Ladder and tech recover together from mid-climb or safe checkpoint |
| R07 | Job cancellation | No orphan ladder, on-roof worker or stuck vehicle |
| R08 | Authorization | Warranty/replacement approvals never bypassed by animation |
| R09 | Economic integrity | One job, one fee/parts/receipt set; balanced ledger |
| R10 | Automation | Manual/auto diagnostic and estimates behave as before on eligible rooftop repair |
| R11 | Time scaling | Equivalent state at 1x, 5x and chunked tick advancement, modulo render interpolation |
| R12 | Concurrency | Multiple technicians and simultaneous rooftop/ground jobs don't share ladder IDs or cross-control |
| R13 | Roof camera | Property / Watch / Detail frame work at roof elevation, no roof/pole obstruction |
| R14 | Old save compatibility | Unmigrated existing campaign loads and ground jobs behave normally |
| R15 | Missing ladder | Job cannot initiate climb; no unbounded retry loop |

## Visual QA evidence (actual gameplay captures)
1. Before/after technician standing and normal walk; compare realistic proportions and foot contact.
2. Ground repair in cinematic Detail mode; hands and tool connect to condenser.
3. Van park and rack contents; physical ladder visible once.
4. Technician holding ladder beside van (side view, no mesh clipping).
5. Ladder positioned at valid modeled low-rise commercial access, stable ground/roof association.
6. Technician mid-climb with hands/feet coordinated with rungs; smooth transition to roof.
7. Technician walking on roof and servicing RTU with owned tools.
8. Descent and ladder return; after job the roof and vehicle don't have stray props.
9. Rooftop Property / Watch / Detail with inspector visible; viewport 1920×1080 and 390×844.
10. At least one unsupported roof or missing-ladder case with intelligible player feedback.

## Load/performance scenarios
- One technician/one rooftop job for first vertical slice.
- Four technicians with two active ground calls plus one rooftop service.
- Ten technicians for a sustained multi-day run with Operations Center toggles ON; verify no stuck workers, missing vehicles, duplicate receipts, or runaway animation/asset memory.
- FPS/frame time and draw calls in a matching baseline vs new scene; record actual numbers and measurement conditions. Simplify distant character rigs/updates when needed.
- Playwright one worker, one process/spec at a time; check Windows memory headroom. Do not mark interrupted suites as passes.

## Release gates
**Vertical slice ready for local review:** character improvement evident; R01–R09, R13, R14 relevant cases pass; actual rooftop repair loop and camera have screenshots; core tests pass.

**Full mission locally validated:** all required cases pass; relevant house/access variants; mobile and 10-tech load; no severe visible clipping/animation bugs; summary of honest known limits.

**Preview release:** requires separate owner authorization for GitHub push and Vercel Preview. Production always protected.
