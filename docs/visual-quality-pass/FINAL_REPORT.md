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
| `ae03a5a` | Near-profile close-up with camera clearance, compact inspector, evidence scripts |

## P0: service-call camera

### Problem and cause

On the seed-42 tutorial lot `c-n-4`, the close view of the technician showed only the porch wall
and post, on desktop and on phones. The old close camera turned a fixed 0.75 rad from the curb
heading. Lots are mirrored, so on half of them that turn points into the house. The camera also had
no occlusion handling at all.

### Fix

- **Scene geometry:** while the neighbourhood is built, the bounds of every solid house part are
  recorded per lot, at no extra cost. That covers walls, roofs, porch posts, garden walls,
  chimneys and veneer.
  - Ground covers, the unit's own line set and disconnect, and pipes thinner than 16 cm don't
    count as occluders.
- **Clear views:** `solveClearView` tries the preferred view, then 10° steps either side, then a
  higher elevation, then a closer distance.
  - A view is accepted when the sight lines to the technician's head and hands, the unit top, the
    service panel and the tool bag all miss every occluder.
  - The camera must also keep 1 m of clearance from any solid part, so walls stay out of the
    foreground, and every point must be framed inside the free screen area.
  - The solver is deterministic: solving from its own answer returns the same view, so it cannot
    oscillate.
- **Preferred close-up:** a near-profile view from the unit's open side, in the lot's own frame.
  The technician's hands on the panel, the clamp meter and leads, the gauges and the unit read
  together.
  - Distance is 6.5 m on desktop and 5.6 m on upright phones.
  - The preferred angle is kept on every lot. On most lots the solver raises the camera to
    0.56 rad to clear the side-yard wall; on three lots it swings 30°.
- **"Watch technician":** a new inspector button while a technician is on site. It flies an orbit
  path (rising over the roof on wide swings) to the clear close-up.
- **Watch mode:** if the player orbits or zooms into a blocked angle and lets go, the view eases
  once to the nearest clear angle.
  - It never moves during a drag, never in Photo Mode, and panning more than 8 m away ends the
    watch.
  - Free manual control is otherwise unchanged.
- **Safe areas:** the projection centre shifts into the part of the screen the inspector and the
  top HUD leave free, eased as panels open and close.
  - On phones, "Watch technician" also collapses the inspector sheet to its header.

### Camera obstruction results

- **Unit tests (`cameraOcclusion.test.ts`, 7):**
  - The old camera is blocked on `c-n-4` on desktop and on phone, which reproduces the defect.
  - A clear, framed close-up exists on all 32 lots × 2 aspects, also inside the free area with an
    open inspector (20% width on desktop, 56% sheet on phone).
  - The preferred view is kept whenever it is already clear, and the solver is stable.
  - A close-up solves in a few milliseconds.
- **Captures (`docs/camera-occlusion/`):** five house styles (ranch tutorial, two-storey, premium,
  Spanish, modern), desktop and 390×844, before and after.
  - In real right-drag orbits from the watched view, the camera settled with zero drift afterwards,
    so it does not oscillate.
  - These were captured at an intermediate step, before the final preferred angle and clearance.
    The final framing is in `visual-quality-pass/after/W08`, `W09` and `W16`.
- **Browser test:** the gameplay test now presses "Watch technician" during diagnosis and asserts
  that the camera ends 4.5–9.5 m from the technician at 1.5–4.5 m height, with the job still
  diagnosing.

## P0: technician

- **Gloves:** articulated, with four two-segment fingers of natural lengths and an opposed
  two-segment thumb. Each hand has a relaxed shape and a grip shape, and a hand holding a tool
  closes round it. Earlier gloves were a single mitten block.
- **Diagnosis:**
  - A real clamp meter (jaw, display, dial, buttons) replaces the yellow box.
  - A red test lead runs from the meter to the probe at the panel terminals, and a black lead to
    a clip on the panel edge.
  - The leads sag like cables and are recomputed every frame, so the tools stay connected as the
    hands move.
- **Repair:** an adjustable wrench (tapered handle, open jaw, worm) replaces the two-box wrench.
- **Cap:** a curved, thin peak replaces the flat visor box, which read as a beak when he looked
  down.
- **Unchanged:** the rig, the IK and the animation loops; the existing IK and ground-contact tests
  pass.

## P1: service scene

- **Contact shading** (no post-processing):
  - Soft decals under each condenser, on the pad and round it.
  - Under job-site props: bag, cylinder, and the owned Supply Depot equipment.
  - Under fleet vehicles and the technician.
- **Floating objects:** the tool case no longer looks like it hovers. It always sat on the ground;
  the missing contact made it read as floating.
- **Ownership:** equipment visibility already followed ownership (the van's rack and the repair
  steps), and that is unchanged.

## P1: neighbourhoods and distant city

- **Wall bands:** ambient-occlusion bands along the foot of every house wall and garden wall, as
  one merged mesh.
- **Parking:** commercial lots across the valley have double-loaded stall rows with stripes, and
  parked cars at varying occupancy, kept clear of buildings.
  - The cars are boxes in the existing instanced mesh, with stripes only on nearer lots, so there
    is no new draw path.
- **Empty tracts:** walled street grids with no houses are gone. A wash used to delete a tract's
  houses but leave its asphalt and walls.
  - Streets now span only the houses they serve.
  - A tract left with fewer than six houses becomes desert.
- **Modern hinterland houses:** varied roof tones and rooftop units, instead of uniform black slabs.
- **Desert Chill Air (competitor):** the whole roof used to be saturated blue. It is now a light
  membrane inside a blue coping, with rooftop units, a striped front row and nine instanced
  civilian cars.

## P2: interface

- **Safe areas:** the camera centres on the free part of the screen (see P0).
- **Compact inspector:** a toggle collapses the panel to its header. It is automatic when watching
  on an upright phone, and a new selection reopens the full panel.

## Evidence (`docs/visual-quality-pass/`)

- `before/`, `before-390/`: `f6d86f0`.
- `after/`, `after-390/`: this branch.
- **Matched captures:** seed 42 at 10:00, with the same cameras and job state.
  - The close views use what a player gets in each build: "Watch technician" if present, else the
    old close camera.
- **`compare/` (31 sheets):** the ten acceptance views come first.

| # | Acceptance view | Sheet |
|---|---|---|
| 1 | HQ overview | `01-hq-overview` |
| 2 | Residential street | `02-residential-street` |
| 3 | Technician arrival | `03-technician-arrival` |
| 4 | Diagnosing a condenser | `04-technician-diagnosing` |
| 5 | Diagnostic tools close-up | `05-diagnostic-tools` |
| 6 | Repair | `06-technician-repair` |
| 7 | Tutorial property (previously obstructed), in game | `07-tutorial-property-in-game` |
| 8 | Medium-distance district | `08-medium-distance-district`, `08b-medium-distance-northeast` |
| 9 | City overview | `09-city-overview` |
| 10 | Mobile service call | `10-mobile-service-call`, `10b-mobile-service-call-in-game` |

The desktop scenery shots come from the first full after-run. The service views were recaptured
after the final camera change. Scenery code did not change in between.

## Performance

- **Complete:** baseline GPU timing for `f6d86f0` (`perf-runs/perf-base`, `perf-runs/phone-base`).
- **Not complete:** the paired timing of this branch. The system's low-memory guard stopped the
  background run while the session was idle, before the first candidate run finished. That
  partial run was discarded and not restarted; no GPU comparison is claimed.
- **Draw calls and triangles** from the matched captures of the close views:
  - Triangles: about 1.97–2.08M → 2.07–2.26M (+8%). This is mostly the valley's parked cars and
    stall stripes, which are visible in wide views.
  - Draw calls: +15 to +30 in most close views (the contact decals, the competitor's rooftop
    units). Diagnosis and repair are −20 / −24, because of the different camera angle.
  - Phone diagnosis: 566 → 514 calls.
- **Overview views:** after-run counts for these were overwritten by the service-view re-capture,
  so no comparison is given.
- **To finish:** run `scripts/run-evidence.ps1 <base> <new> perf` when the machine has memory to
  spare.

## Tests

- **TypeScript, ESLint and production build:** pass.
- **Vitest:** 142 passed, 3 skipped (the opt-in scenarios), 0 failed. New: 7 camera-occlusion
  tests.
- **Browser cases**, one at a time with one worker (`browser-cases.txt`): **6/6 passed**, exit 0.
  - desktop gameplay (with the new watch step);
  - desktop graphics;
  - iPhone portrait mobile;
  - desktop supply;
  - 390×844 and 1024 inspector layout (banking-layout).
- **Not run:** the other 15 cases of the 21-case matrix. They cover systems this pass did not
  change, so they are reported as not run rather than passed.

## Remaining weaknesses

- **Technician bag:** at the near-profile angle the bag beside the technician is partly behind his
  legs.
- **Rig:** the legs and boots are still capsule-built and read as simple at very close range.
  There is no walk-to-stop easing beyond the existing arrival pacing.
- **District houses:** facade, window and garage variety was not extended beyond the five styles
  and variants.
- **Hinterland:** still box houses with hip roofs, with no gable variant. Per-instance colour can't
  paint wall-coloured gable ends.
- **Open ground:** large open desert parcels remain by design. The ground macro colour is
  low-contrast at distance.
- **Trees and occlusion:** the occluders cover architecture and walls, not trees or yard props
  (sheds, umbrellas).
- **Performance:** GPU timing for this branch is not yet measured (see Performance).

## Recommendation

Once the paired timing has been run and shows the branch within the 10% budget, create a separate
Vercel Preview of this branch for a visual playtest. The camera, technician and parking changes are
best judged in motion.
