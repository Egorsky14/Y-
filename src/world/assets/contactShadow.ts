import * as THREE from 'three';

/**
 * Ground-contact shading without screen-space AO: soft dark decals where things meet the ground.
 * The sun's shadow map leaves a lit gap under objects that sit on the ground (a tool case or a
 * condenser reads as floating), and the wall-to-ground junction of houses has no occlusion at all.
 *
 * - Blobs: a soft ellipse under props, units, vans and the technician.
 * - Bands: a gradient strip along the foot of each house wall and garden wall, darkest at the wall.
 *
 * All decals share two textures and are transparent, unlit and depth-write free, drawn just above
 * the ground with polygon offset.
 */

let blobTex: THREE.Texture | null = null;
let bandTex: THREE.Texture | null = null;
const materials = new Map<string, THREE.MeshBasicMaterial>();

function blobTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.78)');
  g.addColorStop(0.75, 'rgba(0,0,0,0.3)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

function bandTexture(): THREE.Texture {
  if (bandTex) return bandTex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  // v = 0 at the wall, 1 at the outer edge: fast falloff, like ambient occlusion.
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.25, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.16)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  bandTex = new THREE.CanvasTexture(c);
  bandTex.wrapS = THREE.ClampToEdgeWrapping;
  bandTex.wrapT = THREE.ClampToEdgeWrapping;
  return bandTex;
}

/** Shared decal material ('blob' or 'band') at an opacity. */
export function contactMaterial(kind: 'blob' | 'band', opacity: number): THREE.MeshBasicMaterial {
  const key = `${kind}:${opacity}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: kind === 'blob' ? blobTexture() : bandTexture(), color: '#000000', transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
    materials.set(key, m);
  }
  return m;
}

const BLOB_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** A soft contact blob (w × d metres) at local (x, y, z), as a child mesh that never casts or receives shadows. */
export function contactBlob(w: number, d: number, opacity = 0.42, at: [number, number, number] = [0, 0.012, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(BLOB_GEO, contactMaterial('blob', opacity));
  mesh.scale.set(w, 1, d);
  mesh.position.set(...at);
  mesh.renderOrder = 1;
  mesh.name = 'contact-shadow';
  return mesh;
}

/**
 * Gradient bands round the foot of axis-aligned footprints (house walls, garden walls): one quad
 * per side reaching `width` metres out, darkest at the wall. Returns one merged geometry with UVs
 * (v = 0 at the wall) for the 'band' material.
 */
export function wallBands(footprints: THREE.Box3[], width = 0.75, y = 0.03): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const uv: number[] = [];
  const quad = (ax: number, az: number, bx: number, bz: number, ox: number, oz: number) => {
    // a→b along the wall, (ox, oz) the outward offset.
    const p = [
      [ax, az, 0],
      [bx, bz, 0],
      [bx + ox, bz + oz, 1],
      [ax + ox, az + oz, 1],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(p[i][0], y, p[i][1]);
      uv.push(i === 1 || i === 2 ? 1 : 0, p[i][2]);
    }
  };
  for (const b of footprints) {
    const { min, max } = b;
    quad(min.x, min.z, max.x, min.z, 0, -width);
    quad(max.x, max.z, min.x, max.z, 0, width);
    quad(min.x, max.z, min.x, min.z, -width, 0);
    quad(max.x, min.z, max.x, max.z, width, 0);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}
