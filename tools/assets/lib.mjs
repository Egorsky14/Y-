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
  rim: () => new THREE.MeshStandardMaterial({ name: 'rim', color: 0xcfd4d8, roughness: 0.28, metalness: 0.85 }),
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

/** A wheel: tire with tread blocks and shoulder, a dished steel rim with lug holes and a chrome cap. Axis along x. */
export function wheel(name, radius = 0.38, width = 0.26, { spokes = 5, rimRatio = 0.64 } = {}) {
  const b = new Builder();
  b.add('rubber', new THREE.CylinderGeometry(radius, radius, width, 32), { rotation: [0, 0, Math.PI / 2] });
  // Rounded shoulders: a slightly smaller torus-ish ring at each sidewall edge
  for (const side of [-1, 1]) b.add('rubber', new THREE.TorusGeometry(radius - 0.03, 0.035, 8, 32), { position: [side * (width / 2 - 0.01), 0, 0], rotation: [0, Math.PI / 2, 0] });
  const blocks = 30;
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2;
    b.add('rubber', new THREE.BoxGeometry(width * 0.86, 0.014, ((2 * Math.PI * radius) / blocks) * 0.58), { position: [0, Math.cos(a) * (radius + 0.004), Math.sin(a) * (radius + 0.004)], rotation: [-a, 0, 0] });
  }
  const rimR = radius * rimRatio;
  // Rim barrel (dark) and the dished face on each side
  b.add('plastic-dark', new THREE.CylinderGeometry(rimR * 0.96, rimR * 0.96, width * 1.0, 28), { rotation: [0, 0, Math.PI / 2] });
  for (const side of [-1, 1]) {
    b.add('rim', new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.03, 28), { position: [side * (width / 2 - 0.02), 0, 0], rotation: [0, 0, side * Math.PI / 2] });
    b.add('rim', new THREE.CylinderGeometry(rimR * 0.62, rimR * 0.5, 0.05, 24), { position: [side * (width / 2 + 0.005), 0, 0], rotation: [0, 0, side * Math.PI / 2] });
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      b.add('plastic-dark', new THREE.CylinderGeometry(rimR * 0.1, rimR * 0.1, 0.02, 10), { position: [side * (width / 2 + 0.01), Math.cos(a) * rimR * 0.76, Math.sin(a) * rimR * 0.76], rotation: [0, 0, Math.PI / 2] });
    }
    b.add('chrome', new THREE.CylinderGeometry(rimR * 0.26, rimR * 0.26, 0.05, 16), { position: [side * (width / 2 + 0.03), 0, 0], rotation: [0, 0, Math.PI / 2] });
  }
  return b.build(name);
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

/**
 * Cross-section for lofted body shells: a trapezoid from the beltline up to a rounded-top roof.
 * Returns points in the (x, y) plane, counter-clockwise from bottom-right, with a fixed count so
 * sections can be lofted pairwise. `hwB` half-width at the beltline, `hwT` at the roof edge.
 */
export function shellSection({ yBottom, yTop, hwB, hwT, r, cornerSegs = 6 }) {
  const pts = [];
  pts.push([hwB, yBottom]);
  pts.push([hwT, yTop - r]);
  for (let i = 1; i <= cornerSegs; i++) {
    const a = (i / cornerSegs) * (Math.PI / 2);
    pts.push([hwT - r + Math.cos(a) * r, yTop - r + Math.sin(a) * r]);
  }
  for (let i = 0; i <= cornerSegs; i++) {
    const a = Math.PI / 2 + (i / cornerSegs) * (Math.PI / 2);
    pts.push([-hwT + r + Math.cos(a) * r, yTop - r + Math.sin(a) * r]);
  }
  pts.push([-hwB, yBottom]);
  return pts;
}

/**
 * Lofts a list of {z, section} stations into a smooth-shaded shell, optionally capping the ends.
 * Stations are ordered from the rear (smallest z) to the front. Side normals are smoothed, caps are flat.
 */
export function loftShell(stations, { capFront = true, capRear = true } = {}) {
  const n = stations[0].section.length;
  const positions = [];
  const indices = [];
  for (const st of stations) for (const [x, y] of st.section) positions.push(x, y, st.z);
  for (let s = 0; s < stations.length - 1; s++) {
    for (let j = 0; j < n - 1; j++) {
      const a = s * n + j;
      const b = s * n + j + 1;
      const c = (s + 1) * n + j + 1;
      const d = (s + 1) * n + j;
      // Winding so normals face outward (+x side first, going over the roof to -x).
      indices.push(a, b, c, a, c, d);
    }
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  side.setIndex(indices);
  side.computeVertexNormals();
  const parts = [side.toNonIndexed()];
  const cap = (st, facing) => {
    const pos = [];
    const sec = st.section;
    for (let j = 1; j < n - 1; j++) {
      const tri = facing > 0 ? [sec[0], sec[j], sec[j + 1]] : [sec[0], sec[j + 1], sec[j]];
      for (const [x, y] of tri) pos.push(x, y, st.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  if (capFront) parts.push(cap(stations[stations.length - 1], 1));
  if (capRear) parts.push(cap(stations[0], -1));
  for (const p of parts) if (!p.attributes.uv) p.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.attributes.position.count * 2), 2));
  return BGU.mergeGeometries(parts, false);
}

/** Flat polygon in the (z, y) plane placed on a vehicle side at x; normal faces ±x. */
export function sidePolygon(points, x, facing) {
  const shape = new THREE.Shape();
  // rotateY(+90°) maps shape-x to world -z, so the right side is drawn mirrored to keep z consistent.
  const k = facing > 0 ? -1 : 1;
  points.forEach(([z, y], i) => (i === 0 ? shape.moveTo(k * z, y) : shape.lineTo(k * z, y)));
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  // ShapeGeometry lies in (x,y) with +z normal; map shape-x → world-z and rotate the normal to ±x.
  g.rotateY(facing > 0 ? Math.PI / 2 : -Math.PI / 2);
  g.translate(x, 0, 0);
  return g;
}
