HVAC V3 GRAPHICS REVOLUTION: COMPLETE

# Graphics Revolution: final validation and release handoff

Branch `feature/v3-graphics-revolution` (local only), from `67983b4`. Last code commit `ec25623`;
the validation evidence and these documents are committed on top of it. Nothing has been pushed,
merged or deployed. Production (`ccr-9ef3ffbb-g9q8fs`) and the other preview branches are untouched.

Design write-up: `docs/design/GRAPHICS_REVOLUTION.md`. Progress and checkpoint: `PROGRESS.md`.

## 1. The interrupted gameplay run

- **Earlier run (08e12d9):** the log stops after "Running 1 test using 1 worker". There is no
  assertion, timeout or crash text, and the runner never wrote its summary line. The system's
  low-memory guard killed the whole background runner. It was an environment kill, not a test
  result.
- **Rerun on the latest graphics code (08e12d9), one process at a time:** gameplay **failed for
  real** at `e2e/gameplay.spec.ts:233`. After "Show on map" for the second job,
  `job-pin-job-19` stayed hidden (`expect(locator).toBeVisible()`, 20 s).
- **Cause (confirmed):** the Graphics Revolution's closer service-site camera (distance 34, aimed
  0.6 m above ground) pushed the job pin past the label projector's ±1.2 NDC cull. The pin sits
  12.5 m above the lot centre. Measured positions: NDC y 1.17 on desktop and x 1.24 on a 390×844
  phone. Players lost the pin they had just asked to see. This was a genuine regression.
- **Fix (`ec25623`):**
  - The camera aims 3 m up, with the target pulled a fifth of the way toward the lot centre.
  - Distance is 38 and the azimuth offset is 0.35.
  - The van, technician and unit still fill the frame.
  - New unit test `src/tests/serviceSiteCamera.test.ts`: for every house lot, at 1920×1080 and
    390×844, the pin stays within 0.95 NDC and the van spot and condenser within 0.9. It failed
    before the fix and passes after.
- **Result:** gameplay passes on `ec25623`, in 85 s.

## 2. Browser matrix (all 21 cases on `ec25623`)

- **Conditions:** one Playwright process and one worker at a time. Memory was sampled every 3 s.
  Each case has its own log and exit code.
- **Build:** `dist/` was built from `ec25623`, so it includes vehicle wear, the mountain fixes
  and the camera fix.
- **Result:** **21 passed, 0 failed, 0 skipped.** Every case exited 0 and left no browser
  processes behind.
- **Memory:** lowest free RAM 936 MB and lowest free commit 2,446 MB, both during gameplay. The
  memory guard was never reached.
- **Interruption:** the session ended during `phone-390x844|banking-layout`. That case had no
  result, so it was rerun from scratch on the same commit and build, and it passed. Its partial
  log is kept as `*.interrupted.log`.
- **Per-case record:** `docs/graphics-revolution/browser-matrix-ec25623.txt`.

| Project | Specs (all passed) |
|---|---|
| desktop-1080p | gameplay, graphics, automation, banking, banking-layout, supply |
| laptop-768p | graphics |
| small-1024 | graphics, banking-layout, supply, automation |
| iphone-portrait | mobile, banking-layout |
| phone-390x844 | banking-layout, supply, automation |
| iphone-landscape | mobile, supply |
| android-portrait / android-landscape / tablet-portrait | mobile |

**Other checks at the final commit:**
- TypeScript and production build (`tsc -b && vite build`) pass.
- ESLint (`src`, `e2e`) passes.
- Vitest: **94 passed**, 3 skipped. The skipped ones are the opt-in banking and equipment
  scenario suites; no simulation code changed.
- Asset integrity is covered by `graphicsAssets.test.ts`: every manifest GLB is valid glTF 2.0,
  its byte count matches and it is within budget.

The e2e specs rewrite the tracked `docs/screenshots/*.png`. Those were restored after every run, so
no unrelated screenshot files changed.

## 3. Screenshot validation

- **Coverage:** all 13 comparison sheets were reviewed, in `docs/graphics-revolution/compare/`,
  built from `before*/` and `after*/` at 1920×1080, 1366×768 and 390×844.
- **Technician pairing (fixed):** the baseline service-call views 08–11 were recaptured from the
  `67983b4` build. They now use the same wait as the after set: the technician must be visible
  and have stopped at the unit.
  - Before and after now show the same work phase (kneeling at the service panel) from the same
    camera, with identical house, van and technician positions.
  - `compare/02`, `03` and `04` were regenerated.
  - `before/metrics.json` was merged: only the 08–11 entries and the service geometry changed,
    and there were 0 console errors.
- **Defect check:** no clipping, floating props, broken materials or distorted branding were
  found.
  - The livery shows the legal name, unbent.
  - The Supply Depot sign is whole.
  - Wheels sit in their arches.
  - On a 390×844 phone the mountains read as rock, not snow, and the HUD is unaffected.
- **Mobile note:** one foreground house on the phone sheet has a dormer face in stucco tint (it
  was white before). This is existing geometry taking the new wall colour, not a defect.

## 4. Performance (unchanged)

The camera fix changes only where "Show on map" flies to, not what is rendered, so the paired
measurements stand. Source: `final-perf.json`; Intel Arc 140V, 1080p, High, alternating builds.

| View | GPU ms before → after | Change |
|---|---|---|
| City overview | 6.05 → 6.34 | +4.7% |
| HQ | 5.95 → 6.24 | +4.9% |
| Neighborhood | 4.91 → 4.98 | +1.5% |
| Service call | 5.45 → 5.64 | +3.5% |
| Technician at unit | 4.73 → 4.87 | +3.0% |
| Night overview | 5.68 → 5.90 | +3.9% |

All views are within the 10% budget. The graphics spec on `ec25623` reported 721 draw calls and
1.20M triangles at 1080p, the same as before the fix.

## 5. Known remaining issues (visual polish, none blocking)

- Night still reads warm-brown on open sand.
- Backyards are large plain gravel areas.
- The condenser model itself is unchanged.
- Each fleet vehicle GLB is about 1.4 MB, up from about 0.8 MB. Compression is the next step.
- There is no new vehicle or technician animation work.

## 6. Preview readiness

**Ready for a separate Vercel Preview.** All 21 browser cases, unit tests, typecheck, lint and the
production build pass on the latest code. The one regression found was fixed and is covered by a
test. Deploying it is left for your authorization.
