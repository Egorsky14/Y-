import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { condenserPosition, curbParking, HOUSE_LOTS, lotById, workPosition, type Lot } from '@/game/world/cityLayout';
import { cameraPosition, occluderKind, type SafeArea } from '@/world/scene/cameraOcclusion';
import { obstaclesNear } from '@/world/scene/cameraObstacles';
import { composeView, scoreView, type CompositionReport } from '@/world/scene/cameraComposition';
import { approachPath, curbDoor, pathLength, samplePath, serviceCloseUpCamera, serviceObstacles, serviceSubject, serviceViewCamera, walkPose, followFailure, WALK_AHEAD, WALK_SPEED } from '@/world/scene/serviceCall';

/**
 * Cinematic service camera: the composed Property, Watch Work and Detail shots
 * (cameraComposition.ts, serviceCall.ts serviceViewCamera) on every house lot and screen shape.
 * Visual acceptance in numbers: the work fills a meaningful share of the free screen, roofs,
 * plants, poles and foreground clutter stay out of it, the camera stays low or moderate and sees
 * the technician side-on, and Detail shows the hands and the panel or is not used.
 */

// Free areas as the game measures them (measureSafeArea): HUD on top, bottom bars, the panel.
const SCREENS: [string, number, SafeArea][] = [
  ['desktop, panel collapsed', 16 / 9, { right: 0, bottom: 0.079, top: 0.085 }],
  ['desktop, inspector open', 16 / 9, { right: 0.2, bottom: 0.079, top: 0.085 }],
  ['desktop, no bars', 16 / 9, { right: 0, bottom: 0, top: 0.08 }],
  ['phone portrait, collapsed sheet', 390 / 844, { right: 0, bottom: 0.175, top: 0.135 }],
  ['phone landscape, side panel', 844 / 390, { right: 0.45, bottom: 0.12, top: 0.15 }],
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
    // 1.4x: measured with his real kneeling head (1.45x; 1.51x with the old, too low head point, which was the earlier 1.5x bar).
    expect(after).toBeGreaterThan(before * 1.4);
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
    for (const [name, aspect, safe] of [SCREENS[0], SCREENS[3]]) {
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
  for (const [name, aspect, safe] of [SCREENS[0], SCREENS[3]]) {
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

// Free areas exactly as the game measures them during the service camera (acceptance captures,
// docs/cinematic-camera/acceptance and fixes): HUD and camera bar, bottom row, and the collapsed inspector
// card or the camera bar under the HUD as rectangles the subject keeps out from under.
const GAME_SCREENS: [string, number, SafeArea][] = [
  ['desktop 1920x1080', 1920 / 1080, { right: 0, bottom: 0.079, top: 0.085, avoid: [[1534 / 1920, 86 / 1080, 1906 / 1920, 176 / 1080]] }],
  ['laptop 1366x768, bar above the bottom row', 1366 / 768, { right: 0, bottom: 0.185, top: 0.12, avoid: [[980 / 1366, 86 / 768, 1352 / 1366, 176 / 768]] }],
  ['phone portrait 390x844', 390 / 844, { right: 0, bottom: 0.175, top: 0.135, avoid: [[59 / 390, 64 / 844, 330 / 390, 114 / 844]] }],
  // Short landscape screens: the collapsed card reaches deep into the view, so its width counts as covered; the camera
  // bar sits in that column, in the bottom-right corner (it used to sit under the HUD, over the top of the shot).
  ['iPhone landscape 750x340', 750 / 340, { right: 383 / 750, bottom: 0.194, top: 64 / 340, avoid: [] }],
  ['phone landscape 844x390', 844 / 390, { right: 388 / 844, bottom: 66 / 390, top: 64 / 390, avoid: [] }],
];

/** Where the kneeling technician's head is (Worker.tsx rig), and where it goes when he stands to read the gauges. */
function headPoints(lot: Lot) {
  const tech = workPosition(lot, 0);
  const unit = condenserPosition(lot);
  const d = Math.hypot(unit.x - tech.x, unit.z - tech.z);
  const at = (lean: number, y: number) => ({ x: tech.x + ((unit.x - tech.x) / d) * lean, y, z: tech.z + ((unit.z - tech.z) / d) * lean });
  return { cap: at(0.34, 1.52), risen: at(0.28, 1.76) };
}

describe('acceptance regressions', () => {
  for (const [name, aspect, safe] of GAME_SCREENS) {
    it(`composes Property, Watch Work and Detail on every lot, clear of the UI cards (${name})`, () => {
      for (const lot of HOUSE_LOTS) {
        // Property: never the uncomposed site camera (it hid the van under the action bar on landscape phones).
        const p = serviceViewCamera(lot, 'property', aspect, safe, { phase: 'diagnosis' });
        expect(p.report, `${lot.id} property composed`).not.toBeNull();
        expect(p.mode).toBe('property');
        for (const phase of ['diagnosis', 'repair'] as const) {
          const w = serviceViewCamera(lot, 'work', aspect, safe, { phase });
          expect(w.report, `${lot.id} work composed (${phase})`).not.toBeNull();
          const d = serviceViewCamera(lot, 'detail', aspect, safe, { phase });
          expect(d.report, `${lot.id} detail composed (${phase})`).not.toBeNull();
        }
      }
    });

    it(`follows the technician with a composed shot all the way from the van to the unit (${name})`, () => {
      const missing: string[] = [];
      for (const lot of HOUSE_LOTS) {
        const from = curbDoor(curbParking(lot), 0.4);
        const path = approachPath(lot, from, 0);
        const len = pathLength(path);
        for (let i = 0; i <= 4; i++) {
          const at = samplePath(path, (len * i) / 4);
          const shot = serviceViewCamera(lot, 'work', aspect, safe, { phase: 'arrival', techPos: at, standing: true });
          if (!shot.report) missing.push(`${lot.id}@${i}/4`);
        }
      }
      expect(missing, 'walking positions without a composed shot').toEqual([]);
    });

    it(`plans a walk-up follow from the van door that keeps him in sight all the way and ends as Watch Work (${name})`, () => {
      const lost: string[] = [];
      let landing = 0;
      for (const lot of HOUSE_LOTS) {
        const from = curbDoor(curbParking(lot), 0.4);
        const spot = workPosition(lot, 0);
        const ahead = WALK_AHEAD.map((k) => ({ x: from.x + (spot.x - from.x) * k, z: from.z + (spot.z - from.z) * k }));
        const shot = serviceViewCamera(lot, 'work', aspect, safe, { phase: 'arrival', techPos: from, standing: true, ahead });
        expect(shot.report, lot.id).not.toBeNull();
        const plan = 'plan' in shot ? shot.plan : null;
        expect(plan, `${lot.id} walk plan`).not.toBeNull();
        // The same check the director makes as he walks, on the pose the plan gives at each point (CameraRig follows it).
        for (const p of ahead) {
          const pose = walkPose(plan!, p);
          const view = { target: { x: pose.target.x, y: 0, z: pose.target.z }, azimuth: pose.azimuth, elevation: pose.elevation, distance: pose.distance };
          if (followFailure(view, lot, p, aspect, safe) !== null) lost.push(`${lot.id}@${ahead.indexOf(p)}`);
        }
        // At his spot the plan has become the Watch Work shot itself: arriving needs no flight.
        const work = serviceViewCamera(lot, 'work', aspect, safe, { phase: 'diagnosis' }).command;
        const atSpot = walkPose(plan!, spot);
        // At his spot the plan has become the Watch Work shot (or, where it only slides, flies the last bit on arrival).
        const c0 = cameraPosition({ target: { x: atSpot.target.x, y: 0, z: atSpot.target.z }, azimuth: atSpot.azimuth, elevation: atSpot.elevation, distance: atSpot.distance });
        const c1 = cameraPosition({ target: { x: work.target.x, y: 0, z: work.target.z }, azimuth: work.azimuth, elevation: work.elevation, distance: work.distance });
        if (Math.hypot(c0.x - c1.x, c0.y - c1.y, c0.z - c1.z) < 1e-3) landing++;
      }
      // Where walls, a palm and the van leave no plan that sees him at every point (one lot on the shortest landscape
      // screen), the plan keeps him over the rest of the walk and loses him only beside the van (the first three
      // look-ahead points, up to 37% of the way); the director then re-aims once, gently. At most one such lot per screen.
      expect(new Set(lost.map((l) => l.split('@')[0])).size, `lots where the planned follow loses him: ${lost.join(' ')}`).toBeLessThanOrEqual(1);
      expect(lost.filter((l) => Number(l.split('@')[1]) > 2), 'lost after the first stretch beside the van').toEqual([]);
      // Nearly every plan turns into the Watch Work shot itself; the rest slide and fly the last bit on arrival.
      expect(landing, 'walks that end as Watch Work').toBeGreaterThanOrEqual(26);
    });

    it(`keeps his head in the free area and out from under the controls in Watch Work and Detail, kneeling and standing up (${name})`, () => {
      const problems: string[] = [];
      let detailAsWork = 0;
      for (const lot of HOUSE_LOTS) {
        const { cap, risen } = headPoints(lot);
        for (const [mode, phase] of [['work', 'diagnosis'], ['detail', 'diagnosis'], ['detail', 'repair']] as const) {
          const shot = serviceViewCamera(lot, mode, aspect, safe, { phase });
          if (mode === 'detail' && shot.mode !== 'detail') detailAsWork++;
          const r = shot.report!;
          const focus = serviceSubject(lot, shot.mode, { phase }).focus;
          const view = { target: focus, azimuth: r.azimuth, elevation: r.elevation, distance: r.distance };
          // The top of his cap framed in the free area and clear of the UI rectangles; his head when he stands up in the free area and clear of them too.
          const verdict = scoreView(view, { frame: [cap], key: [], clear: [risen], focus, preferredAzimuth: 0 }, serviceObstacles(lot, shot.mode, focus), aspect, shot.mode, safe, false);
          if (typeof verdict === 'string') problems.push(`${lot.id} ${mode}/${phase}: ${verdict}`);
        }
      }
      expect(problems).toEqual([]);
      // Detail stays a close-up; only on the 340 px tall screen, where a close-up at its farthest cannot keep his head
      // clear when he stands up, does it show Watch Work instead (3 lots, diagnosis).
      expect(detailAsWork, 'Detail shown as Watch Work').toBeLessThanOrEqual(name.includes('750x340') ? 3 : 0);
    });

    it(`turns into Watch Work at an even pace as he walks up, never faster than 5 m/s or through scenery (${name})`, () => {
      const fast: string[] = [];
      const inside: string[] = [];
      for (const lot of HOUSE_LOTS) {
        const from = curbDoor(curbParking(lot), 0.4);
        const spot = workPosition(lot, 0);
        const ahead = WALK_AHEAD.map((k) => ({ x: from.x + (spot.x - from.x) * k, z: from.z + (spot.z - from.z) * k }));
        const shot = serviceViewCamera(lot, 'work', aspect, safe, { phase: 'arrival', techPos: from, standing: true, ahead });
        const plan = 'plan' in shot ? shot.plan : null;
        if (!plan) continue;
        // He walks his path at walking pace; CameraRig eases toward the plan's pose every frame (TRACK_RATE 3.5/s).
        const path = approachPath(lot, from, 0);
        const len = pathLength(path);
        const dt = 1 / 60;
        const k = 1 - Math.exp(-dt * 3.5);
        const camAt = (p: { x: number; z: number }) => {
          const o = walkPose(plan, p);
          return cameraPosition({ target: { x: o.target.x, y: 0, z: o.target.z }, azimuth: o.azimuth, elevation: o.elevation, distance: o.distance });
        };
        const cam = camAt(from);
        let peak = 0;
        for (let m = 0; m <= len + 3; m += WALK_SPEED * dt) {
          const want = camAt(samplePath(path, Math.min(len, m)));
          const step = want.sub(cam).multiplyScalar(k);
          peak = Math.max(peak, step.length() / dt);
          cam.add(step);
        }
        if (peak > 5) fast.push(`${lot.id} ${peak.toFixed(1)} m/s`);
        // Nor does the planned camera pass through a tree, pole, wall or the van anywhere on his way (not only at the look-ahead points).
        const mid = samplePath(path, len / 2);
        const boxes = serviceObstacles(lot, 'work', mid);
        for (let m = 0; m <= len; m += 0.5) {
          const c = camAt(samplePath(path, m));
          const hit = boxes.find((b) => b.containsPoint(c));
          if (hit) {
            inside.push(`${lot.id} ${occluderKind(hit)} at ${m.toFixed(1)} m`);
            break;
          }
        }
      }
      // Before: the turn was squeezed into his last 5 m whatever the camera had to cover, peaking at 7-11 m/s on wide walking shots.
      expect(fast).toEqual([]);
      expect(inside, 'planned camera inside scenery while he walks').toEqual([]);
    });
  }

  it('turns down a view that puts the subject under a UI card', () => {
    const subject = serviceSubject(TUTORIAL, 'work');
    const boxes = serviceObstacles(TUTORIAL, 'work', subject.focus);
    const shot = serviceViewCamera(TUTORIAL, 'work', 16 / 9, { right: 0, bottom: 0, top: 0 });
    const pose = { target: { x: shot.command.target.x, y: 0, z: shot.command.target.z }, azimuth: shot.command.azimuth, elevation: shot.command.elevation, distance: shot.command.distance };
    expect(typeof scoreView(pose, subject, boxes, 16 / 9, 'work', { right: 0, bottom: 0, top: 0 })).not.toBe('string');
    expect(scoreView(pose, subject, boxes, 16 / 9, 'work', { right: 0, bottom: 0, top: 0, avoid: [[0.25, 0, 0.75, 1]] })).toBe('subject under the UI');
  });

  it('hands every close shot the serviced cabinet, which zoom stops short of', () => {
    for (const lot of [TUTORIAL, lotById('n-o-1')!, lotById('a-s-2')!]) {
      const shot = serviceViewCamera(lot, 'detail', 390 / 844, GAME_SCREENS[2][2], { phase: 'diagnosis' });
      const cab = (shot.command as { watch?: { cabinet?: { min: { x: number; z: number }; max: { x: number; z: number } } } }).watch?.cabinet;
      expect(cab, lot.id).toBeDefined();
      const unit = condenserPosition(lot);
      expect(unit.x).toBeGreaterThan(cab!.min.x);
      expect(unit.x).toBeLessThan(cab!.max.x);
      expect(unit.z).toBeGreaterThan(cab!.min.z);
      expect(unit.z).toBeLessThan(cab!.max.z);
    }
  });
});