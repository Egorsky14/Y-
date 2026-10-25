import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeDecoRng } from './random';

/**
 * Procedural PBR texture sets (base color + normal + roughness) generated on canvases, and
 * geometry helpers that give merged static meshes consistent world-space texture scale.
 */

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap?: THREE.Texture;
  /** World meters covered by one texture repeat. */
  metersPerRepeat: number;
}

const cache = new Map<string, PbrSet>();

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.Texture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Converts a grayscale height canvas into a tangent-space normal map (Sobel). */
export function heightToNormal(height: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const size = height.width;
  const src = height.getContext('2d')!.getImageData(0, 0, size, size).data;
  const [out, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const h = (x: number, y: number) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x - 1, y) - h(x - 1, y + 1)) * strength;
      const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x, y - 1) - h(x + 1, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function noiseFill(ctx: CanvasRenderingContext2D, size: number, seed: number, base: number, amp: number, count: number, dotSize: number) {
  const rnd = makeDecoRng(seed);
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const v = Math.round(base + (rnd() - 0.5) * amp * 2);
    ctx.fillStyle = `rgba(${v},${v},${v},0.7)`;
    const s = dotSize * (0.5 + rnd());
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
}

function blurCanvas(c: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const [out, ctx] = makeCanvas(c.width);
  ctx.filter = `blur(${radius}px)`;
  // Draw 3x3 tiled to keep the blur seamless, then crop the center.
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) ctx.drawImage(c, dx * c.width, dy * c.height);
  ctx.filter = 'none';
  return out;
}

function tintedColor(size: number, seed: number, rgb: [number, number, number], variance: number, grain: number, grainSize = 2): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size);
  const rnd = makeDecoRng(seed);
  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < grain; i++) {
    const d = (rnd() - 0.5) * variance * 2;
    ctx.fillStyle = `rgba(${Math.round(rgb[0] + d)},${Math.round(rgb[1] + d)},${Math.round(rgb[2] + d)},0.55)`;
    const s = grainSize * (0.5 + rnd());
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
  return c;
}

function getOrMake(key: string, make: () => PbrSet): PbrSet {
  const hit = cache.get(key);
  if (hit) return hit;
  const set = make();
  cache.set(key, set);
  return set;
}

export function stuccoPbr(): PbrSet {
  return getOrMake('stucco', () => {
    const size = 256;
    const color = tintedColor(size, 21, [236, 232, 224], 10, 3500, 2);
    const [h, hctx] = makeCanvas(size);
    noiseFill(hctx, size, 22, 128, 40, 5000, 2);
    const normal = heightToNormal(blurCanvas(h, 0.8), 1.2);
    return { map: toTexture(color, true), normalMap: toTexture(normal, false), metersPerRepeat: 2.5 };
  });
}

/** Spanish barrel tiles: rows of half-cylinders with per-tile tone variation. */
export function tileRoofPbr(): PbrSet {
  return getOrMake('tile-roof', () => {
    const size = 512;
    const [c, ctx] = makeCanvas(size);
    const [h, hctx] = makeCanvas(size);
    const rnd = makeDecoRng(31);
    const cols = 10;
    const rows = 12;
    const tw = size / cols;
    const th = size / rows;
    ctx.fillStyle = '#8c3f2b';
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#404040';
    hctx.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * tw;
        const y = r * th;
        const tone = 0.85 + rnd() * 0.3;
        const g = ctx.createLinearGradient(x, 0, x + tw, 0);
        g.addColorStop(0, `rgb(${Math.round(120 * tone)},${Math.round(60 * tone)},${Math.round(42 * tone)})`);
        g.addColorStop(0.5, `rgb(${Math.round(196 * tone)},${Math.round(104 * tone)},${Math.round(72 * tone)})`);
        g.addColorStop(1, `rgb(${Math.round(130 * tone)},${Math.round(64 * tone)},${Math.round(44 * tone)})`);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, tw, th - 2);
        const hg = hctx.createLinearGradient(x, 0, x + tw, 0);
        hg.addColorStop(0, '#303030');
        hg.addColorStop(0.5, '#e0e0e0');
        hg.addColorStop(1, '#303030');
        hctx.fillStyle = hg;
        hctx.fillRect(x, y, tw, th - 3);
        // Tile overlap shadow at the bottom of each row
        ctx.fillStyle = 'rgba(40,15,8,0.45)';
        ctx.fillRect(x, y + th - 6, tw, 5);
      }
    }
    const normal = heightToNormal(blurCanvas(h, 1.2), 2.2);
    return { map: toTexture(c, true), normalMap: toTexture(normal, false), metersPerRepeat: 3.2 };
  });
}

/** Architectural asphalt shingles in offset courses. */
export function shinglePbr(color: [number, number, number] = [92, 98, 106]): PbrSet {
  return getOrMake(`shingle-${color.join()}`, () => {
    const size = 512;
    const [c, ctx] = makeCanvas(size);
    const [h, hctx] = makeCanvas(size);
    const rnd = makeDecoRng(41);
    const rows = 16;
    const rh = size / rows;
    const tw = size / 8;
    ctx.fillStyle = `rgb(${color.join(',')})`;
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (tw / 2);
      for (let i = -1; i < 9; i++) {
        const x = i * tw + off;
        const d = (rnd() - 0.5) * 36;
        ctx.fillStyle = `rgb(${Math.round(color[0] + d)},${Math.round(color[1] + d)},${Math.round(color[2] + d)})`;
        ctx.fillRect(x + 1, r * rh, tw - 2, rh - 3);
        hctx.fillStyle = `rgb(${150 + Math.round(d)},${150 + Math.round(d)},${150 + Math.round(d)})`;
        hctx.fillRect(x + 1, r * rh, tw - 2, rh - 3);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, r * rh + rh - 3, size, 3);
      hctx.fillStyle = '#202020';
      hctx.fillRect(0, r * rh + rh - 3, size, 3);
    }
    const normal = heightToNormal(blurCanvas(h, 0.6), 1.6);
    return { map: toTexture(c, true), normalMap: toTexture(normal, false), metersPerRepeat: 3.0 };
  });
}

export function asphaltPbr(): PbrSet {
  return getOrMake('asphalt', () => {
    const size = 512;
    const color = tintedColor(size, 51, [78, 80, 84], 14, 16000, 1.6);
    const cctx = color.getContext('2d')!;
    const rnd = makeDecoRng(52);
    // Patches and faint cracks
    for (let i = 0; i < 14; i++) {
      cctx.fillStyle = `rgba(${66 + rnd() * 16},${66 + rnd() * 16},${68 + rnd() * 16},0.12)`;
      cctx.beginPath();
      cctx.ellipse(rnd() * size, rnd() * size, 30 + rnd() * 80, 20 + rnd() * 50, rnd() * 3, 0, Math.PI * 2);
      cctx.fill();
    }
    cctx.strokeStyle = 'rgba(30,30,32,0.16)';
    cctx.lineWidth = 1.0;
    for (let i = 0; i < 2; i++) {
      cctx.beginPath();
      let x = rnd() * size;
      let y = rnd() * size;
      cctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (rnd() - 0.5) * 60;
        y += rnd() * 40;
        cctx.lineTo(x, y);
      }
      cctx.stroke();
    }
    const [h, hctx] = makeCanvas(size);
    noiseFill(hctx, size, 53, 128, 60, 20000, 1.5);
    const normal = heightToNormal(h, 0.9);
    const [r, rctx] = makeCanvas(size);
    noiseFill(rctx, size, 54, 215, 25, 6000, 3);
    return { map: toTexture(color, true), normalMap: toTexture(normal, false), roughnessMap: toTexture(r, false), metersPerRepeat: 6 };
  });
}

/** Broom-finished concrete with control joints every repeat. */
export function concretePbr(): PbrSet {
  return getOrMake('concrete', () => {
    const size = 256;
    const color = tintedColor(size, 61, [206, 202, 194], 9, 5000, 2);
    const cctx = color.getContext('2d')!;
    cctx.fillStyle = 'rgba(90,88,84,0.55)';
    cctx.fillRect(0, 0, size, 3);
    cctx.fillRect(0, 0, 3, size);
    const [h, hctx] = makeCanvas(size);
    noiseFill(hctx, size, 62, 128, 22, 4000, 1.5);
    hctx.fillStyle = '#404040';
    hctx.fillRect(0, 0, size, 4);
    hctx.fillRect(0, 0, 4, size);
    const normal = heightToNormal(blurCanvas(h, 0.6), 1.4);
    return { map: toTexture(color, true), normalMap: toTexture(normal, false), metersPerRepeat: 1.5 };
  });
}

export function gravelPbr(): PbrSet {
  return getOrMake('gravel', () => {
    const size = 256;
    const [c, ctx] = makeCanvas(size);
    const [h, hctx] = makeCanvas(size);
    const rnd = makeDecoRng(71);
    ctx.fillStyle = '#b89d74';
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#505050';
    hctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 1.5 + rnd() * 3;
      const t = 150 + rnd() * 90;
      ctx.fillStyle = `rgb(${t},${Math.round(t * 0.86)},${Math.round(t * 0.66)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      const hg = hctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      hg.addColorStop(0, '#e8e8e8');
      hg.addColorStop(1, '#505050');
      hctx.fillStyle = hg;
      hctx.beginPath();
      hctx.arc(x, y, r, 0, Math.PI * 2);
      hctx.fill();
    }
    const normal = heightToNormal(h, 1.3);
    return { map: toTexture(c, true), normalMap: toTexture(normal, false), metersPerRepeat: 1.6 };
  });
}

export function sandPbr(): PbrSet {
  return getOrMake('sand', () => {
    const size = 512;
    const color = tintedColor(size, 81, [214, 190, 150], 14, 14000, 2.5);
    const cctx = color.getContext('2d')!;
    const rnd = makeDecoRng(82);
    for (let i = 0; i < 40; i++) {
      cctx.fillStyle = `rgba(${150 + rnd() * 40},${120 + rnd() * 40},${80 + rnd() * 30},0.18)`;
      cctx.beginPath();
      cctx.ellipse(rnd() * size, rnd() * size, 40 + rnd() * 120, 20 + rnd() * 60, rnd() * 3, 0, Math.PI * 2);
      cctx.fill();
    }
    const [h, hctx] = makeCanvas(size);
    noiseFill(hctx, size, 83, 128, 30, 9000, 3);
    const normal = heightToNormal(blurCanvas(h, 1.5), 0.8);
    return { map: toTexture(color, true), normalMap: toTexture(normal, false), metersPerRepeat: 10 };
  });
}

export function lawnPbr(): PbrSet {
  return getOrMake('lawn', () => {
    const size = 256;
    const [c, ctx] = makeCanvas(size);
    const rnd = makeDecoRng(91);
    ctx.fillStyle = '#5f8f3c';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 9000; i++) {
      const g = 120 + rnd() * 60;
      ctx.fillStyle = `rgba(${Math.round(g * 0.6)},${Math.round(g)},${Math.round(g * 0.35)},0.6)`;
      ctx.fillRect(rnd() * size, rnd() * size, 1.5, 3 + rnd() * 3);
    }
    const [h, hctx] = makeCanvas(size);
    noiseFill(hctx, size, 92, 128, 40, 6000, 1.5);
    const normal = heightToNormal(h, 0.8);
    return { map: toTexture(c, true), normalMap: toTexture(normal, false), metersPerRepeat: 2 };
  });
}

/** Split-face concrete block (CMU) wall, the Las Vegas backyard standard. */
export function blockWallPbr(): PbrSet {
  return getOrMake('block', () => {
    const size = 256;
    const [c, ctx] = makeCanvas(size);
    const [h, hctx] = makeCanvas(size);
    const rnd = makeDecoRng(101);
    const rows = 6;
    const rh = size / rows;
    const bw = size / 3;
    ctx.fillStyle = '#9e8f7a';
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#303030';
    hctx.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (bw / 2);
      for (let i = -1; i < 4; i++) {
        const x = i * bw + off;
        const d = (rnd() - 0.5) * 24;
        ctx.fillStyle = `rgb(${Math.round(196 + d)},${Math.round(180 + d)},${Math.round(156 + d)})`;
        ctx.fillRect(x + 2, r * rh + 2, bw - 4, rh - 4);
        hctx.fillStyle = '#c8c8c8';
        hctx.fillRect(x + 2, r * rh + 2, bw - 4, rh - 4);
      }
    }
    const normal = heightToNormal(blurCanvas(h, 0.7), 2.0);
    return { map: toTexture(c, true), normalMap: toTexture(normal, false), metersPerRepeat: 1.2 };
  });
}

/** Raised-panel garage door in off-white. */
export function garageDoorPbr(): PbrSet {
  return getOrMake('garage', () => {
    const size = 256;
    const [c, ctx] = makeCanvas(size);
    const [h, hctx] = makeCanvas(size);
    ctx.fillStyle = '#e9e6de';
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);
    const rows = 4;
    const cols = 4;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * (size / cols) + 8;
        const y = r * (size / rows) + 8;
        const w = size / cols - 16;
        const hh = size / rows - 16;
        ctx.fillStyle = '#dfdbd2';
        ctx.fillRect(x, y, w, hh);
        ctx.fillStyle = '#f1efe9';
        ctx.fillRect(x + 4, y + 4, w - 8, hh - 8);
        hctx.fillStyle = '#505050';
        hctx.fillRect(x, y, w, hh);
        hctx.fillStyle = '#a0a0a0';
        hctx.fillRect(x + 4, y + 4, w - 8, hh - 8);
      }
    }
    const normal = heightToNormal(blurCanvas(h, 0.8), 1.5);
    return { map: toTexture(c, true), normalMap: toTexture(normal, false), metersPerRepeat: 2.6 };
  });
}

/** Vertical standing-seam metal siding. */
export function sidingPbr(): PbrSet {
  return getOrMake('siding', () => {
    const size = 256;
    const color = tintedColor(size, 111, [52, 56, 61], 5, 2500, 2);
    const cctx = color.getContext('2d')!;
    const [h, hctx] = makeCanvas(size);
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 32) {
      hctx.fillStyle = '#c0c0c0';
      hctx.fillRect(x, 0, 6, size);
      cctx.fillStyle = 'rgba(255,255,255,0.05)';
      cctx.fillRect(x, 0, 6, size);
      cctx.fillStyle = 'rgba(0,0,0,0.18)';
      cctx.fillRect(x + 6, 0, 3, size);
    }
    const normal = heightToNormal(blurCanvas(h, 0.8), 2.0);
    return { map: toTexture(color, true), normalMap: toTexture(normal, false), metersPerRepeat: 2.0 };
  });
}

/** Material from a PBR set; the caller sets repeat via world UVs, so the texture repeat stays 1. */
export function pbrMaterial(set: PbrSet, params: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 0.9, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8), ...params });
}

/** Rewrites UVs by projecting each vertex onto the plane of its dominant normal axis, in world meters. */
export function applyWorldUVs(geometry: THREE.BufferGeometry, metersPerRepeat: number, offset = 0): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = (u + offset) / metersPerRepeat;
    uv[i * 2 + 1] = (v + offset) / metersPerRepeat;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** Collects transformed geometries per material and merges them into one mesh per material. */
export type MaterialResolver = Record<string, THREE.Material> | ((key: string) => THREE.Material);

export class MeshBuilder {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  /** Optional parent transform applied after each part's local transform (e.g. a lot's placement). */
  private frame: THREE.Matrix4 | null = null;
  constructor(private materials: MaterialResolver, private uvScale: Record<string, number> = {}) {}

  setFrame(matrix: THREE.Matrix4 | null): this {
    this.frame = matrix;
    return this;
  }

  private resolveMaterial(key: string): THREE.Material {
    if (typeof this.materials === 'function') return this.materials(key);
    return this.materials[key];
  }

  private resolveUvScale(key: string): number | undefined {
    return this.uvScale[key] ?? this.uvScale[key.split(':')[0]];
  }

  add(material: string, geometry: THREE.BufferGeometry, position: [number, number, number] = [0, 0, 0], rotation: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): this {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    if (this.frame) m.premultiply(this.frame);
    g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const perRepeat = this.resolveUvScale(material);
    if (perRepeat) g = applyWorldUVs(g, perRepeat);
    else if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
    g.clearGroups();
    (this.parts.get(material) ?? this.parts.set(material, []).get(material)!).push(g);
    return this;
  }

  box(material: string, size: [number, number, number], position: [number, number, number], rotation?: [number, number, number]): this {
    return this.add(material, new THREE.BoxGeometry(...size), position, rotation);
  }

  build(name = 'merged', shadows = true): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [material, geos] of this.parts) {
      const merged = geos.length === 1 ? geos[0] : BGU.mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.resolveMaterial(material));
      mesh.name = `${name}:${material}`;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

/** Hip roof as explicit faces with slope-aligned UVs. Ridge runs along x when w >= d. */
export function hipRoofGeometry(w: number, d: number, h: number, overhang: number): THREE.BufferGeometry {
  const a = w / 2 + overhang;
  const b = d / 2 + overhang;
  const alongX = w >= d;
  const r = alongX ? Math.max(0, (w - d) / 2) : Math.max(0, (d - w) / 2);
  const ridgeA = alongX ? new THREE.Vector3(-r, h, 0) : new THREE.Vector3(0, h, -r);
  const ridgeB = alongX ? new THREE.Vector3(r, h, 0) : new THREE.Vector3(0, h, r);
  const c0 = new THREE.Vector3(-a, 0, -b);
  const c1 = new THREE.Vector3(a, 0, -b);
  const c2 = new THREE.Vector3(a, 0, b);
  const c3 = new THREE.Vector3(-a, 0, b);
  const positions: number[] = [];
  const uvs: number[] = [];
  const face = (pts: THREE.Vector3[]) => {
    // Fan triangulation with planar UVs (u along the eave, v up the slope).
    const eave = pts[1].clone().sub(pts[0]);
    const uDir = eave.clone().normalize();
    const slopeDir = pts[pts.length - 1].clone().sub(pts[0]);
    slopeDir.sub(uDir.clone().multiplyScalar(slopeDir.dot(uDir))).normalize();
    const uvOf = (p: THREE.Vector3) => [p.clone().sub(pts[0]).dot(uDir), p.clone().sub(pts[0]).dot(slopeDir)];
    for (let i = 1; i < pts.length - 1; i++) {
      for (const p of [pts[0], pts[i], pts[i + 1]]) {
        positions.push(p.x, p.y, p.z);
        uvs.push(...uvOf(p));
      }
    }
  };
  if (alongX) {
    face([c3, c2, ridgeB, ridgeA]); // front (+z)
    face([c1, c0, ridgeA, ridgeB]); // back (-z)
    face([c2, c1, ridgeB]); // right (+x)
    face([c0, c3, ridgeA]); // left (-x)
  } else {
    face([c0, c3, ridgeB, ridgeA]);
    face([c2, c1, ridgeA, ridgeB]);
    face([c3, c2, ridgeB]);
    face([c1, c0, ridgeA]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** Gable roof: two slopes with the ridge along x; returns the roof planes only. */
export function gableRoofGeometry(w: number, d: number, h: number, overhang: number): THREE.BufferGeometry {
  const a = w / 2 + overhang;
  const b = d / 2 + overhang;
  const positions: number[] = [];
  const uvs: number[] = [];
  const slopeLen = Math.hypot(b, h);
  const quad = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3) => {
    for (const [p, u, v] of [
      [p0, 0, 0],
      [p1, 2 * a, 0],
      [p2, 2 * a, slopeLen],
      [p0, 0, 0],
      [p2, 2 * a, slopeLen],
      [p3, 0, slopeLen],
    ] as [THREE.Vector3, number, number][]) {
      positions.push(p.x, p.y, p.z);
      uvs.push(u, v);
    }
  };
  quad(new THREE.Vector3(-a, 0, b), new THREE.Vector3(a, 0, b), new THREE.Vector3(a, h, 0), new THREE.Vector3(-a, h, 0));
  quad(new THREE.Vector3(a, 0, -b), new THREE.Vector3(-a, 0, -b), new THREE.Vector3(-a, h, 0), new THREE.Vector3(a, h, 0));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** Triangular gable-end wall infill under a gable roof (in the x/y plane at a given z). */
export function gableEndGeometry(w: number, h: number, z: number, facingPositiveZ: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pts = facingPositiveZ ? [-w / 2, 0, z, w / 2, 0, z, 0, h, z] : [w / 2, 0, z, -w / 2, 0, z, 0, h, z];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  g.computeVertexNormals();
  return g;
}
