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
