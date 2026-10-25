// Node-side glTF 2.0 export helper for the procedural asset generators.
// Polyfills the browser APIs GLTFExporter expects, then writes .glb files.
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onloadend?.({ target: this });
        this.onload?.({ target: this });
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
        this.onloadend?.({ target: this });
        this.onload?.({ target: this });
      });
    }
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElementNS: () => ({ getContext: () => null, toDataURL: () => '' }), createElement: () => ({ getContext: () => null, toDataURL: () => '' }) };
}

export async function exportGlb(object3d, outPath) {
  const exporter = new GLTFExporter();
  const result = await new Promise((resolve, reject) => exporter.parse(object3d, resolve, reject, { binary: true, onlyVisible: true }));
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, Buffer.from(result));
  return result.byteLength;
}
