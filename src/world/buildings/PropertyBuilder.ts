import * as THREE from 'three';
import type { MeshBuilder } from '../assets/pbr';
import { FRONT_LINE, type Poly, type PropertyPlan, type Rect } from '../city/propertyPlan';
import type { GreenbeltPlan } from '../city/greenbelt';

/**
 * Renders a lot's property plan (ground zones, hardscape, structures, edging, driveway, walk and
 * facade accents) into the neighbourhood's shared MeshBuilder, in lot-local space. Everything here
 * is merged per material, so a richer yard costs triangles, not draw calls. Furniture and other
 * repeated props are instanced separately (YardProps); plants by the vegetation layer.
 */

type B = Pick<MeshBuilder, 'add' | 'box'>;

const GROUND_Y = 0.012;

export function polyGeometry(poly: Poly): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape, 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Thin edging along a closed outline: steel band, concrete mow curb or a row of edge stones. */
export function edging(b: B, poly: Poly, y: number, kind: 'steel' | 'curb' | 'stone') {
  const [w, h, mat] = kind === 'steel' ? [0.03, 0.028, 'darkMetal'] : kind === 'curb' ? [0.16, 0.028, 'concrete'] : [0.22, 0.028, 'stoneEdge'];
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05) continue;
    b.box(mat, [len + (kind === 'steel' ? 0 : w * 0.6), h, w], [(x0 + x1) / 2, y + h / 2, (z0 + z1) / 2], [0, -Math.atan2(z1 - z0, x1 - x0), 0]);
  }
}

const cx = (r: Rect) => (r.x0 + r.x1) / 2;
const cz = (r: Rect) => (r.z0 + r.z1) / 2;
const wd = (r: Rect) => r.x1 - r.x0;
const dp = (r: Rect) => r.z1 - r.z0;

function pergola(b: B, r: Rect, mat: string, slatted: boolean) {
  const h = 2.75;
  const postsX = Math.max(2, Math.ceil(wd(r) / 3.2) + 1);
  // Posts stand at the outer edge; the house wall carries the ledger on the inner edge.
  for (let i = 0; i < postsX; i++) {
    const x = r.x0 + 0.1 + (i / (postsX - 1)) * (wd(r) - 0.2);
    b.box(mat, [0.15, h, 0.15], [x, h / 2, r.z1 - 0.1]);
    b.box(mat, [0.24, 0.08, 0.24], [x, 0.04, r.z1 - 0.1]);
  }
  b.box(mat, [wd(r) + 0.4, 0.22, 0.1], [cx(r), h + 0.05, r.z1 - 0.1]); // outer beam
  b.box(mat, [wd(r) + 0.2, 0.18, 0.08], [cx(r), h + 0.05, r.z0 + 0.06]); // ledger on the wall
  if (slatted) {
    // Rafters front to back, then a lighter layer of slats across them.
    for (let x = r.x0; x <= r.x1 + 0.01; x += 0.6) b.box(mat, [0.06, 0.16, dp(r) + 0.5], [x, h + 0.2, cz(r) + 0.2]);
    for (let z = r.z0 + 0.25; z <= r.z1 + 0.4; z += 0.32) b.box(mat, [wd(r) + 0.3, 0.05, 0.06], [cx(r), h + 0.31, z]);
  } else {
    // Solid patio cover: a thin sloped panel with fascia.
    b.box('trim', [wd(r) + 0.5, 0.1, dp(r) + 0.45], [cx(r), h + 0.2, cz(r) + 0.2], [0.04, 0, 0]);
    b.box('trim', [wd(r) + 0.5, 0.2, 0.06], [cx(r), h + 0.12, r.z1 + 0.42]);
  }
}

function pool(b: B, water: Rect) {
  const coping = 0.35;
  // Coping ring, slightly proud of the deck.
  b.box('coping', [wd(water) + coping * 2, 0.08, coping], [cx(water), 0.15, water.z0 - coping / 2]);
  b.box('coping', [wd(water) + coping * 2, 0.08, coping], [cx(water), 0.15, water.z1 + coping / 2]);
  b.box('coping', [coping, 0.08, dp(water)], [water.x0 - coping / 2, 0.15, cz(water)]);
  b.box('coping', [coping, 0.08, dp(water)], [water.x1 + coping / 2, 0.15, cz(water)]);
  // Tile band just under the coping, water a little lower, a shallow sun shelf and entry steps.
  b.add('poolShell', new THREE.PlaneGeometry(wd(water), dp(water)), [cx(water), 0.065, cz(water)], [-Math.PI / 2, 0, 0]);
  b.add('poolWater', new THREE.PlaneGeometry(wd(water) - 0.04, dp(water) - 0.04), [cx(water), 0.09, cz(water)], [-Math.PI / 2, 0, 0]);
  b.box('poolShell', [1.6, 0.02, dp(water) - 0.1], [water.x0 + 0.85, 0.085, cz(water)]);
  for (let i = 0; i < 3; i++) b.box('coping', [0.32, 0.02, 1.2 - i * 0.25], [water.x0 + 1.8 + i * 0.32, 0.08 - i * 0.012, cz(water)]);
}

/** Deck boxes around (not under) the water so the pool reads as recessed. */
function poolDeck(b: B, deck: Rect, water: Rect, mat: string) {
  const t = 0.12;
  const parts: Rect[] = [
    { x0: deck.x0, x1: deck.x1, z0: deck.z0, z1: water.z0 },
    { x0: deck.x0, x1: deck.x1, z0: water.z1, z1: deck.z1 },
    { x0: deck.x0, x1: water.x0, z0: water.z0, z1: water.z1 },
    { x0: water.x1, x1: deck.x1, z0: water.z0, z1: water.z1 },
  ];
  for (const p of parts) if (wd(p) > 0.02 && dp(p) > 0.02) b.box(mat, [wd(p), t, dp(p)], [cx(p), t / 2, cz(p)]);
}

/** A common-area greenbelt in world space: DG base, rock swales with edging, a winding concrete path. */
export function renderGreenbelt(b: B, g: GreenbeltPlan): void {
  const r = g.rect;
  b.add('ground:dg', new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), [(r.x0 + r.x1) / 2, GROUND_Y, (r.z0 + r.z1) / 2], [-Math.PI / 2, 0, 0]);
  for (const p of g.ground) {
    const y = GROUND_Y + 0.004 + p.layer * 0.004;
    b.add(`${p.layer >= 2 ? 'bed' : 'ground'}:${p.mat}`, polyGeometry(p.poly), [0, y, 0]);
    if (p.edge) edging(b, p.poly, y, p.edge);
  }
  for (let i = 0; i < g.path.length - 1; i++) {
    const [x0, z0] = g.path[i];
    const [x1, z1] = g.path[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    b.box('concrete', [len + 0.3, 0.06, 1.8], [(x0 + x1) / 2, 0.03, (z0 + z1) / 2], [0, -Math.atan2(z1 - z0, x1 - x0), 0]);
  }
}

export function renderProperty(b: B, plan: PropertyPlan, lot: { width: number; depth: number }, facadeHooks: { garageFrontZ: number }): void {
  // ---- Ground: base cover for the whole lot, then zones in layers with their edging.
  const band = plan.sideBand;
  b.add(`ground:${plan.baseGround}`, new THREE.PlaneGeometry(lot.width - 0.4, band[1] - band[0]), [0, GROUND_Y, (band[0] + band[1]) / 2], [-Math.PI / 2, 0, 0]);
  for (const g of plan.ground) {
    const y = GROUND_Y + 0.004 + g.layer * 0.004;
    b.add(`${g.layer >= 2 ? 'bed' : 'ground'}:${g.mat}`, polyGeometry(g.poly), [0, y, 0]);
    if (g.edge) edging(b, g.poly, y, g.edge);
  }

  // ---- Hardscape
  const water = plan.structures.find((s) => s.kind === 'pool')?.rect;
  for (const h of plan.hardscape) {
    const mat = h.mat === 'concrete' ? 'concrete' : `hard:${h.mat}`;
    if (h.kind === 'pool-deck' && water) poolDeck(b, h.rect, water, mat);
    else if (h.kind === 'patio') {
      b.box(mat, [wd(h.rect), 0.1, dp(h.rect)], [cx(h.rect), 0.05, cz(h.rect)]);
      // Raised border course around paver and travertine patios.
      if (h.mat === 'pavers' || h.mat === 'travertine') {
        const r = h.rect;
        b.box('concrete', [wd(r) + 0.1, 0.11, 0.18], [cx(r), 0.055, r.z1 - 0.04]);
        b.box('concrete', [0.18, 0.11, dp(r)], [r.x0 + 0.04, 0.055, cz(r)]);
        b.box('concrete', [0.18, 0.11, dp(r)], [r.x1 - 0.04, 0.055, cz(r)]);
      }
    } else b.box(mat, [wd(h.rect), 0.05, dp(h.rect)], [cx(h.rect), 0.03, cz(h.rect)], [0, h.rot ?? 0, 0]);
  }

  // ---- Structures
  for (const s of plan.structures) {
    const r = s.rect;
    switch (s.kind) {
      case 'pergola':
        pergola(b, r, plan.archetype === 'modern-minimal' ? 'darkMetal' : 'pergolaWood', true);
        break;
      case 'patio-cover':
        pergola(b, r, 'trim', false);
        break;
      case 'pool':
        pool(b, r);
        break;
      case 'kitchen':
        // Built-in grill island: stone veneer base, dark counter, stainless grill head.
        b.box('stoneVeneer', [wd(r), 0.86, dp(r)], [cx(r), 0.43, cz(r)]);
        b.box('dark', [wd(r) + 0.08, 0.05, dp(r) + 0.08], [cx(r), 0.885, cz(r)]);
        b.box('metal', [0.8, 0.22, 0.5], [cx(r) - 0.4, 1.02, cz(r)]);
        b.box('darkMetal', [0.6, 0.5, 0.03], [cx(r) - 0.4, 0.45, r.z1 + 0.01]);
        break;
      case 'raised-bed':
        b.box('block', [wd(r), 0.5, dp(r)], [cx(r), 0.25, cz(r)]);
        b.box('trim', [wd(r) + 0.08, 0.05, dp(r) + 0.08], [cx(r), 0.52, cz(r)]);
        b.box('ground:mulch', [wd(r) - 0.3, 0.02, dp(r) - 0.3], [cx(r), 0.53, cz(r)]);
        break;
      case 'utility-box':
        b.box('galvanized', [0.55, 0.8, 0.22], [cx(r), 1.3, r.z0 + 0.11]);
        b.box('galvanized', [0.1, 1.0, 0.08], [cx(r), 0.5, r.z0 + 0.05]);
        break;
      case 'hose-reel':
        b.add('bin', new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), [cx(r), 0.45, cz(r) + 0.05], [Math.PI / 2, 0, 0]);
        b.box('darkMetal', [0.5, 0.06, 0.3], [cx(r), 0.03, cz(r) + 0.05]);
        b.box('copper', [0.03, 0.1, 0.03], [cx(r), 0.7, r.z0 + 0.02]);
        break;
      case 'clothesline':
        for (const x of [r.x0, r.x1]) {
          b.box('metal', [0.06, 1.9, 0.06], [x, 0.95, cz(r)]);
          b.box('metal', [0.04, 0.04, 1.0], [x, 1.85, cz(r)]);
        }
        for (const dz of [-0.4, 0, 0.4]) b.box('white', [wd(r), 0.012, 0.012], [cx(r), 1.83, cz(r) + dz]);
        break;
      case 'seat-wall':
        b.box('stoneVeneer', [wd(r), 0.45, dp(r)], [cx(r), 0.225, cz(r)]);
        b.box('coping', [wd(r) + 0.1, 0.05, dp(r) + 0.1], [cx(r), 0.47, cz(r)]);
        break;
    }
  }

  // ---- Driveway: slab with control joints, optional paver border or ribbon.
  const d = plan.driveway;
  const len = d.frontZ - FRONT_LINE + 0.6;
  const zc = d.frontZ - len / 2 + 0.6;
  const dw = d.x1 - d.x0;
  const dx = (d.x0 + d.x1) / 2;
  b.add(d.mat === 'concrete' ? 'concrete' : `hard:${d.mat}`, new THREE.PlaneGeometry(dw, len), [dx, 0.04, zc], [-Math.PI / 2, 0, 0]);
  for (let i = 1; i <= d.joints; i++) b.box('dark', [dw - 0.1, 0.004, 0.025], [dx, 0.043, d.frontZ - (len * i) / (d.joints + 1) + 0.3]);
  b.box('dark', [0.025, 0.004, len - 0.2], [dx, 0.043, zc]);
  if (d.border === 'pavers') {
    for (const x of [d.x0 + 0.25, d.x1 - 0.25]) b.add('hard:pavers', new THREE.PlaneGeometry(0.5, len), [x, 0.046, zc], [-Math.PI / 2, 0, 0]);
    b.add('hard:pavers', new THREE.PlaneGeometry(dw, 0.6), [dx, 0.047, FRONT_LINE + 1.0], [-Math.PI / 2, 0, 0]);
  } else if (d.border === 'ribbon') {
    b.add('ground:rock-gray', new THREE.PlaneGeometry(0.7, len), [dx, 0.047, zc], [-Math.PI / 2, 0, 0]);
  }

  // ---- Entry walk: continuous slab or stepping pads set in the gravel.
  const w = plan.walkway;
  const walkTop = Math.min(d.frontZ, -5.5) - 1.2;
  const walkLen = walkTop - FRONT_LINE;
  if (w.stepping) {
    for (let z = FRONT_LINE + 0.6; z < walkTop - 0.3; z += 1.0) b.box(w.mat === 'concrete' ? 'concrete' : `hard:${w.mat}`, [1.4, 0.05, 0.7], [w.x, 0.04, z]);
  } else {
    b.add(w.mat === 'concrete' ? 'concrete' : `hard:${w.mat}`, new THREE.PlaneGeometry(1.3, walkLen), [w.x, 0.04, walkTop - walkLen / 2], [-Math.PI / 2, 0, 0]);
    if (w.mat === 'pavers' || w.mat === 'flagstone') for (const s of [-1, 1]) b.box('concrete', [0.1, 0.05, walkLen], [w.x + s * 0.7, 0.03, walkTop - walkLen / 2]);
  }

  // ---- Facade accents chosen by the archetype.
  if (plan.facade.wainscot && plan.style !== 'premium') {
    // Stone veneer pilasters framing the garage door.
    for (const x of [d.x0 - 0.45, d.x1 + 0.45]) b.box('stoneVeneer', [0.5, 1.6, 0.1], [x, 0.8, facadeHooks.garageFrontZ - 0.06]);
  }
}
