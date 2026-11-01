# Rooftop gameplay visual review

Branch `feature/v3-technicians-rooftop-service`, on top of `250a0d0` (the commit deployed to the Vercel Preview).
Every image here is a real in-game render from the production build (Playwright driving Chrome); nothing is mocked up.

## Sheets (start here)

| Sheet | What it shows |
| --- | --- |
| `sheets/01-technician-before-after.png` | Close-ups of the fixed defects: first step, halfway up, descending, rooftop repair |
| `sheets/02-service-camera-before-after.png` | The in-game Watch Work camera, frames from real gameplay video at the same stage, before and after |
| `sheets/03-plaza-12-moments-desktop.png` | Mesquite Plaza (commercial): the 12 requested moments, wide view + close-up each |
| `sheets/04-modern-12-moments-desktop.png` | Modern home a-n-4 (residential): the same 12 moments |
| `sheets/05-plaza-12-moments-phone.png`, `06-modern-…` | The 12 moments on a 390×844 phone viewport (Chromium emulation) |
| `sheets/07-discoverability.png`, `08-…-phone.png` | The new rooftop indicators |

Close-ups are taken in the game's Photo mode (free play keeps the camera farther out); the game is paused for each
shot and the HUD hidden. Wide views use the normal free-play camera limits.

Raw captures (full resolution), the matched video frames and the four videos (`before/video/*.webm`,
`after/video/*.webm`, 37–50 MB each, 1280×720, the game's canvas recorded at 30 fps, so no HTML HUD) stay on this
machine and are not committed (`.gitignore`); the specs below regenerate them. `timelines/` has the stage timeline
of each video (seconds → choreography stage).

## Why "No open service call"

- **Calls are random, and rooftop calls are a minority.** Each call goes to a random idle customer: 6 of the 34
  customers in a new game have rooftop equipment (Mesquite Plaza, Desert Ridge Offices, and modern homes a-n-4,
  a-s-1, b-s-3, c-n-2), and 5 of those 6 can be reached by ladder. That makes about one call in seven a rooftop
  job, so selecting the plaza at a random moment usually finds no call. Desert Ridge Offices can never be serviced
  (its roof is out of ladder reach), so its calls expire.
- **The property said nothing about its roof between calls.** The inspector showed only "No open service call", and
  rooftop calls looked the same as ground calls on the map pin and in the Jobs list.
- **The equipment itself is visible.** From the normal property view (Center camera on property) the plaza's three
  RTUs are plainly visible on the deck (`after/discover-desktop/1-property-selected.png`). They are hidden only from
  street-level angles, behind the parapet.

**Changes (minimal, no economics touched, no cheat button):**
- When a rooftop property has no open call, the inspector says the system is on the roof, how it's reached and how to
  watch a call. For Desert Ridge Offices it says the roof is out of ladder reach and calls there can't be taken.
- A **Show rooftop unit** button frames the unit and the ladder's access wall.
- Rooftop calls are marked: the map pin reads **New call · Rooftop**, and the Jobs list shows a **Rooftop** tag.

## Reproducing the two rooftop jobs

**In normal play (Preview or local):** start a game. When a pin reads **· Rooftop** (or a Jobs row has the Rooftop
tag), click it, **Accept**, then **Dispatch** the starter van, which carries the ladder rack. When the van arrives,
press **Watch** in the job panel and leave it at Watch Work. Then choose the diagnosis, and send a **repair** quote
when asked; rooftop replacements are refused. Commercial: Desert Sun Dental at Mesquite Plaza (610 Mesquite St, a
direct customer). Residential: warranty customers at the modern flat-roofed homes.

**Without waiting for a random call:** in the browser console (an existing test hook, not reachable from the UI), at
a new game, for the plaza:

```js
const e = window.__ego; const s = e.getState();
const id = e.spawnLead({ preferredLotId: 'cm-plaza', channel: 'direct', faultId: 'contactor' });
e.dispatch({ type: 'accept-lead', jobId: id });
e.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
```

For the residential job, use `preferredLotId: 'a-n-4'`. Then press Watch as above.

**Automated (deterministic: seed 42, contactor fault, owner + starter van):**

```
npm run build
npx playwright test e2e/rooftop-review.spec.ts --project=desktop-1080p   # 12 moments x 2 sites + discoverability
npx playwright test e2e/rooftop-review.spec.ts --project=phone-390x844
npx playwright test e2e/rooftop-video.spec.ts  --project=desktop-1080p   # the two videos
```

Copy `test-results/` out after each run: Playwright empties that folder at the start of every run.
`node tools/qa-sheet.mjs` and `node tools/video-frames.mjs` build the sheets and sample video frames (usage at the top
of each).

## Visual QA findings

| # | Finding | Where | Status |
| --- | --- | --- | --- |
| 1 | Climbing: one hand left the ladder, the arm folded back to the hip. The body hugged the rails (hand targets 10 cm in front of the chest, at shoulder height), and the hands' rungs were too low | `rooftopChoreo.ts` climb frame | **Fixed.** Body 0.36 m out from the rails (was 0.16); hand rungs raised (right +0, left +2, alternating). Swept over the whole climb at both sites: both hands always within reach, between shoulder and overhead height, 0 cm miss |
| 2 | First step onto the ladder: right hand floating in the air | same | **Fixed** (same change) |
| 3 | Repair at an RTU: the kneeling technician's free arm reached straight up to the top of the 1.6 m cabinet (the brace target was made for 0.96 m ground condensers) | `Worker.tsx` repair clip | **Fixed.** On cabinets taller than 1.2 m the free hand braces flat on the service panel; ground units unchanged. IK unit test case added |
| 4 | Watch Work during the climb fell back to the aerial Property overview (the whole 6.5 m ladder had to fit within 12 m of the camera) | `rooftopCamera.ts` | **Fixed.** Frames the rungs around him; ServiceDirector follows every 1.4 m of climb (was 3 m, so he climbed out of frame) |
| 5 | Watch Work perched the camera on the van roof; the van and its rack filled the foreground | same | **Fixed** for the ladder and roof stages. The space over the van is kept clear of the camera (Property still frames the van) |
| 6 | Narrow side yard at the modern home: no eye-level view, so it fell back to the overview across the house | same | **Improved.** Watch Work now tries a top-down view before falling back; the technician is visible but small |
| 7 | Carrying the ladder back at the plaza: the van is still in the foreground and the technician can be cut at the frame edge | camera | Open (minor) |
| 8 | Modern home, carrying back through the front yard: a tree crown partly covers him for a moment | camera | Open (minor) |
| 9 | Trouser mesh shows small dark spikes at the knee and below the polo hem when the knee is deeply bent (climbing, kneeling) | `technician.glb` skin weights | Open: needs the Blender model regenerated, outside this review |
| 10 | Ladder carry looked like it passes through the head | — | **Not a defect.** It is carried on edge with the lower rail on the right shoulder; from his left it reads as overhead, and it clears the head |
| 11 | Modern home: the ladder leans across a window | `rooftops.ts` access point | Acceptable: the rails rest on the slab edge above, not on the glass |
| 12 | Proportions, face, gloves, boots, uniform | close-ups | No LEGO-like joints, ball shoulders or floating feet seen. Feet rest on the rungs while climbing, and boots are planted while walking and kneeling |

Things checked and found correct: one ladder throughout (never doubled or teleported); the ladder is off the rack
while he's on the roof and back on it before the van leaves; the transfer over the plaza parapet and off the modern
home's slab edge; the RTUs are clearly visible and full-size next to him.

## Test record

See `runs.txt`: one Playwright worker, free RAM about 6 GB throughout. The "before" set came from a build of
`250a0d0`'s `src/`, with the fixes stashed and then restored byte-for-byte. After the fixes:
- rooftop-review: 3/3 on desktop, 3/3 on phone.
- rooftop-video: 2/2.
- rooftop-camera: desktop and 390×844. The first run failed: the van keep-out volume hid the van from Property mode.
  That was fixed, then both passed.
- rooftop-service: plaza and a-n-4.
- rooftop-persistence, gameplay, mobile (iphone-portrait), service-camera: all pass.
- Typecheck, lint, unit tests (220 passed, 6 skipped) and the production build pass.

The review stills were captured before that last camera fix. They use scripted cameras, not Watch Work, so the fix
doesn't affect them; the videos were re-recorded after it. No real phone was used: phone results are Chromium
emulation only.
