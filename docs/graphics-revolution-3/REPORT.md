# Graphics Revolution 3.0: Report

Every image is a real render from the game. Sheets, in `sheets/`:

| Sheet | Shows |
|---|---|
| `01-character-before-after.png` | Standing, walking, kneeling: previous generation and generation 3 |
| `02-plaza-before-after.png` | Mesquite Plaza, same moments and cameras, before and after |
| `03-modern-before-after.png` | Modern home a-n-4, the same |
| `04-crew-lineup.png` | Twelve people across every role |
| `05-close-ups.png` | Face, profile, back, gameplay distance, hands |
| `06-phone.png` | 390×844 viewport (Chromium emulation) |
| `07-video-frames-plaza.png` | Frames from the gameplay video, through the in-game Watch Work camera |

The videos (37 to 50 MB each, 1280×720, no HUD) stay on this machine, in `evidence/after/video/` and
`evidence/before/rooftop-video-desktop-1080p/rooftop-video/`.

## Hand and foot contact

Worst distance a hand or foot fell short of its target, measured on the real skeleton in the game, in metres.

| Stage | Before fixes (Plaza) | Plaza | Modern home |
|---|---|---|---|
| Ladder off the rack | 0.586 | under 0.005 | under 0.005 |
| Setting it down | 0.116 | under 0.005 | under 0.005 |
| Raising | 0.330 | 0.015 | under 0.005 |
| Climbing | 0.020 | 0.014 | 0.035 |
| Over the parapet or slab edge | 0.126 | 0.015 | 0.048 |
| Lowering | 0.316 | 0.017 | under 0.005 |
| Laying down and picking up from the ground | 0.325 | 0.076 | 0.073 |
| Stowing | 0.460 | under 0.005 | under 0.005 |

`src/tests/ladderReach.test.ts` checks reach for every frame at all five reachable roofs with all four vehicle classes.
That test uses a simplified model of the body, which matched the game's 0.586 m. Only the starter van was measured in the
game; the other vehicles have passed only this test.

## Performance

Same machine (Intel Arc 140V), production builds, same seed. Baseline `f463050`, generation 3 `0e77535`; the one later code
change does not affect rendering. **Uncapped:** vsync and the browser's frame limit are off, because a 60 Hz cap would have
hidden any difference. The earlier baseline hit that cap (16.7 ms everywhere), so it was measured again.

### Desktop, 1920×1080, High (three runs each; fps and percentiles as run 1 / 2 / 3)

| | Opening | Ten technicians, close | Two rooftop jobs |
|---|---|---|---|
| fps, before | 164 / 163 / 164 | 144 / 142 / 141 | 199 / 200 / 198 |
| fps, after | 167 / 162 / 167 | 145 / 143 / 143 | 199 / 197 / 200 |
| p95 ms, before | 13.3 / 12.9 / 13.3 | 15.0 / 15.5 / 16.0 | 13.2 / 12.9 / 13.2 |
| p95 ms, after | 14.9 / 14.5 / 13.4 | **20.2 / 20.3 / 20.2** | 10.7 / 11.2 / 10.5 |
| p99 ms, before | 21.5 / 21.0 / 20.9 | 22.5 / 21.9 / 22.2 | 23.2 / 22.6 / 23.6 |
| p99 ms, after | 35.5 / 21.9 / 23.0 | 22.0 / 21.9 / 22.6 | 21.6 / 21.9 / 21.5 |
| Frames over 33 ms, before | 3 / 3 / 3 | 0 / 1 / 1 | 0 / 0 / 0 |
| Frames over 33 ms, after | 10 / 3 / 9 | 1 / 3 / 5 | 0 / 1 / 1 |
| Draw calls | 938 → 918 | 851 → **510** | 448 → 415 |
| Triangles | 2.25 M → 2.24 M | 2.56 M → 2.55 M | 2.04 M → 2.04 M |
| Character CPU, ms a frame | 0.015 → 0.020 | 0.117 → 0.214 | 0.036 → 0.072 |
| Browser memory, MB | 2138 → 2415 | 2230 → 2458 | 2208 → 2348 |

Load, new game to scene: 5.3 s → 5.6 s. Character files: 732 KB → 2230 KB.

### Phone emulation, 390×844, Balanced preset, CPU slowed 4×

The automatic quality step-down was off for both, so both ran the same preset. The GPU is still this desktop's: this tests
CPU cost, not a phone's GPU, heat or memory limits.

| | Opening | Ten technicians, close | Two rooftop jobs |
|---|---|---|---|
| fps | 33 → 34 | 29 → 39 | 48 → 50 |
| p95 ms | 44.8 → 44.5 | 63.7 → 40.5 | 36.5 → 36.0 |
| p99 ms | 49.0 → 46.5 | 67.5 → 43.6 | 52.9 → 51.8 |
| Draw calls | 965 → 945 | 836 → 498 | 483 → 443 |
| Character CPU, ms a frame | 0.071 → 0.101 | 0.598 → 1.193 | 0.277 → 0.450 |
| Browser memory, MB | 1572 → 1605 | 1611 → 1624 | 1659 → 1666 |

Load: 10.7 s → 10.4 s. Character files: 732 KB → 1995 KB. One run each, so small differences here are not meaningful.

### Findings

- **Average frame rate is unchanged.** Draw calls drop, most with ten technicians.
- **Character CPU roughly doubles,** but stays small: about 1.2 ms of a 33 ms budget at the worst emulated case.
- **Regression, ten technicians on desktop: p95 15.5 ms → 20.2 ms, in all three runs.** About every 16th frame is heavier. A
  probe (`evidence/perf2/ten-tech-probe.json`) measured p95 at 20.5 ms with the characters hidden as well, so drawing them
  is not the cause. **The source is not identified.** At a 60 Hz cap neither build went over 17.6 ms in any scene, so no
  frames were dropped on this machine.
- **The opening has occasional long frames:** 10 and 9 over 33 ms in two of three runs, against 3 for the baseline. These
  samples are 6 seconds long, and this was not investigated further.
- **Desktop memory is about 140 to 280 MB higher,** most of it in the GPU process. The likely cause is the 2048 textures, but
  that was not isolated. Phones load the smaller set and rise by 7 to 33 MB. KTX2 remains the next step if real phones
  struggle (`DECISIONS.md` #10).

## Defects found in the game and fixed

| Defect | Cause | Fix |
|---|---|---|
| Hands up to 1.2 m off the ladder (box truck, by the sweep) | He stood past the ladder's end, with the grips behind him | He walks under it, with a hand on each rail just ahead of him |
| Boots sunk out of sight on sidewalks | Walking paths at height 0; sidewalks are 14.5 cm tall. Also in the previous generation | `src/world/roads/walkSurface.ts` lifts walkers, with short ramps. Visual only |
| Cap bill a thin wire from the front, then buried in the forehead | Almost flat; then pitched down from its root | Leaves the forehead level, then curves down |
| Office staff with a patch of hair high on the head | The clearing around the ears reached far above them | Hair and painted stubble come down to the ears |
| Jagged moustache edge | The head's topology showed along it | Edge smoothed |
| Pausing turned a walking technician into a standing one | The gait saw no ground speed | A paused game holds the stride |
| Free hand hovering at rooftop units | Fingers pointed into the panel | Palm flat on the panel, fingers up |
| Tall racks' ladders popped when the job started | The tip applied at once | It eases in |

## Regression

All on Chromium, one worker, memory guarded. Results: `evidence/regress/runs.txt`, and `evidence/runs.txt` for character QA.

| Area | Specs | Projects |
|---|---|---|
| Mission 01, end to end through the UI, 1× | `rooftop-mission` | desktop, 390×844, landscape |
| Mission 01 at 5× | `rooftop-mission` | desktop |
| Rooftop service, both sites | `rooftop-service` | desktop |
| Ground service, hiring, finance, saving | `gameplay` | desktop |
| Save and load during rooftop work | `rooftop-persistence` | desktop |
| Camera modes | `service-camera`, `service-camera-feedback`, `rooftop-camera` | desktop, laptop, small, phones, landscape (varies by spec) |
| Game speed changing through a rooftop job | `character-qa` | desktop, 390×844, landscape |
| Employee variations | `character-qa`, `technician-load`, `technician-showcase` | desktop, 390×844, landscape (varies by spec) |
| Touch play | `mobile` | iPhone and Android, portrait and landscape; tablet portrait |
| Other systems | `graphics`, `supply`, `automation`, `banking`, `banking-layout`, `rooftop-sites` | varies by spec |

Typecheck, lint and the production build pass. Unit tests: 263 passed, 6 skipped.

**Failures, for the record:**
- `rooftop-mission` on 390×844 and `mobile` on Android portrait each failed
  once, because a batch of mine overran its time limit and overlapped the next (`ERR_CONNECTION_REFUSED`, a missing trace
  file). Both passed when rerun alone.
- Most of the regression ran at `58a6297`. Later changes were limited to assets, the paused stride and the panel hand. After
  them, `gameplay`, `rooftop-persistence`, `mobile` on iPhone portrait and Mission 01 at 5× were rerun, along with character
  QA, reviews and videos. Mission 01 at 1× and `rooftop-service` at the modern home were last run before those changes.

**Not run:** `rooftop-review` on the phone was not repeated for this
milestone (`character-qa` covers the same moments there), and the old `technician-perf` spec, replaced by `character-perf`.

## Memory

No run hit the 1200 MB floor (`tools/run-guarded.mjs`). The lowest was 1355 MB, in `technician-showcase`, with the owner's
Chrome at about 3.7 GB. My batch overlap took it to about 2 GB earlier. Two of my baseline preview servers outlived their runs
and were stopped once identified by their command lines. No other application was touched.

## Open

- **No real phone has been tested.** This is the biggest remaining unknown.
- The source of the heavier frames with ten technicians, above.
- Bare-headed staff still have high hairlines for some styles and a thin moustache; caps from behind, with the head bent, show
  little hair. Faces are believable at game distance, less so in extreme close-up.
- Hands are 7 to 8 cm off the rails for brief moments at floor level.
- Open from the earlier rooftop review and not re-examined here: small spikes in the trousers at deep knee bends.
- Also from that review, not re-examined: plaza carry-back framing and the tree that briefly covers him at the modern home.
