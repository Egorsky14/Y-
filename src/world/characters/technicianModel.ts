import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EmployeeRole } from '@/game/employees/roles';
import { RIG_BONES, RIG_MEASURES, RIG_ORDER, type BoneName } from './rigData.generated';

/**
 * The next-generation technician (tools/blender/technician_v3.py → public/models/characters/technician-v3.glb): real
 * human anatomy from CC0 MakeHuman data, garments as geometry, 43 bones, one painted atlas. See
 * docs/graphics-revolution-3/PIPELINE.md.
 *
 * A character is a single merged skinned mesh per level of detail, and all characters share one material: one draw call
 * each. What differs between employees is carried in the vertex colours (a tint per region) and in which parts they
 * wear, so appearance stays a pure function of the employee's `look` seed and never touches attributes or skills.
 */

export const CHARACTER_URL = `${import.meta.env.BASE_URL}models/characters/technician-v3.glb`;
export type { BoneName };
export const BONE_NAMES: readonly BoneName[] = RIG_ORDER;
export const PELVIS_Y: number = RIG_MEASURES.pelvisY;

export type Build = 'slim' | 'avg' | 'heavy';
export type FaceShape = 'oval' | 'square' | 'round' | 'long' | 'broad' | 'weathered';
export type HairStyle = 'crop' | 'buzz' | 'curly' | 'swept' | 'receding' | 'bald';
export type Beard = 'none' | 'mustache' | 'goatee' | 'full';
export type Lod = 0 | 1 | 2;

export interface Appearance {
  build: Build;
  face: FaceShape;
  hair: HairStyle;
  beard: Beard;
  skin: string;
  hairColor: string;
  /** Uniform height scale (0.94 to 1.06). */
  height: number;
}

/**
 * Faces are different people (see HEADS in the Blender script), so each draws its complexion and hair colour from what
 * suits it; a skin tone is not just painted onto one face.
 */
const FACE_LOOKS: Record<FaceShape, { skin: string[]; hair: string[] }> = {
  oval: { skin: ['#e6b48f', '#eec09c', '#d9a57f'], hair: ['#4a2f1d', '#2b1d14', '#8a6a3c', '#b3833f'] },
  square: { skin: ['#d09a70', '#e0ad86', '#c58c63'], hair: ['#2b1d14', '#1a1a1a', '#4a2f1d'] },
  round: { skin: ['#d8ab82', '#c99a72', '#e2b891'], hair: ['#121212', '#1a1a1a', '#2b1d14'] },
  long: { skin: ['#6e4630', '#5a3826', '#7e5238'], hair: ['#121212', '#1a1a1a'] },
  broad: { skin: ['#a8724e', '#b98259', '#946243'], hair: ['#1a1a1a', '#2b1d14', '#3a2616'] },
  weathered: { skin: ['#dcaa86', '#cf9b78', '#e3b591'], hair: ['#5a5a5a', '#8d8d8d', '#6e6456'] },
};
const FACES: FaceShape[] = ['oval', 'square', 'round', 'long', 'broad', 'weathered'];
const HAIRS: HairStyle[] = ['crop', 'buzz', 'curly', 'swept', 'receding', 'bald'];
const BEARDS: Beard[] = ['none', 'none', 'mustache', 'none', 'goatee', 'full', 'none'];

/** Deterministic appearance from an employee's look seed. */
export function appearanceFor(look: number): Appearance {
  const heavy = (look >> 2) % 5;
  const face = FACES[(look >> 4) % FACES.length];
  const palette = FACE_LOOKS[face];
  return {
    build: heavy === 0 ? 'slim' : heavy === 4 ? 'heavy' : 'avg',
    face,
    hair: HAIRS[(look >> 7) % HAIRS.length],
    beard: BEARDS[(look >> 10) % BEARDS.length],
    skin: palette.skin[look % palette.skin.length],
    hairColor: palette.hair[(look >> 3) % palette.hair.length],
    height: 0.94 + ((look >> 5) % 7) * 0.02,
  };
}

const SHIRT: Record<EmployeeRole, string> = { technician: '#1b1f24', installer: '#2a2f36', dispatcher: '#f3f4f6', 'comfort-advisor': '#1b8f86' };
const PANTS: Record<EmployeeRole, string> = { technician: '#3a3f46', installer: '#4a4238', dispatcher: '#2c3340', 'comfort-advisor': '#2c3340' };
const CAP: Record<EmployeeRole, string> = { technician: '#15181d', installer: '#f2c230', dispatcher: '#15181d', 'comfort-advisor': '#15181d' };
const isField = (role: EmployeeRole) => role === 'technician' || role === 'installer';

/** Parts a character wears at a level of detail, by name prefix in the GLB (`<part><lod>__<tint>`). */
export function partsFor(a: Appearance, role: EmployeeRole, lod: Lod | boolean): string[] {
  const level: Lod = lod === true ? 2 : lod === false ? 0 : lod;
  const field = isField(role);
  const b = a.build;
  const f = a.face;
  // Under a cap the close crop painted on the scalp is all that shows.
  const hair = field || a.hair === 'bald' ? null : a.hair;
  const near = [`shirt_${b}`, `pants_${b}`, `arms_${b}`, `head_${f}`, 'bootL', 'bootR'];
  const out = [...near];
  if (field) out.push('cap');
  if (level < 2) {
    out.push(`collar_${b}`, `belt_${b}`, `eyes_${f}`);
    if (hair) out.push(`hair_${hair}_${f}`);
    if (a.beard !== 'none') out.push(`beard_${a.beard}_${f}`);
  }
  if (level === 0) out.push(`pocketL_${b}`, `pocketR_${b}`);
  return out;
}

interface Library {
  /** Geometry by GLB object name, with skin indices remapped to RIG_ORDER. */
  pieces: Map<string, THREE.BufferGeometry>;
}

const libraries = new WeakMap<THREE.Object3D, Library>();
const KEEP = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];
const BONE_INDEX = new Map<string, number>(RIG_ORDER.map((n, i) => [n, i]));

function library(scene: THREE.Object3D): Library {
  let lib = libraries.get(scene);
  if (lib) return lib;
  const pieces = new Map<string, THREE.BufferGeometry>();
  scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const g = mesh.geometry.clone();
    // Joint order of this mesh's skin → canonical bone order.
    const map = mesh.skeleton.bones.map((bone) => BONE_INDEX.get(bone.name) ?? 0);
    const idx = g.getAttribute('skinIndex') as THREE.BufferAttribute;
    const out = new Uint16Array(idx.count * 4);
    for (let i = 0; i < idx.count * 4; i++) out[i] = map[idx.array[i] as number];
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out, 4));
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
    const sw = g.getAttribute('skinWeight');
    if (sw.array.constructor !== Float32Array) {
      const div = !sw.normalized ? 1 : sw.array instanceof Uint8Array ? 255 : 65535;
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: sw.count * 4 }, (_, i) => (sw.array[i] as number) / div), 4));
    }
    const uv = g.getAttribute('uv');
    if (uv.array.constructor !== Float32Array) {
      const div = !uv.normalized ? 1 : uv.array instanceof Uint8Array ? 255 : 65535;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: uv.count * 2 }, (_, i) => (uv.array[i] as number) / div), 2));
    }
    pieces.set(mesh.name, g);
  });
  lib = { pieces };
  libraries.set(scene, lib);
  return lib;
}

const SUFFIX: Record<Lod, string> = { 0: '', 1: '_lod1', 2: '_lod2' };

/** Merged shape for one set of parts, with the tint name of each run of vertices. */
interface Assembly {
  geometry: THREE.BufferGeometry;
  runs: { tint: string; count: number }[];
}

const assemblies = new Map<string, Assembly>();

function assemble(scene: THREE.Object3D, parts: string[], lod: Lod): Assembly {
  const key = `${lod}|${parts.join(',')}`;
  const known = assemblies.get(key);
  if (known) return known;
  const lib = library(scene);
  const list: THREE.BufferGeometry[] = [];
  const runs: Assembly['runs'] = [];
  for (const part of parts) {
    // A part with no mesh at this level is simply absent from it.
    for (const tint of ['skin', 'shirt', 'pants', 'hair', 'cap', 'abs']) {
      const g = lib.pieces.get(`${part}${SUFFIX[lod]}__${tint}`);
      if (g) {
        list.push(g);
        runs.push({ tint, count: g.getAttribute('position').count });
      }
    }
  }
  const geometry = BGU.mergeGeometries(list, false)!;
  geometry.computeBoundingSphere();
  const made = { geometry, runs };
  assemblies.set(key, made);
  return made;
}

const srgbToLinear = new THREE.Color();
/** The skin paint is a ratio against this level (technician_v3.py SKIN_BASE). */
const SKIN_BASE = 0.88;

function tintColours(a: Appearance, role: EmployeeRole): Record<string, [number, number, number]> {
  const c = (hex: string, k = 1): [number, number, number] => {
    srgbToLinear.set(hex);
    return [srgbToLinear.r * k, srgbToLinear.g * k, srgbToLinear.b * k];
  };
  return { skin: c(a.skin, 1 / SKIN_BASE), shirt: c(SHIRT[role]), pants: c(PANTS[role]), hair: c(a.hairColor), cap: c(CAP[role]), abs: [1, 1, 1] };
}

const tinted = new Map<string, THREE.BufferGeometry>();

/** One employee's geometry: the shared shape with their own colours; the vertex data itself is not duplicated. */
function dressed(scene: THREE.Object3D, a: Appearance, role: EmployeeRole, lod: Lod): THREE.BufferGeometry {
  const parts = partsFor(a, role, lod);
  const key = `${lod}|${parts.join(',')}|${a.skin}|${a.hairColor}|${role}`;
  const known = tinted.get(key);
  if (known) return known;
  const base = assemble(scene, parts, lod);
  const count = base.geometry.getAttribute('position').count;
  const colour = new Float32Array(count * 3);
  const tints = tintColours(a, role);
  let at = 0;
  for (const run of base.runs) {
    const t = tints[run.tint];
    for (let i = 0; i < run.count; i++, at += 3) {
      colour[at] = t[0];
      colour[at + 1] = t[1];
      colour[at + 2] = t[2];
    }
  }
  const g = new THREE.BufferGeometry();
  g.index = base.geometry.index;
  for (const k of KEEP) g.setAttribute(k, base.geometry.getAttribute(k));
  g.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  g.boundingSphere = base.geometry.boundingSphere;
  tinted.set(key, g);
  return g;
}

// ---------------------------------------------------------------- the shared material
let shared: THREE.MeshStandardMaterial | null = null;

/** Full textures on large screens; half on phones, which also saves three quarters of the memory. */
export function textureSize(): 1024 | 2048 {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const small = typeof innerWidth === 'number' && Math.max(innerWidth, innerHeight) < 1300;
  return coarse || small ? 1024 : 2048;
}

function loadTexture(name: string, size: number, srgb: boolean): THREE.Texture {
  const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}models/characters/tex/technician-${name}-${size}.webp`);
  t.flipY = false; // glTF texture coordinates.
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/**
 * Atlas channels: albedo; normal; ORM = occlusion (red), a code (green) and roughness (blue). The code replaces plain
 * metalness: under 0.3 means "tinted by the region's vertex colour", above means absolute colour, and near 1 means metal.
 * It is in green because lossy WebP keeps luma at full resolution and subsamples chroma, which would turn a mask in blue
 * to mush; and it is not in alpha because canvas-encoded images cannot keep colour under alpha.
 */
export function characterMaterial(): THREE.MeshStandardMaterial {
  if (shared) return shared;
  const size = textureSize();
  const orm = loadTexture('orm', size, false);
  const m = new THREE.MeshStandardMaterial({
    map: loadTexture('albedo', size, true),
    normalMap: loadTexture('normal', size === 2048 ? 1024 : 512, false),
    normalScale: new THREE.Vector2(1, 1),
    roughnessMap: orm,
    aoMap: orm,
    aoMapIntensity: 1,
    roughness: 1,
    metalness: 1,
    vertexColors: true,
  });
  m.name = 'technician';
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        `vec4 charOrm = texture2D( roughnessMap, vRoughnessMapUv );
         float charTint = 1.0 - smoothstep( 0.2, 0.35, charOrm.g );
         diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, charTint );`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * charOrm.b;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = smoothstep( 0.72, 0.95, charOrm.g );');
  };
  m.customProgramCacheKey = () => 'technician-v3';
  shared = m;
  return m;
}

export interface CharacterRig {
  /** Holds the skinned meshes and the skeleton; scale it for the character's height. */
  root: THREE.Group;
  bones: Record<BoneName, THREE.Bone>;
  lods: [THREE.SkinnedMesh, THREE.SkinnedMesh, THREE.SkinnedMesh];
}

/** Builds a skeleton from the generated rig table, posed at bind or at the canonical zero pose. */
export function buildSkeleton(): { root: THREE.Group; bones: Record<BoneName, THREE.Bone> } {
  const root = new THREE.Group();
  root.name = 'character';
  const bones = {} as Record<BoneName, THREE.Bone>;
  for (const name of RIG_ORDER) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.fromArray(RIG_BONES[name].at);
    bones[name] = b;
  }
  for (const name of RIG_ORDER) {
    const parent = RIG_BONES[name].parent;
    if (parent) bones[parent as BoneName].add(bones[name]);
    else root.add(bones[name]);
  }
  return { root, bones };
}

/** Puts a skeleton in the pose the meshes were modelled in (MakeHuman's A-pose). */
export function setBindPose(bones: Record<BoneName, THREE.Bone>): void {
  for (const name of RIG_ORDER) {
    bones[name].quaternion.fromArray(RIG_BONES[name].bind);
    bones[name].position.fromArray(RIG_BONES[name].at);
  }
}

/** Back to the canonical pose the clips work from: every rotation zero, limbs hanging. */
export function setCanonicalPose(bones: Record<BoneName, THREE.Bone>): void {
  for (const name of RIG_ORDER) bones[name].quaternion.identity();
  bones.pelvis.position.y = PELVIS_Y;
}

/** A character instance: a fresh skeleton and the merged meshes of its appearance, one per level of detail. */
export function buildCharacter(scene: THREE.Object3D, a: Appearance, role: EmployeeRole): CharacterRig {
  const { root, bones } = buildSkeleton();
  setBindPose(bones);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(RIG_ORDER.map((n) => bones[n]));
  const material = characterMaterial();
  const lods = ([0, 1, 2] as Lod[]).map((lod) => {
    const mesh = new THREE.SkinnedMesh(dressed(scene, a, role, lod), material);
    mesh.name = `character:lod${lod}`;
    mesh.castShadow = true;
    mesh.receiveShadow = lod < 2;
    mesh.frustumCulled = false; // Skinned bounds move with the pose; the character is culled as a whole.
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.visible = lod === 0;
    root.add(mesh);
    return mesh;
  }) as unknown as CharacterRig['lods'];
  setCanonicalPose(bones);
  return { root, bones, lods };
}
