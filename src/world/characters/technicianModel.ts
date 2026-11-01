import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EmployeeRole } from '@/game/employees/roles';
import { PALETTE } from '../assets/palette';

/**
 * The Blender-authored character (tools/blender/technician.py → public/models/characters/technician.glb):
 * a continuous skinned body in three builds, four face shapes, hair, beards, cap, boots and uniform
 * details, all skinned to one 13-bone armature named like the game rig (Worker.tsx).
 *
 * Per character the parts it wears are merged into one skinned mesh per material (about ten draw calls
 * for the whole figure), cached per appearance, and bound to a fresh skeleton built from the joint table
 * below. The bind matrices are computed here from that table, so every bone's zero rotation is the
 * canonical rig pose (Worker.tsx's clips set rotations relative to it) and Blender's bone rolls never
 * matter. Appearance is a pure function of the employee's `look` seed: same employee, same face, on
 * every load; it never touches attributes or skills.
 */

export const CHARACTER_URL = `${import.meta.env.BASE_URL}models/characters/technician.glb`;

/** Shoulder joints sit this far either side of the spine (rig metres), as in the Blender script. */
export const SHOULDER_X = 0.2;
/** The arms are modelled abducted this far (radians) so their surface stays clear of the torso. */
const ARM_ABDUCT = 0.3;
export const PELVIS_Y = 0.95;

type BoneName = 'pelvis' | 'torso' | 'head' | 'armL' | 'armR' | 'foreL' | 'foreR' | 'legL' | 'legR' | 'shinL' | 'shinR' | 'footL' | 'footR';
export const BONE_NAMES: BoneName[] = ['pelvis', 'torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR'];
/** Parent and local offset of every bone in the canonical pose (rig metres). */
const RIG: Record<BoneName, { parent: BoneName | null; at: [number, number, number] }> = {
  pelvis: { parent: null, at: [0, PELVIS_Y, 0] },
  torso: { parent: 'pelvis', at: [0, 0.06, 0] },
  head: { parent: 'torso', at: [0, 0.585, 0] },
  armL: { parent: 'torso', at: [-SHOULDER_X, 0.5, 0] },
  armR: { parent: 'torso', at: [SHOULDER_X, 0.5, 0] },
  foreL: { parent: 'armL', at: [0, -0.3, 0] },
  foreR: { parent: 'armR', at: [0, -0.3, 0] },
  legL: { parent: 'pelvis', at: [-0.1, -0.05, 0] },
  legR: { parent: 'pelvis', at: [0.1, -0.05, 0] },
  shinL: { parent: 'legL', at: [0, -0.45, 0] },
  shinR: { parent: 'legR', at: [0, -0.45, 0] },
  footL: { parent: 'shinL', at: [0, -0.42, 0] },
  footR: { parent: 'shinR', at: [0, -0.42, 0] },
};

export type Build = 'slim' | 'avg' | 'heavy';
export type FaceShape = 'oval' | 'square' | 'round' | 'long';
export type HairStyle = 'crop' | 'buzz' | 'curly' | 'swept' | 'receding' | 'bald';
export type Beard = 'none' | 'mustache' | 'goatee' | 'full';

export interface Appearance {
  build: Build;
  face: FaceShape;
  hair: HairStyle;
  beard: Beard;
  skin: string;
  hairColor: string;
  /** Uniform height scale (0.94–1.06). */
  height: number;
}

const SKIN = ['#e6b48f', '#d09a70', '#b07650', '#8a5a3c', '#eec09c', '#644130'];
const HAIR_COLORS = ['#2b1d14', '#4a2f1d', '#8a6a3c', '#1a1a1a', '#b3833f', '#5a5a5a'];
const FACES: FaceShape[] = ['oval', 'square', 'round', 'long'];
const HAIRS: HairStyle[] = ['crop', 'buzz', 'curly', 'swept', 'receding', 'bald'];
const BEARDS: Beard[] = ['none', 'none', 'mustache', 'none', 'goatee', 'full', 'none'];

/** Deterministic appearance from an employee's look seed (the same bits the old rig used for skin, hair and height). */
export function appearanceFor(look: number): Appearance {
  const heavy = (look >> 2) % 5;
  return {
    build: heavy === 0 ? 'slim' : heavy === 4 ? 'heavy' : 'avg',
    face: FACES[(look >> 4) % FACES.length],
    hair: HAIRS[(look >> 7) % HAIRS.length],
    beard: BEARDS[(look >> 10) % BEARDS.length],
    skin: SKIN[look % SKIN.length],
    hairColor: HAIR_COLORS[(look >> 3) % HAIR_COLORS.length],
    height: 0.94 + ((look >> 5) % 7) * 0.02,
  };
}

const SHIRT: Record<EmployeeRole, string> = { technician: '#1d2126', installer: '#2a2f36', dispatcher: '#f3f4f6', 'comfort-advisor': '#1b8f86' };
const PANTS: Record<EmployeeRole, string> = { technician: '#3a3f46', installer: '#4a4238', dispatcher: '#2c3340', 'comfort-advisor': '#2c3340' };

/** Parts a character wears, by name prefix in the GLB (`<part>__<material>`). */
export function partsFor(a: Appearance, role: EmployeeRole, lod: boolean): string[] {
  const field = role === 'technician' || role === 'installer';
  const b = a.build;
  const parts = lod ? ['body_lod'] : [`body_${b}`, `collar_${b}`, `placket_${b}`, `buttons_${b}`, `sleeveL_${b}`, `sleeveR_${b}`, 'lacesL', 'lacesR'];
  if (lod) parts.push('head_lod', 'bootlodL', 'bootlodR');
  else parts.push(`head_${a.face}`, 'bootL', 'bootR', 'soleL', 'soleR', `eyes_${a.face}`, `iris_${a.face}`, `brows_${a.face}`);
  // Under a cap only close-cut hair shows (fuller styles would push through the crown).
  const hair = field && (a.hair === 'curly' || a.hair === 'swept') ? 'crop' : a.hair;
  if (hair !== 'bald' && !lod) parts.push(`hair_${hair}_${a.face}`);
  if (a.beard !== 'none' && !lod) parts.push(`beard_${a.beard}_${a.face}`);
  if (field) {
    parts.push(lod ? 'cap_lod' : 'cap', `belt_${b}`);
    if (!lod) parts.push(`buckle_${b}`, `pouches_${b}`, `piping_${b}`, `sleevetrimL_${b}`, `sleevetrimR_${b}`, `pocketL_${b}`, `pocketR_${b}`, `kneeL_${b}`, `kneeR_${b}`);
  } else if (!lod) {
    parts.push(`belt_${b}`, `buckle_${b}`, `sleevetrimL_${b}`, `sleevetrimR_${b}`);
  }
  return parts;
}

interface Library {
  /** Geometry by GLB object name, with skin indices remapped to BONE_NAMES order. */
  pieces: Map<string, THREE.BufferGeometry>;
}

const libraries = new WeakMap<THREE.Object3D, Library>();

function library(scene: THREE.Object3D): Library {
  let lib = libraries.get(scene);
  if (lib) return lib;
  const pieces = new Map<string, THREE.BufferGeometry>();
  scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const g = mesh.geometry.clone();
    // Joint order of this mesh's skin → canonical bone order.
    const map = mesh.skeleton.bones.map((bone) => BONE_NAMES.indexOf(bone.name as BoneName));
    const idx = g.getAttribute('skinIndex') as THREE.BufferAttribute;
    const out = new Uint16Array(idx.count * 4);
    for (let i = 0; i < idx.count * 4; i++) out[i] = Math.max(0, map[idx.array[i] as number]);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out, 4));
    // Keep only what the materials use; the merge needs identical attribute sets.
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    const sw = g.getAttribute('skinWeight');
    if (sw.array.constructor !== Float32Array) g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: sw.count * 4 }, (_, i) => sw.array[i] / (sw.normalized ? (sw.array instanceof Uint8Array ? 255 : 65535) : 1)), 4));
    if (g.index) g.setIndex(g.index.clone());
    pieces.set(mesh.name, g);
  });
  lib = { pieces };
  libraries.set(scene, lib);
  return lib;
}

/** Merged geometry per material for an appearance (cached: technicians who look alike share it). */
const assemblies = new Map<string, Map<string, THREE.BufferGeometry>>();

function assemble(scene: THREE.Object3D, a: Appearance, role: EmployeeRole, lod: boolean): Map<string, THREE.BufferGeometry> {
  const field = role === 'technician' || role === 'installer';
  const key = `${a.build}|${a.face}|${a.hair}|${a.beard}|${field}|${role === 'technician' || role === 'installer' ? 'f' : 'o'}|${lod}`;
  const known = assemblies.get(key);
  if (known) return known;
  const lib = library(scene);
  const byMaterial = new Map<string, THREE.BufferGeometry[]>();
  const wanted = partsFor(a, role, lod);
  for (const [name, g] of lib.pieces) {
    const [part, material] = name.split('__');
    if (!wanted.includes(part)) continue;
    const list = byMaterial.get(material) ?? [];
    list.push(g);
    byMaterial.set(material, list);
  }
  const merged = new Map<string, THREE.BufferGeometry>();
  for (const [material, list] of byMaterial) {
    const g = list.length === 1 ? list[0] : BGU.mergeGeometries(list, false);
    if (!g) continue;
    g.computeBoundingSphere();
    merged.set(material, g);
  }
  assemblies.set(key, merged);
  return merged;
}

const materialCache = new Map<string, THREE.Material>();
function sharedMaterial(key: string, make: () => THREE.Material): THREE.Material {
  let m = materialCache.get(key);
  if (!m) materialCache.set(key, (m = make()));
  return m;
}

/** Material for one region of the character, shared by everyone wearing the same colour. */
function materialFor(region: string, a: Appearance, role: EmployeeRole): THREE.Material {
  const std = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    sharedMaterial(`${region}:${color}:${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
  switch (region) {
    case 'shirt':
      return std(SHIRT[role], 0.86);
    case 'pants':
      return std(PANTS[role], 0.9);
    case 'pocket':
      return std(role === 'installer' ? '#40392f' : '#33383e', 0.9);
    case 'skin':
      return std(a.skin, 0.62);
    case 'hair':
      return std(a.hairColor, 0.88);
    case 'leather':
      return std('#5a3d26', 0.72);
    case 'sole':
      return std('#17130f', 0.95);
    case 'gear':
      return std('#1c1d20', 0.8);
    case 'cap':
      return std(role === 'installer' ? '#f2c230' : '#15181d', 0.78);
    case 'teal':
      return sharedMaterial('teal', () => new THREE.MeshStandardMaterial({ color: PALETTE.egoTeal, emissive: PALETTE.egoTeal, emissiveIntensity: 0.25, roughness: 0.6 }));
    case 'metal':
      return std('#c9ced3', 0.35, 0.8);
    case 'eye':
      return std('#eef0f2', 0.45);
    case 'iris':
      return std('#2a1d14', 0.3);
    default:
      return std('#808080', 0.8);
  }
}

export interface CharacterRig {
  /** Holds the skinned meshes and the skeleton; scale it for the character's height. */
  root: THREE.Group;
  bones: Record<BoneName, THREE.Bone>;
  /** The detailed figure and the distant one (same skeleton). */
  near: THREE.Group;
  far: THREE.Group;
}

/** A character instance: a fresh skeleton in the canonical bind pose and the merged meshes of its appearance. */
export function buildCharacter(scene: THREE.Object3D, a: Appearance, role: EmployeeRole): CharacterRig {
  const root = new THREE.Group();
  root.name = 'character';
  const bones = {} as Record<BoneName, THREE.Bone>;
  for (const name of BONE_NAMES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...RIG[name].at);
    bones[name] = b;
  }
  for (const name of BONE_NAMES) {
    const parent = RIG[name].parent;
    if (parent) bones[parent].add(bones[name]);
    else root.add(bones[name]);
  }
  // Bind in the modelled pose (arms abducted), then hand the clips the canonical zero pose.
  bones.armL.rotation.z = -ARM_ABDUCT;
  bones.armR.rotation.z = ARM_ABDUCT;
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONE_NAMES.map((n) => bones[n]));
  const near = new THREE.Group();
  const far = new THREE.Group();
  near.name = 'character-near';
  far.name = 'character-far';
  for (const [group, lod] of [[near, false], [far, true]] as const) {
    for (const [region, g] of assemble(scene, a, role, lod)) {
      const mesh = new THREE.SkinnedMesh(g, materialFor(region, a, role));
      mesh.name = `character:${region}`;
      mesh.castShadow = region !== 'eye' && region !== 'iris' && region !== 'teal';
      mesh.receiveShadow = !lod;
      // Skinned bounds move with the pose; the figure is small, so skip culling per mesh (the character is culled as a whole).
      mesh.frustumCulled = false;
      mesh.bind(skeleton, new THREE.Matrix4());
      group.add(mesh);
    }
    root.add(group);
  }
  far.visible = false;
  bones.armL.rotation.z = 0;
  bones.armR.rotation.z = 0;
  return { root, bones, near, far };
}
