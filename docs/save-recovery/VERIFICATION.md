# Save Recovery 1.0: verification record

Branch `feature/v3-save-recovery`. Code under test: `489f9bd` (implementation) and `f3f73da` (two test corrections and a
documentation note; no game code changed between them). The policy is described in `ARCHITECTURE.md` under
"Save architecture".

All browser runs used one Playwright worker and one browser at a time, on a 16 GB Windows laptop with installed
Chrome, and were started only with at least 5.5 GB of physical memory free.

## Results

| Check | Build | Profile | Result | Run against |
| --- | --- | --- | --- | --- |
| Typecheck, lint, production build | standard | - | clean | `f3f73da` |
| Unit tests (38 in `saveRecovery.test.ts`, 15 in `crashRecovery.test.ts`) | - | - | 328 passed, 6 skipped | `f3f73da` |
| `save-recovery.spec.ts` | standard | desktop 1080p | 2 of 2 | `f3f73da` |
| `save-recovery.spec.ts` | standard | iPhone portrait | 2 of 2 | `f3f73da` |
| `save-recovery.spec.ts` | standard | iPhone landscape | 2 of 2 | `f3f73da` |
| `release-hooks.spec.ts` | standard | desktop 1080p | 1 of 1 | `f3f73da` |
| `rooftop-mission.spec.ts` (Mission 01) | standard | desktop 1080p | 3 of 3 | `f3f73da` |
| `rooftop-persistence.spec.ts` | standard | desktop 1080p | 1 of 1 | `f3f73da` |
| `supply.spec.ts` | standard | desktop 1080p | 1 of 1 | `f3f73da` |
| `hiring.spec.ts` | standard | iPhone portrait | 1 of 1 | `f3f73da` |
| `mobile.spec.ts` | standard | iPhone portrait | 1 of 1 | `f3f73da` |
| `camera-zoom.spec.ts` | standard | iPhone portrait | 1 passed, 6 skipped | `f3f73da` |
| `crash-recovery.spec.ts` | crash-test | desktop 1080p, iPhone portrait, iPhone landscape | 4 of 4 on each | `489f9bd` |
| `automation`, `banking`, `gameplay`, `hiring` specs | standard | desktop 1080p | 1 of 1 each | `489f9bd` |
| `camera-zoom.spec.ts` | standard | desktop 1080p | 6 passed, 1 skipped | `489f9bd` |

Skips, all intentional and decided by the specs themselves:

- Unit: the six skipped tests are probe files (`*.probe.test.ts`) that only run on request.
- `camera-zoom` on a phone skips its six mouse-wheel tests; on desktop it skips the pinch test.

Runs listed against `489f9bd` were not repeated at `f3f73da` because nothing they exercise changed.

## What the Mission 01 run covers

`Mission 01 end to end, from New Game to regular business` plays the whole rooftop mission (dispatch, arrival, ladder,
rooftop work, diagnosis, authorization, repair, summary, cash and progress). `save and reload during the opening
rooftop sequence` saves mid-climb, reloads the page and continues: the technician is back on the ladder, on the same
objective, in the same job. `an existing company continues where it was` loads a previous-version (schema 5) manual
save and checks no mission and no second call are added.

That third test was changed for the new policy. It used to write the old save while a different company was running,
then reload; leaving a running game autosaves it, and Continue now loads the newest save, so the running company's
autosave won. The test now reloads to the main menu first (where the game writes nothing), leaves only the old manual
save on the device, asserts that, and continues. Its assertions about the loaded company are unchanged.

## The landscape menu check

The first landscape run failed with "Start a new company" 99.5% in view after scrolling. The check was not simply
loosened. On every profile each menu control must now be: at least 98% in view and at most 1.5 px outside it; the
element a tap at its centre hits (nothing covers it); at least 44 px tall on touch. "Start a new company" is tapped for
real and its dialog dismissed, and on phones the menu is rotated to the other orientation and back with the same
checks each way. All of this passes on iPhone landscape, iPhone portrait and desktop.

## Save safety, as verified

- Newest valid save is selected: unit cases 1 to 4 and the write-counter case; in the browser, a real reload resumes
  from the newer autosave.
- The manual save is byte for byte unchanged after loading the autosave, and after later autosaves: unit case 1 and
  the first browser test.
- Damaged and newer-version saves are left in place, and copied to a kept slot before anything replaces them: unit
  cases 5 to 7 and the second browser test.
- Set-aside saves are listed and load: unit case 10 and the first browser test ("Set-aside autosave").
- A simulation failure blocks every save path: unit case 8 and `crash-recovery.spec.ts`.
- Saves from the previous build load unchanged: unit "saves from before this version", the second browser test, and
  the Mission 01 schema 5 test.
- A save that fails as it loads is skipped on the next visit, not deleted: unit case 10 and the fourth crash-recovery
  test.

The browser specs use real `localStorage` and real page reloads, so the write counter and timestamps are the game's
own. The unit tests write through `saveToStorage` except where a test sets the counter on purpose (to show the
counter, not the clock, decides).

## Release build

- The production bundle contains no crash injection: no `window.__ego.crash`, an empty `setCrashTest`, no injected
  failure text (checked in the built files and by `release-hooks.spec.ts`).
- `dist-crashtest` is ignored by Git and separate from `dist`. It must never be deployed. The repository has no
  `vercel.json`; the Vercel project's output directory must be `dist` and its build command the standard
  `npm run build`.
- Open, separate: the other `window.__ego` hooks (`dispatch`, `advanceMinutes`, `spawnLead`, `app`) still ship in
  production. See "Release hardening, open" in `ARCHITECTURE.md`.

## Known limits

- One kept copy per slot; a later one replaces it.
- Up to four saves can be stored. Save size against the browser's storage quota was not measured; if the quota is
  reached the kept copy is skipped and a failed write returns false.
- Validation checks structure, not every rule of the simulation.
- The load guard cannot tell a save that breaks the game from a build that breaks on every save; the menu then
  alternates between saves, and nothing is lost.
- Not run: the Android and tablet profiles, and the specs that neither save nor load (graphics, service camera,
  rooftop camera, character and performance specs).
- Screenshots in `docs/screenshots/save-recovery/`.
