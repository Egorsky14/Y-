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

/** Converts a grayscale height canvas into a tangent-space normal map (Sobel), typed-array fast path. */
export function heightToNormal(height: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const size = height.width;
  const src = height.getContext('2d')!.getImageData(0, 0, size, size).data;
  const hs = new Float32Array(size * size);
  for (let i = 0, j = 0; i < hs.length; i++, j += 4) hs[i] = src[j] / 255;
  const [out, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const last = size - 1;
  for (let y = 0; y < size; y++) {
    const ym = (y === 0 ? last : y - 1) * size;
    const y0 = y * size;
    const yp = (y === last ? 0 : y + 1) * size;
    for (let x = 0; x < size; x++) {
      const xm = x === 0 ? last : x - 1;
      const xp = x === last ? 0 : x + 1;
      const dx = (hs[ym + xp] + 2 * hs[y0 + xp] + hs[yp + xp] - hs[ym + xm] - 2 * hs[y0 + xm] - hs[yp + xm]) * strength;
      const dy = (hs[yp + xm] + 2 * hs[yp + x] + hs[yp + xp] - hs[ym + xm] - 2 * hs[ym + x] - hs[ym + xp]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y0 + x) * 4;
      d[i] = (-dx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      d[i + 2] = inv * 0.5 * 255 + 127;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Fills a height canvas with per-pixel noise around `base` (typed-array write, then an optional blur for coarser grain). */
function noiseFill(ctx: CanvasRenderingContext2D, size: number, seed: number, base: number, amp: number, count: number, dotSize: number) {
  void count;
  const rnd = makeDecoRng(seed);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = base + (rnd() - 0.5) * amp * 1.6;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (dotSize > 1.4) {
    const blurred = blurCanvas(ctx.canvas, dotSize * 0.45);
    ctx.drawImage(blurred, 0, 0);
  }
}

/** Modifies `count` random pixels of a canvas in one ImageData pass (replaces per-pixel fillRect speckle). */
function speckle(canvas: HTMLCanvasElement, count: number, rnd: () => number, pick: (rnd: () => number) => [number, number, number, number]) {
  const ctx = canvas.getContext('2d')!;
  const size = canvas.width;
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let n = 0; n < count; n++) {
    const i = ((Math.floor(rnd() * size) * size) + Math.floor(rnd() * size)) * 4;
    const [r, g, b, a] = pick(rnd);
    d[i] = d[i] * (1 - a) + r * a;
    d[i + 1] = d[i + 1] * (1 - a) + g * a;
    d[i + 2] = d[i + 2] * (1 - a) + b * a;
  }
  ctx.putImageData(img, 0, 0);
}

/** Fills an axis-aligned rectangle directly in an ImageData buffer. */
function rectData(d: Uint8ClampedArray, size: number, x: number, y: number, w: number, h: number, r: number, g: number, b: number) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(size, Math.ceil(x + w));
  const y1 = Math.min(size, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
    const i = (yy * size + xx) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
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

/** Base color with per-pixel tonal grain (typed-array write, optional blur for coarser grain). */
function tintedColor(size: number, seed: number, rgb: [number, number, number], variance: number, grain: number, grainSize = 2): HTMLCanvasElement {
  void grain;
  const [c, ctx] = makeCanvas(size);
  const rnd = makeDecoRng(seed);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const dv = (rnd() - 0.5) * variance * 1.3;
    d[i] = rgb[0] + dv;
    d[i + 1] = rgb[1] + dv;
    d[i + 2] = rgb[2] + dv;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (grainSize > 1.5) ctx.drawImage(blurCanvas(c, (grainSize - 1) * 0.5), 0, 0);
  return c;
}

function getOrMake(key: string, make: () => PbrSet): PbrSet {
  const hit = cache.get(key);
  if (hit) return hit;
  const t0 = performance.now();
  const set = make();
  cache.set(key, set);
  if (import.meta.env.DEV || (window as unknown as { __egoTiming?: boolean }).__egoTiming) console.debug(`[pbr] ${key} ${(performance.now() - t0).toFixed(0)} ms`);
  return set;
}

export function stuccoPbr(): PbrSet {
  return getOrMake('stucco', () => {
    const size = 384;
    const color = tintedColor(size, 21, [236, 232, 224], 12, 14000, 1.6);
    const cctx = color.getContext('2d')!;
    const rnd = makeDecoRng(23);
    for (let i = 0; i < 30; i++) {
      cctx.fillStyle = `rgba(${150 + rnd() * 40},${140 + rnd() * 40},${120 + rnd() * 40},0.06)`;
      cctx.beginPath();
      cctx.ellipse(rnd() * size, rnd() * size, 40 + rnd() * 120, 30 + rnd() * 90, rnd() * 3, 0, Math.PI * 2);
      cctx.fill();
    }
    const [h, hctx] = makeCanvas(size);
    noiseFill(hctx, size, 22, 128, 46, 16000, 1.4);
    const normal = heightToNormal(blurCanvas(h, 0.6), 1.6);
    return { map: toTexture(color, true), normalMap: toTexture(normal, false), metersPerRepeat: 2.5 };
  });
}

/** Spanish barrel tiles: rows of half-cylinders with per-tile tone variation. */
export function tileRoofPbr(): PbrSet {
  return getOrMake('tile-roof', () => {
    const size = 384;
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
let shingleNormal: THREE.Texture | null = null;
export function shinglePbr(color: [number, number, number] = [92, 98, 106]): PbrSet {
  return getOrMake(`shingle-${color.join()}`, () => {
    const size = 384;
    const [c, ctx] = makeCanvas(size);
    const [h, hctx] = makeCanvas(size);
    const rnd = makeDecoRng(41);
    const rows = 22;
    const rh = size / rows;
    const tw = size / 11;
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
    speckle(c, 20000, rnd, (r) => { const d = (r() - 0.5) * 70; return [color[0] + d, color[1] + d, color[2] + d, 0.5]; });
    // The course layout is identical for every color (same seed), so one normal map serves all three.
    if (!shingleNormal) shingleNormal = toTexture(heightToNormal(blurCanvas(h, 0.6), 1.6), false);
    return { map: toTexture(c, true), normalMap: shingleNormal, metersPerRepeat: 3.0 };
  });
}

export function asphaltPbr(): PbrSet {
  return getOrMake('asphalt', () => {
    const size = 512;
    // Base: dark binder with fine light aggregate speckle and slow mottling.
    const color = tintedColor(size, 51, [64, 66, 70], 6, 34000, 1.2);
    const cctx = color.getContext('2d')!;
    const rnd = makeDecoRng(52);
    speckle(color, 22000, rnd, (r) => { const v = 96 + r() * 70; return [v, v, v - 4, 0.35 + r() * 0.4]; });
    for (let i = 0; i < 40; i++) {
      const g = 56 + rnd() * 26;
      cctx.fillStyle = `rgba(${g},${g},${g + 2},0.16)`;
      cctx.beginPath();
      cctx.ellipse(rnd() * size, rnd() * size, 60 + rnd() * 200, 40 + rnd() * 120, rnd() * 3, 0, Math.PI * 2);
      cctx.fill();
    }
    // Sealed cracks: dark meandering lines with a lighter edge. Kept faint: at full strength they
    // read as scribbles at the close camera and tile visibly along long streets.
    for (let i = 0; i < 5; i++) {
      let x = rnd() * size;
      let y = rnd() * size;
      cctx.lineWidth = 1.0 + rnd() * 0.6;
      cctx.strokeStyle = 'rgba(22,22,24,0.3)';
      cctx.beginPath();
      cctx.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        x += (rnd() - 0.5) * 70;
        y += (rnd() - 0.2) * 50;
        cctx.lineTo(x, y);
      }
      cctx.stroke();
    }
    const [h, hctx] = makeCanvas(size);
    noiseFill(hctx, size, 53, 128, 64, 30000, 1.2);
    const normal = heightToNormal(h, 0.7);
    const [r, rctx] = makeCanvas(size);
    noiseFill(rctx, size, 54, 218, 22, 17000, 2.5);
    return { map: toTexture(color, true), normalMap: toTexture(normal, false), roughnessMap: toTexture(r, false), metersPerRepeat: 7 };
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
    const size = 384;
    const [c, ctx] = makeCanvas(size);
    const [h, hctx] = makeCanvas(size);
    const rnd = makeDecoRng(71);
    ctx.fillStyle = '#b39a74';
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#606060';
    hctx.fillRect(0, 0, size, size);
    const cimg = ctx.getImageData(0, 0, size, size);
    const himg = hctx.getImageData(0, 0, size, size);
    for (let i = 0; i < 6000; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 0.8 + rnd() * 2.0;
      const t = 150 + rnd() * 90;
      rectData(cimg.data, size, x - r, y - r, r * 2, r * 1.6, t, t * 0.86, t * 0.66);
      const hv = 150 + rnd() * 80;
      rectData(himg.data, size, x - r, y - r, r * 2, r * 1.6, hv, hv, hv);
      rectData(himg.data, size, x - r * 0.5, y - r * 0.5, r, r * 0.6, hv + 40, hv + 40, hv + 40);
    }
    ctx.putImageData(cimg, 0, 0);
    hctx.putImageData(himg, 0, 0);
    const normal = heightToNormal(blurCanvas(h, 0.4), 1.0);
    return { map: toTexture(c, true), normalMap: toTexture(normal, false), metersPerRepeat: 1.6 };
  });
}

export function sandPbr(): PbrSet {
  return getOrMake('sand', () => {
    const size = 384;
    const color = tintedColor(size, 81, [205, 181, 141], 12, 22000, 1.4);
    const cctx = color.getContext('2d')!;
    const rnd = makeDecoRng(82);
    for (let i = 0; i < 40; i++) {
      cctx.fillStyle = `rgba(${150 + rnd() * 40},${120 + rnd() * 40},${80 + rnd() * 30},0.18)`;
      cctx.beginPath();
      cctx.ellipse(rnd() * size, rnd() * size, 40 + rnd() * 120, 20 + rnd() * 60, rnd() * 3, 0, Math.PI * 2);
      cctx.fill();
    }
    for (let i = 0; i < 160; i++) {
      cctx.fillStyle = `rgba(${120 + rnd() * 50},${100 + rnd() * 40},${70 + rnd() * 30},0.5)`;
      cctx.beginPath();
      cctx.arc(rnd() * size, rnd() * size, 0.8 + rnd() * 1.6, 0, Math.PI * 2);
      cctx.fill();
    }
    const [h, hctx] = makeCanvas(size);
    noiseFill(hctx, size, 83, 128, 24, 26000, 1.2);
    const normal = heightToNormal(blurCanvas(h, 0.7), 0.5);
    return { map: toTexture(color, true), normalMap: toTexture(normal, false), metersPerRepeat: 10 };
  });
}

export function lawnPbr(): PbrSet {
  return getOrMake('lawn', () => {
    const size = 256;
    const [c, ctx] = makeCanvas(size);
    const rnd = makeDecoRng(91);
    // Irrigated desert turf: a muted olive green with darker and sun-bleached blade speckle and soft
    // mottling, instead of a uniform saturated lime.
    ctx.fillStyle = '#5a7a3a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 14; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 30 + rnd() * 50;
      const warm = rnd() < 0.5;
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, warm ? 'rgba(150,150,80,0.22)' : 'rgba(40,70,30,0.25)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
    speckle(c, 22000, rnd, (r) => { const g = 95 + r() * 70; const dry = r() < 0.15; return dry ? [g * 0.95, g * 0.9, g * 0.5, 0.5] : [g * 0.62, g * 0.86, g * 0.4, 0.55]; });
    const [h, hctx] = makeCanvas(size);
    noiseFill(hctx, size, 92, 128, 40, 6000, 1.5);
    const normal = heightToNormal(h, 0.8);
    return { map: toTexture(c, true), normalMap: toTexture(normal, false), metersPerRepeat: 2 };
  });
}

/**
 * Single-ply roof membrane (TPO): a light warm gray with heat-welded roll seams every few metres,
 * faint foot-traffic paths and dust settling at the low spots, so flat commercial roofs read as a
 * surface instead of a glaring white slab from the overview camera.
 */
export function membranePbr(): PbrSet {
  return getOrMake('membrane', () => {
    const size = 256;
    const [c, ctx] = makeCanvas(size);
    const rnd = makeDecoRng(131);
    ctx.fillStyle = '#b9b8b2';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 10; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 30 + rnd() * 60;
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, rnd() < 0.5 ? 'rgba(120,105,85,0.16)' : 'rgba(255,255,250,0.14)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
    // Roll seams (two per tile) with their welded lap
    for (const y of [0, size / 2]) {
      ctx.fillStyle = 'rgba(90,88,82,0.35)';
      ctx.fillRect(0, y, size, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, y + 2, size, 3);
    }
    speckle(c, 5000, rnd, (r) => { const g = 150 + r() * 70; return [g, g * 0.98, g * 0.93, 0.35]; });
    const [h, hctx] = makeCanvas(size);
    noiseFill(hctx, size, 132, 128, 14, 3000, 1.2);
    hctx.fillStyle = 'rgb(150,150,150)';
    for (const y of [0, size / 2]) hctx.fillRect(0, y, size, 4);
    const normal = heightToNormal(h, 0.6);
    return { map: toTexture(c, true), normalMap: toTexture(normal, false), metersPerRepeat: 6 };
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

/** Vertical ribbed architectural metal panel (PBR-style wall panel, 0.3 m rib pitch). */
export function sidingPbr(): PbrSet {
  return getOrMake('siding', () => {
    const size = 384;
    const color = tintedColor(size, 111, [74, 79, 85], 4, 4000, 2);
    const cctx = color.getContext('2d')!;
    const [h, hctx] = makeCanvas(size);
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);
    const pitch = size / 7; // 7 ribs per 2 m repeat
    for (let x = 0; x < size; x += pitch) {
      // Trapezoid rib: ramp up, flat crown, ramp down
      const hg = hctx.createLinearGradient(x, 0, x + pitch * 0.42, 0);
      hg.addColorStop(0, '#808080');
      hg.addColorStop(0.3, '#d8d8d8');
      hg.addColorStop(0.7, '#d8d8d8');
      hg.addColorStop(1, '#808080');
      hctx.fillStyle = hg;
      hctx.fillRect(x, 0, pitch * 0.42, size);
      const cg = cctx.createLinearGradient(x, 0, x + pitch * 0.42, 0);
      cg.addColorStop(0, 'rgba(0,0,0,0.22)');
      cg.addColorStop(0.3, 'rgba(255,255,255,0.10)');
      cg.addColorStop(0.7, 'rgba(255,255,255,0.06)');
      cg.addColorStop(1, 'rgba(0,0,0,0.26)');
      cctx.fillStyle = cg;
      cctx.fillRect(x, 0, pitch * 0.42, size);
    }
    // Horizontal panel joint every repeat
    cctx.fillStyle = 'rgba(0,0,0,0.3)';
    cctx.fillRect(0, 0, size, 3);
    hctx.fillStyle = '#404040';
    hctx.fillRect(0, 0, size, 4);
    const normal = heightToNormal(blurCanvas(h, 0.8), 2.2);
    return { map: toTexture(color, true), normalMap: toTexture(normal, false), metersPerRepeat: 2.0 };
  });
}

/** Smooth composite (ACM) panel in charcoal with reveal joints: entry towers and sign backers. */
export function darkPanelPbr(): PbrSet {
  return getOrMake('dark-panel', () => {
    const size = 256;
    const color = tintedColor(size, 121, [38, 41, 46], 3, 2000, 2);
    const cctx = color.getContext('2d')!;
    const [h, hctx] = makeCanvas(size);
    hctx.fillStyle = '#a0a0a0';
    hctx.fillRect(0, 0, size, size);
    for (const v of [0, size / 2]) {
      cctx.fillStyle = 'rgba(0,0,0,0.5)';
      cctx.fillRect(v, 0, 4, size);
      cctx.fillRect(0, v, size, 4);
      hctx.fillStyle = '#303030';
      hctx.fillRect(v, 0, 4, size);
      hctx.fillRect(0, v, size, 4);
    }
    const normal = heightToNormal(blurCanvas(h, 0.6), 1.6);
    return { map: toTexture(color, true), normalMap: toTexture(normal, false), metersPerRepeat: 2.4 };
  });
}

/** Corrugated shipping-container steel with a horizontal rib pattern. */
export function corrugatedPbr(rgb: [number, number, number]): PbrSet {
  return getOrMake(`corrugated-${rgb.join()}`, () => {
    const size = 256;
    const color = tintedColor(size, 131, rgb, 6, 3000, 2);
    const cctx = color.getContext('2d')!;
    const [h, hctx] = makeCanvas(size);
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);
    const pitch = size / 8;
    for (let x = 0; x < size; x += pitch) {
      const hg = hctx.createLinearGradient(x, 0, x + pitch, 0);
      hg.addColorStop(0, '#606060');
      hg.addColorStop(0.5, '#d0d0d0');
      hg.addColorStop(1, '#606060');
      hctx.fillStyle = hg;
      hctx.fillRect(x, 0, pitch, size);
      const cg = cctx.createLinearGradient(x, 0, x + pitch, 0);
      cg.addColorStop(0, 'rgba(0,0,0,0.25)');
      cg.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      cg.addColorStop(1, 'rgba(0,0,0,0.25)');
      cctx.fillStyle = cg;
      cctx.fillRect(x, 0, pitch, size);
    }
    const normal = heightToNormal(blurCanvas(h, 1.0), 2.0);
    return { map: toTexture(color, true), normalMap: toTexture(normal, false), metersPerRepeat: 2.4 };
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
      // Paint, decals and ground plates under 3 cm tall cannot throw a visible shadow; keep them out of the shadow pass.
      merged.computeBoundingBox();
      const flat = merged.boundingBox!.max.y - merged.boundingBox!.min.y < 0.03;
      mesh.castShadow = shadows && !flat;
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
