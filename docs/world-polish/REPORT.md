# World Immersion 3.1: targeted visual quality correction

Date 2026-10-28. Local branch `feature/v3-world-visual-polish`, from `67b0538` (World Immersion 3.0).

- **Code commit:** `6280723`.
- **Not pushed, deployed or merged.** Production is untouched.
- **Simulation unchanged:** the routing graph, playable lots, addresses, customers and economy are untouched. The background stays visual-only, and tests check this.

## Result

| Gate | Status |
|---|---|
| Overview: fewer conspicuous empty rectangular blocks, less repetition | Met for the blocks around the district; open desert remains in the outer valley by design |
| HQ: more operational composition without inventing fleet or staff | Met, a moderate change |
| Technician: more natural kneeling, contact and tool interaction from several angles | Met |
| Phone street GPU no worse than 3.0 | Met: −1.1% against 3.0 |
| Regression suite | 21/21 browser, 124 unit (3 skipped), tsc, lint, build |

## Priority 1: valley composition

All changes are in `hinterlandLayout.ts`, `Hinterland.tsx` and `Ground.tsx`.

- **Tract identity:** each subdivision draws a builder palette of two or three stucco colours and two roof colours, its own share of two-storey plans, lot sizes (17–23 m by 24–30 m), street orientation and age.
  - Tracts near the district are established, with mature trees and lawns.
  - Young tracts at the valley edge have small trees and gravel.
  - Result: neighbouring tracts no longer look identical. Some read cream with tan roofs, others stucco with red tile.
- **First ring around the district:** these blocks were bare scrub rectangles. They are now established tracts, estate homes with an inner row, desert parks, a school, or a tract mid-build-out.
- **New land uses:**
  - Phased build-outs: a finished phase, graded land with ragged edges, roughed-in streets and spoil piles.
  - Commercial corridors along arterial frontages.
  - Neighbourhood parks with rounded turf and a pool.
  - Desert parks.
  - Transmission lines (lattice towers and sagging conductors) on two utility easements.
  - Rounded golf fairways, greens, bunkers and lakes.
- **Desert planting:** stands of very different sizes, gathered by a coarse noise field, with bare ground between them, ragged margins along the parcel edges, and denser riparian planting along washes. Previously the planting was an even scatter.
- **Terrain map:** parcel tints have ragged, blurred edges instead of hard rectangles. Graded land shows lighter soil with track marks, and vegetation stands are painted into the open desert.
- **Remaining:** the outer valley (beyond about 1 km) still has open desert superblocks. The section-line arterial grid itself stays a grid, which is accurate to Las Vegas.

Sheets: `compare/A1`–`A7` (the overview from three angles, both boundaries, the west horizon, golden hour).

## Priority 2: headquarters

All new items are clear of every fleet stall, the route corridor, the bay door lanes and parked cars. `HQ_OPERATIONS_SOLIDS` exports their footprints, and the tests check them.

- **Tree island** in the open east half of the lot: curbed, with rock and mulch, mesquite and palo verde trees and understorey. This breaks up the largest stretch of empty asphalt.
- **Receiving door** on the service building's yard wall: a roll-up door with a header and light, dock bumpers, bollards, a hatched loading zone kept clear, and a delivery of two stretch-wrapped units on pallets with a pallet jack.
- **Full legal name:** "EGO HVAC SERVICES LLC" in lit letters on a black backer over the office's lot-side glazing, facing visitor parking.
- **No invented growth:** no fleet or staff were added. Visitor cars still follow business hours and staff cars still equal the real staff count.

Sheets: `compare/B1`–`B3`.

## Priority 3: technician

Changes are in `Worker.tsx` and `serviceCall.ts`, plus the bag placement in `LiveEntities.tsx`.

- **Kneeling:** the kneeling knee pad now rests on the ground (knee joint 7 cm up). That shin rises to a tucked-toe ankle 16 cm up, with the boot angled down to the toes. The forward boot is planted flat at standing ankle height. Before, the kneeling knee hovered and the rear foot was flat in the air. Tested with a forward-kinematics replay.
- **Arm IK:** the solver now accounts for the torso's twist and side bend as well as its lean, so hands stay on target when the body turns.
- **Reach for tools:** the repair loop's reach now goes into the tool bag. The bag is set down beside the technician's free-hand hip, 17 cm clear of both legs. The kit places it exactly where his hand goes, and he turns and bends toward it. Tested: the hand lands within 3 cm of the handles, and the bag clears the legs.
- **Unchanged:** the diagnosis and repair loops, game-paced timing, transitions and the earlier IK tests are preserved.

Sheets: `compare/C1`–`C8` (profile at fixed loop times, both side views, arrival).

## Performance against 3.0

Figures are from back-to-back paired runs on the same machine (`final-perf.json`).

| View | 3.0 ms | 3.1 ms | Change |
|---|---|---|---|
| Overview | 6.86 | 6.73 | −1.9% |
| North-east boundary | 4.87 | 4.78 | −1.8% |
| South-west boundary | 4.53 | 4.47 | −1.3% |
| Street | 5.93 | 5.86 | −1.2% |
| HQ | 6.34 | 6.24 | −1.6% |
| Phone overview | 3.38 | 3.35 | −0.9% |
| Phone street | 2.83 | 2.80 | **−1.1%** (the +13.3% regression against `ef407c7` is not worsened) |

- **Geometry:** triangles fell 2–3% (fewer, clustered desert plants). Draw calls rose by at most 9: rounded ground layers and the power lines.
- **Service, golden-hour and night views:** these were timed only in the first full run, where the baseline ran in a slower GPU state. Those numbers favour 3.1 and are not used as evidence.

## Tests

- **TypeScript, ESLint and production build:** pass.
- **Vitest:** 124 passed, 3 skipped (the opt-in scenarios), 0 failed. New:
  - kneeling ground contact;
  - bag reach with torso twist and side bend;
  - bag clear of the legs;
  - HQ tree island and receiving clear of stalls, corridor, bay lanes and cars (added to the existing clearance test);
  - existing world-isolation tests: no scenery on playable lots, streets or scenic roads, and the routing graph unchanged.
- **Browser matrix at `6280723`:** **21/21 passed** (`browser-matrix-6280723.txt`). Run one case at a time, with a memory gate, exact exit codes and no leftover processes.

## Evidence

- `before/` and `before-390/`: the 3.0 build (`67b0538`).
- `after/` and `after-390/`: the 3.1 build.
- `compare/`: 22 sheets.

The capture script is the World Immersion one, unchanged. One preview server ran at a time.

## Known limitations

- **Outer valley:** open desert superblocks remain beyond about 1 km. Distant buildings are still boxes up close.
- **Retained from 3.0:**
  - limited moving activity inside the district;
  - phone diagnosis camera occlusion;
  - the phone street view is still +12% against `ef407c7` (−1.1% against 3.0).
- **Gauge-reading frame (`C2`):** the profile frame catches a different moment of the diagnosis loop than in 3.0 (kneeling rather than standing). That is timing, not a defect.
- **Partial metrics file:** `after/metrics-service-views.json` holds only the final service-view recapture. `final-perf.json` is authoritative.
