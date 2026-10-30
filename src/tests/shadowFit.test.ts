import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { condenserPosition, curbParking, HOUSE_LOTS } from '@/game/world/cityLayout';
import { serviceSiteCamera } from '@/world/scene/serviceCall';
import { DEFAULT_OFFSET, DEFAULT_TARGET } from '@/world/scene/CameraRig';
import { fitSunShadow, SHADOW_MIN_RADIUS, shadowRadiusFor } from '@/world/scene/shadowFit';

/**
 * The sun's shadow box follows the view (Atmosphere → fitSunShadow). It must still cover what a
 * close view shows, keep the full box for the overview, and move in whole texels.
 */

const SUN = new THREE.Vector3(0.45, 0.72, 0.53).normalize();
const MAX = 230;
const MAP = 4096;

/** Point position in the shadow camera's light-space frame (x right, y up), relative to its center. */
function lightSpace(p: THREE.Vector3, center: THREE.Vector3): THREE.Vector2 {
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN).normalize();
  const up = new THREE.Vector3().crossVectors(SUN, right).normalize();
  const d = p.clone().sub(center);
  return new THREE.Vector2(d.dot(right), d.dot(up));
}

describe('sun shadow fit', () => {
  it('grows with camera distance in coarse steps and caps at the overview box', () => {
    let last = 0;
    const radii = new Set<number>();
    for (let d = 5; d <= 340; d += 0.5) {
      const r = shadowRadiusFor(d, MAX);
      expect(r).toBeGreaterThanOrEqual(last);
      expect(r).toBeGreaterThanOrEqual(SHADOW_MIN_RADIUS);
      expect(r).toBeLessThanOrEqual(MAX);
      radii.add(r);
      last = r;
    }
    expect(radii.size).toBeLessThan(20);
    expect(shadowRadiusFor(340, MAX)).toBe(MAX);
  });

  it('keeps nearly the whole overview box at the default camera', () => {
    const fit = fitSunShadow(DEFAULT_TARGET, DEFAULT_TARGET.clone().add(DEFAULT_OFFSET), SUN, MAX, MAP);
    expect(fit.radius).toBeGreaterThan(0.85 * MAX);
  });

  it('covers the van spot, condenser and technician in every service-site view', () => {
    for (const lot of HOUSE_LOTS) {
      const cmd = serviceSiteCamera(lot);
      const target = new THREE.Vector3(cmd.target.x, cmd.targetY, cmd.target.z);
      const dir = new THREE.Vector3(Math.sin(cmd.azimuth) * Math.cos(cmd.elevation), Math.sin(cmd.elevation), Math.cos(cmd.azimuth) * Math.cos(cmd.elevation));
      const cam = target.clone().add(dir.normalize().multiplyScalar(cmd.distance));
      const fit = fitSunShadow(target, cam, SUN, MAX, MAP);
      expect(fit.radius).toBeLessThan(MAX);
      const c = condenserPosition(lot);
      const v = curbParking(lot);
      for (const p of [new THREE.Vector3(c.x, 1, c.z), new THREE.Vector3(v.x, 1, v.z), new THREE.Vector3(lot.center.x, 6, lot.center.z)]) {
        const ls = lightSpace(p, fit.center);
        expect(Math.abs(ls.x)).toBeLessThan(fit.radius * 0.8);
        expect(Math.abs(ls.y)).toBeLessThan(fit.radius * 0.8);
      }
    }
  });

  it('moves the box in whole shadow-map texels while panning', () => {
    const cam = new THREE.Vector3(-30, 40, 50);
    const base = fitSunShadow(new THREE.Vector3(0, 0, 0), cam, SUN, MAX, MAP);
    const texel = (2 * base.radius) / MAP;
    for (let i = 1; i < 40; i++) {
      const pan = new THREE.Vector3(i * 0.013, 0, i * 0.007);
      const fit = fitSunShadow(pan, cam.clone().add(pan), SUN, MAX, MAP);
      expect(fit.radius).toBe(base.radius);
      const ls = lightSpace(fit.center, base.center);
      for (const k of [ls.x / texel, ls.y / texel]) expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-3);
    }
  });
});
