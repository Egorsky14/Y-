# Environment Revolution 2.0: progress record

Branch `feature/v3-environment-revolution` (local only), from `942846a` (`feature/v3-graphics-revolution`,
the verified Graphics Revolution preview). No push, merge or deploy. No simulation, economy, save,
road-graph, lot, address or job-location changes.

## How to capture and measure

```
VITE_PROFILE=1 npx vite build --outDir <dir>
npx vite preview --outDir <dir> --host 127.0.0.1 --port 4180
node docs/environment-revolution/scripts/capture.cjs <label> http://127.0.0.1:4180 docs/environment-revolution [WxH] [--perf] [--only=E01,...]
```

Seed 42, simulation paused, HUD hidden, fixed camera commands and clock (10:00, 17:30, 21:00).
GPU time from `EXT_disjoint_timer_query_webgl2`, vsync off; only alternating paired runs of the
baseline and new builds in the same session are compared.

## Baseline (942846a)

`before/` (1920×1080) and `before-390/` (390×844), 0 console errors. Six-house view: 436 draw calls,
1.10M triangles (both passes).

## Audit: most damaging environmental weaknesses (ranked)

| # | Where | Why it looks artificial | Fix | Subsystem | Verify |
|---|---|---|---|---|---|
| 1 | Every backyard | One flat tan plane, one identical patio set, nothing else | Archetype property plans: zones, patios, beds, islands, trees, furniture | `yardLayout.ts` → new `propertyPlan.ts`, `HouseBuilder.ts` | E01, E03, E11–E13 |
| 2 | Between rows | 14 m empty sand strip between back walls dominates the overview | Common-area greenbelts | new `greenbelt.ts` | E01 |
| 3 | Front yards | Large bare areas, evenly spaced shrubs, same accents everywhere | Front zone, island/corner/mid beds, service path, clusters | `propertyPlan.ts` | E01, E02, E14 |
| 4 | Ground | Lot gravel indistinguishable from desert sand; no zoning | DG, four decorative rocks, mulch, soil, turf, pavers, travertine, flagstone | `pbr.ts`, `materials.ts` | close-ups |
| 5 | Neighbourhood | Same composition repeated on 32 lots | 8 archetypes clustered by street row, no identical neighbours | `propertyPlan.ts` | tests |
| 6 | Furniture | Box chairs, cone umbrella, box grill on every lot | Blender yard kit (12 parts) instanced | `tools/blender/yard_kit.py`, `YardProps.tsx` | close-ups |
| 7 | Premium pool | Flat cyan plane | Recessed pool, coping, shelf, steps, deck; minority of lots | `PropertyBuilder.ts` | E04 |
| 8 | Facades | Same treatment per style | Archetype stucco palettes, shutters, stone pilasters, stucco walls | `HouseBuilder.ts` | E02 |
| 9 | HQ | Large empty lot surfaces and roofs | Service yard, landscaping, roof equipment | (pending) | E06, E07 |

## Log

- Property plan system (8 archetypes, exclusion zones, deterministic) with 10 tests; plan renderer;
  new ground and paving textures; Blender yard kit; instanced yard props; new species (palo verde,
  cypress, yucca, desert grass, groundcover); common-area greenbelts.
- First paired GPU measurement: +21–33% (over budget). Attribution by hiding groups: vegetation
  (main and shadow pass) and stacked ground layers. Fixes: base ground only in the side band, beds
  drawn before zones, quadrant chunks with frustum culling for numerous species, single-sided closed
  plants, no shadows from small plants and shrubs, cheaper small-plant geometry, 38% fewer bed plants.
- Paired GPU after optimisation (two rounds, 1080p High): six houses +8.3%, backyard −5.2%, HQ +5.5%,
  street +6.6% (budget 10%). Draw calls +20% (six houses), triangles +40%.

- ee5cbb1 HQ site detail (roof solar array, makeup-air unit, gas and conduit runs, walk pads; yard
  racking and growing stock; parking-island understorey; east-strip trees) and environment tests.
- c963460 Modern-minimal backyards (planted rhythm, tree-lined side bed, stepping pads, fire-pit
  lounge); archetype close-up views E16–E18.
- 4857ba6 Backyard trees placed before the understorey (every backyard has canopy); tree far LOD;
  yard props baked into two static meshes; boulder and yucca shadows off. Final paired GPU: six
  houses +7.6%, backyard −6.5%, HQ +5.5%, street +5.9%, night +7.1%; draw calls +13.5%.
- Final evidence: after/, after-390/, 14 sheets in compare/, final-perf.json. Golden hour, night and
  phone reviewed.
- Validation at 4857ba6: tsc, lint and build pass; vitest 109 passed, 3 opt-in skipped.
- Browser matrix at 4857ba6 (one case at a time): 13 passed, 1 failed (desktop automation: scene
  not ready in 120 s; cause unconfirmed), 1 interrupted and 6 not run. The system's low-memory
  guard stopped the run, and per its instruction it was not restarted.
  Record: browser-matrix-4857ba6.txt.

## Final validation (2026-10-27)

- Desktop automation failure investigated:
  - 12 instrumented runs on 4857ba6 passed: the case alone, the matrix order twice, and five
    repeats. Each run kept its trace, screenshots, console, network and memory in its own directory.
  - Traces were clean: 0 failed requests, all GLBs served, 0 page errors, scene ready in about 4 s.
  - Not reproduced; cause unconfirmed (it is consistent with a WebGL context loss or GPU-process
    restart during start-up).
  - Record: automation-investigation.txt.
- a7c245e logs WebGL context loss and restore to the console. It is the only code change in this
  validation and does not affect rendering.
- The matrix runner now gives each case its own artifact directory (trace and screenshot kept on
  failure) and stops safely on low memory.
- Final browser matrix at a7c245e: 21/21 passed, all exit 0, no leftover browsers, free commit
  memory at least 1,758 MB. Record: browser-matrix-a7c245e.txt.
- tsc, lint and build pass; vitest 109 passed, 3 opt-in skipped. docs/screenshots restored after
  every e2e run.
- The comparison sheets were inspected again (six houses, classic, family, rental, desert-garden
  and upscale backyards, HQ, mobile); no defects.

## Continuation checkpoint

- **Branch:** `feature/v3-environment-revolution` (local), from 942846a. The final code commit is
  a7c245e; the validation documentation commit follows. Nothing pushed, merged or deployed.
- **Status:** ENVIRONMENT REVOLUTION 2.0: COMPLETE. Ready for a separate Vercel Preview on the
  owner's authorization.
- **Open note:** one unreproduced start-up failure, now instrumented.
- **Next milestone, after approval:** the weaknesses in FINAL_REPORT.md section I.
