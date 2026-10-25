// Vehicle generators. Coordinates: +z nose, +y up, +x driver's right (vehicle right side).
import * as THREE from 'three';
import { Builder, profileWithArches, roundedBox, wheel } from './lib.mjs';

function glassPanel(b, w, h, position, rotation, inset = 0.012) {
  // Slightly inset dark frame plus glass for crisp window edges.
  b.add('plastic-dark', new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.012), { position, rotation });
  const g = new THREE.BoxGeometry(w, h, 0.014);
  const off = new THREE.Vector3(0, 0, inset).applyEuler(new THREE.Euler(...rotation));
  b.add('glass', g, { position: [position[0] + off.x, position[1] + off.y, position[2] + off.z], rotation });
}

function mirror(b, side, y, z, armLength = 0.22, halfWidth = 1.03) {
  const base = halfWidth - 0.02;
  b.add('plastic-dark', new THREE.BoxGeometry(armLength, 0.05, 0.06), { position: [side * (base + armLength / 2), y, z] });
  b.add('plastic-dark', roundedBox(0.12, 0.26, 0.2, 0.03), { position: [side * (base + armLength + 0.04), y - 0.02, z] });
  b.add('glass', new THREE.BoxGeometry(0.09, 0.2, 0.01), { position: [side * (base + armLength + 0.04), y - 0.02, z - 0.105] });
}

function handle(b, side, y, z) {
  b.add('chrome', roundedBox(0.03, 0.035, 0.18, 0.01), { position: [side * 0.005, y, z] });
}

function seam(b, side, x, y, z, h) {
  b.add('plastic-dark', new THREE.BoxGeometry(0.012, h, 0.012), { position: [side * x, y, z] });
}

function ladderRack(b, width, length, zCenter, yTop, ladders = 2) {
  const rails = [-1, 1];
  for (const s of rails) b.add('steel', new THREE.BoxGeometry(0.05, 0.05, length), { position: [s * (width / 2 - 0.08), yTop, zCenter] });
  for (const s of rails) for (const z of [-length / 2 + 0.15, 0, length / 2 - 0.15]) b.add('steel', new THREE.BoxGeometry(0.04, 0.16, 0.04), { position: [s * (width / 2 - 0.08), yTop - 0.09, zCenter + z] });
  for (const z of [-length / 2 + 0.15, length / 2 - 0.15]) b.add('steel', new THREE.BoxGeometry(width - 0.16, 0.04, 0.04), { position: [0, yTop + 0.02, zCenter + z] });
  for (let i = 0; i < ladders; i++) {
    const x = (i - (ladders - 1) / 2) * 0.55;
    const L = length - 0.3;
    for (const s of [-1, 1]) b.add('aluminum', new THREE.BoxGeometry(0.04, 0.09, L), { position: [x + s * 0.2, yTop + 0.1, zCenter] });
    for (let k = 0; k < 9; k++) b.add('aluminum', new THREE.BoxGeometry(0.4, 0.03, 0.03), { position: [x, yTop + 0.1, zCenter - L / 2 + 0.2 + k * ((L - 0.4) / 8)] });
  }
}

function lights(b, { w, zFront, zRear, yFront, yRear }) {
  for (const s of [-1, 1]) {
    b.add('headlight', roundedBox(0.42, 0.2, 0.08, 0.04), { position: [s * (w / 2 - 0.32), yFront, zFront - 0.02] });
    b.add('amber', new THREE.BoxGeometry(0.1, 0.08, 0.05), { position: [s * (w / 2 - 0.06), yFront - 0.02, zFront - 0.05] });
    b.add('taillight', roundedBox(0.16, 0.46, 0.06, 0.03), { position: [s * (w / 2 - 0.17), yRear, zRear + 0.02] });
  }
}

export function fullSizeVan() {
  const b = new Builder();
  const w = 2.06;
  const L = 5.95;
  const wheelR = 0.39;
  const floor = 0.42;
  // Side profile (z,y): rear-bottom → rear → roof → windshield → hood → front → front-bottom.
  const outline = [
    [-L / 2, floor],
    [-L / 2, 2.25],
    [-L / 2 + 0.18, 2.42],
    [-L / 2 + 0.45, 2.5],
    [1.05, 2.5],
    [1.35, 2.44],
    [2.05, 1.62],
    [2.3, 1.42],
    [2.78, 1.3],
    [2.92, 1.1],
    [L / 2, 0.85],
    [L / 2, floor],
  ];
  b.add('paint', profileWithArches(outline, [{ z: 1.85, r: 0.52 }, { z: -1.75, r: 0.52 }], w, { bevel: 0.035 }));
  // Lower body cladding / rocker panels in dark plastic
  b.box('plastic-dark', [w + 0.02, 0.16, L - 1.9], { position: [0, floor + 0.05, 0.05] });
  // Bumpers
  b.add('plastic-dark', roundedBox(w + 0.04, 0.34, 0.32, 0.08), { position: [0, floor + 0.14, L / 2 - 0.02] });
  b.add('plastic-dark', roundedBox(w + 0.04, 0.3, 0.26, 0.08), { position: [0, floor + 0.12, -L / 2 + 0.02] });
  b.add('plastic-dark', new THREE.BoxGeometry(w * 0.8, 0.05, 0.3), { position: [0, floor + 0.3, -L / 2 - 0.1] }); // rear step
  // Grille with slats
  b.add('plastic-dark', roundedBox(1.1, 0.42, 0.06, 0.05), { position: [0, 0.98, L / 2 + 0.005] });
  for (let i = 0; i < 4; i++) b.add('chrome', new THREE.BoxGeometry(1.0, 0.025, 0.02), { position: [0, 0.84 + i * 0.09, L / 2 + 0.04] });
  b.add('accent', new THREE.BoxGeometry(0.34, 0.07, 0.02), { position: [0, 1.0, L / 2 + 0.045] }); // teal badge bar
  b.add('white', new THREE.BoxGeometry(0.3, 0.15, 0.01), { position: [0, 0.62, L / 2 + 0.17] }); // plate
  lights(b, { w, zFront: L / 2 + 0.08, zRear: -L / 2 - 0.04, yFront: 1.22, yRear: 1.3 });
  // Windshield (raked) and cab side windows
  glassPanel(b, w * 0.86, 0.92, [0, 2.0, 1.7], [-0.86, 0, 0]);
  for (const s of [-1, 1]) {
    glassPanel(b, 0.95, 0.62, [s * (w / 2 + 0.01), 1.92, 0.78], [0, s * Math.PI / 2, 0]);
    // Cargo-area blanked panel line (window delete) as subtle seam, plus sliding door on right
    seam(b, s, w / 2 + 0.01, 1.3, 0.22, 1.7);
    handle(b, s, 1.25, 0.42);
    mirror(b, s, 1.95, 1.25, 0.22, w / 2);
  }
  // Sliding door seam + handle (right side only) and rear door seams
  seam(b, 1, w / 2 + 0.01, 1.3, -1.32, 1.7);
  handle(b, 1, 1.25, -1.1);
  b.add('plastic-dark', new THREE.BoxGeometry(0.012, 1.6, 0.012), { position: [0, 1.45, -L / 2 - 0.045] });
  for (const s of [-1, 1]) b.add('chrome', roundedBox(0.03, 0.2, 0.035, 0.01), { position: [s * 0.12, 1.25, -L / 2 - 0.06] });
  glassPanel(b, 0.6, 0.5, [-0.45, 1.95, -L / 2 - 0.04], [0, Math.PI, 0]);
  glassPanel(b, 0.6, 0.5, [0.45, 1.95, -L / 2 - 0.04], [0, Math.PI, 0]);
  // Fuel door, roof vent, antenna
  b.add('plastic-dark', new THREE.BoxGeometry(0.01, 0.18, 0.18), { position: [-(w / 2 + 0.008), 1.3, -0.9] });
  b.add('white', roundedBox(0.5, 0.08, 0.5, 0.03), { position: [0, 2.53, -1.4] });
  b.add('plastic-dark', new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), { position: [0.6, 2.75, 1.0] });
  // Underbody, axles, exhaust
  b.box('underbody', [w * 0.78, 0.25, L - 1.0], { position: [0, floor - 0.1, 0] });
  for (const z of [1.85, -1.75]) b.add('underbody', new THREE.CylinderGeometry(0.05, 0.05, w - 0.4, 10), { position: [0, wheelR, z], rotation: [0, 0, Math.PI / 2] });
  b.add('steel', new THREE.CylinderGeometry(0.035, 0.035, 0.6, 10), { position: [-0.6, floor - 0.12, -L / 2 + 0.2], rotation: [Math.PI / 2, 0, 0] });
  // Teal beltline stripe and wordmark decal zones (materials replaced at runtime)
  for (const s of [-1, 1]) b.add('accent', new THREE.BoxGeometry(0.01, 0.1, L - 2.2), { position: [s * (w / 2 + 0.012), 0.98, -0.3] });
  b.add('decal-left', new THREE.PlaneGeometry(2.8, 0.7), { position: [-(w / 2 + 0.02), 1.6, -0.9], rotation: [0, -Math.PI / 2, 0] });
  b.add('decal-right', new THREE.PlaneGeometry(2.8, 0.7), { position: [w / 2 + 0.02, 1.6, -0.9], rotation: [0, Math.PI / 2, 0] });
  b.add('decal-rear', new THREE.PlaneGeometry(1.5, 0.38), { position: [0, 1.1, -L / 2 - 0.07], rotation: [0, Math.PI, 0] });

  const body = b.build('body');
  const root = new THREE.Group();
  root.name = 'full-size-van';
  root.add(body);
  // Ladder rack as its own node so the game can toggle it per upgrade.
  const rackB = new Builder();
  ladderRack(rackB, w, 3.6, -0.6, 2.62, 2);
  const rack = rackB.build('rack');
  root.add(rack);
  addWheels(root, { w, wheelR, front: 1.85, rear: -1.75, width: 0.27 });
  return root;
}

export function addWheels(root, { w, wheelR, front, rear, width, dualRear = false }) {
  const positions = [
    ['fl', -1, front, true],
    ['fr', 1, front, true],
    ['rl', -1, rear, false],
    ['rr', 1, rear, false],
  ];
  for (const [tag, side, z, steer] of positions) {
    const wh = wheel(`wheel_${tag}`, wheelR, width);
    const x = side * (w / 2 - width / 2 - 0.02);
    if (steer) {
      const pivot = new THREE.Group();
      pivot.name = `steer_${tag}`;
      pivot.position.set(x, wheelR, z);
      pivot.add(wh);
      root.add(pivot);
    } else {
      wh.position.set(x, wheelR, z);
      root.add(wh);
      if (dualRear) {
        const inner = wheel(`wheel_${tag}_inner`, wheelR, width);
        inner.position.set(side * (w / 2 - width * 1.5 - 0.05), wheelR, z);
        root.add(inner);
      }
    }
  }
}

export function compactVan() {
  const b = new Builder();
  const w = 1.92;
  const L = 4.75;
  const wheelR = 0.34;
  const floor = 0.36;
  const outline = [
    [-L / 2, floor],
    [-L / 2, 1.78],
    [-L / 2 + 0.15, 1.9],
    [-L / 2 + 0.4, 1.97],
    [0.75, 1.97],
    [1.05, 1.9],
    [1.65, 1.35],
    [1.9, 1.2],
    [2.2, 1.12],
    [2.3, 0.95],
    [L / 2, 0.75],
    [L / 2, floor],
  ];
  b.add('paint', profileWithArches(outline, [{ z: 1.5, r: 0.46 }, { z: -1.4, r: 0.46 }], w, { bevel: 0.03 }));
  b.box('plastic-dark', [w + 0.02, 0.14, L - 1.7], { position: [0, floor + 0.04, 0.05] });
  b.add('plastic-dark', roundedBox(w + 0.04, 0.3, 0.28, 0.08), { position: [0, floor + 0.12, L / 2 - 0.02] });
  b.add('plastic-dark', roundedBox(w + 0.04, 0.26, 0.22, 0.08), { position: [0, floor + 0.1, -L / 2 + 0.02] });
  b.add('plastic-dark', roundedBox(0.9, 0.34, 0.06, 0.05), { position: [0, 0.85, L / 2 + 0.005] });
  for (let i = 0; i < 3; i++) b.add('chrome', new THREE.BoxGeometry(0.8, 0.025, 0.02), { position: [0, 0.74 + i * 0.1, L / 2 + 0.04] });
  b.add('accent', new THREE.BoxGeometry(0.3, 0.06, 0.02), { position: [0, 0.86, L / 2 + 0.045] });
  b.add('white', new THREE.BoxGeometry(0.3, 0.15, 0.01), { position: [0, 0.55, L / 2 + 0.16] });
  lights(b, { w, zFront: L / 2 + 0.07, zRear: -L / 2 - 0.04, yFront: 1.05, yRear: 1.1 });
  glassPanel(b, w * 0.86, 0.72, [0, 1.62, 1.38], [-0.8, 0, 0]);
  for (const s of [-1, 1]) {
    glassPanel(b, 0.8, 0.5, [s * (w / 2 + 0.01), 1.52, 0.6], [0, s * Math.PI / 2, 0]);
    seam(b, s, w / 2 + 0.01, 1.05, 0.12, 1.35);
    handle(b, s, 1.02, 0.3);
    mirror(b, s, 1.55, 1.0, 0.18, w / 2);
  }
  seam(b, 1, w / 2 + 0.01, 1.05, -1.1, 1.35);
  handle(b, 1, 1.02, -0.9);
  b.add('plastic-dark', new THREE.BoxGeometry(0.012, 1.3, 0.012), { position: [0, 1.15, -L / 2 - 0.04] });
  glassPanel(b, 0.55, 0.42, [-0.4, 1.55, -L / 2 - 0.035], [0, Math.PI, 0]);
  glassPanel(b, 0.55, 0.42, [0.4, 1.55, -L / 2 - 0.035], [0, Math.PI, 0]);
  b.box('underbody', [w * 0.78, 0.2, L - 0.9], { position: [0, floor - 0.08, 0] });
  for (const z of [1.5, -1.4]) b.add('underbody', new THREE.CylinderGeometry(0.045, 0.045, w - 0.36, 10), { position: [0, wheelR, z], rotation: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) b.add('accent', new THREE.BoxGeometry(0.01, 0.08, L - 1.9), { position: [s * (w / 2 + 0.012), 0.82, -0.25] });
  b.add('decal-left', new THREE.PlaneGeometry(2.2, 0.55), { position: [-(w / 2 + 0.02), 1.3, -0.75], rotation: [0, -Math.PI / 2, 0] });
  b.add('decal-right', new THREE.PlaneGeometry(2.2, 0.55), { position: [w / 2 + 0.02, 1.3, -0.75], rotation: [0, Math.PI / 2, 0] });
  b.add('decal-rear', new THREE.PlaneGeometry(1.3, 0.33), { position: [0, 0.9, -L / 2 - 0.065], rotation: [0, Math.PI, 0] });
  const root = new THREE.Group();
  root.name = 'compact-van';
  root.add(b.build('body'));
  const rackB = new Builder();
  ladderRack(rackB, w, 2.9, -0.45, 2.08, 1);
  root.add(rackB.build('rack'));
  addWheels(root, { w, wheelR, front: 1.5, rear: -1.4, width: 0.24 });
  return root;
}

export function pickup() {
  const b = new Builder();
  const w = 2.03;
  const L = 5.85;
  const wheelR = 0.42;
  const floor = 0.5;
  const bedStart = -0.35;
  // Cab + hood profile; bed is added separately so it reads as an open box.
  const cabOutline = [
    [bedStart, floor],
    [bedStart, 1.78],
    [bedStart + 0.12, 1.9],
    [bedStart + 0.4, 1.96],
    [0.95, 1.96],
    [1.25, 1.88],
    [1.75, 1.42],
    [2.0, 1.32],
    [2.75, 1.26],
    [2.9, 1.05],
    [L / 2, 0.82],
    [L / 2, floor],
  ];
  b.add('paint', profileWithArches(cabOutline, [{ z: 1.95, r: 0.56 }], w, { bevel: 0.03 }));
  // Bed sides with rear wheel arches
  const bedOutline = [
    [-L / 2, floor],
    [-L / 2, 1.5],
    [bedStart - 0.02, 1.5],
    [bedStart - 0.02, floor],
  ];
  b.add('paint', profileWithArches(bedOutline, [{ z: -1.75, r: 0.56 }], w, { bevel: 0.025 }));
  // Hollow bed: dark bed liner floor and inner walls
  b.box('plastic-dark', [w - 0.26, 0.04, L / 2 + bedStart - 0.1], { position: [0, 1.0, (bedStart - L / 2) / 2] });
  b.box('plastic-dark', [w - 0.28, 0.5, 0.03], { position: [0, 1.25, bedStart - 0.04] });
  for (const s of [-1, 1]) b.box('plastic-dark', [0.03, 0.5, L / 2 + bedStart - 0.1], { position: [s * (w / 2 - 0.14), 1.25, (bedStart - L / 2) / 2] });
  // Tailgate (slightly proud) and bumper
  b.add('paint', roundedBox(w - 0.1, 0.5, 0.06, 0.02), { position: [0, 1.25, -L / 2 - 0.01] });
  b.add('chrome', roundedBox(w + 0.04, 0.22, 0.24, 0.05), { position: [0, floor + 0.12, -L / 2 + 0.02] });
  b.add('chrome', roundedBox(w + 0.04, 0.3, 0.3, 0.06), { position: [0, floor + 0.14, L / 2 - 0.02] });
  // Crossbed toolbox with teal lid stripe
  b.add('aluminum', roundedBox(w - 0.2, 0.42, 0.5, 0.04), { position: [0, 1.5, bedStart - 0.32] });
  b.add('accent', new THREE.BoxGeometry(w - 0.3, 0.02, 0.44), { position: [0, 1.72, bedStart - 0.32] });
  // Grille, lights, glass, mirrors, handles
  b.add('plastic-dark', roundedBox(1.3, 0.5, 0.06, 0.05), { position: [0, 0.98, L / 2 + 0.005] });
  for (let i = 0; i < 3; i++) b.add('chrome', new THREE.BoxGeometry(1.2, 0.04, 0.02), { position: [0, 0.84 + i * 0.14, L / 2 + 0.04] });
  b.add('accent', new THREE.BoxGeometry(0.36, 0.08, 0.02), { position: [0, 0.98, L / 2 + 0.045] });
  lights(b, { w, zFront: L / 2 + 0.07, zRear: -L / 2 - 0.04, yFront: 1.18, yRear: 1.22 });
  glassPanel(b, w * 0.84, 0.66, [0, 1.6, 1.46], [-0.72, 0, 0]);
  for (const s of [-1, 1]) {
    glassPanel(b, 0.78, 0.46, [s * (w / 2 + 0.01), 1.55, 0.72], [0, s * Math.PI / 2, 0]);
    glassPanel(b, 0.6, 0.44, [s * (w / 2 + 0.01), 1.55, -0.02], [0, s * Math.PI / 2, 0]);
    seam(b, s, w / 2 + 0.01, 1.1, 0.33, 1.2);
    handle(b, s, 1.1, 0.5);
    handle(b, s, 1.1, -0.2);
    mirror(b, s, 1.6, 1.1, 0.2, w / 2);
    b.add('plastic-dark', new THREE.BoxGeometry(0.12, 0.08, 1.9), { position: [s * (w / 2 + 0.05), floor + 0.1, 0.6] }); // running boards
  }
  glassPanel(b, w * 0.7, 0.4, [0, 1.6, bedStart - 0.035], [0, Math.PI, 0]);
  b.box('underbody', [w * 0.76, 0.28, L - 1.2], { position: [0, floor - 0.12, 0] });
  for (const z of [1.95, -1.75]) b.add('underbody', new THREE.CylinderGeometry(0.05, 0.05, w - 0.4, 10), { position: [0, wheelR, z], rotation: [0, 0, Math.PI / 2] });
  b.add('decal-left', new THREE.PlaneGeometry(1.1, 0.3), { position: [-(w / 2 + 0.02), 1.0, 0.75], rotation: [0, -Math.PI / 2, 0] });
  b.add('decal-right', new THREE.PlaneGeometry(1.1, 0.3), { position: [w / 2 + 0.02, 1.0, 0.75], rotation: [0, Math.PI / 2, 0] });
  b.add('decal-rear', new THREE.PlaneGeometry(1.2, 0.3), { position: [0, 1.25, -L / 2 - 0.05], rotation: [0, Math.PI, 0] });
  const root = new THREE.Group();
  root.name = 'pickup';
  root.add(b.build('body'));
  const rackB = new Builder();
  // Over-bed headache rack with a single ladder
  for (const s of [-1, 1]) rackB.add('steel', new THREE.BoxGeometry(0.05, 0.9, 0.05), { position: [s * (w / 2 - 0.2), 1.95, bedStart - 0.1] });
  rackB.add('steel', new THREE.BoxGeometry(w - 0.3, 0.05, 0.05), { position: [0, 2.4, bedStart - 0.1] });
  for (const s of [-1, 1]) rackB.add('steel', new THREE.BoxGeometry(0.05, 0.9, 0.05), { position: [s * (w / 2 - 0.2), 1.95, -L / 2 + 0.2] });
  rackB.add('steel', new THREE.BoxGeometry(w - 0.3, 0.05, 0.05), { position: [0, 2.4, -L / 2 + 0.2] });
  for (const s of [-1, 1]) rackB.add('aluminum', new THREE.BoxGeometry(0.04, 0.09, 2.6), { position: [s * 0.2, 2.48, -1.5] });
  for (let k = 0; k < 8; k++) rackB.add('aluminum', new THREE.BoxGeometry(0.4, 0.03, 0.03), { position: [0, 2.48, -2.6 + k * 0.32] });
  root.add(rackB.build('rack'));
  addWheels(root, { w, wheelR, front: 1.95, rear: -1.75, width: 0.28 });
  return root;
}

export function boxTruck() {
  const b = new Builder();
  const w = 2.4;
  const L = 7.4;
  const wheelR = 0.47;
  const floor = 0.55;
  const cabFront = L / 2;
  const cabBack = 1.35;
  // Conventional cab profile
  const cabOutline = [
    [cabBack, floor],
    [cabBack, 2.55],
    [cabBack + 0.1, 2.68],
    [cabBack + 0.35, 2.75],
    [2.2, 2.75],
    [2.45, 2.66],
    [2.85, 2.1],
    [3.05, 1.95],
    [3.55, 1.85],
    [3.65, 1.55],
    [cabFront, 1.2],
    [cabFront, floor],
  ];
  b.add('paint', profileWithArches(cabOutline, [{ z: 2.55, r: 0.62 }], w * 0.96, { bevel: 0.03 }));
  // Cargo box (white) with rear roll-up door, rub rails and corner caps
  const boxL = L / 2 + cabBack - 0.35;
  const boxZ = (cabBack - 0.1 - L / 2) / 2;
  b.add('white', roundedBox(w, 2.6, boxL, 0.04), { position: [0, 0.95 + 1.3, boxZ] });
  for (const s of [-1, 1]) {
    b.add('aluminum', new THREE.BoxGeometry(0.03, 0.08, boxL - 0.1), { position: [s * (w / 2 + 0.012), 1.25, boxZ] });
    b.add('aluminum', new THREE.BoxGeometry(0.03, 0.08, boxL - 0.1), { position: [s * (w / 2 + 0.012), 3.4, boxZ] });
    b.add('aluminum', new THREE.BoxGeometry(0.06, 2.6, 0.06), { position: [s * (w / 2 - 0.02), 2.25, -L / 2 + 0.03] });
  }
  b.add('accent', new THREE.BoxGeometry(w + 0.02, 0.12, 0.01), { position: [0, 2.0, -L / 2 - 0.005] }); // rear teal band
  b.add('aluminum', new THREE.BoxGeometry(w - 0.2, 2.2, 0.04), { position: [0, 2.15, -L / 2 - 0.02] });
  for (let i = 0; i < 8; i++) b.add('plastic-dark', new THREE.BoxGeometry(w - 0.24, 0.02, 0.01), { position: [0, 1.15 + i * 0.27, -L / 2 - 0.045] });
  b.add('plastic-dark', new THREE.BoxGeometry(0.4, 0.06, 0.05), { position: [0, 1.1, -L / 2 - 0.06] }); // pull strap
  // Liftgate platform and rails
  b.add('steel', new THREE.BoxGeometry(w - 0.3, 0.08, 1.1), { position: [0, 0.9, -L / 2 - 0.6] });
  for (const s of [-1, 1]) b.add('steel', new THREE.BoxGeometry(0.08, 1.0, 0.1), { position: [s * (w / 2 - 0.2), 1.3, -L / 2 - 0.1] });
  // Underride guard, mudflaps, fuel tank, exhaust stack
  b.add('steel', new THREE.BoxGeometry(w - 0.4, 0.1, 0.08), { position: [0, 0.5, -L / 2 - 0.15] });
  for (const s of [-1, 1]) b.add('rubber', new THREE.BoxGeometry(0.4, 0.5, 0.03), { position: [s * (w / 2 - 0.3), 0.4, -2.3] });
  b.add('aluminum', new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16), { position: [-(w / 2 - 0.2), 0.8, 0.6], rotation: [Math.PI / 2, 0, 0] });
  b.add('chrome', new THREE.CylinderGeometry(0.06, 0.06, 2.2, 10), { position: [w / 2 - 0.15, 1.9, cabBack - 0.1] });
  // Front: grille, bumper, lights, plate, hood ornament bar
  b.add('plastic-dark', roundedBox(1.5, 0.7, 0.06, 0.06), { position: [0, 1.3, cabFront + 0.005] });
  for (let i = 0; i < 5; i++) b.add('chrome', new THREE.BoxGeometry(1.4, 0.03, 0.02), { position: [0, 1.05 + i * 0.13, cabFront + 0.04] });
  b.add('accent', new THREE.BoxGeometry(0.44, 0.1, 0.02), { position: [0, 1.3, cabFront + 0.05] });
  b.add('chrome', roundedBox(w, 0.36, 0.34, 0.06), { position: [0, floor + 0.14, cabFront - 0.03] });
  lights(b, { w: w * 0.96, zFront: cabFront + 0.07, zRear: -L / 2 - 0.04, yFront: 1.55, yRear: 1.0 });
  glassPanel(b, w * 0.8, 0.9, [0, 2.3, 2.6], [-0.6, 0, 0]);
  for (const s of [-1, 1]) {
    glassPanel(b, 0.95, 0.7, [s * (w * 0.96 / 2 + 0.01), 2.25, 1.9], [0, s * Math.PI / 2, 0]);
    seam(b, s, w * 0.96 / 2 + 0.01, 1.6, 1.45, 1.6);
    handle(b, s, 1.65, 1.65);
    mirror(b, s, 2.3, 2.5, 0.3, w * 0.96 / 2);
    b.add('plastic-dark', new THREE.BoxGeometry(0.3, 0.06, 0.7), { position: [s * (w / 2 - 0.05), floor + 0.25, 1.9] }); // step
  }
  b.box('underbody', [w * 0.7, 0.3, L - 1.6], { position: [0, floor - 0.1, -0.3] });
  for (const z of [2.55, -2.1]) b.add('underbody', new THREE.CylinderGeometry(0.06, 0.06, w - 0.5, 10), { position: [0, wheelR, z], rotation: [0, 0, Math.PI / 2] });
  b.add('decal-left', new THREE.PlaneGeometry(4.2, 1.05), { position: [-(w / 2 + 0.02), 2.35, boxZ], rotation: [0, -Math.PI / 2, 0] });
  b.add('decal-right', new THREE.PlaneGeometry(4.2, 1.05), { position: [w / 2 + 0.02, 2.35, boxZ], rotation: [0, Math.PI / 2, 0] });
  b.add('decal-rear', new THREE.PlaneGeometry(1.8, 0.45), { position: [0, 2.85, -L / 2 - 0.05], rotation: [0, Math.PI, 0] });
  const root = new THREE.Group();
  root.name = 'box-truck';
  root.add(b.build('body'));
  const rackB = new Builder();
  rackB.add('steel', new THREE.BoxGeometry(0.05, 0.05, 2.0), { position: [w / 2 - 0.1, 3.62, boxZ] });
  root.add(rackB.build('rack'));
  rackB.build('rack');
  addWheels(root, { w, wheelR, front: 2.55, rear: -2.1, width: 0.3, dualRear: true });
  return root;
}
