# World Continuity & Immersion 3.0: final report

Date 2026-10-28. Local branch `feature/v3-world-immersion`. Nothing pushed, deployed or merged;
production (`ccr-9ef3ffbb-g9q8fs`) untouched.

## 1. Executive result

**COMPLETE, with one performance exception on the phone street view (section 14).**

- **World:** the district no longer sits on an endless tiled sand plane. It is now one neighbourhood in a Las Vegas valley:
  - all 12 street ends continue into the valley;
  - beyond them are arterials, parkways, walled subdivisions, estate homes, retail centres, business parks, a golf course, schools and washes;
  - the desert floor no longer repeats visibly;
  - hazy ranges sit 1.4–2.3 km out.
- **Technician:** hands are placed on the real cabinet by IK. Diagnosis and repair are multi-phase work loops: probe with the meter, rise to read the gauges, wrench, reach for parts, check the fan. All of it freezes when the game is paused.
- **Turquoise overlay:** the 22–30 m selection rings that cut through houses are now thin corner brackets on the lot outline.
- **HQ:** a solar carport over the staff row, work staged at the bays, "EGO FLEET" stall markings, EV chargers, and visitor cars that follow business hours.
- **Activity:** traffic runs on the valley arterials, with lights at night; trees and palms sway in GPU-driven wind.

## 2. Starting commit

`ef407c7` (Environment Revolution 2.0, verified preview).

## 3. Final local branch and commit

`feature/v3-world-immersion`. Code is final at `2eaeecb`; this report and its records are the last commit.

| Commit | Content |
|---|---|
| `403236b` | Baseline capture script and before screenshots |
| `5ef211b` | World continuity (hinterland, terrain, mountains) |
| `602ea8d` | Technician IK and work loops; lot-outline selection |
| `523bd6e` | Operational HQ; ambient traffic; vegetation wind |
| `09ee744` | Checkpoint after the low-memory stop |
| `4957b35` | Exact arm IK; technician IK and HQ clearance tests |
| `a229288` | More timed capture views |
| `2eaeecb` | Lighter Medium tier; Lambert-shaded traffic |
| `90feb5b` | Matched evidence and comparison sheets |

## 4. Code and asset inventory

New:
- `src/world/city/hinterlandLayout.ts`
- `src/world/city/Hinterland.tsx`
- `src/world/vehicles/AmbientTraffic.tsx`
- `src/tests/hinterland.test.ts`
- `src/tests/worldImmersion.test.ts`
- `docs/world-immersion/` (capture and compare scripts, evidence, records)

Changed:
- `Ground.tsx`
- `Vegetation.tsx`
- `Atmosphere.tsx` (fog range)
- `GameScene.tsx`
- `Worker.tsx`
- `LiveEntities.tsx`
- `Selectable.tsx`
- `House.tsx`
- `Headquarters.tsx`
- `HeadquartersBuilder.ts`
- `Commercial.tsx`
- `ParkedCars.tsx`
- `parkedCarSpots.ts`

No GLB assets were added. Everything new is procedural and instanced.

## 5. World-continuity architecture

`hinterlandLayout.ts` is pure and deterministic. No simulation code reads it, and it never touches the road graph or lots (tests check both). It contains:

- **Scenic roads:**
  - the six playable streets continue both ways as collectors with the same cross-section;
  - eight section-line arterials each way;
  - two landscaped parkways.
- **Superblocks between the roads:**
  - walled tract subdivisions with lot pads, garages, driveways, pools and trees, plus modern infill;
  - corner retail centres;
  - tilt-up business parks;
  - a golf course with a lake;
  - schools;
  - undeveloped desert.

  Density falls with distance and toward the western foothills.
- **First ring:** around the district, the parcels beyond the playable lots get natural desert with trees, estate homes facing the outer road, or a school. That gives a gradient rather than a wall of houses.
- **Washes:** three natural washes run between the arterials. Subdivisions leave them open.

`Hinterland.tsx` renders it as follows:
- Scenic roads within 520 m use the playable streets' PBR materials; beyond that they use plain Lambert shading.
- Districts are instanced meshes per roughly 1 km chunk: buildings, roofs, three ground layers, crowns, trunks and scrub.
  - Buildings get a window shader, lit at night.
  - Tall commercial boxes get only a street-level office band.
- Night street lights are drawn as points.
- Nothing casts shadows or takes part in picking.

## 6. Terrain and background

**Desert floor:**
- A painted macro map multiplies the sand texture with terrain tone, washes, disturbed ground under districts, and road shoulders.
- Two sand samples at unrelated scales and rotations remove the tile repeat.
- Detail fades to the mean colour with distance and is not fetched at all beyond about 1.1 km.
- The floor is drawn after the other opaque geometry, so roads and lots depth-reject it. This was the decisive optimisation.

**Mountains and atmosphere:**
- Three ranges sit at 1.4–2.3 km, higher and closer to the west (Spring Mountains).
- They keep 38% of their contrast through the haze.
- All of them stay inside the 3 km far plane from any camera position. The camera-centred sky dome does not write depth, so it never hides them.
- The bajada rises beyond 1.25 km and swallows the road ends.
- Fog runs from 300 to 2,900 m.

## 7. Road extension method

- Every playable street end at ±215 m continues with the identical cross-section: asphalt, gutters, curbs, sidewalks, dashes.
- Crossing roads cut gaps in curbs, sidewalks and markings.
- Roads end out of sight under the rising terrain.
- The scenic roads are a separate list. `buildRoadGraph()` still only knows the six playable streets (tested).

## 8. Technician model changes

- Gloved hands with fingers and an opposed thumb.
- Deltoids that rotate with the arms (previously the shoulder caps stood out as balls).
- A trapezius slope from collar to shoulder.
- A rolled polo collar with a teal placket.
- Short sleeve hems.
- Cargo pockets on the thighs.
- The head is about 1:7.5 of body height.

## 9. Technician animation

- **IK:** two-bone arm IK in `Worker.tsx` targets points on the actual cabinet. The distance from `workPosition` to `condenserPosition` and the unit size per home (0.92 m, or 1.08 m on premium homes) come from `LiveEntities.tsx`. A forward-kinematics replay test puts the hands within 2 cm of each target.
- **Diagnosis (12 s loop):** survey, then kneel, then probe the panel terminals with the meter held up, then rise to read the gauges with one hand on the cabinet edge.
- **Repair (14 s loop):** wrench at the valves with the free hand braced on the cabinet top and the forearm rolling with each pull, then reach down for a part, then lean over the fan guard.
- **Other states:** the walk has heel strike and shoulder counter-rotation, and idle stands with a hand on the belt.
- **Timing:** clip time advances with the game pace (paused means frozen; fast-forward is capped at 1.5×) and restarts on each state change. Joint blending smooths every transition.
- **No simulation impact:** nothing here changes job timing, routing or state.

## 10. Service overlay

- **House lot selection:** the 22 m-diameter teal ring crossed walls and the house. It is now four corner brackets on the lot outline that fade at service close-up range (14–34 m).
- **HQ, depot and competitor:** the 26–30 m radius rings are brackets too.
- **Job ring at the unit:** 0.98–1.06 m instead of 1.0–1.25 m.
- **Selection still works:** the click volumes are unchanged.

## 11. Headquarters

All new HQ items are clear of the eight fleet stalls, the stall-to-apron corridor, the bay door lanes and parked cars. `HQ_OPERATIONS_SOLIDS` exports their footprints, and the tests check them.

- **Solar carport** over the staff row: columns behind the south curb, panels on a cantilevered canopy.
- **Work staging** against the service building between bays 1 and 2: a rolling tool chest, a condenser on a hand truck, and nitrogen cylinders chained upright in a wall rack.
- **"EGO FLEET" stencils** on the stalls in use. The count follows the real fleet-stall upgrades.
- **EV chargers** at the visitor row.
- **Visitor cars:** five during business hours, one after 18:00. These are customers and vendor reps, not employees; staff cars still equal the real staff count.

The main lot stays fairly empty with a small company, which is accurate.

## 12. Ambient activity

- **Traffic:** instanced cars on the scenic arterials and parkways only.
  - Those roads are not in the routing graph and never enter the district, so cars cannot meet company vehicles.
  - Cars keep to right-hand lanes and pass out of sight where the roads sink under the bajada.
  - Head and tail lights show at night.
  - Motion is paced by the game: stopped when paused.
  - Density: 30% on Medium, none on Battery Saver.
- **Wind:** a GPU vertex sway on vegetation that grows with height and is paced by the game. Measured cost: zero.
- **Inside the district:** activity is unchanged apart from wind and the HQ visitor cars. Moving cars on the playable streets would share lanes with the company vans, and that was judged unsafe without a collision system.

## 13. Visual comparisons (`docs/world-immersion/compare/`)

Every sheet uses matched before/after captures: seed 42, the same camera commands and clock, the same game state.
- `before/` and `before-390/` come from the `ef407c7` build.
- `after/` and `after-390/` come from the `2eaeecb` build.

**Flagship sheets:**

| Sheet | Shows |
|---|---|
| `A-city-is-not-an-island.jpg` | Maximum overview: the tiled sand plane becomes a valley of neighbourhoods |
| `B1`–`B5-technician-*` | Profile views at fixed loop times. The baseline holds one static kneel; the new technician probes, reads the gauges, uses the wrench, reaches for the bag and checks the fan |
| `C-headquarters-operational.jpg` | The HQ overview |
| `D1-traffic-at-district-edge.jpg` | Traffic just outside the district |
| `D2-night-occupancy.jpg` | Lit windows and street lights across the valley at night |
| `D3-street-inside-district.jpg` | The interior street, almost unchanged (see section 12) |

**Other sheets:**

| Sheets | Content |
|---|---|
| `01`–`05` | Overview from two more angles, both boundaries, west horizon |
| `06`–`10` | Service call: arrival, diagnosis, diagnosis side, repair, repair side, service site |
| `11` | Selected lot (overlay fix) |
| `12` | HQ yard |
| `13`–`16` | Golden hour and night |
| `17`–`19` | Phone |

## 14. Performance

Method: GPU timer queries with vsync off. The second-round alternating pairs on the same machine are the reliable figures (`final-perf.json`).

**Desktop (1080p, High quality):**

| View | Baseline ms | Final ms | GPU change | Draw calls | Triangles |
|---|---|---|---|---|---|
| Overview | 6.68 | 6.86 | +2.7% | 936 → 1,001 (+6.9%) | 1.62M → 2.20M |
| NE boundary | 4.57 | 4.87 | +6.6% | 489 → 534 (+9.2%) | 1.47M → 1.96M |
| SW boundary | 4.16 | 4.50 | +8.2% | 496 → 541 | 1.45M → 1.95M |
| Street | 5.80 | 5.98 | +3.1% | 508 → 559 | 1.51M → 2.04M |
| HQ | 6.51 | 6.31 | −3.1% | 779 → 839 | 1.63M → 2.16M |
| Diagnosis | 4.50 | 4.81 | +6.9% | 627 → 679 | 1.57M → 2.07M |
| Repair | 4.36 | 4.75 | +8.9% | 621 → 673 | 1.58M → 2.07M |
| Golden hour | 6.45 | 6.55 | +1.6% | 930 → 995 | 1.62M → 2.20M |
| Night | 6.15 | 6.29 | +2.3% | 928 → 995 | 1.62M → 2.16M |

**Phone (390×844, Medium, two rounds):**

| View | Baseline ms | Final ms | GPU change |
|---|---|---|---|
| Overview | 3.09 | 3.38 | **+9.4%** |
| Street | 2.51 | 2.85 | **+13.3%: over the preferred 10% target** |

**Notes:**
- **Within budget:** desktop GPU stays under the 10% target in every view, and draw calls under 15%.
- **Triangle growth:** about 32–35% more. This is explained: it is the surrounding world, instanced, unshaded by shadows, and Lambert-shaded.
- **Round 1 (full runs):** the GPU ran faster during the after run, so every view showed lower after times. That round is not used as evidence.
- **Phone street exception:** attribution put the extra cost entirely on the surrounding world and the traffic seen through the phone's wide portrait view.
  - Medium was then thinned to 30% traffic and 25% distant scrub, and traffic switched to Lambert shading.
  - Wind and the new terrain shader cost nothing extra (terrain is cheaper than before).
  - The remaining +0.34 ms is the central world improvement itself, so it was not removed.
- **Memory:**
  - Captures: lowest free RAM 1,646 MB, lowest free commit 1,811 MB.
  - Browser matrix: lowest free RAM 1,502 MB, lowest free commit 1,395 MB, peak test browser 2,114 MB.

## 15. Unit and static checks (HEAD)

- TypeScript: pass.
- ESLint: pass.
- Production build: pass.
- Vitest: **121 passed, 3 skipped** (the opt-in scenarios), 0 failed, 18 files. New:
  - `hinterland.test.ts` (7 tests):
    - the routing graph stays inside the district and the playable streets are unchanged;
    - every street end is continued;
    - no scenery sits on lots, streets or scenic roads;
    - the layout is deterministic and the valley floor flat;
    - the open-desert query reports roads and built parcels correctly;
    - ambient traffic stays on arterials, inside the asphalt and outside the district.
  - `worldImmersion.test.ts` (5 tests):
    - arm IK puts the hand within 2 cm of each target and stays finite out of reach;
    - HQ operations stay clear of all eight fleet stalls and the route corridor, and of the bay door lanes and parked cars;
    - visitor cars follow business hours.
- Existing asset validation (`graphicsAssets.test.ts`) and environment tests still pass.

## 16. Browser tests

**21 of 21 passed**: 0 failed, 0 skipped, 0 not run (`browser-matrix-90feb5b.txt`).
- The run covers save/load, the service-call workflow, the camera and job pin, banking, Supply Depot, automation, and mobile layouts.
- Runner settings:
  - one case, one worker, one browser at a time;
  - unique output directory per case, traces kept on failure;
  - exact exit codes recorded;
  - memory gate before each launch and abort guard during each case;
  - no leftover browsers or servers.

## 17. Known defects and limitations

1. **Phone street GPU +13.3%** on Medium (section 14).
2. **Little visible life inside the district.** No moving traffic on the playable streets (section 12). Wind is not visible in stills.
3. **HQ main lot sparse** with a small fleet. This is accurate to the simulation.
4. **Distant buildings are boxes** with a window pattern and hip roofs. They read well from the strategy camera but not up close at the district edge.
5. **Phone diagnosis frame (W12c):** the baseline's camera puts the technician behind a porch post in both builds.
6. **The reach-to-bag phase** reaches beside the knee, not to the job-site bag's exact position.
7. **Partial timing files:** `before/metrics-service-views.json` and `after/metrics-service-views.json` hold only the last service-view capture. `final-perf.json` is authoritative.

## 18. Memory-related limitations

- **First attempt:** the final capture batch ran two preview servers at once and was stopped by the system's low-memory guard. Partially re-shot baseline files were restored from git, and the batch was not restarted until authorised.
- **This validation:**
  - only one server ran at a time, and it was stopped with its child processes, with the port verified closed;
  - phases ran in the foreground in chunks under 10 minutes;
  - each browser launch waited for 3.4 GB free RAM and 4.0 GB free commit, and each run would abort its own processes below 0.9 GB RAM or 1.2 GB commit.
- **Why 3.4 GB rather than 4 GB:** the user's other applications held free RAM at about 3.5–3.7 GB. The prior and current single-browser runs peak at 1.3–2.1 GB, so the floor stayed at 1.4 GB commit or more. No run aborted.

## 19. Recommendation

**Ready for a separate Vercel Preview.** It has not been pushed or deployed; that needs your authorisation.

- All four objectives are visibly delivered and the gameplay regressions are clean.
- Desktop performance is within budget.
- The one exception (phone street +13%) is explained and limited to Medium.
- Suggested follow-ups:
  - lighter hinterland chunking for phones;
  - safe ambient life inside the district (pedestrians, or traffic that yields to company vehicles).
