# V3 rendering performance audit

Date 2026-10-25. Branch `work/v3-art-pipeline-performance` (from `integration/v3-unified` `e6de7f7`).
Hardware: Intel Arc 140V (ANGLE D3D11), Chrome 156 headless, 1920×1080, High preset, AC power,
Balanced plan, no other browser processes.

## 1. Re-validating the reported baseline

The previous report gave 64–72 fps for the integration branch and 107–127 fps for cinematic. The
same script (`docs/integration/scripts/perf.cjs`), two alternating rounds today:

| Build | Overview 10:00 | HQ 10:00 | HQ 21:00 | Overview 21:00 |
| --- | --- | --- | --- | --- |
| cinematic | 183–202 fps | 215–228 | 238–250 | 206–225 |
| visual-excellence | 142–143 | 144–145 | 159–161 | 153–158 |
| integration | 143 | 144–146 | 160 | 155 |

Absolute numbers are about twice the earlier ones, so the earlier figures were depressed by
machine state, not by the build. The ratio holds: integration runs at about 68% of cinematic's
uncapped frame rate. Data: `data/baseline.json`.

## 2. Where the GPU time goes

GPU time per frame from `EXT_disjoint_timer_query_webgl2` around every render call, removing one
cost centre at a time (`scripts/profile.cjs`, `data/profile.json`), integration code, overview:

| Cost centre | GPU ms (of 8.0) | Note |
| --- | --- | --- |
| Sun shadow-map pass | 2.2 | re-renders the whole ±230 m city into a 4096² map every frame |
| Vegetation | 2.1 | 495k triangles (36% of the scene) in 13 instanced meshes, no culling or LOD; fan palms alone 337k (111 × 3,036) |
| Terrain | 1.0 | 24k triangles: full-screen PBR shading, not geometry |
| Houses | 1.0 | |
| HQ | 0.8 (1.6–1.9 in the HQ view) | opaque PBR materials filling the screen |
| Roads | 0.8 | |

Fill test (same page, pixel ratio 1 vs 0.707): GPU 6.07 → 4.14 ms. About **3.9 ms of a 6.1 ms
frame scales with pixel count**; ~2.2 ms is fixed (shadow pass and vertex work). The frame is
mostly fragment-bound on this GPU, which bounds what triangle reduction can achieve.

## 3. Changes

| Change | Visual effect |
| --- | --- |
| Fan palms: a near mesh (unchanged crown, 2,612 tris) and a far mesh (same frond placements, every blade kept, one bend per blade instead of two, coarser trunk: 1,592 tris), chosen **per palm** by camera distance, 60 m with a ±4 m band; buckets rebuilt only when the camera moves | Far crowns differ at blade level only; see below |
| Hidden end caps removed from stacked trunk segments and boot rings (colour computed before trimming, so the random stream and every frond are unchanged) | None |
| Open-desert scatter (232–552 m out, outside the shadow camera) drawn in non-casting layers | None |
| Merged meshes under 3 cm tall (paint, manholes, gravel, mulch, lawn and water plates) no longer cast shadows | None |

A first far-palm version (9 wide blades per frond) was rejected after a 2× crop showed spikier,
sparser crowns.

## 4. Results

### Method that failed, and why

Sequential runs drift: the same build measured 60–135 fps across rounds of one session
(`data/bench.json`), so an early "8.0 → 6.1 ms" before/after claim was withdrawn. A two-page
paired method (`scripts/paired.cjs`) carries a page-order bias: an A/A control shows the second
page reading +0.8–0.9 ms GPU (`data/paired.json`).

### In-page A/B (reliable)

`scripts/inpage.cjs`: one page, one view, alternating the optimized and reverted states eight
times (2.5 s windows); per-state window spread ±0.05 ms. Uncapped (vsync off). Data:
`data/inpage.json`.

| View | GPU ms reverted → optimized | Saved | fps | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- |
| Overview 10:00 | 6.53 → 6.09 | 6.7% | 141 → 151 | 599 → 582 | 1,286k → 996k |
| HQ 10:00 | 6.38 → 6.02 | 5.6% | 145 → 153 | 576 → 559 | 1,286k → 998k |
| Neighborhood 10:00 | 5.24 → 5.00 | 4.6% | 182 → 184 | 374 → 357 | 1,239k → 975k |
| Street palms at the 60 m band | 5.47 → 5.21 | 4.8% | 171 → 181 | 367 → 350 | 1,232k → 966k |

Triangles −22%, draw calls −3%, GPU −5–7%. Uncapped 1% lows (7–22 fps in both states) are not a
player-facing number: they come from GPU-queue back-pressure with vsync off and rise to 63–74 fps
when the pixel load is halved.

### What a player sees (vsync on)

`scripts/vsync.cjs`, 15 s per view, two alternating rounds (`data/vsync.json`): both builds hold
60 fps in all four views with 1% lows of 48–50 fps. One window (after, round 1, overview) had 9
frames over 33 ms; it did not reproduce in round 2 and the before build had a comparable first-run
outlier (39 frames over 20 ms).

## 5. Visual verification

Matched captures (`scripts/lodshots.cjs`, seed 42, paused, HUD hidden), pixel diff
(`scripts/pixdiff.cjs`, changed = any channel > 24/255). Sheets: `compare/`.

| View | Pixels changed | Where |
| --- | --- | --- |
| Overview 10:00 | 1.71% | far palm crowns only |
| HQ overview 10:00 | 1.14% | far palm crowns only |
| Neighborhood 10:00 | 0.27% | far palm crowns only |
| Vegetation close-up | 0.00% | identical (near mesh) |
| 60 m LOD band | 0.31% | distant palms; the foreground palm is identical |
| Park palms | 0.02% | |
| HQ 17:30 (long shadows) | 1.11% | far crowns; shadow regions unchanged |
| Neighborhood 17:30 | 0.22% | |

No shadow region is flagged in any heat map. Near palms are untouched. The LOD switch is per palm
with hysteresis, so there is no whole-world pop.

## 6. Recommended next steps (not done: each touches image quality and needs your call)

1. **Shadow pass (~1.3–2.2 ms, fixed cost)**: fit the shadow camera to the view (tighter frustum,
   sharper shadows, fewer casters), or refresh static-caster shadows less often than dynamic ones.
2. **Pixel cost (~64% of the frame)**: measure overdraw of stacked ground layers (gravel under
   asphalt, transparent stain/wear decals); cap the High preset's `dpr` on high-DPI laptop panels
   (High allows up to 1.5×, i.e. up to 2.25× the pixels measured here).
3. **Frustum culling for vegetation**: every instanced layer has `frustumCulled={false}`; spatial
   chunks would let close views skip off-screen trees.
4. `preserveDrawingBuffer: true` is set only for Photo Mode's `toBlob`; it can be dropped by
   capturing in the frame callback. Unmeasured.
