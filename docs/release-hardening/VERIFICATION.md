# Release Hardening 1.0: verification record

Branch `feature/v3-release-hardening`, on top of Save Recovery 1.0 (`836c0e1`). The design is in `ARCHITECTURE.md`
under "Development, test and production interfaces".

Browser runs used one Playwright worker and one browser at a time on a 16 GB Windows laptop, each started only with at
least 5.5 GB of physical memory free.

## What changed for players

Nothing in the game. In the production bundle `window.__ego` went from seven members to a frozen object with two
(`build`, `crashLog`); `getState`, `dispatch`, `advanceMinutes`, `spawnLead` and `app` are gone, as are the
`__egoServiceZoom` and `__egoRoofSpec` globals. No save format changed.

## Bundles, as built

Occurrences of each marker in the main script of each build:

| Marker | Production (`dist`) | Test (`dist-e2e`) | Crash test (`dist-crashtest`) |
| --- | --- | --- | --- |
| `spawnLead` | 0 | 1 | 1 |
| `__egoRoofSpec` | 0 | 1 | 1 |
| `__egoServiceZoom` | 0 | 1 | 1 |
| `Simulated` (injected failure text) | 0 | 0 | 2 |

## Results

| Check | Build | Profile | Result |
| --- | --- | --- | --- |
| Typecheck, lint, production build | production | - | clean |
| Unit tests | - | - | 328 passed, 6 skipped |
| `production-release.spec.ts`: no mutating hooks | production | desktop 1080p, iPhone portrait | 1 of 1 on each |
| `production-release.spec.ts`: play through the real interface | production | desktop 1080p, iPhone portrait | 1 of 1 on each |
| `test-hooks.spec.ts`: exactly the test hooks, no crash injection | test | desktop 1080p | 1 of 1 |
| `hiring.spec.ts` | test | desktop 1080p, iPhone portrait | 1 of 1 on each |
| `save-recovery.spec.ts` | test | desktop 1080p, iPhone portrait, iPhone landscape | 2 of 2 on each |
| `gameplay.spec.ts` | test | desktop 1080p | 1 of 1 |
| `rooftop-mission.spec.ts` (Mission 01) | test | desktop 1080p | 3 of 3 |
| `mobile.spec.ts` | test | iPhone portrait | 1 of 1 |
| `camera-zoom.spec.ts` | test | iPhone portrait | 1 passed, 6 skipped |
| `rooftop-service.spec.ts` (reads `__egoRoofSpec`) | test | desktop 1080p | 1 of 1 |
| `rooftop-review.spec.ts` (reads `__egoRoofSpec`) | test | phone 390x844 | 3 of 3 |
| `rooftop-persistence.spec.ts` | test | desktop 1080p | 1 of 1 |
| `supply.spec.ts` | test | desktop 1080p | 1 of 1 |
| `banking.spec.ts` | test | desktop 1080p | 1 of 1 |
| `automation.spec.ts` | test | desktop 1080p | 1 of 1 |
| `camera-zoom.spec.ts` (reads `__egoServiceZoom`) | test | desktop 1080p | 6 passed, 1 skipped |
| `crash-recovery.spec.ts` (including the hook-set check) | crash test | desktop 1080p, iPhone portrait, iPhone landscape | 5 of 5 on each |

The production-release spec was run again last, after the final change to `package.json`: 2 of 2 on desktop and on
iPhone portrait.

Skips, all decided by the specs themselves: the six unit skips are probe files that run only on request;
`camera-zoom` skips its six mouse-wheel tests on a touch device and its pinch test on desktop.

The two globals that moved to test builds are both exercised: `__egoRoofSpec` by `rooftop-service` and
`rooftop-review`, `__egoServiceZoom` by `camera-zoom` on desktop and phone.

Not run in this pass:

- The graphics, service-camera, rooftop-camera, rooftop-sites, rooftop-video, banking-layout, character,
  technician and performance specs. They use the same hooks through the same test build as the specs above. Several
  also need `window.__egoThree`, which was and still is limited to profiling builds.
- Android and tablet profiles.
- `playwright.remote.config.ts` against a deployment: nothing was deployed.
- The capture and benchmark scripts under `docs/**/scripts` (see `CAPTURE_SCRIPTS.md`): they need a test build and
  were not re-run.

## What the production play-through does

With no hook at all: starts a company (seed 42), waits for the world by the loading screen and the frame counter, hires
from the hiring market and sees the charge on the cash display, opens the mission's call and accepts it, pauses, saves
with the game's own button, reloads the page, reads which save Continue names, continues, and finds the same cash,
clock, mission step and roster, then sets the speed to 2x and sees the clock move. Screenshots in
`docs/screenshots/release-hardening/`.

## Remaining release risks

- Specs other than `production-release` no longer run against the bundle that ships. The test build differs from it
  by one constant; the production play-through is the check that the difference is harmless.
- The hook-driven suites cannot run against a deployed URL any more. `playwright.remote.config.ts` now runs the
  production-release spec only.
- Not tamper-proofing: saves are in `localStorage` and the game is client-side. There is no shared state to protect.
- The read-only telemetry globals stay in production and cost a scene traversal every third frame, as before.
- Vercel must build with `npm run build` and serve `dist`. The repository has no `vercel.json`; check the project
  settings. `dist-e2e` and `dist-crashtest` must never be deployed.
