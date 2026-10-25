import { useMemo } from 'react';
import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HOUSE_LOTS, HQ_LOT, PARK_LOT, ROAD_WIDTH, SIDEWALK_WIDTH, STREETS, WORLD_HALF, type Lot } from '@/game/world/cityLayout';
import { makeDecoRng } from '../assets/random';
import { yardPlan, type Species } from './yardLayout';
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

/** A single palm frond: tapered strip that droops toward the tip, with serrated leaflets. */
function frond(rnd: () => number, length = 3.2, color: THREE.Color): THREE.BufferGeometry {
  const segs = 7;
  const positions: number[] = [];
  const push = (v: THREE.Vector3) => positions.push(v.x, v.y, v.z);
  const spine = (t: number) => new THREE.Vector3(0, 0.3 * t - 1.1 * t * t, t * length);
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const w0 = 0.42 * (1 - t0 * 0.85) + 0.05;
    const w1 = 0.42 * (1 - t1 * 0.85) + 0.05;
    const a = spine(t0);
    const b = spine(t1);
    // Leaflets angle slightly down from the rachis.
    const droop0 = -0.18 * w0;
    const droop1 = -0.18 * w1;
    const l0 = a.clone().add(new THREE.Vector3(-w0, droop0, 0));
    const r0 = a.clone().add(new THREE.Vector3(w0, droop0, 0));
    const l1 = b.clone().add(new THREE.Vector3(-w1, droop1, 0));
    const r1 = b.clone().add(new THREE.Vector3(w1, droop1, 0));
    push(l0); push(r0); push(r1);
    push(l0); push(r1); push(l1);
    // Back faces so the frond is visible from below
    push(r0); push(l0); push(l1);
    push(r0); push(l1); push(r1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return colored(g, color, 0.12, rnd);
}

function buildSpecies(species: Species): THREE.BufferGeometry {
  const rnd = makeDecoRng(species.length * 977 + 13);
  switch (species) {
    case 'palm': {
      const parts: THREE.BufferGeometry[] = [];
      const h = 7.5;
      // Trunk with a slight lean and ring texture via stacked tapered segments
      const segments = 9;
      for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const r0 = 0.32 - t * 0.09;
        const r1 = 0.30 - t * 0.09;
        const seg = new THREE.CylinderGeometry(r1, r0 + 0.02, h / segments + 0.03, 10);
        parts.push(colored(transformed(seg, [t * 0.35, (i + 0.5) * (h / segments), 0]), new THREE.Color('#8b6b4a'), 0.14, rnd));
      }
      const top = new THREE.Vector3(0.35, h, 0);
      const fronds = 11;
      for (let i = 0; i < fronds; i++) {
        const a = (i / fronds) * Math.PI * 2 + rnd() * 0.3;
        const pitch = -0.1 - rnd() * 0.5;
        const f = frond(rnd, 3.0 + rnd() * 0.8, new THREE.Color(i % 3 === 0 ? '#5f8d3a' : '#6e9b45'));
        parts.push(transformed(f, [top.x, top.y + 0.2, top.z], [pitch, a, 0]));
      }
      // Dead hanging fronds
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const f = frond(rnd, 2.2, new THREE.Color('#9a7f4f'));
        parts.push(transformed(f, [top.x, top.y - 0.3, top.z], [1.6 + rnd() * 0.3, a, 0]));
      }
      parts.push(colored(transformed(new THREE.SphereGeometry(0.42, 8, 6), [top.x, top.y + 0.1, top.z]), new THREE.Color('#6b5a3e'), 0.1, rnd));
      return merge(parts);
    }
    case 'mesquite':
    case 'olive': {
      const parts: THREE.BufferGeometry[] = [];
      const leaf = species === 'olive' ? new THREE.Color('#7f9a6a') : new THREE.Color('#5d8a3f');
      const trunkColor = new THREE.Color(species === 'olive' ? '#7a6652' : '#6d5438');
      parts.push(colored(transformed(new THREE.CylinderGeometry(0.16, 0.26, 2.2, 8), [0, 1.1, 0], [0, 0, 0.08]), trunkColor, 0.1, rnd));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        parts.push(colored(transformed(new THREE.CylinderGeometry(0.07, 0.12, 1.6, 6), [Math.cos(a) * 0.5, 2.7, Math.sin(a) * 0.5], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]), trunkColor, 0.1, rnd));
      }
      const blobs: [number, number, number, number][] = [[0, 3.8, 0, 1.6], [1.1, 3.4, 0.4, 1.2], [-1.0, 3.5, -0.5, 1.1], [0.3, 3.2, 1.1, 1.0], [-0.3, 3.3, -1.1, 0.95], [0.6, 4.4, -0.3, 1.0]];
      for (const [x, y, z, r] of blobs) parts.push(colored(jittered(transformed(new THREE.IcosahedronGeometry(r, 1), [x, y, z]), 0.18, rnd), leaf, 0.14, rnd));
      return merge(parts);
    }
    case 'shrub-sage':
    case 'shrub-green':
    case 'shrub-red': {
      const color = species === 'shrub-sage' ? new THREE.Color('#9aa88a') : species === 'shrub-red' ? new THREE.Color('#6f7f49') : new THREE.Color('#5f8c3f');
      const parts = [colored(jittered(transformed(new THREE.IcosahedronGeometry(0.6, 1), [0, 0.5, 0], [0, 0, 0], [1, 0.8, 1]), 0.14, rnd), color, 0.16, rnd)];
      parts.push(colored(jittered(transformed(new THREE.IcosahedronGeometry(0.4, 1), [0.35, 0.4, 0.2]), 0.1, rnd), color, 0.16, rnd));
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
        const g = new THREE.ConeGeometry(0.11, len, 4);
        g.translate(0, len / 2, 0);
        parts.push(colored(transformed(g, [0, 0.05, 0], [tilt * Math.cos(a), 0, tilt * Math.sin(a)]), new THREE.Color('#7fa98a'), 0.1, rnd));
      }
      parts.push(colored(transformed(new THREE.ConeGeometry(0.1, 0.7, 4), [0, 0.4, 0]), new THREE.Color('#8ab596'), 0.05, rnd));
      return merge(parts);
    }
    case 'flower-pink':
    case 'flower-yellow': {
      const bloom = species === 'flower-pink' ? new THREE.Color('#e46aa7') : new THREE.Color('#f2c230');
      const parts = [colored(jittered(transformed(new THREE.IcosahedronGeometry(0.45, 1), [0, 0.4, 0], [0, 0, 0], [1, 0.75, 1]), 0.1, rnd), new THREE.Color('#4f7f36'), 0.14, rnd)];
      for (let i = 0; i < 9; i++) parts.push(colored(transformed(new THREE.SphereGeometry(0.07, 5, 4), [(rnd() - 0.5) * 0.7, 0.55 + rnd() * 0.25, (rnd() - 0.5) * 0.7]), bloom, 0.08, rnd));
      return merge(parts);
    }
    case 'barrel-cactus': {
      const parts = [colored(jittered(transformed(new THREE.SphereGeometry(0.38, 12, 8), [0, 0.36, 0], [0, 0, 0], [1, 0.9, 1]), 0.05, rnd), new THREE.Color('#4e7f3c'), 0.08, rnd)];
      parts.push(colored(transformed(new THREE.TorusGeometry(0.16, 0.05, 6, 12), [0, 0.68, 0], [Math.PI / 2, 0, 0]), new THREE.Color('#e0b24a'), 0.05, rnd));
      return merge(parts);
    }
    case 'rock':
      return colored(jittered(transformed(new THREE.DodecahedronGeometry(0.45, 0), [0, 0.3, 0], [0, 0, 0], [1.2, 0.8, 1]), 0.12, rnd), new THREE.Color('#a89272'), 0.1, rnd);
    case 'boulder': {
      const parts = [colored(jittered(transformed(new THREE.DodecahedronGeometry(0.9, 1), [0, 0.6, 0], [0, 0, 0], [1.3, 0.85, 1]), 0.2, rnd), new THREE.Color('#9c8468'), 0.1, rnd)];
      parts.push(colored(jittered(transformed(new THREE.DodecahedronGeometry(0.5, 0), [0.9, 0.35, 0.3]), 0.12, rnd), new THREE.Color('#a89272'), 0.1, rnd));
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
  // Headquarters: palms in the parking islands and along the west fence, agave at the sign.
  const hx = HQ_LOT.center.x;
  const hz = HQ_LOT.center.z;
  for (const [lx, lz] of [[-44, -34.5], [-30, -34.5], [-16, -34.5], [-44, 10.5], [-30, 10.5], [-16, 10.5], [-55, -30], [-55, -16], [-55, 18], [-55, 30]] as [number, number][]) {
    out.push({ species: 'palm', x: hx + lx, z: hz + lz, rotation: rnd() * 6.28, scale: 0.95 + rnd() * 0.3, tint: 0.95 + rnd() * 0.1 });
  }
  for (const [lx, lz] of [[-52, -15], [-48, -9], [-55, -24], [-55, 24], [-55, 34]] as [number, number][]) {
    out.push({ species: rnd() < 0.5 ? 'agave' : 'shrub-sage', x: hx + lx, z: hz + lz, rotation: rnd() * 6.28, scale: 0.9 + rnd() * 0.4, tint: 0.95 + rnd() * 0.1 });
  }
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
    out.push({ species: r < 0.6 ? 'shrub-sage' : r < 0.8 ? 'rock' : r < 0.9 ? 'boulder' : 'agave', x: Math.cos(a) * d, z: Math.sin(a) * d, rotation: rnd() * 6.28, scale: 1 + rnd() * 1.4, tint: 0.9 + rnd() * 0.2 });
  }
  return out;
}

const SPECIES: Species[] = ['palm', 'mesquite', 'olive', 'shrub-sage', 'shrub-green', 'shrub-red', 'agave', 'flower-pink', 'flower-yellow', 'rock', 'boulder', 'barrel-cactus'];

export function Vegetation() {
  const quality = useApp((s) => s.settings.quality);
  const density = quality === 'low' ? 0.35 : quality === 'medium' ? 0.7 : 1;
  const instances = useMemo(() => collectInstances(density), [density]);
  const geometries = useMemo(() => Object.fromEntries(SPECIES.map((s) => [s, buildSpecies(s)])) as Record<Species, THREE.BufferGeometry>, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: false }), []);
  return (
    <group name="vegetation">
      {SPECIES.map((species) => {
        const list = instances.filter((i) => i.species === species);
        if (list.length === 0) return null;
        return <SpeciesLayer key={species} geometry={geometries[species]} material={material} list={list} castShadow={species !== 'rock' && species !== 'flower-pink' && species !== 'flower-yellow'} />;
      })}
    </group>
  );
}

function SpeciesLayer({ geometry, material, list, castShadow }: { geometry: THREE.BufferGeometry; material: THREE.Material; list: Instance[]; castShadow: boolean }) {
  const ref = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    list.forEach((it, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rotation);
      m.compose(new THREE.Vector3(it.x, 0, it.z), q, new THREE.Vector3(it.scale, it.scale, it.scale));
      mesh.setMatrixAt(i, m);
      c.setScalar(it.tint);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  return <instancedMesh ref={ref} args={[geometry, material, list.length]} castShadow={castShadow} receiveShadow frustumCulled={false} />;
}
