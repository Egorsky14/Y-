# Architecture

```
src/
  app/            React root, Zustand app store, real-time game loop
  game/           Pure TypeScript simulation (no React, no Three.js)
    simulation/   state types, RNG, clock, tick, actions, engine, new game
    economy/      ledger, receivables, reconciliation
    customers/    customer and equipment generation
    employees/    attributes, roles, training, candidates, HR actions
    fleet/        vehicle catalog, purchases, routing helpers
    jobs/         fault catalog, leads, job workflow
    marketing/    channels, brand, competitors
    progression/  milestones, HQ upgrades, facility actions
    world/        city layout data, road graph, A* pathfinding
  world/          Three.js / React Three Fiber rendering
    scene/        Canvas, lighting, camera rig, live entity views, render probe
    city/         ground, mountains, landscaping
    roads/        streets, sidewalks, curbs, driveways
    buildings/    houses (5 styles), headquarters (+ upgrades), commercial, shared parts
    vehicles/     procedural vehicle models
    characters/   animated worker
    interactions/ Selectable wrapper, DOM label registry and projector
    assets/       procedural textures, palette
  ui/             HUD, inspector, management panels, overlays, menus, styles
  persistence/    save envelope, migrations, localStorage
  tests/          Vitest suites
e2e/              Playwright gameplay test
docs/screenshots/ captured from the real build by the e2e test
```

## Separation of concerns

1. **Simulation state** (`GameState`) is plain JSON. It is created by `createNewGame`, mutated only by `advance(state, minutes)` (time) and `applyAction(state, action)` (player decisions). Both are pure functions of state and the seeded RNG; no timers, no DOM, no Three.js.
2. **Game rules** live in `game/*` modules (workflow, leads, hr, fleet, marketing, milestones). Catalog data (faults, tiers, vehicles, training, upgrades) is declarative.
3. **Rendering state** is derived every frame from the live state by R3F components. Vehicles and workers read `engine.state` directly in `useFrame` and smooth toward simulation positions; React re-renders are throttled to about 8 Hz for HUD/panels.
4. **UI** reads state through `useGame(selector)` (recomputed on simulation version change) and writes through `dispatch(action)`.
5. **Persistence** wraps the state in an envelope with `schemaVersion`; `migrate()` upgrades older saves.
6. **Assets** are generated procedurally; a GLB pipeline can be added under `public/models` and loaded with drei `useGLTF` without touching the simulation.

## Simulation engine

- `GameEngine.tick(realSeconds)` converts wall time into game minutes using the speed multiplier (0, 1, 2, 5) and calls `advance`, which sub-steps at 0.5 game minutes for stable movement and phase timers.
- `advance` moves vehicles along their `RouteState` polylines (progress in world units, right-lane offset applied when sampling), advances job phases, fires scheduled leads and callbacks, expires leads, and runs the end-of-day settlement at minute 1440.
- `applyAction` is a discriminated-union reducer; every action returns `{ ok } | { ok: false, reason }` which the UI surfaces as an error banner.
- Determinism: `mulberry32` RNG stored in state; identical seed + identical actions produce byte-identical state (tested), independent of step size.

## Road network and movement

`cityLayout.ts` is the single source of truth for streets, lots, curbs, HQ stalls and condenser positions. `roadGraph.ts` builds nodes (intersections, street ends, curb nodes) and chains them per street. `pathfinding.ts` runs A*. Routes from HQ are `stall → apron → HQ curb → A* path → customer curb` and back. ETA is `remaining length / vehicle speed`, so UI numbers always match what the truck does.

## Three.js scene

- `GameScene`: `Canvas` with ACES tone mapping, shadows (quality-dependent map size 1k/2k/4k), fog, drei `Sky`, hemisphere + key + fill lights.
- Geometry: boxes, extruded gable roofs, pyramid hip roofs, instanced street trees and shrubs, canvas textures for sand/gravel/asphalt/road markings/windows/wordmarks.
- Interaction: `Selectable` wraps gameplay objects with pointer handlers and a hover/selection ring; each object carries an invisible click volume for forgiving picking. Decorative objects never use `Selectable`.
- Labels: DOM elements in the UI layer register with `labels.ts`; `LabelProjector` projects world anchors to screen each frame. This avoids drei `Html`, whose nested React root failed under React 19.3.
- Camera: drei `MapControls` plus a rig that performs eased flights (focus, HQ, reset), vehicle following, keyboard pan/orbit, and bounds clamping.

## App store and loop

`useApp` (Zustand) holds the engine reference, UI state (selection, open panel, camera commands, settings, toasts) and persistence actions. `startGameLoop` runs on `requestAnimationFrame`, accumulates real time and steps the engine at a fixed 1/30 s. Autosave writes every 45 s and at day change.

## Save architecture

`serialize(state)` → `{ schemaVersion, savedAt, appVersion, state }` in `localStorage` under `ego-hvac-v3:save` (manual) and `ego-hvac-v3:autosave`. `deserialize` validates and migrates. Settings are stored separately. Loading recreates the engine from the state; determinism tests prove a loaded game continues identically.

## Testing

- Vitest: road graph connectivity, A* validity, route sampling, determinism, full job loop (movement, arrival, diagnosis, payment, return), pause/speed semantics, wrong-diagnosis callbacks, warranty receivables, hiring and fleet capacity, training effects, loan accounting, save round-trip, and a 90-day autopilot campaign with ledger reconciliation.
- Playwright: the full gameplay flow in the production build (see `QA_REPORT.md`), producing the screenshots in `docs/screenshots`.
- Debug hook: `window.__ego` exposes `getState`, `dispatch`, `advanceMinutes`, `spawnLead` for tests; it is not reachable from the UI.
