# Visual excellence: quality report

Branch `v3-visual-excellence`, cut from `v3-premium-graphics` at `a98caef`. Final commit: the
head of the branch at delivery (`git log -1 v3-visual-excellence`).

Every image here is a native browser capture of the production build in headless Chromium with
the SwiftShader software rasterizer (no GPU in the build container), seed 42, same paused game
state, same camera commands, High preset. `before/` was captured at `a98caef`; `after/` at the
delivery commit. Matching 1366×768 and 1024×768 subsets sit beside the 1920×1080 frames.

## Summary

| Area | Before | After |
| --- | --- | --- |
| Headquarters | Two boxes, flat canopy, paint-on-wall sign | Layered office with pilasters, storefront, sunshades, ACM entry tower, copings, downspouts, wall packs, cameras, rooftop package units behind a screen; metal shop with real bay openings, sectional doors on tracks and fitted interiors |
| Parking lot | 51×41 m slab, two stripe rows | Visitor, accessible and fleet stalls, curbed islands with date palms, arrows, stop bar, hatched fire lane, tire wear, oil stains, catch basins, light poles with night pools |
| Yard | Three pallets | Chain-link yard with pallets of condensers, a package unit, duct stack, container, trailer, refrigerant cage, dumpster enclosure, cones, ladder |
| Vehicles | Extruded slabs, white-block lamps, disc wheels | Lofted shells with rounded roofs and hoods, lamp pockets with projectors and DRLs, grille, air dam, door outlines, mirrors, rear lamps, hinges, plates, dished steel wheels, tapered teal wrap sweep |
| Palms | Flat seven-segment strips | Mexican fan palms with fan fronds, dead skirts and boot-ringed trunks; Canary date palms with pinnate fronds |
| Houses | Clean boxes with good roofs | Finer stucco and shingle sets, tinted garage doors, solar arrays, trash bins, patio sets, grills, hoops, detailed condensers with disconnect and line set |
| Streets | Correct but bare | Lane wear, cobra-head street lights, hydrants, storm inlets |
| Characters | Mannequins | Faces, hair, caps with badge, tapered limbs, knee pads, boots with soles, belt pouches, role uniforms, pose blending, scaled for readability |
| Equipment | Gray cube | Louvered condenser with fan guard and spinning blades, rooftop package units, air handlers, gauge manifold and tool bag on site |
| Lighting | One sun, abrupt sunset | Twilight ramp, golden hour, magenta dusk, moonlight, cloud deck, wet monsoon pavement, lit windows, light pools under every fixture, two real lights at HQ |
| Camera / UI | Fixed pitch, no photo tools | Focus with elevation and look-at height, Photo Mode (HUD off, free camera, time and weather preview, PNG save), panel and inspector motion, brighter turntable |

## Matched comparisons

Each pair: `before/<name>.png` against `after/<name>.png`.

### 1. Headquarters wide (`01-hq-wide`)
- **Wrong:** both buildings were extrusions; the lot dominated the frame as one gray plane; the sign was a decal on stucco.
- **Changed:** office massing with a projecting charcoal entry tower and raised sign, pilaster rhythm, second-floor sunshades, copings as edge pieces so the light membrane roof reads; shop with three framed bays; the lot re-planned around the simulation's fixed stall and apron positions.
- **Better because:** the frame now has three distinct materials in the buildings, a readable site plan and a horizon of small objects (poles, bollards, planters, pallets) that give scale.
- **Limits:** no ambient occlusion, so wall-to-ground contact relies on the shadow map; the gravel strip east of the shop is still plain.
- **Cost:** HQ view draw calls fell (451 → ~370) because decals and props merge per material; triangles rose with the palms.

### 2. Headquarters entrance (`02-hq-entrance`)
- **Wrong:** a floating canopy slab, no vestibule, no hardware, no human-scale props.
- **Changed:** recessed vestibule with double doors and push bars, canopy on two columns with downlights and a teal underline, planters, bench, bike rack, bollards, mat, ADA stall and ramp at the walkway.
- **Better because:** the entrance reads as a place a person walks into.
- **Limits:** the canopy is heavy; interior behind the storefront is a dark tint, not a modeled lobby.

### 3. Parking lot (`03-parking-lot`)
- **Wrong:** empty asphalt.
- **Changed:** finer asphalt set with aggregate speckle, mottling and sealed cracks; visitor row with wheel stops, blue accessible stall, employee row, curbed islands with date palms and agave, arrows, stop bar, fire-lane hatching, soft tire-wear bands, oil stains at stalls and bays, catch basins.
- **Better because:** the lot has structure and wear without becoming noisy.
- **Limits:** no parked civilian cars by design (the directive forbids fake capacity); painted text is not used.

### 4. Full-size service van (`04-service-van`, `04b` rear)
- **Wrong:** soft box, no arches, lamp blocks, dark discs for wheels.
- **Changed:** beveled tub with real arches plus a lofted upper shell (rounded roof edges, tumblehome, curved hood, A-pillars), windshield with wipers, headlamp pockets with projectors and DRLs, grille, air dam, fog lamps, tow hooks, door outlines, handles, mirrors with repeaters, sliding-door track, rear lamps with reverse and turn segments, hinges, plate, roof ribs, vent, antenna, rack with ladders and conduit, dished steel wheels with lug holes; wrap sweep in teal with a white pinstripe and the plain wordmark (no illegible slogan).
- **Better because:** the silhouette is automotive from every angle and the wrap reads as applied vinyl.
- **Limits:** no interior, mirrors remain boxy, wheels are dark from above; 17k triangles per van (fine on a GPU, heavy for the software test renderer).

### 5. Neighborhood overview (`05-neighborhood-overview`)
- **Wrong:** acceptable at this distance; palms and roofs were the weak points.
- **Changed:** fan palms, solar arrays, patios, street lights, hydrants, wear; mountain color banding.
- **Better because:** more silhouettes and more per-lot variety at the same footprint.
- **Limits:** mountains are only visible from low Photo Mode angles.

### 6. Residence (`06-residence`, `06b` close)
- **Wrong:** oversized shingles, flat stucco.
- **Changed:** 22-course shingles with granule speckle, sand-float stucco with mottling, tinted garage doors, bins, patio set with umbrella and grill, hoop on some lots, solar on half the roofs.
- **Limits:** windows are still frame + flat glass; no interior lights per room.

### 7. Technician at the condenser (`07-technician-condenser`, `07b` close)
- **Wrong:** mannequin at a gray cube.
- **Changed:** louvered condenser with fan guard, service panel, pad, disconnect, conduit and line set; worker with a face, cap, knee pads, boots and a meter with leads; tool bag and gauge manifold staged on the ground; poses blend between states.
- **Better because:** the frame now says "HVAC service" without a label.
- **Limits:** no vehicle door animation; the technician appears at the curb rather than stepping out.

### 8. Vehicle on the street (`08-vehicle-on-street`)
- **Changed:** the new van body and wrap, brake and running lights, lane wear and street lights along the route.
- **Limits:** no civilian traffic.

### 9. Fleet marketplace (`09-fleet-marketplace`)
- **Changed:** brighter, larger turntable with a reflective floor and studio lighting, panel entrance motion.
- **Limits:** the right column still has empty space below the financing card.

### 10. Evening headquarters (`10-evening-hq`, `10b` night, `11` golden hour in Photo Mode, `12` monsoon)
- **Wrong:** evening looked like noon; the sun stepped below the horizon at 19:30.
- **Changed:** twilight ramp over two hours, golden sun and horizon, magenta dusk, moonlight, lit office and house windows, lit bay interiors, light pools under every street light, pole, wall pack and porch light, two point lights at the entrance and apron.
- **Limits:** light pools are additive discs, not shadow-casting lights; no long shadows at sunset because the shadow sun elevation is clamped against acne.

## Rendering and lighting configuration

- Renderer: three.js WebGL2 via React Three Fiber, ACES filmic tone mapping, exposure driven by the atmosphere (0.98 day, 0.68 night, +0.04 golden hour), PCF soft shadows (4k High/Ultra, 2k Medium, none Low), `preserveDrawingBuffer` for Photo Mode captures, synchronous shader-error checks off in production.
- Sun: direction from the game clock (sunrise 5:45, sunset 19:30, civil twilight ramp to -0.35 rad), intensity 2.7 × day + 0.14 × night, color white-warm to orange by elevation, shadow camera ±230 m.
- Sky: gradient dome with sun glow, hemisphere light tracking horizon and ground colors, fog matched to the horizon (380–1500 m clear, 220–900 heat, 280–1100 overcast, 140–650 monsoon), cloud deck at 420 m drifting at 0.0012 UV/s with cover 0.35 / 0.12 / 0.85 / 0.95.
- Night: lamp emissive 0.3 → 3.5, storefront and house glass emissive warm, bay strip lights 1.2 → 3.7, light pools 0.55 opacity additive, point lights 60 and 90 cd at 18 and 26 m.
- Materials: canvas-generated PBR sets (asphalt 512, stucco/shingle/sand/gravel/siding 384, others 256) with Sobel normal maps; shingle colors share one normal map; vehicles use physical clearcoat paint from the glTF.
- Quality presets: Low (no shadows, 1× DPR, 35% vegetation, no rain), Medium (2k, 1.25×, 70%, light rain), High (4k, 1.5×, 100%), Ultra (4k tight, 2×, 140%, heavy rain).

## Assets and licenses

All geometry and textures are original and generated by code in this repository (`tools/assets` for the four glTF vehicles, `src/world` for everything else). No third-party models, textures or sounds were added; no marketplace was used. Runtime libraries are MIT; the Inter font is SIL OFL 1.1. See `ASSET_LICENSES.md` and `docs/graphics/ASSET_MANIFEST.md`.

| Model | Triangles | Size |
| --- | --- | --- |
| full-size-van.glb | 17,158 | 796 KB |
| compact-van.glb | 16,280 | 750 KB |
| pickup.glb | 16,548 | 763 KB |
| box-truck.glb | 20,200 | 882 KB |

## Performance

METRICS_TABLE

Startup in the software renderer: the first rendered frame arrives about 15 s after "New game" (21 s before the texture-generation rework), of which about 9 s is shader compilation inside SwiftShader. On a desktop GPU the shader step is a fraction of a second; the canvas texture generation (about 2 s on this container's CPU) is the remaining cost and is a candidate for an offscreen worker.

**No frame-rate figure is claimed for real hardware.** This container has no GPU; SwiftShader renders the premium scene at about 0.6 fps at 1920×1080 (1.0 fps at the start of this branch, 1.6 fps on the base build). The 60 FPS target on a midrange GPU is unmeasured. The triangle budget (about 1.3 M at the hero view, two thirds of it instanced vegetation) and about 550 draw calls are within normal range for a discrete GPU; the first lever if a machine falls short is the Medium preset (70% vegetation, 2k shadows).

## Tests

TEST_TABLE

The Playwright per-test budget is 1200 s because the 17-step loop takes about 10 minutes at 0.6 fps; no assertion was removed or loosened. New checks on this branch: bay door opens while the van moves, rendered technician grounded within 1.5 m of the simulated spot, evening lowers exposure and sun, Photo Mode hides the HUD and restores it without changing cash, HUD and controls fit the viewport at 1920×1080, 1366×768 and 1024×768.

## Remaining limitations

- No skinned characters; no vehicle door or enter/exit animation; crews do not walk from the van to the pad with visible equipment (the carried box appears only during installs).
- No LOD; vegetation density is the only distance-cost lever. No ambient occlusion or post-processing by choice.
- Light pools are flat additive discs; only two real lights exist at night.
- Decal orientation is checked by eye in the captures, not by an automated test.
- The warehouse and competitor buildings were not rebuilt; the distant mountain rings only matter in Photo Mode.
- The software-renderer startup (15 s) is dominated by shader compilation; texture generation could move to a worker.

## Launch

```powershell
git clone https://github.com/Egorsky14/Y- HVAC-Company-Owner-V3-ThreeJS
cd HVAC-Company-Owner-V3-ThreeJS
git checkout v3-visual-excellence
npm install
npm run dev            # http://127.0.0.1:5173
# production build and preview
npm run build; npm run preview   # http://127.0.0.1:4173
# regenerate the glTF vehicles
node tools/assets/build.mjs
# full gate: lint, typecheck, unit tests, Playwright at three viewports
npm run check; npx playwright test
```

Press **P** in game for Photo Mode.
