# Character Art and Animation Production Brief

## Current problem to fix
Recent screenshots show narrow boxy torsos, cylindrical limbs, blocky boots, simple caps and stiff standing/working silhouettes. The improvement must be clear at both normal game zoom and cinematic service camera Detail mode. Maintain *premium stylized realism*, rather than chasing photorealism or adding invisible geometry.

## Character asset direction
- Work from the **current** character animation architecture. Decide whether to improve its procedural rig, retarget a new Blender-authored skinned character, or combine them. Choose a robust, testable option. Do not replace a functioning movement system merely because a new model looks good standing still.
- Reference proportions: consistent adult worker height, natural head-to-shoulder relationship, defined pelvis, shoulders, knees/elbows and tapered arms/legs. Compare against door, truck, roof ladder, condenser and hand tool in a shared scale reference scene.
- EGO uniform: graphite/black work polo with small EGO HVAC marks and teal piping; realistic pant creasing and pockets, protective work boots, gloves for relevant tasks, realistic belt/tool pouches. Role-dependent accents may distinguish service technician vs installer but not change game skills.
- Reduce blocky silhouette first: shoulder silhouette, curved torso, distinct hips, knees, boots, elbows, wrists. Face geometry can remain stylized but should avoid featureless toy look.
- Use deterministic character appearance from technician ID. Vary hair/face/headwear/height/body silhouette conservatively without introducing arbitrary changes to skills, timing or gameplay outcomes.
- Model/reuse one high-quality base and cheaper distant LODs. Suggested **initial budgets to benchmark**, not inflexible limits: close asset roughly 8–15k tris and a small number of shared materials; simpler distance meshes, simplified animation updates for offscreen or tiny characters. Measure on the user's actual machine before finalizing.

## Minimum clips / state coverage
| State | Visible proof required |
|---|---|
| Stand/idle | Balanced posture, subtle weight shifts, no snapping |
| Walk/turn | Foot-ground contact and heading changes, no skating |
| Hold/carry small tools | Tools aligned to hand/grip sockets |
| Ground diagnostic | Hands interact with meter/test leads and condenser panel |
| Ground repair | Task-specific tool use with plausible limb orientation |
| Lift ladder from rack | A single ladder transitions from rack to hands, no duplicate mesh |
| Carry ladder | Hands on rails, ladder orientation clears scenery |
| Position ladder | Smooth transition from carry to placed orientation |
| Climb up/down | Hands and feet coordinate with animated rung progression |
| Roof traversal | Boots remain in contact with walkable roof surface |
| Rooftop inspect/repair | Reach tools and panel without clipping |
| Return/stow | Ladder ends on the correct rack; technician enters end state |

## Integration rules
- Named anchor/bone sockets for hands, feet, tool holsters and ladder grip. Ensure mirrored geometry / orientation does not break a clip.
- Drive render animation from a single canonical visual-stage controller; avoid writing simulation revenue or job completion from Three.js animation callbacks.
- Blend locomotion/work/climbing transitions. Use IK or procedural alignment only where useful, and keep it off at distant LODs.
- No abrupt height teleport on roof entry. If a smooth ladder-to-roof transition cannot be reliably animated, flag the vertical slice partial instead of disguising the gap.
- Reset animations correctly on job cancellation, save/load, reassignment, job complete, and component remount.

## Evidence checklist
Record same-camera before/after screenshots: standing, walk, diagnose, repair, carry ladder, climb midpoint, rooftop stance, roof work. Add short stage-by-stage real-rendered captured frames when practical. Inspect hands (fingers/tool grip), knees, boots, helmet/cap, belt clipping, consistent human scale. Distinguish actual in-game captures from concept renders.
