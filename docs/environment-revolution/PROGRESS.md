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

Next: HQ service yard, landscaping and roof equipment; golden hour, night and phone checks; final
captures, comparison sheets, browser matrix, report.
