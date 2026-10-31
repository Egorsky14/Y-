# Cinematic Camera 2.0: acceptance fixes, verified on the deployed preview

**Build under test**

| | |
|---|---|
| Branch | `feature/v3-cinematic-camera` at `ba31190` |
| Deployment | Vercel Preview `dpl_5NfrQHBuWWn58wUnEZGeBr1bU8vd`, READY |
| URL | https://hvaccompanyownerv3-k52galdad-egorsky14s-projects.vercel.app (Vercel login) |
| Branch alias | `hvaccompanyownerv3-git-feature-v3-ci-a03612-egorsky14s-projects.vercel.app` |
| Compared with | the original acceptance at `bbc2558` (`docs/cinematic-camera/acceptance/REPORT.md`) |

**Deployed code is the tested code.** Vercel reports commit `ba31190`. The deployed main bundle is byte-identical to the build the tests ran on, apart from the commit SHA embedded in the credits. The CSS file is identical.

**Untouched:** production is still `dpl_7dnA27…` at `59dcce7`, and every earlier preview is still READY. Nothing was merged or promoted.

**Recommendation: FIX BEFORE MERGE.** The four major defects from the first acceptance are fixed on the deployed build. Two smaller failures remain, measured here, and are listed below:
- In Detail on landscape phones, the camera bar covers the technician's head.
- The planned settle into Watch Work is faster than the agreed 8 m/s on two scenarios.

They are small, targeted fixes. A manual playtest on a real phone is still required afterwards.

## Method

- **Scripted runs:** headless Chrome (GPU, ANGLE D3D11), one browser at a time, against the deployed URL through a Vercel share link (kept out of the repo).
  - The same 16 scenarios and the same script as the first acceptance: four houses × desktop 1920×1080, laptop 1366×768, phone portrait 390×844 and phone landscape 844×390.
  - The phones are Chrome emulation with touch events.
  - Plus 3 filmstrip runs (a frame every 0.5 s).
- **Results:** every run exited 0, with 0 page errors and 0 failed requests. Every model, texture and shader loaded in each of the 19 sessions; each run waits for the vehicle models before it starts.
- **Pixel masks:** 3 runs on a local `VITE_PROFILE=1` build of `ba31190`, which differs only by a debug handle. They give how much of the technician is on screen and how much is under UI. They also gave a new probe: whether the camera moved along its own line of sight after the player let go.
- **Before/after numbers:** `scripts/compare.cjs` applies the same definitions to both sets of metrics (`compare.txt`).

## Root causes and fixes

| Defect at `bbc2558` | Root cause | Fix |
|---|---|---|
| Walk-up: technician off-screen for about 6 s, camera still for 3–7 s, then a 15–60 m/s swoop, then stop-go every 1.07 s | Every walking framing failed composition: the group did not fit within 9 m, and a street-side camera counts as "behind" him. So `serviceViewCamera` fell back to the old fixed close-up of the unit. Once he was close the shot composed, which caused the swoop; then each 1.2 m step started a new eased 1.1 s flight. | A walking subject (him plus at most 4.5 m of the way ahead), followable from any side, up to 20 m. The parked van counts as an obstacle. A walk plan (`WalkPlan`/`walkPose`) slides the view with him and over his last 5 m turns it into the Watch Work shot. CameraRig eases toward the plan every frame. The plan is chosen so it sees him at 7 points along the walk. Before he steps out, the van door stands in for him. |
| Camera bar covers Finances (81 px) and Overview (28 px) at 1366 px | The bar was centred in the bottom row, which has no room for it below about 1550 px. | Between 901 and 1560 px wide, the bar sits above the bottom row, and the hint and error banner move up above it. |
| Landscape Property falls back to the old camera (2 of 4 houses) | On a short screen the group only fits from 75–90 m away, beyond the 60 m limit. | A retry with distances up to 90 m and lower elevations before any fallback. Composed on all 32 houses in unit tests. |
| Collapsed card over the head (landscape) | The measured free area treated a collapsed card as taking no space. | A card reaching deep into a short landscape screen now counts its width as covered. Elsewhere the card and the top camera bar are rectangles the head and workspace keep out from under. On landscape, toasts stack below the card. |
| Camera moved itself after orbit or zoom (24 of 64 actions, up to 19.5 m) | The older "move to a clear view" rule kept running under the service camera. | With the service camera on, it only moves a camera left inside solid geometry, and only closer along the same line. |
| Pinch-in put the camera inside the technician | The zoom limit was measured to a ground point, not to him. | Zoom stops 0.95 m from his body and 0.35 m from the cabinet, pushed back along the line of sight. |

Files changed since `bbc2558`: 869 lines added, 78 removed, across 11 files:
- `src/world/scene/serviceCall.ts`, `ServiceDirector.tsx`, `CameraRig.tsx`, `cameraComposition.ts`, `cameraOcclusion.ts`
- `src/ui/safeArea.ts`, `styles.css`
- `src/app/store.ts` (camera command type only)
- `src/tests/cameraComposition.test.ts`
- `e2e/service-camera.spec.ts` (new), `playwright.config.ts`

No gameplay, economy, save-game, headquarters or vehicle asset code was touched.

## Before and after, deployed preview (16 scenarios)

| Measure (same definitions both times) | `bbc2558` | `ba31190` |
|---|---|---|
| Walk-up framings without a composed shot | 5–8 per run, all 16 runs | **0 in all 16** |
| Re-aims while he walks | 11 per run | **0 in all 16** |
| Fastest camera step while he walks | 18–61 m/s | **2.1–9.5 m/s** (two runs above 8, see F-B) |
| Longest camera stop while he walks | 4.2–7.5 s | 0.2–0.4 s; 2.0–2.1 s on the tutorial house (see note) |
| Property composed | 14/16 (landscape `a-s-2` and `n-o-1` fell back) | **16/16** |
| Camera bar overlapping another control | 4/4 laptop runs (action bar and world controls) | **0/16** |
| Camera moved by itself more than 0.3 m within 10 s of player input | 24/64 actions, up to 19.1 m | **2/64**, both landscape `c-n-4`, 1.4 and 2.7 m along the line of sight (see F-C) |
| Closest pinch-zoom to the technician (portrait) | 0.46–0.68 m (inside him) | **1.70–1.76 m** |
| Mode-switch frames over 50 ms | 0 desktop, 2–3 per screen elsewhere | 0 on every screen (headless) |

**Note on the 2 s stop:** it falls 1.4–3.5 s after pressing Watch, on the tutorial house only. The van takes longer to park there, so he is still inside the van and the camera is waiting on the door. In the first acceptance his first follow framing on this house came at 3.5 s, which matches.

**Pixel masks (local profiling build of `ba31190`):**

| Shot | Technician visible | Technician under UI | Before |
|---|---|---|---|
| Watch Work | 90–98% | 0–2.6% | 3.9–6.3% under UI on landscape |
| Property, landscape `n-o-1` | 106% (masking error on a tiny figure: fully visible) | — | 63% visible |
| Detail, landscape | 91–97% | **8–23%** | 5–8% (see F-A) |

## Acceptance matrix

| Criterion | Result | Evidence |
|---|---|---|
| Technician visible throughout the walk-up | **PASS** desktop, laptop, portrait. **PASS with limitation** landscape | Filmstrips `sheets/strip-desktop-n-o-1-walk.jpg` and `strip-landscape-n-o-1-walk.jpg`; 0 uncomposed framings and 0 re-aims in 16/16 runs. On landscape he is small (the free area beside the card is small), and a palm trunk passes in front of the view for about 2 s. |
| Continuous follow, no stop-and-go | **PASS** | No stops while he walks; no re-aims |
| No sudden movement spikes | **FAIL (minor)** | 14/16 runs peak at or below 7.4 m/s. Portrait `c-n-4` peaks at 8.5 and landscape `n-o-1` at 9.5 m/s, during the planned settle into Watch Work over his last 2 s. It is a smooth ramp, not a snap, but above the 8 m/s ceiling (F-B). |
| Natural transition into Watch Work on arrival | **PASS** | The plan ends on the Watch Work shot (26 or more of 32 houses per screen in unit tests); the arrival flight is small. |
| Player control has priority, no automatic re-framing | **PASS** for re-framing. **NOT VERIFIED** for two corrections | No director re-frame after input in any run. Two dolly corrections on landscape `c-n-4` came from the inside-solid-geometry exception. Whether the camera was really inside geometry, rather than inside a deliberately oversized crown or wall box, needs a person to look (F-C). |
| Zoom never enters the technician or cabinet | **PASS** | Closest 1.70 m. Limitation: on portrait `a-s-2` the closest pinch view shows the wall and window above the unit, not the work. |
| Laptop 1366×768 controls | **PASS** | No overlap. Every bar and bottom-row button is the topmost element at its centre (browser spec, 5 projects). |
| Landscape Property | **PASS** | Composed 4/4; technician fully visible |
| Inspector overlap, Watch Work | **PASS** | 0–2.6% of the technician under UI |
| Inspector and UI overlap, Detail on landscape | **FAIL** | 18–23% (`c-n-4`) and 8–12% (`n-o-1`) of the technician under the camera bar, with his head under it (`after/landscape/c-n-4-detail.jpg`) (F-A) |
| Toasts out of the shot (landscape) | **PASS** | Toasts in the bottom-right strip beside the card |
| Diagnosis and repair sequences | **PASS** | 16/16, repair reached in every run |
| Assets and errors on the deployed build | **PASS** | 0 failed requests, 0 errors, 19 sessions |
| Performance during mode switching | **PASS** desktop; **NOT VERIFIED** phones | Headless: no frame over 50 ms. Worst framing solve rose to about 40 ms (planning a walk, once per walk-up). |
| Real phone touch, feel and performance | **NOT VERIFIED** | Emulation only |

## Remaining failures

- **F-A · Detail on landscape phones: the camera bar covers the head.**
  - The bar check uses a head point 1.18 m up. Kneeling and leaning in, his cap reaches higher, under the bar.
  - Fix: use a head-top point with a margin of about 0.3 m for the UI check, or count the camera bar in the top inset on short screens.
- **F-B · The settle into Watch Work peaks at 8.5–9.5 m/s on two scenarios.**
  - The turn is squeezed into his last 5 m (about 3 s).
  - Fix: settle over a longer stretch (about 8 m), or cap the plan's camera speed.
- **F-C · Two dolly corrections after player input on landscape `c-n-4` (1.4 and 2.7 m).**
  - This is the permitted inside-solid-geometry rule, but the obstacle boxes are conservative.
  - Review visually. If the camera was not really inside anything, test with tight boxes or skip plants for this rule.

## Changed test tolerances

These are separate from real improvements; every one is listed here.

- **Walk-up speed ceiling in `e2e/service-camera.spec.ts`:** raised from 4 to 8 m/s when the planned settle was added. Four was my own first threshold; the original acceptance had none, and the swoops measured 15–61 m/s. A no-jerk check (speed change under 3 m/s between 0.25 s steps) and a no-re-aim check were added at the same time.
- **Drift after an orbit, same spec:** loosened from 0.05 to 0.15 m. The zoom clearance can nudge the camera by one 5 cm step. The original drifts were 0.5–19.5 m.
- **Walk-plan unit test:** allows one house per screen to lose him, and only over the first 37% of the walk. This is `n-o-1` on the 750×340 phone, where no plan sees him everywhere.
- **What the follow check tolerates (design, not just tests):**
  - It ignores the camera brushing a plant's clearance, and one key point hidden on its own.
  - It re-aims only after two misses in a row.
  - It never re-aims during the last metre before he kneels, or over a stretch the plan knowingly gives up beside the van.
  - Fewer re-aims is the goal, but it means brief partial occlusions are accepted.
- **Unchanged:** the acceptance measurements in this report (`compare.cjs`, the masks) use the same definitions for before and after.

## Remaining visual limitations

- On landscape phones the walking figure is small, and the shot is centred in the narrow part beside the card.
- A trunk or post may cross the view for a moment while following him (parallax).
- The Property shot keeps the technician tiny, by design.
- Detail on landscape is low, about 7° up, on `n-o-1`.
- The closest portrait pinch-zoom on `a-s-2` frames the wall above the unit.

## Tests on `ba31190`

| Check | Result |
|---|---|
| TypeScript | pass |
| Lint | pass |
| Build | pass |
| Unit tests | 183 passed, 6 skipped, 0 failed (two workers). With full parallelism, `hinterland.test.ts` times out at its 5 s limit. It does the same on the untouched `bbc2558`, and passes alone. |
| Browser matrix (`browser-matrix.txt`, one worker, foreground) | 21/21 existing cases, 5/5 new service-camera cases, plus 2 repeat desktop runs |

## Evidence

- `after/` (16 runs: metrics; screenshots are local only) and `after/sheets/`: one contact sheet per screen and house.
- `sheets/strip-*`: walk-up and control filmstrips from the deployed preview.
- `mask/`: pixel-mask runs.
- `compare.txt`: before and after numbers.
- `runs.txt`, `browser-matrix.txt`.
