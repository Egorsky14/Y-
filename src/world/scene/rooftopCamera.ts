import * as THREE from 'three';
import type { Lot } from '@/game/world/cityLayout';
import { HOUSE_LOTS } from '@/game/world/cityLayout';
import { cameraPosition, NO_SAFE_AREA, tagOccluder, type SafeArea, type ViewSpec } from './cameraOcclusion';
import { composeView, type RuleTuning, type ServiceMode, type Subject } from './cameraComposition';
import { obstaclesNear } from './cameraObstacles';
import { occludersOf } from './serviceCall';
import type { LadderPose, RoofPlan } from './rooftopChoreo';

/**
 * Service camera framing for rooftop calls (Property / Watch Work / Detail), using the same composer as the ground
 * calls (cameraComposition.ts) with rooftop subjects:
 *  - ground stages (at the van, carrying, raising and extending the ladder): the technician head to boots with the
 *    ladder's ends; Property adds the van, the access wall and the rooftop unit;
 *  - ladder stages (stepping on, climbing, over the parapet): the whole ladder from its feet to above the edge, with him
 *    on it (a taller subject: the shot may stand further off);
 *  - roof stages (walking to the unit, at its service side): the technician and the cabinet on the deck, as at a ground
 *    condenser but at roof height; Detail closes in on his hands and the service panel.
 * Obstacles are the building's walls and parapets (registered by the building), the other rooftop units, the parked van,
 * and plants and poles nearby, so no shot looks through the roof or a parapet at him.
 */

export type RoofStageGroup = 'ground' | 'ladder' | 'roof';

const LADDER_STAGES = new Set(['mount', 'climb', 'transfer', 'dismount']);
const ROOF_STAGES = new Set(['roof-walk', 'collect', 'work']);

export function roofStageGroup(stage: string | null | undefined): RoofStageGroup {
  const s = (stage ?? 'work').replace(/^roof:/, '');
  if (LADDER_STAGES.has(s)) return 'ladder';
  if (ROOF_STAGES.has(s)) return 'roof';
  return 'ground';
}

type P = { x: number; y: number; z: number };
const P = (x: number, y: number, z: number): P => ({ x, y, z });

/** Taller subjects (a whole ladder) may be framed from further off; property views of a commercial roof are wide. */
const LADDER_TUNING: RuleTuning = { maxDistance: 15, minDistance: 4.5, fill: 0.62, elevations: [0.2, 0.3, 0.4, 0.5], band: [0.25, 0.5] };
const GROUND_TUNING: RuleTuning = { maxDistance: 13, minDistance: 4, elevations: [0.22, 0.3, 0.38, 0.48], band: [0.25, 0.48] };
const PROPERTY_TUNING: RuleTuning = { maxDistance: 80, minDistance: 16 };

export interface RooftopTech {
  pos: THREE.Vector3;
  heading: number;
}

/** What each mode must show at this point of the rooftop call (world space). */
export function rooftopSubject(plan: RoofPlan, mode: ServiceMode, group: RoofStageGroup, tech: RooftopTech, ladder: LadderPose | null): Subject {
  const u = plan.unit;
  const deck = plan.spec.deckY + 0.06;
  const out = new THREE.Vector3(plan.access.out.x, 0, plan.access.out.z).normalize();
  const outAz = Math.atan2(out.x, out.z);
  const t = tech.pos;
  const head = P(t.x, t.y + 1.82, t.z);
  const chest = P(t.x, t.y + 1.25, t.z);
  const feet = P(t.x, t.y + 0.02, t.z);
  const cosY = Math.cos(u.yaw);
  const sinY = Math.sin(u.yaw);
  const corner = (a: number, b: number, y: number) => P(u.center.x + sinY * (u.size.length / 2) * a + cosY * (u.size.width / 2) * b, deck + y, u.center.z + cosY * (u.size.length / 2) * a - sinY * (u.size.width / 2) * b);
  const unitTop = P(u.center.x, deck + u.size.height, u.center.z);
  const ladderEnds = ladder && ladder.mode === 'world' ? [P(ladder.foot.x, ladder.foot.y, ladder.foot.z), (() => { const e = ladder.foot.clone().addScaledVector(ladder.axis, 3.6 + ladder.fly); return P(e.x, e.y, e.z); })()] : [];
  if (mode === 'property') {
    const rest = plan.access.rest;
    const along = new THREE.Vector3(-out.z, 0, out.x);
    const van = plan.van;
    const vf = { x: Math.sin(van.heading), z: Math.cos(van.heading) };
    const frame = [
      P(rest.x + along.x * 5, 0, rest.z + along.z * 5),
      P(rest.x - along.x * 5, rest.y, rest.z - along.z * 5),
      P(van.x + vf.x * 2.6, 0, van.z + vf.z * 2.6),
      P(van.x - vf.x * 2.6, 2.4, van.z - vf.z * 2.6),
      corner(1, 1, u.size.height),
      corner(-1, -1, 0),
      head,
      feet,
      ...ladderEnds,
    ];
    const box = new THREE.Box3().setFromPoints(frame.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
    const c = box.getCenter(new THREE.Vector3());
    return { frame, key: [unitTop, head, P(van.x, 2.2, van.z)], focus: P(c.x, c.y * 0.6, c.z), preferredAzimuth: outAz + 0.75 };
  }
  if (group === 'ladder') {
    const frame = [head, feet, ...ladderEnds];
    return { frame, key: [head, chest], focus: P(t.x, t.y + 1.0, t.z), tech: { x: t.x, z: t.z, facing: tech.heading }, preferredAzimuth: outAz + 0.85 };
  }
  if (group === 'ground') {
    const frame = mode === 'detail' ? [head, P(t.x, t.y + 0.9, t.z), ...ladderEnds.slice(0, 1)] : [head, feet, ...ladderEnds];
    return { frame, key: [head, chest], focus: chest, tech: { x: t.x, z: t.z, facing: tech.heading }, preferredAzimuth: tech.heading + Math.PI - 0.9 };
  }
  // On the roof, at the unit: as the ground condenser shots, lifted onto the deck.
  const w = plan.workSpot;
  const sd = u.serviceDir;
  const panel = P(w.x - sd.x * 0.62, deck + 0.75, w.z - sd.z * 0.62);
  const hands = P(w.x - sd.x * 0.35, deck + 0.75, w.z - sd.z * 0.35);
  const side = tech.heading + Math.PI / 2;
  if (mode === 'detail') {
    const frame = [P(w.x, deck + 1.45, w.z), hands, panel, P(panel.x, deck + 1.1, panel.z), P(panel.x, deck + 0.35, panel.z)];
    return { frame, key: [hands, panel], focus: P((hands.x + panel.x) / 2, deck + 0.8, (hands.z + panel.z) / 2), tech: { x: t.x, z: t.z, facing: tech.heading }, preferredAzimuth: side };
  }
  const frame = [head, feet, corner(1, 1, u.size.height), corner(-1, -1, u.size.height), corner(1, -1, 0.02), corner(-1, 1, 0.02)];
  return { frame, key: [P(t.x, t.y + 1.3, t.z), hands, unitTop, panel], focus: P((t.x + u.center.x) / 2, deck + 0.7, (t.z + u.center.z) / 2), tech: { x: t.x, z: t.z, facing: tech.heading }, preferredAzimuth: side };
}

/** The building, the other rooftop units, the van, and plants and poles near the focus. */
export function rooftopObstacles(lot: Lot, plan: RoofPlan, focus: P, mode: ServiceMode): THREE.Box3[] {
  const radius = mode === 'property' ? 60 : 24;
  const neighbours = lot.kind === 'house' ? HOUSE_LOTS.filter((l) => Math.hypot(l.center.x - lot.center.x, l.center.z - lot.center.z) < 45).map((l) => l.id) : [lot.id];
  const out = [...occludersOf(neighbours), ...obstaclesNear(focus.x, focus.z, radius)];
  const deck = plan.spec.deckY + 0.06;
  for (const u of plan.spec.units) {
    // Cabinets stand square to their roof (yaw on a lot axis): the length runs along x or z.
    const alongX = Math.abs(Math.sin(u.yaw)) > 0.5;
    const hx = (alongX ? u.size.length : u.size.width) / 2;
    const hz = (alongX ? u.size.width : u.size.length) / 2;
    const box = new THREE.Box3(new THREE.Vector3(u.center.x - hx, deck, u.center.z - hz), new THREE.Vector3(u.center.x + hx, deck + u.size.height, u.center.z + hz));
    // Every cabinet hides what is behind it, the serviced one included (a camera behind it sees only coil); its box is
    // shrunk a little so the points on its service panel stay outside it.
    if (u.id === plan.unit.id) box.expandByScalar(-0.06);
    out.push(tagOccluder(box, 'wall'));
  }
  const v = plan.van;
  const along = Math.abs(Math.sin(v.heading)) > 0.5;
  out.push(tagOccluder(new THREE.Box3(new THREE.Vector3(v.x - (along ? 2.95 : 1.0), 0, v.z - (along ? 1.0 : 2.95)), new THREE.Vector3(v.x + (along ? 2.95 : 1.0), 2.45, v.z + (along ? 1.0 : 2.95))), 'wall'));
  return out;
}

/** The view as CameraRig flies it: an orbit about the point where the sight line meets the ground. */
function groundOrbit(view: ViewSpec) {
  const cam = cameraPosition(view);
  const s = view.target;
  const t = cam.y / Math.max(1e-3, cam.y - s.y);
  const target = { x: cam.x + (s.x - cam.x) * t, z: cam.z + (s.z - cam.z) * t };
  const distance = Math.hypot(cam.x - target.x, cam.y, cam.z - target.z);
  return { target, azimuth: view.azimuth, elevation: Math.asin(cam.y / distance), distance };
}

export function rooftopServiceCamera(lot: Lot, plan: RoofPlan, mode: ServiceMode, aspect: number, safe: SafeArea = NO_SAFE_AREA, opts: { group: RoofStageGroup; tech: RooftopTech; ladder: LadderPose | null; keepAzimuth?: number }) {
  const t0 = performance.now();
  const attempt = (m: ServiceMode) => {
    const subject = rooftopSubject(plan, m, opts.group, opts.tech, opts.ladder);
    if (opts.keepAzimuth !== undefined) {
      subject.preferredAzimuth = opts.keepAzimuth;
      subject.preferWeight = 2;
    }
    const tune = m === 'property' ? PROPERTY_TUNING : opts.group === 'ladder' ? LADDER_TUNING : opts.group === 'ground' ? GROUND_TUNING : undefined;
    const composeAs: ServiceMode = m === 'property' ? 'property' : opts.group === 'roof' ? m : 'work';
    const view = composeView(subject, rooftopObstacles(lot, plan, subject.focus, m), aspect, composeAs, safe, tune);
    return view ? { view, subject } : null;
  };
  // Detail away from the unit has no close work to show: it frames as Watch Work until he is at the unit.
  const asked: ServiceMode = mode === 'detail' && opts.group !== 'roof' ? 'work' : mode;
  const shot = attempt(asked) ?? (asked === 'detail' ? attempt('work') : null) ?? (asked !== 'property' ? attempt('property') : null);
  if (!shot) return null;
  return {
    command: {
      type: 'focus' as const,
      ...groundOrbit(shot.view),
      targetY: 0,
      orbit: true,
      service: true,
      watch: { lotIds: lot.kind === 'house' ? [lot.id] : [lot.id], points: shot.subject.key },
    },
    report: shot.view.report,
    mode: shot.view.report.mode,
    ms: performance.now() - t0,
  };
}
