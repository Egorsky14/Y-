# Cinematic Camera 2.0 Acceptance Report

**Build under test.** The Vercel Preview `dpl_AExAp7iMdnptDsrfZkpXqHBq3CtA`, branch `feature/v3-cinematic-camera` at `bbc2558`. Nothing in the game was changed for this pass, and production was not touched.

**Recommendation: FIX BEFORE MERGE.** Four major defects reproduce on the deployed build: the walk-up follow, Property on landscape phones, the inspector over the head in landscape, and the camera bar over the action bar at 1366 px. After they are fixed, a manual playtest on a real phone is still required, because touch and phone performance were only emulated here.

## How it was tested

**Test runs**

- Headless Chrome (GPU, ANGLE D3D11), one browser at a time, against the deployed preview URL. A Vercel share link kept the token out of the repo.
- Every case plays one real service call: dispatch, walk-up, diagnosis, quote approved, then repair.
- Four houses × four screens = 16 runs, plus 3 filmstrip runs and 4 pixel-mask runs. Every run exited 0, with 0 page errors, 0 console errors and 0 failed requests.

| House | Why |
|---|---|
| `c-n-4` | Tutorial house (ranch, seed 42) |
| `n-o-1` | Palm trees and a garden wall |
| `a-s-2` | Garden walls (premium) |
| `a-s-1` | Street obstacles: a street pole and sign by a modern house |

| Screen | Size |
|---|---|
| Desktop | 1920×1080 |
| Laptop | 1366×768 |
| Phone portrait | 390×844 @3×, touch |
| Phone landscape | 844×390 @3×, touch |

**What each run captures**

- Shots, with the HUD, toasts and inspector as rendered:
  - Watch work while he walks up, and after he arrives.
  - Property.
  - Detail during diagnosis.
  - Watch work with the inspector or sheet expanded.
  - Watch work and Detail during repair.
  - The view after the control tests.
- Every frame time, and the camera position at every probe tick (every 3rd frame).
- Every reframe the camera makes, with its reason and solve time, and the rectangles of every UI panel.
- Control tests:
  - Desktop: right-drag orbit, wheel zoom in and out, then a pan.
  - Touch, through real Chrome touch events: two-finger orbit, pinch in and out, then a one-finger pan.
  - Each is followed by a 10 s hands-off hold.

**Independent visibility check.** The deployed build doesn't expose the 3D scene, so I made a local `VITE_PROFILE=1` build of the same commit; it differs only in that debug handle. There, every shot also gets a pixel mask:
- The technician (magenta) and the tool kit (cyan) are drawn flat, with and without depth testing.
- The visible share is the depth-tested pixels divided by the full silhouette.
- The mask also gives the share of the technician that sits under UI panels.

**Not covered**
- No real phone or tablet was used. "Portrait" and "landscape" are Chrome device emulation with touch events.
- Frame times come from headless Chrome, capped at 60 Hz.

All evidence is in `docs/cinematic-camera/acceptance/`:
- `sheets/`: one contact sheet per screen and house, and filmstrip sheets.
- `<screen>/<house>-*.jpg` and `<house>-metrics.json`: raw shots and metrics.
- `strips/`, `mask/`.
- `summary.txt`: every number quoted below.
- `scripts/`: rerun a case with `ACCEPT_URL=<url> node scripts/accept.cjs <out> <screen> <house>`.

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1a | Watch Work composition, at rest | **PASS** | All 16 runs. Fill 0.55–0.60 desktop/laptop/landscape, 0.69–0.70 portrait. Foreground 0, roof 0, plants ≤ 0.10. 9–27° above ground, 3.4–5.8 m from him. On screen he spans 55–65% of the frame height. |
| 1b | Property composition | **FAIL** (landscape phone) | PASS on desktop, laptop and portrait (16/16 composed). On landscape, 2 of 4 houses (`a-s-2`, `n-o-1`) fell back to the old camera: no composition report, van under the action bar, unit not identifiable (F4). |
| 1c | Detail composition | **PASS with notes** | Composed in 32/32 shots. Hands, meter, gauge hoses and panel visible in every one. Only modestly closer than Watch Work except on portrait. Portrait crops his back at the edge and is very low on `a-s-1` (F7). |
| 2 | Technician visibility | **FAIL** (walk-up) | At rest: PASS. The mask shows him 90–98% visible in every Watch Work and Detail shot. Walk-up: he is out of frame for about 6 s after "Watch technician" (F1). |
| 3 | Equipment and tool visibility | **PASS** | Unit, service panel, gauges, hoses and meter in plain view in every Watch Work and Detail shot. The tool kit is 45–69% visible; the rest is behind the technician and unit. Repair-phase shots show the tool at the unit. |
| 4 | Smooth movement and transitions | **FAIL** (follow) | Mode switches: PASS. 0 reversals, 0 overshoot, 1.1–1.3 s per switch, 160 switch windows. Walk-up follow: still for 3–7 s, then a 15–20 m/s swoop, then a stop-go pulse every 1.07 s (F1). |
| 5 | Obstruction avoidance | **FAIL** (follow, landscape Property) | Every finished Watch Work and Detail shot is clear, including the palm and garden-wall houses and the street pole. The walk-up follow shot has a palm trunk across the left foreground for about 6 s (F1). Landscape Property shows him only 63% visible behind obstacles (F4). |
| 6 | Inspector and HUD integration | **FAIL** (laptop, landscape) | Desktop: PASS. The inspector collapses on Watch, and the shot recomposes when it expands (`work-inspector` keeps him clear, 0% under UI). Laptop: the camera bar covers Finances (F3). Landscape: the collapsed card covers his head (F2). Phones: the camera bar covers toasts (F8). |
| 7 | Desktop responsiveness | **FAIL** (1366×768) | 1920×1080 PASS. 1366×768 composition PASS, layout FAIL (F3). |
| 8a | Mobile portrait | **PASS** (emulated only) | Composition, recomposition when the sheet expands, and a finger-sized bar under the HUD. Minor toast overlap (F8). Not verified on a real device. |
| 8b | Mobile landscape | **FAIL** (emulated) | F2, F4. Not verified on a real device. |
| 9 | Touch orbit and pinch zoom | **FAIL** | Input works: two-finger orbit, pinch in and out, and one-finger pan all move the camera, and the pan ends the service view. But the camera moves itself after letting go in 24 of 64 control actions: 0.5–3.8 m, once 19.5 m (F5). Pinch-in can put the camera inside the technician (F6). Real-finger feel: NOT VERIFIED. |
| 10a | Performance when switching modes, desktop | **PASS** | 13,191 frames across switch windows. p95 ≤ 33 ms, max 50 ms, 0 frames over 50 ms. Solve time per framing: median 3.8 ms, max 24 ms. |
| 10b | Performance when switching modes, phone and laptop | **NOT VERIFIED** | Headless: p95 16.8 ms, but 1–3 isolated 0.4–0.8 s hitches per run, mostly when new scenery comes into view (zoom-out, pan, Property↔Detail on landscape). Needs a real-device check (F11). |
| 11 | Diagnosis sequence | **PASS** | Watch Work and Detail during diagnosis on every screen and house. The camera reframes when the phase changes. |
| 12 | Repair sequence | **PASS** | The repair started in 16/16 runs. On the phase change the camera stays on Watch Work and reframes; the repair Detail shows the tool at the unit. |
| 13 | Exit and free play | **PASS** | ✕, Overview or a pan away ends the service view, and nothing pulls the camera back afterwards. |
| 14 | Assets and game flow on the deployed build | **PASS** | 0 failed requests and 0 errors in 23 sessions. Dispatch, diagnosis, quote and repair completed in every run. |

## Findings

Severity: **Major** means visible to every player in a common situation and should block merge. **Moderate** means visible, but only after the player does something. **Minor** is polish.

### F1 · Major · Watch Work while he walks up: technician off-screen, palm in front, stop-go motion
- **Where:** all houses and screens. Clearest on `n-o-1` desktop and landscape.
- **Observed:**
  - "Watch technician" pressed as he leaves the van first frames the empty unit up close (0–2.6 s).
  - It then moves to a wider shot with a palm trunk across the left fifth of the frame. The technician isn't in it from 2.6 s to 8.4 s.
  - From about 8.9 s he appears, and the camera follows in steps until he kneels at about 13.5 s.
  - The camera path in all 16 runs shows the same pattern:
    - no motion for 3–7 s;
    - one reposition peaking at 15–20 m/s;
    - then a stop-go pulse with every follow reframe, about once a second (0 → 2–6 m/s → 0).
  - The opening flight from the city overview is re-aimed twice in flight (reframe reasons `mode` at about 50 ms, `phase` at about 820 ms), with 2–5 direction reversals.
  - Follow framings carry no composition report, so they are not scored for obstacles.
- **Expected:** he stays in frame and unobstructed while he walks, and the camera tracks him smoothly.
- **Evidence:**
  - `sheets/strip-desktop-n-o-1-walk.jpg` (26 frames, 0.5 s apart).
  - `walkup` and `reframes` in every `<house>-metrics.json`.
  - `work-walking` row in every contact sheet.
- **Fix:**
  - Score follow framings with the same composition rules and obstacles as Watch Work, and require his key points to be visible.
  - Track the drawn technician continuously with a damped target instead of a new orbit flight every 1.2 m.
  - Start the first framing only once he is visible, or frame the van-to-unit path.

### F2 · Major · Phone landscape: the collapsed inspector card covers the technician's head
- **Where:** 844×390 landscape, Watch Work and Detail, all houses. Clearest on `n-o-1` and `a-s-2`.
- **Observed:**
  - The collapsed job card (380×84 at the top right) sits over his head and shoulders.
  - Pixel mask: 4–8% of his pixels are under UI on landscape, against 0–2.5% on desktop.
- **Expected:** his head and hands stay clear of UI.
- **Evidence:** `sheets/landscape-n-o-1.jpg` (work, detail, work-repair, detail-repair); `mask/landscape/*-metrics.json`, `tech.underUi`.
- **Fix:**
  - `measureSafeArea` counts the collapsed side panel as `right = 0`, and on short screens the top inset covers only the HUD.
  - Count the collapsed card: a top inset down to its bottom edge, or a right inset of its width when the screen is short.
  - Add a landscape screen with the card to `cameraComposition.test.ts`.

### F3 · Major · Laptop 1366×768: the camera bar covers the Finances button and part of Overview
- **Where:** laptop, every service camera view.
- **Observed:**
  - The camera bar (x 529–836) overlaps the action bar (x 14–610) by 81 px and the world controls (x 808–1352) by 28 px.
  - Finances is hidden under the bar, so it can't be reached while the service camera is on.
- **Expected:** no overlap at common laptop widths.
- **Evidence:** `sheets/laptop-*.jpg` (bottom row of every shot); `shots.*.ui` in `laptop/*-metrics.json`.
- **Fix:** where the action bar, camera bar and world controls don't fit side by side (about ≤ 1500 px), raise the camera bar above the bottom row. Count it in the bottom inset as it is now.

### F4 · Major · Phone landscape: the Property shot falls back to the old camera
- **Where:** 844×390, Property, `a-s-2` and `n-o-1`. Composed correctly on `c-n-4` and `a-s-1`.
- **Observed:**
  - No composition report, and the same fallback distance (42 m) on both houses.
  - The van is half under the action bar, and the unit and technician can't be made out.
  - Pixel mask on `n-o-1`: technician 63% visible, tool kit 25%.
- **Expected:** a composed establishing shot with the house, van, unit and technician on every screen.
- **Evidence:** `sheets/landscape-n-o-1.jpg` and `sheets/landscape-a-s-2.jpg` (property); `property` in `mask/landscape/n-o-1-metrics.json`.
- **Fix:**
  - The Property rules (fill 0.84, distance 14–60) find no shot that passes in a short 2.16:1 screen with top and bottom insets.
  - Let Property relax its fill and distance limits on short screens.
  - Make the unit-test landscape screen match the inset measured in game.

### F5 · Moderate · After an orbit or zoom, the camera moves itself
- **Where:** every screen, in the 10 s after letting go.
- **Observed:**
  - In 24 of 64 control actions the camera moved by itself within about 1 s of release: 0.5–1.5 m typically, 3.2–3.8 m on 4 orbits.
  - Once, 19.5 m after a landscape pinch-out on `n-o-1`. The pinch-out had first ended behind the garden wall, hiding him.
  - On portrait `a-s-2` the player's side angle was replaced by the original front angle within 1.5 s.
  - The cause is the Visual Quality Pass rule that eases a watched view to a clear angle once after the player lets go. In service mode it overrides deliberate player angles.
- **Expected:** the player's orbit and zoom stay where they left them; this was part of the brief.
- **Evidence:** `sheets/strip-portrait-a-s-2-orbit.jpg`, `sheets/strip-landscape-n-o-1-zoom.jpg`; `controls.*.driftAfter10s` in every metrics file.
- **Fix:** while the service camera is on, disable the settle, or limit it to a small correction (≤ 0.5 m and ≤ 15°) that applies only when the technician is fully hidden.

### F6 · Moderate · Pinch-in can push the camera inside the technician
- **Where:** portrait, `a-s-2` and `n-o-1`.
- **Observed:**
  - Pinch-in stops 0.46–0.68 m from his centre, at waist height. The frame fills with his leg and hoses, and stays there.
  - In landscape, pinch-in drops to 0.65 m above the ground and loses him.
- **Expected:** zoom stops at a clearance from the technician and unit.
- **Evidence:** `sheets/strip-portrait-a-s-2-zoom.jpg` (top row).
- **Fix:** the service minimum distance (2.5 m) is measured to the ground target, not to the subject. Clamp camera positions against the subject's clearance box, which `cameraComposition` already defines, during service views.

### F7 · Minor · Detail is only a little closer than Watch Work, and is cropped on portrait
- **Where:** Detail, all screens.
- **Observed:**
  - Desktop, laptop and landscape: Detail is 2.5–3.9 m away against 3.8–5.8 m for Watch Work (fill 0.68 against 0.55). The meter, gauges and hands are visible but small.
  - Portrait: his back is cut by the right edge. On `a-s-1` the camera is 2.8–6.7° above the ground.
- **Expected:** a clearly distinct close-up of the hands, meter and gauges, not lower than about 12°.
- **Evidence:** `detail` and `detail-repair` cells in every sheet.
- **Fix:** frame Detail on a hands-plus-panel subject box, raise the Detail fill on wide screens, and add an elevation floor.

### F8 · Minor · On phones the camera bar sits over the toasts, and celebrations cover the bar
- **Where:** portrait and landscape.
- **Observed:**
  - The top-left toasts ("Unit 1 en route", "Findings ready") are clipped under the camera bar.
  - The "Milestone: First Diagnostic" banner covers the camera bar while it shows.
- **Evidence:** `work-walking`, `work-repair` and `repair-auto` in `sheets/portrait-c-n-4.jpg` and `sheets/landscape-a-s-2.jpg`.
- **Fix:** move the toasts below the camera bar while it is shown, and keep celebrations clear of the bar.

### F9 · Minor · In the Property shot the technician is hard to find
- **Where:** Property, all screens.
- **Observed:** he is 4–6% of the frame height (about 45–65 px on desktop). This is by design for an establishing shot, but he is hard to pick out.
- **Fix (optional):** a small marker over the technician in Property mode.

### F10 · Minor · Low Watch Work angle on landscape `n-o-1`
- **Observed:** 9.2° above ground (the design band is about 16–25°), with 10% plants in the frame. It still reads well; noted for tuning.

### F11 · Not verified · Hitches on phones and laptops
- **Observed:** 1–3 single frames of 0.4–0.8 s per run on laptop and phone emulation, mostly after zoom-out or pan, or a long Property↔Detail flight. None on desktop.
- **Why not verified:** headless Chrome at 3× pixel density is not a phone GPU; these need checking on real devices.

## What was not verified

- **Real phones and tablets:** touch feel, pinch gestures, safe-area insets (notch, home bar) and frame rate. Everything mobile here is Chrome emulation with touch events.
- **Real-device GPU performance.**
- **Visual judgment by a person.** The screenshots were reviewed in this pass, but cinematic taste (for example, whether the side-on angle reads as "watching the work") needs a playtester.
- **Other houses.** Only the four listed were captured in this pass. The earlier composition tests cover all 32 lots in node, but not in the rendered game.

## Manual playtest required after the fixes

1. On a real phone, portrait and landscape:
   - tap Watch technician as the van parks, and watch the whole walk-up;
   - switch through all three modes;
   - orbit, pinch in and out, then leave the phone alone for 10 s.
2. On a 1366×768 laptop: every bottom button is reachable while the camera bar is shown.
3. On the palm house (`n-o-1`): watch the walk-up and the Property shot in landscape.
