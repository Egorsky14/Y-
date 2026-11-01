# Technicians + Rooftop Service — mission progress

Branch: `feature/v3-technicians-rooftop-service` (local only; no push, merge or deploy without the owner's authorization).
Base: `16d4be4` (feature/v3-cinematic-camera; contains bbc2558 Cinematic Service Camera 2.0, Supply Depot, Banking, Operations Center).

Specs: the owner's "HUMAN CHARACTER REVOLUTION + ROOFTOP HVAC OPERATIONS" brief, the "AUTONOMOUS EXECUTION UNTIL MISSION
COMPLETE" directive (session transcript) and the handoff package in `hvac_rooftop_handoff/` (00–04). Re-read them after
any context reset. What was built and how: `README.md`.

## Status: VERTICAL SLICE COMPLETE, extended (G1–G4 done; G5 done except the items listed below)

| Gate | State | Evidence |
| --- | --- | --- |
| G0 baseline | done | `before/`, `perf/before.json` |
| G1 human technician | done | `after/`, `perf/after.json` (ten techs 1398 → 826 draw calls, frame time unchanged) |
| G2 roof assets and data | done | `rooftop/1-plaza.png` … `5-modern-roof.png`, unit tests |
| G3 full ladder loop | done (plaza and modern home, 1× and 5×) | `rooftop/`, `rooftop-modern/`, `src/tests/rooftopChoreo.test.ts` |
| G4 game integration | done | `src/tests/rooftopService.test.ts`, `e2e/rooftop-persistence.spec.ts`, `persistence/` |
| G5 optimize/extend | mostly done | `camera/`, `perf/load-after.json`, `matrix/` |

## Test record

- Unit: 220 passed, 6 skipped (24 files); typecheck and lint clean; production build passes.
- Existing browser matrix: 21/21 on 338bf02 (`matrix/browser-matrix.txt`).
- New and camera specs after 338bf02 (`matrix/new-specs.txt`): showcase, rooftop camera desktop + 390×844, ten-tech load
  passed; service-camera.spec failed (house park curve slowed by the long-pull change), fixed, then passed on 5 sizes.
- Final validation on ed5d28a (`matrix/final-validation.txt`): rooftop-service plaza and modern home, rooftop-camera
  desktop and 390×844 passed. The batch was then **stopped by Claude Code for low system memory** (not a failure);
  rooftop-persistence, rooftop-sites, technician-perf, service-camera-feedback and iphone-portrait service-camera were
  **not re-run on ed5d28a** (persistence and sites passed on 280b89d; service-camera-feedback passed after 338bf02).

## Commits

52d0f6c baseline · 7f4f154 G1 · 38a1d5f rooftop simulation · e4ea5c8 G2/G3 · 17ddf53 test timeout · 664abf6 camera/UI ·
280b89d persistence/modern · 338bf02 R12/R07 tests · ed5d28a elbow pole, slerp, load spec · (this commit) final evidence

## Known limitations

- Phone (390×844) ladder-stage Watch Work view is composed and unobstructed but wide (the technician is small).
- Carry/turn and roof traversal are scripted paths per site (no general roof pathfinding); two building types only
  (commercial strip, modern home); the office roof is deliberately unreachable.
- Rooftop replacements are refused (crane lifts not modelled); installers never go on roofs.
- Other crew members on a rooftop job wait by the van (service calls are one technician).
- Real phones not tested (Chromium emulation only); frame times are vsync-capped at 60 fps on the owner's machine.

## Next action

When memory allows, re-run the five specs listed above on the final commit, one at a time:
`npx playwright test e2e/<spec>.spec.ts --project=<project> --workers=1` (build first: `npm run build`), and record
them in `matrix/final-validation.txt`.
