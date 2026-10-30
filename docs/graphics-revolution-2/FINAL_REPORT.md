# Graphics Revolution 2: final report

Date 2026-10-29. Local branch `feature/v3-graphics-revolution-2`, from `adf3224` (World Immersion 3.1).

- **Code commits:** `723aeb9`, `7550493`, `7823bfe`, `1c4c5be`. The evidence commits are on top.
- **Not pushed, deployed or merged.** Production is untouched.
- **Gameplay unchanged:**
  - The simulation, economy and routing are not touched.
  - Condenser generations only read customer equipment; they never write it.
  - Cabinet footprint, panel and valve positions are identical in every generation, and a test checks this, so the technician's kneel and hands meet the unit as before.

## Scope

These are the open items from `docs/design/GRAPHICS_REVOLUTION.md`, "Next graphics milestone":

| # | Item | Status |
|---|---|---|
| 1 | Night grading, glow without bloom | Done |
| 2 | Backyard variety | Already delivered by the Environment Revolution (`c963460`); not repeated |
| 3 | Condenser variants | Done. Visible tool use per phase was already delivered by World Immersion (`602ea8d`, `6280723`) |
| 4 | Shadow-pass cost: fit the sun shadow camera to the view | Done |
| 5 | Vehicle GLB size | Done |

## 1. Night grading (`7550493`)

Night read warm-brown on sand for three reasons:

- The environment map was the daytime desert sky, with its sun hot spot, still applied after dark.
- The ambient fill stayed white.
- The "moon" was the setting sun clamped at 4°, so it barely lit the ground.

Changes:

- **Moonlit environment map:** a second PMREM bake with a deep blue sky, a silver moon hot spot, dark cool ground and a faint warm skyglow on the horizon. It is baked only for the game canvas; the fleet preview stays daylit.
- **A real moon:** after sunset the directional light comes from a fixed moon direction 43° up in the south-east, in cool silver. Night shadows are stable and short instead of grazing.
- **Cool ambient fill:** it shifts from white to blue-grey with the night factor.
- **Seamless swaps:**
  - The light direction swaps at the moment the sun crosses the horizon. Sun and moon intensity are both zero there.
  - The environment map swaps where the day map has faded to zero and the night map starts from zero.
  - Tests check both, and that light and fill change smoothly minute by minute through dusk.
- **Sky:** a small moon disc with a halo and a sparse star field above the horizon haze. Both fade in with the moonlight and are hidden by overcast and monsoon decks.
- **Daytime is unchanged:** the noon ambient and environment intensity are asserted in a test, and golden-hour captures match the baseline.

Sheets: `compare/N1-night-overview`, `compare/N2-night-street-horizon`. Roofs, concrete and streets now read cool and moonlit, and lit windows and street pools stand out from the ground.

## 2. Shadow camera fitted to the view (`723aeb9`)

The sun's shadow box was a fixed square, 230 m on High, around the origin, whatever the camera looked at. It now follows the view (`shadowFit.ts`):

- **Radius:** 1.6 × the camera distance, between 34 m and the old maximum, in 12% steps, so zooming does not rescale the map every frame. The default and overview cameras keep the full box.
- **Center:** pushed 30% of the radius beyond the orbit target, where most of an oblique view lies, and snapped to whole shadow-map texels in light space so panning does not shimmer. A test checks the texel snapping.
- **Coverage:** tests check that the van spot, condenser and technician sit inside the box in every service-site view.

Results:

- **Sharpness:** close views get much sharper shadows, because the same 4096² map covers a far smaller area. Palm fronds, lamp posts and the technician resolve cleanly.
- **Draw calls:** casters outside the box leave the shadow pass, so close views draw 18–22% fewer calls (diagnosis 681 → 535, street 557 → 455, HQ yard 566 → 436).

Sheets: `compare/S1`–`S4`.

## 3. Condenser generations (`7823bfe`)

Each house's outdoor unit now shows the customer's actual system (`HouseCondensers.ts`):

| Generation | Rule | Look |
|---|---|---|
| Legacy | R-22, or over 15 years old | Faded cream cabinet, louvers, rust bloom on the base rail, drip streaks under the top deck, bleached rating plate |
| Standard | 5–15 years | The familiar grey louvered cabinet |
| Current | 4 years or newer | Graphite cabinet with a vertical wire guard held by three bands |
| EGO install | Brand "EGO Select" (what a replacement job installs) | Current cabinet plus the teal EGO badge on the service panel |

How it fits:

- **Feedback:** completing a replacement visibly changes the customer's unit.
- **Rebuilds:** the units moved out of the merged house geometry into one merged layer, rebuilt only when a generation changes, so not per frame.
- **Shared parts:** the wall disconnect, whip and line set stay with the house.
- **Envelope:** the wire guard and plates sit inside the corner posts and flush with the panel. A test asserts the cabinet bounds match to within 1 cm across generations on standard and premium lots.

Sheet: `compare/G-condenser-generations` (guard and service sides of each).

## 4. GLB compression (`1c4c5be`)

New pipeline step `tools/assets/compress.mjs` (glTF-Transform, run by `build.mjs`):

- **Weld:** indexes the exporter's unshared vertices. Only exact attribute matches merge, so flat shading and UV seams are kept.
- **Lossless meshopt compression** (`EXT_meshopt_compression`, attribute mode without quantization).
- **No pruning:**
  - Pruning would strip UVs from untextured meshes. The van livery is applied at runtime through those UVs.
  - The yard and job-site kits are looked up by empty named nodes.
- **Decoder:** drei's `useGLTF` decodes the files with the meshopt decoder bundled in three-stdlib, with no network fetch.

| Asset | Before | After |
|---|---|---|
| Full-size van | 1,406 KB | 413 KB |
| Compact van | 1,363 KB | 395 KB |
| Pickup | 1,369 KB | 395 KB |
| Box truck | 1,726 KB | 358 KB |
| Sedan / SUV | 238 / 248 KB | 89 / 95 KB |
| Job-site / supply / yard kits | 349 / 216 / 312 KB | 150 / 107 / 129 KB |
| **All models** | **7.4 MB** | **2.1 MB** |

Triangle counts, node names and livery are unchanged; the HQ, service-site and arrival captures match. New dev dependencies, pinned exactly: `@gltf-transform/core`, `extensions` and `functions` 4.2.1, and `meshoptimizer` 0.22.0.

## Performance

These are GPU times per render on the same machine, High quality and seed 42, with vsync off (`final-perf.json`; raw runs in `perf-runs/`).

- **Desktop:** mean of the steady runs, two baseline and three new, alternating.
- **Excluded runs:** the very first baseline run was about 25% slower than its own repeat, in every view (a cold GPU state). The second phone baseline overview is a similar outlier.

| View | Baseline ms | GR2 ms | Change | Draw calls |
|---|---|---|---|---|
| Overview | 6.62 | 6.72 | +1.6% | 1004 → 1024 |
| North-east boundary | 4.68 | 4.52 | −3.3% | 540 → 539 |
| South-west boundary | 4.35 | 4.10 | −5.8% | 550 → 477 |
| Street | 5.79 | 5.95 | +2.8% | 557 → 455 |
| HQ | 6.14 | 6.38 | +3.8% | 843 → 858 |
| Diagnosis | 4.79 | 4.83 | +0.9% | 681 → 535 |
| Repair | 4.70 | 4.77 | +1.5% | 677 → 529 |
| Golden hour | 6.30 | 6.37 | +1.0% | 998 → 1018 |
| Night | 6.07 | 6.49 | +6.9% | 998 → 1018 |
| Phone overview (390×844) | 3.32 | 3.31 | −0.3% | 938 → 958 |
| Phone street (390×844) | 2.82 | 2.76 | −2.1% | 626 → 584 |

What the numbers show:

- **Within budget:** every view stays inside the 10% budget.
- **Shadow fit:** it cuts draw calls (CPU and driver work) by up to 22% in close views. GPU time there is roughly flat, because the shadow map resolution, the dominant cost, is unchanged.
- **Condenser layer:** about 20 draw calls (its own materials in the main and shadow passes). That is the small rise on wide views.
- **Night:** +6.9%. The cause was not isolated. Likely contributors are the high moon (shadows fall inside the box instead of grazing out of it) and the night map's stronger environment term. It remains the most expensive change.
- **Load size:** GLB downloads fall by 5.3 MB per first visit.

## Tests

- **TypeScript, ESLint and production build:** pass.
- **Vitest:** 135 passed, 3 skipped (the opt-in scenarios), 0 failed. New:
  - `shadowFit.test.ts`: stepped radius, overview coverage, service-site coverage, texel-snapped panning.
  - `nightGrading.test.ts`: zero light and fill at the swaps, smooth dusk, a cool full night, daytime unchanged.
  - `condenserVariants.test.ts`: generation rule, identical cabinet envelope, merged meshes.
- **Asset test** (`graphicsAssets.test.ts`): every compressed GLB is valid binary glTF 2.0, matches the manifest and is within budget.
- **Browser matrix at `fbd8450`** (code identical to `1c4c5be`): **21/21 passed**, every case exit 0 with no leftover browsers (`browser-matrix-fbd8450.txt`). Cases ran one at a time with one worker, behind a 1.5 GB free-memory gate (`scripts/run-specs.ps1`). A first pass also showed 21/21 passed, but the runner lost the exit codes, so it was fixed and re-run for an exact record.

## Evidence

- `before/`, `before-390/`: `adf3224`.
- `after/`, `after-390/`: `1c4c5be`. Same capture script and views as World Immersion, 0 console errors in all runs.
- `condensers/`: the four generations, from `scripts/condensers.cjs`.
- `compare/`: 34 sheets, flagship sheets first (N night, S shadows, G condensers).

## Known limitations

- **Night cost:** night is +6.9% GPU against the baseline. The cheapest lever would be a lower night environment intensity or a smaller night shadow box.
- **Condenser variants:** cabinet style and wear vary, but footprint and height are fixed by the technician animation. There is no size variation by tonnage.
- **Distant ground:** outer-valley ground (Lambert materials) still reads slightly warm at night; it takes no environment light.
- **Diagnosis close view (`W08`):** for the seed-42 tutorial lot, the camera sits behind the porch wall in both builds. This is a framing issue that predates this milestone.
- **Phone street:** still about +12% against `ef407c7`, as recorded in World Immersion 3.1. This milestone is −2.1% against 3.1.
