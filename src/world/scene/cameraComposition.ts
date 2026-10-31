import * as THREE from 'three';
import { cameraPosition, firstHit, NO_SAFE_AREA, occluderKind, segmentBlocked, verticalFovFor, viewOffsetFor, type OccluderKind, type SafeArea, type V3, type ViewSpec } from './cameraOcclusion';

/**
 * Composition scoring for the service cameras. A view that merely reaches the subject is not
 * enough: the occlusion solver (cameraOcclusion.ts) accepted views where a roof or a blank wall
 * filled half the screen and the technician was a small figure in the corner. Here every candidate
 * view is judged the way a camera operator would judge the frame, inside the part of the screen
 * the HUD and inspector leave free:
 *
 *  - the work (technician, unit, hands, tools) fills a set share of that area and sits near its
 *    centre, the distance being fitted per angle to reach that share;
 *  - a grid of sight rays across the frame measures how much of it is roof, wall, plant, pole,
 *    open sky, and anything standing between the lens and the work (foreground clutter);
 *  - the camera keeps clear of walls, trunks and poles, stays at a low or moderate height, and
 *    sees the technician side-on so his hands, tools and the service panel are not behind his back
 *    or behind the cabinet;
 *  - the key points (hands, panel, unit top...) must all be in plain sight.
 *
 * Candidates are a fixed ring of headings and a few heights, then a small refinement round the best
 * one, so the same request always gives the same shot. The search runs when a view is entered or
 * the layout, job phase or obstacles change, never per frame.
 */

export type ServiceMode = 'property' | 'work' | 'detail';

export interface Subject {
  /** Everything the frame must contain. */
  frame: V3[];
  /** What must be in plain sight (a blocked key point rejects the view). */
  key: V3[];
  /** Points that must stay in the free area and out from under the UI, without being framed (his head when he stands up from the work). */
  clear?: V3[];
  /** The point the camera aims at. */
  focus: V3;
  /** The lead technician and the heading he faces (toward the unit), for the side-on preference. */
  tech?: { x: number; z: number; facing: number };
  /** Heading to prefer among otherwise equal views (the open side of the unit, the street side). */
  preferredAzimuth: number;
  /** Cost per radian away from preferredAzimuth (default 0.08: a tie-break). Raised to keep a moving shot on its heading. */
  preferWeight?: number;
}

interface Rules {
  /** Target share of the free area the subject fills (the larger of its width and height shares). */
  fill: number;
  elevations: number[];
  /** Elevations that cost nothing; outside the band each radian costs `elevationCost`. */
  band: [number, number];
  elevationCost: number;
  minDistance: number;
  maxDistance: number;
  /** Camera-to-technician angle from his facing direction that costs nothing (0 = facing the lens across the unit, π = behind him). */
  side?: [number, number];
  /** Angles beyond this (behind him) are rejected: his body hides the hands and the panel. */
  sideReject?: number;
  /** Scale on the clearance kept from obstacles (0: only a camera inside one is turned down). */
  clearanceScale?: number;
  /** Cost per share of the frame covered by each thing (from the ray grid). */
  weights: Record<Exclude<OccluderKind, 'subject'> | 'background' | 'foreground' | 'sky', number>;
}

const RULES: Record<ServiceMode, Rules> = {
  property: { fill: 0.84, elevations: [0.5, 0.6, 0.72], band: [0.52, 0.68], elevationCost: 2, minDistance: 14, maxDistance: 60, weights: { roof: 0.5, wall: 0.3, plant: 1.6, pole: 2.5, background: 0.1, foreground: 5, sky: 0.5 } },
  work: { fill: 0.56, elevations: [0.24, 0.32, 0.4, 0.5], band: [0.27, 0.44], elevationCost: 3, minDistance: 3.4, maxDistance: 9, side: [0.8, 2.1], sideReject: 2.35, weights: { roof: 4, wall: 2, plant: 3, pole: 3, background: 0.3, foreground: 6, sky: 0.6 } },
  detail: { fill: 0.68, elevations: [0.2, 0.28, 0.36, 0.46], band: [0.22, 0.4], elevationCost: 3, minDistance: 1.9, maxDistance: 5, side: [0.9, 2.0], sideReject: 2.4, weights: { roof: 4, wall: 1.5, plant: 3.5, pole: 3.5, background: 0.3, foreground: 8, sky: 0.6 } },
};

/**
 * Adjustments to a mode's rules for one request: a short landscape screen lets the property shot
 * stand farther off and lower, a walking technician may be followed from any side and farther away.
 * `sideReject: null` turns the from-behind rejection off.
 */
export type RuleTuning = Partial<Omit<Rules, 'sideReject' | 'weights'>> & { sideReject?: number | null };

function rulesFor(mode: ServiceMode, tune?: RuleTuning): Rules {
  if (!tune) return RULES[mode];
  const { sideReject, ...rest } = tune;
  return { ...RULES[mode], ...rest, sideReject: sideReject === null ? undefined : (sideReject ?? RULES[mode].sideReject) };
}

/** Clearance (m) the camera keeps from each kind of obstacle. */
const CLEARANCE: Record<OccluderKind, number> = { wall: 0.9, roof: 0.9, plant: 0.5, pole: 0.4, subject: 0.5 };

export interface CompositionReport {
  mode: ServiceMode;
  /** Share of the free area the subject fills (larger of width and height shares). */
  fill: number;
  /** Subject centre in the free area (-1..1 each way; 0, 0 is the middle). */
  center: [number, number];
  /** Shares of the frame (ray grid) by what the sight line meets first. */
  roof: number;
  /** Walls standing within a few metres behind the work (a blank wall filling the shot). */
  wall: number;
  /** Walls and buildings farther off: scenery, nearly free. */
  background: number;
  plant: number;
  pole: number;
  sky: number;
  /** Share of sight lines stopped by something between the lens and the work. */
  foreground: number;
  azimuth: number;
  elevation: number;
  distance: number;
  /** Camera to technician, from his facing direction (radians); absent without a technician. */
  sideAngle?: number;
  cost: number;
}

export interface Composed extends ViewSpec {
  report: CompositionReport;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const _cam = new THREE.PerspectiveCamera(38, 1, 0.5, 3000);
const _p = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _key = new THREE.Vector3();

/** The free part of the screen in NDC: its centre and half-extent each way. */
function frameOf(safe: SafeArea) {
  const top = safe.top ?? 0;
  const xMax = 1 - 2 * safe.right;
  const yMin = -1 + 2 * safe.bottom;
  const yMax = 1 - 2 * top;
  return { cx: (xMax - 1) / 2, cy: (yMin + yMax) / 2, hx: (xMax + 1) / 2, hy: (yMax - yMin) / 2 };
}

function setLens(aspect: number, safe: SafeArea) {
  _cam.fov = verticalFovFor(aspect);
  _cam.aspect = aspect;
  const W = 1000 * aspect;
  const H = 1000;
  const off = viewOffsetFor(safe, W, H);
  if (off.x || off.y) _cam.setViewOffset(W, H, off.x, off.y, W, H);
  else _cam.clearViewOffset();
  _cam.updateProjectionMatrix();
}

function aim(v: ViewSpec): THREE.Vector3 {
  const pos = cameraPosition(v);
  _cam.position.copy(pos);
  _cam.lookAt(v.target.x, v.target.y, v.target.z);
  _cam.updateMatrixWorld();
  return pos;
}

/** Whether any point lands under one of the UI rectangles to avoid (canvas fractions from the top left). */
function underUi(points: V3[], avoid: SafeArea['avoid']): boolean {
  if (!avoid?.length) return false;
  for (const p of points) {
    _p.set(p.x, p.y, p.z).project(_cam);
    const x = (_p.x + 1) / 2;
    const y = (1 - _p.y) / 2;
    for (const [l, t, r, b] of avoid) if (x > l && x < r && y > t && y < b) return true;
  }
  return false;
}

/** Where the subject lands in the free area: its fill share and centre, or null when part of it falls outside. */
function project(points: V3[], f: ReturnType<typeof frameOf>, margin = 0.94): { fill: number; center: [number, number] } | null {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    _p.set(p.x, p.y, p.z).project(_cam);
    if (_p.z > 1 || _p.z < -1) return null;
    const ux = (_p.x - f.cx) / f.hx;
    const uy = (_p.y - f.cy) / f.hy;
    if (Math.abs(ux) > margin || Math.abs(uy) > margin) return null;
    x0 = Math.min(x0, ux);
    x1 = Math.max(x1, ux);
    y0 = Math.min(y0, uy);
    y1 = Math.max(y1, uy);
  }
  return { fill: Math.max((x1 - x0) / 2, (y1 - y0) / 2), center: [(x0 + x1) / 2, (y0 + y1) / 2] };
}

/** Projected fill at a view, ignoring the frame edges (used to fit the distance). */
function fillAt(v: ViewSpec, points: V3[], f: ReturnType<typeof frameOf>): number | null {
  aim(v);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    _p.set(p.x, p.y, p.z).project(_cam);
    if (_p.z > 1 || _p.z < -1) return null;
    x0 = Math.min(x0, (_p.x - f.cx) / f.hx);
    x1 = Math.max(x1, (_p.x - f.cx) / f.hx);
    y0 = Math.min(y0, (_p.y - f.cy) / f.hy);
    y1 = Math.max(y1, (_p.y - f.cy) / f.hy);
  }
  return Math.max((x1 - x0) / 2, (y1 - y0) / 2);
}

const GRID_COLS = 9;
const GRID_ROWS = 7;
/** Walls hit within this far behind the aim point count as part of the shot, not as scenery. */
const NEAR_WALL = 6;

/** Why a view was turned down (camera placement, framing or a hidden key point). */
export type Rejection = string;

/**
 * Scores one view (lower is better), or says why it is unusable: camera in or against solid
 * geometry, a key point hidden, part of the subject off the free area, or the technician seen
 * from behind. Expects setLens() to have been called for this aspect and safe area.
 */
function evaluate(v: ViewSpec, subject: Subject, boxes: THREE.Box3[], mode: ServiceMode, f: ReturnType<typeof frameOf>, fill: number, strict = true, rules: Rules = RULES[mode], avoid?: SafeArea['avoid']): CompositionReport | Rejection {
  const cam = aim(v);
  if (cam.y < 0.55) return 'camera too low';
  for (const b of boxes) {
    const pad = CLEARANCE[occluderKind(b)] * (rules.clearanceScale ?? 1);
    if (cam.x > b.min.x - pad && cam.x < b.max.x + pad && cam.y > b.min.y - pad && cam.y < b.max.y + pad && cam.z > b.min.z - pad && cam.z < b.max.z + pad) return `camera within clearance of ${occluderKind(b)}`;
  }
  let sideAngle: number | undefined;
  let sideCost = 0;
  if (subject.tech && rules.side) {
    const toCam = Math.atan2(cam.x - subject.tech.x, cam.z - subject.tech.z);
    sideAngle = Math.abs(wrap(toCam - subject.tech.facing));
    if (strict && rules.sideReject !== undefined && sideAngle > rules.sideReject) return 'technician seen from behind';
    sideCost = Math.max(0, rules.side[0] - sideAngle, sideAngle - rules.side[1]) * 1.4;
  }
  const placed = project(subject.frame, f);
  if (!placed) return 'subject not inside the free area';
  // What must stay out from under the UI cards: the key points (head, hands, panel, unit top; for the property shot the unit,
  // technician and van) and, in close shots, the top of his head and where his head goes when he stands up from the work.
  // The rest of the group may pass under a card's corner.
  if (underUi(mode === 'property' ? subject.key : [subject.frame[0], ...subject.key, ...(subject.clear ?? [])], avoid)) return 'subject under the UI';
  if (subject.clear?.length && !project(subject.clear, f, 1)) return 'subject under the UI';
  if (strict) for (const p of subject.key) if (segmentBlocked(cam, _key.set(p.x, p.y, p.z), boxes)) return `key point hidden (${subject.key.indexOf(p)})`;

  // Sight-line grid across the free area.
  const subjectDist = cam.distanceTo(_key.set(v.target.x, v.target.y, v.target.z));
  const counts = { roof: 0, wall: 0, background: 0, plant: 0, pole: 0, sky: 0, foreground: 0 };
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const ux = -0.92 + (1.84 * c) / (GRID_COLS - 1);
      const uy = -0.92 + (1.84 * r) / (GRID_ROWS - 1);
      _p.set(f.cx + ux * f.hx, f.cy + uy * f.hy, 0.5).unproject(_cam);
      _dir.subVectors(_p, cam).normalize();
      const ground = _dir.y < -1e-3 ? -cam.y / _dir.y : Infinity;
      const hit = firstHit(cam, _dir, boxes, Math.min(ground, 90));
      if (!hit) {
        if (ground === Infinity || ground > 90) counts.sky++;
        continue;
      }
      const kind = occluderKind(hit.box);
      // The serviced unit is the subject: rays meeting it are part of the shot, not clutter.
      if (kind === 'subject') continue;
      counts[kind === 'wall' && hit.t > subjectDist + NEAR_WALL ? 'background' : kind]++;
      if (hit.t < subjectDist - 0.6) counts.foreground++;
    }
  }
  const n = GRID_COLS * GRID_ROWS;
  const share = { roof: counts.roof / n, wall: counts.wall / n, background: counts.background / n, plant: counts.plant / n, pole: counts.pole / n, sky: counts.sky / n, foreground: counts.foreground / n };
  const w = rules.weights;
  const elevationCost = Math.max(0, rules.band[0] - v.elevation, v.elevation - rules.band[1]) * rules.elevationCost;
  const cost =
    Math.abs(placed.fill - fill) * 4 +
    Math.abs(placed.center[0]) * 0.8 +
    Math.abs(placed.center[1]) * 0.8 +
    w.roof * share.roof +
    w.wall * share.wall +
    w.background * share.background +
    w.plant * share.plant +
    w.pole * share.pole +
    w.foreground * share.foreground +
    w.sky * Math.max(0, share.sky - 0.15) +
    elevationCost +
    sideCost +
    Math.abs(wrap(v.azimuth - subject.preferredAzimuth)) * (subject.preferWeight ?? 0.08);
  return { mode, fill: placed.fill, center: placed.center, ...share, azimuth: v.azimuth, elevation: v.elevation, distance: v.distance, sideAngle, cost };
}

const AZ_STEPS = 30;

/**
 * Target fill for a mode on this screen shape. On an upright phone the work group (wider than tall)
 * fills the width long before the height, so Watch Work comes a little closer there.
 */
function targetFill(mode: ServiceMode, aspect: number, rules: Rules = RULES[mode]): number {
  return rules.fill * (mode === 'work' && aspect < 1 ? 1.25 : 1);
}

/**
 * Best-composed view of `subject` for a mode, or null when no candidate is usable (the caller
 * falls back: Detail to Watch Work, Watch Work to the occlusion solver).
 */
export function composeView(subject: Subject, boxes: THREE.Box3[], aspect: number, mode: ServiceMode, safe: SafeArea = NO_SAFE_AREA, tune?: RuleTuning, accept?: (v: ViewSpec) => boolean): Composed | null {
  const rules = rulesFor(mode, tune);
  const fill = targetFill(mode, aspect, rules);
  const f = frameOf(safe);
  setLens(aspect, safe);
  let best: Composed | null = null;
  const consider = (azimuth: number, elevation: number, scale = 1) => {
    // Fit the distance so the subject fills the target share at this angle (fill falls off as 1/d).
    const probe = (rules.minDistance + rules.maxDistance) / 2;
    const v: ViewSpec = { target: subject.focus, azimuth: wrap(azimuth), elevation, distance: probe };
    const fill0 = fillAt(v, subject.frame, f);
    if (!fill0) return;
    const fitted = ((probe * fill0) / fill) * scale;
    // The fitted distance first; if a wall or trunk is in the way there, a little closer, then farther
    // (narrow side yards often leave a clear spot either side of the ideal distance).
    for (const k of [1, 0.85, 1.2, 1.45]) {
      v.distance = THREE.MathUtils.clamp(fitted * k, rules.minDistance, rules.maxDistance);
      const report = evaluate(v, subject, boxes, mode, f, fill, true, rules, safe.avoid);
      if (typeof report === 'string') continue;
      if (!best || report.cost < best.report.cost - 1e-9) {
        // An extra condition from the caller (a walking shot must keep working further along his path),
        // checked only for a would-be best. It may aim the shared lens elsewhere, so the lens is reset after.
        if (accept) {
          const ok = accept({ ...v, target: { ...v.target } });
          setLens(aspect, safe);
          if (!ok) continue;
        }
        best = { ...v, report };
      }
      return;
    }
  };
  for (let i = 0; i < AZ_STEPS; i++) for (const el of rules.elevations) consider(subject.preferredAzimuth + (i / AZ_STEPS) * Math.PI * 2, el);
  const coarse = best as Composed | null;
  if (coarse) {
    // Refine round the best: a few degrees either way, a little higher or lower, a little closer or farther.
    for (const dAz of [-0.07, -0.035, 0.035, 0.07]) consider(coarse.azimuth + dAz, coarse.elevation);
    for (const dEl of [-0.04, 0.04]) consider(coarse.azimuth, coarse.elevation + dEl);
    for (const s of [0.92, 1.08]) consider(coarse.azimuth, coarse.elevation, s);
  }
  return best;
}

/**
 * The report for an arbitrary view (tests and before/after comparisons), or why it is unusable.
 * With strict false the key-point and side-on checks are skipped, so an older camera that fails
 * them can still be measured for size, clutter and coverage.
 */
export function scoreView(v: ViewSpec, subject: Subject, boxes: THREE.Box3[], aspect: number, mode: ServiceMode, safe: SafeArea = NO_SAFE_AREA, strict = true, tune?: RuleTuning): CompositionReport | Rejection {
  const f = frameOf(safe);
  setLens(aspect, safe);
  const rules = rulesFor(mode, tune);
  return evaluate(v, subject, boxes, mode, f, targetFill(mode, aspect, rules), strict, rules, safe.avoid);
}
