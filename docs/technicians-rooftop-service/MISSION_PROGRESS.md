# Technicians + Rooftop Service — mission progress

Branch: `feature/v3-technicians-rooftop-service` (local only; no push, merge or deploy without the owner's authorization).
Base: `16d4be4` (feature/v3-cinematic-camera; contains bbc2558 Cinematic Service Camera 2.0, Supply Depot, Banking, Operations Center).

Specs: the owner's "HUMAN CHARACTER REVOLUTION + ROOFTOP HVAC OPERATIONS" brief, the "AUTONOMOUS EXECUTION UNTIL MISSION
COMPLETE" directive (session transcript) and the handoff package in `hvac_rooftop_handoff/` (00–04). Re-read them after
any context reset. Gates G0–G5 are from `hvac_rooftop_handoff/00_READ_FIRST.md`.

## Architecture (as built)

- **Character** — `tools/blender/technician.py` builds a signed-distance anatomy (smooth unions of ellipsoids and round
  cones), polygonised with surface nets, smoothed, decimated; weights from the same primitives. Three builds + LOD, four
  faces, five hair styles, three beards, cap, boots, polo/belt/pocket details, skinned to 13 bones named like the game rig.
  `src/world/characters/technicianModel.ts` merges worn parts per material (cached per appearance) and binds them to a
  skeleton built from the joint table; `Worker.tsx` clips/IK drive the bones unchanged; leg IK and ladder clips added
  (motion ref with hand/foot targets). Appearance = pure function of `look`.
- **Rooftop data** — `src/game/world/rooftops.ts`: roof deck/parapet, certified ladder access points, unit spots with
  service side and work spot, van service pose, per-site access/pack-up minutes, `roofAccess()` eligibility (24 ft ladder
  at 4:1, vehicle with `ladder-rack`). Placement: packaged unit on a building with a unit spot → roof.
- **Simulation** — `workflow.ts`: unreachable roofs cannot be accepted; ladderless vehicles cannot be dispatched; rooftop
  calls get an access phase (`spec.accessMinutes`) and, after the job closes and its money is booked, a pack-up phase on
  the vehicle (`vehicle.packUp`, `spec.packUpMinutes`, ticked in `tick.ts`). Rooftop units are repaired only (replace
  quote refused; not flagged replacement-worthy). Save schema 5 adds the fixed commercial customers.
- **World** — `src/world/buildings/CommercialSites.tsx` (Mesquite Plaza strip with 3 RTUs, Desert Ridge Offices with 2),
  residential rooftop units on modern homes (ground condenser skipped). Blender kit `tools/blender/rooftop_kit.py`.
- **Choreography** — `src/world/scene/rooftopChoreo.ts`: pure function of time, one ladder pose per frame (rack in the
  vehicle frame or world). `LiveEntities.tsx` WorkerView plays it at its own pace, floored at the simulated phase (van
  pull-in shares the first 25 % of the access phase); LadderView draws the vehicle's one ladder.

## Status

| Gate | State | Evidence |
| --- | --- | --- |
| G0 baseline | done | `before/`, `perf/before.json` |
| G1 human technician | done (polish pending) | `after/`, `perf/after.json` (ten techs 1398 → 826 draw calls) |
| G2 roof assets and data | done | `rooftop/1-plaza.png` … `5-modern-roof.png`; unit tests |
| G3 full ladder loop | done at Mesquite Plaza (1×) | `rooftop/01-to-rack.png` … `18-depart.png`; `src/tests/rooftopChoreo.test.ts` |
| G4 game integration | sim tests done (`rooftopService.test.ts`); browser save/load and 5× pending | |
| G5 optimize/extend | pending: rooftop service camera, modern-home browser run, mobile, 10-tech stress | |

## Commits

- `52d0f6c` showcase spec + before evidence
- `7f4f154` G1 skinned technician
- `38a1d5f` rooftop simulation (placement, access, phases, schema 5)
- `e4ea5c8` G2/G3 assets, buildings, ladder choreography, e2e evidence
- `17ddf53` scenery-overlap test timeout

## Known issues / next actions (in order)

1. Rooftop Property / Watch Work / Detail camera (ServiceDirector + serviceCall assume ground units at house lots).
2. Inspector: rooftop label and a roof-access note on leads/jobs (unsupported roof, missing ladder).
3. Browser evidence at a modern home (side-yard path), at 5×, save/load mid-climb, mobile 390×844.
4. Repair clip: far hand reaches over the head (pre-existing in the old rig too).
5. Ten-technician multi-day stress with Operations Center on (unit test exists for 10 techs; add a browser perf pass).
