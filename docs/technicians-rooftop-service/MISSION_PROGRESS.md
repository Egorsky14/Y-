# Technicians + Rooftop Service — mission progress

Branch: `feature/v3-technicians-rooftop-service` (local only; no push, merge or deploy without the owner's authorization).
Base: `16d4be4` (feature/v3-cinematic-camera; contains bbc2558 Cinematic Service Camera 2.0, Supply Depot, Banking, Operations Center).

Specs: the owner's "HUMAN CHARACTER REVOLUTION + ROOFTOP HVAC OPERATIONS" brief and the "AUTONOMOUS EXECUTION UNTIL MISSION COMPLETE" directive (in the session transcript). Re-read both after any context reset.

## Architecture decisions

- **Character (hybrid):** a Blender-generated continuous skinned body (`tools/blender/technician.py` → `public/models/characters/technician.glb`), Skin modifier + subdivision for organic joint transitions, custom distance-based skin weights, A-pose bind. Bones carry the existing rig's joint names (pelvis, torso, head, armL/R, foreL/R, legL/R, shinL/R, footL/R) so `Worker.tsx`'s pose code and arm IK drive it unchanged. Gloves, tools and the cap attach to bones (bones are Object3Ds). Bind inverses are recomputed at load from the canonical joint table, so Blender bone rolls do not matter.
- **Ladder ownership:** the existing `ladder-rack` vehicle upgrade (the starter van has it; its effect text already said "Unlocks rooftop package-unit jobs") is the ladder. One Blender ladder object per such vehicle: on the rack, carried, leaning on the building, carried back. The procedural racks lose their baked-in ladders.
- **Equipment location:** derived from the customer record and the building: `package-unit` equipment on a flat-roofed building (modern houses, commercial lots) is on the roof; everything else stays on the ground. Schema 5 migration.
- **Simulation phases:** rooftop jobs get a longer `arriving` phase (ladder retrieval, setup, climb) and a pack-up phase after completion (collect tools, descend, ladder back on the truck) before the van leaves. Revenue and completion stay where they were (completion), never tied to animation. Visual choreography is a pure function of progress; the visual runs at its own pace but never falls behind the simulated phase, and a loaded save resumes at the matching point.

## Status

| Phase | State |
| --- | --- |
| A. Character foundation | in progress |
| B. Rooftop assets | not started |
| C. Flagship commercial rooftop call | not started |
| D. Residential rooftop + unsupported access | not started |
| E. Camera, polish, LOD | not started |
| F. Validation | not started |

## Log

- 2026-10-31: branch created from 16d4be4; repository survey done (Worker.tsx rig, serviceCall.ts choreography, workflow.ts phases, cityLayout, vehicle racks, Blender pipeline at tools/blender).

## Next action

Capture "before" technician screenshots (`e2e/technician-showcase.spec.ts`) on the unmodified build, then write `tools/blender/technician.py`.
