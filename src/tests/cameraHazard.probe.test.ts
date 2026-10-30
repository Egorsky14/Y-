import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { HOUSE_LOTS } from '@/game/world/cityLayout';
import { occluderKind } from '@/world/scene/cameraOcclusion';
import { obstaclesNear } from '@/world/scene/cameraObstacles';
import { scoreView } from '@/world/scene/cameraComposition';
import { serviceCloseUpCamera, serviceObstacles, serviceSubject, serviceViewCamera } from '@/world/scene/serviceCall';

/**
 * Developer probe (PROBE=<out file>): for every house lot, the plants and poles within 8 m of the
 * work, and how the previous close-up (Visual Quality Pass) and the composed Watch Work compare.
 */
describe.skipIf(!process.env.PROBE)('obstacle probe', () => {
  it('writes the report', () => {
    const out: string[] = [];
    for (const lot of HOUSE_LOTS) {
      const subject = serviceSubject(lot, 'work');
      const near = obstaclesNear(subject.focus.x, subject.focus.z, 8);
      const plants = near.filter((b) => occluderKind(b) === 'plant').length;
      const poles = near.filter((b) => occluderKind(b) === 'pole').length;
      const boxes = serviceObstacles(lot, 'work', subject.focus);
      const old = serviceCloseUpCamera(lot, 16 / 9);
      const oldReport = scoreView({ target: { x: old.target.x, y: 0, z: old.target.z }, azimuth: old.azimuth, elevation: old.elevation, distance: old.distance }, subject, boxes, 16 / 9, 'work', undefined, false);
      const now = serviceViewCamera(lot, 'work', 16 / 9).report;
      const fmt = (r: typeof oldReport | null) => (r && typeof r !== 'string' ? `fill ${r.fill.toFixed(2)} wall ${r.wall.toFixed(2)} plant ${r.plant.toFixed(2)} pole ${r.pole.toFixed(2)} fg ${r.foreground.toFixed(2)} roof ${r.roof.toFixed(2)}` : `unusable (${r})`);
      out.push(`${lot.id} ${lot.style} plants ${plants} poles ${poles} | old ${fmt(oldReport)} | new ${fmt(now)}`);
    }
    fs.writeFileSync(process.env.PROBE!, out.join('\n'));
    expect(out.length).toBeGreaterThan(0);
  });
});
