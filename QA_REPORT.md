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

`npm run build && npm run test:e2e` — **1 passed** (≈3 min at software-rendered 2–3 fps).

The single spec performs the mandatory end-to-end flow through the real UI and verifies state through the `window.__ego` hook:

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

Known rendering issues:
- HQ grounds are still sparse at a distance (gravel texture reads flat from the default camera height).
- HQ bay doors roll up while a truck moves inside the lot (screenshot `14`), but vehicles still start from parking stalls rather than inside the bay, and workers teleport into the van (the van hides them while driving).
- The Sky shader and fog give a slightly washed horizon on software GL; on a GPU with 4k shadows the scene is crisper.
- No LOD yet: all 32 houses render full detail at any distance.

## Performance measurements

Measured on the production build via the in-scene `RenderProbe` at 1920×1080:

| View | Draw calls | Triangles | Geometries | Textures |
| --- | --- | --- | --- | --- |
| Default overview | 1,352 | 70,678 | 1,025 | 15 |
| HQ close-up | 997 | 65,004 | 1,027 | 15 |

(Windows were merged into single textured planes after a first measurement of 1,471 / 1,052 calls.) JS heap after load: 39 MB. Frame time in the CI container (SwiftShader software rasterizer): ≈630 ms at 1080p with 4k shadows; ≈400 ms at 1600×900. This container has no GPU, so the 60 FPS target on a midrange GPU is **not measured here**. The triangle count is trivial for any discrete GPU; draw calls (~1.5k, dominated by per-mesh house parts) are the metric to reduce first (merge static house geometry, drop the per-window frame mesh) if a real machine falls short.

Graphics settings (Low/Medium/High) change DPR (1 / 1.25 / 1.75) and shadow map size (none / 2k / 4k) and are persisted.

## Known bugs and gaps

- Balance is first-pass; the autopilot ends day 90 with ≈$97k cash and 4.8 reputation with two technicians, which is probably too generous.
- Comfort advisors boost close rate passively; there is no in-home sales visit job yet.
- Lease buyout, breakdowns, sick days, leadership crew bonus and work-capacity overtime are not implemented (documented in `GAME_DESIGN.md` as planned).
- Sound toggle exists but no audio is implemented.
- Tutorial hints are text only; no interactive tutorial overlay.
