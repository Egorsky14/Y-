# Technician asset pipeline

One command rebuilds everything reproducibly, in about 25 seconds (one Blender at a time):

```
node tools/character/build.mjs
```

| Step | Output |
|---|---|
| `tools/blender/technician_v3.py` in headless Blender 5.2 | `tools/character/out/` (not committed): GLB, three PNG atlases, `rig.json`, `build.log` |
| GLB registered and compressed (`tools/assets/register-blender.mjs`) | `public/models/characters/technician-v3.glb`, `public/models/manifest.json` |
| Atlases encoded by Chrome | `public/models/characters/tex/technician-{albedo,orm}-{2048,1024}.webp`, `technician-normal-{1024,512}.webp` |
| Rig table | `src/world/characters/rigData.generated.ts` |

Sources:

- `tools/character/makehuman/`: CC0 MakeHuman data. `SOURCE.txt` has the pinned commit and SHA-256 of every file, and
  `MAKEHUMAN_LICENSE.md` the license. To fetch again or add targets: `node tools/character/fetch-makehuman.mjs [paths]`.
- `tools/character/wordmark.mjs` → `wordmark.png`: the EGO HVAC mark, drawn with the game's own canvas code.
- `tools/blender/technician_v3.py`, `sdf_kit.py`: editable, plain Python.

`--hero --preview <dir>` after the script's output folder builds only one body and head and renders A-pose previews.

## What the character is

| Level | Camera distance (high quality; scaled by the quality setting) | Triangles worn | Pose updates |
|---|---|---|---|
| 0 near | under 13 m | about 13,000 to 17,000 | every frame, with fingers |
| 1 normal gameplay | 13 to 40 m | about 4,500 to 6,000 | every frame, fingers frozen |
| 2 distant crowd | over 40 m, or off screen for the pose | about 1,000 | every fourth frame |

Parts: three builds (`slim`, `avg`, `heavy`); six heads that are different people by shape and ancestry targets, not
paint (`oval`, `square`, `round`, `long`, `broad`, `weathered`); hair styles; beards; cap; boots; collar; belt with buckle
and pouch; cargo pockets.

Atlas layout: the MakeHuman UV layout squeezed under v = 0.82, painted as the dressed person. The strip above holds boots,
cap, hair, eyes, collar, belt, metal, pouch and pocket.

| Map | Channels |
|---|---|
| albedo | Colour. Skin is a ratio against the employee's tone; cloth is near-neutral and takes the role's colour |
| normal | Folds, seams, weave, pores |
| ORM | R occlusion. G code: under 0.3 tinted by the vertex colour, around 0.5 absolute colour, near 1 metal. B roughness |

## Rig

43 bones, with the old names kept: `pelvis`, `spine`, `torso`, `neck`, `head`, `clav*`, `arm*`, `fore*`, `twist*`, `hand*`,
`leg*`, `shin*`, `foot*`, `toe*`, and `thumb|index|middle|ring|pinky` `1|2` per side.

- **Bind pose:** MakeHuman's A-pose, from each bone's `bind` quaternion.
- **Canonical pose:** every rotation zero, limbs straight down, axes aligned with the world: the frame clips and IK use.
- **Sides:** game L is at -x, which is MakeHuman's `.R`.

## Rollback

`technician.glb` and `technician.py` are untouched. Reverting this branch's commits restores the previous character.
