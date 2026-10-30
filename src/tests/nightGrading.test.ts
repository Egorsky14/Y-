import { describe, expect, it } from 'vitest';
import { SUNSET_MINUTE, sunAngles } from '@/game/simulation/weather';
import { lookFor } from '@/world/scene/Atmosphere';

/**
 * After sunset the directional light jumps from the sun to the moon and the environment map from
 * day to moonlit night (Atmosphere). Both swaps happen at the horizon crossing, so the light and
 * the map must both be at zero there, and night must read cool rather than warm-brown.
 */

function crossing(): number {
  let m = SUNSET_MINUTE - 60;
  while (sunAngles(m + 0.1).elevation >= 0) m += 0.1;
  return m;
}

describe('night grading', () => {
  it('fades the sun and the day map to zero where they swap to the moon and the night map', () => {
    const m = crossing();
    for (const minute of [m - 0.2, m + 0.3]) {
      const look = lookFor(minute, 'clear');
      expect(look.sunIntensity).toBeLessThan(0.02);
      expect(look.envIntensity).toBeLessThan(0.02);
    }
  });

  it('changes light and fill smoothly through dusk', () => {
    const m = crossing();
    let prev = lookFor(m - 90, 'clear');
    for (let t = m - 89; t <= m + 150; t += 1) {
      const look = lookFor(t, 'clear');
      expect(Math.abs(look.sunIntensity - prev.sunIntensity)).toBeLessThan(0.08);
      expect(Math.abs(look.envIntensity - prev.envIntensity)).toBeLessThan(0.04);
      prev = look;
    }
  });

  it('lights full night with a cool moon, cool fill and the moonlit map', () => {
    const night = lookFor(23 * 60, 'clear');
    expect(night.sunIntensity).toBeGreaterThan(0.25);
    expect(night.envIntensity).toBeGreaterThan(0.5);
    for (const c of [night.sunColor, night.ambientColor]) expect(c.b).toBeGreaterThan(c.r * 1.25);
  });

  it('leaves the daytime look unchanged', () => {
    const noon = lookFor(12 * 60, 'clear');
    expect(noon.ambientColor.getHexString()).toBe('ffffff');
    expect(noon.envIntensity).toBeCloseTo(0.55, 2);
  });
});
