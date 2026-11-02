# Mission 01: Rooftop Rescue

Branch `feature/v3-rooftop-first-mission`, from `37f1458`. Committed locally: nothing pushed, merged or deployed.

**Status: READY FOR VERCEL PREVIEW**, on the owner's authorization. Real phones are not tested (Chromium emulation only):
that remains a preview-stage playtest item.

## What it is

Every new campaign opens on one real service call at Mesquite Plaza: Desert Sun Dental, rooftop unit running but not
cooling, fault `dirty-condenser`. It runs through the normal workflow, rooftop access rules, ladder choreography and
ledger. There is no separate tutorial engine and no mission payment.

- `src/game/progression/mission.ts`: the objective is derived from the job and van (`missionStage`), so a save at any
  moment resumes correctly. Optional `GameState.mission` and `Job.authorization`; schema 6.
- `src/ui/overlays/MissionCoach.tsx`: objective card, camera cues, summary. `src/world/scene/missionCamera.ts`: opening shots.
- Older saves load with no mission and never get one.

## Decisions

- **Starter setup unchanged.** Unit 1 already has the ladder rack, and the owner is a technician.
- **Wrong diagnosis:** refused with an explanation while the mission is active. After Skip guide, normal rules and
  callbacks apply.
- **Authorization:** the customer has approved up to 115% of book price ($374) and reviews the quote for 12 game minutes,
  with no random draw. Over the limit is refused and can be corrected. Nothing is booked before approval.
- **Other leads** wait during the mission, then arrive spaced out. The schedule is drawn as usual, so seeds stay comparable.
- **Skip guide** leaves the same job as an ordinary call. **Decline** ends the mission and opens regular business.
- **Small screens:** while only watching, the card folds and the inspector closes; both return at decisions.
- **Arrival:** the service camera opens on the Property view so the van is seen pulling in, then goes to Watch Work.
- **5×:** on the way up and through the pack-up the camera holds the Property view, because the moves are over before a
  follow shot could land. At the unit it returns to the chosen shot.
- **Test fixture:** `opening: 'residential-call'` gives the regular-system tests their ordinary first job. The gameplay,
  graphics and mobile specs decline the mission and spawn that call.

## Validation on the final code

Full log: `runs.txt`. It also records the failed runs that led to the fixes below. One Playwright worker, one spec at a time.

| Check | Result |
|---|---|
| TypeScript, ESLint, production build | Pass |
| Vitest | 244 passed, 6 skipped (includes 24 in `src/tests/mission.test.ts`) |
| Mission spec on the final code, desktop-1080p, phone-390x844, iphone-landscape, at 1× and at 5× | All passed: 3 tests per run. The upright phone at 5× ran three times because it had failed once intermittently |
| Regression on the final code | rooftop-persistence, service-camera (desktop), mobile (iphone-portrait) passed |
| Regression on the build just before the last mission-only camera changes | 15 desktop specs and 29 phone, tablet, laptop, small-screen, rooftop review and video runs passed; then rooftop-service, rooftop-camera (3 layouts), service-camera (2), service-camera-feedback, gameplay, mobile passed |

The changes after the full regression affect only the mission's arrival cue and the rooftop service camera at 5×, so the
full matrix was not repeated: the specs that exercise those paths were.

Technician in view (head and chest on screen, not under the UI) in the final runs:

| Project | Climb 1× | Climb 5× | Diagnosis, repair | Descent 1× | Descent 5× |
|---|---|---|---|---|---|
| desktop-1080p | 9/10 | 6/6 | 6/6, 6/6 at both speeds | 8/8 | 4/4 |
| phone-390x844 | 9/10 | 6/6 (3 runs) | 6/6, 6/6 at both speeds | 8/8 | 4/4 (3 runs) |
| iphone-landscape | 9/10 | 6/6 | 6/6, 6/6 at both speeds | 8/8 | 4/4 |

The one miss at 1× in each is his head brushing the HUD or card for a moment while the camera catches up.

Evidence: labeled sheets of real gameplay in `sheets/`. Raw captures stay local under `evidence/`.

## Issues found by reviewing real captures, and fixed

- Opening shot cropped the building and hid the marker; pin and van labels were tiny from afar.
- Camera stayed on empty asphalt when the van left.
- Upright phone: the card and inspector hid the technician on the ladder. Fixed with folding, a closed inspector, a
  top band in the safe area and look-ahead on the ladder.
- Landscape phone: summary cut off at the top; the card overlapped the panel and then the action bar.
- 5×: the camera lost him on the ladder on phones, intermittently.
- The arrival shot framed a technician not yet out of the van, with no van in view.
- Phone milestone banner covered the card; the error banner was too narrow; "Not quite" lingered after the right answer.

## Known limitations

- Real phones are untested, so frame rate and heat on phone hardware are unknown.
- A milestone banner can pass briefly over the card and panel on a landscape phone during a decision.
- As the van leaves, a palm by the road can briefly hide it; its label stays visible.
- Rooftop Rescue is one scripted fault. Which readings are misread still depends on the seed, by design.
- At 5× on phones the technician is small on the ladder, because the view holds the whole wall.

## Re-running

```
npm run build
npx playwright test e2e/rooftop-mission.spec.ts --project=desktop-1080p --workers=1
MISSION_SPEED=5 npx playwright test e2e/rooftop-mission.spec.ts --project=phone-390x844 --workers=1
```

Running `gameplay` and other specs rewrites `docs/screenshots/`; restore it with `git restore docs/screenshots` unless
the new images are wanted.

## Next action

Owner authorization to push the branch and create a Vercel Preview, then a playtest on a real phone.
