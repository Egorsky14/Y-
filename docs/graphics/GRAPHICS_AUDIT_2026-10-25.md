# Graphics audit and first improvement — 2026-10-25

Branch `ccr-9ef3ffbb-g9q8fs` (contains graphics phases A–F). Working tree was clean at the start of
this session; no repository was created, no engine migration, no simulation rule changed.

## 1. Reality check against the brief

The brief assumed a functional-but-crude prototype (procedural cubes, crude vans, empty world).
That is not the current state. The premium overhaul already shipped: glTF vehicles with a Node
export pipeline, merged PBR houses in five styles, a rebuilt HQ campus, clock/weather lighting,
instanced desert landscaping, quality presets, 17 unit tests and a Playwright gameplay suite.
The EGO HVAC fleet identity (black paint, neon-teal accents, wordmark decals, roof rack) is
already implemented in `public/models/vehicles/*.glb` and `src/world/vehicles/VehicleGltf.tsx`.

What still reads as unfinished, judged from `docs/graphics/after/*` and the running game:

| # | Problem (actual implementation) | Visual gain | Complexity | Gameplay weight | Perf cost | Risk |
|---|---|---|---|---|---|---|
| 1 | Workers were blocky mannequins: featureless sphere head, box+capsule torso, thin capsule limbs (`src/world/characters/Worker.tsx`). Seen at the closest camera of the game, every job. | Very high | Medium | High | Low | Low (position logic untouched) |
| 2 | Evening looks like noon: 6:30 PM frame has no warm grade, no long shadows (shadow sun elevation floor 3.4° in `Atmosphere.tsx`), no lit windows. | Very high | Medium | Medium | Low | Medium |
| 3 | HQ lot reads barren at level 1: only owned vehicles park; the yard section of `HeadquartersBuilder.ts` has three pallets, a cage and a dumpster. The 51×41 m asphalt field dominates the default camera. | High | Low–Medium | High (home base) | Low | Low |
| 4 | Condenser units are a box with a disk — the hero HVAC object in an HVAC game (`src/world/buildings/parts.tsx`). No fan grille, coil fins, service panel or line set. | High | Low | High | Low | Low |
| 5 | No ambient life: no traffic, pedestrians or competitor vans on the road graph. | High | Medium | Medium | Medium | Low |
| 6 | Tree canopies are flat icospheres that read cheap at mid distance (`Vegetation.tsx`). | Medium | Medium | Low | Low | Low |
| 7 | No LOD: 32 full-detail houses at every distance (622k triangles on the overview). | Low visually, high headroom | Medium | Low | Negative (saves) | Medium |
| 8 | No ambient occlusion: objects float on the ground visually (`GameScene.tsx` uses tone mapping only). | Medium | Low | Low | Medium–High | Low (High/Ultra only) |
| 9 | Vehicles spawn at stalls, workers teleport into vans (known in `QA_REPORT.md`). | Medium | Medium | Medium | None | Medium |
| 10 | Flat sand and asphalt: no tire wear, oil stains, road patching decals (`Roads.tsx`, `Ground.tsx`). | Medium | Low | Low | Low | Low |
| 11 | Install crews carry no visible equipment to the pad. | Medium | Low | Medium | None | Low |
| 12 | Storefront/house glass has no night interior glow (`buildings/materials.ts`). | Medium (at night) | Low | Low | Low | Low |
| 13 | No in-world job-completion beat (celebration exists only as a HUD banner). | Medium | Low | Medium | None | Low |
| 14 | Vehicle night lights are emissive only — no light cones, no dust trail. | Low–Medium | Medium | Low | Medium | Low |
| 15 | No audio (presentation, not graphics; settings toggle is a placeholder). | — | Medium | Medium | None | Low |

## 2. Tool capability report (verified this session)

- **Blender MCP**: unreachable — `Cannot connect to Blender at localhost:9876`. Blender was not
  running with the MCP add-on. No Blender work was performed or claimed. Start Blender with the
  add-on server enabled and the `mcp__Blender__*` tools become usable (they are configured).
- **Node glTF pipeline** (`tools/assets/*.mjs`, three.js `GLTFExporter` in Node): present and
  working; this is the supported Blender-free path for authoring GLB assets.
- **Unity MCP**: not exercised. The production stack is Three.js; Unity is not a runtime or build
  dependency and will not become one.
- **Three.js tooling**: `three@0.186`, `@react-three/fiber@9`, `@react-three/drei@10`, Vite 8,
  Vitest 5, Playwright 1.63. `npm run typecheck`, `lint`, `test`, `build` all pass.
- **Playwright on this Windows machine**: Chromium is not installed (`/opt/pw-browsers/chromium`
  does not exist — the path comes from the previous Linux container). The e2e suite needs
  `npx playwright install chromium` here before it can run. Not done automatically (download).
- **Built-in browser**: used for live GPU verification of the dev build at 1600×1000.

## 3. First improvement: technician character v2

`src/world/characters/Worker.tsx` — the rig (every bone pivot, limb length and procedural clip)
is unchanged, so all eight poses remain valid and feet stay planted. What changed is the body:

- Head with a jaw, ears, nose, eyes and brows; safety glasses on field roles.
- Hard hat with a dome, full brim, crown ridge and a reflective front strip (teal technicians,
  yellow installers).
- Abdomen, rounded chest and a broad shoulder yoke with shoulder caps.
- Hi-vis work vest on field roles: front and back panels, reflective chest band and shoulder
  straps, EGO teal chest patch.
- Loaded tool belt: buckle, two pouches, holstered driver, hanging wrench.
- Teal sleeve cuffs, work gloves with thumbs, knee pads, work boots with toe box and thick sole.

Evidence: `docs/graphics/technician-v2/00-before.png` (previous build) against
`01-after-context.jpg`, `02-after-fullbody.jpg`, `03-after-back.jpg` captured from the live dev
build in the in-app browser while the owner technician diagnosed a condenser.

Verification: `tsc -b --noEmit` clean, ESLint clean (the inline `Boot` component was hoisted to
satisfy `react-hooks/static-components`), Vitest 17/17, `vite build` OK. The graphics e2e could
not run locally for the browser-install reason above.

Cost: about 40 small meshes per worker instead of about 25; workers are counted in single
digits, so the draw-call delta is negligible against the merged world.

## 4. Art direction (compact)

- Style: stylized realism. Recognizable, physically believable forms; no photoreal texture noise.
- Palette: `src/world/assets/palette.ts` is the source of truth. Brand = `egoBlack #15181d`
  and `egoTeal #19d3c5`; desert sand/gravel/stucco neutrals; terracotta/slate/brown roofs.
  Keep saturation controlled; teal is an accent, never a fill.
- Scale: 1 unit = 1 m. Workers 1.78 m, doors 2.1 m, vans ~2.6 m tall, lots per `cityLayout.ts`.
- Materials: `MeshStandardMaterial` PBR; roughness 0.8–0.95 for stucco/asphalt/fabric,
  0.3–0.5 for glass/painted metal, metalness only on real metal. World-space UVs via `MeshBuilder`.
- Lighting: one directional sun from the clock, hemisphere sky fill, ACES tone mapping,
  PMREM studio reflections. Evening/night grading is the next lighting task.
- Camera: tycoon map camera, 35–60° elevation, focus flights; keep the read clean — no bloom.
- Animation: procedural clips communicate state (inspect, repair, install, train); nothing purely
  decorative.

## 5. Next five tasks (priority order)

1. **Time-of-day grading** — warm dawn/dusk color temperature and exposure, longer evening
   shadows (separate shadow-sun floor with bias retune), window and signage emissives after
   sunset. Files: `Atmosphere.tsx`, `buildings/materials.ts`, `weather.ts` read-only.
2. **Hero HVAC equipment v2** — condenser with fan grille, coil fins, service panel and line set;
   rooftop RTUs; built through `tools/assets` as GLB (or in `parts.tsx` if kept procedural).
3. **HQ yard life** — equipment laydown rows, conex, staging bays, idle-staff activity near the
   bays, planters in the lot islands; gated by the existing HQ upgrades so the campus grows.
4. **Ambient traffic and competitor vans** — visual-only entities on the road graph using the
   existing A* and lane offset; no simulation state.
5. **LOD and SSAO** — house impostors beyond ~140 m, SSAO on High/Ultra only, re-measure
   draw calls and triangles with `RenderProbe`.

## 6. Risks

- Lighting changes touch the e2e lighting checks; validate with the graphics spec once
  Playwright browsers are installed on this machine.
- Any yard geometry must stay out of `hqParkingStalls` and the apron path or dispatch visuals
  will clip.
- Skeletal characters (the roadmap's end goal) require a GLB rig + clips; v2 is the procedural
  bridge, not the final form.
