import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH, SIDEWALK_WIDTH, STREETS } from '@/game/world/cityLayout';
import { walkSurfaceY } from '@/world/roads/walkSurface';

describe('walkable ground height', () => {
  const s = STREETS[0];
  const along = (s.from + s.to) / 2 + 23;
  const at = (across: number) => (s.axis === 'x' ? walkSurfaceY(along, s.at + across) : walkSurfaceY(s.at + across, along));

  it('is the road at the crown and the sidewalk on the sidewalk', () => {
    expect(at(0)).toBe(0);
    expect(at(ROAD_WIDTH / 2 + 0.55 + SIDEWALK_WIDTH / 2)).toBeCloseTo(0.145, 3);
  });

  it('never steps: walking across a street and its sidewalks, the height changes smoothly', () => {
    let prev = at(-20);
    for (let a = -20; a <= 20; a += 0.02) {
      const y = at(a);
      expect(Math.abs(y - prev)).toBeLessThan(0.02);
      prev = y;
    }
  });
});
