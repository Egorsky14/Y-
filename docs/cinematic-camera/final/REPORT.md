# Cinematic Camera 2.0: final acceptance correction

**Builds under test**

| | |
|---|---|
| Branch | `feature/v3-cinematic-camera` |
| Final preview | `dpl_GW6ie2MoFJhL7cJNn9DmKy8b6BPq` at `8d962b6`, READY, target preview: https://hvaccompanyownerv3-qarmvysc7-egorsky14s-projects.vercel.app (Vercel login) |
| Full 16-scenario run | `dpl_EMLbpArnftMjj9t812UhchwjZJpB` at `9e0f297`, READY: https://hvaccompanyownerv3-ndhbqjiiy-egorsky14s-projects.vercel.app |
| Compared with | `ba31190` (`docs/cinematic-camera/fixes/REPORT.md`) and the original `bbc2558` (`docs/cinematic-camera/acceptance/REPORT.md`) |

`8d962b6` differs from `9e0f297` only in the order of two checks that must both pass when a walk-up is planned. The chosen shots are the same (checked on 9 lots and screens); planning is faster. The full matrix ran on `9e0f297`; the four scenarios with the slowest planning were re-run on `8d962b6`.

**Deployed code is the tested code.** Vercel reports `9e0f297` and `8d962b6` respectively. On each, the stylesheet and four of the five scripts are byte-identical to the local build the browser tests ran on. The main script differs only in the commit label shown in the credits.

**Untouched:** production (`59dcce7`) and every earlier preview. Nothing was merged or promoted.

**Recommendation: READY FOR MANUAL PLAYTEST.**
- Both remaining failures are fixed on the deployed build: the camera bar over his head in landscape Detail, and the 8.5–9.5 m/s settle.
- The two automatic moves are explained. One was an unwanted override and is gone; the other is a needed correction and is kept, smaller.
- What remains is listed under limitations. Real-phone feel and performance still need a person on a device.
- This is not a production sign-off.

## Root causes and fixes

| Problem at `ba31190` | Root cause | Fix |
|---|---|---|
| Landscape Detail: 18–23% (c-n-4) and 8–12% (n-o-1) of him under the camera bar, head included | (1) The close shots modelled his kneeling head 0.3–0.4 m too low and over his feet. From the rig (`Worker.tsx`: pelvis 0.57 m, torso leaned 0.38 rad) the cap is at about 1.52 m, leaning 0.34 m toward the unit; the camera used 1.18 m. (2) On short landscape screens the bar under the HUD covered most of the free width above 29% of the height, where his head is. | (1) The real head point is now framed and kept clear of controls, plus a point where his head goes when he stands up to read the gauges (`serviceCall.ts` `KNEEL_HEAD`, `RISEN_HEAD`, `Subject.clear`). (2) On short landscape screens the bar moves to the bottom-right corner, in the card's column that the shot already avoids, level with the action bar, so the shot loses no height. The open inspector ends above it; toasts stack above it, one at a time on the 340 px screen. |
| Settle into Watch Work at 8.5–9.5 m/s | The turn into the end shot was always squeezed into his last 5 m, however far the camera had to travel. A 15–20 m walking shot turning into a 5–7 m close shot then peaks at 1.5 × 1.5 m/s × 20/5 ≈ 9 m/s. | The settle length follows the camera's travel: at least 5 m, otherwise travel ÷ 1.6, never longer than the walk (`settleOf`). Plans are now also checked all along his real path, keeping 0.3 m clear of every obstacle box, not only at the 7 look-ahead points. The longer settle had exposed a plan that cut through a plant. |
| Two moves after player input on landscape c-n-4 (1.4 m, 2.7 m) | Both started inside the same mesquite's crown box (4.3 × 4.3 m, 1.98–4.77 m up). The crown is drawn with front faces only, so a camera inside its box often sees clearly. The filmstrip of the orbit case shows a clear view; the move made the shot worse. The zoom-out case was deep inside the foliage. | Walls, roofs, trunks and poles keep the rule. For a crown, the camera slides closer only when drawn foliage beyond the near plane lies between the lens and the work. This is tested with a raycast against the vegetation meshes, after refreshing the tree layers' stale bounds. |
| Portrait pinch after an orbit ends facing the wall and window | The orbit pivot is a ground point behind the work. After an orbit, the zoom line passes beside him, and on portrait's narrow view he leaves the frame. | While the service camera is on, each zoom-in step also moves pivot and camera toward the ground under the work by the share of distance the zoom took. The work keeps its place on screen, and a later orbit turns around it. Zoom-out, orbit and pan are unchanged. |
| Camera bar overlapped the open inspector at 1024×768 (28×50 px) | Present since `ba31190`; caught by a new browser check with the card open. | From 901 to 1560 px wide, with the inspector open, the bar centres in the space left of the panel. |

Files changed since `ba31190` (`9e0f297`, `8d962b6`):
- `src/world/scene/serviceCall.ts`, `CameraRig.tsx`, `cameraComposition.ts`
- `src/ui/styles.css`
- `src/tests/cameraComposition.test.ts`, `e2e/service-camera.spec.ts`

No gameplay, economy, save, headquarters, vehicle or scenery code was changed. The other camera modes are untouched: free play, follow-truck, HQ and photo mode. The only shared code touched is the after-input correction, which runs only while the service camera is on.

## Before and after on the deployed previews (same definitions; `compare-*.txt`)

| Measure | `bbc2558` | `ba31190` | `9e0f297` (16 runs) |
|---|---|---|---|
| Fastest camera step while he walks | 18–61 m/s | 2.1–9.5 m/s | **1.9–4.5 m/s** (landscape c-n-4 4.5, portrait a-s-2 4.0, all others ≤ 3.9) |
| Longest stop while he walks | 4.2–7.5 s | 0.2–0.4 s (2.0 s waiting for him at the van, c-n-4) | 0.2–0.4 s (the same 2.0 s on c-n-4) |
| Walking framings not composed / re-aims | 5–8 / 11 per run | 0 / 0 | **0 / 0** |
| Property composed | 14/16 | 16/16 | 16/16 |
| Camera bar overlapping a control | 4/16 | 0/16 | 0/16, and 0 with the inspector open (new check) |
| Moved by itself > 0.3 m within 10 s of input | 24/64 (up to 19 m) | 2/64 (1.4 m, 2.7 m) | **1/64: 0.35 m**, landscape c-n-4 zoom-out, leaves hiding the work (`sheets/strip-landscape-c-n-4-zoom.jpg`) |
| Closest pinch, portrait | 0.46–0.68 m (inside him) | 1.70–1.76 m, a-s-2 facing the wall | 1.95–2.07 m, on the equipment |
| Errors / failed requests | 0 / 0 | 0 / 0 | 0 / 0 |

**Pixel masks: share of the technician under UI.** Local `VITE_PROFILE=1` builds of each commit, which differ only by a debug handle:

| Shot | `ba31190` | `9e0f297` |
|---|---|---|
| Detail, landscape c-n-4 (diagnosis / repair) | 18.4% / 22.6% | **0.0% / 0.0%** |
| Detail, landscape n-o-1 | 7.8% / 11.6% | **0.0% / 0.0%** |
| Detail, desktop n-o-1 | 1.8% / 2.5% | 0.0% / 0.0% |
| Detail, portrait a-s-2 | (not masked) | 0.0% / 0.0% |
| Watch Work, landscape c-n-4 | 2.6% | 0.0% |
| Detail angle, landscape n-o-1 | 7.1° | 17.6° |

Technician visible in close shots: 87–98% on both builds; the rest is hidden by the cabinet he works behind.

**Walk-up camera speed, simulated over every house** (unit test: his path at walking pace, the camera eased as CameraRig does): at most 4.84 m/s on all 32 lots × 5 screens. Before this fix the same simulation gave up to 10.99 m/s.

## Acceptance matrix

| Criterion | Result | Evidence |
|---|---|---|
| Landscape Detail: head and body clear of the camera controls | **PASS** | 0.0% under UI (masks), 750×340 and 844×390 in unit tests, 844×390 deployed (`after/sheets/landscape-*.jpg`) |
| Hands, gauges, tools, condenser and panel visible in Detail | **PASS**, with a limitation | All in frame on every lot; on landscape the shot is wider than before (see limitations) |
| Camera bar reachable; no overlap with inspector, action bar or toasts | **PASS** | Topmost-element and overlap checks, card collapsed and open, 5 browser projects |
| His head clear of controls when he stands up at the unit | **PASS** (geometry) | Unit test on every lot and screen; not captured as a still |
| Walk-up speed ≤ 8 m/s, smooth, no stop-and-go | **PASS** | Peak 4.5 m/s deployed; speed change < 3 m/s per 0.25 s step; no stop over 0.4 s apart from the c-n-4 van wait |
| Natural arrival into Watch Work | **PASS** | ≥ 26 of 32 walks end exactly as Watch Work (unit test); no re-aim in 16 runs |
| Collision protection kept | **PASS** | Planned camera never inside scenery along his path (new unit test); the inside-geometry rule kept for walls, roofs, trunks, poles and foliage that hides the work |
| No camera override of player input | **PASS** | 63/64 actions: 0 m; 1/64: the necessary 0.35 m foliage correction (filmstrip) |
| Zoom never enters him or the cabinet; zoom-in ends on the work | **PASS**, with a limitation | Closest 1.95 m portrait; ends on the equipment |
| Landscape walk-up: palm trunk | **PASS**, with a limitation | He stays to the right of the trunk and is never covered (`sheets/strip-landscape-n-o-1-walk.jpg`) |
| Diagnosis and repair sequences, assets, errors | **PASS** | 16/16 reached repair; 0 errors, 0 failed requests |
| Frame pacing at mode switches | **PASS** desktop/laptop; phones **NOT VERIFIED** | Headless: 10 frames over 50 ms across 16 runs, 9 at the Watch press (planning) and 1 at a portrait pinch; `ba31190`: 9 (8 at the Watch press, 1 at the repair phase). All ≤ 100 ms |
| Real phone touch, feel and performance | **NOT VERIFIED** | Emulation only |
| Portrait: no drift after the two-finger gesture | **NOT VERIFIED** | 0.03–0.07 m over 9 s in 5 browser runs (iPhone 14 portrait, 390×664); 0.000 m in the 390×844 acceptance runs and on every other project; cause not found |

## Test results

| Check | Result |
|---|---|
| Typecheck (`npm run typecheck`, `tsc -b`) | pass |
| Lint | pass |
| Build | pass |
| Unit tests (2 workers) | 193 passed, 6 skipped (the same 6 as before), 0 failed; `cameraComposition.test.ts` has 50 tests (40 before) |
| Existing browser matrix, one worker | **21/21** passed |
| Service-camera spec, 5 projects | **5/5** with the final spec, plus 2 desktop and 3 portrait repeats. Every failure along the way is listed in `browser-matrix.txt`: one stale-build run, the 1024 overlap, the landscape re-aim and one portrait drift of 0.074 m. All were fixed or handled as described. |
| Deployed acceptance | 16/16 scenarios exit 0 on `9e0f297`; 4/4 re-run on `8d962b6`; 4 filmstrip runs; 4 mask runs on a local profiling build |

## Changed test thresholds

| Test | Previous | New | Reason and measurements | Better behaviour or relaxed? |
|---|---|---|---|---|
| e2e walk-up: fastest 0.25 s camera step | 8 m/s (`ba31190`) | **4 m/s** | Restores my original limit. Measured 1.6–3.0 m/s in the browser runs. | **Better behaviour; tightened** |
| e2e: drift after an orbit | 0.15 m (`ba31190`) | 0.15 m | I tried 0.05 m. It failed on the upright phone: 0.031, 0.045, 0.044, 0.073 and 0.074 m in five runs, against 0.000 m on every other project. | **Unchanged**; the tightening failed |
| Unit: Watch Work fills more than the old close-up | 1.5× | **1.4×** | Both sides are scored against the same subject, which now carries his real head height. With the old, too-low head point the ratio is 1.51×; with the real head it is 1.45×. | **Relaxed**, because the measurement changed, not the shots |
| Unit: Detail stays a close-up | (no limit) | at most 3 lots shown as Watch Work, on 750×340 only | New test. On the 340 px screen, a close-up at its farthest (5 m) cannot keep his standing head clear on a-s-3, b-n-4 and n-o-2 (diagnosis), so it falls back to Watch Work as designed. | New allowance; documented |
| Unit: landscape screen definitions | top 0.2, bar rectangle in `avoid` | top 64 px, no bar rectangle | Matches the new layout as measured in the browser: bar at [565, 332, 271×50], expanded panel ends at y 326. | Layout change |
| e2e: collapsed card avoided | a rectangle in `avoid` | a rectangle **or** the card's width counted (`right` > 0) | On landscape the card has always been handled by `right`. The old check passed there only because the bar's own rectangle was in `avoid`. | Equivalent; not relaxed |
| New checks | — | head clear kneeling and standing; walk-up ≤ 5 m/s (simulated); camera never inside scenery on the walk; bar outside the shot on landscape; bar layout with the card open | — | Added |

## Remaining limitations

- **Landscape Detail is wider than before.** It frames from about 4.8 m, against Watch Work's 5.7 m, because his real head height must fit below the HUD on a 390 px tall screen. Hands, gauges, tools and panel are visible but smaller.
- **750×340:** Detail shows Watch Work on 3 of 32 lots in diagnosis (above).
- **Standing up in Detail:** while he stands to read the gauges (about 2.6 s of each 12 s loop), the tip of his cap can reach the HUD's lower edge on desktop, laptop and landscape. His face stays in the free area.
- **Closest pinch after orbiting behind the unit:** the cabinet fills the frame and he is behind it. That follows from the angle the player chose; the zoom stops 2.5 m from the work.
- **Zoom-out into a tree:** after the 0.35 m slide the work is visible, but one branch still crosses the frame.
- **Landscape palm house:** the palm trunk is in the frame for the first metres of the walk (beside him, never over him), and a house corner enters on the left over his last metres.
- **Walk-up planning cost:** up to 47–56 ms on the longest walks on `8d962b6` (41 ms worst at `ba31190`), once, at the Watch press. On phones this is NOT VERIFIED.
- **Upright phone:** 3–7 cm of drift after the two-finger gesture in browser tests, cause not found (above).
- **Pre-existing, unchanged:** on landscape the milestone celebration overlaps the job card for a moment (same in `ba31190`). The first walking still catches him stepping out of the van, partly hidden by it, on both builds.
- **Not tested here:** real devices.

## Evidence (this folder)

- **Screenshots:** `after/sheets/*.jpg`, 16 contact sheets from the `9e0f297` preview. Raw screenshots stay local.
- **Filmstrips:** `sheets/strip-*.jpg`, walk-ups (desktop and landscape n-o-1), landscape c-n-4 orbit and zoom, portrait a-s-2 orbit and zoom, landscape n-o-1 zoom.
- **Metrics:** `after/*/*-metrics.json` (16 runs), `after-8d962b6/` (4 runs), `mask/` (4 profiling runs).
- **Comparisons:** `compare-ba31190-vs-9e0f297.txt`, `compare-bbc2558-vs-9e0f297.txt`.
- **Logs:** `runs.txt`, `browser-matrix.txt`, `fail-*.log`.
- **Earlier evidence is kept:** `../acceptance/` (`bbc2558`) and `../fixes/` (`ba31190`).
