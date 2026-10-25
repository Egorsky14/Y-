# Development journal

## Session 1

- Verified the repository was empty (no commits) and treated it as the greenfield V3 repository. No other projects exist in this environment, so the protected V2 repositories could not be touched.
- Chose TypeScript + Vite 8 + React 19 + Three.js 0.186 + R3F 9 + drei 10 + Zustand 5 + Vitest 5 + Playwright 1.63. Pinned TypeScript 5.9 (TypeScript 7 is the new native compiler and typescript-eslint support is unproven).
- Built the simulation first and tested it headlessly before any rendering: road graph, A*, job workflow, economy, HR, fleet, marketing, milestones, save.
  - Bug found by tests: lots on opposite sides of a street share a curb point; skipping the zero-length edge disconnected the road chain.
  - Bug found by tests: the "Trained Technician" milestone fired on hiring an experienced candidate; now tracked by `stats.trainingsCompleted`.
- Rendering: procedural houses/HQ/vehicles/workers, canvas textures, DOM label projector.
  - Bug: `useGame` selectors returned fresh arrays, causing React error #185 render loops under Zustand's reference equality. Fixed by recomputing selectors only when the simulation version changes and throttling UI updates to ~8 Hz.
  - Bug: drei `Html` content never appeared (nested React root unmounted mid-render under React 19.3). Replaced with a custom projector that positions normal DOM elements.
  - Bug: the technician stood inside the house wall on south-facing lots. Fixed with per-style half-widths shared by simulation and renderer (`workPosition`).
- Real-browser verification via Playwright (17-step flow) and screenshots in `docs/screenshots`.

## Next actions (if resuming)

1. Milestone 4: add a second district with its own lots and connect it through the avenue ends; profile draw calls after.
2. Add garage-door animation at HQ and an unloading animation for install crews.
3. Playtest balance for days 1–10 with a human: lead volume, starting diagnostic fee, used-van prices.
4. Add sound effects behind the existing settings toggle.
5. Consider GLB flagship vehicle models through `public/models` with attribution in `ASSET_LICENSES.md`.

## Session 2 — premium graphics overhaul

- Audited the baseline in the browser first (`docs/graphics/before`, `GRAPHICS_AUDIT.md`).
- Built a Node glTF pipeline because Blender is not available here; the vehicles are parametric
  profiles with real wheel arches exported through `GLTFExporter`.
  - Bug: extrude bevels widened bodies by 7 cm and buried glass, mirrors and decals; fixed by
    shrinking the extrusion depth.
  - Bug: decal textures appeared upside down; the exporter already rewrites V, so canvas
    textures keep three's default `flipY`.
  - Bug: the exporter wraps assets in a named group, so animated nodes were not found until the
    rig looked one level deeper.
- Rebuilt houses as merged PBR geometry (draw calls fell from 1,352 to about 800 while detail
  rose tenfold). Bugs fixed along the way: glass panes hidden behind solid frames, soffit slabs
  of secondary roofs poking through main roofs, side-wall glass placed inside the wall.
- Headquarters, roads, terrain, vegetation and characters followed; the worker rig initially sank
  waist-deep because a per-frame reset zeroed the pelvis height.
- The camera's 18 m zoom floor had been hiding character detail; it is now 5 m.
- Atmosphere: the first evening capture looked identical to morning because the capture raced
  the eased transition; a probe (`window.__egoAtmo`) confirmed the sun, exposure and weather
  tracking the clock.
- The opening service call moved to a lot inside the new hero framing so its pin is visible
  on launch.
- Phase F: all 32 houses merged into shared per-material meshes (515 draw calls at the hero
  view, down from 1,352 in the base build). The 17-step gameplay test then timed out: at about
  1 fps under SwiftShader the game loop's 0.25 s catch-up clamp made simulated time run at a
  quarter of wall time. The clamp is now 1 s and the per-test timeout 600 s; no assertion
  changed. Full suite: gameplay 6.9 min, graphics 3.0 min at 1080p and 2.0 min at 768p.
