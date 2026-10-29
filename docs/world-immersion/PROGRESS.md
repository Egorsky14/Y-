# World Continuity & Immersion 3.0: progress record

Branch `feature/v3-world-immersion` (local only), from `ef407c7` (the verified Environment Revolution
preview). No push, merge or deploy. No simulation, economy, save, road-graph, lot, address or
job-location changes.

## How to capture and measure

```
VITE_PROFILE=1 npx vite build --outDir <dir>
npx vite preview --outDir <dir> --host 127.0.0.1 --port 4181
node docs/world-immersion/scripts/capture.cjs <label> http://127.0.0.1:4181 docs/world-immersion [WxH] [--perf] [--only=W01,...]
```

Seed 42, simulation paused for every still, HUD hidden, fixed camera commands and clock (10:00, 17:30,
21:00); the service call is the tutorial lead dispatched with the owner and Unit 1. GPU time from
`EXT_disjoint_timer_query_webgl2` with vsync off; only alternating paired runs of the baseline (port
4180) and new build (4181) in the same session are compared.

## Baseline (ef407c7), commit 403236b

`before/` (1920×1080) and `before-390/` (390×844), 0 console errors. The four problems, as rendered:
the district is a rectangle on an endless tiled sand plane; all 12 street ends stop in open sand;
mountains sit close and read as flat walls; the technician kneels rigidly with his back to the
camera; HQ is dominated by asphalt; nothing moves.

## Phase 2: world continuity

- `src/world/city/hinterlandLayout.ts` (pure, deterministic, visual only): scenic roads (the six
  playable streets continued both ways as collectors, eight section-line arterials each way, two
  landscaped parkways), superblocks between them (walled tract subdivisions with lot pads, garages,
  driveways, pools and trees; modern infill; estate rows; corner retail centres; tilt-up business
  parks; a golf course; schools; undeveloped desert), three natural washes, density falling off with
  distance and toward the western foothills, and a first ring around the district of natural desert,
  estate homes and a school instead of a wall of tract houses.
- `src/world/city/Hinterland.tsx`: scenic roads in the playable streets' materials within 520 m,
  plain shading beyond; districts as instanced meshes per ~1 km chunk (buildings with a window shader
  that lights at night, roofs, three ground layers, crowns, trunks, scrub); night street lights as
  points. No shadows, no picking.
- `Ground.tsx`: a painted macro map (terrain tone, washes, disturbed ground under districts, road
  shoulders) multiplies the sand; two texture samples at unrelated scales and rotations remove the
  tile repeat; detail fades to the mean with distance. Floor drawn after the other opaque geometry
  (depth-rejected under roads and lots). Mountains moved to 1.4–2.3 km, higher and closer in the west
  (Spring Mountains), with partial aerial perspective; all inside the 3 km far plane from any
  camera position (the sky dome does not write depth).
- Fog range 300–2900 m (clear).
- Gate views reviewed: W01 from three azimuths, W02, W03, W13 (new horizon view), W10 golden, W11
  night. The district now sits inside a valley of neighbourhoods; every street end continues.
- Paired GPU after optimisation, W02 boundary: 4.48 ms vs 4.42 ms baseline. Attribution showed the
  floor's overdraw dominated; drawing it last pays for the new world.
- Tests: `src/tests/hinterland.test.ts` (routing graph and playable streets unchanged, every street
  end continued, no scenery on lots, streets or scenic roads, determinism, flat valley floor,
  open-desert query). vitest 115 passed, 3 opt-in skipped; tsc and lint clean.
