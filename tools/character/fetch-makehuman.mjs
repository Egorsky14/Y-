// Downloads the CC0 MakeHuman data the technician is built from, at a pinned commit, into
// tools/character/makehuman/. Only data files (base mesh, skeleton, weights, morph targets): MakeHuman's
// AGPL program code is never fetched or used. License statement: LICENSE.md section C and D of that repo.
// Run: node tools/character/fetch-makehuman.mjs
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const COMMIT = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482';
const RAW = `https://raw.githubusercontent.com/makehumancommunity/makehuman/${COMMIT}/`;
const DATA = 'makehuman/data/';
const OUT = 'tools/character/makehuman';

const macro = (n) => `targets/macrodetails/${n}.target`;
const files = [
  '3dobjs/base.obj',
  'rigs/default.mhskel',
  'rigs/default_weights.mhw',
  ...['caucasian', 'african', 'asian'].flatMap((race) => [macro(`${race}-male-young`), macro(`${race}-male-old`)]),
  ...['averagemuscle-averageweight', 'averagemuscle-maxweight', 'averagemuscle-minweight', 'maxmuscle-averageweight', 'minmuscle-averageweight', 'maxmuscle-maxweight'].map((m) => macro(`universal-male-young-${m}`)),
  'targets/macrodetails/height/male-young-averagemuscle-averageweight-maxheight.target',
  'targets/macrodetails/height/male-young-averagemuscle-averageweight-minheight.target',
  ...process.argv.slice(2),
];

const lock = [];
for (const f of files) {
  const path = join(OUT, f);
  let body;
  try {
    body = await readFile(path);
  } catch {
    const r = await fetch(RAW + DATA + f);
    if (!r.ok) throw new Error(`${r.status} ${f}`);
    body = Buffer.from(await r.arrayBuffer());
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }
  lock.push(`${createHash('sha256').update(body).digest('hex')}  ${f}`);
}
const license = await (await fetch(`${RAW}LICENSE.md`)).text();
await writeFile(join(OUT, 'MAKEHUMAN_LICENSE.md'), license);
await writeFile(join(OUT, 'SOURCE.txt'), `makehumancommunity/makehuman @ ${COMMIT}\nAssets: CC0 1.0 (LICENSE.md section C). Program code is not included.\n\n${lock.sort().join('\n')}\n`);
console.log(`${files.length} files in ${OUT}`);
