# Graphics baseline audit

Captured from the production build at commit `4924436` (branch `v3-premium-graphics` was cut from it), seed 42, day 1, paused game, 1920×1080, quality High. Screenshots: `docs/graphics/before/*.png`, metrics: `docs/graphics/before/metrics.json`.

## Measured baseline

| Metric | Value | Notes |
| --- | --- | --- |
| GPU renderer | ANGLE / Vulkan / **SwiftShader** (software) | Cloud container; no hardware GPU. FPS cannot be measured meaningfully here. |
| Draw calls (overview) | 1,352 | per-mesh house parts dominate |
| Triangles (overview) | 70,678 | low |
| Geometries / textures | 1,025 / 15 | all textures are runtime canvas textures |
| JS bundle (gzip) | 58 + 63 + 246 + 1 KB | index, react, three/r3f, runtime |
| Time to interactive (new game) | ≈ 3.5 s under SwiftShader | dominated by shader compilation |
| Console errors | none | two Three.js deprecation warnings |

## Largest visual weaknesses (prioritized)

1. **Vehicles are boxes.** Cargo body, cabin and hood are three stacked boxes; windows are flat planes; wheels have no tread or rims; no mirrors, handles, wheel wells, grille or glass depth. The star asset looks like a prototype. → Phase A.
2. **Houses read as stacked blocks.** Flat stucco color, single-plane windows without frames or depth, no eaves, no roof vents, no fences or block walls, no exterior lights, identical gravel yards, one sphere tree per lot. The premium home's entry intersected the roof. → Phase B.
3. **Roads float on the terrain.** Asphalt is a noise texture with no normal detail; markings are crisp but lane geometry is flat; curbs are thin boxes; sidewalks have no joints; no crosswalks, stop signs, street signs or manholes; driveway aprons are plain planes. → Phase B.
4. **Landscaping is monotonous.** Instanced sphere canopies on cylinders, identical shrub spheres, no palms, no agave variety, no mulch or lawn, no ground-cover variation. Distant mountains are hexagonal cones. → Phase B.
5. **Headquarters is a slab.** Two dark boxes with teal bands on a huge empty asphalt pad; the monument sign is larger than the van; the office has no entrance canopy, mullions or parapet detail; the yard has no equipment, bollards or curbs. → Phase C.
6. **Characters are mannequins.** Box limbs without elbows or knees, no hands, no boots, no tool bag; kneel pose slides the whole body down. → Phase D.
7. **Lighting is flat.** A single directional light with a hemisphere fill, no image-based lighting, no reflections on paint or glass, shadows at 4k but hard-edged; the sand is over-saturated and the sky washes out at the horizon. No time-of-day or weather response. → Phase E.
8. **Draw calls are high for what is drawn.** 1,352 calls for 71k triangles; static house parts should be merged and repeated props instanced. → Phase F.

## Plan

| Phase | Deliverable | Verification |
| --- | --- | --- |
| A | glTF asset pipeline (`tools/assets`), premium full-size van, compact van, pickup, box truck; runtime rig with paint, decals, rack, steering, roll/pitch, headlights; studio environment reflections | isolated viewer renders, in-game close-up, driving, marketplace |
| B | Five rebuilt house archetypes with PBR materials, block walls, lights, vents; roads with crosswalks, signs, gutters; palms, agave, shrubs, mulch, lawns; better mountains | high-angle and street-level captures; routes and selection unchanged |
| C | Headquarters rebuilt: office with mullions and canopy, two service bays with animated doors, yard, bollards, curbs, monument sign at scale | HQ capture during a departure |
| D | Articulated characters (elbows, knees, hands, boots, tool bag), role variants, state-driven animation set | technician capture at a condenser |
| E | Sun from game clock, weather per day (clear, heat wave, overcast, monsoon), exposure and tone mapping tuning, camera composition, quality presets Low/Medium/High/Ultra | evening and weather captures |
| F | Instancing, merged statics, LOD, measurements, regression suite at 1920×1080 and 1366×768 | metrics and Playwright results |
