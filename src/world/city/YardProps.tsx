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
 * Blender (tools/blender/yard_kit.py → models/props/yard-kit.glb). Each kind is drawn as at most
 * two InstancedMeshes: a fixed part (frames, wood, metal, baked into vertex colours) and a tinted
 * part (cushions, canopies, ceramic) that takes a per-instance colour, so one asset reads in many
 * colour schemes for a handful of draw calls. Not selectable.
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

function KindLayer({ parts, list, kind }: { parts: Part[]; list: Placement[]; kind: PropKind }) {
  const setup = (part: Part) => (im: THREE.InstancedMesh | null) => {
    if (!im) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const palette = kind === 'planter-pot' ? POTTERY : FABRIC;
    list.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, 0, p.z), q.setFromAxisAngle(up, p.heading), new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m);
      if (part.tinted) im.setColorAt(i, c.set(palette[p.seed % palette.length]));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  };
  return (
    <>
      {parts.map((p, i) => (
        <instancedMesh key={i} name={`yard:${kind}:${p.tinted ? 'tint' : 'fixed'}`} ref={setup(p)} args={[p.geometry, p.tinted ? tintedMaterial : fixedMaterial, list.length]} castShadow={kind !== 'planter-pot'} receiveShadow raycast={() => null} />
      ))}
    </>
  );
}

export function YardProps() {
  const { scene } = useGLTF(URL);
  const byKind = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, partsFor(scene, k)])) as Record<PropKind, Part[]>, [scene]);
  const lists = useMemo(() => placements(), []);
  return (
    <group name="yard-props">
      {KINDS.map((k) => (lists[k].length > 0 && byKind[k].length > 0 ? <KindLayer key={k} kind={k} parts={byKind[k]} list={lists[k]} /> : null))}
    </group>
  );
}
