# EGO HVAC Empire: mobile public beta (0.3.0-beta)

Branch `release/v3-mobile-playtest` (from `work/v3-art-pipeline-performance` `30a4f3b`).
Public URL: **https://hvaccompanyownerv3.vercel.app** (Vercel project `hvac_company_owner_v3`, team
"egorsky14's projects"). No account or login; a static client-side build with no backend.

## What changed for phones

| Area | Behaviour |
| --- | --- |
| Welcome screen | Play / Continue, Start a new company (with confirmation when a save exists), Share (system share sheet) and Copy link, save notice, beta version and build commit |
| Start-up | Loading screen (CSS animations that keep moving on the compositor while shaders compile); the 3D world mounts only after it has painted; WebGL 2 check with a fallback screen |
| Layout (≤ 900 px wide or ≤ 560 px tall) | Compact HUD (cash, clock, speed), safe-area insets, 44 px touch targets, full-screen management sheets with single-column bodies, inspector as a side sheet (landscape) or bottom sheet (portrait), full-width bottom navigation in portrait, compact toasts |
| Camera | One finger pans, pinch zooms, two-finger twist rotates (three-stdlib MapControls); tap selects pins, houses, vans and technicians; the page never scrolls or zooms under the world; portrait widens the field of view (≤ 75°) so the city fits |
| Graphics presets | Touch devices show Battery Saver / Balanced / High (= low / medium / high: 1×, ≤1.25×, ≤1.5× pixel ratio). Phones start on Balanced (Battery Saver on ≤4 cores or ≤3 GB). If an automatically chosen preset runs below ~24 fps for 6 s after start-up, it steps down once and says so. Battery Saver also drops MSAA. Desktop keeps Low / Medium / High / Ultra and defaults to High |
| Vehicle previews | Phones and tablets show pre-rendered images (`public/previews/*.webp`, made by `docs/art/scripts/previews.cjs`); no second WebGL context |
| Lifecycle | Autosave when the page is hidden (app switch, call, tab close); the simulation pauses while hidden; a lost WebGL context shows "Graphics paused" with reload-and-continue (progress saved first) |
| Touch tutorial | Shown once per device on the first game |
| Sharing | Title, description, Open Graph / Twitter card with an in-game image, icons, web manifest (no service worker, so no stale cache) |

## Saves

Each browser keeps its own company in `localStorage` (`ego-hvac-v3:save`, `ego-hvac-v3:autosave`).
Friends who open the link each start their own company; nothing is shared or uploaded. Saves do not
sync between devices or browsers and are lost if the site's data is cleared (or in some private
modes when the tab closes).

## Tests (local, 2026-10-26)

| Gate | Result |
| --- | --- |
| `tsc -b`, ESLint | clean |
| Vitest | 20 / 20 |
| `vite build` | OK |
| Playwright desktop (1920×1080 gameplay + graphics at 1080p, 1366×768, 1024×768) | 4 / 4 |
| Playwright mobile (`e2e/mobile.spec.ts`): iPhone 14 portrait + landscape, Pixel 7 portrait + landscape, iPad portrait | 5 / 5 |

The mobile test plays a whole service job with taps only (pin, accept, dispatch, diagnose, quote,
payment), drags and pinches the camera through real touch events and checks the page did not
scroll or zoom, checks the layout (no horizontal overflow, controls on screen and ≥ 36 px), the
static preview with a single WebGL context, then saves, reloads and continues.

These are **Chromium device emulations** (viewport, DPR, touch, coarse pointer, mobile UA) on a PC
GPU. They do not measure phone performance, iOS Safari's WebKit engine, thermal throttling,
memory limits or the iOS home-indicator/notch behaviour. Physical-device checks still needed:
iPhone Safari (start-up time, frame rate on Balanced, memory with shadows on, safe areas,
Add to Home Screen), a midrange Android phone in Chrome, rotation during play, and backgrounding
during a job.

## Updating the game

1. Work on a branch, run `npm run check` and `npx playwright test`.
2. Push `release/v3-mobile-playtest`: Vercel builds a preview of each push.
3. Production follows the project's Git production branch. Set it to `release/v3-mobile-playtest`
   (Vercel → hvac_company_owner_v3 → Settings → Git → Production Branch) so each push to it goes
   live; until then a production deployment is created explicitly from the tested commit.
4. Roll back from the Vercel dashboard (Deployments → previous production → Instant Rollback).
