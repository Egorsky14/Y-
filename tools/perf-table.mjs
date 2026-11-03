#!/usr/bin/env node
/**
 * Prints character-perf results side by side.
 *   node tools/perf-table.mjs <dir> <before label> <after label>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, a, b] = process.argv.slice(2);
const load = (l) => JSON.parse(readFileSync(join(dir, `${l}.json`), 'utf8'));
const A = load(a);
const B = load(b);
const f = (v, d = 1) => (v === null || v === undefined ? '-' : Number(v).toFixed(d));
console.log(`${a} vs ${b} | ${A.gpu} | viewport ${A.viewport.width}x${A.viewport.height}, cpu x${A.cpuThrottle}, quality ${A.opening.quality} / ${B.opening.quality}`);
console.log(`load: new game to scene ${A.load.newGameToSceneMs} -> ${B.load.newGameToSceneMs} ms; character files ${A.assets.reduce((s, x) => s + x.kb, 0)} -> ${B.assets.reduce((s, x) => s + x.kb, 0)} KB`);
const rows = [
  ['fps', 'fps', 0],
  ['p50 ms', 'p50Ms', 1],
  ['p95 ms', 'p95Ms', 1],
  ['p99 ms', 'p99Ms', 1],
  ['worst ms', 'worstMs', 1],
  ['frames over 33 ms', 'over33ms', 0],
  ['main thread ms/frame', 'mainThreadMsPerFrame', 2],
  ['script ms/frame', 'scriptMsPerFrame', 2],
  ['character CPU ms/frame', 'characterCpuMsPerFrame', 3],
  ['draw calls', 'calls', 0],
  ['triangles', 'triangles', 0],
  ['geometries', 'geometries', 0],
  ['textures', 'textures', 0],
  ['JS heap MB', 'jsHeapMB', 0],
];
for (const scene of ['opening', 'tenTechs', 'rooftops']) {
  console.log(`\n${scene} (stages at end: ${scene === 'rooftops' ? `${JSON.stringify(A.rooftops.stagesAtEnd?.['emp-owner'])} / ${JSON.stringify(B.rooftops.stagesAtEnd?.['emp-owner'])}` : '-'})`);
  for (const [name, key, d] of rows) console.log(`  ${name.padEnd(24)} ${f(A[scene][key], d).padStart(10)} ${f(B[scene][key], d).padStart(10)}`);
  console.log(`  ${'browser memory MB'.padEnd(24)} ${String(A[scene].browser?.allProcessesMB).padStart(10)} ${String(B[scene].browser?.allProcessesMB).padStart(10)}`);
  console.log(`  ${'GPU process MB'.padEnd(24)} ${String(A[scene].browser?.gpuProcessMB).padStart(10)} ${String(B[scene].browser?.gpuProcessMB).padStart(10)}`);
}
