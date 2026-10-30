import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { lotById } from '@/game/world/cityLayout';
import { serviceViewCamera } from '@/world/scene/serviceCall';

/** Developer probe (PROBE=<out file>): the composition report for every test lot, mode and screen. */
describe.skipIf(!process.env.PROBE)('composition probe', () => {
  it('writes the report', () => {
    const out: string[] = [];
    for (const id of (process.env.PROBE_LOTS ?? 'c-n-4,a-n-2,a-s-2,b-n-2,a-n-4').split(',')) {
      const lot = lotById(id)!;
      for (const [label, aspect, safe] of [['desk', 16 / 9, { right: 0, bottom: 0, top: 0.08 }], ['phone', 390 / 844, { right: 0, bottom: 0.2, top: 0.08 }]] as const) {
        for (const mode of ['property', 'work', 'detail'] as const) {
          const r = serviceViewCamera(lot, mode, aspect, safe, { phase: 'diagnosis' });
          const p = r.report;
          out.push([id, label, mode, '->', r.mode, r.ms.toFixed(0) + 'ms', p ? `fill ${p.fill.toFixed(2)} c ${p.center.map((v) => v.toFixed(2))} roof ${p.roof.toFixed(2)} wall ${p.wall.toFixed(2)} plant ${p.plant.toFixed(2)} pole ${p.pole.toFixed(2)} fg ${p.foreground.toFixed(2)} sky ${p.sky.toFixed(2)} el ${p.elevation.toFixed(2)} d ${p.distance.toFixed(1)} side ${p.sideAngle?.toFixed(2)} cost ${p.cost.toFixed(2)}` : 'FALLBACK'].join(' '));
        }
      }
    }
    fs.writeFileSync(process.env.PROBE!, out.join('\n'));
    expect(out.length).toBeGreaterThan(0);
  });
});
