// Shared builders for the procedural asset generators (Node, three.js).
import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Named materials shared by all generated assets; the runtime maps names to PBR textures/colors. */
export const MATERIALS = {
  paint: () => new THREE.MeshPhysicalMaterial({ name: 'paint', color: 0x1a1e24, roughness: 0.34, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08 }),
  accent: () => new THREE.MeshStandardMaterial({ name: 'accent', color: 0x19d3c5, roughness: 0.4, metalness: 0.2, emissive: 0x19d3c5, emissiveIntensity: 0.15 }),
  glass: () => new THREE.MeshPhysicalMaterial({ name: 'glass', color: 0x10171e, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.93, envMapIntensity: 0.55 }),
  'plastic-dark': () => new THREE.MeshStandardMaterial({ name: 'plastic-dark', color: 0x1c1e21, roughness: 0.75, metalness: 0.05 }),
  chrome: () => new THREE.MeshStandardMaterial({ name: 'chrome', color: 0xd9dde2, roughness: 0.18, metalness: 0.95 }),
  rubber: () => new THREE.MeshStandardMaterial({ name: 'rubber', color: 0x1b1c1f, roughness: 0.92, metalness: 0 }),
  rim: () => new THREE.MeshStandardMaterial({ name: 'rim', color: 0xb9bfc5, roughness: 0.32, metalness: 0.85 }),
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

/**
 * A wheel: a lathed tire (rounded shoulders, bulged sidewall, tread grooves), a machined six-spoke
 * alloy with dark spoke pockets, a lug circle and a centre cap. Axis along x.
 */
export function wheel(name, radius = 0.38, width = 0.26, { spokes = 6, rimRatio = 0.62 } = {}) {
  const b = new Builder();
  const hw = width / 2;
  const rimR = radius * rimRatio;
  // Tire cross-section (r, x) from the inner bead over the shoulder and tread to the outer bead.
  const prof = [];
  const sh = Math.min(0.06, width * 0.22);
  prof.push([rimR * 0.98, -hw * 0.86]);
  prof.push([rimR + (radius - rimR) * 0.45, -hw * 1.0]);
  prof.push([radius - sh * 0.9, -hw * 0.98]);
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * (Math.PI / 2); prof.push([radius - sh + Math.sin(a) * sh, -hw + sh - Math.cos(a) * sh]); }
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * (Math.PI / 2); prof.push([radius - sh + Math.cos(a) * sh, hw - sh + Math.sin(a) * sh]); }
  prof.push([radius - sh * 0.9, hw * 0.98]);
  prof.push([rimR + (radius - rimR) * 0.45, hw * 1.0]);
  prof.push([rimR * 0.98, hw * 0.86]);
  const tire = new THREE.LatheGeometry(prof.map(([r, x]) => new THREE.Vector2(r, x)), 40);
  b.add('rubber', tire, { rotation: [0, 0, -Math.PI / 2] });
  // Circumferential tread grooves read as dark bands; lateral sipes as blocks.
  const blocks = 36;
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2;
    for (const s of [-1, 1]) b.add('rubber', new THREE.BoxGeometry(width * 0.34, 0.012, ((2 * Math.PI * radius) / blocks) * 0.55), { position: [s * width * 0.22, Math.cos(a) * (radius + 0.003), Math.sin(a) * (radius + 0.003)], rotation: [-a, 0, 0] });
  }
  // Rim barrel, then the outer face: a shallow dish, six spokes, lug circle, centre cap.
  b.add('plastic-dark', new THREE.CylinderGeometry(rimR * 0.97, rimR * 0.97, width * 0.9, 32, 1, true), { rotation: [0, 0, Math.PI / 2] });
  for (const side of [-1, 1]) {
    const face = side * (hw * 0.86);
    b.add('rim', new THREE.TorusGeometry(rimR * 0.97, rimR * 0.06, 6, 36), { position: [face, 0, 0], rotation: [0, Math.PI / 2, 0] });
    b.add('plastic-dark', new THREE.CylinderGeometry(rimR * 0.93, rimR * 0.93, 0.012, 32), { position: [face - side * 0.02, 0, 0], rotation: [0, 0, Math.PI / 2] });
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + 0.26;
      const len = rimR * 0.66;
      const mid = rimR * 0.27 + len / 2;
      b.add('rim', roundedBox(0.03, len, rimR * 0.2, 0.012), { position: [face + side * 0.004, Math.cos(a) * mid, Math.sin(a) * mid], rotation: [a, 0, 0] });
    }
    b.add('rim', new THREE.CylinderGeometry(rimR * 0.33, rimR * 0.36, 0.05, 24), { position: [face, 0, 0], rotation: [0, 0, side * Math.PI / 2] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add('chrome', new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), { position: [face + side * 0.028, Math.cos(a) * rimR * 0.24, Math.sin(a) * rimR * 0.24], rotation: [0, 0, Math.PI / 2] });
    }
    b.add('plastic-dark', new THREE.CylinderGeometry(rimR * 0.13, rimR * 0.13, 0.02, 16), { position: [face + side * 0.032, 0, 0], rotation: [0, 0, Math.PI / 2] });
    b.add('accent', new THREE.CylinderGeometry(rimR * 0.06, rimR * 0.06, 0.012, 12), { position: [face + side * 0.042, 0, 0], rotation: [0, 0, Math.PI / 2] });
  }
  return b.build(name);
}

/** A molded wheel-arch flare: a half ring of trim following an arch of radius r, standing proud of the body side. */
export function archFlare(b, side, x, z, yCenter, r, { thickness = 0.07, depth = 0.06 } = {}) {
  const g = new THREE.TorusGeometry(r + thickness * 0.4, thickness / 2, 6, 20, Math.PI);
  b.add('plastic-dark', g, { position: [side * (x + depth / 2 - 0.01), yCenter, z], rotation: [0, Math.PI / 2, 0], scale: [1, 1, depth / thickness] });
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
