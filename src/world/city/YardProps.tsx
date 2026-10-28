import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HOUSE_LOTS, type Lot } from '@/game/world/cityLayout';
import { propertyPlan, type PropKind } from './propertyPlan';
import { greenbelts } from './greenbelt';

/**
 * Outdoor furniture and yard props from the property plans (dining and bistro sets, loungers,
 * grills, sectionals, fire pits, umbrellas, sheds, pots, swing sets, carts, benches), authored in
 * Blender (tools/blender/yard_kit.py → models/props/yard-kit.glb). Material colours are baked into
 * vertex colours; cushions, canopies and ceramic are tinted per placement, so one asset reads in
 * many colour schemes. All placements are merged into two static meshes. Not selectable.
 */

const URL = `${import.meta.env.BASE_URL}models/props/yard-kit.glb`;
useGLTF.preload(URL);

const KINDS: PropKind[] = ['dining-set', 'bistro-set', 'lounge-chair', 'grill', 'sofa-set', 'fire-pit', 'umbrella', 'shed', 'planter-pot', 'swing-set', 'trash-bins', 'bench'];
const TINTED = new Set(['cushion', 'ceramic']);
const FACING_ROTATION: Record<Lot['facing'], number> = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };

// Fabric and pottery colours that suit the desert palette (sand, terracotta, sage, slate, teal, cream).
const FABRIC = ['#e9dcc4', '#c96f4a', '#8fa58a', '#5f6f7d', '#3f8f8a', '#d8b46a', '#f1ece2', '#9a5a46'];
const POTTERY = ['#e4ddd0', '#c9784f', '#4f5d66', '#b9a68a', '#2f3a40'];

interface Part { geometry: THREE.BufferGeometry; tinted: boolean }

/** Merges one named part into a fixed and a tinted geometry with material colours in vertex colours. */
function partsFor(root: THREE.Object3D, kind: PropKind): Part[] {
  const node = root.getObjectByName(kind);
  if (!node) return [];
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  const fixed: THREE.BufferGeometry[] = [];
  const tinted: THREE.BufferGeometry[] = [];
  node.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    let g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    const c = mat.color;
    // Metallic and rough finishes are flattened into one material: lift metals a little so
    // stainless still reads light under the sun.
    const lift = mat.metalness > 0.5 ? 1.15 : 1;
    for (let i = 0; i < n; i++) colors.set([c.r * lift, c.g * lift, c.b * lift], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    (TINTED.has(mat.name) ? tinted : fixed).push(g);
  });
  const out: Part[] = [];
  if (fixed.length) out.push({ geometry: BGU.mergeGeometries(fixed, false)!, tinted: false });
  if (tinted.length) out.push({ geometry: BGU.mergeGeometries(tinted, false)!, tinted: true });
  return out;
}

interface Placement { x: number; z: number; heading: number; seed: number }

function placements(): Record<PropKind, Placement[]> {
  const out = Object.fromEntries(KINDS.map((k) => [k, [] as Placement[]])) as Record<PropKind, Placement[]>;
  for (const lot of HOUSE_LOTS) {
    const plan = propertyPlan(lot);
    const rot = FACING_ROTATION[lot.facing];
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    plan.props.forEach((p, i) => {
      // Same local → world mapping as the house builder and the vegetation layer.
      out[p.kind].push({ x: lot.center.x + p.x * cos + p.z * sin, z: lot.center.z - p.x * sin + p.z * cos, heading: p.rot + rot, seed: (plan.seed >>> 3) + i * 7 });
    });
  }
  for (const gb of greenbelts()) gb.benches.forEach((b, i) => out.bench.push({ x: b.x, z: b.z, heading: b.rot, seed: i }));
  return out;
}

const fixedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 });
const tintedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });

/**
 * Bakes every placed prop into two static meshes: fixed parts and tinted parts (cushions, canopies,
 * pottery) with each placement's colour multiplied into its vertex colours. The props never move,
 * so this draws the whole yard kit in two calls (plus two in the shadow pass) instead of one
 * instanced mesh per kind and part.
 */
function bake(byKind: Record<PropKind, Part[]>, lists: Record<PropKind, Placement[]>): { fixed: THREE.BufferGeometry | null; tinted: THREE.BufferGeometry | null } {
  const fixed: THREE.BufferGeometry[] = [];
  const tinted: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  for (const kind of KINDS) {
    const palette = kind === 'planter-pot' ? POTTERY : FABRIC;
    for (const p of lists[kind]) {
      m.compose(new THREE.Vector3(p.x, 0, p.z), q.setFromAxisAngle(up, p.heading), new THREE.Vector3(1, 1, 1));
      for (const part of byKind[kind]) {
        const g = part.geometry.clone().applyMatrix4(m);
        if (part.tinted) {
          c.set(palette[p.seed % palette.length]);
          const col = g.attributes.color as THREE.BufferAttribute;
          for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
          tinted.push(g);
        } else fixed.push(g);
      }
    }
  }
  return { fixed: fixed.length ? BGU.mergeGeometries(fixed, false) : null, tinted: tinted.length ? BGU.mergeGeometries(tinted, false) : null };
}

export function YardProps() {
  const { scene } = useGLTF(URL);
  const baked = useMemo(() => {
    const byKind = Object.fromEntries(KINDS.map((k) => [k, partsFor(scene, k)])) as Record<PropKind, Part[]>;
    return bake(byKind, placements());
  }, [scene]);
  return (
    <group name="yard-props">
      {baked.fixed && <mesh name="yard:fixed" geometry={baked.fixed} material={fixedMaterial} castShadow receiveShadow raycast={() => null} />}
      {baked.tinted && <mesh name="yard:tinted" geometry={baked.tinted} material={tintedMaterial} castShadow receiveShadow raycast={() => null} />}
    </group>
  );
}
