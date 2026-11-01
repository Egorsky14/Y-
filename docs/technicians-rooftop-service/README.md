# Realistic technicians + rooftop HVAC operations

Branch `feature/v3-technicians-rooftop-service` (local). Progress log and gate status: `MISSION_PROGRESS.md`.
Owner handoff: `hvac_rooftop_handoff/`.

## What changed

**Technicians.** The capsule-and-ball rig body is replaced by a Blender-authored continuous skinned body
(`tools/blender/technician.py` → `public/models/characters/technician.glb`, 732 KB). The body is a signed-distance anatomy
(ribcage, pectorals, deltoids, biceps, quadriceps, calves… in smooth unions), polygonised with surface nets, so joints
flow instead of meeting as balls; skin weights come from the same anatomy. Three builds and a distant LOD, four face
shapes with lids and brows, five hair styles, three beards; a polo with collar, placket, teal yoke piping and sleeve
trim, EGO HVAC prints on the back and chest, belt, leather pouches, cargo pockets, knee panels, cap, laced work boots.
The existing clips and arm IK drive it unchanged (bones carry the rig's joint names); leg IK and ladder clips are new;
joint blending is now slerped (the old per-axis Euler blend could swing an arm over the head). Appearance is a pure
function of the employee's look seed; skills are untouched. A close character is ~11.5k triangles in ~10 draw calls.

**Rooftop equipment.** `tools/blender/rooftop_kit.py`: a manufacturer-neutral commercial RTU on its curb (service doors,
latches, data plate, coil guards, twin fans, economizer hood, disconnect, gas line) with a distant LOD, a residential
packaged unit on rails, and a 24 ft extension ladder (base and fly). New commercial customers east of Mesquite St:
Mesquite Plaza (retail strip, 4.0 m deck behind a 4.6 m parapet, three RTUs) and Desert Ridge Offices (two storeys, roof
out of ladder reach). Modern flat-roofed homes are built round a rooftop package unit (no ground condenser); every
other home keeps its split system on the ground.

**Roof access.** `src/game/world/rooftops.ts` holds explicit, certified data: roof deck and parapet, ladder access
points (foot, rest point, landing), unit spots (service side, work spot), the van's service pose, per-site access and
pack-up minutes. `roofAccess()` requires an access point a 24 ft extension ladder reaches at 4:1 (3 ft past the edge)
and a vehicle with the ladder rack (the starter van has one; the upgrade's effect text promised exactly this).
Unreachable roofs cannot be accepted (the lead expires normally, with the reason on the card); ladderless vehicles
cannot be dispatched to them.

**The service call.** The job engine stays authoritative. A rooftop call adds a bounded access phase (ladder off the
rack, carried, footed, raised, climbed, to the unit) before the diagnostic, and after the job closes, with its money
already booked, a pack-up phase on the vehicle (tools, climb down, ladder stowed) before it leaves. Rooftop units are
repaired, never replaced up a ladder (replacement quote refused: crane lift not offered). Save schema 5 adds the
commercial customers to older campaigns.

**Choreography.** `src/world/scene/rooftopChoreo.ts` is a pure function of time with exactly one ladder pose per frame
(on the rack in the van's frame, or one world pose): exit, walk to the rear, pull the ladder off the rack, shoulder-carry
it, foot it and walk it up, extend the fly, step on and climb rung by rung (hand and foot IK on the rungs), over the
parapet, to the RTU; then collect, back onto the ladder, climb down, retract, lower, lay it down, shoulder it top
first, carry it back, push it onto the rack, get in. It plays at its own pace but never behind the simulated phase, so
5× stays coherent and a loaded save resumes at the matching point (verified mid-climb in the browser).

**Camera.** `src/world/scene/rooftopCamera.ts`: Property, Watch Work and Detail for the ground, ladder and roof stages,
with the building's walls and parapets, every rooftop cabinet, the van, plants and poles as obstacles. The player's
own camera input still ends or overrides the service camera as before.

## Evidence (actual in-game captures)

| | |
| --- | --- |
| Before / after technician | `before/`, `after/` |
| Rooftop call, Mesquite Plaza (every stage) | `rooftop/01-to-rack.png` … `18-depart.png` |
| Rooftop call, modern home | `rooftop-modern/` |
| Sites | `rooftop/1-plaza.png` … `5-modern-roof.png` |
| Service camera (desktop and 390×844) | `camera/` |
| Save/load mid-climb and mid-descent | `persistence/` |
| Performance | `perf/` |
| Browser matrix | `matrix/browser-matrix.txt` |
