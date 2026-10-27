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
