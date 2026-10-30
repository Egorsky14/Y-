# Graphics Revolution 2: progress record

Branch `feature/v3-graphics-revolution-2`, from `adf3224` (World Immersion 3.1). Local only: nothing
pushed, merged or deployed.

Scope: the items still open from `docs/design/GRAPHICS_REVOLUTION.md` → "Next graphics milestone".
Backyard variety (item 2) and visible tool use (part of item 3) were already delivered by the
Environment Revolution and World Immersion milestones, so they are not repeated here.

## Commits

| Commit | Item |
|---|---|
| `723aeb9` | Shadow camera fitted to the view: stepped radius, texel-snapped center, 22–25% fewer draw calls in close views. Test `shadowFit.test.ts`. |
| `7550493` | Night grading: moonlit environment map, high silver moon, cool ambient fill, moon disc and stars. Seamless swaps at the horizon crossing. Test `nightGrading.test.ts`. |
| `7823bfe` | Condenser generations from each customer's system: legacy R-22, standard, current and EGO-installed. Unchanged cabinet envelope. Test `condenserVariants.test.ts`. |
| `1c4c5be` | GLB weld and lossless meshopt compression: 7.4 MB → 2.1 MB. `tools/assets/compress.mjs`. |

## Validation status

- [x] Unit tests, type check and lint after each commit (135 passed, 3 opt-in skipped at `7823bfe`).
- [x] Baseline captures `before/` (1080p, 25 views) and `before-390/` (phone, 3 views) from `adf3224`.
- [x] Desktop paired performance: 5 runs alternating. The first base run was excluded (slow GPU state). See `final-perf.json`; raw runs are in `perf-runs/`.
- [x] Phone paired performance: base, new, base. The second base overview was excluded as drift.
- [x] `after/` desktop captures (25 views, 0 console errors). A first attempt was killed at 19/25 by the low-memory guard (exit 137) and redone in full.
- [x] `after-390/` phone captures (3 views, 0 console errors).
- [x] Comparison sheets (34 in `compare/`, including the condenser-generations sheet).
- [x] tsc, lint, production build, vitest 135 passed / 3 skipped; browser matrix 21/21, exit 0 (`browser-matrix-fbd8450.txt`).
- [x] Final report: `FINAL_REPORT.md`.

## Checkpoint

Graphics Revolution 2 is complete and validated. Nothing is pushed, merged or deployed; a Vercel
Preview or merge needs the owner's authorization.

## Environment notes

- Build with `VITE_PROFILE=1` for capture builds. Serve one `vite preview` at a time and stop it after each capture.
- The machine has had 4 GB free of 16 GB during this work. Run captures and Playwright cases one per call.
