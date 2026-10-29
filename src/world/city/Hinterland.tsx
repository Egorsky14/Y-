import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getGameState, useApp } from '@/app/store';
import { sunAngles } from '@/game/simulation/weather';
import { SIDEWALK_WIDTH } from '@/game/world/cityLayout';
import { hipRoofGeometry, MeshBuilder } from '../assets/pbr';
import { STATIC_MATERIALS, UV_SCALES } from '../buildings/materials';
import { hinterland, roadReserve, terrainHeight, type Box, type Flat, type Hinterland as Layout, type ScenicRoad } from './hinterlandLayout';

/**
 * Renders the visual-only world around the playable district (hinterland.ts): scenic roads in the
 * playable streets' materials, and the surrounding districts as a few instanced meshes per 1 km
 * chunk (walls and buildings, roofs, ground patches in three layers, tree crowns, trunks, scrub).
 * Nothing casts shadows or takes part in picking. Building walls get windows from a small shader
 * patch (lit at night), so tract houses read as houses rather than blocks from the strategy camera.
 */

const CHUNK = 1067;
/** Scenic roads within this Chebyshev distance use the playable streets' PBR materials. */
const NEAR = 520;
const chunkKey = (x: number, z: number) => `${Math.floor((x + 1600) / CHUNK)},${Math.floor((z + 1600) / CHUNK)}`;
const noRaycast = () => undefined;

/** Night factor shared by the window glow and the street lights (matches Atmosphere's lamp ramp). */
const night = { value: 0 };

function buildingMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = night;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWall;\nvarying vec3 vWallN;\nvarying float vSeed;\nvarying float vBoxH;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vWall = position * sc;
        vWallN = normal;
        vBoxH = sc.y;
        vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec3 vWall;\nvarying vec3 vWallN;\nvarying float vSeed;\nvarying float vBoxH;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wallH = vWall.y;
        float win = 0.0;
        if (abs(vWallN.y) < 0.5) {
          float u = abs(vWallN.x) > 0.5 ? vWall.z : vWall.x;
          float storey = mod(wallH, 2.9);
          float bay = fract(u / 3.4 + vSeed);
          win = step(1.0, storey) * step(storey, 2.15) * step(0.3, bay) * step(bay, 0.68);
          // Only on buildings (walls and rooftop units are lower than 2.4 m).
          win *= step(2.4, vBoxH);
          // Commercial and industrial boxes (taller than a two-storey house): an office band at street level only.
          if (vBoxH > 7.0) win *= step(wallH, 3.0) * step(0.5, fract(u / 17.0));
          // A darker plinth line grounds every wall.
          diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 0.35, wallH));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.13, 0.15), win * 0.8);
        }
        `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float lit = step(0.45, fract(vSeed * 7.31 + floor((abs(vWallN.x) > 0.5 ? vWall.z : vWall.x) / 3.4) * 0.37));
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * win * lit * uNight * 1.6;`,
      );
  };
  return m;
}

interface ChunkData {
  boxes: Box[];
  roofs: Layout['roofs'];
  flats: Flat[][];
  crowns: Layout['trees'];
  palms: Layout['trees'];
  shrubs: Layout['shrubs'];
}

function chunked(h: Layout, scrub: number): Map<string, ChunkData> {
  const out = new Map<string, ChunkData>();
  const get = (x: number, z: number) => {
    const k = chunkKey(x, z);
    let c = out.get(k);
    if (!c) out.set(k, (c = { boxes: [], roofs: [], flats: [[], [], []], crowns: [], palms: [], shrubs: [] }));
    return c;
  };
  for (const b of h.boxes) get(b.x, b.z).boxes.push(b);
  for (const r of h.roofs) get(r.x, r.z).roofs.push(r);
  for (const f of h.flats) get(f.x, f.z).flats[f.layer].push(f);
  for (const t of h.trees) (t.palm ? get(t.x, t.z).palms : get(t.x, t.z).crowns).push(t);
  h.shrubs.forEach((s, i) => {
    if (i % 1000 < scrub * 1000) get(s.x, s.z).shrubs.push(s);
  });
  return out;
}

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  roof: (() => {
    const g = hipRoofGeometry(1.35, 1, 1, 0);
    g.scale(1 / 1.35, 1, 1);
    return g;
  })(),
  flat: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  crown: new THREE.IcosahedronGeometry(1, 0),
  palm: (() => {
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(1, 0.45, 1);
    return g;
  })(),
  trunk: new THREE.CylinderGeometry(0.1, 0.16, 1, 5, 1, true).translate(0, 0.5, 0),
  shrub: (() => {
    const g = new THREE.IcosahedronGeometry(1, 0);
    g.scale(1, 0.55, 1);
    g.translate(0, 0.25, 0);
    return g;
  })(),
};

function instanced(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, n: number, fill: (i: number, m: THREE.Matrix4, c: THREE.Color) => void): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, n);
  mesh.name = name;
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    fill(i, m, c);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = noRaycast;
  return mesh;
}

const q = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const s = new THREE.Vector3();

function buildDistricts(h: Layout, scrub: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'hinterland:districts';
  const mats = {
    building: buildingMaterial(),
    // Lambert throughout: these are small and distant on screen, so the PBR specular term buys nothing.
    roof: new THREE.MeshLambertMaterial(),
    flat: [0, 1, 2].map((layer) => new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -1 - layer, polygonOffsetUnits: -2 - layer * 2 })),
    crown: new THREE.MeshLambertMaterial({ flatShading: true }),
    trunk: new THREE.MeshLambertMaterial({ color: '#6b5640' }),
    shrub: new THREE.MeshLambertMaterial({ flatShading: true }),
  };
  for (const [key, c] of chunked(h, scrub)) {
    const add = (mesh: THREE.InstancedMesh | null) => mesh && group.add(mesh);
    if (c.boxes.length)
      add(instanced(`hinterland:buildings:${key}`, GEO.box, mats.building, c.boxes.length, (i, m, col) => {
        const b = c.boxes[i];
        m.compose(v.set(b.x, (b.y ?? 0) + terrainHeight(b.x, b.z), b.z), q.identity(), s.set(b.w, b.h, b.d));
        col.setHex(b.color);
      }));
    if (c.roofs.length)
      add(instanced(`hinterland:roofs:${key}`, GEO.roof, mats.roof, c.roofs.length, (i, m, col) => {
        const r = c.roofs[i];
        q.setFromAxisAngle(yAxis, r.turn ? Math.PI / 2 : 0);
        m.compose(v.set(r.x, r.y + terrainHeight(r.x, r.z), r.z), q, r.turn ? s.set(r.d, r.h, r.w) : s.set(r.w, r.h, r.d));
        col.setHex(r.color);
      }));
    c.flats.forEach((list, layer) => {
      if (!list.length) return;
      add(instanced(`hinterland:ground${layer}:${key}`, GEO.flat, mats.flat[layer], list.length, (i, m, col) => {
        const f = list[i];
        q.setFromAxisAngle(yAxis, f.rot ?? 0);
        m.compose(v.set(f.x, 0.05 + layer * 0.03 + terrainHeight(f.x, f.z), f.z), q, s.set(f.w, 1, f.d));
        col.setHex(f.color);
      }));
    });
    const trees = [...c.crowns, ...c.palms];
    if (trees.length) {
      add(instanced(`hinterland:trunks:${key}`, GEO.trunk, mats.trunk, trees.length, (i, m, col) => {
        const t = trees[i];
        m.compose(v.set(t.x, terrainHeight(t.x, t.z), t.z), q.identity(), s.set(t.palm ? 1.4 : 2, t.h + (t.palm ? 0 : t.r * 0.4), t.palm ? 1.4 : 2));
        col.setRGB(1, 1, 1);
      }));
      add(instanced(`hinterland:crowns:${key}`, GEO.crown, mats.crown, trees.length, (i, m, col) => {
        const t = trees[i];
        q.setFromAxisAngle(yAxis, (t.x * 0.37 + t.z) % 6.28);
        m.compose(v.set(t.x, terrainHeight(t.x, t.z) + t.h + (t.palm ? 0.2 : t.r * 0.75), t.z), q, t.palm ? s.set(t.r * 1.5, t.r, t.r * 1.5) : s.set(t.r, t.r * 0.85, t.r));
        col.setHex(t.color);
      }));
    }
    if (c.shrubs.length)
      add(instanced(`hinterland:scrub:${key}`, GEO.shrub, mats.shrub, c.shrubs.length, (i, m, col) => {
        const sh = c.shrubs[i];
        q.setFromAxisAngle(yAxis, sh.x % 6.28);
        m.compose(v.set(sh.x, terrainHeight(sh.x, sh.z), sh.z), q, s.set(sh.s, sh.s, sh.s));
        col.setHex(sh.color);
      }));
  }
  return group;
}

/** Scenic roads with the playable streets' cross-section: asphalt, gutters, curbs, sidewalks, markings. */
function buildRoads(roads: ScenicRoad[]): THREE.Group {
  const mats: Record<string, THREE.Material> = {
    asphalt: STATIC_MATERIALS.asphalt(),
    concrete: STATIC_MATERIALS.concrete(),
    // Beyond NEAR the roads are only a few pixels wide: plain Lambert shading instead of the PBR set.
    asphaltFar: new THREE.MeshLambertMaterial({ color: '#45474b' }),
    concreteFar: new THREE.MeshLambertMaterial({ color: '#bdb8ad' }),
    curb: new THREE.MeshLambertMaterial({ color: '#c9c4b8' }),
    median: new THREE.MeshLambertMaterial({ color: '#a58f70' }),
    white: new THREE.MeshLambertMaterial({ color: '#e8e8e4', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    yellow: new THREE.MeshLambertMaterial({ color: '#e2c45a', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  };
  const b = new MeshBuilder(mats, { asphalt: UV_SCALES.asphalt, concrete: UV_SCALES.concrete });
  const CURB = 0.15;
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (const r of roads) {
    const isX = r.axis === 'x';
    const half = r.width / 2;
    const P = (along: number, across: number, y: number): [number, number, number] => (isX ? [along, y, r.at + across] : [r.at + across, y, along]);
    const S = (alongLen: number, acrossLen: number, h: number): [number, number, number] => (isX ? [alongLen, h, acrossLen] : [acrossLen, h, alongLen]);
    // Gaps in curbs, sidewalks, medians and markings where perpendicular roads cross.
    const gaps = roads
      .filter((o) => o.axis !== r.axis && r.at >= o.from && r.at <= o.to && o.at > r.from - 20 && o.at < r.to + 20)
      .map((o) => [o.at - roadReserve(o.kind), o.at + roadReserve(o.kind)] as [number, number])
      .sort((a, c) => a[0] - c[0]);
    const spans: [number, number][] = [];
    let a0 = r.from;
    for (const [g0, g1] of gaps) {
      if (g0 > a0) spans.push([a0, Math.min(g0, r.to)]);
      a0 = Math.max(a0, g1);
    }
    if (a0 < r.to) spans.push([a0, r.to]);
    // Pieces split where the road enters or leaves the near zone (playable-matching materials).
    const split = ([s0, s1]: [number, number]): [number, number][] => {
      const cuts = [s0, ...[-NEAR, NEAR].filter((c) => c > s0 && c < s1), s1];
      return cuts.slice(1).map((c, i) => [cuts[i], c] as [number, number]);
    };
    const near = (s0: number, s1: number) => Math.max(Math.abs((s0 + s1) / 2), Math.abs(r.at)) < NEAR;
    // Asphalt runs the full length (crossings overlap with the same world-space texture).
    for (const [p0, p1] of split([r.from, r.to])) {
      const segs = Math.ceil((p1 - p0) / 400);
      for (let k = 0; k < segs; k++) {
        const s0 = p0 + ((p1 - p0) * k) / segs;
        const s1 = p0 + ((p1 - p0) * (k + 1)) / segs;
        b.box(near(s0, s1) ? 'asphalt' : 'asphaltFar', S(s1 - s0, r.width + 0.6, 0.08), P((s0 + s1) / 2, 0, 0));
      }
    }
    const walk = r.kind === 'collector' ? SIDEWALK_WIDTH : 2.5;
    for (const [s0, s1] of spans.flatMap(split)) {
      const len = s1 - s0;
      if (len < 1) continue;
      const c = (s0 + s1) / 2;
      const concrete = near(s0, s1) ? 'concrete' : 'concreteFar';
      for (const side of [-1, 1]) {
        b.box(concrete, S(len, 0.5, 0.06), P(c, side * (half + 0.05), 0.02));
        b.box('curb', S(len, 0.3, CURB), P(c, side * (half + 0.4), CURB / 2));
        b.box(concrete, S(len, walk, CURB), P(c, side * (half + 0.55 + walk / 2), CURB / 2 - 0.005));
        b.add('white', plane, P(c, side * (half - 0.35), 0.045), [0, 0, 0], S(len - 2, 0.12, 1));
      }
      if (r.kind === 'parkway') {
        b.box('curb', S(len - 4, 6.3, CURB + 0.02), P(c, 0, CURB / 2));
        b.box('median', S(len - 4, 5.7, 0.05), P(c, 0, CURB + 0.02));
      } else if (r.kind === 'arterial') {
        for (const off of [-0.12, 0.12]) b.add('yellow', plane, P(c, off, 0.045), [0, 0, 0], S(len - 2, 0.12, 1));
      }
      // Dashed lines: the centre line on collectors, lane lines on arterials and parkways.
      const lanes = r.kind === 'collector' ? [0] : r.kind === 'arterial' ? [-half / 2, half / 2] : [-half * 0.62, half * 0.62];
      const yellow = r.kind === 'collector';
      for (let d = s0 + 4; d < s1 - 4; d += 9) for (const off of lanes) b.add(yellow ? 'yellow' : 'white', plane, P(d + 1.5, off, 0.045), [0, 0, 0], S(3, 0.14, 1));
    }
  }
  const g = b.build('hinterland:roads', false);
  g.traverse((o) => {
    o.raycast = noRaycast;
  });
  return g;
}

function buildLights(h: Layout): THREE.Points {
  const pos = new Float32Array(h.lights.length * 3);
  const col = new Float32Array(h.lights.length * 3);
  h.lights.forEach((l, i) => {
    pos.set([l.x, 8.5 + terrainHeight(l.x, l.z), l.z], i * 3);
    col.set(l.warm ? [1, 0.75, 0.45] : [1, 0.9, 0.75], i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const p = new THREE.Points(g, m);
  p.name = 'hinterland:lights';
  p.raycast = noRaycast;
  p.visible = false;
  return p;
}

export function Hinterland() {
  const quality = useApp((st) => st.settings.quality);
  const layout = useMemo(() => hinterland(), []);
  const roads = useMemo(() => buildRoads(layout.roads), [layout]);
  const scrub = quality === 'low' ? 0.15 : quality === 'medium' ? 0.25 : 1;
  const districts = useMemo(() => buildDistricts(layout, scrub), [layout, scrub]);
  const lights = useMemo(() => buildLights(layout), [layout]);
  useEffect(
    () => () => {
      districts.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
    },
    [districts],
  );
  useFrame(() => {
    const minute = getGameState()?.clock.minute ?? 600;
    const { elevation } = sunAngles(minute);
    night.value = 1 - THREE.MathUtils.clamp((elevation + 0.05) / 0.3, 0, 1);
    const m = lights.material as THREE.PointsMaterial;
    m.opacity = night.value * 0.95;
    lights.visible = night.value > 0.02;
  });
  return (
    <group name="hinterland">
      <primitive object={roads} />
      <primitive object={districts} />
      <primitive object={lights} />
    </group>
  );
}
