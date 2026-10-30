# Open defects after Graphics Revolution 2

## P1: tutorial diagnosis close-up is blocked by the house (next local fix)

**Status:** open. It predates Graphics Revolution 2 and is identical in the `adf3224` baseline
captures. Fix it next, locally, before any new feature work.

**Symptom:** on the tutorial service call, a close camera on the kneeling technician from the
street-side quarter shows the porch wall, porch post and roof instead of the technician at the
condenser.

- Desktop `after/W08-diagnosis.jpg`: the side wall fills the right half of the frame and only
  the tool case and a boot are visible.
- Phone `after-390/W12c-mobile-diagnosis.jpg`: the porch post and overhang fill most of the
  frame.
- World Immersion 3.0 and 3.1 recorded the phone case as "phone diagnosis camera occlusion".

**Reproduce:**

1. New game, seed 42.
2. Accept the tutorial lead (job on lot `c-n-4`) and dispatch the owner with Unit 1.
3. Wait until the technician kneels at the unit (status `diagnosing`, technician at about
   x −11.96, z 20.98).
4. Focus on the technician:
   `{ type: 'focus', target: tech, distance: 6.5 (8 on phones), azimuth: az + 0.75, elevation: 0.38, targetY: 0.7 }`,
   where `az = atan2(van.x − house.x, van.z − house.z)`.

`docs/graphics-revolution-2/scripts/capture.cjs` does exactly this.

**What is not affected:**

- The wide in-game service-site framing (`serviceSiteCamera`, used by "Show on map" and job
  notifications; see `compare/S1-shadows-service-site`).
- The profile views from the yard side (`W08d`/`W08e`, `W09c`–`W09e`) and the opposite-side views
  (`W08c`, `W09b`).

**Cause:** the camera has no occlusion handling. Neither the focus flight in `CameraRig` nor
MapControls checks whether geometry lies between camera and target. The unit sits against the
condenser-side wall, close to the porch, so the street-side quarter at 6.5–8 m puts the house
between the camera and the technician. A player who zooms in from that side sees the same thing.

**Suggested fix:**

- Pick the close-up azimuth from the open side of the unit: the yard and service side,
  `condenserSideDir` and `workPosition` in `cityLayout`.
- Add a cheap occlusion guard on focus flights and zoom. Raycast from target to camera against
  the house meshes and pull the camera in, or swing it toward the clear side, when blocked.
- Add a regression test that projects the technician's head and hands for the tutorial lot, plus
  one lot per house style, and asserts that nothing on the house lies between them and the camera.
- Verify on desktop and on a 390×844 phone.
