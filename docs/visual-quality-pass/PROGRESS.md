# Visual Quality Pass: progress record

Branch `feature/v3-visual-quality-pass`, from `f6d86f0` (Graphics Revolution 2, pushed and
previewed). Local only: nothing pushed, merged or deployed.

## Done

### P0: service-call camera (`docs/camera-occlusion/`)

- **Occluders from scene geometry:** the bounds of every solid house part (walls, roofs, porch
  posts, garden walls, chimneys) are recorded while the neighbourhood is built, so they cost
  nothing extra.
  - Ground covers, the unit's own line set and disconnect, and pipes thinner than 16 cm are
    excluded.
- **Solver:** `solveClearView` searches azimuth steps of 10° either side, then a higher
  elevation, then a closer distance.
  - It accepts a view only when the segments to every key point miss all occluders, the camera is
    outside geometry, and every point is framed.
  - The key points are the technician's head and hands, the unit top, the service panel and the
    tool bag.
  - It is deterministic, and re-solving from its own answer returns the same view, so it cannot
    oscillate.
- **Root cause of the P1 defect:** the old close camera turned +0.75 rad from the curb heading.
  Lots are mirrored, so on half of them that turn swings toward the house.
  - The preferred view is now defined in the lot's own frame: the open, street-side corner of the
    unit.
  - That view is clear on all 32 lots on desktop and phone. The solver stays as a guard for
    manual orbiting and future close views.
- **"Watch technician":** the inspector shows it while a technician is on site. It flies an orbit
  path (rising over the roof on wide swings) to the clear close-up.
  - **Watch mode:** after the player lets go of an orbit or zoom at a blocked angle, the view eases
    once to the nearest clear angle. It never moves mid-drag, never in Photo Mode, and panning
    more than 8 m away ends the watch.
- **Safe areas:** the camera's projection centre shifts into the part of the screen the inspector
  leaves free, eased in and out. This covers the side panel on desktop and the bottom sheet plus
  the top HUD bar on phones.
  - Close-ups are framed inside that free area.
- **Phone distance:** the phone close-up is 5.6 m. Portrait screens keep landscape's horizontal
  coverage, so the earlier 8 m made the technician tiny.

### P0: technician

- **Gloves:** articulated, with four two-segment fingers and an opposed two-segment thumb. Each
  hand has relaxed and grip shapes, and a hand holding a tool closes round it.
- **Clamp meter:** jaw, display, dial and buttons, replacing the yellow box.
- **Test leads:** red from the meter to the probe, black to a clip on the panel edge. They sag
  like real cables and are recomputed every frame.
- **Adjustable wrench:** replaces the two-box wrench.
- **Cap:** a curved peak replaces the flat visor box.

### P1: contact shading

- Soft contact decals under each condenser (on the pad and round it), job-site props (bag,
  cylinder, owned Supply Depot equipment), fleet vehicles and the technician.
- Ambient-occlusion bands along the foot of every house wall and garden wall, as one merged mesh.

## Status

Complete. In-game framing reviewed on five lot types (desktop and phone) and fixed: clear
foreground, height capped at 0.56 rad, aimed at the work, sheet collapsed before solving. Paired GPU
timing done (all views within the 10% budget). Browser matrix 21/21 at b00467f. See FINAL_REPORT.md.
