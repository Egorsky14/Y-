// Registers (or refreshes) a Blender-exported GLB in public/models/manifest.json with its measured mesh and
// triangle counts, then runs the meshopt compression step. Run after re-exporting a Blender asset:
//   node tools/assets/register-blender.mjs <id> <category> <script> "<description>"
// e.g. node tools/assets/register-blender.mjs technician characters tools/blender/technician.py "EGO HVAC technician ..."
import { readFile, writeFile, stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';

const [id, category, script, description] = process.argv.slice(2);
if (!id || !category || !script) throw new Error('usage: register-blender.mjs <id> <category> <script> "<description>"');
const file = `models/${category}/${id}.glb`;
const doc = await new NodeIO().read(`public/${file}`);
let triangles = 0;
let meshes = 0;
for (const m of doc.getRoot().listMeshes()) {
  meshes++;
  for (const p of m.listPrimitives()) triangles += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
}
const manifest = JSON.parse(await readFile('public/models/manifest.json', 'utf8'));
const old = manifest.assets.find((a) => a.id === id);
manifest.assets = manifest.assets.filter((a) => a.id !== id);
manifest.assets.push({ id, category, file, bytes: (await stat(`public/${file}`)).size, meshes, triangles, description: description ?? old?.description ?? id, source: `blender 5.2.3 (${script})`, license: 'project' });
await writeFile('public/models/manifest.json', JSON.stringify(manifest, null, 2));
console.log(`${id}: ${meshes} meshes, ${triangles} triangles`);
await import('./compress.mjs');
