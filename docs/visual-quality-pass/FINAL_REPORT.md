# Visual Quality Pass: final report

Date 2026-10-30. Local branch `feature/v3-visual-quality-pass`, from `f6d86f0` (Graphics
Revolution 2).

- **Not pushed, deployed or merged.**
- **Gameplay unchanged:** economics, diagnostics, pricing, warranties, save/load and dispatch are
  untouched. The world tests confirm that customer coordinates and the road network are unchanged.

| Commit | Content |
|---|---|
| `27e680c` | Service camera (occlusion, safe areas, watch mode), technician tools and gloves, contact shading |
| `882d78a` | Distant city and district: parking lots, empty tracts, modern roofs, competitor store |
| `ae03a5a` | Near-profile close-up, compact inspector, evidence scripts |
| `8414909` | First evidence set and report |
| `b00467f` | Close-up framing fixes from the in-game review (foreground, height, aim, phone sheet); paired GPU timing |
| Final commit | Final captures, 31 sheets, 21/21 browser matrix, this report |

## P0: service-call camera

### Problem and cause

On the seed-42 tutorial lot `c-n-4`, the close view of the technician showed only the porch wall
and post, on desktop and phones. The old close camera turned a fixed 0.75 rad from the curb
heading. Lots are mirrored, so on half of them that turn points into the house. The camera had no
occlusion handling at all.

### Fix

- **Scene geometry:** the bounds of every solid house part are recorded per lot while the
  neighbourhood is built, at no extra cost. That covers walls, roofs, porch posts, garden walls,
  chimneys and veneer.
- **What `solveClearView` accepts:**
  - The sight lines to the technician's head and hands, the unit top, the service panel and the
    tool bag all miss every occluder.
  - The camera keeps 1 m of clearance from any solid part.
  - Every point is framed inside the free screen area.
  - The lower frame shows ground: rays through six points across it must reach the ground, with at
    most one hitting geometry. This was added after the in-game review (below).
- **How it searches:** 10° steps either side, then a higher elevation, then a closer distance.
  - Height costs twice as much as turning, so the camera prefers a moderate swing to a steep
    angle.
  - The solver is deterministic: solving from its own answer returns the same view, so it cannot
    oscillate.
- **Preferred view:** near profile from the unit's open side, in the lot's own frame, aimed at the
  work itself (0.55 m up). The ground point on that sight line becomes the orbit target, so the
  work lands centre-frame on tall phone screens as well.
  - Distance: 6.5 m on desktop, 5.6 m on upright phones.
- **"Watch technician":** an inspector button while a technician is on site. It flies an orbit
  path to the close-up.
  - On upright phones it collapses the sheet first, then solves against the collapsed layout.
- **Watch mode:** if the player orbits or zooms into a blocked angle and lets go, the view eases
  once to the nearest clear angle. It never moves during a drag or in Photo Mode, and panning more
  than 8 m away ends the watch.
- **Safe areas:** the projection centre shifts into the part of the screen the inspector and the
  top HUD leave free, eased as panels open and close.

### In-game framing review and the clearance rule

You asked whether the 1 m clearance rule, which changed 62 of 64 cases, pushed the camera too
high. I checked actual in-game frames with the HUD and inspector on, on five lot types (ranch
tutorial, two-storey, premium, Spanish, modern), on desktop and phone (`camera-review/`).

**Three problems found and fixed:**

1. **Foreground:** on the premium lot a garden wall filled 40% of the frame, while every sight line
   to the subject passed over it. The foreground check now rejects such views.
2. **Height:** with that check, the cheapest fix was a lift to 0.70 rad (40°), which looks close to
   top-down. Height is now twice as expensive as turning. No case goes above 0.56 rad (32°), and a
   unit test enforces ≤ 0.6 rad.
3. **Phone composition and sheet order:**
   - On phones the work sat in the upper third, because the camera aimed at a ground point. It now
     aims at the work.
   - The view had been solved against the full inspector sheet, which then collapsed and revealed
     the wall. It is now solved after the sheet collapses.

**Final distribution, 32 lots × 2 aspects:**

| Result | Desktop | Phone |
|---|---|---|
| Preferred angle at 24° | — | 8 |
| Preferred angle raised to 32° (over the side-yard wall) | 17 | 17 |
| 10° swing at 24° or 32° | 12 | — |
| 30° swing at 24° | 3 | 7 |

Final camera heights in game: 2.8–4.0 m above the ground. The 4.0 m case is the premium lot at
32°.

`camera-review/desktop-sheet.jpg` and `camera-review/phone-sheet.jpg` show all five lot types. Each
frame shows a consistent composition: the unit large, the technician kneeling at the panel with the
meter and hoses, and the tool case beside him. On the premium lot what remains of the garden wall
is a thin strip at the frame edge.

### Camera obstruction results

- **Unit tests (`cameraOcclusion.test.ts`, 8):**
  - The old camera is blocked on `c-n-4` on desktop and phone, reproducing the defect.
  - A clear, framed close-up exists on all 32 lots × 2 aspects, also with an open inspector (20%
    of the width on desktop, a 56% sheet on phone).
  - The foreground is clear and the elevation is at most 0.6 rad everywhere.
  - The preferred view is kept when it is already clear, and the solver is stable and fast.
- **Real right-drag orbits from the watched view** (`camera-review/desktop/*-metrics.json`): drift
  after settling was 0 on all five lots, so there is no oscillation.
- **Browser tests:**
  - Gameplay asserts that "Watch technician" ends 4.5–9.5 m from the technician at 1.5–4.5 m
    height, with the job unchanged.
  - Mobile asserts that the sheet collapses on "Watch technician" and expands with the toggle,
    with the diagnosis choices visible again. This uses real taps on iPhone portrait.

## P0: technician

- **Gloves:** articulated, with four two-segment fingers and an opposed thumb. Each hand has a
  relaxed shape and a grip shape, and a hand holding a tool closes round it. The earlier gloves
  were mitten blocks.
- **Diagnosis:**
  - A real clamp meter (jaw, display, dial, buttons).
  - A red test lead from the meter to the probe at the panel terminals, and a black lead to a clip
    on the panel edge.
  - The leads sag like cables and are recomputed every frame.
- **Repair:** an adjustable wrench (tapered handle, open jaw, worm).
- **Cap:** a curved, thin peak in place of the flat visor box.
- **Unchanged:** the rig, IK and animation loops. The existing IK and contact tests pass.

## P1: service scene

- **Contact shading** (no post-processing): soft decals under each condenser (on the pad and round
  it), under job-site props (bag, cylinder, owned Supply Depot equipment), under fleet vehicles and
  under the technician.
- **Floating objects:** the tool case no longer looks like it hovers. It always sat on the ground;
  the missing contact made it read as floating.
- **Ownership:** equipment visibility still follows ownership (the van's rack and the repair
  steps).

## P1: neighbourhoods and distant city

- **Wall bands:** ambient-occlusion bands along the foot of every house wall and garden wall, as
  one merged mesh.
- **Parking:** commercial lots across the valley have stall rows with stripes, and parked cars at
  varying occupancy, kept clear of buildings.
  - The cars use the existing instanced box mesh, and stripes appear only on nearer lots.
- **Empty tracts:** walled street grids with no houses are gone. Streets span only the houses they
  serve, and a tract left with fewer than six houses becomes desert.
- **Modern hinterland houses:** varied roof tones and rooftop units instead of black slabs.
- **Desert Chill Air (competitor):** a light roof membrane in a blue coping (the whole roof used to
  be saturated blue), rooftop units, a striped front row and nine instanced civilian cars.

## P2: interface

- **Safe areas:** the camera centres on the free part of the screen.
- **Compact inspector:** a toggle collapses the panel to its header. It is automatic when watching
  on an upright phone, and a new selection reopens the full panel.

## Screenshots (`docs/visual-quality-pass/`)

- `before/` and `before-390/` are `f6d86f0`; `after/` and `after-390/` are `b00467f`.
  - Seed 42, 10:00, with the same cameras and job state.
  - The close views use what a player gets in each build: "Watch technician" where it exists,
    otherwise the old close camera.
- **`compare/`:** 31 sheets, all reviewed. The ten acceptance views come first:

| # | View | Sheet | Result |
|---|---|---|---|
| 1 | HQ overview | `01-hq-overview` | Unchanged composition, contact shading |
| 2 | Residential street | `02-residential-street` | Wall and ground contact |
| 3 | Technician arrival | `03-technician-arrival` | Unchanged pose, contact under van and technician |
| 4 | Diagnosing a condenser | `04-technician-diagnosing` | Before: porch wall only. After: technician, unit, meter, hoses, case |
| 5 | Diagnostic tools | `05-diagnostic-tools` | Clamp meter, leads, articulated gloves |
| 6 | Repair | `06-technician-repair` | Before: wall-blocked. After: clear |
| 7 | Tutorial property, in game | `07-tutorial-property-in-game` | Before: wall. After: work centred left of the inspector |
| 8 | Medium distance | `08-…`, `08b-medium-distance-northeast` | Parked cars, varied modern roofs |
| 9 | City overview | `09-city-overview` | Competitor roof, parking |
| 10 | Mobile service call | `10-…`, `10b-mobile-service-call-in-game` | Before: porch post. After: work framed above the compact sheet |

Everything else (side views, profiles, golden hour, night, phone overview and street) is unchanged
or improved. The phone street view (`29`) no longer shows the empty walled cross. No regressions
were found.

## Performance (`final-perf.json`, raw runs in `perf-runs/`)

- **Method:** GPU time per render, median over 3 s per view, vsync off, High quality, seed 42,
  same machine.
- **Runs:** two baseline and two candidate runs per view, run in the foreground. The background
  runs had been reaped by the low-memory guard.
- **Builds:** the candidate runs are `ae03a5a`. Rendering cost has not changed since; the later
  commit only moves close-up cameras.

| View | Base ms | New ms | Change | Draw calls | Triangles |
|---|---|---|---|---|---|
| Overview | 6.63 | 6.84 | +3.2% | 1024 → 1062 | 2.15M → 2.32M |
| North-east boundary | 4.50 | 4.65 | +3.3% | 539 → 556 | 1.91M → 2.08M |
| South-west boundary | 4.07 | 4.30 | +5.5% | 477 → 509 | 1.90M → 2.06M |
| Street | 5.93 | 6.01 | +1.4% | 455 → 463 | 1.95M → 2.10M |
| HQ | 6.34 | 6.45 | +1.7% | 858 → 874 | 2.11M → 2.27M |
| Diagnosis* | 4.84 | 4.72 | −2.6% | 535 → 515 | 1.97M → 2.18M |
| Repair* | 4.92 | 4.54 | −7.7% | 529 → 505 | 1.98M → 2.18M |
| Golden hour | 6.58 | 6.53 | −0.7% | 1018 → 1056 | 2.15M → 2.32M |
| Night | 6.72 | 6.72 | 0% | 1018 → 1056 | 2.11M → 2.29M |
| Phone overview | 3.75 | 3.55 | −5.3% | 958 → 985 | 1.96M → 2.13M |
| Phone street | 2.84 | 2.97 | +4.4% | 584 → 605 | 1.80M → 1.97M |

\* The camera differs between builds (old blocked view vs the clear close-up), so these two are
not like-for-like.

- **Within budget:** every view is inside the 10% budget.
- **Phone overview:** the first baseline run (4.17 ms) was slow. Without it the baseline is
  3.33 ms, and the overview comes out +6.6%.
- **Where the cost comes from:**
  - About +8% triangles, mostly the parked cars and stall stripes.
  - +16 to +38 draw calls, from the contact decals, wall bands and the competitor's rooftop units.

## Tests (at `b00467f`)

- **TypeScript, ESLint and production build:** pass.
- **Vitest:** 143 passed, 3 skipped (the opt-in scenarios), 0 failed.
- **Browser matrix:** **21/21 passed**, every case exit 0 with no leftover browsers
  (`browser-matrix-b00467f.txt`).
  - Run as three foreground chunks of 7, one case at a time with one worker.
  - It includes the new gameplay watch step and the mobile collapse and expand step.

## Known issues

- **Technician:**
  - At the near-profile angle the bag is partly behind his legs.
  - The legs and boots are still capsule-built and read as simple at very close range.
  - There is no new walk-to-stop easing.
- **Phone close-up with the UI hidden** (`10-mobile-service-call`): the work sits slightly above
  the middle, with open ground below. In game the compact sheet occupies that space.
- **District houses:** facade, window and garage variety was not extended beyond the five styles
  and variants.
- **Hinterland:** houses keep hip roofs only, with no gable variant. Large open desert parcels
  remain by design, and the ground colour is low-contrast at distance.
- **Occluders and foreground:** both cover architecture and walls, not trees or yard props (sheds,
  umbrellas).
- **Diagnosis and repair timing:** these views are not like-for-like across builds (see
  Performance).

## Git status

- Branch `feature/v3-visual-quality-pass`, local only.
- The working tree is clean after the final commit.
- No pushes, merges or deployments were made in this pass.

## Recommendation

Ready for a separate Vercel Preview of this branch for a visual playtest, when you authorise it.
