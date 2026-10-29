import { useMemo } from 'react';
import * as THREE from 'three';
import { PARK_LOT, WORLD_HALF } from '@/game/world/cityLayout';
import { STATIC_MATERIALS } from '../buildings/materials';
import { applyWorldUVs } from '../assets/pbr';
import { makeDecoRng } from '../assets/random';
import { BUFFER, hinterland, terrainHeight } from './hinterlandLayout';

/**
 * Terrain: the valley floor, park turf, and three ranges of noise-displaced mountains that fade into
 * the haze. The floor's sand texture is broken up at landscape scale by a painted macro map (terrain
 * tone, washes, disturbed ground under the surrounding districts, roadside gravel), sampled twice at
 * unrelated scales and rotations so the tile repeat disappears, and faded toward its mean colour with
 * distance. Inside the playable district the macro map is neutral, so the district looks as before.
 */

const MACRO_HALF = 1800; // metres covered by the macro map (clamped beyond)
const MACRO_SIZE = 1024;
// Mean colour of the sand texture (sRGB), the reference the macro map is a ratio to.
const SAND_MEAN = [203, 179, 140];

function valueNoise(seed: number) {
  const rnd = makeDecoRng(seed);
  const n = 256;
  const table = Float32Array.from({ length: n * n }, () => rnd());
  const at = (i: number, j: number) => table[((j & (n - 1)) * n + (i & (n - 1))) | 0];
  return (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const u = fx * fx * (3 - 2 * fx);
    const w = fy * fy * (3 - 2 * fy);
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - w) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * w;
  };
}

const srgbToLinear = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

/** Paints the macro map: rgb = linear colour ratio to the sand mean (0.5 = 1×), a = blend noise for the second texture sample. */
function macroTexture(): THREE.DataTexture {
  const S = MACRO_SIZE;
  // 1. Colour layer in sRGB on a canvas (washes, parcels and roadsides are easiest drawn as shapes).
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const n1 = valueNoise(11);
  const n2 = valueNoise(12);
  const n3 = valueNoise(13);
  const img = ctx.createImageData(S, S);
  // Desert palette: sandy beige, desert tan, warm grey, muted brown, pale gravel.
  const pal = [
    [206, 184, 146],
    [194, 166, 124],
    [178, 166, 146],
    [168, 140, 108],
    [214, 203, 178],
  ];
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const x = i / 18;
      const y = j / 18;
      const broad = n1(x * 0.35, y * 0.35) * 0.65 + n1(x * 0.9 + 40, y * 0.9) * 0.35;
      const mid = n2(x * 2.2, y * 2.2);
      const fine = n3(x * 7, y * 7);
      let c = mix(pal[0], pal[1], Math.min(1, Math.max(0, broad * 1.6 - 0.3)));
      c = mix(c, pal[2], Math.max(0, mid - 0.55) * 1.6);
      c = mix(c, pal[3], Math.max(0, broad - 0.68) * 2.2);
      c = mix(c, pal[4], Math.max(0, 0.32 - mid) * 1.5);
      const k = 0.94 + fine * 0.12;
      const o = (j * S + i) * 4;
      img.data[o] = c[0] * k;
      img.data[o + 1] = c[1] * k;
      img.data[o + 2] = c[2] * k;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const toPx = (m: number) => ((m + MACRO_HALF) / (2 * MACRO_HALF)) * S;
  const ppm = S / (2 * MACRO_HALF);
  const h = hinterland();
  // 2. Vegetation stands in the open desert: darker olive-brown speckle gathered in irregular patches
  //    (free in the shader, and far more of it than 3D scrub could afford).
  const rnd = makeDecoRng(14);
  const veg = valueNoise(16);
  for (let k = 0; k < 26000; k++) {
    const px = rnd() * S;
    const py = rnd() * S;
    const d = veg(px / 24, py / 24) * 0.7 + veg(px / 7, py / 7) * 0.3;
    if (d < 0.55 + rnd() * 0.2) continue;
    ctx.fillStyle = `rgba(${92 + rnd() * 30},${88 + rnd() * 24},${62 + rnd() * 18},${0.25 + rnd() * 0.3})`;
    ctx.beginPath();
    ctx.arc(px, py, 0.6 + rnd() * 1.4, 0, 6.28);
    ctx.fill();
  }
  // 3. Disturbed and landscaped ground under built parcels, and light graded soil where tracts are
  //    being built out, painted with ragged, softened edges (never hard rectangles).
  const ragged = (c: { x0: number; x1: number; z0: number; z1: number }, style: string, inset: number, jitter: number, blur: number) => {
    const pts: [number, number][] = [];
    const x0 = toPx(c.x0 + inset);
    const x1 = toPx(c.x1 - inset);
    const z0 = toPx(c.z0 + inset);
    const z1 = toPx(c.z1 - inset);
    const along = (a: [number, number], b: [number, number], n: number) => {
      for (let i = 0; i < n; i++) {
        const t = i / n;
        pts.push([a[0] + (b[0] - a[0]) * t + (rnd() - 0.5) * jitter, a[1] + (b[1] - a[1]) * t + (rnd() - 0.5) * jitter]);
      }
    };
    const n = Math.max(4, Math.round(Math.max(x1 - x0, z1 - z0) / 6));
    along([x0, z0], [x1, z0], n);
    along([x1, z0], [x1, z1], n);
    along([x1, z1], [x0, z1], n);
    along([x0, z1], [x0, z0], n);
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = style;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  for (const c of h.cells) {
    if (c.kind === 'desert' || c.kind === 'buffer' || c.kind === 'park') continue;
    if (c.kind === 'graded') {
      ragged(c, 'rgba(222,208,180,0.6)', 2, 9, 2);
      // Grader and truck tracks across the pad.
      ctx.strokeStyle = 'rgba(170,150,118,0.35)';
      ctx.lineWidth = 0.8;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.moveTo(toPx(c.x0 + rnd() * (c.x1 - c.x0)), toPx(c.z0 + rnd() * (c.z1 - c.z0)));
        ctx.quadraticCurveTo(toPx(c.x0 + rnd() * (c.x1 - c.x0)), toPx(c.z0 + rnd() * (c.z1 - c.z0)), toPx(c.x0 + rnd() * (c.x1 - c.x0)), toPx(c.z0 + rnd() * (c.z1 - c.z0)));
        ctx.stroke();
      }
      continue;
    }
    const tone = c.kind === 'golf' ? 'rgba(170,160,128,0.5)' : `rgba(${186 + rnd() * 16},${170 + rnd() * 14},${142 + rnd() * 14},0.5)`;
    ragged(c, tone, 0, 3, 1.5);
  }
  // 4. Roadside gravel shoulders along every scenic road (lighter, greyer).
  ctx.lineCap = 'butt';
  for (const r of h.roads) {
    ctx.strokeStyle = 'rgba(196,188,170,0.55)';
    ctx.lineWidth = (r.width + 14) * ppm;
    ctx.beginPath();
    if (r.axis === 'x') {
      ctx.moveTo(toPx(r.from), toPx(r.at));
      ctx.lineTo(toPx(r.to), toPx(r.at));
    } else {
      ctx.moveTo(toPx(r.at), toPx(r.from));
      ctx.lineTo(toPx(r.at), toPx(r.to));
    }
    ctx.stroke();
  }
  // 5. Washes: a wide grey-tan floodplain, a pale sand bed, darker vegetated banks.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const stroke = (pts: { x: number; z: number }[], width: number, style: string) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width * ppm;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(toPx(p.x), toPx(p.z)) : ctx.moveTo(toPx(p.x), toPx(p.z))));
    ctx.stroke();
  };
  for (const w of h.washes) {
    stroke(w, 80, 'rgba(176,164,136,0.22)');
    stroke(w, 40, 'rgba(162,152,126,0.3)');
    stroke(w, 22, 'rgba(226,216,192,0.8)');
    stroke(w, 9, 'rgba(234,226,206,0.7)');
    for (const p of w) for (let k = 0; k < 4; k++) {
      ctx.fillStyle = 'rgba(128,126,96,0.35)';
      const a = rnd() * 6.28;
      const d = 12 + rnd() * 10;
      ctx.beginPath();
      ctx.arc(toPx(p.x + Math.cos(a) * d), toPx(p.z + Math.sin(a) * d), (0.6 + rnd()) * ppm * 2, 0, 6.28);
      ctx.fill();
    }
  }
  // 6. Neutral inside the playable district, blending out over the buffer.
  const src = ctx.getImageData(0, 0, S, S).data;
  const out = new Uint8Array(S * S * 4);
  const mean = SAND_MEAN.map(srgbToLinear);
  const blendNoise = valueNoise(15);
  for (let j = 0; j < S; j++) {
    const z = (j / S) * 2 * MACRO_HALF - MACRO_HALF;
    for (let i = 0; i < S; i++) {
      const x = (i / S) * 2 * MACRO_HALF - MACRO_HALF;
      const edge = Math.max(Math.abs(x), Math.abs(z));
      const t = Math.min(1, Math.max(0, (edge - (WORLD_HALF - 5)) / (BUFFER - WORLD_HALF + 30)));
      const o = (j * S + i) * 4;
      for (let k = 0; k < 3; k++) {
        const ratio = srgbToLinear(src[o + k]) / mean[k];
        out[o + k] = Math.min(255, Math.round(0.5 * (1 + (ratio - 1) * t) * 255));
      }
      out[o + 3] = Math.round(blendNoise(i / 40, j / 40) * 255);
    }
  }
  const tex = new THREE.DataTexture(out, S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function desertFloorMaterial(): THREE.MeshStandardMaterial {
  const base = STATIC_MATERIALS.sand() as THREE.MeshStandardMaterial;
  const m = base.clone();
  const macro = macroTexture();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMacro = { value: macro };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uMacro;\nvarying vec3 vGround;`)
      .replace(
        '#include <map_fragment>',
        `vec4 macro = texture2D(uMacro, vGround.xz / ${(2 * MACRO_HALF).toFixed(1)} + 0.5);
        // Two samples of the sand texture at unrelated scales and rotations, mixed by low-frequency noise: no visible repeat.
        // Fine detail fades to the texture's mean with distance (it only reads as repetition far away);
        // beyond that the texture is not fetched at all.
        float far = smoothstep(200.0, 1100.0, distance(vGround, cameraPosition));
        vec4 sampledDiffuseColor = vec4(${SAND_MEAN.map((c) => srgbToLinear(c).toFixed(4)).join(', ')}, 1.0);
        if (far < 0.999) {
          vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.37 + vec2(0.31, 0.77);
          vec4 s1 = texture2D(map, vMapUv);
          vec4 s2 = texture2D(map, uv2);
          sampledDiffuseColor = mix(mix(s1, s2, smoothstep(0.3, 0.7, macro.a)), sampledDiffuseColor, far);
        }
        diffuseColor *= sampledDiffuseColor;
        diffuseColor.rgb *= macro.rgb * 2.0;`,
      );
  };
  m.customProgramCacheKey = () => 'desert-floor-v2';
  return m;
}

export function Ground() {
  const floor = useMemo(() => {
    const size = 5200;
    const g = new THREE.PlaneGeometry(size, size, 160, 160);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)) - 0.02);
    g.computeVertexNormals();
    applyWorldUVs(g, 10);
    return g;
  }, []);
  const sand = useMemo(() => desertFloorMaterial(), []);
  const lawn = useMemo(() => STATIC_MATERIALS.lawn(), []);
  const parkGeo = useMemo(() => applyWorldUVs(new THREE.PlaneGeometry(PARK_LOT.width - 2, PARK_LOT.depth - 2).rotateX(-Math.PI / 2), 2), []);
  return (
    <group name="terrain">
      {/* Drawn after the other opaque geometry, so roads, lots and districts on top of it are depth-rejected instead of shaded twice. */}
      <mesh geometry={floor} material={sand} receiveShadow renderOrder={10} />
      <mesh geometry={parkGeo} material={lawn} position={[PARK_LOT.center.x, 0.02, PARK_LOT.center.z]} receiveShadow />
      <Mountains />
    </group>
  );
}

/**
 * A ring of ranges: angular segments × radial rows, displaced by layered sine noise. The ring's
 * inner radius and height vary with direction: the Spring Mountains rise close and high in the
 * west; the valley stays open longer to the east, where the ranges are lower and further away.
 * The outermost range stays within 2.3 km so it is inside the camera's far plane from anywhere the
 * camera can pan.
 */
function mountainRing(radius: number, width: number, height: number, seed: number, segments: number, palette: [string, string, string]): THREE.BufferGeometry {
  const rows = 12;
  const positions: number[] = [];
  const rnd = makeDecoRng(seed);
  const bumps = Array.from({ length: 14 }, () => [rnd() * Math.PI * 2, 0.5 + rnd() * 0.5, 2 + Math.floor(rnd() * 7)]);
  const ridges = Array.from({ length: 5 }, (_, i) => [rnd() * Math.PI * 2, 14 + i * 13 + rnd() * 8, 0.5 / (i + 1), rnd() * 6]);
  // Direction (angle a, x = cos a): west (a = π) closer and higher, east further and lower.
  const westness = (a: number) => (1 - Math.cos(a)) / 2;
  const heightAt = (a: number, t: number) => {
    let h = 0;
    for (const [phase, amp, freq] of bumps) h += amp * Math.max(0, Math.sin(a * freq + phase));
    let r = 0;
    for (const [phase, freq, amp, tw] of ridges) r += amp * Math.pow(1 - Math.abs(Math.sin(a * freq + phase + t * tw)), 1.5);
    const profile = Math.pow(Math.sin(t * Math.PI), 0.8);
    const tall = 0.75 + 0.75 * westness(a);
    const crest = h * height * 0.26 * profile * tall;
    return crest * (0.82 + 0.3 * r) + r * height * 0.05 * profile + rnd() * 1.5 * profile;
  };
  const grid: THREE.Vector3[][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const r0 = radius + 260 * (1 - westness(a));
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      const r = r0 + t * width;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      row.push(new THREE.Vector3(x, heightAt(a, t) + terrainHeight(x, z) - 2, z));
    }
    grid.push(row);
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rows; j++) {
      const p00 = grid[i][j];
      const p10 = grid[i + 1][j];
      const p01 = grid[i][j + 1];
      const p11 = grid[i + 1][j + 1];
      positions.push(p00.x, p00.y, p00.z, p01.x, p01.y, p01.z, p10.x, p10.y, p10.z);
      positions.push(p10.x, p10.y, p10.z, p01.x, p01.y, p01.z, p11.x, p11.y, p11.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Altitude-banded vertex colours: alluvial fans at the base, rock bands, paler limestone caps.
  const colors = new Float32Array(positions.length);
  const [low, mid, high] = palette.map((c) => new THREE.Color(c));
  const tmp = new THREE.Color();
  const shade = makeDecoRng(seed + 7);
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    const t = THREE.MathUtils.clamp(y / (height * 1.1), 0, 1);
    if (t < 0.4) tmp.copy(low).lerp(mid, t / 0.4);
    else tmp.copy(mid).lerp(high, (t - 0.4) / 0.6);
    tmp.multiplyScalar(0.94 + shade() * 0.1);
    colors[i] = tmp.r;
    colors[i + 1] = tmp.g;
    colors[i + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function Mountains() {
  const near = useMemo(() => mountainRing(1380, 300, 70, 77, 360, ['#b49a7c', '#94705a', '#a88a74']), []);
  const far = useMemo(() => mountainRing(1620, 380, 110, 99, 300, ['#a8957f', '#8a6f60', '#a69486']), []);
  const distant = useMemo(() => mountainRing(1840, 200, 150, 123, 240, ['#a39689', '#8c7d74', '#b2a79f']), []);
  const material = useMemo(() => {
    // Ranges keep part of their contrast through the haze (aerial perspective at 60 % of the scene fog), so the skyline reads.
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', '#ifdef USE_FOG\n  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * 0.62;\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);\n#endif');
    };
    return m;
  }, []);
  return (
    <group name="mountains">
      <mesh geometry={near} material={material} frustumCulled={false} />
      <mesh geometry={far} material={material} frustumCulled={false} />
      <mesh geometry={distant} material={material} frustumCulled={false} />
    </group>
  );
}
