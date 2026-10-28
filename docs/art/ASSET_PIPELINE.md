# Blender asset pipeline

Date 2026-10-25. Status: working for headless (command-line) Blender. Blender MCP is not set up;
see [Blender MCP](#blender-mcp) for why and what it would take.

## Environment

| Item | Value |
| --- | --- |
| Blender | 5.2.3 LTS (build 2026-10-22), Python 3.13.13, bundled numpy and glTF exporter |
| Location | `C:\Users\egohv\Tools\blender-5.2.3\Blender Foundation\Blender 5.2\blender.exe` (portable, user folder) |
| Installed how | Official MSI `blender-5.2.3-windows-x64.msi` from the `mirror.clarkson.edu` Blender mirror, SHA-256 `a103d4ec…c8605` matched against the winget manifest, unpacked with `msiexec /a` (administrative extract: no system install, no registry or PATH changes; delete the folder to remove) |
| Renderer for previews | EEVEE, headless |

Why the previous session found Blender "unreachable": it was not installed at all (no executable,
no Store package, no MCP add-on or server entry, no `uv`/Python for an MCP server).

`download.blender.org` answers scripted downloads (curl, winget) with a Cloudflare challenge (HTTP
403); the official mirrors serve the same files. Always verify the hash.

## Commands

From the repository root (Git Bash):

```sh
BLENDER="/c/Users/egohv/Tools/blender-5.2.3/Blender Foundation/Blender 5.2/blender.exe"
# build, validate, export the GLB, and render three EEVEE close-ups
"$BLENDER" -b --factory-startup --python tools/blender/jobsite_kit.py -- public/models/props/jobsite-kit.glb docs/art/previews
```

PowerShell: `& "C:\Users\egohv\Tools\blender-5.2.3\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python tools\blender\jobsite_kit.py -- public\models\props\jobsite-kit.glb docs\art\previews`

Omit the second argument to skip the preview renders (export only, ~3 s).

The other Blender assets build the same way:

```sh
"$BLENDER" -b --factory-startup --python tools/blender/supply_tools.py -- public/models/props/supply-tools.glb
# Environment Revolution yard kit: 12 named parts placed by the property plans (YardProps.tsx)
"$BLENDER" -b --factory-startup --python tools/blender/yard_kit.py -- public/models/props/yard-kit.glb docs/environment-revolution/previews
```

After re-exporting the yard kit, update its `bytes` and `triangles` in
`public/models/manifest.json`: `src/tests/graphicsAssets.test.ts` checks them against the file
and checks that every prop kind is present as a named node.

## What an asset script does

`tools/blender/jobsite_kit.py` is the template for further assets:

1. **Scene**: factory-empty scene, metric units, metres. Blender is Z-up; the exporter writes Y-up.
2. **Materials**: Principled BSDF only (base colour, metallic, roughness, emission, one image
   texture), which maps 1:1 onto three.js `MeshStandardMaterial`. Colours are given as sRGB hex and
   converted to linear. Textures are generated with numpy and packed into the GLB.
3. **Modelling**: bevelled primitives, lathed (revolved) profiles, swept curves for hoses and
   handles, smoothing by angle. Parts of one object are joined, with modifiers applied and the full
   transform baked, so every exported node has identity scale and its origin at the asset's
   ground point.
4. **Validation** (the build fails on any miss): each named node's bounding box against real-world
   size ranges, base resting on the ground (|z| < 5 mm), applied scale, and a triangle budget.
5. **Export**: GLB with applied modifiers, normals, UVs and materials. One primitive per material
   per node, so draw calls = material count.
6. **Preview**: optional EEVEE renders from fixed close-up cameras.

## Game integration

- Files go to `public/models/<category>/<id>.glb` and an entry in `public/models/manifest.json`
  (`source: "blender …"`; `tools/assets/build.mjs` keeps such entries when it regenerates the
  procedural ones).
- Load with drei's `useGLTF`, call `useGLTF.preload(url)` at module load so the scene never
  suspends mid-game, and wrap the user in its own `<Suspense fallback={null}>`.
- Clone per instance (`scene.clone(true)`), set `castShadow`/`receiveShadow`, and drive part
  visibility through node names (`bag`, `manifold`, `cylinder`).

## Demonstration: job-site service kit

Replaces the primitive boxes and stick hoses staged beside the condenser during a service call
(`JobSiteProps` in `src/world/scene/LiveEntities.tsx`). Since the service-call scene work
(`SERVICE_CALL_SCENE.md`) the kit is authored in the **outdoor unit's frame**: origin on the ground at
the unit centre, +Y (glTF −Z) toward the street and the unit's service face, +X away from the house
wall. The game places it on the unit, so the hose couplers land on the unit's service valve ports.

| Node | Size (m) | Triangles | Contents |
| --- | --- | --- | --- |
| `bag` | 0.47 × 0.33 × 0.40 | 2,560 | Soft-sided tool bag (bevel + one subdivision level), ballistic nylon, binding seams, zipper and pull, front pocket, rubber base, EGO teal webbing band that follows the tapered body, piping and webbing handles |
| `manifold` | 1.13 × 0.66 × 1.00 | 7,244 | Upright aluminium manifold hung by its hook on the unit's top edge, knurled blue/red valve knobs, three brass ports pointing down, low/high dials with printed faces (blue/red pressure arcs, ticks, needles) and chrome bezels facing the street; blue hose to the suction service port and red to the liquid port (couplers seated on the port tips), yellow utility hose coiled on the ground |
| `cylinder` | 0.30 × 0.30 × 0.47 | 1,548 | Grey recovery cylinder, yellow shoulder, valve guard collar, two valves with blue/red handwheels; visible on install jobs only |

GLB 349 KB, 11,352 triangles (budget 16,000), 16 draw calls per staged kit (21 on installs).
Evidence:

- Blender close-ups: `docs/art/previews/kit-front.png`, `kit-top.png`, `valves-close.png` (staging on a stand-in unit)
- In game (seed 42, tutorial lead, diagnosis visit): `docs/art/ingame/kit-gameplay.png` (26 m),
  `kit-mid.png` (7 m), and Photo Mode close-ups `kit-close.png`, `kit-close-side.png`,
  `manifold-close.png` (1.5 m) and `kit-with-tech.png`, produced by
  `node docs/art/scripts/kitshots.cjs <profile-build-url> docs/art/ingame`
- Gameplay e2e now waits for `window.__egoRender.kits >= 1` at the diagnosis step.

Validation caught one real defect while building it (manifold 22 mm below ground from an unbaked
origin); the first preview showed two more (bezel cap hiding the dial faces, hoses crossing
through each other); the in-game review found hoses too short for real charging hoses and a
teal band standing 16 mm off the tapered bag. All are fixed in the script.

Known limitation: the bag still reads as a fairly hard-sided box. Real HVAC tool bags are mostly
open-top totes (wide base, tools visible); that redesign belongs with the technician milestone.

Honest scope: this is a small hard-surface prop that proves the pipeline end to end. It does not
yet connect the hoses to the condenser's service valves (condenser milestone).

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `blender` not found | Not on PATH by design; use the full path above |
| HTTP 403 downloading Blender | Cloudflare challenge on download.blender.org; use a mirror and check SHA-256 |
| `[kit] validation failed` | Read the per-node line marked `OUT OF RANGE`; usually an origin not baked or a part placed below z = 0 |
| Texture missing in game | Image must be packed (`img.pack()`) and wired into Base Color; export with `export_image_format="AUTO"` |
| Parts invisible from one side | Single-sided faces with wrong winding; run `bmesh.ops.recalc_face_normals` |
| Scene goes blank when a prop first appears | GLB not preloaded; add `useGLTF.preload` and a local `Suspense` |

## Blender MCP

Not configured. `claude mcp list` shows no Blender server. A typical Blender MCP setup needs `uv`
(not installed), a third-party add-on running inside an interactive Blender session that opens a
local socket, and an MCP server entry. The headless CLI covers modelling, validation, export and
preview rendering reproducibly in scripts that live in the repository, which is what the asset
workflow needs. Adding MCP would mainly add interactive viewport inspection; it involves
installing third-party code, so it waits for your decision.
