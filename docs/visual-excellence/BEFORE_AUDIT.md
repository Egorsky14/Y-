# Visual excellence: baseline audit

Branch `v3-visual-excellence`, cut from `v3-premium-graphics` at `a98caef`. Captured from the
production build in headless Chromium (SwiftShader) at 1920×1080, with 1366×768 and 1024×768
subsets, seed 42, game paused, High preset. Files: `docs/visual-excellence/before/`.
Metrics: `before/metrics.json` (515 draw calls and 622k triangles at the overview; 451 calls at
the HQ view; 42 textures; 2.6 s to the first HUD frame including glTF vehicles).

The user's reference photo was taken from a monitor. Native captures confirm the exposure is
not blown out and colors are not shifted; the weaknesses are geometric and compositional, not
a rendering defect. The camera the player sees first (05) is the hero framing from the last
pass and it is fine at a glance; the problems appear the moment the camera moves closer.

## The 15 largest visible problems, in priority order

1. **Parking lot is a 51×41 m slab of uniform asphalt** (03, 01). One texture, no wear, no
   tire paths, two faint stripe rows, no customer parking, no arrows, no islands inside the
   lot, no stains. It is the single biggest area of the hero frame and reads as a placeholder.
2. **Office is one extruded rectangle** (01, 02). A single stucco box with a thin teal band and
   a floating canopy slab; no massing variation, no entry volume, no reveals, no downspouts,
   no wall lights, no mechanical screen. Rooftop units are gray boxes with a disc.
3. **Service building is a flat dark box** (01). Ribbed siding reads as flat black from the
   default camera; one bay door with no track, no interior behind it; blank wall where future
   bays go; no roof structure, no gutters.
4. **Palms are flat strips** (01, 03). Fronds are seven-segment tapered quads with no
   leaflet silhouette; from above they look like paper cut-outs. Trunks are a smooth taper.
5. **The service van is a soft box** (04, 04b). No wheel arches, wheels are dark discs,
   headlamps are white blocks, no grille depth, no door seams or handles, no mirrors visible
   from above, the ladder rack is a bare frame. The wrap is the strongest element.
6. **HVAC condenser is a gray cube with a disc** (07b). No fan grille, no coil fins, no
   service panel, no line set; the thing the game is about is the least detailed object.
7. **Technician reads as a mannequin** (07b). No face, no hands with fingers, a ball cap that
   is a sphere, a meter that is a yellow block; the kneel pose is right, the person is not.
8. **Ground textures are coarse blobs at close range** (07b, 06b). Yard gravel and sand use
   large soft ellipses that look like bubble-wrap at 6 m; shingles are oversized bricks.
9. **The yard east of the service building is 50 m of empty gravel** (01). Three pallets and
   a cylinder cage do not read as an HVAC contractor's yard.
10. **No visible operations at HQ** (01, 03). One owner standing in the middle of the lot. No
    staged equipment at the bays, no carts, no activity cue that this is a working company.
11. **Signage is paint on a wall** (02). The wordmark is a flat decal on a white plane; the
    monument sign is a thin dark slab; nothing is illuminated or dimensional.
12. **Entrance has no human-scale elements** (02). No planters, benches, bike rack, ramp,
    door hardware, bollards or mat; the canopy floats on two thin posts.
13. **Lighting is flat at the lot** (01, 03). The sun is high and cool for 7:30 AM; shadows
    are present but there is no ambient occlusion where walls meet pavement, so volumes float.
14. **Evening shot (10) is nearly identical to morning**: the eased atmosphere is still moving
    at capture time, and the warm hour is narrow; exterior lights do not yet read.
15. **UI is competent but generic** (09): the marketplace turntable is dim, the fleet panel has
    large empty areas, and icons are line glyphs with uneven weights.

## Per-view notes

| View | Observation |
| --- | --- |
| 01 HQ wide | Composition works; both buildings are boxes; lot dominates; palms flat |
| 02 entrance | Flat canopy, no vestibule depth, no door hardware; good glass reflections |
| 03 parking lot | Empty plane; shadows of palms are the only interest |
| 04 van | Wrap legible and correctly oriented; body is soft and under-detailed; light pole blocks the shot |
| 05 overview | Good hero framing; roads, houses and palms read as a tycoon city at this distance |
| 06 residence | Hip/gable roofs and tile normal maps read well at 42 m |
| 06b residence close | Shingle scale wrong; stucco flat; window frames good |
| 07 technician | Kneeling at the right spot, clear of the wall; ring marker clear |
| 07b technician close | Mannequin, cube condenser, blob ground |
| 08 driving | Van on the correct lane; sign and wall read; no street signage in frame |
| 09 marketplace | Turntable too dark; layout has dead space |
| 10 evening | Needs a visible golden hour and lit windows |

## What will not change

Simulation, routing, job lifecycle, economy, saves and the existing Playwright tests. All
vehicle routes inside the HQ lot (stall → apron → street) stay as they are, so the drive
lanes in the new site plan are laid out around them.
