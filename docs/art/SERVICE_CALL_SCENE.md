# Service-call scene: arrival, exit, walk-up and service

Branch `work/v3-art-pipeline-performance`. Scope: the moment a technician arrives at a house and
starts work. Evidence: matched captures (seed 42, the tutorial job at c-n-4) from
`docs/art/scripts/servicecall.cjs`, sheets in `docs/art/servicecall/compare/` (gameplay view and
close review, before | after) via `servicecall-sheets.cjs`.

## Audit of the previous scene

| # | Weakness | Kind |
| --- | --- | --- |
| 1 | The van stopped where the route ended: on the street centreline, in the lane away from the house | staging |
| 2 | The technician appeared inside the van body (at its centre point) the instant it stopped | animation, staging |
| 3 | The walk was the simulation's straight-line interpolation over 1.5 game minutes: ~25 m in 1.5 s at 1× (0.3 s at 5×), through yard planting, with heavy foot sliding | animation |
| 4 | He carried the bag while walking, then it vanished and the whole kit popped in at the unit | staging |
| 5 | The condenser's service panel and line set faced the house wall (yaw −90°); the technician knelt at the unit's side corner with a hand on its top deck | staging, contact |
| 6 | Workers were drawn at 1.12× on a rig modelled at ~1.8 m: ~2.0 m tall, the 0.96 m unit read knee-high | scale |
| 7 | The kit sat behind the technician, out in the yard; the gauge hoses were three straight sticks on the ground | staging |
| 8 | No help framing the moment; the van tag floated over the road | composition |

## What changed

All visual pacing is in the render layer (`src/world/scene/serviceCall.ts`, `LiveEntities.tsx`). The
simulation still decides arrival, phases and timing; save data and economy are unchanged.

| Area | Change |
| --- | --- |
| Parking | On arrival the van pulls from the route's end into the curb lane on the house side along a cubic curve tangent to its arrival and parking headings (a U-turn when it came from the other way; 1.6 s, 3.2 s for a U-turn), steering and wheel spin following the motion. It parks nose toward the condenser side, ~1 m short of the unit's line so a corner crosswalk stays clear. Leaving, it eases out of the lane. The van tag follows the parked van. |
| Exit | The technician stays hidden while the van parks, waits 0.5 s, then steps out of the curb-side sliding door (passenger side, never into traffic) over 0.6 s. |
| Walk-up | A real walk from the door to the work spot at 1.5 m/s (the walk cycle's stride rate), easing into and out of the stride, carrying the bag, turning smoothly along the path; the stride phase now advances with ground speed (`Worker` `pace`), so feet do not slide. Pacing follows game speed (1×, 2×) and is capped at 3× so 5× reads as a brisk fast-forward. At the unit he stops, turns to face the panel over 0.5 s, then kneels. A game loaded mid-job starts at the unit. |
| Unit | The house condenser turns its service face to the street-side approach: service panel centred on that face, suction and liquid service valves (brass bodies, stem caps, service ports pointing out of the face) at its corner nearest the wall, line set from the wall into the valves inside a wall cover (`addCondenser` options `panelX`, `serviceValves`; other units unchanged). |
| Work spot | `workPosition` (shared with the simulation) puts the lead technician in front of the panel, just past the unit's centre line; extra crew stand on the open side. The unit test's "clear of the wall" check and the graphics spec's wall check still hold. |
| Scale | Workers drawn at true scale (1.0, ~1.8 m with per-person 0.94–1.06 build variation). |
| Kit | Re-authored in Blender in the unit's frame (see `ASSET_PIPELINE.md`): manifold hung on the cabinet's top edge on the open side of the panel, gauges facing the street at kneeling eye height; blue hose to the suction port and red to the liquid port, couplers seated on the port tips; yellow utility hose coiled on the ground; bag set down behind his right side; cylinder beside the unit on install jobs. In game the kit sits on the unit and appears when the technician sets the bag down; the gauges follow 1.2 s later, as if just hooked up. The premium house's larger unit gets an offset so the couplers still meet its valves. |
| Camera | A player following the van gets the arrival framed once it has parked: van, yard and unit from the street side. No camera change otherwise. |

Timeline at 1× (tutorial job): van parks 1.6–3.2 s, door at +0.5 s, walk ~11 s for ~16 m, kneel,
gauges 1.2 s later; ~16 s from curb to gauges. At 5× about 5 s.

## Validation

- Before/after sheets: `compare/1-arrival.jpg` … `compare/5-service.jpg`.
- Blender close-ups of the staging on a stand-in unit: `docs/art/previews/kit-front.png`,
  `kit-top.png`, `valves-close.png`.
- `tsc`, ESLint, Vitest 20/20, production build: pass. Playwright 4/4 (gameplay loop, whose kit
  check now requires the gauges to be hooked up, and graphics at 1080p, 1366×768, 1024×768, whose
  rendered-technician and wall-clearance assertions are unchanged); gameplay loop 3/3 runs.
- No console errors in any capture.

## Remaining defects in this scene

1. **Departure**: when the job completes the simulation puts the technician straight back into the
   van, so he vanishes at the unit and the van leaves. A walk back to the van needs the van to wait
   (simulation timing) or a visual hold.
2. **Hand contact** is approximate: the kneel pose was not re-posed for this unit; hands land on the
   manifold and panel area but are not IK-placed on the gauges or a tool.
3. **Premium unit**: valves and face line up through the offset, but the manifold hook sits ~14 cm
   below that taller cabinet's top edge.
4. **Walk path** is a straight line up the condenser side of the yard; on lots where a specimen tree
   or planting sits near that line the technician can brush past it. No sidewalk-then-path routing.
5. **Door**: no door animation; the step-out is staged by timing and placement.
6. **Bag** is still the boxy hard-sided model (open-top tote redesign recommended earlier).
7. The amber job ring around the unit is drawn under the technician and the kit during service.

## Recommendation for the next visual milestone

Finish the service moment, then the departure: (a) re-pose the kneel for the new panel height with
hands on the manifold knobs and a meter probe at the valves, (b) a walk back to the van with the
van holding for it, (c) an open-top tool tote, (d) the condenser detail from the parked WIP
(wrapped louvers, fan guard) rebuilt in Blender in the same frame as the kit so the staging stays
exact.
