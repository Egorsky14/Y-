# Graphics Revolution: progress record

Branch `feature/v3-graphics-revolution` (local only), started from `67983b4` (`feature/v3-operations-center`).
No push, merge or deploy.

## How to capture and measure

```
VITE_PROFILE=1 npx vite build --outDir <dir>          # profiling build (exposes window.__egoThree)
npx vite preview --outDir <dir> --port 4180
node docs/graphics-revolution/scripts/capture.cjs <label> http://127.0.0.1:4180 docs/graphics-revolution 1920x1080 [--perf]
```

Seed 42, simulation paused, HUD hidden, fixed camera commands and clock. `--perf` records GPU time per
render (timer queries), mean frame time with vsync off, draw calls and triangles per view.

## Baseline (67983b4)

Screenshots: `before/` (1920×1080), `before-1366/`, `before-390/`. Measurements: `baseline-perf.json`.
Intel Arc 140V, Chrome headless (ANGLE D3D11), High preset, vsync off.

| View | GPU ms (median) | Mean frame ms | Draw calls | Triangles |
|---|---|---|---|---|
| Overview 10:00 | 7.89 | 8.59 | 672 | 1,012k |
| HQ 10:00 | 7.87 | 8.69 | 638 | 1,014k |
| HQ parking | 7.25 | 7.97 | 535 | 1,022k |
| Neighborhood | 6.68 | 7.43 | 392 | 990k |
| Street close-up | 7.20 | 7.62 | 394 | 982k |
| Supply Depot | 7.19 | 7.46 | 440 | 972k |
| Service call (wide) | 7.23 | 8.06 | 493 | 1,019k |
| Technician at unit | 6.63 | 7.20 | 477 | 1,016k |
| Overview 17:30 | 7.51 | 8.19 | 675 | 1,014k |
| Overview 21:00 | 7.31 | 7.90 | 675 | 1,014k |

## Audit: ten most damaging visual weaknesses (ranked)

1. Lighting barely changes with time: 17:30 is indistinguishable from 10:00; night is a muddy brown.
2. Faceted low-poly broadleaf trees, shrubs and boulders (flat icosahedra) next to smooth PBR buildings.
3. Mountains: huge smooth domes with pale caps, no atmospheric perspective (very visible on phones).
4. Saturated lime lawns and palm fronds; the palette reads as a toy rather than the Mojave.
5. Supply Depot facade sign truncated ("JAVE HVAC SUPP").
6. Technician: blocky limbs and boxy boots at close range.
7. Service van: correct but plain; matte black paint, livery lacks the full company name.
8. Condenser: small, plain cabinet, little service-side detail.
9. Empty sand yards and identical cream stucco on most houses.
10. Flat white HQ roofs and plain parking surfaces.

## Log

- Baseline captured (16 views at 1080p, 7 at 1366×768 and 390×844), 0 console errors.
- 632ae70 Vehicles (wheels, arches, fascia, livery with legal name), outdoor IBL, golden hour, mountains, smooth foliage, sign fixes.
- 1d35066 Technician body and uniform, desert turf, faceted stone, stronger golden hour, moonlight.
- ebbbe16 Parked civilian cars (instanced), HQ roof membrane.
- 95e805c Service-site camera framing, stucco palette, foliage triangle reduction.
- e754d9e Supply Depot warehouse rebuild.

Mid-sprint paired GPU measurement (alternating base/new builds, same session, 1080p, High):
overview +2.1–2.9%, neighborhood +1.0–1.8%, technician close-up +2.7–3.4%. Unit tests 87 passed.

Next: date-palm fronds, fleet preview check, browser test matrix (one process at a time), final
captures at 1080p / 1366×768 / 390×844, final paired performance, report.
