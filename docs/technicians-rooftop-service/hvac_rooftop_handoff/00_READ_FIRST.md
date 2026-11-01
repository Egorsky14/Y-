# HVAC Company Owner V3 — Technician + Rooftop Mission Handoff

**Purpose:** Make a difficult character/art/animation/rooftop-gameplay assignment tractable for Claude Code. This is a technical design handoff, NOT evidence that the implementation exists.

## First actions
1. Inspect Git status, branches, local uncommitted edits and last validated code. Do not hard-reset or overwrite any work. The last reported cinematic camera branch was `feature/v3-cinematic-camera` at `bbc2558`; VERIFY rather than assuming it remains current. Create a separate local feature branch from the latest validated code that contains Operations Center, Supply Depot, and Cinematic Camera.
2. Inventory real implementation paths for existing character renderer/rig, GLB/Blender export scripts, vehicle rack state, fleet assignments, job status, pathfinding, customer HVAC metadata, camera modes, save migrations, and tests. Search the repository; paths named below are clues, not contracts.
3. Capture actual in-game character screenshots and a desktop/mobile frame-time baseline before changing assets.
4. Implement a single, fully playable **low-rise, flat-roof commercial HVAC repair** using an existing authorized, modeled access point and one ladder-equipped vehicle. Do NOT start by populating every roof or building a new game engine.

## Non-negotiable scope decisions
- One **better-looking, animation-compatible technician archetype** comes first, with a few deterministic appearance variants. Avoid building a complete character creator.
- One **manufacturer-neutral commercial rooftop unit** (RTU) on a believable curb is the first equipment asset. Use existing customer/job metadata to map a job to a roof; don't sprinkle units randomly.
- One **single logical ladder**: on vehicle rack -> carried -> placed -> climbed -> left in place -> descended -> stowed. Visual state must correspond to one source of truth.
- The first playable rooftop mission is a **service/repair call**, NOT a full RTU replacement. Heavy packaged-unit replacement needs separate crane/rigging/install mechanics; a technician must not carry a multi-ton RTU up a portable ladder.
- Roof access must be a gameplay eligibility check. Unsupported roofs, steep tile roofs without a valid modeled access method, or unavailable equipment become blocked/escalated states, not magic climbing.
- Roof access and animations are NOT a source of revenue or economic completion; the existing job state machine remains authoritative.
- Rooftop camera reuses Property / Watch Work / Detail modes, with vertical target updates and roof geometry occlusion handling.
- Start with a vertical slice, then expand to appropriate residential rooftops and commercial variants only after the complete loop passes.

## Milestone gates (must pass before next stage)
| Gate | Actual deliverable | Required proof |
|---|---|---|
| G0: baseline | Current repo map; saved screenshots and frame-time baseline | Branch/status recorded, screenshots exist |
| G1: human technician | Integrated improved body/uniform/rig/poses for existing ground call | Real screenshots: idle, walking, diagnostic, kneeling; existing job unchanged |
| G2: roof assets and data | Flat commercial roof, RTU and ladder-rack asset integrated | Camera screenshot, job targets real rooftop equipment, old saves load |
| G3: full ladder loop | Retrieve/carry/place/ascend/serve/descend/stow, one logical ladder | Browser/video/frame captures from actual gameplay; no teleportation; 1x/5x |
| G4: full game integration | Manual/automated repair + authorization, save/load, exceptions | Deterministic tests, ledger checks, blocked-access test |
| G5: optimize/extend | Camera/mobile/10-tech stress and selected valid roof variants | Measured frame times + QA report, no regressions |

## Exit criteria
- **COMPLETE** only when a real game build can execute G1–G5 with passing evidence. **VERTICAL SLICE COMPLETE** means G1–G4 work for the selected commercial flat roof but broader variants remain. **PARTIAL** means name precisely what failed, do not hide it.
- Claude may make all normal **local** creative/technical decisions and local commits. No push, production merge, deployment, force-push, paid assets, or destructive cleanup without separate authorization.
- Work within available session/tool limits. Do not promise unattended execution after a session dies. Record checkpoints after each gate at `docs/technicians-rooftop-service/MISSION_PROGRESS.md` and commit reversible milestones.

## Existing architecture clues to inspect
- Simulation and transitions: `src/game/simulation/`, `src/game/jobs/`, `src/game/operations/`
- Equipment / employee metadata: `src/game/equipment/`, `src/game/employees/`, `src/game/fleet/`
- World and equipment: `src/world/`, `src/world/scene/`, `src/world/buildings/`
- Camera: previous code referenced `src/world/scene/serviceCall.ts`, `CameraRig.tsx`, `cameraComposition.ts`
- Persistence: `src/persistence/`
- Screenshots/scripts/test harness: `docs/cinematic-camera/`, `e2e/`, `src/tests/`
These are hints from previous Claude logs; ALWAYS verify files and interfaces before editing.
