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

## Opening mission

`game/progression/mission.ts` is a thin record over one ordinary job: its objective is derived from the job and vehicle (`missionStage`), and `syncMission` runs after every action and simulation step. `GameState.mission` and `Job.authorization` are optional (schema 6), so older saves load with no mission. `ui/overlays/MissionCoach.tsx` reads the state and issues camera cues; it never advances the job.

## Road network and movement

`cityLayout.ts` is the single source of truth for streets, lots, curbs, HQ stalls and condenser positions. `roadGraph.ts` builds nodes (intersections, street ends, curb nodes) and chains them per street. `pathfinding.ts` runs A*. Routes from HQ are `stall → apron → HQ curb → A* path → customer curb` and back. ETA is `remaining length / vehicle speed`, so UI numbers always match what the truck does.

## Asset pipeline

`tools/assets/*.mjs` build vehicles from parametric side profiles (wheel arches cut into the
outline), merge parts per named material, re-index, and export glTF 2.0 binaries with the
three.js `GLTFExporter` running in Node (browser APIs polyfilled in `export.mjs`). The runtime
(`src/world/vehicles/VehicleGltf.tsx`) loads them with drei `useGLTF`, clones a per-vehicle rig,
remaps named materials (paint color, wordmark decals, headlights) and exposes `wheel_*`, `steer_*`
and `chassis` nodes for animation. Static world geometry (houses, HQ, roads) is built in the
browser by `MeshBuilder` (`src/world/assets/pbr.ts`): geometry is transformed, given world-space
UVs so PBR textures keep a consistent meters-per-repeat, and merged into one mesh per material.
Vegetation is one `InstancedMesh` per species with vertex colors and per-instance tint.

## Three.js scene

- `GameScene`: `Canvas` with ACES tone mapping and quality-dependent DPR; `Atmosphere` owns the sun (position from the game clock), hemisphere and ambient light, a gradient sky dome, fog, exposure, lamp emissives and monsoon rain, all eased toward targets derived from `weatherForDay(seed, day)`; `StudioEnvironment` supplies PMREM reflections.
- Geometry: merged PBR houses (`HouseBuilder`), merged HQ campus (`HeadquartersBuilder`), merged roads with signage, displaced terrain and mountain rings, instanced vegetation, glTF vehicles, articulated procedural workers.
- Interaction: `Selectable` wraps gameplay objects with pointer handlers and a hover/selection ring; each object carries an invisible click volume for forgiving picking. Decorative objects never use `Selectable`.
- Labels: DOM elements in the UI layer register with `labels.ts`; `LabelProjector` projects world anchors to screen each frame. This avoids drei `Html`, whose nested React root failed under React 19.3.
- Camera: drei `MapControls` plus a rig that performs eased flights (focus, HQ, reset), vehicle following, keyboard pan/orbit, and bounds clamping.

## App store and loop

`useApp` (Zustand) holds the engine reference, UI state (selection, open panel, camera commands, settings, toasts) and persistence actions. `startGameLoop` runs on `requestAnimationFrame`, accumulates real time and steps the engine at a fixed 1/30 s. Autosave writes every 45 s and at day change.

## Save architecture

`serialize(state)` → `{ schemaVersion, savedAt, appVersion, seq, checksum, state }` in `localStorage`. `deserialize` validates and migrates. Settings are stored separately. Loading recreates the engine from the state; determinism tests prove a loaded game continues identically. All of it is `src/persistence/save.ts`.

**Slots**

| Key | Written by | When |
| --- | --- | --- |
| `ego-hvac-v3:save` (manual) | the player | Save, Save & exit, starting a company |
| `ego-hvac-v3:autosave` | the game loop | every 45 s, at midnight, when the page is hidden or left, on a lost WebGL context |
| `…:save:kept`, `…:autosave:kept` | `saveToStorage` | a copy of a save that was about to be replaced by a game it does not belong to (see below) |
| `ego-hvac-v3:save-seq` | `saveToStorage` | the write counter |
| `ego-hvac-v3:load-guard` | the store | a load in progress (see below) |

**Metadata.** `seq` is a write counter on the device, one higher for every save to any slot; it, not the wall clock, says which of two saves is newer. `checksum` is FNV-1a of the state text exactly as stored. `savedAt` is shown to the player and orders only saves that have no `seq`. Saves from before this (no `seq`, no `checksum`) load unchanged, are ordered among themselves by `savedAt`, and count as older than anything written since.

**Validity** (`inspectJson`, never throws, never writes). A slot is `valid` when it parses, has the parts every schema has, matches its checksum if it has one, is not from a newer schema, migrates without error and passes `validateState` (numbers finite, collections present, an owner, every job's customer exists). Otherwise it is `corrupt` (damaged, cut short, altered, incomplete) or `incompatible` (written by a newer version, or the upgrade from its version failed).

**Selection policy** (`planRecovery`, a pure function of the slots and the load guard). "Continue my company" loads the plan's `primary`:

1. Only valid saves are candidates. An unreadable save is reported and left where it is.
2. Among the valid live slots the newest wins, whether it is the manual save or the autosave. (Before this, the manual save always won when it existed, and a new company writes one, so the autosave was never loaded.)
3. If a save that may be newer than the winner could not be read, the menu says the game is continuing from the other one, and why.
4. A save whose last load went wrong is not picked while another loadable save exists; it stays listed as an explicit choice. With no alternative it is still offered, with a warning.
5. Kept copies are never picked automatically (only when no live slot can be loaded); they are listed.
6. If the chosen save will not start after all, the other loadable saves are tried, newest first.

The menu shows which save Continue will load ("Autosave · Day 3, 2:14 PM · saved today at 7:54 PM"), a sentence when rule 3 or 4 applied, and "Other saves on this device" with a Load button for each other loadable save and a line for each unreadable one. The recovery screens use the same plan to say which save a reload returns to.

**What is never done**

- Reading a slot never writes one. Loading the autosave leaves the manual save byte for byte as it was; only the player's own Save, Save & exit, or a confirmed new company writes the manual slot.
- Nothing is deleted to recover. An unreadable save stays in its slot.
- Before the first write of a session replaces what is in a slot, `saveToStorage` copies that save to the slot's `:kept` key if it is not this game's own past: it cannot be read (so a save from a newer version of the game survives being played over in an older one), or it is newer than the save this game was loaded from (so choosing an older save does not let its autosave destroy the newer one). One kept copy per slot; a later one replaces it. Starting a new company replaces the old one by the player's confirmed choice and sets aside only an unreadable save.
- After a simulation exception (`simFault`) nothing is saved: not the autosave timer, the midnight save, the hidden-page save, the lost-context save, the manual save, or Save & exit.

**Crash-on-load loops.** `loadFromKey` records the save being loaded in the load guard; the game loop clears it after the scene has drawn and the game has run for 4 s. If a failure that takes the game down (`app`, `world`, `hud`, `simulation`, `fatal`) is recorded before that, the guard is marked failed; if two loads of the same save start and never finish (a tab that dies while loading), that counts too. The guard names one exact write (`key` and `stamp`), so a save that is written again is no longer suspect. It only changes which save the menu picks first: the suspect save is never modified or removed.

**Known limits.** One kept copy per slot. Up to four saves can be stored; if the browser's quota is reached a kept copy is skipped (the write itself is not) and a failed write returns false. Validation checks structure, not every rule of the simulation: a structurally sound save that makes this build fail is handled by the load guard, not by validation. The guard cannot tell a save that breaks the game from a build that breaks on every save; in that case the menu alternates between saves rather than getting stuck on one, and nothing is lost.

## Crash resilience

An exception while React renders unmounts the tree it happened in; with no error boundary that is the whole page (the hiring bug fixed in `ed15557` showed as an empty page for this reason). Boundaries now limit a failure to the part that failed, and each shows a recovery view in its place (`src/ui/overlays/ErrorBoundary.tsx`, `Recovery.tsx`).

| Boundary | Around | The player keeps | Recovery |
| --- | --- | --- | --- |
| `panel` | the open panel (keyed by panel) | world, HUD, running game | Close, or try again |
| `hud` | bars, inspector, overlays, panels | the 3D world; game paused | Restore the controls (closes the panel, clears the selection), save and go to the menu, reload |
| `world` | the 3D canvas | HUD and panels (saving works); game paused | Restart the 3D view (new canvas, new WebGL context), reload |
| `preview` | the vehicle preview warm-up | everything | none needed: previews start cold |
| `app` | the whole tree (`main.tsx`) | the company in memory (the store is outside React); the game loop stops with the tree | Try again, save and go to the menu, reload |

- The canvas is a separate React renderer; it passes what its tree throws to the boundary around it, so `world` catches failures from inside the scene.
- If the `app` recovery screen itself cannot render, React unmounts everything; `onUncaughtError` in `main.tsx` then puts up a plain DOM message with a reload button.
- The simulation step is not React: `startGameLoop` catches an exception from `engine.tick`, stops stepping and autosaving (the state may be half-updated) and raises `simFault`; the overlay offers the last save. Before this, the first exception ended the loop silently.
- Saves: recovery never deletes a save or starts a company, and writes one only from a button that says so ("Save and go to the main menu", the normal Settings save). After a simulation fault nothing can be written. Every screen with a reload button says which save reloading returns to. Reloading returns to the newest valid save, which is normally the autosave from the last 45 s (see Save architecture).
- Diagnostics (`src/app/diagnostics.ts`): each failure becomes a report with the scope, error, trimmed stack and component stack, build, screen, panel, graphics preset, campaign seed and clock, entity counts and device class. The last five are kept in `localStorage` under `ego-hvac-v3:crash-log`; nothing is sent anywhere, and the player can copy a report from "Technical details". No names, money or save contents; addresses in stacks are cut to file names; the user agent is reduced to browser family and major version. Script errors and rejected promises outside any boundary (event handlers, frame callbacks) are recorded too but show nothing, since they unmount nothing.
- Limits, on purpose: a boundary sees exceptions thrown during rendering, effects and lifecycles, nothing else. A lost WebGL context is not an exception. It is handled by the `webglcontextlost` listener in `GameScene` and the "Graphics paused" overlay, and whether the context comes back is up to the browser and the device; "Restart the 3D view" asks for a new context and can fail for the same reason the old one was lost. A failure caused by the saved state itself will repeat after "Try again" and after a reload, until the build is fixed; the recovery screens say when a retry did not help.
- Test hook: `window.__ego.crash(scope, sticky?)` makes a `CrashProbe` inside the named boundary throw on its next render (or the next simulation step). It exists only in the dev server and in the crash-test build: `vite.config.ts` defines `__CRASH_HOOKS__` as `true` for `vite` (serve) and `vite build --mode crashtest`, and as the literal `false` for a standard `vite build`, where the hook is not installed, `setCrashTest` does nothing, the probes are empty and the bundler removes the code. `e2e/release-hooks.spec.ts` checks the standard build (no hook, no trace in the shipped scripts, cannot be armed through the store). `e2e/crash-recovery.spec.ts` runs only through `npm run test:e2e:crash` (`playwright.crash.config.ts`), which builds the crash-test bundle into `dist-crashtest`, serves it on port 4174 and runs that spec on desktop, iPhone portrait and iPhone landscape. Never deploy `dist-crashtest`.

## Testing

- Vitest: road graph connectivity, A* validity, route sampling, determinism, full job loop (movement, arrival, diagnosis, payment, return), pause/speed semantics, wrong-diagnosis callbacks, warranty receivables, hiring and fleet capacity, training effects, loan accounting, save round-trip, and a 90-day autopilot campaign with ledger reconciliation.
- Playwright: the full gameplay flow in the production build (see `QA_REPORT.md`), producing the screenshots in `docs/screenshots`.
- Debug hook: `window.__ego` exposes `getState`, `dispatch`, `advanceMinutes`, `spawnLead` for tests; it is not reachable from the UI.
- Save recovery: `src/tests/saveRecovery.test.ts` (the selection policy and every fallback, against a map standing in for `localStorage`) and `e2e/save-recovery.spec.ts` (real reloads on desktop and both phone orientations).
- Crash recovery: `src/tests/crashRecovery.test.ts`; `npm run test:e2e:crash` for the browser side (crash-test build only).
