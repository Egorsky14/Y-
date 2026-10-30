// Generates every procedural GLB asset and the manifest. Run: node tools/assets/build.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { exportGlb } from './export.mjs';
import { describe } from './lib.mjs';
import { fullSizeVan, compactVan, pickup, boxTruck, sedan, suv } from './vehicles.mjs';

const ASSETS = [
  { id: 'full-size-van', category: 'vehicles', build: fullSizeVan, description: 'Full-size high-roof HVAC service van' },
  { id: 'compact-van', category: 'vehicles', build: compactVan, description: 'Compact service van' },
  { id: 'pickup', category: 'vehicles', build: pickup, description: 'Crew-cab pickup with headache rack and crossbed toolbox' },
  { id: 'box-truck', category: 'vehicles', build: boxTruck, description: 'Installation box truck with liftgate and dual rear wheels' },
  { id: 'civilian-sedan', category: 'vehicles', build: sedan, description: 'Unbranded parked sedan (residents, visitors and staff); instanced and tinted at runtime' },
  { id: 'civilian-suv', category: 'vehicles', build: suv, description: 'Unbranded parked SUV with roof rails; instanced and tinted at runtime' },
];

const manifest = { generatedAt: new Date().toISOString(), generator: 'tools/assets (three.js procedural builders → glTF 2.0 via GLTFExporter)', license: 'Original project assets, MIT with the repository', assets: [] };
for (const a of ASSETS) {
  const obj = a.build();
  const path = `public/models/${a.category}/${a.id}.glb`;
  const bytes = await exportGlb(obj, path);
  const info = describe(obj);
  manifest.assets.push({ id: a.id, category: a.category, file: `models/${a.category}/${a.id}.glb`, bytes, ...info, description: a.description, source: 'procedural (tools/assets)', license: 'project' });
  console.log(`${a.id}: ${info.meshes} meshes, ${info.triangles} tris, ${(bytes / 1024).toFixed(0)} KB`);
}
// Keep entries authored outside this generator (Blender assets, see docs/art/ASSET_PIPELINE.md).
const previous = JSON.parse(await readFile('public/models/manifest.json', 'utf8').catch(() => '{"assets":[]}'));
manifest.assets.push(...previous.assets.filter((a) => !a.source.startsWith('procedural')));
await writeFile('public/models/manifest.json', JSON.stringify(manifest, null, 2));

// Weld and meshopt-compress every listed GLB (vehicles above and the Blender props).
await import('./compress.mjs');
