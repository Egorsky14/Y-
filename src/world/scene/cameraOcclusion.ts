import * as THREE from 'three';

/**
 * Camera occlusion for close views of a service site. Houses are merged into shared meshes, so
 * occluders are the world-space bounds of their solid parts (walls, roofs, porch posts, garden
 * walls, chimneys...), recorded per lot while the neighbourhood is built (HouseBuilder). A view is
 * clear when the segments from the camera to the subject's key points (technician, unit, panel,
 * tool bag) miss every occluder and the camera itself sits outside all of them.
 *
 * Boxes are conservative (a sloped roof counts as its bounding box), so the solver errs toward
 * views with more clearance rather than views that clip an eave.
 */

export type V3 = { x: number; y: number; z: number };

/**
 * Ground covers and beds, plus the unit's own wall-side services (line set and its cover,
 * disconnect, conduit) and lamps: none of these hide the technician.
 */
const NON_OCCLUDING = /^(ground|bed|lawn|gravel|mulch|water|stripe|stoneEdge|dark|galvanized|copper|insulation|unitCabinet|lamp)(:|$)/;
/** Parts shorter than this (paving, edging, slabs) never block a camera looking down at a person. */
const MIN_HEIGHT = 0.3;
/** Pipes and rods thinner than this (downspouts, conduit) only hide a sliver; porch posts (0.22 m) count. */
const MIN_WIDTH = 0.16;

const registry = new Map<string, THREE.Box3[]>();

/**
 * What an occluder is, for composition scoring (cameraComposition.ts): a roof filling the frame or
 * a palm trunk in front of the lens costs more than a wall behind the work. 'subject' is the unit being
 * serviced: it hides the hands from the wrong side but is never clutter. Untagged boxes are walls.
 */
export type OccluderKind = 'wall' | 'roof' | 'plant' | 'pole' | 'subject';
const kinds = new WeakMap<THREE.Box3, OccluderKind>();

export function tagOccluder(box: THREE.Box3, kind: OccluderKind): THREE.Box3 {
  kinds.set(box, kind);
  return box;
}

export function occluderKind(box: THREE.Box3): OccluderKind {
  return kinds.get(box) ?? 'wall';
}

/** Keeps only parts that can block a view: tall and wide enough, and not a ground cover or the unit's own services. */
export function solidOccluders(parts: { material: string; box: THREE.Box3 }[]): THREE.Box3[] {
  return parts
    .filter((p) => {
      const b = p.box;
      return !NON_OCCLUDING.test(p.material) && b.max.y - b.min.y >= MIN_HEIGHT && b.max.y > 0.45 && Math.max(b.max.x - b.min.x, b.max.z - b.min.z) >= MIN_WIDTH;
    })
    .map((p) => (/^(roof|roofCap|solar)(:|$)/.test(p.material) ? tagOccluder(p.box, 'roof') : p.box));
}

/** Nearest box a ray from `origin` along unit `dir` enters within `maxDist`, with the distance. */
export function firstHit(origin: THREE.Vector3, dir: THREE.Vector3, boxes: THREE.Box3[], maxDist: number): { box: THREE.Box3; t: number } | null {
  _ray.set(origin, dir);
  let best: { box: THREE.Box3; t: number } | null = null;
  for (const box of boxes) {
    if (box.containsPoint(origin)) return { box, t: 0 };
    const hit = _ray.intersectBox(box, _hit);
    if (!hit) continue;
    const t = hit.distanceTo(origin);
    if (t < maxDist && (!best || t < best.t)) best = { box, t };
  }
  return best;
}

export function registerOccluders(lotId: string, boxes: THREE.Box3[]): void {
  registry.set(lotId, boxes);
}

export function registeredOccluders(lotId: string): THREE.Box3[] | undefined {
  return registry.get(lotId);
}

/**
 * Same vertical field of view rule as CameraRig: 38° on landscape screens; portrait widens the
 * vertical angle (to at most 75°) so the horizontal view stays close to a landscape screen's.
 */
export function verticalFovFor(aspect: number): number {
  return aspect >= 1 ? 38 : Math.min(75, THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(19)) * 1.6) / aspect)));
}

const _dir = new THREE.Vector3();
const _ray = new THREE.Ray();
const _hit = new THREE.Vector3();

/** True when the segment from `a` to `b` passes through any box (ends shortened by `margin`). */
export function segmentBlocked(a: THREE.Vector3, b: THREE.Vector3, boxes: THREE.Box3[], margin = 0.12): boolean {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 1e-6) return false;
  _dir.divideScalar(len);
  _ray.set(a, _dir);
  for (const box of boxes) {
    // The subject's own point may sit on a part's surface (a hand on a wall-mounted disconnect): ignore boxes holding the end point.
    if (box.containsPoint(b)) continue;
    const hit = _ray.intersectBox(box, _hit);
    if (hit && hit.distanceTo(a) < len - margin && hit.distanceTo(a) > 0) return true;
    if (box.containsPoint(a)) return true;
  }
  return false;
}

/** The camera itself is inside (or within `pad` of) solid geometry. */
export function insideOccluder(p: THREE.Vector3, boxes: THREE.Box3[], pad = 0.35): boolean {
  for (const box of boxes) if (p.x > box.min.x - pad && p.x < box.max.x + pad && p.y > box.min.y - pad && p.y < box.max.y + pad && p.z > box.min.z - pad && p.z < box.max.z + pad) return true;
  return false;
}

export interface ViewSpec {
  target: V3;
  azimuth: number;
  elevation: number;
  distance: number;
}

export function cameraPosition(v: ViewSpec): THREE.Vector3 {
  return new THREE.Vector3(
    v.target.x + Math.sin(v.azimuth) * Math.cos(v.elevation) * v.distance,
    v.target.y + Math.sin(v.elevation) * v.distance,
    v.target.z + Math.cos(v.azimuth) * Math.cos(v.elevation) * v.distance,
  );
}

/** Fraction of key points the camera sees (1 = every point clear); 0 when the camera is inside geometry. */
export function visibility(v: ViewSpec, points: V3[], boxes: THREE.Box3[]): number {
  const cam = cameraPosition(v);
  // A metre of clearance round the camera keeps walls and eaves out of the foreground, not just out of the lens.
  if (cam.y < 0.6 || insideOccluder(cam, boxes, 1.0)) return 0;
  let seen = 0;
  for (const p of points) if (!segmentBlocked(cam, new THREE.Vector3(p.x, p.y, p.z), boxes)) seen++;
  return seen / points.length;
}

/**
 * Part of the screen covered by UI, as fractions of the canvas: the inspector panel on the right
 * (or its bottom sheet on an upright phone) and the top HUD bar. CameraRig shifts the projection
 * centre into the free area (setViewOffset), so the orbit target appears in the middle of what
 * the player can see.
 */
export interface SafeArea {
  right: number;
  bottom: number;
  /** Top HUD bar; optional so older callers (right/bottom only) keep working. */
  top?: number;
  /**
   * Smaller UI pieces inside the free area that the subject must not sit under (a collapsed
   * inspector card, the camera bar under the HUD), as canvas fractions [left, top, right, bottom]
   * measured from the top-left corner.
   */
  avoid?: [number, number, number, number][];
}

export const NO_SAFE_AREA: SafeArea = { right: 0, bottom: 0, top: 0 };

/** The view offset (pixels) CameraRig applies for a covered area: to the centre of the free part. */
export function viewOffsetFor(safe: SafeArea, width: number, height: number): { x: number; y: number } {
  return { x: (safe.right * width) / 2, y: ((safe.bottom - (safe.top ?? 0)) * height) / 2 };
}

/**
 * Every key point projects inside the free part of the screen (with a margin), using the same
 * field of view and view offset as CameraRig for this aspect and covered area.
 */
export function inFrame(v: ViewSpec, points: V3[], aspect: number, margin = 0.9, safe: SafeArea = NO_SAFE_AREA): boolean {
  const cam = new THREE.PerspectiveCamera(verticalFovFor(aspect), aspect, 1, 3000);
  const W = 1000 * aspect;
  const H = 1000;
  const off = viewOffsetFor(safe, W, H);
  if (off.x || off.y) cam.setViewOffset(W, H, off.x, off.y, W, H);
  cam.position.copy(cameraPosition(v));
  cam.lookAt(v.target.x, v.target.y, v.target.z);
  cam.updateMatrixWorld();
  // Free area in NDC: x from -1 to 1 - 2·right, y from -1 + 2·bottom to 1 - 2·top.
  const top = safe.top ?? 0;
  const xMax = 1 - 2 * safe.right;
  const yMin = -1 + 2 * safe.bottom;
  const yMax = 1 - 2 * top;
  const cx = (xMax - 1) / 2;
  const cy = (yMin + yMax) / 2;
  const hx = (1 - safe.right) * margin;
  const hy = (1 - safe.bottom - top) * margin;
  for (const p of points) {
    const n = new THREE.Vector3(p.x, p.y, p.z).project(cam);
    if (Math.abs(n.x - cx) > hx || Math.abs(n.y - cy) > hy || n.z > 1) return false;
  }
  return true;
}

/** Screen points (NDC) across the lower part of the free area, sampled for foreground clutter. */
const FOREGROUND_SAMPLES: [number, number][] = [[-0.6, -0.75], [0, -0.75], [0.6, -0.75], [-0.6, -0.35], [0, -0.35], [0.6, -0.35]];

/**
 * The lower part of the frame shows ground, not a wall or eave right in front of the lens: rays
 * through sample points across it must reach the ground without hitting solid geometry (at most
 * `allowed` may). Sight lines to the subject can all pass over a garden wall that still fills half
 * the screen; this catches that.
 */
export function foregroundClear(v: ViewSpec, boxes: THREE.Box3[], aspect: number, safe: SafeArea = NO_SAFE_AREA, allowed = 1): boolean {
  const cam = new THREE.PerspectiveCamera(verticalFovFor(aspect), aspect, 1, 3000);
  const W = 1000 * aspect;
  const H = 1000;
  const off = viewOffsetFor(safe, W, H);
  if (off.x || off.y) cam.setViewOffset(W, H, off.x, off.y, W, H);
  cam.position.copy(cameraPosition(v));
  cam.lookAt(v.target.x, v.target.y, v.target.z);
  cam.updateMatrixWorld();
  const top = safe.top ?? 0;
  const xMax = 1 - 2 * safe.right;
  const yMin = -1 + 2 * safe.bottom;
  const yMax = 1 - 2 * top;
  let blocked = 0;
  const p = new THREE.Vector3();
  for (const [sx, sy] of FOREGROUND_SAMPLES) {
    // Map the sample into the free area, then unproject to a ray and follow it to the ground.
    p.set(-1 + ((sx + 1) / 2) * (xMax + 1), yMin + ((sy + 1) / 2) * (yMax - yMin), 0.5).unproject(cam);
    const dir = p.sub(cam.position).normalize();
    if (dir.y >= -1e-3) continue;
    const ground = cam.position.clone().addScaledVector(dir, -cam.position.y / dir.y);
    if (segmentBlocked(cam.position, ground, boxes, 0.3)) blocked++;
  }
  return blocked <= allowed;
}

export interface Solved extends ViewSpec {
  /** Every key point is visible. */
  clear: boolean;
  visible: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Nearest clear view to `preferred`: azimuth steps of 10° alternating either side, then a little
 * higher, then a little closer. The cheapest fully clear, fully framed candidate wins; if none is
 * clear, the one that sees most. Deterministic, so the same request always gives the same view
 * (no oscillation between frames).
 */
export function solveClearView(preferred: ViewSpec, points: V3[], boxes: THREE.Box3[], aspect: number, opts: { minDistance?: number; maxElevation?: number; safe?: SafeArea } = {}): Solved {
  const minDistance = opts.minDistance ?? 5.2;
  const maxElevation = opts.maxElevation ?? 1.05;
  let best: Solved | null = null;
  let bestCost = Infinity;
  let fallback: Solved | null = null;
  const lifts = [0, 0.14, 0.28].map((d) => Math.min(maxElevation, preferred.elevation + d));
  const scales = [1, 0.85];
  for (let step = 0; step <= 18; step++) {
    for (const side of step === 0 ? [0] : [1, -1]) {
      const dAz = side * step * THREE.MathUtils.degToRad(10);
      for (const elevation of lifts) {
        for (const s of scales) {
          const distance = Math.max(minDistance, preferred.distance * s);
          const v: ViewSpec = { target: preferred.target, azimuth: wrap(preferred.azimuth + dAz), elevation, distance };
          const cost = Math.abs(dAz) + (elevation - preferred.elevation) * 2.0 + (1 - distance / preferred.distance) * 0.6;
          if (cost >= bestCost) continue;
          const seen = visibility(v, points, boxes);
          if (seen === 1 && inFrame(v, points, aspect, 0.9, opts.safe) && foregroundClear(v, boxes, aspect, opts.safe)) {
            best = { ...v, clear: true, visible: 1 };
            bestCost = cost;
          } else if (!fallback || seen > fallback.visible) {
            fallback = { ...v, clear: false, visible: seen };
          }
        }
      }
    }
    // Nothing cheaper can exist beyond this azimuth step.
    if (best && THREE.MathUtils.degToRad(10) * (step + 1) >= bestCost) break;
  }
  return best ?? fallback ?? { ...preferred, clear: false, visible: 0 };
}
