import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { obstaclesNear } from '@/world/scene/cameraObstacles';

/** Developer probe (PROBE=<out file>): one-off cost of the plant and pole index, and a query. */
describe.skipIf(!process.env.PROBE)('obstacle index timing', () => {
  it('writes the timings', () => {
    const t0 = performance.now();
    const first = obstaclesNear(0, 0, 20).length;
    const build = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 1000; i++) obstaclesNear((i % 40) * 5 - 100, ((i * 7) % 40) * 5 - 100, 20);
    const query = (performance.now() - t1) / 1000;
    fs.writeFileSync(process.env.PROBE!, `index build (first query) ${build.toFixed(1)} ms, ${first} boxes near origin; query ${query.toFixed(3)} ms`);
    expect(first).toBeGreaterThan(0);
  });
});
