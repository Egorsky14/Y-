# Asset licenses

Every visual asset in this repository is generated at runtime by original code in `src/world`:

| Asset | Source | License |
| --- | --- | --- |
| Houses, headquarters, warehouse, competitor building, park | Procedural Three.js geometry (`src/world/buildings/*`) | Project code (original) |
| Vehicles (compact van, full-size van, pickup, box truck) | Procedural geometry (`src/world/vehicles/ServiceVehicle.tsx`) | Project code (original) |
| Characters | Procedural geometry and animation (`src/world/characters/Worker.tsx`) | Project code (original) |
| Textures (sand, gravel, asphalt, road markings, concrete, stucco, windows) | Generated on a 2D canvas (`src/world/assets/textures.ts`) | Project code (original) |
| EGO HVAC wordmark and signs | Drawn on a 2D canvas at runtime | Project code (original) |
| Sky | `@react-three/drei` `Sky` component (shader) | MIT (drei) |
| Icons | Inline SVG paths in `src/ui/components/common.tsx` | Project code (original) |
| Font | Inter via Google Fonts (optional network load; falls back to system UI fonts offline) | SIL Open Font License 1.1 |

No third-party GLB/glTF models, textures, audio files or trade dress are used. `public/models`,
`public/textures` and `public/audio` are reserved for future licensed assets; any addition
must be recorded here with its source and license.

Runtime dependencies (three, @react-three/fiber, @react-three/drei, react, zustand, vite) are
MIT licensed. The competitor company names (Desert Chill Air, Sunbelt Comfort Pros, Red Rock
Mechanical) and the home-warranty company names are fictional.
