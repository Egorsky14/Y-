# World Continuity & Immersion 3.0: progress record

Branch `feature/v3-world-immersion` (local only), from `ef407c7` (the verified Environment Revolution
preview). No push, merge or deploy. No simulation, economy, save, road-graph, lot, address or
job-location changes.

## How to capture and measure

```
VITE_PROFILE=1 npx vite build --outDir <dir>
npx vite preview --outDir <dir> --host 127.0.0.1 --port 4181
node docs/world-immersion/scripts/capture.cjs <label> http://127.0.0.1:4181 docs/world-immersion [WxH] [--perf] [--only=W01,...]
```

Seed 42, simulation paused for every still, HUD hidden, fixed camera commands and clock (10:00, 17:30,
21:00); the service call is the tutorial lead dispatched with the owner and Unit 1. GPU time from
`EXT_disjoint_timer_query_webgl2` with vsync off; only alternating paired runs of the baseline (port
4180) and new build (4181) in the same session are compared.

## Baseline (ef407c7), commit 403236b

`before/` (1920×1080) and `before-390/` (390×844), 0 console errors. The four problems, as rendered:
the district is a rectangle on an endless tiled sand plane; all 12 street ends stop in open sand;
mountains sit close and read as flat walls; the technician kneels rigidly with his back to the
camera; HQ is dominated by asphalt; nothing moves.

## Phase 2: world continuity

- `src/world/city/hinterlandLayout.ts` (pure, deterministic, visual only): scenic roads (the six
  playable streets continued both ways as collectors, eight section-line arterials each way, two
  landscaped parkways), superblocks between them (walled tract subdivisions with lot pads, garages,
  driveways, pools and trees; modern infill; estate rows; corner retail centres; tilt-up business
  parks; a golf course; schools; undeveloped desert), three natural washes, density falling off with
  distance and toward the western foothills, and a first ring around the district of natural desert,
  estate homes and a school instead of a wall of tract houses.
- `src/world/city/Hinterland.tsx`: scenic roads in the playable streets' materials within 520 m,
  plain shading beyond; districts as instanced meshes per ~1 km chunk (buildings with a window shader
  that lights at night, roofs, three ground layers, crowns, trunks, scrub); night street lights as
  points. No shadows, no picking.
- `Ground.tsx`: a painted macro map (terrain tone, washes, disturbed ground under districts, road
  shoulders) multiplies the sand; two texture samples at unrelated scales and rotations remove the
  tile repeat; detail fades to the mean with distance. Floor drawn after the other opaque geometry
  (depth-rejected under roads and lots). Mountains moved to 1.4–2.3 km, higher and closer in the west
  (Spring Mountains), with partial aerial perspective; all inside the 3 km far plane from any
  camera position (the sky dome does not write depth).
- Fog range 300–2900 m (clear).
- Gate views reviewed: W01 from three azimuths, W02, W03, W13 (new horizon view), W10 golden, W11
  night. The district now sits inside a valley of neighbourhoods; every street end continues.
- Paired GPU after optimisation, W02 boundary: 4.48 ms vs 4.42 ms baseline. Attribution showed the
  floor's overdraw dominated; drawing it last pays for the new world.
- Tests: `src/tests/hinterland.test.ts` (routing graph and playable streets unchanged, every street
  end continued, no scenery on lots, streets or scenic roads, determinism, flat valley floor,
  open-desert query). vitest 115 passed, 3 opt-in skipped; tsc and lint clean.

## Phase 3: technician (602ea8d)

- Two-bone arm IK puts the hands on the real cabinet (distance from workPosition to
  condenserPosition, unit size per home). Diagnosis loop: survey, kneel, probe the terminals with the
  meter held up, rise to read the gauges. Repair loop: wrench at the panel with the free hand braced on
  the cabinet, reach to the bag, lean over the fan guard. Clip time follows the game pace (pause
  freezes it) and restarts on each state; transitions blend.
- Gloved hands with fingers and thumb, deltoids that turn with the arms, polo collar with teal
  placket, cargo pockets, head about 1:7.5 of height; walk with heel strike and counter-rotation.
- Lot selection: corner brackets on the lot outline (fade at close range) replace the 22 m ring that
  crossed walls and the house; HQ, depot and competitor (26-30 m rings) likewise; job ring slimmed.
- Reviewed: arrival (mid-stride with the bag), diagnosis side, repair side, selected lot.

## Phases 4-5: HQ and ambient life (523bd6e)

- HQ: solar carport over the staff row, apron staging between bays 1 and 2 (tool chest, condenser on
  a hand truck, chained nitrogen cylinders), EGO FLEET stencils on stalls in use, EV chargers, visitor
  cars by business hours. Nothing in the fleet stalls or the route corridor.
- Ambient traffic on scenic arterials and parkways only (not in the routing graph, never in the
  district), lights at night, paced by the game, none on Battery Saver. GPU wind on vegetation.
- vitest 116 passed, 3 opt-in skipped; tsc and lint clean.

## Checkpoint (2026-10-28): stopped by the low-memory guard

- The final capture batch (matched before/after, paired GPU timing, phone) and both preview servers
  were stopped by the system's low-memory guard during the first (baseline) run. Per its instruction
  they were not restarted. Completed before the stop: the new W13 baseline view (kept); partially
  re-shot baseline files were restored from the committed baseline. Orphaned preview servers started
  by this task were stopped; no test browsers left.
- Remaining, on authorization: final after/ and after-390/ captures with the final script (plus the
  baseline views added since 403236b: W07 follow, W08c, W14), paired GPU timing (two alternating
  rounds), compare sheets (scripts/compare.cjs), the 21-case browser matrix one case at a time,
  FINAL_REPORT.md.

## Final validation (2026-10-28, authorised)

- Memory-safe workflow: one preview server at a time (stopped with children, port verified closed),
  foreground phases under 10 min, launch gate 3.4 GB free RAM / 4.0 GB free commit, in-run abort at
  0.9 GB / 1.2 GB (never triggered). Runners: scratch `diag/run-captures.ps1`, `diag/run-matrix.ps1`.
- 4957b35: the arm IK missed off-axis targets by up to 7 cm (new forward-kinematics test caught it);
  replaced with an exact arm-frame construction. New tests: technician IK, HQ operations clearances.
- 2eaeecb: phone (Medium) street was +16%; attribution (districts, traffic, roads; wind and terrain
  free) led to 30 % traffic and 25 % distant scrub on Medium, Lambert traffic: now +13.3%, recorded
  as the one performance exception.
- Evidence: matched before/after (desktop and phone) and 30 comparison sheets; flagship B rebuilt
  from profile views at fixed loop times after the original service cameras showed too little
  difference; flagship D split into edge traffic, night occupancy and the (unchanged) interior street.
- Paired GPU (round 2): desktop +1.6% to +8.9% (HQ -3.1%); phone overview +9.4%, street +13.3%.
- Browser matrix at 90feb5b: 21/21 passed (`browser-matrix-90feb5b.txt`). vitest 121 passed,
  3 skipped; tsc, eslint, build pass.
- Status: COMPLETE (one phone performance exception). FINAL_REPORT.md written. Ready for a separate
  Vercel Preview on authorisation; nothing pushed, merged or deployed.
