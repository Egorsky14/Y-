# Service camera state feedback

UX only: no camera framing, movement, composition, obstruction handling, thresholds or ServiceDirector
selection logic changed.

- **Inspector watch button** (`src/ui/panels/Inspector.tsx`): now directly under the job status (was the
  second-to-last item, below the job log). Off: "Watch technician". On at this job: teal, pressed, with a dot and
  the current shot, "Watching: Property / Work / Detail"; pressing it leaves the service camera quietly (like the
  bar's ✕). Still shown while the service camera is on after the job leaves the on-site phases.
- **"Service camera off. Select Watch technician to return."** (`src/app/store.ts`): an info toast when the
  service camera ends because the player picked another job or property, used another camera command (Overview,
  HQ, follow, a focus such as Center camera on property or a job pin), or panned more than 8 m from the site
  (`CameraRig.tsx`, via `serviceCameraOff`). Not shown for the bar's ✕, the active button, the job ending, a new
  game or a load. Never stacked: no second copy while one is on screen (`withServiceOffNotice`).
- **Toasts at 1100 px and narrower** (`styles.css`) start at 114 px instead of 86 px: the top HUD's stat cards
  wrap to two lines there and every toast overlapped them by 51×17 px at 1024×768 (existing, found by the new
  test). Toasts are not part of the camera's safe area.

Screenshots (`screenshots/`, from `e2e/service-camera-feedback.spec.ts`; the game is paused mid-walk for the
close ones, so they show the controls, not framing quality): `1-inactive`, `2-active-work`, `3-active-detail`,
`4-off-notice`, at 1920×1080, 1366×768, 1024×768, 390×664 portrait and 750×340 landscape.

Browser runs: `browser-matrix.txt`.
