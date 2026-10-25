# Graphics overhaul report

Branch `v3-premium-graphics`, cut from `ccr-9ef3ffbb-g9q8fs` at `4924436`. Final commit: the head of `v3-premium-graphics` at delivery (hash reported with the deliverables; `git log -1 v3-premium-graphics`).

## What changed and why

| Area | Before | After | Why |
| --- | --- | --- | --- |
| Vehicles | Three stacked boxes per van, flat window planes, plain cylinder wheels, no mirrors or lights | Four glTF models (full-size van, compact van, pickup, box truck) with real side profiles, cut wheel arches, raked windshields, side and rear glass, mirrors, handles, seams, grilles, bumpers, lights, ladder racks, treaded wheels with spoked rims; per-vehicle paint, EGO HVAC wordmark decals, steering, roll and pitch, headlights at dusk | The van is the star asset and read as a prototype |
| Houses | Flat-color boxes, single-plane windows, no eaves or fences, one sphere tree | Five archetypes rebuilt with PBR stucco, barrel tile or shingle roofs, fascia and soffits, framed glass with mullions and sills, raised-panel garage doors, porches, chimneys, vents, downspouts, block walls with gates, driveways, walkways, mulch beds, lawns, mailboxes, path lights, a pool | Architectural character and material depth |
| Roads | Noise asphalt, thin curb boxes, no intersection detail | PBR asphalt, gutters, stepped curbs, jointed sidewalks, crosswalks, stop lines, manholes, driveway aprons, stop signs, street-name blades | Roads now sit in the terrain and intersections read as places |
| Landscaping | Instanced sphere canopies and shrub balls | Twelve instanced species: fan palms with fronds and dead skirts, mesquite and olive, three shrub types, agave, two flowering plants, barrel cactus, rocks, boulders; deterministic yard plans avoid driveways, walks and the condenser; street palms and open-desert scatter | Las Vegas identity and variety without repetition |
| Headquarters | Two dark boxes on a bare slab, sign larger than the van | Two-storey office with glass storefront, mullions, punched windows, floor band, parapet, canopy and wordmark; ribbed-metal service building with block wainscot, animated bay doors, bollards, wall packs and bay plates; striped lot with wheel stops, light poles, curbs and palm islands; equipment yard, dumpster enclosure, perimeter wall; human-scale monument sign; upgrade annexes | HQ must read as a growing professional company |
| Characters | Box limbs, no joints, no hands | Articulated rig with elbows and knees, hands, boots, belt pouches, role uniforms; clips for idle, walking with a tool bag, kneeling inspection with a multimeter, kneeling repair with a wrench, standing review with a tablet, lifting, training; feet on the ground, facing the unit | People at the normal camera distance |
| Lighting | One static sun, flat hemisphere, no reflections, drei Sky | Sun from the game clock, warm low-angle light, gradient sky dome with sun glow, matched fog, hemisphere and ambient tracking the time, exposure curve, PMREM studio reflections on paint and glass, lamps and office glass at dusk | Cinematic yet natural |
| Weather | Static HUD string | Deterministic daily weather: clear, heat wave (haze), overcast (flat light), monsoon (dark sky, rain streaks); eased transitions | Visually distinct days |
| Camera | 42° FOV, 18 m zoom floor, generic start view | 38° FOV, 5 m zoom floor, hero composition framing HQ, the van and the neighborhood, cinematic focus with optional azimuth | Players can appreciate detail and the launch frame sells the game |
| Quality | Low / Medium / High | Low / Medium / High / Ultra affecting shadow map, DPR, vegetation density and rain | Scales to hardware |

## Before and after

Same seed (42), same paused game state, same camera commands, same viewport (1920×1080), High preset.

| View | Before | After |
| --- | --- | --- |
| Full neighborhood | `before/01-neighborhood.png` | `after/01-neighborhood.png` |
| Headquarters exterior | `before/02-headquarters.png` | `after/02-headquarters.png` |
| Service van close-up | `before/03-van-closeup.png` | `after/03-van-closeup.png` |
| Customer residence | `before/04-residence.png` | `after/04-residence.png` |
| Technician diagnosing | `before/05-technician.png` | `after/05-technician.png` (after shot aimed from the unit side with the new azimuth focus) |
| Fleet marketplace | `before/06-fleet-marketplace.png` | `after/06-fleet-marketplace.png` |
| Driving scene | `before/07-driving.png` | `after/07-driving.png` |
| Evening | `before/08-evening.png` | `after/08-evening.png` |

Note: the opening service call moved from lot `a-s-2` to `c-n-4` so its pin is visible inside the new hero framing; the residence comparison view still points at the same house.

## Performance

Measured on the production build with the in-scene probe (`window.__egoRender`), 1920×1080, High preset, in this cloud container (ANGLE / Vulkan / SwiftShader software rasterizer, no GPU).

| Metric | Before | After |
| --- | --- | --- |
| Draw calls, startup view | 1,352 | 515 |
| Draw calls, HQ view | 997 | 451 |
| Triangles | 70,678 | 622,248 |
| Geometries in memory | 1,025 | 375 |
| Textures in memory | 15 | 42 |
| Instanced meshes | 0 | 13 |
| Time to interactive (new game) | ≈ 3.5 s | ≈ 1.3–1.5 s (shader compile dominated; later runs cached) |
| Asset download | 372 KB JS+CSS (gzip) | 398 KB JS+CSS (gzip) + 1.69 MB glTF vehicles (uncompressed; hosts typically gzip to ≈ 40%) |
| JS heap after load | 39–52 MB | measured 52 MB in the container |
| Frames per second | not measurable here | **not measurable here** |

The container cannot produce FPS, 1% lows or GPU memory figures: SwiftShader renders at 2–3 fps at 1080p regardless of scene content. [Requires local GPU testing.] Based on the counts, a midrange discrete GPU should hold 60 FPS: 515 draw calls and 0.6 M triangles are modest, and the heaviest cost is the 4k shadow map, which the Medium preset halves. The honest risk is fill rate from overlapping translucent rain and the sky dome at Ultra DPR 2× on 1440p-class displays.

Optimizations applied: all 32 houses merged into one mesh per material (about 22 draws total), roads merged per material, HQ merged, vegetation instanced per species, glTF geometries re-indexed, textures generated once and cached, React UI updates throttled so the render loop stays on the GPU path.

Not done: level of detail, texture atlases, baking static geometry to glTF, occlusion of distant lots.

## Automated test results

Unit (Vitest): 17 of 17 simulation tests pass unchanged (determinism, routing, accounting, 90-day campaign).

Browser (Playwright, production build, headless Chromium with SwiftShader):

| Project | Spec | Result |
| --- | --- | --- |
| desktop-1080p | `gameplay.spec.ts` (17-step loop: dispatch, diagnose, repair, pay, hire, buy, assign, second job, train, improvement, save, reload) | passed, 6.9 min at 1.0 fps (SwiftShader) |
| desktop-1080p | `graphics.spec.ts` (WebGL draw calls, glTF van fetched and mounted, 32 houses, workers, instanced layers, selection, routed driving with wheel spin and render-follows-simulation check, technician at the correct lot clear of the wall, diagnosis, payment, clean console) | passed, 3.0 min |
| laptop-768p | `graphics.spec.ts` | passed, 2.0 min |

The first full-suite run on the merged-neighborhood build timed out the gameplay spec at 420 s. Root cause: the heavier scene renders at about 1 fps under SwiftShader and the game loop clamped catch-up time to 0.25 s per frame, so simulated time ran at a quarter of wall time and the 17-step loop no longer fit. Fix: the clamp in `src/app/gameLoop.ts` is now 1.0 s (still bounded, so a tab switch cannot spiral), and the Playwright per-test timeout is 600 s. No assertion was removed or loosened; the test polls state exactly as before.

Two defects were found and fixed by the regression itself during the overhaul: the opening pin was off-screen from the new hero camera, and the animation probe sampled too rarely for software-rendered frame rates.

## Unfinished visual work

- Characters are procedurally articulated, not skinned; no celebration beat at job completion; install crews do not carry visible equipment to the pad.
- No LOD; vegetation density is the only distance-cost lever.
- Mesquite and olive canopies remain low-poly blobs compared with the palms.
- Evening lacks long shadows because the sun's shadow elevation is clamped at 3.4° to avoid acne; a shadow-cascade pass would fix it.
- The warehouse and competitor buildings received PBR materials only indirectly; they were not rebuilt.
- No post-processing (ambient occlusion, bloom) by design; the directive asked for restraint and it keeps the render budget predictable.

## Launch

```powershell
git clone https://github.com/Egorsky14/Y- HVAC-Company-Owner-V3-ThreeJS
cd HVAC-Company-Owner-V3-ThreeJS
git checkout v3-premium-graphics
npm install
npm run dev            # http://127.0.0.1:5173
# or
npm run build; npm run preview   # http://127.0.0.1:4173
node tools/assets/build.mjs      # regenerate glTF vehicles
```
