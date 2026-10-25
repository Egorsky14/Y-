// Shared builders for the procedural asset generators (Node, three.js).
import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Named materials shared by all generated assets; the runtime maps names to PBR textures/colors. */
export const MATERIALS = {
  paint: () => new THREE.MeshPhysicalMaterial({ name: 'paint', color: 0x15181d, roughness: 0.32, metalness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
  accent: () => new THREE.MeshStandardMaterial({ name: 'accent', color: 0x19d3c5, roughness: 0.4, metalness: 0.2, emissive: 0x19d3c5, emissiveIntensity: 0.15 }),
  glass: () => new THREE.MeshPhysicalMaterial({ name: 'glass', color: 0x27394a, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.9, envMapIntensity: 0.9 }),
  'plastic-dark': () => new THREE.MeshStandardMaterial({ name: 'plastic-dark', color: 0x1c1e21, roughness: 0.75, metalness: 0.05 }),
  chrome: () => new THREE.MeshStandardMaterial({ name: 'chrome', color: 0xd9dde2, roughness: 0.18, metalness: 0.95 }),
  rubber: () => new THREE.MeshStandardMaterial({ name: 'rubber', color: 0x16171a, roughness: 0.95, metalness: 0 }),
  rim: () => new THREE.MeshStandardMaterial({ name: 'rim', color: 0xaeb4ba, roughness: 0.3, metalness: 0.85 }),
  headlight: () => new THREE.MeshStandardMaterial({ name: 'headlight', color: 0xf3f6ff, roughness: 0.1, metalness: 0.2, emissive: 0xfff6dd, emissiveIntensity: 0.4 }),
  taillight: () => new THREE.MeshStandardMaterial({ name: 'taillight', color: 0xc9262b, roughness: 0.2, metalness: 0.1, emissive: 0xd92d2d, emissiveIntensity: 0.5 }),
  amber: () => new THREE.MeshStandardMaterial({ name: 'amber', color: 0xf0a030, roughness: 0.25, metalness: 0.1, emissive: 0xd98010, emissiveIntensity: 0.3 }),
  underbody: () => new THREE.MeshStandardMaterial({ name: 'underbody', color: 0x202326, roughness: 0.9, metalness: 0.1 }),
  steel: () => new THREE.MeshStandardMaterial({ name: 'steel', color: 0xb8bec4, roughness: 0.45, metalness: 0.7 }),
  aluminum: () => new THREE.MeshStandardMaterial({ name: 'aluminum', color: 0xd4d8dc, roughness: 0.4, metalness: 0.6 }),
  white: () => new THREE.MeshStandardMaterial({ name: 'white', color: 0xeef0f2, roughness: 0.5, metalness: 0.05 }),
  'decal-left': () => new THREE.MeshStandardMaterial({ name: 'decal-left', color: 0xffffff, roughness: 0.5, metalness: 0.1, transparent: true }),
  'decal-right': () => new THREE.MeshStandardMaterial({ name: 'decal-right', color: 0xffffff, roughness: 0.5, metalness: 0.1, transparent: true }),
  'decal-rear': () => new THREE.MeshStandardMaterial({ name: 'decal-rear', color: 0xffffff, roughness: 0.5, metalness: 0.1, transparent: true }),
};

/** A builder collects meshes per material name and merges them into one mesh per material. */
export class Builder {
  constructor() {
    this.parts = new Map();
    this.materials = new Map();
  }
  mat(name) {
    if (!this.materials.has(name)) this.materials.set(name, MATERIALS[name]());
    return this.materials.get(name);
  }
  /** Adds a geometry positioned/rotated/scaled by an optional transform. */
  add(materialName, geometry, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    let g = geometry.clone();
    if (g.index) g = g.toNonIndexed();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    g.applyMatrix4(m);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.clearGroups();
    (this.parts.get(materialName) ?? this.parts.set(materialName, []).get(materialName)).push(g);
    geometry.dispose?.();
    return this;
  }
  box(materialName, size, opts) {
    return this.add(materialName, new THREE.BoxGeometry(...size), opts);
  }
  /** Produces one mesh per material inside a group named `name`. */
  build(name) {
    const group = new THREE.Group();
    group.name = name;
    for (const [material, geos] of this.parts) {
      let merged = geos.length === 1 ? geos[0] : BGU.mergeGeometries(geos, false);
      if (!merged) throw new Error(`merge failed for ${material}`);
      merged = BGU.mergeVertices(merged, 1e-4);
      const mesh = new THREE.Mesh(merged, this.mat(material));
      mesh.name = `${name}_${material}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

/** Extrudes a 2D profile drawn in the (z, y) plane across the x axis (vehicle side profile → body). */
export function sideProfile(points, width, { bevel = 0.03, curveSegments = 12 } = {}) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments });
  // Extrude is along +z of the shape space; rotate so the shape's x (our z) stays z and extrusion runs along x.
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2, 0, 0);
  geo.scale(1, 1, 1);
  return geo;
}

/** Builds a side profile with circular wheel arches cut out of the bottom edge. */
export function profileWithArches(outline, arches, width, opts) {
  // outline: array of [z,y] going from rear-bottom, up and over to front-bottom (no bottom edge).
  // arches: [{ z, r }] along the bottom edge, listed from front to rear.
  const shape = new THREE.Shape();
  outline.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  const bottomY = outline[0][1];
  const frontZ = outline[outline.length - 1][0];
  let cursor = frontZ;
  for (const a of arches.slice().sort((p, q) => q.z - p.z)) {
    const z1 = a.z + a.r;
    const z0 = a.z - a.r;
    shape.lineTo(z1, bottomY);
    // Arc from front edge of the arch over the top to the rear edge (clockwise when viewed with +z right, +y up).
    shape.absarc(a.z, bottomY, a.r, 0, Math.PI, false);
    cursor = z0;
  }
  shape.lineTo(outline[0][0], bottomY);
  void cursor;
  const bevel = opts?.bevel ?? 0.03;
  // Bevel grows the extrusion on both sides; shrink the depth so the finished width equals `width`.
  const depth = width - bevel * 2;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 14 });
  geo.rotateY(-Math.PI / 2);
  geo.translate(depth / 2, 0, 0);
  return geo;
}

/** Rounded box via extruded rounded rectangle (x width, y height, z depth). */
export function roundedBox(w, h, d, r = 0.05) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -d / 2);
  return g;
}

/** A wheel: tire with tread blocks, sidewall and a spoked rim. Axis along x. Returns a group named `name`. */
export function wheel(name, radius = 0.38, width = 0.26, { spokes = 6, rimRatio = 0.6 } = {}) {
  const b = new Builder();
  b.add('rubber', new THREE.CylinderGeometry(radius, radius, width, 28), { rotation: [0, 0, Math.PI / 2] });
  // Tread blocks
  const blocks = 26;
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2;
    b.add('rubber', new THREE.BoxGeometry(width * 0.9, 0.016, (2 * Math.PI * radius) / blocks * 0.62), { position: [0, Math.cos(a) * (radius + 0.004), Math.sin(a) * (radius + 0.004)], rotation: [-a, 0, 0] });
  }
  const rimR = radius * rimRatio;
  b.add('rim', new THREE.CylinderGeometry(rimR, rimR, width * 0.98, 24), { rotation: [0, 0, Math.PI / 2] });
  b.add('plastic-dark', new THREE.CylinderGeometry(rimR * 0.92, rimR * 0.92, width * 1.0, 24), { rotation: [0, 0, Math.PI / 2] });
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    for (const side of [-1, 1]) {
      b.add('rim', new THREE.BoxGeometry(0.03, rimR * 0.78, rimR * 0.26), { position: [side * (width / 2 + 0.005), Math.cos(a) * rimR * 0.45, Math.sin(a) * rimR * 0.45], rotation: [-a, 0, 0] });
    }
  }
  for (const side of [-1, 1]) {
    b.add('chrome', new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.22, 0.05, 12), { position: [side * (width / 2 + 0.02), 0, 0], rotation: [0, 0, Math.PI / 2] });
  }
  const g = b.build(name);
  return g;
}

export function cylinder(materialName, b, rTop, rBottom, h, segs, opts) {
  return b.add(materialName, new THREE.CylinderGeometry(rTop, rBottom, h, segs), opts);
}

export function describe(group) {
  let tris = 0;
  let meshes = 0;
  group.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      const idx = o.geometry.index;
      tris += idx ? idx.count / 3 : o.geometry.attributes.position.count / 3;
    }
  });
  return { meshes, triangles: Math.round(tris) };
}
