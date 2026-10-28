# Environment Revolution 2.0: final report

## A. Executive result

**ENVIRONMENT REVOLUTION 2.0: COMPLETE**

The environment work is done and measured:
- every residential lot is a composed property;
- the empty strips between rows are landscaped greenbelts;
- the HQ reads as a working business;
- all views stay within the 10% GPU budget.

Validation is now complete. The full 21-case browser matrix passes (21/21) on the final build
`a7c245e`.

One earlier desktop automation failure (scene not ready within 120 s) could not be reproduced:
- 12 instrumented reruns passed, 8 of them that exact case;
- the final matrix also passed it.

Its cause is unconfirmed, so it remains an open note rather than a known fix (see H).

## B. Source control

| | |
|---|---|
| Starting branch / commit | `feature/v3-graphics-revolution` at `942846a` |
| Feature branch | `feature/v3-environment-revolution` (local only) |
| Commits | 7: `342fa17`, `ee5cbb1`, `c963460`, `4857ba6` (environment), `3d6e0bf` (docs), `a7c245e` (context-loss logging), then the validation documentation commit |
| Final code commit | `a7c245e`. The browser matrix ran against this build |
| Working tree | Clean after the documentation commit |
| Remote | Nothing pushed, merged or deployed. Production (`ccr-9ef3ffbb-g9q8fs`), the Graphics Revolution branch and the other preview branches are unchanged |
| Simulation | No changes under `src/game` or `src/app`. The road graph, lots, addresses, job locations, economy, banking, automation and saves are untouched |

## C. Environmental improvements

**Property layout architecture.** `src/world/city/propertyPlan.ts` is a pure, deterministic plan
per lot:
- an archetype;
- exclusion zones: house, driveway, walk, condenser service side, technician approach, gate path;
- ground zones, hardscape, structures, collision-checked props and spaced plants.

The renderers (`PropertyBuilder.ts`, `YardProps.tsx`, `Vegetation.tsx`) make no random choices.
See `docs/design/ENVIRONMENT_REVOLUTION.md`.

**Backyards.** Each one is now its own landscape room, distinct from the front yard, with:
- a patio sized by archetype (concrete, pavers, travertine or flagstone);
- planting beds along the rear and side walls with trees;
- mid-yard islands with a tree and a boulder group;
- outdoor furniture (dining, bistro, sectional, loungers, fire pits);
- shade (pergolas, patio covers);
- outdoor kitchens, sheds, swing sets, clotheslines, hose reels and meters;
- turf where the archetype calls for it;
- pools with coping, a sun shelf, steps and a deck on 6 of 32 lots.

**Front yards:**
- a designed front zone in decorative rock, DG or turf;
- foundation beds;
- an island or lawn on the open side, and a bed between the driveway and the walk;
- a planted corner bed and sidewalk clusters;
- entry pots;
- a stepping-stone service path along the technician's route to the condenser;
- driveways with control joints and paver borders or ribbons;
- walks in concrete, pavers or flagstone, or as stepping pads.

**House variation:**
- stucco palettes per archetype;
- shutters on family and older homes;
- stone pilasters at the garage on entertainer, upscale and family homes;
- smooth stucco perimeter walls on modern and upscale lots;
- basketball hoops only on family homes.

**Vegetation:**
- five new species: palo verde, Italian cypress, yucca, desert grass, groundcover;
- planting in clusters and filled beds rather than scatter;
- a far level of detail for mesquite, olive and palo verde, like the palms.

**Streets and common areas:**
- three HOA-style greenbelts fill the 14 m strips between the rows, each with:
  - a winding concrete path;
  - rock swales with stone edging;
  - groves, boulders and benches.
- Street furniture itself was not changed.

**Headquarters:**
- **Garage roof:** solar array, makeup-air unit, gas line and conduit on supports, walk pads.
- **Office roof:** walk pads.
- **Service yard:** pallet racking on a concrete pad, and condenser stock that grows with HQ
  upgrades (visual only).
- **Grounds:** rock-filled parking islands with an understorey, and a desert tree screen along the
  east strip.

**Ground materials.** New procedural surfaces:
- decomposed granite, light, gray, brown and red decorative rock, mulch and soil (wrapped chips,
  lighting and macro mottling, no visible tiling);
- running-bond pavers, travertine French pattern, flagstone, weathered concrete.

**Lighting.** No lighting code changed. I checked golden hour and night with the new materials:
both stay coherent, and landscape lights read at night.

## D. Asset inventory

| Asset | Kind | Size / complexity |
|---|---|---|
| `tools/blender/yard_kit.py` → `public/models/props/yard-kit.glb` | Blender script and GLB (12 named parts) | 320 KB, 5,642 triangles, validated size, grounding, transforms, normals and budget; preview `previews/yard-kit.png` |
| `src/world/city/propertyPlan.ts` | Property plan system (8 archetypes) | Pure TS, cached per lot |
| `src/world/city/greenbelt.ts`, `hqLandscape.ts` | Common-area and HQ planting plans | Pure TS |
| `src/world/buildings/PropertyBuilder.ts` | Plan renderer (ground zones, edging, hardscape, pools, pergolas, kitchens, utilities, driveways, walks, facade accents) | Merged per material into the neighbourhood mesh |
| `src/world/city/YardProps.tsx` | Yard kit placements baked into two static vertex-coloured meshes | 2 draws plus 2 shadow draws |
| `src/world/assets/pbr.ts` | `aggregatePbr` (7 kinds), `pavingPbr` (3 kinds) | 512² colour and normal maps |
| `src/world/buildings/materials.ts` | Ground, hardscape and landscape materials, UV scales | |
| `src/world/city/Vegetation.tsx` | 5 new species, tree far LOD, quadrant culling, single-sided closed plants | |
| `src/world/buildings/HeadquartersBuilder.ts` | HQ site detail | Merged |

## E. Before-and-after evidence

All captures are matched: same seed (42), paused simulation, same clock and camera.
- **Sheets:** `docs/environment-revolution/compare/`.
- **Full sets:** `before/`, `after/` (1920×1080) and `before-390/`, `after-390/` (390×844).

| # | Sheet | Shows |
|---|---|---|
| 1 | `01-six-house-neighborhood.jpg` | Six-plus neighbouring properties and the greenbelt |
| 2 | `02-classic-xeriscape-backyard.jpg` | Classic desert property |
| 3 | `03-modern-minimal-backyard.jpg` | Modern property |
| 4 | `04-upscale-pool.jpg` | Upscale property with pool |
| 5 | `05-family-backyard.jpg` | Family backyard |
| 6 | `06-modest-rental-backyard.jpg` | Modest backyard |
| 7 | `07-desert-garden.jpg` | Desert garden |
| 8 | `08-street-level-property.jpg` | Street-level environment |
| 9 | `09-golden-hour-street.jpg` | Golden hour, street |
| 10 | `10-headquarters.jpg` | Headquarters |
| 11 | `11-hq-roof-and-yard.jpg` | HQ roof and service yard |
| 12 | `12-golden-hour.jpg` | Golden hour, neighbourhood |
| 13 | `13-night.jpg` | Night |
| 14 | `14-mobile-390x844.jpg` | Mobile |

Every capture run in both builds had 0 console errors.

## F. Visual variety measurements

All values are from the plan data at `4857ba6`.

**Coverage:**
- Lot plans: **32** of 32 house lots.
- Archetypes: **8**:

  | Archetype | Lots |
  |---|---|
  | Family | 6 |
  | Entertainer | 6 |
  | Upscale | 5 |
  | Desert garden | 4 |
  | Rental | 4 |
  | Classic xeriscape | 3 |
  | Older | 3 |
  | Modern minimal | 1 |

- Distinct compositions: **21** of 32, by archetype, pool, hardscape kinds and materials,
  structures, props and ground. No two neighbours in a row share an archetype.
- Lots with an intentional composition (patio, at least 3 ground zones, at least 8 plants):
  **32 / 32 (100%)**.
- Pools: **6** (19%), only on upscale lots and newer-row entertainers with backyards at least 10 m
  deep.

**Contents:**
- **Props:**

  | Prop | Count |
  |---|---|
  | Dining sets | 20 |
  | Trash carts | 20 |
  | Grills | 17 |
  | Sheds | 15 |
  | Sectionals | 12 |
  | Bistro sets | 11 |
  | Loungers | 11 |
  | Fire pits | 6 |
  | Swing sets | 6 |
  | Benches | 5 lots, plus 9 in greenbelts |
  | Umbrellas | 3 |
  | Entry pots | 2 |

- **Structures:** hose reels 32, utility boxes 28, patio covers 13, pergolas 10, outdoor kitchens 6,
  pools 6, clotheslines 3, raised bed 1.
- Ground zones: **354**. Hardscape items: **507**.
- Lot plants: **1,523** across 18 species, plus 214 in the greenbelts.
  - Every backyard has at least one tree, and most have two or three.

**Placement checks** (`propertyPlan.test.ts`, `environment.test.ts`):
- Overlap checks pass for props, plants, patios, decks and pools against the house, driveway, walk,
  condenser service zone, technician approach, walls and each other.
- HQ planting is clear of all eight fleet stalls and the route corridor.
- Greenbelts are clear of lots, streets and sidewalks.
- **Critical placement violations: 0.**

## G. Rendering performance

Method: Intel Arc 140V, Chrome headless (ANGLE D3D11), 1920×1080, High preset, vsync off. GPU time
is the median `EXT_disjoint_timer_query_webgl2` time per render over 3 s, from two alternating
rounds of the baseline (`942846a`) and new builds in one session. Data: `final-perf.json`.

| View | GPU ms before → after | Change | fps | Draw calls | Triangles (all passes) |
|---|---|---|---|---|---|
| Six-house neighbourhood | 4.84 → 5.21 | **+7.6%** | 196 → 183 | 436 → 495 (+13.5%) | 1.10M → 1.50M |
| Backyard close-up | 4.46 → 4.17 | **−6.5%** | 214 → 230 | 417 → 471 | 1.13M → 1.54M |
| Headquarters | 6.15 → 6.49 | **+5.5%** | 151 → 145 | 712 → 779 | 1.20M → 1.63M |
| Street | 5.93 → 6.28 | **+5.9%** | 162 → 156 | 432 → 486 | 1.13M → 1.52M |
| Night | 4.48 → 4.80 | **+7.1%** | 208 → 201 | 436 → 493 | 1.11M → 1.50M |

- **GPU time:** every view is within the 10% budget.
- **Draw calls:** within the 15% preference.
- **Triangles:** +36%, above the 20% preference, but the measured GPU time justifies it.
- **How it got there:** the first build measured +21–33%. Cost attribution (hiding object groups)
  led to the optimizations listed in the design document.
- **Remaining bottleneck:** vegetation vertex work, in particular hundreds of small plants and tree
  crowns in the main and shadow passes.
- **Not measured:** graphics memory and mobile GPU time.

## H. Regression results

**Static and unit checks:**

| Check | Result |
|---|---|
| TypeScript and production build (`tsc -b && vite build`) | Pass |
| ESLint (`src`, `e2e`) | Pass |
| Unit tests (Vitest) | **109 passed, 0 failed, 3 skipped**: the opt-in banking and equipment scenario suites, not rerun because no simulation code changed. The new property-layout (10) and environment (4) tests and the yard-kit asset check are included |
| Asset manifest | Yard kit entry matches the file; all prop kinds are present as named nodes |
| Job pin / camera | `serviceSiteCamera.test.ts` passes. Gameplay e2e (Show on map, job pins) passed on desktop |

**Final browser matrix at `a7c245e`: 21 passed, 0 failed, 0 skipped, 0 not run.**
- One Playwright process and one worker per case, run sequentially.
- Each case had its own artifact directory, with trace and screenshot kept on failure.
- Memory was sampled every 2 s. Free commit memory never dropped below 1,758 MB, and no case left a
  browser process behind.
- Per-case exit codes: `browser-matrix-a7c245e.txt`.

| Project | Specs (all exit 0) |
|---|---|
| desktop-1080p | gameplay, graphics, automation, banking, banking-layout, supply |
| laptop-768p | graphics |
| small-1024 | graphics, banking-layout, supply, automation |
| iphone-portrait | mobile, banking-layout |
| phone-390x844 | banking-layout, supply, automation |
| iphone-landscape | mobile, supply |
| android-portrait / android-landscape / tablet-portrait | mobile |

These cover the remaining required checks:
- **Save and load:** gameplay, banking and automation each save, reload and continue.
- **Automation:** the Operations Center routine call and the owner-attention replacement work.
- **Camera and job pins:** "Show on map" keeps the job pin visible in gameplay, backed by
  `serviceSiteCamera.test.ts`.
- **Asset loading:** none of the specs logged console errors.

**Earlier failure and investigation.** In the interrupted run at `4857ba6`, desktop automation timed
out waiting for `sceneReady`:
- The HUD loaded, but the 3D scene never reported ready.
- Peak browser memory was 836 MB, against 1.6–2.0 GB for the other desktop cases.
- The trace was lost, because every case shared `test-results/` and the next case deleted it.

The investigation (`automation-investigation.txt`) reran it with full traces, screenshots, console,
network and memory capture, each run in its own directory:
- **12 runs, 12 passed:** the case alone, twice in the matrix order (gameplay → graphics →
  automation), and five back-to-back repeats.
- **Traces:** 42 requests, 0 failed; every GLB (yard kit included) served 200 in about 10 ms;
  0 page errors; the scene ready about 4 s after New game. That is far from the 120 s limit.

Conclusion: **an intermittent start-up failure whose cause is not confirmed.**
- The evidence (a loaded HUD, a scene that never draws, low browser memory) fits a WebGL context loss
  or a GPU-process restart during start-up on this machine's Intel driver.
- I didn't reproduce it, so I'm not claiming that as the cause.

Two changes so it can't go undiagnosed again, without weakening any assertion or timeout:
- The app now logs `[graphics] WebGL context lost` and `restored` to the console (`a7c245e`, the
  only code change in this validation).
- The matrix runner keeps a separate artifact directory per case.

The previous record for `4857ba6` is kept in `browser-matrix-4857ba6.txt`.

## I. Remaining weaknesses

1. **Intermittent start-up failure (cause unconfirmed):**
   - seen once in the desktop automation case;
   - not reproduced in 12 instrumented runs or the final 21-case matrix;
   - context-loss logging and per-case artifacts will capture it if it recurs.
2. **Rental backyards:** deliberately sparse, but from some angles the rear bed is hidden by the
   wall and the yard still reads plainer than the others.
3. **House architecture changed less than the landscape.** Roof forms, massing and floor plans
   are as before; the variety comes from palettes, shutters, pilasters, walls and the yards.
4. **Street infrastructure was not touched.** There are no new signs, utility pedestals, drains or
   street bins, and boundary wall variation is limited to block versus stucco.
5. **Entry pots** only fit on 2 lots. The pots were meant to flank the entry, but the collision
   rules reject most positions.
6. **Archetype balance:** only one modern-minimal lot, because only four houses use the modern
   style and three of them draw other compatible archetypes.
7. **Open desert beyond the town:** still warm-brown at night.
8. **Triangle budget:** +36%, leaving little headroom for denser planting without impostors or a
   smaller-plant LOD.

## J. Release recommendation

**Ready for a separate Vercel Preview from the final commit of this branch.** At that commit:
- TypeScript, ESLint, the production build and the unit tests pass (109 passed, 3 opt-in skipped,
  including the environment placement tests);
- the full browser matrix passes 21/21;
- all views are within the GPU budget.

The one open item is the intermittent start-up failure in I.1. It was not reproducible, and it is
now instrumented.

Deploying needs your authorization; nothing has been pushed or deployed.
