# Capture and benchmark scripts need a test build

The scripts under `docs/**/scripts` take screenshots, evidence sheets and performance numbers by driving the game
through `window.__ego` (`dispatch`, `advanceMinutes`, `app`, `getState`). Since Release Hardening 1.0 a production
build does not have those hooks, so a script pointed at one fails at its first `window.__ego.dispatch` or
`window.__ego.app` call ("is not a function" / "undefined").

None of the scripts builds the game itself. Each takes either a URL or a build folder as an argument, so no script
was changed; what changes is what you give it.

| Script takes | Give it |
| --- | --- |
| a URL (most `.cjs` files, `ACCEPT_URL` for `run-accept.ps1`) | `npm run preview:e2e`, then `http://127.0.0.1:4173` |
| a build folder (`-Dist` / `$dist` in the `.ps1` wrappers, which run `vite preview --outDir` on their own port) | `npm run build:e2e`, then `dist-e2e` |

For a before/after comparison of two commits, build each with `npx vite build --mode e2e --outDir <folder>`.

Scripts that also read `window.__egoThree` (renderer, scene, camera: the performance and character scripts) need a
profiling build as before; combine the two: `VITE_PROFILE=1 npx vite build --mode e2e --outDir <folder>`.

Never point these at, or deploy, `dist-e2e`: it is a test build.

## Scripts that use the hooks

`docs/art/scripts`: brand-assets, kitshots, previews, servicecall.
`docs/camera-occlusion/scripts`: closeup (run-closeups.ps1).
`docs/cinematic-camera/scripts`: modes (run-modes.ps1, perf.ps1); `acceptance/scripts`: accept (run-accept.ps1).
`docs/environment-revolution/scripts`: capture.
`docs/graphics-revolution/scripts`: capture. `docs/graphics-revolution-2/scripts`: capture, condensers (cap.ps1).
`docs/integration/scripts`: atmo, capture, perf.
`docs/perf/scripts`: bench, inpage, lodshots, paired, profile, smooth, vsync.
`docs/release/scripts`: mobileshots.
`docs/visual-quality-pass/scripts`: capture (perf1.ps1, run-evidence.ps1).
`docs/world-immersion/scripts`, `docs/world-polish/scripts`: capture.

The compare, sheets, strips, summary and pixdiff scripts only process images and are unaffected.

These scripts were not re-run for this change.
