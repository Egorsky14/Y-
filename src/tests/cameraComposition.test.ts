import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { condenserPosition, curbParking, HOUSE_LOTS, lotById, workPosition } from '@/game/world/cityLayout';
import { cameraPosition, occluderKind, type SafeArea } from '@/world/scene/cameraOcclusion';
import { obstaclesNear } from '@/world/scene/cameraObstacles';
import { composeView, scoreView, type CompositionReport } from '@/world/scene/cameraComposition';
import { serviceCloseUpCamera, serviceObstacles, serviceSubject, serviceViewCamera } from '@/world/scene/serviceCall';

/**
 * Cinematic service camera: the composed Property, Watch Work and Detail shots
 * (cameraComposition.ts, serviceCall.ts serviceViewCamera) on every house lot and screen shape.
 * Visual acceptance in numbers: the work fills a meaningful share of the free screen, roofs,
 * plants, poles and foreground clutter stay out of it, the camera stays low or moderate and sees
 * the technician side-on, and Detail shows the hands and the panel or is not used.
 */

const SCREENS: [string, number, SafeArea][] = [
  ['desktop', 16 / 9, { right: 0, bottom: 0, top: 0.08 }],
  ['desktop, inspector open', 16 / 9, { right: 0.2, bottom: 0, top: 0.08 }],
  ['phone portrait, collapsed sheet', 390 / 844, { right: 0, bottom: 0.2, top: 0.13 }],
  ['phone landscape, side panel', 844 / 390, { right: 0.45, bottom: 0, top: 0.15 }],
];
const TUTORIAL = lotById('c-n-4')!;
const STYLES = ['ranch', 'two-story', 'spanish', 'premium', 'modern'];

const report = (r: ReturnType<typeof serviceViewCamera>): CompositionReport => {
  expect(r.report, 'composed (not a fallback)').not.toBeNull();
  return r.report!;
};

describe('Watch Work', () => {
  it('covers every property style', () => {
    expect(new Set(HOUSE_LOTS.map((l) => l.style))).toEqual(new Set(STYLES));
  });

  for (const [name, aspect, safe] of SCREENS) {
    it(`frames the technician and unit large and clear on every lot (${name})`, () => {
      for (const lot of HOUSE_LOTS) {
        const shot = serviceViewCamera(lot, 'work', aspect, safe, { phase: 'diagnosis' });
        expect(shot.mode, lot.id).toBe('work');
        const r = report(shot);
        // A meaningful share of the free screen, centred in it.
        expect(r.fill, `${lot.id} fill`).toBeGreaterThan(0.45);
        expect(r.fill, `${lot.id} fill`).toBeLessThan(0.8);
        expect(Math.abs(r.center[0]), `${lot.id} centre x`).toBeLessThan(0.3);
        expect(Math.abs(r.center[1]), `${lot.id} centre y`).toBeLessThan(0.3);
        // Not roof-dominated, nothing in front of the lens, no trunk or pole across the shot.
        expect(r.roof, `${lot.id} roof`).toBeLessThanOrEqual(0.05);
        expect(r.foreground, `${lot.id} foreground`).toBeLessThanOrEqual(0.05);
        expect(r.plant, `${lot.id} plant`).toBeLessThanOrEqual(0.1);
        expect(r.pole, `${lot.id} pole`).toBeLessThanOrEqual(0.03);
        // Low or moderate camera, side-on to the technician (never from behind).
        expect(r.elevation, `${lot.id} elevation`).toBeGreaterThanOrEqual(0.2);
        expect(r.elevation, `${lot.id} elevation`).toBeLessThanOrEqual(0.52);
        expect(r.sideAngle!, `${lot.id} side`).toBeLessThan(2.35);
        // Close: a few metres from the work, camera at about standing eye height or below.
        const cam = cameraPosition({ target: { x: shot.command.target.x, y: 0, z: shot.command.target.z }, azimuth: shot.command.azimuth, elevation: shot.command.elevation, distance: shot.command.distance });
        const tech = workPosition(lot, 0);
        expect(Math.hypot(cam.x - tech.x, cam.z - tech.z), `${lot.id} distance`).toBeLessThan(7.5);
        expect(cam.y, `${lot.id} height`).toBeLessThan(3.6);
      }
    });
  }

  it('fills the frame much more than the previous close-up and drops its foreground clutter', () => {
    let before = 0;
    let after = 0;
    let fgBefore = 0;
    let fgAfter = 0;
    for (const lot of HOUSE_LOTS) {
      const subject = serviceSubject(lot, 'work');
      const boxes = serviceObstacles(lot, 'work', subject.focus);
      const old = serviceCloseUpCamera(lot, 16 / 9);
      const o = scoreView({ target: { x: old.target.x, y: 0, z: old.target.z }, azimuth: old.azimuth, elevation: old.elevation, distance: old.distance }, subject, boxes, 16 / 9, 'work', undefined, false);
      const n = report(serviceViewCamera(lot, 'work', 16 / 9));
      if (typeof o === 'string') continue; // the old camera stood inside a plant: nothing to measure
      before += o.fill;
      after += n.fill;
      fgBefore += o.foreground;
      fgAfter += n.foreground;
    }
    expect(after).toBeGreaterThan(before * 1.5);
    expect(fgAfter).toBeLessThan(fgBefore * 0.1);
  });

  it('a roof-dominated view loses to the composed close-up', () => {
    const subject = serviceSubject(TUTORIAL, 'work');
    const boxes = serviceObstacles(TUTORIAL, 'work', subject.focus);
    const best = composeView(subject, boxes, 16 / 9, 'work')!;
    // Look at the work from high over the house: most of the frame is roof.
    const unit = condenserPosition(TUTORIAL);
    const overHouse = Math.atan2(TUTORIAL.center.x - unit.x, TUTORIAL.center.z - unit.z);
    let roofy: CompositionReport | null = null;
    for (const el of [0.6, 0.75, 0.9]) for (const d of [8, 10, 12]) {
      const r = scoreView({ target: subject.focus, azimuth: overHouse, elevation: el, distance: d }, subject, boxes, 16 / 9, 'work', undefined, false);
      if (typeof r !== 'string' && r.roof >= 0.3 && (!roofy || r.roof > roofy.roof)) roofy = r;
    }
    expect(roofy, 'found a roof-heavy candidate').not.toBeNull();
    expect(roofy!.cost).toBeGreaterThan(best.report.cost + 0.5);
    expect(best.report.roof).toBeLessThan(0.05);
  });

  it('keeps its heading while following the technician walking up', () => {
    const settled = serviceViewCamera(TUTORIAL, 'work', 16 / 9);
    const spot = workPosition(TUTORIAL, 0);
    const curb = curbParking(TUTORIAL);
    // One follow step (ServiceDirector reframes every 1.2 m) and the next: the heading drifts, never swings.
    const toward = Math.hypot(curb.x - spot.x, curb.z - spot.z);
    const at = (m: number) => ({ x: spot.x + ((curb.x - spot.x) / toward) * m, z: spot.z + ((curb.z - spot.z) / toward) * m });
    const walking = at(1.5);
    const follow = serviceViewCamera(TUTORIAL, 'work', 16 / 9, undefined, { phase: 'arrival', techPos: walking, standing: true, keepAzimuth: settled.command.azimuth });
    expect(follow.mode).toBe('work');
    const next = serviceViewCamera(TUTORIAL, 'work', 16 / 9, undefined, { phase: 'arrival', techPos: at(2.7), standing: true, keepAzimuth: follow.command.azimuth });
    expect(Math.abs(Math.atan2(Math.sin(next.command.azimuth - follow.command.azimuth), Math.cos(next.command.azimuth - follow.command.azimuth)))).toBeLessThan(0.6);
    expect(Math.abs(Math.atan2(Math.sin(follow.command.azimuth - settled.command.azimuth), Math.cos(follow.command.azimuth - settled.command.azimuth)))).toBeLessThan(0.6);
  });

  it('recomposes for the space the inspector leaves free', () => {
    const open = report(serviceViewCamera(TUTORIAL, 'work', 16 / 9, { right: 0.2, bottom: 0, top: 0.08 }));
    const closed = report(serviceViewCamera(TUTORIAL, 'work', 16 / 9, { right: 0, bottom: 0, top: 0.08 }));
    // Both centred in their own free area; the panel's share of the screen changes the fitted shot.
    expect(Math.abs(open.center[0])).toBeLessThan(0.3);
    expect(Math.abs(closed.center[0])).toBeLessThan(0.3);
    expect(open.distance).not.toBeCloseTo(closed.distance, 2);
  });
});

describe('Detail', () => {
  for (const phase of ['diagnosis', 'repair'] as const) {
    for (const [name, aspect, safe] of [SCREENS[0], SCREENS[2]]) {
      it(`shows the hands, tools and panel up close on every lot (${phase}, ${name})`, () => {
        for (const lot of HOUSE_LOTS) {
          const shot = serviceViewCamera(lot, 'detail', aspect, safe, { phase });
          // Detail is used only when the hands and panel are in plain sight (key points), else it is Watch Work.
          expect(shot.mode, lot.id).toBe('detail');
          const r = report(shot);
          expect(r.fill, `${lot.id} fill`).toBeGreaterThan(0.55);
          expect(r.foreground, `${lot.id} foreground`).toBeLessThanOrEqual(0.05);
          expect(r.roof, `${lot.id} roof`).toBeLessThanOrEqual(0.03);
          expect(r.elevation, `${lot.id} elevation`).toBeLessThanOrEqual(0.5);
          expect(r.sideAngle!, `${lot.id} side`).toBeLessThan(2.4);
          expect(r.distance, `${lot.id} distance`).toBeLessThan(5);
        }
      });
    }
  }

  it('waits as Watch Work while the technician is still walking up', () => {
    const spot = workPosition(TUTORIAL, 0);
    const shot = serviceViewCamera(TUTORIAL, 'detail', 16 / 9, undefined, { phase: 'arrival', techPos: { x: spot.x + 3, z: spot.z }, standing: true });
    expect(shot.mode).toBe('work');
  });

  it('frames different things for diagnosis and repair', () => {
    const d = serviceSubject(TUTORIAL, 'detail', { phase: 'diagnosis' });
    const r = serviceSubject(TUTORIAL, 'detail', { phase: 'repair' });
    expect(d.key).not.toEqual(r.key);
  });
});

describe('Property', () => {
  for (const [name, aspect, safe] of [SCREENS[0], SCREENS[2]]) {
    it(`shows the house, van, unit and technician together (${name})`, () => {
      for (const lot of HOUSE_LOTS) {
        const shot = serviceViewCamera(lot, 'property', aspect, safe);
        expect(shot.mode, lot.id).toBe('property');
        const r = report(shot);
        expect(r.fill, `${lot.id} fill`).toBeGreaterThan(0.6);
        expect(r.foreground, `${lot.id} foreground`).toBeLessThanOrEqual(0.15);
        expect(r.pole, `${lot.id} pole`).toBeLessThanOrEqual(0.06);
        expect(r.elevation, `${lot.id} elevation`).toBeLessThanOrEqual(0.76);
      }
    });
  }
});

describe('camera obstacles', () => {
  it('include yard trees, street palms and poles near the work', () => {
    let plants = 0;
    let poles = 0;
    for (const lot of HOUSE_LOTS) {
      const s = serviceSubject(lot, 'work');
      for (const b of obstaclesNear(s.focus.x, s.focus.z, 20)) {
        if (occluderKind(b) === 'pole') poles++;
        else plants++;
      }
    }
    expect(plants).toBeGreaterThan(200);
    expect(poles).toBeGreaterThan(5);
  });

  it('reject a camera inside a tree or against a pole', () => {
    const lot = lotById('n-o-1')!;
    const subject = serviceSubject(lot, 'work');
    const boxes = serviceObstacles(lot, 'work', subject.focus);
    const tree = boxes.find((b) => occluderKind(b) === 'plant' && b.max.y > 1.5)!;
    expect(tree).toBeDefined();
    const c = tree.getCenter(new THREE.Vector3());
    // A view whose camera sits in that plant.
    const dx = c.x - subject.focus.x;
    const dz = c.z - subject.focus.z;
    const dy = c.y - subject.focus.y;
    const d = Math.hypot(dx, dy, dz);
    const r = scoreView({ target: subject.focus, azimuth: Math.atan2(dx, dz), elevation: Math.asin(dy / d), distance: d }, subject, boxes, 16 / 9, 'work');
    expect(r).toMatch(/clearance of plant/);
  });

  it('stay out of every composed close-up camera', () => {
    for (const lot of HOUSE_LOTS) {
      const shot = serviceViewCamera(lot, 'work', 16 / 9);
      const cam = cameraPosition({ target: { x: shot.command.target.x, y: 0, z: shot.command.target.z }, azimuth: shot.command.azimuth, elevation: shot.command.elevation, distance: shot.command.distance });
      for (const b of obstaclesNear(cam.x, cam.z, 2)) expect(b.containsPoint(cam), lot.id).toBe(false);
    }
  });
});

describe('solver', () => {
  it('is deterministic', () => {
    const a = serviceViewCamera(TUTORIAL, 'work', 16 / 9, { right: 0.2, bottom: 0, top: 0.08 });
    const b = serviceViewCamera(TUTORIAL, 'work', 16 / 9, { right: 0.2, bottom: 0, top: 0.08 });
    expect(b.command).toEqual(a.command);
  });

  it('is fast enough to run when a view is entered or the layout changes', () => {
    // Warm the house and obstacle caches.
    for (const lot of HOUSE_LOTS) serviceViewCamera(lot, 'property', 16 / 9);
    const t0 = performance.now();
    let n = 0;
    for (const lot of HOUSE_LOTS) for (const mode of ['work', 'detail'] as const) {
      serviceViewCamera(lot, mode, 16 / 9, undefined, { phase: 'diagnosis' });
      n++;
    }
    const closeUp = (performance.now() - t0) / n;
    const t1 = performance.now();
    for (const lot of HOUSE_LOTS) serviceViewCamera(lot, 'property', 16 / 9);
    const property = (performance.now() - t1) / HOUSE_LOTS.length;
    expect(closeUp).toBeLessThan(30);
    expect(property).toBeLessThan(80);
  });
});
