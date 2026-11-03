# Graphics Revolution 3.0: Mission Progress

Branch `feature/v3-graphics-revolution-3`, from `f463050` (Mission 01). Pushed once, to a Preview at `f6d635d` (`dpl_ASNkMvm97XqSKNWhmcBHNc4Tv4kE`). Nothing merged; production untouched. Later commits are local only.

## Status: READY FOR VERCEL PREVIEW (camera zoom repair committed locally; the live Preview is still `f6d635d`)

Awaiting the owner's authorization to push the camera zoom repair. Results, numbers and open items: `REPORT.md`, `ZOOM_FIX.md`. Pictures: `sheets/`.

## Completed

- Real human mesh (CC0 MakeHuman data), garments as geometry, 43-bone rig, late IK, distance-driven walk, three levels of
  detail, crew variants: commits `37395c2`, `7ebde5c`.
- Ladder hand contact, sidewalk height, cap, hair: `58a6297`, `0e77535`.
- Paused stride, palm on tall cabinets, before and after sheets: `ed87bd4`.
- Benchmarks: desktop (three runs each), phone CPU emulation, ten technicians, two rooftop jobs, plus a 60 Hz run.
- Camera zoom repair: wheel, pinch and buttons in every mode, kept through reframes (`ZOOM_FIX.md`).
- Regression on desktop, laptop, small screen, phones, tablet and landscape (all Chromium emulation).

## Evidence

Committed: `sheets/`. On this machine only, git-ignored: `evidence/` (`after/video/*.webm`, `before/rooftop-video-*/`, raw
captures, `perf2/*.json`, `regress/runs.txt` and logs).

## Re-running

```
npx vite build                                                                              # or: npm run build
node tools/run-guarded.mjs <log> <label> -- npx playwright test e2e/<spec>.spec.ts --project=<project> --workers=1
QA_LABEL=x ROOF_LOT=a-n-4 npx playwright test e2e/character-qa.spec.ts --project=desktop-1080p --workers=1
PERF_LABEL=x [PERF_CPU=4] [PERF_CAPPED=1] [PERF_URL=...] npx playwright test e2e/character-perf.spec.ts --project=<project> --workers=1
node tools/perf-table.mjs docs/graphics-revolution-3/evidence/perf2 <before label> <after label>
```

Keep any one command under the 10-minute foreground limit. A command that overruns moves to the background, and the next one
then overlaps it; that happened once in this mission and made two runs fail for no game-related reason.

Playwright empties `test-results/` at each start, so copy results out after each run. Several specs overwrite the tracked
`docs/screenshots/`: restore with `git checkout -- docs/screenshots`.

The baseline copy for comparing builds is a temporary worktree of `f463050` in an earlier session's scratchpad, with a cost
timer added to its `Worker.tsx` (uncommitted). It is still there, in case the owner wants more comparisons. To remove it:
`git worktree list`, then `git worktree remove --force <path>`.

## Final acceptance checklist

- [x] Hero reads as a real professional at close, three-quarter, side and gameplay distance
- [x] Variants are different people
- [x] Hands and feet on ladder and equipment: contact report within 5 cm, except 7 to 8 cm for moments at floor level
- [x] Walk: planted foot cannot slide by construction (unit test); 1×, 2× and 5× played without errors. Foot slide was not
      separately measured in the browser at each speed
- [x] Levels of detail, measured desktop and emulated phone performance, ten technicians, two rooftop jobs
- [x] Mission 01, ground jobs, rooftop jobs, save/load, full regression
- [x] Before and after sheets, gameplay videos, documentation, licenses
- [ ] A real phone: not tested. Owner to check on the Preview
