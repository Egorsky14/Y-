# Cinematic Service Camera 2.0

Branch `feature/v3-cinematic-camera`, started from `feature/v3-visual-quality-pass` at `36d8841`.
Local only: nothing pushed, merged or deployed.

## What the playtest showed, and what changed

| Playtest problem | Cause | Now |
|---|---|---|
| Roof, house wall, plants or empty yard fill the shot; technician and unit small | The occlusion solver accepted any view whose sight lines reached the work. Nothing measured how big the work was on screen, or what else filled the frame. | Every candidate view is scored as a frame. The distance is fitted so the work fills a set share of the free screen. A 9 × 7 grid of sight rays measures roof, near wall, plant, pole, sky and foreground clutter. |
| Trees and utility poles across the composition | Only house parts were camera obstacles. | Trunks, crowns, palms, shrubs, street lights and sign posts are obstacles too. They come from the same placement lists the renderer uses, bucketed on a 16 m grid. |
| Technically clear but artistically poor views | No notion of angle quality. | Low or moderate height (about 16–25°). The camera sees the technician side-on, never from more than 135° behind him. The hands, panel and unit top must be in plain sight, and the cabinet itself can hide the hands. |
| Inspector panel eats the scene | The panel stayed open beside the close-up. | "Watch technician" collapses the panel to its header on desktop too. The header says when a diagnosis or quote is waiting. The shot is recomposed whenever the panel opens, collapses or resizes. |
| Selected job panel prominent in the city overview | It stayed fully open. | The Overview button collapses an open job panel to its header. ▾ expands it again. |

## The three modes

A camera bar appears while the service camera is on: Property · Watch work · Detail · ✕ (leave). It sits at the bottom centre on desktop and under the HUD on phones.

- **Property** is the establishing shot: house, van at the curb, unit and technician together. It is framed from the street side and fitted to the free screen, at about 29–44°.
- **Watch Work** is what "Watch technician" opens. The technician and unit fill about 55% of the free screen on desktop and 69% on upright phones, side-on, at about 18–25°.
- **Detail** depends on the job phase:
  - Diagnosis: hands, meter and leads, gauge hoses down to the service valves, and the panel.
  - Repair: hands, the tool on the cabinet's near top edge, and the panel.
  - His head always stays in frame.
  - If no close-up shows the hands and panel in plain sight, Detail is not used and the camera shows Watch Work. While he is still walking up, Detail waits as Watch Work.

## Camera behaviour (ServiceDirector)

- **When it reframes.** Only when something the shot depends on changes:
  - the mode;
  - the job phase (arrival, diagnosis, repair; back to Property once the job is done);
  - the free screen area;
  - the technician walking up to the unit. He is followed on a steady heading every 1.2 m, then fully reframed once he kneels.
- **Transitions.** Every change is an orbit flight, the existing CameraRig flight, with no cuts. Follow updates keep their heading: at most a 0.6 rad turn per update, which a test checks.
- **Never fights the player.**
  - It never reframes during a drag.
  - It holds off for 8 s after any drag, zoom or key.
  - Panning away from the site, or any other camera command (Overview, HQ, follow truck, show on map), ends the service view. After that nothing is forced again.
- **Zoom and tilt limits.** Free-play limits (5 m, 20°) relax only while the service camera is on. They tighten back gradually as the player zooms out, so leaving a close-up never jumps.
- **Settle after orbiting.** The Visual Quality Pass rule that eases a hand-orbited view back to a clear angle once, if it is blocked, is kept. In the captures it moved the camera 0.28–0.32 m on 5 of 9 lots after a short orbit.
- **Measured in captures:**
  - Drift after leaving the service camera and then expanding the panel: 0 on all 9 lots.
  - Solve time per framing: 1–19 ms in the browser.
  - Obstacle index: built once in 16 ms; each query takes about 0.007 ms.

## Visual evidence

`docs/cinematic-camera/compare/` holds 18 sheets: 9 lots × desktop 1920×1080 and phone 390×844. Each sheet has the previous build on top and this one below. The columns are the same moment of the same job: Property, Watch work, Watch work with the inspector open (desktop), Detail during diagnosis, Detail during repair. The raw shots are in `before/`, `after/`, `before-390/` and `after-390/`. Every shot has a `<lot>-metrics.json` holding the camera pose and the composition report.

| Lot | Style | Why it is in the set |
|---|---|---|
| c-n-4 | ranch | tutorial property, seed 42 |
| a-n-2 | two-story | |
| a-s-2 | premium | garden wall across the old foreground |
| b-n-2 | spanish | |
| a-n-4 | modern | |
| n-o-1 | premium | palm trunk and garden wall in the old shot |
| s-o-4 | spanish | yard plants; was framed from behind until the 135° rule |
| c-s-1 | spanish | old close-up camera stood inside a plant |
| a-s-1 | modern | street pole near the work |

All 9 sheets of each kind were reviewed. Findings, and the fixes they led to:

- **Detail too tight, hands hidden.** The first Detail framing cut the head under the HUD, and the cabinet hid the hands. Fix: the cabinet became an obstacle that can hide the hands, and the Detail fill went from 0.78 to 0.68.
- **Upright phones under-filled.** The work filled the width only. Fix: Watch Work fill is 1.25× on upright phones.
- **Van under the action bar.** Fix: the desktop action bar, world controls and camera bar now count as covered screen.
- **Shot from behind on s-o-4.** Fix: Watch Work views more than 135° behind the technician are rejected.
- **Fallback on s-o-4.** In a narrow side yard the fitted distance landed the camera inside a wall's clearance, so the game fell back to the old close-up. Fix: the solver tries 0.85×, 1.2× and 1.45× of the fitted distance. All 36 final close shots are composed, with no fallback.

Composition in game, final captures (`after*/<lot>-metrics.json`):

| | Property | Watch Work | Detail (diagnosis and repair) |
|---|---|---|---|
| Fill, desktop | 0.75–0.87 | 0.55–0.57 | 0.68–0.69 |
| Fill, phone | 0.78–0.84 | 0.69–0.70 | 0.68–0.73 |
| Roof share | 0.00–0.19 (it is the house) | 0.00 | 0.00 |
| Plant share | 0.08–0.17 | 0.00–0.05 | 0.00–0.03 |
| Foreground clutter | 0.02–0.10 | 0.00 | 0.00 |
| Elevation | 29–44° | 18–25° | 11–23° |
| Side angle from his facing | — | 88–122° | 84–123° |

Across all 32 house lots, the old close-up against the new Watch Work, scored by the same rules on desktop (`all-lots-watch-work.txt`):

| | Old close-up | New Watch Work |
|---|---|---|
| Average fill | 0.33 | 0.55 |
| Average foreground clutter | 0.21 | 0.00 |
| Unusable views | 1 (c-s-1: camera inside a plant's clearance) | 0 |
| Fails "panel in plain sight" | all 31 others (seen edge-on in near profile) | 0 |

## Performance

GPU time per frame, median, using the Visual Quality Pass method and views (`perf-runs/summary.txt`). Desktop is one run per build. Phone is the average of two runs per build. Measured at `5db01c0`; the later distance fallback only changes service shots.

| View | Base ms | New ms | Change | Draw calls | Triangles |
|---|---|---|---|---|---|
| Desktop overview | 6.92 | 7.02 | +1.4% | same | same |
| Desktop NE boundary | 4.72 | 4.80 | +1.7% | same | same |
| Desktop SW boundary | 4.35 | 4.32 | −0.7% | same | same |
| Desktop street | 6.13 | 6.14 | +0.2% | same | same |
| Desktop HQ | 6.55 | 6.59 | +0.6% | same | same |
| Desktop golden hour | 6.61 | 6.60 | −0.2% | same | same |
| Desktop night | 6.77 | 6.77 | 0.0% | same | same |
| Phone overview | 3.53 | 3.54 | +0.1% | same | same |
| Phone street | 2.79 | 2.83 | +1.4% | same | same |
| Desktop diagnosis close-up* | 5.03 | 5.34 | +6.2% | 518 → 516 | −0.6% |
| Desktop repair close-up* | 4.92 | 5.16 | +4.9% | 508 → 504 | −0.4% |

\* Not like-for-like: the in-game Watch Work camera is now closer, so the work fills more pixels.

Every fixed view renders the same frame as before (same draw calls and triangles), within ±2% GPU time. The first comparison caught a regression: after a close-up, a scripted street view was framed lower than before (phone street +6%, more sky). Camera commands other than the service camera now keep to the free-play limits, as before, and the view matches exactly.

CPU cost is confined to the moments a view is framed: 1–19 ms per solve, about 7 ms typical, plus a once-per-0.25 s check of the job phase, the free area and the technician's position.

## Tests

| Check | Result |
|---|---|
| TypeScript (`tsc -b`) | pass |
| Lint (`npm run lint`) | pass |
| Production build (`npm run build`) | pass |
| Unit tests (`vitest run`) | 166 passed, 6 skipped, 0 failed. The skips are 3 developer probes (run only with `PROBE=<file>`) and the 3 optional scenario tests that were already skipped before. |
| Browser matrix on the final code (`browser-matrix.txt`, one worker, foreground, one case at a time) | 21/21 passed, every case exit 0, no leftover browsers |

New unit tests are in `src/tests/cameraComposition.test.ts` (23 tests):
- Watch Work on all 32 lots × 5 screen layouts: fill, centring, roof, foreground, plant and pole limits, height, side angle, distance.
- Detail on all lots for diagnosis and repair, desktop and phone. Detail waits as Watch Work while he walks up, and diagnosis and repair frame different things.
- Property on all lots.
- Old against new close-up.
- A roof-dominated view loses to the composed shot.
- Heading kept while following.
- Recomposition for the inspector.
- Obstacles: present near the work, a camera inside a tree is rejected, and no composed camera stands inside an obstacle.
- Determinism, and solve time (close-up under 30 ms, property under 80 ms in node).

Browser tests updated:
- `gameplay.spec.ts`: Watch technician collapses the panel and shows the bar. It checks the framing report (fill above 0.45, no foreground, no roof) and the camera distance and height, switches Detail → Property → Watch work, then expands the panel from the "Diagnosis ready" notice to diagnose.
- `mobile.spec.ts`, upright phones: the bar is on screen and finger-sized (layout audit), Detail by tap, then the collapse and expand of the sheet as before.

## Not changed

Dispatch, technician movement and timing, diagnosis, repair, quoting, pricing, warranties, banking, the Automatic Operations Center, the Supply Depot, save and load, and touch controls. The browser matrix covers each.

## Known issues

- On most lots the background behind a close shot is still the house wall, about 40–48% of the sight rays. The unit stands against it, and from a side-on angle there is no wall-free view that also shows the panel. The work now fills the foreground of that backdrop.
- The Property shot is an elevated establishing view: roof is up to 19% of the frame and the technician is small in it, by design.
- After a hand orbit, the kept Visual Quality Pass settle can move the camera a few tenths of a metre, once, if the orbit came within a metre of a wall.
- Obstacle boxes are deliberately conservative (a palm crown is a box), so a few clear views are turned down.
- Comparing like-for-like GPU time for the close shots isn't possible, because the camera itself changed.
- Not checked on a real phone. Phones were emulated in headless Chrome, as in earlier passes.

## Commits

```
03be12b Service camera: try nearer and farther when the fitted distance is blocked; tests use the measured free areas
5db01c0 Service camera review fixes: bottom bars in the free area, no Watch Work from behind, free-play limits kept for other commands
9141338 Cinematic service camera in game: Property, Watch Work and Detail modes, camera bar, compact inspector
17b6c96 Service camera composition: score shots for subject size, roof, walls, plants, poles and foreground; Property, Watch Work and Detail subjects
```
plus the evidence commit adding this folder.

Scripts are in `docs/cinematic-camera/scripts/`: `modes.cjs` and `run-modes.ps1` (captures and control checks), `sheets.cjs` (comparison sheets), and `perf.ps1` (GPU timing with the Visual Quality Pass `capture.cjs --perf`).
