// Compresses every GLB listed in public/models/manifest.json in place and updates its byte count.
// Run: node tools/assets/compress.mjs (build.mjs runs it after exporting).
//
// - weld: indexes the exporter's unshared vertices (only exact attribute matches merge, so flat
//   shading and UV seams are kept).
// - EXT_meshopt_compression, lossless: float attributes are not quantized, so node transforms, wheel
//   pivots and named prop nodes stay exactly as authored. drei's useGLTF decodes it with the meshopt
//   decoder bundled in three-stdlib (no network fetch).
// Nodes are not pruned: the yard and job-site kits are looked up by empty named nodes.
// Already-compressed files are skipped, so the step is idempotent.
import { readFile, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, reorder, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const manifestPath = 'public/models/manifest.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const a of manifest.assets) {
  const path = `public/${a.file}`;
  const doc = await io.read(path);
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === EXTMeshoptCompression.EXTENSION_NAME)) {
    console.log(`${a.id}: already compressed (${(a.bytes / 1024).toFixed(0)} KB)`);
    continue;
  }
  const before = a.bytes;
  await doc.transform(dedup(), weld(), reorder({ encoder: MeshoptEncoder }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const glb = await io.writeBinary(doc);
  await writeFile(path, glb);
  a.bytes = glb.byteLength;
  a.compression = 'EXT_meshopt_compression (lossless, welded)';
  console.log(`${a.id}: ${(before / 1024).toFixed(0)} KB -> ${(a.bytes / 1024).toFixed(0)} KB`);
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
