# Environment Revolution 2.0: the living Las Vegas neighbourhood

Branch `feature/v3-environment-revolution` (local), from `942846a` (Graphics Revolution). Visual work
only:
- no simulation, economy, save, automation or banking code changed;
- no change to the road graph, lot ids, addresses, house footprints or job locations.

Evidence, scripts and the progress log are in `docs/environment-revolution/`.

## The problem

Every house sat on one flat tan plane with the same patio set, umbrella and grill. The front
yards held evenly spaced accents, and a 14 m strip of blank sand ran between the back walls of
facing rows. The houses were fine; the land around them read as unfinished.

## Architecture: plan, then render

```
cityLayout (lots, unchanged)
   └─ propertyPlan.ts  (pure, deterministic, tested)
        ├─ archetype per lot          (street-row character × house style, no identical neighbours)
        ├─ exclusions                 (house, driveway, walk, condenser service side, technician approach, gate path)
        ├─ ground zones               (front room, back room, side band, beds, islands, turf)
        ├─ hardscape / structures     (patio, deck, pads, pool, pergola, patio cover, kitchen, utility)
        ├─ props                      (yard kit placements, collision-checked)
        └─ plants                     (clusters and bed fills, spacing and obstacle rules)
   ├─ PropertyBuilder.ts  → merged neighbourhood mesh (one draw per material)
   ├─ YardProps.tsx       → Blender yard kit, baked into two static vertex-coloured meshes
   └─ Vegetation.tsx      → instanced species (quadrant-culled, tree and palm LOD)
greenbelt.ts (pure) → common-area greenbelts between rows (same renderers)
hqLandscape.ts (pure) + HeadquartersBuilder site detail
```

### Rules the plan enforces

- **No randomness at render time.** The renderers make no random choices, and the plan's RNG is
  seeded from a mixed hash of the lot id. Plans are cached per lot and identical across reloads.
- **Placement constraints.** Every prop has a footprint and is collision-checked against:
  - the house, driveway, walk, lot bounds and other props;
  - plants already placed.

  Every plant is checked against the same obstacles, its spacing to other plants, and (for tree
  canopies) the roof.
- **HVAC access.** The condenser's service side and the straight walk from the van at the curb to
  the unit are exclusion zones: no plant or prop may sit there. A stepping-stone service path is
  laid along the approach so the route reads as clear.

## The eight archetypes

| Archetype | Ground | Patio and living | Planting | Typical extras |
|---|---|---|---|---|
| Classic xeriscape | Light rock front, DG back | Concrete patio, dining set, grill, sometimes a pergola | Brown or red rock beds, agave, sage, groundcover, specimen tree | Bench, stepping pads, shed |
| Modern minimal | Gray rock | Paver patio, dark steel pergola, sectional | Steel-edged strips in a rhythm, cypress, palo verde side bed | Stepping pads to a fire-pit lounge, smooth stucco walls |
| Family | DG | Covered patio, dining set, grill | Mulch beds, flowering shrubs, shade tree | Turf lawn front and back, swing set, basketball hoop, shutters |
| Upscale | Light rock | Travertine patio and deck, covered patio, sectional and dining | Layered beds, date palms | Pool with coping, sun shelf and loungers; stucco walls; stone pilasters |
| Older | Soil, dry turf | Old concrete slab, bistro set | Mulch, mature olive or mesquite | Clothesline, shed, bench, shutters |
| Rental | Gray rock front, light rock back | Small slab, bistro set | Few hardy shrubs, one shade tree | Stepping pads, shed |
| Entertainer | Light rock | Large paver patio with pergola, built-in grill island | Rock beds | Sectional, dining set, fire pit, occasional pool |
| Desert garden | DG | Flagstone patio, bistro set | Curved beds dense with agave, yucca, barrel cactus, grasses, palo verde | Flagstone stepping path, fire pit |

How archetypes are assigned:
- Each street row has a character: older rows to the north, newer Summerlin-style rows on the east
  side and the south outer row.
- Each house style has compatible archetypes. For example, premium homes are only upscale or
  entertainer, and modern homes are modern-minimal, desert-garden or entertainer.
- A lot never repeats its left neighbour's archetype.
- Pools appear only on upscale lots and an occasional entertainer in the newer rows: 6 of 32.

## Assets and materials

- **Blender yard kit** (`tools/blender/yard_kit.py` → `public/models/props/yard-kit.glb`): 12 parts,
  5,642 triangles, 320 KB.
  - Parts: dining set, bistro set, lounge chair, grill, sectional, fire pit with Adirondack chairs,
    market umbrella, resin shed, planter pot, swing set, curbside carts, bench.
  - The script validates every part's size, grounding, applied transforms, triangle budget and
    normals before exporting, and renders a preview (`docs/environment-revolution/previews/`).
- **Procedural textures** (`pbr.ts`):
  - Aggregates: decomposed granite, light, gray, brown and red decorative rock, mulch and soil.
    Wrapped chips with lighting and macro mottling avoid a wallpaper look.
  - Paving: running-bond pavers, travertine French pattern, flagstone.
- **Vegetation:** five new species (palo verde, Italian cypress, yucca, desert grass, groundcover),
  plus a far LOD for mesquite, olive and palo verde.
- **Merged geometry** (`PropertyBuilder.ts`):
  - Pools: recessed water, coping, sun shelf and steps, with the deck built around the water.
  - Shade and outdoor living: pergolas and patio covers, a grill island.
  - Utility details: hose reels, meters, raised beds, clotheslines.
  - Edging: steel, concrete mow curb and stone.
  - Driveway joints and paver borders.

## Headquarters

**Service-building roof:**
- tilted solar array;
- makeup-air unit with its duct;
- yellow gas run on supports and conduit;
- walk pads to the hatch.

**Yard and grounds:**
- **Office roof:** walk pads.
- **Service yard:** a concrete pad, pallet racking along the south wall, and condenser stock that
  grows by one row per HQ upgrade (visual only).
- **Landscaping:** rock-filled parking islands with an understorey, and desert trees along the
  east strip.
- A test keeps all HQ planting out of the eight possible fleet stalls and the stall-to-apron route
  corridor.

## Performance work (measured, not assumed)

The first build cost +21–33% GPU time. To find where it went, I hid groups of objects one at a
time and measured the change.

**Where the cost was:**
- Vegetation, in both the main and shadow passes.
- Stacked full-lot ground layers.
- Unculled instanced plants.

**What fixed it:**
- Base ground only in the side band.
- Beds drawn before the zones underneath, so covered zone pixels are rejected early.
- Quadrant chunks with frustum culling for numerous species.
- Single-sided closed plants.
- No shadows from small plants, shrubs, boulders or yucca.
- Cheaper small-plant meshes.
- About 45% fewer bed-fill plants than the first draft.
- Tree LOD.
- Yard props baked into two static meshes.

**Final paired result** (two alternating rounds, 1080p High, Intel Arc 140V):

| View | GPU ms before → after | Change | Draw calls |
|---|---|---|---|
| Six-house neighbourhood | 4.84 → 5.21 | +7.6% | 436 → 495 |
| Backyard close-up | 4.46 → 4.17 | −6.5% | 417 → 471 |
| Headquarters | 6.15 → 6.49 | +5.5% | 712 → 779 |
| Street | 5.93 → 6.28 | +5.9% | 432 → 486 |
| Night | 4.48 → 4.80 | +7.1% | 436 → 493 |

Triangles rose about 36% (1.10M → 1.50M, all passes). That is above the 20% preference, but the
measured GPU time stays within the 10% budget in every view. Data: `final-perf.json`.

## Tests

| File | What it checks |
|---|---|
| `src/tests/propertyPlan.test.ts` | Determinism; all eight archetypes; no identical neighbours; style compatibility; pool minority on deep lots only; composition on every lot; no patio, deck or pool on the house; props off the house, driveway, walk, service zone and approach, inside the walls and apart; plants out of the same zones and off the roof; nothing on the condenser; finite values; variation |
| `src/tests/environment.test.ts` | Greenbelts off every lot, street and sidewalk; their contents inside the strips; determinism; HQ planting out of stalls and route corridors |
| `src/tests/graphicsAssets.test.ts` | Yard kit in the manifest, a valid GLB, within budget, with every placed prop kind present as a named node |

The job-pin camera test (`serviceSiteCamera.test.ts`) and the full browser matrix guard the
gameplay interactions.

## Known limitations

- Rental backyards are deliberately sparse. From some angles the rear bed hides behind the wall and
  the yard reads plainer than the others.
- House architecture changed less than the land:
  - per-archetype palettes, shutters, stone pilasters and stucco walls were added;
  - roof forms and floor plans are unchanged.
- Street furniture is unchanged beyond the planted corner beds and service paths: no new
  mailboxes, signs or utility boxes on the streets.
- Entry pots are often rejected by the collision rules (2 of 32 lots show them).
- Night still reads dark-warm over the open desert outside the town; the yards themselves read
  well under the landscape lights.

## Next steps

1. House massing variants per style: garage placement, porch types, roof forms.
2. Street infrastructure pass: signs, utility pedestals, drainage, bins on collection day.
3. Backyard variety within each archetype (alternative layouts), and pots that fit the entry.
4. Instanced far-LOD for small plants, or impostors, to buy back triangles for denser planting.
