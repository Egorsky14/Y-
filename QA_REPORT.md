# QA report

Date: 2026-10-25 · Build: Vite 8 production bundle · Branch `ccr-9ef3ffbb-g9q8fs`

## Automated unit tests (Vitest)

`npm test` — **17 passed, 0 failed** (≈16 s; the 90-day campaign test dominates).

| Suite | What it proves |
| --- | --- |
| `pathfinding.test.ts` | Every lot curb is reachable from HQ; A* paths only use road edges; route sampling starts at the stall and ends within lane offset of the curb. |
| `determinism.test.ts` | Identical seed + actions ⇒ byte-identical state; different seeds differ; step size does not change outcomes. |
| `jobLoop.test.ts` | Dispatch → movement (distance travelled, arrival within 3 min of the predicted ETA, within 4 m of the curb) → technician at the condenser and outside every house wall → diagnosis evidence → quote → repair → cash increases by fee + repair price → ledger reconciles → van returns and parks, technician idle with XP. Pause freezes movement; 1× for 2 s equals 5× for 0.4 s. Wrong diagnosis lowers trust and counts. Warranty jobs create one receivable and no cash. |
| `growth.test.ts` | Hiring a technician and buying a second van dispatch two jobs concurrently from different stalls; vehicle capacity is enforced; training costs cash, blocks dispatch, and measurably improves accuracy and duration; loan purchase posts the down payment and liability; save/load round-trips and continues deterministically. |
| `campaign.test.ts` | Autopilot plays 90 days: 419 jobs, $202k revenue (seed 2026), cash equals ledger throughout, revenue/expense stats tie to ledger categories, per-job revenue matches ledger postings, no stranded vehicles or dangling employee assignments. |

## Browser test (Playwright, production build, headless Chromium + SwiftShader)

`npm run build && npm run test:e2e` — **3 passed** (gameplay 6.9 min at ≈1 fps software-rendered; graphics 3.0 min at 1920×1080 and 2.0 min at 1366×768).

Two specs run. `graphics.spec.ts` (both viewports) checks the premium renderer: WebGL draw calls and triangles via the in-scene probe, the glTF van fetched and mounted with wheel/steer nodes, 32 merged houses, articulated workers, instanced vegetation layers, selection, routed driving whose rendered position follows the simulation with spinning wheels, the technician at the correct lot clear of the wall, diagnosis, payment and a clean console. `gameplay.spec.ts` performs the mandatory end-to-end flow through the real UI and verifies state through the `window.__ego` hook:

1. Start a new company (seed 42, $25,000 cash).
2. Receive a lead: pin visible over the house, inspector shows the customer.
3. Dispatch Unit 1 with the owner-technician.
4. Van follows a valid route: position changes, remaining distance shrinks, position stays within 6 m of a street centerline or inside the HQ lot, "En route · ETA" tag shown.
5. Technician on site: status `working`, standing more than 3 m from the van, kneeling at the condenser (screenshot `04`).
6. Three findings shown; correct diagnosis chosen.
7. Repair quoted and completed.
8. Cash increased; job ledger entries exist; HUD shows the new balance.
9. Technician hired from the market (celebration banner).
10. Second compact van bought on a loan (vehicle count 2, loan count 1, cash down).
11. New employee assigned to the new vehicle for a second call; Unit 1 stays parked.
12. Second job completed; employee XP > 0.
13. Employee enrolled in Electrical Diagnostics (status `training`, 2 days).
14. After 3 fast-forwarded days: diagnostic accuracy increased, certification "Electrical I" present, status idle.
15. Save (paused).
16. Reload the page and Continue.
17. Employees, vehicles, job statuses, ledger length, day and cash identical after reload; speed restored as paused.

Console errors: none. Two Three.js deprecation warnings (`THREE.Clock`, `PCFSoftShadowMap`) originate inside drei/three and are filtered.

Screenshots captured by the test are in `docs/screenshots/` (`00` menu … `13` after reload).

## Rendering review

Reviewed frames: overview, service call, van en route (follow camera), technician diagnosing, findings, two vans at HQ.

Fixed during review:
- drei `Html` labels never appeared (nested React root torn down under React 19.3) → replaced with a DOM label projector.
- React error #185 render loop from selectors returning fresh arrays → `useGame` recomputes only on simulation version change.
- Technician stood inside the wall on south-facing houses; condenser clipped the wall → per-style half-width placement.
- Premium house roof/entry intersection; HQ wordmark not visible from the street; oversaturated sand.

Premium graphics branch (`v3-premium-graphics`): the rendering review above describes the base build. The overhaul replaced the box houses, HQ, vehicles, characters and lighting; see `docs/graphics/GRAPHICS_OVERHAUL_REPORT.md` and the before/after frames in `docs/graphics/before/` and `docs/graphics/after/`.

Known rendering issues after the overhaul:
- Vehicles still start from parking stalls rather than inside the bay, and workers teleport into the van (the van hides them while driving).
- No LOD: all 32 houses render full detail at any distance; vegetation density is the only distance-cost lever.
- Evening lacks long shadows (shadow sun elevation is clamped at 3.4° against acne).
- Characters are procedurally articulated, not skinned.

## Performance measurements

Measured on the production build via the in-scene `RenderProbe` at 1920×1080, High preset:

| View | Build | Draw calls | Triangles | Textures |
| --- | --- | --- | --- | --- |
| Default overview | base (`4924436`) | 1,352 | 70,678 | 15 |
| Default overview | premium (`v3-premium-graphics`) | 515 | 622,248 | 42 |
| HQ close-up | base | 997 | 65,004 | 15 |
| HQ close-up | premium | 451 | 621,880 | 42 |

Draw calls fell by 62% because every house, road and HQ part is merged into one mesh per material and vegetation is instanced. Triangles rose about 9× (glTF vehicles at 6–7.5k each, explicit roofs, displaced terrain, 12 plant species); that is well inside any discrete GPU's budget, and the Low preset cuts vegetation to 35% density and turns shadows off. Asset load is 1.3–1.5 s for the four GLB vehicles (1.7 MB total). This container has no GPU: SwiftShader renders the premium scene at about 1 fps at 1080p (the base build measured ≈630 ms per frame, about 1.6 fps), so the 60 FPS target on a midrange GPU is **not measured here** and no FPS figure is claimed for real hardware.

Graphics settings (Low/Medium/High/Ultra) change DPR, shadow map size, vegetation density and rain density and are persisted.

## Known bugs and gaps

- Balance is first-pass; the autopilot ends day 90 with ≈$97k cash and 4.8 reputation with two technicians, which is probably too generous.
- Comfort advisors boost close rate passively; there is no in-home sales visit job yet.
- Lease buyout, breakdowns, sick days, leadership crew bonus and work-capacity overtime are not implemented (documented in `GAME_DESIGN.md` as planned).
- Sound toggle exists but no audio is implemented.
- Tutorial hints are text only; no interactive tutorial overlay.
