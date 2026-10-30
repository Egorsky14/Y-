import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { condenserPosition, curbParking, HOUSE_LOTS, lotById, workPosition } from '@/game/world/cityLayout';
import { cameraPosition, inFrame, segmentBlocked, solveClearView, visibility } from '@/world/scene/cameraOcclusion';
import { closeUpPreferred, serviceCloseUpCamera, siteOccluders, workSitePoints } from '@/world/scene/serviceCall';

/**
 * Close views of the technician at work must not be blocked by the house (docs/graphics-revolution-2/
 * DEFECTS.md P1). The occluders are the bounds of each lot's solid house, porch and wall parts.
 */

const DESKTOP = 1920 / 1080;
const PHONE = 390 / 844;
const TUTORIAL = lotById('c-n-4')!;

/** The close camera used before the fix (and by earlier captures): a fixed turn from the curb heading. */
function legacyView(lot: (typeof HOUSE_LOTS)[number], aspect: number) {
  const tech = workPosition(lot, 0);
  const unit = condenserPosition(lot);
  const curb = curbParking(lot);
  return { target: { x: (tech.x + unit.x) / 2, y: 0, z: (tech.z + unit.z) / 2 }, azimuth: Math.atan2(curb.x - unit.x, curb.z - unit.z) + 0.75, elevation: 0.42, distance: aspect < 1 ? 8 : 6.5 };
}

describe('camera occlusion', () => {
  it('detects a segment through a box and ignores one beside it', () => {
    const wall = [new THREE.Box3(new THREE.Vector3(-1, 0, -0.1), new THREE.Vector3(1, 3, 0.1))];
    expect(segmentBlocked(new THREE.Vector3(0, 1, -5), new THREE.Vector3(0, 1, 5), wall)).toBe(true);
    expect(segmentBlocked(new THREE.Vector3(3, 1, -5), new THREE.Vector3(3, 1, 5), wall)).toBe(false);
    expect(segmentBlocked(new THREE.Vector3(0, 4, -5), new THREE.Vector3(0, 4, 5), wall)).toBe(false);
  });

  it('reproduces the tutorial defect: the old close camera is blocked on desktop and phone', () => {
    const boxes = siteOccluders(TUTORIAL);
    const points = workSitePoints(TUTORIAL);
    for (const aspect of [DESKTOP, PHONE]) expect(visibility(legacyView(TUTORIAL, aspect), points, boxes)).toBeLessThan(1);
  });

  it('finds a clear, framed close-up of the technician on every lot, desktop and phone', () => {
    for (const lot of HOUSE_LOTS) {
      const boxes = siteOccluders(lot);
      const points = workSitePoints(lot);
      for (const aspect of [DESKTOP, PHONE]) {
        const cmd = serviceCloseUpCamera(lot, aspect, boxes);
        const view = { target: { x: cmd.target.x, y: 0, z: cmd.target.z }, azimuth: cmd.azimuth, elevation: cmd.elevation, distance: cmd.distance };
        expect(cmd.clear, `${lot.id} ${lot.style} ${lot.facing} aspect ${aspect.toFixed(2)}`).toBe(true);
        expect(visibility(view, points, boxes), lot.id).toBe(1);
        expect(inFrame(view, points, aspect), lot.id).toBe(true);
        // Within the orbit limits CameraRig enforces (distance 5–340, polar angle 0.2–1.22 rad).
        expect(cmd.distance).toBeGreaterThanOrEqual(5);
        expect(Math.PI / 2 - cmd.elevation).toBeGreaterThanOrEqual(0.2);
        expect(Math.PI / 2 - cmd.elevation).toBeLessThanOrEqual(1.22);
      }
    }
  });

  it('frames the work inside the part of the screen the inspector leaves free', () => {
    // Desktop inspector: 372 px of 1920 plus its margin; upright phone: the bottom sheet up to 56 % of the height.
    const cases = [{ aspect: DESKTOP, safe: { right: 0.2, bottom: 0 } }, { aspect: PHONE, safe: { right: 0, bottom: 0.56 } }];
    for (const lot of HOUSE_LOTS) {
      const boxes = siteOccluders(lot);
      const points = workSitePoints(lot);
      for (const { aspect, safe } of cases) {
        const cmd = serviceCloseUpCamera(lot, aspect, boxes, safe);
        const view = { target: { x: cmd.target.x, y: 0, z: cmd.target.z }, azimuth: cmd.azimuth, elevation: cmd.elevation, distance: cmd.distance };
        expect(cmd.clear, `${lot.id} ${aspect.toFixed(2)}`).toBe(true);
        expect(inFrame(view, points, aspect, 0.9, safe), lot.id).toBe(true);
      }
    }
  });

  it('keeps the preferred angle whenever it is already clear', () => {
    let kept = 0;
    for (const lot of HOUSE_LOTS) {
      const boxes = siteOccluders(lot);
      const pref = closeUpPreferred(lot, DESKTOP);
      if (visibility(pref, workSitePoints(lot), boxes) === 1 && inFrame(pref, workSitePoints(lot), DESKTOP)) {
        const cmd = serviceCloseUpCamera(lot, DESKTOP, boxes);
        expect(Math.abs(Math.atan2(Math.sin(cmd.azimuth - pref.azimuth), Math.cos(cmd.azimuth - pref.azimuth)))).toBeLessThan(1e-9);
        kept++;
      }
    }
    expect(kept).toBeGreaterThan(0);
  });

  it('is deterministic and stable: solving from its own answer returns the same view', () => {
    const boxes = siteOccluders(TUTORIAL);
    const points = workSitePoints(TUTORIAL);
    const a = solveClearView(legacyView(TUTORIAL, DESKTOP), points, boxes, DESKTOP);
    const b = solveClearView(a, points, boxes, DESKTOP);
    expect(b.azimuth).toBeCloseTo(a.azimuth, 9);
    expect(b.elevation).toBeCloseTo(a.elevation, 9);
    expect(b.distance).toBeCloseTo(a.distance, 9);
    expect(cameraPosition(b).distanceTo(cameraPosition(a))).toBeLessThan(1e-6);
  });

  it('solves a close-up in a few milliseconds', () => {
    const boxes = siteOccluders(TUTORIAL);
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) serviceCloseUpCamera(TUTORIAL, i % 2 ? PHONE : DESKTOP, boxes);
    expect((performance.now() - t0) / 10).toBeLessThan(25);
  });
});
