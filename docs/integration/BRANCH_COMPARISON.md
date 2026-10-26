# V3 graphics: branch comparison and integration

Date 2026-10-25. Branches compared:

| Ref | Commit | Built on | Content |
| --- | --- | --- | --- |
| `v3-premium-graphics` (remote) | `a98caef` | — | common baseline (graphics phases A–F) |
| `v3-cinematic-assets` | `907f2df` | `a98caef` | technician v2 uniform, time-of-day grading, Playwright on the installed Chrome |
| `origin/v3-visual-excellence` | `b6a96ef` | `a98caef` | milestones A–F: HQ and lot, second-generation vans, neighborhood, characters with pose blending and job-site kit, lighting with night lights and photo mode |
| `wip/condenser-v2-premium-base` | `3e0de87` | `907f2df` | parked, unfinished condenser v2 (not merged anywhere) |
| `integration/v3-unified` | see `git log` | `907f2df` + merge of `b6a96ef` | this comparison's integration branch |

None of the original branches was rebased, reset, deleted or pushed. The integration branch is
local only and has not been merged into `v3-cinematic-assets`.

## Method

Each line was built (`vite build`) in its own detached worktree and served separately. One
script (`capture.cjs`, kept in the session scratchpad) drove every build identically: seed 42,
simulation paused through the test hook, the same camera commands at the same game minutes,
HUD hidden except in the opening frame. All three builds reached identical simulation states
(tutorial lead at `c-n-4`, technician at (−10.8, 22) at minute 610), confirming the simulation
is unchanged by either graphics line. Captures ran in headless Chrome 156 on the real GPU
(`ANGLE Intel Arc 140V, Direct3D 11`) at 1600×900; none logged a console error.
Frame-rate figures come from a second, uncapped run (vsync and the frame-rate limiter off) at
1920×1080.

Side-by-side sheets: `docs/integration/compare/` (left to right: cinematic, visual-excellence,
integration; condenser sheets also show the parked WIP).

## Findings per area

| Area | Stronger line | What the frames show |
| --- | --- | --- |
| Service vans | visual-excellence | lofted shell with rounded roof and hood, lamp pockets with projectors, grille, air dam, tapered teal wrap sweep. Base van reads as a soft box. |
| Headquarters | visual-excellence | entry tower, storefront rhythm, accessible stall and ramp, curbed islands with date palms, arrows and fire lane, light poles, chain-link yard with equipment. Base HQ is two extrusions on a large empty slab. |
| Vegetation, streets, neighborhood | visual-excellence | fan and date palms, patios, solar, bins, street lights, hydrants. Regression: asphalt cracks and tire-wear bands too dark at the close camera, visible tiling along long streets. |
| Night lighting | visual-excellence | light pools under poles and wall packs, lit interiors, moonlit fill keeps forms readable. Cinematic night is murky with only trim and windows glowing. |
| 16:00–19:30 grading | cinematic | visual-excellence keeps near-noon intensity until sunset (its own report notes this); cinematic's sun-height falloff and warmth read as evening at 18:30. Cinematic was too dim at 07:00–08:00. |
| Character system | visual-excellence | pose blending, ankle joints, per-person build, install load, knee pads, cap with badge, name patch, smooth turning, render probe used by its tests. Cinematic's uniform (hard hat, vest bands, safety glasses, gloves) does not justify replacing the rig. Its 1.12× scale makes the condenser look knee-high. |
| Condenser | parked WIP (neither branch) | visual-excellence's merged condenser had its slat packs, coil faces, service panel and line set unrotated on every house (all use yaw −90°), so they stuck out of the cabinet. The parked WIP unit is the most believable (wrapped louvers, fan guard, service corner, insulated line set, wall disconnect, gauges hosed to the valves) but costs ~490 extra draw calls in its current per-house form. |
| Technician–unit interaction | neither | both lines rest a hand on the top of the unit beside the fan guard; visual-excellence's gauges lie unconnected; nobody works the service panel. |
| Camera / UI | visual-excellence | focus with elevation and look-at height, Photo Mode, panel motion, turntable. |

## Conflict resolution

| File | Resolution | Reason |
| --- | --- | --- |
| `src/world/characters/Worker.tsx` | visual-excellence | rig is a functional superset; `LiveEntities` on that branch depends on it. Cinematic version stays in history (`b60dd15`). |
| `src/world/scene/Atmosphere.tsx` | hand merge | visual-excellence system kept whole; added cinematic's sun-height falloff (softened so 08:00 keeps ~79% sun), warm ground at low sun and the EGO teal trim glowing after dusk. |
| `playwright.config.ts` | auto-merge, verified | installed-Chrome fallback (cinematic) + longer timeout and 1024×768 project (visual-excellence). |
| `src/game/simulation/weather.ts` | auto-merge, verified | exported sunrise/sunset minutes (cinematic) + twilight elevation ramp (visual-excellence). |

Post-merge fixes on the integration branch: prop geometry now turns with the unit's yaw
(condensers on every house, rooftop units, yard props); asphalt cracks and wear bands toned down.

Two pre-existing test races were fixed in the specs, not in the game (both reproduce on the
original branches when run on a GPU, because their gates ran on a ~0.5 fps software renderer):
the rendered technician is now allowed to settle before its position is asserted, and the hire
step checks the raised "Hired" celebration instead of whichever celebration the banner shows.

## Integration results

Branch `integration/v3-unified` (local only): `907f2df` → merge `14080d3` → fixes `7d7e2a1`,
`af39264`, `8d3a998`.

### Tests (final commit, installed Chrome 156, Intel Arc 140V GPU)

| Gate | Result |
| --- | --- |
| `tsc -b --noEmit` | clean |
| ESLint (`src`, `e2e`) | clean |
| Vitest | 17 / 17 (determinism, A* routing, job loop, growth, save/load, 90-day campaign) |
| `vite build` | OK |
| Playwright gameplay (17-step loop incl. save/reload) | pass; also 3 / 3 repeated runs |
| Playwright graphics, 1920×1080 / 1366×768 / 1024×768 | 3 / 3 pass |

Before the spec fixes, visual-excellence's own unmodified graphics spec failed against its own
build on this GPU in the same way (rendered technician 3.65 m from the simulated spot).

### Performance (uncapped: vsync and frame limiter off, 1920×1080, High)

Average fps over 5 s, simulation paused, same views, two runs per build. Run-to-run noise is
about ±5%. A stray in-app browser tab rendering the game on the dev server skewed the first
passes (cinematic measured 80–92 fps with it open), so every figure below comes from runs taken
after it was closed.

| View | cinematic | visual-excellence | integration |
| --- | --- | --- | --- |
| Overview 10:00 | 107–114 | 60–65 | 64–67 |
| HQ 10:00 | 107–117 | 62–67 | 65–67 |
| HQ 21:00 | 118–121 | 67–69 | 70–72 |
| Overview 21:00 | 117–127 | 67–69 | 70–72 |
| Draw calls (overview / HQ) | 572 / 506 | 590 / 567 | 590 / 567 |
| Triangles | 625k | 1,382k | 1,382k |
| JS heap | 45 MB | 61 MB | 59 MB |
| JS bundle (gzip) | 396 KB | 409 KB | 409 KB |
| Vehicle GLBs | 1.7 MB | 3.1 MB | 3.1 MB |

The integration performs like visual-excellence. Both cost about 40% of the uncapped frame rate
against cinematic (≈110 → ≈65 fps) because of the 2.2× triangle count (lofted vans at ~17k
triangles each, fan and date palms, HQ and yard props). They still average above 60 fps uncapped
on this integrated GPU at 1080p High, but the headroom for weaker GPUs is much smaller: LOD and
a triangle budget are now a real priority, not a nicety.

### Lighting (sun intensity, full sun = 2.7)

| Time | cinematic | visual-excellence | integration |
| --- | --- | --- | --- |
| 07:00 | 1.30 | 2.70 | 1.82 |
| 08:00 | 1.76 | 2.70 | 2.13 |
| 13:00 | 2.59 | 2.70 | 2.70 |
| 16:00 | 2.17 | 2.70 | 2.41 |
| 17:30 | 1.66 | 2.70 | 2.06 |
| 18:30 | 1.15 | 2.33 | 1.49 |
| 21:00 | 0 (no moon) | 0.14 (moon) | 0.14 (moon) |

### Visual result against both originals

- Vans, HQ, lot, yard, neighborhood props, palms, night light pools, Photo Mode: identical to
  visual-excellence (retained whole).
- Condensers on all 32 houses and the rooftop/yard equipment now sit correctly; draw calls and
  triangles unchanged by the fix.
- Streets: cracks and wear read as texture, not noise.
- Afternoon light falls off toward evening; mornings softer than visual-excellence, brighter
  than cinematic; EGO teal trim glows after dusk.

## Remaining defects

1. **Technician–condenser interaction (both lines).** The technician rests a hand on the top
   of the unit beside the fan guard; the merged condenser faces its service panel and line set
   toward the house wall while the technician works from the yard side; the gauge manifold is
   staged on the ground with unconnected hoses; the 1.12× worker scale makes a 0.96 m unit look
   knee-high. This is the condenser milestone.
2. **Condenser detail.** The merged unit is plainer than the parked WIP (no wrapped service
   corner, data plate, insulated suction plus bare liquid line, gauge hookups). The WIP's
   per-house meshes cost ~490 extra draw calls; porting its detail into the merged builder keeps
   one draw call per material.
3. **Celebration banner (pre-existing UX).** Only the newest celebration is shown, so "Hired"
   can expire unseen when the first hire also unlocks a milestone and a level. Celebrations
   should queue.
4. **Asphalt patch seam.** A brighter rectangular asphalt patch shows a visible edge on long
   streets (from visual-excellence's road set).
5. **No long shadows at sunset.** The shadow sun is still floored at 0.07 rad against acne.
6. **Frame-rate headroom.** The merged graphics cost ~40% of uncapped fps (≈110 → ≈65 at 1080p
   High on an Intel Arc 140V). There is no LOD: palms, vans and houses render full detail at
   every distance and are the first LOD targets.
7. **Branding choices to confirm.** Visual-excellence dropped the "Measured. Verified. Done
   right." slogan from the vans and the HQ sign band on purpose (illegible at game distance).
8. **Not integrated by choice.** Cinematic's technician-v2 uniform (hard hat, vest bands,
   safety glasses, gloves) — the visual-excellence character is kept; individual details can be
   ported onto its rig later if wanted.
9. **Tooling.** Blender MCP was not reachable in this session; every asset in both lines is
   generated in code (procedural or the Node glTF exporter), not artist-authored.

## Recommendation

Adopt `integration/v3-unified` as the V3 graphics baseline: it keeps every visual-excellence
asset, adds cinematic's afternoon grading and the fixes above, passes the complete gate on real
hardware, and performs like visual-excellence. Merging it into `v3-cinematic-assets` (a fast-
forward of that branch is possible, since the integration branch starts from its tip) waits for
approval. The condenser milestone should then be built on it: port the parked WIP's detail into
the merged condenser, turn the service corner toward the technician's side, connect the gauges
to the service valves and re-pose the technician against the open panel.

## Reproducing

Scripts used for this report are in `docs/integration/scripts/`; data in
`docs/integration/data/`. Build each ref in a worktree, serve its `dist` with
`vite preview`, then run with `NODE_PATH=<repo>/node_modules`:
`node capture.cjs <label> <url> <outDir>`, `node compose.cjs <root> <out> <labels> [shots] jpg`,
`node perf.cjs <label> <url> <file>`, `node atmo.cjs <label> <url> <file>`.
