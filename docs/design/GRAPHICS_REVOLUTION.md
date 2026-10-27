# Graphics Revolution

Branch `feature/v3-graphics-revolution` (local), from `67983b4` (Operations Center). Visual work only:
no simulation, economy, save-schema or automation code was changed. Evidence, scripts and the
progress log live in `docs/graphics-revolution/`.

## Art direction

Premium stylized realism for a browser management game: credible scale, strong silhouettes, PBR
materials under a believable Mojave sun, the EGO brand (black, graphite, controlled neon teal) on the
company's own vehicles, uniforms and HQ only, and a dry desert palette everywhere else.

## Weaknesses found in the baseline (ranked)

1. Lighting barely changed with the clock: 17:30 looked like 10:00; night was a muddy brown.
2. Faceted low-poly broadleaf trees, shrubs and boulders beside smooth PBR buildings.
3. Mountains as huge smooth domes with pale caps (dominant on phones, where the horizon shows).
4. Saturated lime lawns and palm fronds.
5. Supply Depot sign clipped and stretched ("JAVE HVAC SUPP"); the warehouse itself was a few boxes.
6. Technician built from boxes: slab boots, box torso and hips, oversized belt blocks.
7. Service van: small wheels floating in oversized arches, block headlamps, white-looking hood and
   windshield (reflections of an indoor studio environment), polygon stripes, no legal name.
8. Glaring flat-white HQ roofs; an empty HQ lot and empty driveways.
9. Every house in near-identical cream stucco.
10. Date palms with sawtooth fronds.

## What changed

| Area | Change | Files |
|---|---|---|
| Fleet vehicles (all four classes) | Lathed tires with six-spoke alloys; arches fitted to the tires (about 8 cm gap instead of 17 cm) with molded flares; swept headlamp units, framed grille, two-tone bumper with intake and skid plate; curved teal sweep and pinstripe; deeper metallic clearcoat paint; dark tinted glass | `tools/assets/lib.mjs`, `tools/assets/vehicles.mjs`, `public/models/vehicles/*.glb` |
| Livery | New flat decal with the bolt, EGO HVAC wordmark and the legal name "EGO HVAC SERVICES LLC · HEATING & COOLING", fitted to its panel, never bent over curved geometry | `src/world/assets/textures.ts` (`vehicleLiveryTexture`), `VehicleGltf.tsx` |
| Reflections (global) | Procedural desert-sky environment map (blue zenith, hazy horizon, warm sand, sun hot spot) replaces the indoor studio room | `src/world/scene/StudioEnvironment.tsx` |
| Technician | Lathed tapered torso, rounded hips, leather work boots with lugged soles, slim belt with buckle and leather pouches, rounded hands, EGO HVAC back print; skeleton, clips and timing unchanged | `src/world/characters/Worker.tsx` |
| Lighting | Late-afternoon warmth from about 16:30 rising to golden hour before sunset; stronger daylight contrast; cool moonlit night (blue moon, blue hemisphere); nearer haze for depth | `src/world/scene/Atmosphere.tsx` |
| Mountains | Ridged ranges (spurs and gullies) over the massifs, lower near range, twice the resolution, rock colours without pale caps | `src/world/city/Ground.tsx` |
| Vegetation | Broadleaf canopies, shrubs and flowering shrubs as smooth noise-displaced masses shaded dark underneath; rocks keep chiselled facets; drier palette; date palms with 34 pairs of narrow drooping leaflets | `src/world/city/Vegetation.tsx` |
| Turf | Muted irrigated-turf olive with dry and dark blade speckle and soft mottling | `src/world/assets/pbr.ts` (`lawnPbr`) |
| Houses | Ten Las Vegas stucco tints (soft whites, tans, adobe, taupe, sage gray) | `src/world/buildings/materials.ts` |
| Parked cars | New unbranded sedan and SUV (about 4.5k triangles); residents' cars in about half the driveways, HQ visitors, and one staff car per employee (the HQ lot fills as the company hires); instanced per material, per-car paint, not selectable | `tools/assets/vehicles.mjs`, `src/world/vehicles/ParkedCars.tsx`, `parkedCarSpots.ts` |
| HQ | Single-ply membrane roofs with roll seams and weathering | `src/world/assets/pbr.ts` (`membranePbr`), `HeadquartersBuilder.ts` |
| Supply Depot | Merged rebuild: tilt-up concrete panels with reveals, parapet coping and accent band, membrane roof with packaged units and skylights, five dock positions (ribbed door, seals, bumpers, leveler, canopy, light), PBR asphalt with a truck apron and guide lines, condensers on pallets; sign un-stretched and un-clipped | `src/world/buildings/WarehouseBuilder.ts`, `Commercial.tsx`, `textures.ts` (`signTexture` aspect and fit) |
| Vehicle condition | Paint picks up road dust and a duller clearcoat below 80 and again below 60 condition (no damage); the model only rebuilds when a threshold is crossed | `VehicleGltf.tsx`, `LiveEntities.tsx` |
| Camera | "Show on map" and job notifications frame the service site from the street side (van spot, technician and condenser together) instead of the lot centre from any angle | `src/world/scene/serviceCall.ts` (`serviceSiteCamera`), `JobsPanel.tsx`, `Overlays.tsx` |

## Asset pipeline

Vehicles are procedural three.js builders exported to glTF by `node tools/assets/build.mjs`, which
regenerates every vehicle GLB and the manifest; Blender-authored props (`tools/blender/*.py`,
`jobsite-kit.glb`, `supply-tools.glb`) were reused unchanged. Buildings, vegetation and terrain are
generated at runtime and merged per material. All assets are original project assets.

| Asset | Triangles | Size |
|---|---|---|
| full-size-van.glb | 30,459 (was 17,110) | 1,406 KB |
| compact-van.glb | 29,635 (was 16,280) | 1,363 KB |
| pickup.glb | 29,736 (was 16,548) | 1,369 KB |
| box-truck.glb | 38,268 (was 20,200) | 1,726 KB |
| civilian-sedan.glb (new) | 4,424 | 238 KB |
| civilian-suv.glb (new) | 4,582 | 248 KB |

## Tests added

`src/tests/graphicsAssets.test.ts`: every manifest asset is binary glTF 2.0 matching its byte count
and within budget; all fleet classes, both civilian cars and the Blender props are present; parked
cars are deterministic, the staff row follows the head count, and no car sits in or against any
fleet stall the HQ can have.

## Before and after

Matched captures (seed 42, paused, HUD hidden, same clock and camera command): `docs/graphics-revolution/before*/`
and `after*/` at 1920×1080, 1366×768 and 390×844, and side-by-side sheets in
`docs/graphics-revolution/compare/` (van close-up, van at the customer, service call, technician at
the unit, HQ, HQ parking, neighborhood, city overview, golden-hour street and overview, night,
Supply Depot, phone). Regenerate with `scripts/capture.cjs` and `scripts/compare.cjs`.

Caveat: the baseline technician close-ups were taken while he was still walking (the capture then
waited a fixed time); the after set waits until he is at the unit, so those two frames show
different moments of the same call.

## Performance

Intel Arc 140V, Chrome headless (ANGLE D3D11), 1920×1080, High preset, vsync off. GPU time from
`EXT_disjoint_timer_query_webgl2` around every render (median over 3 s), two alternating rounds of
the baseline build and this build in the same session (sequential runs drift, so only paired
numbers are compared). Data: `docs/graphics-revolution/final-perf.json`.

| View | GPU ms before → after | Change | fps before → after | Draw calls | Triangles |
|---|---|---|---|---|---|
| City overview 10:00 | 6.05 → 6.34 | +4.7% | 153 → 146 | 672 → 725 | 1.01M → 1.20M |
| HQ 10:00 | 5.95 → 6.24 | +4.9% | 156 → 150 | 638 → 712 | 1.01M → 1.20M |
| Neighborhood 10:00 | 4.91 → 4.98 | +1.5% | 193 → 189 | 392 → 440 | 0.99M → 1.14M |
| Service call (wide) | 5.45 → 5.64 | +3.5% | 171 → 164 | 532 → 586 | 1.04M → 1.21M |
| Technician at the unit | 4.73 → 4.87 | +3.0% | 197 → 190 | 516 → 565 | 1.04M → 1.19M |
| City overview 21:00 | 5.68 → 5.90 | +3.9% | 163 → 156 | 712 → 765 | 1.04M → 1.22M |

All views stay within the 10% budget. A mid-sprint version cost up to +12%; making only the large
crown blob subdivided and shrubs lower-detail (smooth normals kept) brought it down. The extra draw
calls are mostly the parked cars (one instanced mesh per material per model, plus shadows).

## Known limitations

- The full browser matrix was not completed: the system's low-memory guard stopped the run after
  the graphics spec had passed on desktop, 1366×768 and 1024×768; gameplay was interrupted and the
  other 17 runs did not start. It was not restarted automatically.
- Night still reads warm-brown on open sand (bright sand albedo under blue moonlight); readable,
  not yet a cool night palette.
- Backyards remain large plain gravel areas; the condenser model itself was not changed (its
  service side, valves, line set and disconnect were already detailed).
- Vehicle GLBs grew from about 0.8 MB to 1.4 MB each (rounded tires and alloys).
- No new truck-exit or walking animation work; vehicle and technician animation are unchanged.

## Next graphics milestone

1. Night grading (cooler albedo response at night) and HQ sign and window bloom-free glow.
2. Backyard landscaping variety (gravel patterns, pools, shade structures) from the yard plan.
3. Condenser variants (sizes and cabinet styles by system age) and visible tool use per phase.
4. Shadow-pass cost (about 2 ms): fit the sun shadow camera to the view.
5. Vehicle GLB size: index tires and alloys, or Draco/meshopt compression.
