# Camera zoom repair

Sheets: `sheets/08-zoom-the-bug.png`, `09-zoom-desktop.png`, `10-zoom-phone.png`. All are real renders.

## Root causes, as measured

An overlay was not one of them: on the unfixed build every wheel event reached the canvas. There were three separate faults.

| # | Fault | Evidence (unfixed `f6d635d`) |
|---|---|---|
| 1 | **The zoom pivoted on a point on the ground.** `CameraRig` forced the orbit target to height 0, so zooming headed for a ground point behind the subject | Rooftop, Detail, zooming in: distance to the technician went **from 2.2 m to 14.3 m**, camera height from 5.6 m to 1.0 m with the deck at 4.06 m. It flew down through the roof, and zooming out did not recover |
| 2 | **The director had no notion of a player zoom.** Any zoom froze it for 8 s, during which nothing followed him, and its next shot replaced the player's distance | Rooftop, carrying: 1.9 m, then 6.0 m, then 8.0 m as he walked away, then 6.2 m from a new shot |
| 3 | **The touch controls were torn down about ten times a second.** drei's `MapControls` reconnects when `onStart` or `onEnd` change, and `CameraRig` passed new inline functions on every render. Each reconnect dropped the move and release listeners but kept the controls' list of pointers down | A held pinch stopped responding, and a finger never released stayed on the list, so every later gesture was ignored. Listener logging showed the rebuilds during a gesture. Mouse drags were exposed the same way |

Two more things limited close-ups: the near clipping plane was 1 m out, and the wheel applied one full step per event, so trackpads would race.

`mobile.spec` missed fault 3 because it only pinches once, and the first gesture could register before a rebuild.

## The solution

- **One persistent zoom** (`src/world/scene/serviceZoom.ts`): how much closer or farther than the director's shot the player wants. Wheel, trackpad, pinch and buttons all feed it. Every director shot carries it, so reframes for a new stage, phase or layout keep it.
- **Zoom about the technician**: camera and aim point scale together about his body, so he keeps his place on screen on the ground, on a ladder or on a roof, and zooming out exactly undoes zooming in.
- **The director keeps directing.** A zoom no longer makes it hold off. When zoomed in tight, the view slides with him continuously, since stepped follow moves would lose him; if he is off screen, the director brings him back at the player's distance.
- **When the zoom resets:** on picking a different mode, pressing Reset, or leaving the service camera. Not on job stages, and not when Mission 01's coach changes the shot.
- **Scene-aware limits**, measured from the technician: 1 m at the work spot, 1.5 m on the move, 2.2 m on the ladder (the rails stay in shot), 90 m out (160 m in Property). The camera also keeps clear of his body, the serviced cabinet, and the ground or deck.
- **Near plane** comes in only for close views (under 3.2 m), so the city keeps its depth precision.
- **Own wheel handling** in the world only: it goes by how far they scrolled and eases in. Panels scroll themselves, and Photo Mode keeps its own controls.
- **Stable control callbacks**, which fixes fault 3.
- **Buttons** (+, −, back to default) on the left edge during the service camera.

## Files

| File | Change |
|---|---|
| `src/world/scene/serviceZoom.ts` | New: zoom state, limits, scaling |
| `src/world/scene/CameraRig.tsx` | Wheel handling, zoom about him, follow, near plane, stable callbacks, raised aim point |
| `src/world/scene/ServiceDirector.tsx` | Shots carry the zoom; zoom no longer holds it off; brings him back if lost |
| `src/world/scene/rooftopCamera.ts` | Rooftop shots declare the serviced cabinet, so zoom stops short of it |
| `src/ui/hud/ServiceCameraBar.tsx`, `src/ui/styles.css` | Zoom buttons; a different mode resets the zoom |
| `playwright.config.ts` | The new spec on phones |
| `e2e/camera-zoom.spec.ts`, `src/tests/serviceZoom.test.ts` | New tests |

## Tests

`e2e/camera-zoom.spec.ts`, real input. Each measures camera distance, the technician's projected size on screen and, for the shots, that the rendered picture changed.

| Test | Passed on |
|---|---|
| Residential: walking; Property, Watch Work, Detail; held 10 s; in and out; phase change; closest; Reset | Desktop |
| Rooftop: carrying, climbing, roof; Detail, Watch Work, Property; 1×, 2×, 5×; descending | Desktop |
| Free play: city, repeated drags with the game running, panels, followed truck, Photo Mode | Desktop |
| Touch: three pinches in a row on the city; rooftop in all three modes; held 9 s; buttons; Reset; no page scroll | iPhone portrait, iPhone landscape |

Regression, one at a time, all passing with this code: Mission 01 at 1× and 5× (desktop); `rooftop-service` at both sites; `rooftop-persistence`; `gameplay`; `graphics`; `service-camera` (desktop, laptop, iPhone portrait and landscape); `service-camera-feedback`; `rooftop-camera` (desktop, 390×844); `mobile` (iPhone, Android portrait). Results: `evidence/regress/runs.txt`, `evidence/zoom/runs.txt`.

While building these, some tests failed because of the tests themselves: a wrong mode order, an unstable mid-move baseline, a pinch so large it hit the limit, a finger landing on a card. One failure was a real flaw in my design: zoomed in with him off screen, nothing brought him back. That is fixed, and the spec covers it.

## Limitations

- **No real phone or trackpad has been used.** Pinch is real touch input through Chromium's emulation. Trackpad handling has only a unit test of its scaling.
- **Face:** the director's work shots often sit behind him as he faces the unit. Zooming shows hands, tools and uniform at once; seeing his face also takes an orbit (right-drag, or two fingers) or Photo Mode.
- **Not exercised directly:** Mission 01 on phones after this fix; zooming during the van's arrival while he is still inside (the zoom falls back to the aim point there); zooming during the ladder at 5×, where the game holds the site view.
- **Very close in Property mode** works but is a tighter view than that mode's composition intends.
- Zooming out against a wall stops at the wall, by design, so in narrow side yards the range is shorter.
