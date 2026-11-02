# Graphics Revolution 3.0: Mission Progress

Branch `feature/v3-graphics-revolution-3`, from `f463050` (Mission 01). Local only: nothing pushed, merged or deployed.

**If resuming after a compaction or restart: read this file and `DECISIONS.md`, check `git log` and `git status`, then
continue from "Next exact action". Do not restart: the character pipeline works.**

## Current phase

Phase C/D: hero model integrated, ladder contact being finished; then variants, LOD and performance, full regression.

## Completed

- Router; skills: threejs-gltf-loading, threejs-materials-lighting, create-game-assets, performance-optimization.
- Baseline (`evidence/before/`): showcase, perf, rooftop review, rooftop video, all at `f463050`'s build.
- CC0 MakeHuman data fetched at a pinned commit (`tools/character/makehuman/`, `SOURCE.txt`, license read and kept).
- `tools/blender/technician_v3.py`, `tools/character/build.mjs` (one command: GLB, WebP atlas, rig table).
- `src/world/characters/`: `rigData.generated.ts`, `rigSolver.ts` (late IK), `gait.ts` (distance-driven walk), new
  `technicianModel.ts`, rewritten `Worker.tsx` (same props and clip names).
- `src/tests/characterRig.test.ts`, `e2e/character-qa.spec.ts` (shader check, 12 states, contact report by clip).
- Checkpoint commit `37395c2`.

## Tools for iterating (outside the repo, recreate if lost)

Build: `node tools/character/build.mjs`, then `VITE_PROFILE=1 npx vite build` (shader errors reported).
Capture: `QA_LABEL=x npx playwright test e2e/character-qa.spec.ts --project=desktop-1080p --workers=1`.

## Evidence

Raw (git-ignored): `docs/graphics-revolution-3/evidence/<label>/`. `before` is the baseline.

## Known visual defects (open)

- Ladder hand shortfall at pick-up from the ground and at the first frames of retrieve: last measured 0.59 m (reach) and
  0.33 m (raise) before the squat. Climb was 15 mm, inspect 14 mm. Step-over 0.15 m.
- Not yet reviewed in the game: shirt tuck behind the belt, finer brows, EGO bolt on the cap, squat when reaching low.
- Beards are blocky shells; upright standing pose is a little stiff; sleeve hem has a slight zigzag.

## Blockers

**Paused 2026-11-02 at the system's request:** the head-to-head benchmark was stopped because the machine ran critically
low on memory while the session was idle. It must not be restarted until the owner says so. Only `baseline-desktop`
finished; `gen3-desktop` and both phone runs did not.

## Next exact action (on the owner's go-ahead)

1. Check free memory, and close other heavy applications if needed.
2. `playwright.config.ts`: add `character-qa` and `character-perf` to `phone-390x844`, and `character-qa` to
   `iphone-landscape` (the scratchpad script's edit did not land).
3. Re-run the benchmark, one run at a time: `gen3-desktop`, then `baseline-phone-cpu4`, `gen3-phone-cpu4`.
   The baseline copy is a temporary worktree of `f463050`; serve it with `npx vite preview --port 4174` and point
   `PERF_URL` at it. Remove the worktree afterward: `git worktree remove`.
4. Review the unreviewed fixes above in `character-qa`; fix contact defects.
5. Full regression, videos, before/after sheets, final report.

## Final acceptance checklist

- [ ] Hero reads as a real professional at close, three-quarter, side, isometric
- [ ] Variants are different people
- [ ] Hands and feet on ladder and equipment; contact report clean
- [ ] Walk without sliding at 1×, 2×, 5×
- [ ] LODs, measured desktop and emulated phone performance, ten technicians, two rooftop jobs
- [ ] Mission 01, ground jobs, rooftop jobs, save/load, full regression
- [ ] Before/after sheets, gameplay videos, documentation, licenses
