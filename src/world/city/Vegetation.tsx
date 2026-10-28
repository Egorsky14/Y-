import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HOUSE_LOTS, HQ_LOT, PARK_LOT, ROAD_WIDTH, SIDEWALK_WIDTH, STREETS, WORLD_HALF, type Lot } from '@/game/world/cityLayout';
import { makeDecoRng } from '../assets/random';
import { yardPlan, type Species } from './yardLayout';
import { greenbelts } from './greenbelt';
import { useApp } from '@/app/store';

/**
 * All vegetation in the world is drawn with one InstancedMesh per species. Species geometry is
 * built once with vertex colors; instances add a per-instance tint, rotation and scale.
 */

const FACING_ROTATION: Record<Lot['facing'], number> = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };

function colored(geo: THREE.BufferGeometry, color: THREE.Color, jitter = 0.08, rnd: () => number = Math.random): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 + (rnd() - 0.5) * jitter * 2;
    colors[i * 3] = color.r * k;
    colors[i * 3 + 1] = color.g * k;
    colors[i * 3 + 2] = color.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(key)) g.deleteAttribute(key);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

function jittered(geo: THREE.BufferGeometry, amount: number, rnd: () => number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  // Jitter consistently per spatial position so shared vertices stay welded.
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let d = seen.get(key);
    if (!d) {
      d = [(rnd() - 0.5) * amount, (rnd() - 0.5) * amount, (rnd() - 0.5) * amount];
      seen.set(key, d);
    }
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A smooth, lumpy mass (leaf cluster, shrub or boulder): a subdivided icosphere displaced by
 * low-frequency noise along its normals, welded so normals are smooth, and vertex-shaded darker
 * underneath and toward the core so it reads as volume under the sun rather than faceted plastic.
 */
function mass(rnd: () => number, radius: number, position: [number, number, number], scale: [number, number, number], color: THREE.Color, { detail = 2, lumps = 0.22, shade = 0.42, jitter = 0.07, faceted = false } = {}): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = BGU.mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  const f = [1.6 + rnd() * 1.2, 1.4 + rnd() * 1.4, 1.5 + rnd() * 1.3];
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * f[0] * 2.1 + ph[0]) * Math.sin(v.y * f[1] * 2.3 + ph[1]) * Math.sin(v.z * f[2] * 1.9 + ph[2]) + 0.5 * Math.sin((v.x + v.z) * 5.1 + ph[1]) * Math.sin(v.y * 4.3 + ph[2]);
    v.multiplyScalar(radius * (1 + n * lumps));
    v.set(v.x * scale[0], v.y * scale[1], v.z * scale[2]);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const up = p.getY(i) / (radius * scale[1]); // -1 underside → 1 crown
    const k = (1 - shade) + shade * (0.5 + 0.5 * up) + (rnd() - 0.5) * jitter * 2;
    colors[i * 3] = color.r * k;
    colors[i * 3 + 1] = color.g * k;
    colors[i * 3 + 2] = color.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.translate(...position);
  // Stone keeps chiselled facets: per-face normals from the same welded, displaced surface.
  if (faceted) {
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    return flat;
  }
  return g.toNonIndexed();
}

function transformed(geo: THREE.BufferGeometry, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
  geo.applyMatrix4(m);
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = BGU.mergeGeometries(parts, false);
  if (!merged) throw new Error('vegetation merge failed');
  return merged;
}

/** Pinnate (feather) frond for date palms: an arching rachis with paired leaflets held in a V. */
function pinnateFrond(rnd: () => number, length: number, color: THREE.Color): THREE.BufferGeometry {
  const positions: number[] = [];
  const push = (v: THREE.Vector3) => positions.push(v.x, v.y, v.z);
  const spine = (t: number) => new THREE.Vector3(0, 0.55 * t - 1.35 * t * t, t * length);
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const a = spine(i / segs);
    const b = spine((i + 1) / segs);
    const r = 0.028 * (1 - i / segs) + 0.01;
    push(a.clone().add(new THREE.Vector3(-r, 0, 0))); push(a.clone().add(new THREE.Vector3(r, 0, 0))); push(b.clone().add(new THREE.Vector3(r, 0, 0)));
    push(a.clone().add(new THREE.Vector3(-r, 0, 0))); push(b.clone().add(new THREE.Vector3(r, 0, 0))); push(b.clone().add(new THREE.Vector3(-r, 0, 0)));
  }
  // Many narrow leaflets, longest mid-frond, alternately lifted and dropped so the frond reads as
  // a feathery V in section rather than a sawtooth blade.
  const pairs = 34;
  for (let i = 1; i <= pairs; i++) {
    const t = 0.1 + (i / pairs) * 0.88;
    const base = spine(t);
    const dir = spine(Math.min(1, t + 0.02)).sub(spine(t)).normalize();
    const len = 0.68 * (1 - Math.abs(t - 0.5) * 1.1) + 0.14;
    const lift = i % 2 === 0 ? 0.62 : 0.3;
    for (const side of [-1, 1]) {
      const out = new THREE.Vector3(side, lift, 0).normalize().multiplyScalar(len);
      const fwd = dir.clone().multiplyScalar(len * 0.62);
      const tip = base.clone().add(out).add(fwd).add(new THREE.Vector3(0, -0.22 * len, 0));
      const w = 0.032;
      const b0 = base.clone().add(dir.clone().multiplyScalar(-w));
      const b1 = base.clone().add(dir.clone().multiplyScalar(w));
      if (side > 0) { push(b0); push(b1); push(tip); } else { push(b1); push(b0); push(tip); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return colored(g, color, 0.1, rnd);
}

/** Detail level of a species mesh: `far` keeps the silhouette with fewer blade segments and trunk facets. */
type Lod = 'near' | 'far';

/** Fan (costapalmate) frond for Mexican fan palms: petiole, then radiating blade segments with drooping tips. */
function fanFrond(rnd: () => number, color: THREE.Color, dead = false, lod: Lod = 'near'): THREE.BufferGeometry {
  const positions: number[] = [];
  const push = (v: THREE.Vector3) => positions.push(v.x, v.y, v.z);
  const petiole = 1.1;
  for (const [a, b, r] of [[0, petiole, 0.03]] as [number, number, number][]) {
    push(new THREE.Vector3(-r, 0, a)); push(new THREE.Vector3(r, 0, a)); push(new THREE.Vector3(r, 0, b));
    push(new THREE.Vector3(-r, 0, a)); push(new THREE.Vector3(r, 0, b)); push(new THREE.Vector3(-r, 0, b));
  }
  const far = lod === 'far';
  const segments = dead ? 11 : 15;
  const spread = dead ? 1.9 : 2.5;
  for (let i = 0; i < segments; i++) {
    const a = -spread / 2 + (i / (segments - 1)) * spread;
    const len = 1.5 + (rnd() - 0.5) * 0.3 - Math.abs(a) * 0.12;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    // Far fronds keep every blade (the fan outline) and bend each blade once instead of twice.
    const pieces = far ? 2 : 3;
    let prev = new THREE.Vector3(0, 0, petiole);
    let prevW = 0.17;
    for (let k = 1; k <= pieces; k++) {
      const t = k / pieces;
      const droop = dead ? -t * t * 0.9 : -t * t * 0.55;
      const next = new THREE.Vector3(0, droop, petiole).add(dir.clone().multiplyScalar(len * t));
      const w = 0.17 * (1 - t * 0.7);
      const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      const p0 = prev.clone().add(side.clone().multiplyScalar(-prevW / 2));
      const p1 = prev.clone().add(side.clone().multiplyScalar(prevW / 2));
      const p2 = next.clone().add(side.clone().multiplyScalar(w / 2));
      const p3 = next.clone().add(side.clone().multiplyScalar(-w / 2));
      push(p0); push(p1); push(p2);
      push(p0); push(p2); push(p3);
      prev = next;
      prevW = w;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return colored(g, color, dead ? 0.08 : 0.14, rnd);
}

/**
 * Drops the end caps of a colored (non-indexed) cylinder. The caps of stacked trunk segments and
 * boot rings sit inside the trunk and are never seen. Coloring runs on the full cylinder first so
 * the random stream, and with it every frond placed after the trunk, is unchanged.
 */
function torsoOnly(g: THREE.BufferGeometry, radial: number, heightSegments = 1): THREE.BufferGeometry {
  const keep = radial * heightSegments * 6;
  for (const key of Object.keys(g.attributes)) {
    const a = g.attributes[key] as THREE.BufferAttribute;
    g.setAttribute(key, new THREE.BufferAttribute((a.array as Float32Array).slice(0, keep * a.itemSize), a.itemSize));
  }
  return g;
}

/** Tapered trunk with leaf-boot rings in the upper part and a flared base. */
function palmTrunk(rnd: () => number, height: number, r0: number, r1: number, lean: number, color: THREE.Color, boots: boolean, lod: Lod = 'near'): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const far = lod === 'far';
  const segments = far ? 6 : 10;
  const radial = far ? 7 : 12;
  const bootRadial = far ? 6 : 8;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const ra = r0 + (r1 - r0) * t0;
    const rb = r0 + (r1 - r0) * t1;
    const seg = new THREE.CylinderGeometry(rb, ra, height / segments + 0.02, radial);
    parts.push(torsoOnly(colored(transformed(seg, [lean * (t0 + 0.05), (i + 0.5) * (height / segments), 0]), color, 0.12, rnd), radial));
    if (boots && t0 > 0.45) {
      // Two offset boot rings per segment: the criss-cross leaf-base pattern of a fan palm trunk
      for (const f of far ? [0.5] : [0.25, 0.75]) {
        const y = (i + f) * (height / segments);
        const r = ra + 0.06;
        parts.push(torsoOnly(colored(transformed(new THREE.CylinderGeometry(r * 0.94, r, far ? 0.22 : 0.16, bootRadial, 1), [lean * (t0 + f / segments), y, 0], [0, f * 0.4, 0]), color.clone().multiplyScalar(0.9), 0.1, rnd), bootRadial));
      }
    }
  }
  parts.push(torsoOnly(colored(transformed(new THREE.CylinderGeometry(r0 + 0.02, r0 + 0.14, 0.3, radial), [0, 0.15, 0]), color.clone().multiplyScalar(0.85), 0.1, rnd), radial));
  return parts;
}

/** Frond placements of the fan-palm crown, recorded by the near build so the far build matches it. */
let fanCrown: { pitch: number; yaw: number; ring: number; dead: boolean }[] | null = null;

function fanPalm(lod: Lod): THREE.BufferGeometry {
  // Mexican fan palm: slender trunk, round crown of fan fronds, a skirt of dead fronds.
  const rnd = makeDecoRng('palm'.length * 977 + 13);
  const h = 8.5;
  const lean = 0.3;
  const parts = palmTrunk(rnd, h, 0.3, 0.22, lean, new THREE.Color('#8f7556'), true, lod);
  const top = new THREE.Vector3(lean * 1.05, h, 0);
  if (lod === 'far') {
    // Same crown as the near mesh (placements recorded there), coarser fronds and trunk.
    if (!fanCrown) fanPalm('near');
    for (const f of fanCrown!) {
      const color = new THREE.Color(f.dead ? '#a08650' : f.ring === 2 ? '#557c3a' : '#6a9046');
      parts.push(transformed(fanFrond(rnd, color, f.dead, 'far'), [top.x, top.y + (f.dead ? -0.35 : 0.15), top.z], [f.pitch, f.yaw, 0]));
    }
    parts.push(colored(transformed(new THREE.SphereGeometry(0.4, 6, 4), [top.x, top.y, top.z]), new THREE.Color('#6b5a3e'), 0.1, rnd));
    return merge(parts);
  }
  const crown: NonNullable<typeof fanCrown> = [];
  const fronds = 17;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rnd() * 0.25;
    const ring = i % 3; // inner fronds stand up, outer droop
    const pitch = ring === 0 ? -0.55 + rnd() * 0.2 : ring === 1 ? -0.05 + rnd() * 0.25 : 0.5 + rnd() * 0.35;
    const f = fanFrond(rnd, new THREE.Color(ring === 2 ? '#557c3a' : '#6a9046'));
    parts.push(transformed(f, [top.x, top.y + 0.15, top.z], [pitch, a, 0]));
    crown.push({ pitch, yaw: a, ring, dead: false });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const f = fanFrond(rnd, new THREE.Color('#a08650'), true);
    const pitch = 1.75 + rnd() * 0.25;
    parts.push(transformed(f, [top.x, top.y - 0.35, top.z], [pitch, a, 0]));
    crown.push({ pitch, yaw: a, ring: 3, dead: true });
  }
  parts.push(colored(transformed(new THREE.SphereGeometry(0.4, 8, 6), [top.x, top.y, top.z]), new THREE.Color('#6b5a3e'), 0.1, rnd));
  fanCrown = crown;
  return merge(parts);
}

function buildSpecies(species: Species): THREE.BufferGeometry {
  const rnd = makeDecoRng(species.length * 977 + 13);
  switch (species) {
    case 'palm':
      return fanPalm('near');
    case 'date-palm': {
      // Canary / date palm: thick patterned trunk, dense crown of arching pinnate fronds.
      const h = 5.5;
      const parts = palmTrunk(rnd, h, 0.55, 0.45, 0.1, new THREE.Color('#7f6a4c'), false);
      for (let i = 0; i < 14; i++) {
        const y = 0.6 + (i / 14) * (h - 1.0);
        const a = i * 2.4;
        parts.push(colored(transformed(new THREE.BoxGeometry(0.28, 0.14, 0.2), [Math.cos(a) * 0.5, y, Math.sin(a) * 0.5], [0, -a, 0.4]), new THREE.Color('#6d5a40'), 0.1, rnd));
      }
      const top = new THREE.Vector3(0.1, h, 0);
      const fronds = 22;
      for (let i = 0; i < fronds; i++) {
        const a = (i / fronds) * Math.PI * 2 + rnd() * 0.2;
        const ring = i % 3;
        const pitch = ring === 0 ? -0.7 + rnd() * 0.2 : ring === 1 ? -0.2 + rnd() * 0.25 : 0.35 + rnd() * 0.3;
        const f = pinnateFrond(rnd, 3.4 + rnd() * 0.6, new THREE.Color(ring === 2 ? '#4c7536' : '#5c8840'));
        parts.push(transformed(f, [top.x, top.y + 0.2, top.z], [pitch, a, 0]));
      }
      parts.push(colored(transformed(new THREE.SphereGeometry(0.55, 8, 6), [top.x, top.y + 0.1, top.z]), new THREE.Color('#5e4d35'), 0.1, rnd));
      return merge(parts);
    }
    case 'mesquite':
    case 'olive': {
      const parts: THREE.BufferGeometry[] = [];
      const leaf = species === 'olive' ? new THREE.Color('#8a9a70') : new THREE.Color('#6a8743');
      const trunkColor = new THREE.Color(species === 'olive' ? '#7a6652' : '#6d5438');
      parts.push(colored(transformed(new THREE.CylinderGeometry(0.16, 0.26, 2.2, 8), [0, 1.1, 0], [0, 0, 0.08]), trunkColor, 0.1, rnd));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        parts.push(colored(transformed(new THREE.CylinderGeometry(0.07, 0.12, 1.6, 6), [Math.cos(a) * 0.5, 2.7, Math.sin(a) * 0.5], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]), trunkColor, 0.1, rnd));
      }
      const blobs: [number, number, number, number][] = [[0, 3.8, 0, 1.6], [1.1, 3.4, 0.4, 1.2], [-1.0, 3.5, -0.5, 1.1], [0.3, 3.2, 1.1, 1.0], [-0.3, 3.3, -1.1, 0.95], [0.6, 4.4, -0.3, 1.0]];
      for (const [x, y, z, r] of blobs) parts.push(mass(rnd, r, [x, y, z], [1, 0.82, 1], leaf.clone().offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.04), { detail: r >= 1.5 ? 2 : 1, lumps: 0.2, shade: 0.5, jitter: 0.06 }));
      return merge(parts);
    }
    case 'shrub-sage':
    case 'shrub-green':
    case 'shrub-red': {
      const color = species === 'shrub-sage' ? new THREE.Color('#a0aa8c') : species === 'shrub-red' ? new THREE.Color('#717d4a') : new THREE.Color('#62803f');
      const parts = [mass(rnd, 0.62, [0.1, 0.44, 0.05], [1.2, 0.78, 1.05], color, { detail: 1, lumps: 0.26, shade: 0.5 })];
      if (species === 'shrub-red') for (let i = 0; i < 6; i++) parts.push(colored(transformed(new THREE.ConeGeometry(0.03, 0.9, 4), [(rnd() - 0.5) * 0.6, 0.9, (rnd() - 0.5) * 0.6], [(rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5]), new THREE.Color('#c84b3a'), 0.1, rnd));
      return merge(parts);
    }
    case 'agave': {
      const parts: THREE.BufferGeometry[] = [];
      const leaves = 14;
      for (let i = 0; i < leaves; i++) {
        const a = (i / leaves) * Math.PI * 2;
        const tilt = 0.55 + (i % 2) * 0.35;
        const len = 0.9 + (i % 3) * 0.15;
        const g = new THREE.ConeGeometry(0.11, len, 4, 1, true);
        g.translate(0, len / 2, 0);
        parts.push(colored(transformed(g, [0, 0.05, 0], [tilt * Math.cos(a), 0, tilt * Math.sin(a)]), new THREE.Color('#7fa98a'), 0.1, rnd));
      }
      parts.push(colored(transformed(new THREE.ConeGeometry(0.1, 0.7, 4), [0, 0.4, 0]), new THREE.Color('#8ab596'), 0.05, rnd));
      return merge(parts);
    }
    case 'flower-pink':
    case 'flower-yellow': {
      const bloom = species === 'flower-pink' ? new THREE.Color('#e46aa7') : new THREE.Color('#f2c230');
      const parts = [mass(rnd, 0.45, [0, 0.36, 0], [1, 0.75, 1], new THREE.Color('#567a3a'), { detail: 1, lumps: 0.15, shade: 0.45 })];
      for (let i = 0; i < 6; i++) parts.push(colored(transformed(new THREE.OctahedronGeometry(0.09, 0), [(rnd() - 0.5) * 0.7, 0.55 + rnd() * 0.25, (rnd() - 0.5) * 0.7]), bloom, 0.08, rnd));
      return merge(parts);
    }
    case 'barrel-cactus': {
      const parts = [colored(jittered(transformed(new THREE.SphereGeometry(0.38, 7, 5), [0, 0.36, 0], [0, 0, 0], [1, 0.9, 1]), 0.05, rnd), new THREE.Color('#4e7f3c'), 0.08, rnd)];
      parts.push(colored(transformed(new THREE.TorusGeometry(0.16, 0.05, 3, 6), [0, 0.68, 0], [Math.PI / 2, 0, 0]), new THREE.Color('#e0b24a'), 0.05, rnd));
      return merge(parts);
    }
    case 'palo-verde': {
      // Blue palo verde: smooth green trunk splitting low into several leaning stems, an airy
      // spreading canopy of small yellow-green clumps.
      const parts: THREE.BufferGeometry[] = [];
      const bark = new THREE.Color('#7f9a52');
      parts.push(colored(transformed(new THREE.CylinderGeometry(0.11, 0.17, 1.1, 7), [0, 0.55, 0]), bark, 0.08, rnd));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        parts.push(colored(transformed(new THREE.CylinderGeometry(0.05, 0.09, 1.9, 6), [Math.cos(a) * 0.45, 1.75, Math.sin(a) * 0.45], [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55]), bark, 0.08, rnd));
      }
      const leaf = new THREE.Color('#9db35a');
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2;
        const d = 0.6 + rnd() * 1.4;
        parts.push(mass(rnd, 0.55 + rnd() * 0.35, [Math.cos(a) * d, 2.6 + rnd() * 0.7, Math.sin(a) * d], [1.2, 0.55, 1.2], leaf.clone().offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.06), { detail: 1, lumps: 0.3, shade: 0.45, jitter: 0.06 }));
      }
      return merge(parts);
    }
    case 'cypress': {
      // Italian cypress: a tall narrow column, slightly tapered, darker at the base.
      const parts = [colored(transformed(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6), [0, 0.3, 0]), new THREE.Color('#5a4632'), 0.05, rnd)];
      parts.push(mass(rnd, 0.6, [0, 2.5, 0], [0.85, 3.6, 0.85], new THREE.Color('#3f5a32'), { detail: 2, lumps: 0.12, shade: 0.5, jitter: 0.05 }));
      return merge(parts);
    }
    case 'yucca': {
      // Yucca: a short shaggy trunk with a spiky rosette of stiff blue-green blades on top.
      const parts = [colored(transformed(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 7), [0, 0.45, 0]), new THREE.Color('#8a7556'), 0.1, rnd)];
      const blades = 22;
      for (let i = 0; i < blades; i++) {
        const a = (i / blades) * Math.PI * 2 + rnd() * 0.2;
        const tilt = 0.25 + (i % 3) * 0.32 + rnd() * 0.1;
        const g = new THREE.ConeGeometry(0.05, 0.85, 3, 1, true);
        g.translate(0, 0.42, 0);
        parts.push(colored(transformed(g, [0, 0.95, 0], [tilt * Math.cos(a), 0, tilt * Math.sin(a)]), new THREE.Color(i % 4 === 0 ? '#9a9a64' : '#6f8f6a'), 0.08, rnd));
      }
      return merge(parts);
    }
    case 'desert-grass': {
      // Deer grass / muhly clump: many fine arching blades, straw-green with pink-tan tips.
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2;
        const tilt = 0.15 + rnd() * 0.55;
        const len = 0.55 + rnd() * 0.35;
        const g = new THREE.ConeGeometry(0.025, len, 3, 1, true);
        g.translate(0, len / 2, 0);
        parts.push(colored(transformed(g, [Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08], [tilt * Math.cos(a), 0, tilt * Math.sin(a)]), new THREE.Color(rnd() < 0.3 ? '#c8a98a' : '#a3a46a'), 0.1, rnd));
      }
      return merge(parts);
    }
    case 'groundcover': {
      // Trailing lantana / verbena: a low spreading mat with small lavender and yellow blooms.
      const parts = [mass(rnd, 0.55, [0, 0.12, 0], [1.4, 0.32, 1.2], new THREE.Color('#5d7a3c'), { detail: 1, lumps: 0.2, shade: 0.4 })];
      for (let i = 0; i < 6; i++) parts.push(colored(transformed(new THREE.OctahedronGeometry(0.07, 0), [(rnd() - 0.5) * 1.2, 0.24 + rnd() * 0.06, (rnd() - 0.5) * 1.0]), new THREE.Color(rnd() < 0.7 ? '#9b7fd0' : '#f0d24a'), 0.08, rnd));
      return merge(parts);
    }
    case 'rock':
      return mass(rnd, 0.45, [0, 0.24, 0], [1.2, 0.72, 1], new THREE.Color('#ad9576'), { detail: 1, lumps: 0.3, shade: 0.35, jitter: 0.05, faceted: true });
    case 'boulder': {
      const parts = [mass(rnd, 0.9, [0, 0.5, 0], [1.3, 0.8, 1], new THREE.Color('#a08870'), { detail: 1, lumps: 0.3, shade: 0.38, jitter: 0.05, faceted: true })];
      parts.push(mass(rnd, 0.5, [0.95, 0.28, 0.3], [1.1, 0.75, 1], new THREE.Color('#ad9576'), { detail: 1, lumps: 0.3, shade: 0.38, jitter: 0.05, faceted: true }));
      return merge(parts);
    }
  }
}

interface Instance {
  species: Species;
  x: number;
  z: number;
  rotation: number;
  scale: number;
  tint: number;
  /** Open-desert scatter lies outside the sun's shadow camera, so it never casts. */
  scatter?: boolean;
}

function collectInstances(density: number): Instance[] {
  const out: Instance[] = [];
  // Residential yards
  for (const lot of HOUSE_LOTS) {
    const plan = yardPlan(lot);
    const rot = FACING_ROTATION[lot.facing];
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (const p of plan.plants) {
      // Local (x, z) with front at -z, rotated into world.
      const wx = lot.center.x + p.x * cos + p.z * sin;
      const wz = lot.center.z - p.x * sin + p.z * cos;
      out.push({ species: p.species, x: wx, z: wz, rotation: p.rotation + rot, scale: p.scale, tint: 0.92 + ((plan.seed >> 4) % 17) / 100 });
    }
  }
  // Common-area greenbelts between the rows.
  for (const gb of greenbelts()) for (const p of gb.plants) out.push({ species: p.species, x: p.x, z: p.z, rotation: p.rotation, scale: p.scale, tint: 0.95 });
  const rnd = makeDecoRng(4242);
  // Street palms along the avenues; mesquite along the east-west streets at block corners.
  for (const st of STREETS.filter((s) => s.axis === 'z')) {
    for (let along = -WORLD_HALF + 24; along < WORLD_HALF - 10; along += 22) {
      for (const side of [-1, 1]) {
        const x = st.at + side * (ROAD_WIDTH / 2 + SIDEWALK_WIDTH + 2.2);
        const z = along + (rnd() - 0.5) * 4;
        if (st.id === 'av-c' && side === 1 && z > 32 && z < 68) continue; // HQ driveway
        if (Math.abs(z) < 7 || Math.abs(Math.abs(z) - 100) < 7) continue; // intersections
        out.push({ species: rnd() < 0.7 ? 'palm' : 'mesquite', x, z, rotation: rnd() * Math.PI * 2, scale: 0.85 + rnd() * 0.4, tint: 0.95 + rnd() * 0.1 });
      }
    }
  }
  // Headquarters: fan palms along the north bed and the street, date palms in the lot island,
  // mesquites at the staff patio, agave and shrubs at the sign and planters.
  const hx = HQ_LOT.center.x;
  const hz = HQ_LOT.center.z;
  const hqPlant = (species: Species, lx: number, lz: number, scale = 1) => out.push({ species, x: hx + lx, z: hz + lz, rotation: rnd() * 6.28, scale: scale * (0.95 + rnd() * 0.2), tint: 0.95 + rnd() * 0.1 });
  for (const lx of [-48, -38, -28, -18, -8]) hqPlant('palm', lx, -38.5, 1.0 + rnd() * 0.25);
  for (const lz of [-30, -22, 16, 26, 36]) hqPlant('palm', -56.2, lz, 0.9 + rnd() * 0.3);
  for (const lz of [-26, -12, 0]) hqPlant('date-palm', -25.5, lz, 0.95);
  hqPlant('date-palm', -14, -5, 1.0);
  for (const [lx, lz] of [[-30, 37], [-38, 38], [-46, 36], [-22, 38]] as [number, number][]) hqPlant('mesquite', lx, lz, 1.1);
  for (const [lx, lz] of [[-54.5, -20], [-54.5, -12], [-56.3, -34], [-56.3, 8], [-56.3, 32], [-40, -36.5], [-32, -36.5], [-18, -36.5], [-10, -36.5]] as [number, number][]) hqPlant(rnd() < 0.5 ? 'agave' : 'shrub-sage', lx, lz, 0.9 + rnd() * 0.4);
  for (const [lx, lz] of [[-44, -37.5], [-14, -37.5], [-56.5, 24]] as [number, number][]) hqPlant('boulder', lx, lz, 0.8);
  for (const lz of [-29.2, -18.8]) hqPlant('flower-pink', -4.0, lz, 0.9); // entry planters
  for (const [lx, lz] of [[-26, 34], [-34, 35], [-42, 34.5], [-28, 40]] as [number, number][]) hqPlant('shrub-green', lx, lz, 1.1);
  // Park
  for (let i = 0; i < 16; i++) {
    out.push({ species: i % 3 === 0 ? 'palm' : i % 3 === 1 ? 'olive' : 'mesquite', x: PARK_LOT.center.x + (rnd() - 0.5) * (PARK_LOT.width - 12), z: PARK_LOT.center.z + (rnd() - 0.5) * (PARK_LOT.depth - 12), rotation: rnd() * 6.28, scale: 0.9 + rnd() * 0.5, tint: 0.95 + rnd() * 0.1 });
  }
  // Open desert: creosote-like shrubs, rocks and the odd boulder, thinned by quality.
  const scatter = Math.round(420 * density);
  for (let i = 0; i < scatter; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 232 + rnd() * 320;
    const r = rnd();
    out.push({ species: r < 0.6 ? 'shrub-sage' : r < 0.8 ? 'rock' : r < 0.9 ? 'boulder' : 'agave', x: Math.cos(a) * d, z: Math.sin(a) * d, rotation: rnd() * 6.28, scale: 1 + rnd() * 1.4, tint: 0.9 + rnd() * 0.2, scatter: true });
  }
  return out;
}

const SPECIES: Species[] = ['palm', 'date-palm', 'mesquite', 'olive', 'palo-verde', 'cypress', 'shrub-sage', 'shrub-green', 'shrub-red', 'agave', 'yucca', 'desert-grass', 'groundcover', 'flower-pink', 'flower-yellow', 'rock', 'boulder', 'barrel-cactus'];

export function Vegetation() {
  const quality = useApp((s) => s.settings.quality);
  const density = quality === 'low' ? 0.35 : quality === 'medium' ? 0.7 : quality === 'high' ? 1 : 1.4;
  const instances = useMemo(() => collectInstances(density), [density]);
  const geometries = useMemo(() => Object.fromEntries(SPECIES.map((s) => [s, buildSpecies(s)])) as Record<Species, THREE.BufferGeometry>, []);
  const farPalm = useMemo(() => fanPalm('far'), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: false, side: THREE.DoubleSide }), []);
  // Closed shapes (shrub and crown masses, cacti, rocks, trunks) only need their front faces.
  const solid = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: false, side: THREE.FrontSide }), []);
  return (
    <group name="vegetation">
      {SPECIES.map((species) => {
        // Small ground plants and shrubs do not cast: their shadows are a few pixels from the strategy
        // camera and there are hundreds of them. Trees, palms, yucca, cypress and boulders keep theirs.
        const castShadow = !['rock', 'flower-pink', 'flower-yellow', 'groundcover', 'desert-grass', 'barrel-cactus', 'agave', 'shrub-sage', 'shrub-green', 'shrub-red'].includes(species);
        const list = instances.filter((i) => i.species === species && !i.scatter);
        const scatter = instances.filter((i) => i.species === species && i.scatter);
        return (
          <group key={species}>
            {list.length > 0 && species === 'palm' && <LodLayer near={geometries.palm} far={farPalm} material={material} list={list} />}
            {species !== 'palm' &&
              chunks(list).map(([key, part]) => <SpeciesLayer key={key} name={`veg:${species}:${key}`} geometry={geometries[species]} material={BLADED.has(species) ? material : solid} list={part} castShadow={castShadow} />)}
            {scatter.length > 0 && <SpeciesLayer name={`veg:${species}:desert`} geometry={geometries[species]} material={BLADED.has(species) ? material : solid} list={scatter} castShadow={false} />}
          </group>
        );
      })}
    </group>
  );
}

function instanceMatrix(it: Instance, m = new THREE.Matrix4()): THREE.Matrix4 {
  return m.compose(new THREE.Vector3(it.x, 0, it.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rotation), new THREE.Vector3(it.scale, it.scale, it.scale));
}

/** Species with open blades or fronds, drawn double-sided; everything else is a closed shape. */
const BLADED = new Set<Species>(['palm', 'date-palm', 'agave', 'yucca', 'desert-grass']);

/**
 * Splits a species' instances into the four quadrants of the town so each InstancedMesh has a
 * tight bounding sphere and is frustum-culled (camera and shadow pass) when off screen.
 */
function chunks(list: Instance[]): [string, Instance[]][] {
  // Species with few instances stay one mesh (one draw call); chunking pays off for the numerous ones.
  if (list.length <= 80) return list.length ? [['all', list]] : [];
  const out = new Map<string, Instance[]>();
  for (const it of list) {
    const key = `${it.x < 0 ? 'w' : 'e'}${it.z < 0 ? 'n' : 's'}`;
    (out.get(key) ?? out.set(key, []).get(key)!).push(it);
  }
  return [...out.entries()];
}

function SpeciesLayer({ name, geometry, material, list, castShadow }: { name: string; geometry: THREE.BufferGeometry; material: THREE.Material; list: Instance[]; castShadow: boolean }) {
  const ref = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, instanceMatrix(it, m));
      c.setScalar(it.tint);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  return <instancedMesh ref={ref} name={name} args={[geometry, material, list.length]} castShadow={castShadow} receiveShadow />;
}

/** Camera distance (m) where fan palms switch to the far mesh; the band around it stops flicker. */
const PALM_LOD_DISTANCE = 60;
const PALM_LOD_BAND = 4;

/**
 * Two instanced meshes over one instance list: each instance is drawn by the near or the far mesh
 * depending on its distance to the camera. Buckets are rebuilt only when the camera moves.
 */
function LodLayer({ near, far, material, list }: { near: THREE.BufferGeometry; far: THREE.BufferGeometry; material: THREE.Material; list: Instance[] }) {
  const nearRef = useRef<THREE.InstancedMesh>(null);
  const farRef = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((s) => s.camera);
  const cache = useMemo(() => ({ matrices: list.map((it) => instanceMatrix(it)), isNear: new Uint8Array(list.length), last: new THREE.Vector3(Infinity, 0, 0) }), [list]);
  useFrame(() => {
    const nm = nearRef.current;
    const fm = farRef.current;
    if (!nm || !fm || camera.position.distanceToSquared(cache.last) < 0.25) return;
    cache.last.copy(camera.position);
    const c = new THREE.Color();
    let n = 0;
    let f = 0;
    list.forEach((it, i) => {
      // Distance to the crown, which carries nearly all of the palm's triangles.
      const d = Math.hypot(it.x - camera.position.x, 8 * it.scale - camera.position.y, it.z - camera.position.z);
      const isNear = cache.isNear[i] ? d < PALM_LOD_DISTANCE + PALM_LOD_BAND : d < PALM_LOD_DISTANCE - PALM_LOD_BAND;
      cache.isNear[i] = isNear ? 1 : 0;
      const mesh = isNear ? nm : fm;
      const k = isNear ? n++ : f++;
      mesh.setMatrixAt(k, cache.matrices[i]);
      mesh.setColorAt(k, c.setScalar(it.tint));
    });
    for (const [mesh, count] of [[nm, n], [fm, f]] as const) {
      mesh.count = count;
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });
  return (
    <>
      <instancedMesh ref={nearRef} name="palm:near" args={[near, material, list.length]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={farRef} name="palm:far" args={[far, material, list.length]} castShadow receiveShadow frustumCulled={false} />
    </>
  );
}
