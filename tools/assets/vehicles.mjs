// Vehicle generators. Coordinates: +z nose, +y up, +x driver's right (vehicle right side).
// Bodies are a beveled lower tub (with real wheel arches) plus a lofted upper shell with rounded
// roof edges, tumblehome and a curved hood, so silhouettes read as automotive rather than boxy.
import * as THREE from 'three';
import { Builder, loftShell, profileWithArches, roundedBox, shellSection, sidePolygon, wheel } from './lib.mjs';

function glassPanel(b, w, h, position, rotation, inset = 0.012) {
  // Black seal/frame slightly larger than the glass, then the glass proud of it.
  b.add('plastic-dark', new THREE.BoxGeometry(w + 0.07, h + 0.07, 0.012), { position, rotation });
  const g = new THREE.BoxGeometry(w, h, 0.014);
  const off = new THREE.Vector3(0, 0, inset).applyEuler(new THREE.Euler(...rotation));
  b.add('glass', g, { position: [position[0] + off.x, position[1] + off.y, position[2] + off.z], rotation });
}

/** Windshield lying on the sloped surface between two stations (z0,y0 lower) and (z1,y1 upper). */
function windshield(b, w, z0, y0, z1, y1, margin = 0.08) {
  const dz = z0 - z1;
  const dy = y1 - y0;
  const len = Math.hypot(dz, dy) - margin * 2;
  const a = -Math.atan2(dz, dy); // rotate a +z-normal panel about x to lie on the slope
  const n = new THREE.Vector3(0, Math.sin(-a), Math.cos(-a)).normalize();
  const c = [0, (y0 + y1) / 2 + n.y * 0.02, (z0 + z1) / 2 + n.z * 0.02];
  glassPanel(b, w, len, c, [a, 0, 0]);
  // Wipers
  for (const s of [-0.35, 0.3]) b.add('plastic-dark', new THREE.BoxGeometry(0.55, 0.015, 0.02), { position: [s, y0 + 0.06 + n.y * 0.03, z0 - 0.06 + n.z * 0.03], rotation: [a, 0, 0.35] });
}

function mirror(b, side, y, z, armLength, halfWidth) {
  const base = halfWidth - 0.02;
  b.add('plastic-dark', new THREE.BoxGeometry(armLength, 0.05, 0.07), { position: [side * (base + armLength / 2), y, z] });
  b.add('plastic-dark', new THREE.BoxGeometry(armLength * 0.8, 0.04, 0.05), { position: [side * (base + armLength / 2), y - 0.16, z - 0.03], rotation: [0, 0, side * 0.3] });
  b.add('plastic-dark', roundedBox(0.13, 0.3, 0.22, 0.04), { position: [side * (base + armLength + 0.05), y - 0.03, z] });
  b.add('glass', new THREE.BoxGeometry(0.1, 0.24, 0.01), { position: [side * (base + armLength + 0.05), y - 0.03, z - 0.115] });
  b.add('amber', new THREE.BoxGeometry(0.02, 0.03, 0.12), { position: [side * (base + armLength + 0.115), y + 0.08, z + 0.02] }); // repeater
}

function handle(b, side, x, y, z) {
  b.add('plastic-dark', roundedBox(0.02, 0.06, 0.2, 0.01), { position: [side * x, y, z] });
  b.add('chrome', roundedBox(0.025, 0.03, 0.16, 0.01), { position: [side * (x + 0.012), y + 0.005, z] });
}

/** Door outline: vertical seams plus a horizontal cut along the bottom edge, as thin recessed lines. */
function doorOutline(b, side, x, zFront, zRear, yTop, yBottom) {
  for (const z of [zFront, zRear]) b.add('plastic-dark', new THREE.BoxGeometry(0.01, yTop - yBottom, 0.014), { position: [side * x, (yTop + yBottom) / 2, z] });
  b.add('plastic-dark', new THREE.BoxGeometry(0.01, 0.014, Math.abs(zFront - zRear)), { position: [side * x, yBottom, (zFront + zRear) / 2] });
}

function ladderRack(b, width, length, zCenter, yTop, ladders = 2, conduit = true) {
  const rails = [-1, 1];
  for (const s of rails) b.add('steel', roundedBox(0.05, 0.06, length, 0.02), { position: [s * (width / 2 - 0.1), yTop, zCenter] });
  for (const s of rails) for (const z of [-length / 2 + 0.2, 0, length / 2 - 0.2]) {
    b.add('steel', new THREE.BoxGeometry(0.05, 0.18, 0.05), { position: [s * (width / 2 - 0.1), yTop - 0.1, zCenter + z] });
    b.add('plastic-dark', new THREE.BoxGeometry(0.1, 0.03, 0.12), { position: [s * (width / 2 - 0.1), yTop - 0.2, zCenter + z] }); // feet
  }
  for (const z of [-length / 2 + 0.2, length / 2 - 0.2]) b.add('steel', new THREE.BoxGeometry(width - 0.2, 0.05, 0.05), { position: [0, yTop + 0.02, zCenter + z] });
  // Rear roller for loading
  b.add('plastic-dark', new THREE.CylinderGeometry(0.04, 0.04, width - 0.3, 10), { position: [0, yTop + 0.03, zCenter - length / 2 + 0.05], rotation: [0, 0, Math.PI / 2] });
  for (let i = 0; i < ladders; i++) {
    const x = (i - (ladders - 1) / 2) * 0.6;
    const L = length - 0.4;
    for (const s of [-1, 1]) b.add('aluminum', new THREE.BoxGeometry(0.035, 0.08, L), { position: [x + s * 0.21, yTop + 0.1, zCenter] });
    for (let k = 0; k < 10; k++) b.add('aluminum', new THREE.CylinderGeometry(0.014, 0.014, 0.42, 6), { position: [x, yTop + 0.1, zCenter - L / 2 + 0.2 + k * ((L - 0.4) / 9)], rotation: [0, 0, Math.PI / 2] });
    for (const z of [-L / 2 + 0.5, L / 2 - 0.5]) b.add('plastic-dark', new THREE.BoxGeometry(0.5, 0.03, 0.04), { position: [x, yTop + 0.15, zCenter + z] }); // straps
  }
  if (conduit) {
    b.add('white', new THREE.CylinderGeometry(0.08, 0.08, length - 0.2, 14), { position: [width / 2 - 0.22, yTop + 0.12, zCenter], rotation: [Math.PI / 2, 0, 0] });
    b.add('plastic-dark', new THREE.CylinderGeometry(0.085, 0.085, 0.06, 14), { position: [width / 2 - 0.22, yTop + 0.12, zCenter - length / 2 + 0.1], rotation: [Math.PI / 2, 0, 0] });
  }
}

/** Front fascia: headlamp pockets with lenses wrapping the corner, DRL strips, grille, air dam, fog lamps, plate, tow hooks. */
function frontFascia(b, { w, zFront, yLamp, yGrille, grilleW, grilleH, floor, lampW = 0.5, lampH = 0.24 }) {
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - lampW / 2 - 0.08);
    b.add('plastic-dark', roundedBox(lampW + 0.05, lampH + 0.05, 0.04, 0.05), { position: [x, yLamp, zFront - 0.01] });
    b.add('headlight', roundedBox(lampW, lampH, 0.04, 0.05), { position: [x, yLamp, zFront + 0.01] });
    b.add('chrome', new THREE.CylinderGeometry(0.075, 0.075, 0.02, 16), { position: [x - s * 0.1, yLamp, zFront + 0.03], rotation: [Math.PI / 2, 0, 0] }); // projector
    b.add('white', new THREE.BoxGeometry(lampW - 0.05, 0.02, 0.02), { position: [x, yLamp + lampH / 2 - 0.04, zFront + 0.035] }); // DRL
    // Corner return of the lamp onto the fender
    b.add('headlight', new THREE.BoxGeometry(0.03, lampH * 0.8, 0.22), { position: [s * (w / 2 - 0.0), yLamp, zFront - 0.14] });
    b.add('amber', new THREE.BoxGeometry(0.03, 0.05, 0.14), { position: [s * (w / 2 + 0.005), yLamp - lampH / 2 + 0.03, zFront - 0.15] });
    b.add('plastic-dark', new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14), { position: [s * (w / 2 - 0.35), floor + 0.22, zFront + 0.02], rotation: [Math.PI / 2, 0, 0] }); // fog pocket
    b.add('amber', new THREE.CylinderGeometry(0.05, 0.05, 0.02, 14), { position: [s * (w / 2 - 0.35), floor + 0.22, zFront + 0.045], rotation: [Math.PI / 2, 0, 0] });
    b.add('steel', new THREE.BoxGeometry(0.05, 0.08, 0.1), { position: [s * (w / 2 - 0.62), floor + 0.08, zFront + 0.02] }); // tow hook
  }
  // Grille: dark mesh plate, horizontal bars, teal bolt badge bar
  b.add('plastic-dark', roundedBox(grilleW, grilleH, 0.05, 0.06), { position: [0, yGrille, zFront + 0.005] });
  const bars = 4;
  for (let i = 0; i < bars; i++) b.add('chrome', new THREE.BoxGeometry(grilleW - 0.1, 0.022, 0.025), { position: [0, yGrille - grilleH / 2 + 0.07 + i * ((grilleH - 0.14) / (bars - 1)), zFront + 0.04] });
  b.add('accent', roundedBox(0.3, 0.07, 0.03, 0.02), { position: [0, yGrille, zFront + 0.055] });
  // Lower air dam with mesh and the license plate above it
  b.add('plastic-dark', roundedBox(grilleW + 0.3, 0.2, 0.05, 0.05), { position: [0, floor + 0.2, zFront + 0.005] });
  b.add('white', roundedBox(0.31, 0.16, 0.012, 0.01), { position: [0, floor + 0.42, zFront + 0.04] });
  b.add('plastic-dark', roundedBox(0.34, 0.19, 0.01, 0.01), { position: [0, floor + 0.42, zFront + 0.03] });
}

function rearLamps(b, { w, zRear, y, h = 0.5 }) {
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.14);
    b.add('plastic-dark', roundedBox(0.18, h + 0.04, 0.03, 0.02), { position: [x, y, zRear - 0.005] });
    b.add('taillight', roundedBox(0.14, h * 0.55, 0.03, 0.02), { position: [x, y + h * 0.2, zRear - 0.02] });
    b.add('amber', roundedBox(0.14, h * 0.2, 0.03, 0.02), { position: [x, y - h * 0.2, zRear - 0.02] });
    b.add('white', roundedBox(0.14, h * 0.16, 0.03, 0.02), { position: [x, y - h * 0.4, zRear - 0.02] });
    b.add('taillight', new THREE.BoxGeometry(0.12, 0.03, 0.01), { position: [x, y - h / 2 - 0.1, zRear - 0.01] }); // reflector
  }
}

function roofDetails(b, w, zFrom, zTo, yRoof) {
  // Shallow stamped roof ribs and a vent dome, antenna, high-mount stop lamp at the rear
  for (const x of [-0.55, 0, 0.55]) b.add('paint', new THREE.BoxGeometry(0.06, 0.012, zTo - zFrom - 0.6), { position: [x, yRoof + 0.004, (zFrom + zTo) / 2] });
  b.add('white', roundedBox(0.45, 0.07, 0.45, 0.04), { position: [0, yRoof + 0.03, zFrom + 1.2] });
  b.add('plastic-dark', new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), { position: [w * 0.3, yRoof + 0.17, zTo - 0.5] });
  b.add('taillight', new THREE.BoxGeometry(0.3, 0.04, 0.03), { position: [0, yRoof - 0.1, zFrom - 0.01] });
}

/** The side wrap graphic: a tapered teal sweep rising from the rear rocker to the front-door beltline, plus the beltline line. */
function wrapGraphics(b, side, x, L, belt, floor) {
  const z0 = -L / 2 + 0.3;
  const sweep = [[z0, floor + 0.3], [z0, floor + 0.62], [z0 + 1.6, belt - 0.22], [z0 + 3.1, belt - 0.05], [z0 + 3.1, belt - 0.12], [z0 + 1.7, belt - 0.36], [z0 + 0.6, floor + 0.34]];
  b.add('accent', sidePolygon(sweep, side * x, side));
  const thin = [[z0 + 0.2, floor + 0.2], [z0 + 0.2, floor + 0.26], [z0 + 2.4, belt - 0.4], [z0 + 2.4, belt - 0.46]];
  b.add('white', sidePolygon(thin, side * x, side));
  b.add('accent', new THREE.BoxGeometry(0.008, 0.05, L - 1.0), { position: [side * x, belt, -0.3] });
}

export function fullSizeVan() {
  const b = new Builder();
  const w = 2.06;
  const L = 5.95;
  const wheelR = 0.39;
  const floor = 0.42;
  const belt = 1.3;
  const roof = 2.52;
  // Lower tub: beveled, with the wheel arches, up to the beltline
  const tub = [[-L / 2, floor], [-L / 2, belt], [L / 2 - 0.05, belt], [L / 2, belt - 0.15], [L / 2, floor]];
  b.add('paint', profileWithArches(tub, [{ z: 1.85, r: 0.53 }, { z: -1.75, r: 0.53 }], w, { bevel: 0.035 }));
  // Upper shell: rear doors → cargo roof → windshield → hood → nose
  const S = (z, yTop, hwT, r, hwB = w / 2) => ({ z, section: shellSection({ yBottom: belt - 0.02, yTop, hwB, hwT, r }) });
  const shell = loftShell([
    S(-L / 2 + 0.02, roof - 0.06, w / 2 - 0.06, 0.2),
    S(-L / 2 + 0.3, roof, w / 2 - 0.04, 0.24),
    S(0.95, roof, w / 2 - 0.04, 0.24),
    S(1.3, roof - 0.06, w / 2 - 0.05, 0.22),
    S(2.05, 1.62, w / 2 - 0.02, 0.16),
    S(2.35, 1.5, w / 2 - 0.02, 0.14),
    S(2.8, 1.4, w / 2 - 0.03, 0.14),
    S(L / 2 - 0.02, 1.3, w / 2 - 0.06, 0.1),
  ]);
  b.add('paint', shell);
  // Hood crease and cowl vent
  b.add('paint', new THREE.BoxGeometry(0.08, 0.015, 0.75), { position: [0, 1.46, 2.5], rotation: [-0.12, 0, 0] });
  b.add('plastic-dark', new THREE.BoxGeometry(w * 0.7, 0.03, 0.08), { position: [0, 1.58, 2.08] });
  // Rocker cladding, bumpers, rear step
  b.box('plastic-dark', [w + 0.02, 0.16, L - 2.1], { position: [0, floor + 0.05, 0.05] });
  b.add('plastic-dark', roundedBox(w + 0.04, 0.36, 0.34, 0.1), { position: [0, floor + 0.16, L / 2 - 0.04] });
  b.add('plastic-dark', roundedBox(w + 0.04, 0.3, 0.28, 0.1), { position: [0, floor + 0.14, -L / 2 + 0.04] });
  b.add('plastic-dark', new THREE.BoxGeometry(w * 0.8, 0.05, 0.3), { position: [0, floor + 0.32, -L / 2 - 0.1] });
  frontFascia(b, { w, zFront: L / 2 + 0.1, yLamp: 1.1, yGrille: 0.95, grilleW: 1.1, grilleH: 0.4, floor });
  rearLamps(b, { w, zRear: -L / 2 - 0.02, y: 1.45, h: 0.6 });
  // Glass: windshield on the A-pillar slope, cab side windows, rear door windows
  windshield(b, w * 0.86, 2.05, 1.62, 1.3, roof - 0.06);
  for (const s of [-1, 1]) {
    glassPanel(b, 0.98, 0.64, [s * (w / 2 - 0.045), 1.94, 0.78], [0, (s * Math.PI) / 2, 0]);
    doorOutline(b, s, w / 2 + 0.012, 1.3, 0.22, belt - 0.02, floor + 0.14);
    handle(b, s, w / 2 + 0.012, 1.2, 0.42);
    mirror(b, s, 1.95, 1.3, 0.24, w / 2);
    b.add('plastic-dark', new THREE.BoxGeometry(0.01, 0.6, 0.012), { position: [s * (w / 2 - 0.02), 2.0, 0.22] }); // B-pillar seam
  }
  // Sliding cargo door (right side) with its upper track; blanked window delete panels
  doorOutline(b, 1, w / 2 + 0.012, 0.2, -1.35, belt - 0.02, floor + 0.14);
  handle(b, 1, w / 2 + 0.012, 1.2, -1.1);
  b.add('plastic-dark', new THREE.BoxGeometry(0.02, 0.05, 1.7), { position: [w / 2 - 0.03, 2.08, -2.0] });
  b.add('plastic-dark', new THREE.BoxGeometry(0.01, 0.6, 0.012), { position: [w / 2 - 0.02, 2.0, -1.35] });
  // Rear doors: center seam, hinges, handles, windows
  b.add('plastic-dark', new THREE.BoxGeometry(0.012, 1.9, 0.012), { position: [0, 1.5, -L / 2 - 0.04] });
  for (const s of [-1, 1]) {
    for (const y of [1.0, 1.9]) b.add('chrome', new THREE.BoxGeometry(0.05, 0.12, 0.04), { position: [s * (w / 2 - 0.06), y, -L / 2 - 0.05] });
    b.add('chrome', roundedBox(0.03, 0.22, 0.035, 0.01), { position: [s * 0.13, 1.25, -L / 2 - 0.06] });
    glassPanel(b, 0.62, 0.52, [s * 0.48, 1.98, -L / 2 - 0.03], [0, Math.PI, 0]);
  }
  b.add('plastic-dark', roundedBox(0.34, 0.19, 0.01, 0.01), { position: [0, 0.78, -L / 2 - 0.06] });
  b.add('white', roundedBox(0.31, 0.16, 0.012, 0.01), { position: [0, 0.78, -L / 2 - 0.07] });
  b.add('accent', new THREE.BoxGeometry(w - 0.5, 0.06, 0.008), { position: [0, 0.62, -L / 2 - 0.05] });
  // Fuel door, roof details, underbody, axles, exhaust
  b.add('plastic-dark', new THREE.BoxGeometry(0.01, 0.2, 0.2), { position: [-(w / 2 + 0.01), 1.05, -0.9] });
  roofDetails(b, w, -L / 2 + 0.3, 0.95, roof);
  b.box('underbody', [w * 0.78, 0.25, L - 1.0], { position: [0, floor - 0.1, 0] });
  for (const z of [1.85, -1.75]) b.add('underbody', new THREE.CylinderGeometry(0.05, 0.05, w - 0.4, 10), { position: [0, wheelR, z], rotation: [0, 0, Math.PI / 2] });
  b.add('underbody', new THREE.BoxGeometry(0.5, 0.3, 0.9), { position: [0, floor - 0.1, -1.75] }); // differential
  b.add('steel', new THREE.CylinderGeometry(0.035, 0.035, 0.6, 10), { position: [-0.6, floor - 0.12, -L / 2 + 0.2], rotation: [Math.PI / 2, 0, 0] });
  // Wrap graphics and decal zones
  for (const s of [-1, 1]) wrapGraphics(b, s, w / 2 + 0.014, L, belt, floor);
  b.add('decal-left', new THREE.PlaneGeometry(2.6, 0.62), { position: [-(w / 2 + 0.02), 1.72, -0.75], rotation: [0, -Math.PI / 2, 0] });
  b.add('decal-right', new THREE.PlaneGeometry(2.6, 0.62), { position: [w / 2 + 0.02, 1.72, -0.75], rotation: [0, Math.PI / 2, 0] });
  b.add('decal-rear', new THREE.PlaneGeometry(1.4, 0.36), { position: [0, 1.15, -L / 2 - 0.075], rotation: [0, Math.PI, 0] });

  const root = new THREE.Group();
  root.name = 'full-size-van';
  root.add(b.build('body'));
  const rackB = new Builder();
  ladderRack(rackB, w, 3.6, -0.7, roof + 0.14, 2, true);
  root.add(rackB.build('rack'));
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
    const x = side * (w / 2 - width / 2 - 0.03);
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
        inner.position.set(side * (w / 2 - width * 1.5 - 0.06), wheelR, z);
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
  const belt = 1.05;
  const roof = 1.98;
  const tub = [[-L / 2, floor], [-L / 2, belt], [L / 2 - 0.05, belt], [L / 2, belt - 0.12], [L / 2, floor]];
  b.add('paint', profileWithArches(tub, [{ z: 1.5, r: 0.46 }, { z: -1.4, r: 0.46 }], w, { bevel: 0.03 }));
  const S = (z, yTop, hwT, r) => ({ z, section: shellSection({ yBottom: belt - 0.02, yTop, hwB: w / 2, hwT, r }) });
  b.add('paint', loftShell([
    S(-L / 2 + 0.02, roof - 0.06, w / 2 - 0.06, 0.2),
    S(-L / 2 + 0.3, roof, w / 2 - 0.04, 0.26),
    S(0.7, roof, w / 2 - 0.04, 0.26),
    S(1.05, roof - 0.07, w / 2 - 0.05, 0.24),
    S(1.7, 1.35, w / 2 - 0.02, 0.16),
    S(1.95, 1.24, w / 2 - 0.02, 0.14),
    S(L / 2 - 0.02, 1.08, w / 2 - 0.06, 0.1),
  ]));
  b.add('plastic-dark', new THREE.BoxGeometry(w * 0.7, 0.03, 0.08), { position: [0, 1.32, 1.72] });
  b.box('plastic-dark', [w + 0.02, 0.14, L - 1.8], { position: [0, floor + 0.04, 0.05] });
  b.add('plastic-dark', roundedBox(w + 0.04, 0.32, 0.3, 0.1), { position: [0, floor + 0.14, L / 2 - 0.03] });
  b.add('plastic-dark', roundedBox(w + 0.04, 0.26, 0.24, 0.1), { position: [0, floor + 0.12, -L / 2 + 0.03] });
  frontFascia(b, { w, zFront: L / 2 + 0.08, yLamp: 0.95, yGrille: 0.82, grilleW: 0.9, grilleH: 0.32, floor, lampW: 0.42, lampH: 0.2 });
  rearLamps(b, { w, zRear: -L / 2 - 0.02, y: 1.2, h: 0.5 });
  windshield(b, w * 0.86, 1.7, 1.35, 1.05, roof - 0.07);
  for (const s of [-1, 1]) {
    glassPanel(b, 0.84, 0.52, [s * (w / 2 - 0.045), 1.52, 0.6], [0, (s * Math.PI) / 2, 0]);
    doorOutline(b, s, w / 2 + 0.012, 1.05, 0.12, belt - 0.02, floor + 0.12);
    handle(b, s, w / 2 + 0.012, 1.0, 0.3);
    mirror(b, s, 1.55, 1.05, 0.2, w / 2);
  }
  doorOutline(b, 1, w / 2 + 0.012, 0.1, -1.1, belt - 0.02, floor + 0.12);
  handle(b, 1, w / 2 + 0.012, 1.0, -0.9);
  b.add('plastic-dark', new THREE.BoxGeometry(0.02, 0.05, 1.3), { position: [w / 2 - 0.03, 1.62, -1.6] });
  b.add('plastic-dark', new THREE.BoxGeometry(0.012, 1.5, 0.012), { position: [0, 1.2, -L / 2 - 0.04] });
  for (const s of [-1, 1]) {
    b.add('chrome', roundedBox(0.03, 0.2, 0.035, 0.01), { position: [s * 0.12, 1.0, -L / 2 - 0.06] });
    glassPanel(b, 0.56, 0.44, [s * 0.42, 1.56, -L / 2 - 0.03], [0, Math.PI, 0]);
  }
  roofDetails(b, w, -L / 2 + 0.3, 0.7, roof);
  b.box('underbody', [w * 0.78, 0.2, L - 0.9], { position: [0, floor - 0.08, 0] });
  for (const z of [1.5, -1.4]) b.add('underbody', new THREE.CylinderGeometry(0.045, 0.045, w - 0.36, 10), { position: [0, wheelR, z], rotation: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) wrapGraphics(b, s, w / 2 + 0.014, L, belt, floor);
  b.add('decal-left', new THREE.PlaneGeometry(2.0, 0.5), { position: [-(w / 2 + 0.02), 1.4, -0.65], rotation: [0, -Math.PI / 2, 0] });
  b.add('decal-right', new THREE.PlaneGeometry(2.0, 0.5), { position: [w / 2 + 0.02, 1.4, -0.65], rotation: [0, Math.PI / 2, 0] });
  b.add('decal-rear', new THREE.PlaneGeometry(1.2, 0.3), { position: [0, 0.9, -L / 2 - 0.065], rotation: [0, Math.PI, 0] });
  const root = new THREE.Group();
  root.name = 'compact-van';
  root.add(b.build('body'));
  const rackB = new Builder();
  ladderRack(rackB, w, 2.9, -0.5, roof + 0.12, 1, false);
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
  const belt = 1.3;
  const bedStart = -0.35;
  // One tub for cab and bed with both arches; the cab shell is lofted above it; the bed stays open.
  const tub = [[-L / 2, floor], [-L / 2, belt], [L / 2 - 0.05, belt], [L / 2, belt - 0.14], [L / 2, floor]];
  b.add('paint', profileWithArches(tub, [{ z: 1.95, r: 0.57 }, { z: -1.75, r: 0.57 }], w, { bevel: 0.03 }));
  const S = (z, yTop, hwT, r) => ({ z, section: shellSection({ yBottom: belt - 0.02, yTop, hwB: w / 2, hwT, r }) });
  b.add('paint', loftShell([
    S(bedStart - 0.02, 1.9, w / 2 - 0.07, 0.2),
    S(bedStart + 0.2, 1.96, w / 2 - 0.05, 0.24),
    S(0.95, 1.96, w / 2 - 0.05, 0.24),
    S(1.25, 1.9, w / 2 - 0.05, 0.22),
    S(1.8, 1.42, w / 2 - 0.02, 0.14),
    S(2.1, 1.35, w / 2 - 0.02, 0.12),
    S(2.75, 1.32, w / 2 - 0.03, 0.12),
    S(L / 2 - 0.02, 1.28, w / 2 - 0.06, 0.1),
  ]));
  b.add('paint', new THREE.BoxGeometry(0.1, 0.02, 0.9), { position: [0, 1.36, 2.3], rotation: [-0.04, 0, 0] }); // power dome
  b.add('plastic-dark', new THREE.BoxGeometry(w * 0.7, 0.03, 0.08), { position: [0, 1.4, 1.82] });
  // Bed: inner liner, rails, tailgate, bumper, toolbox
  b.box('plastic-dark', [w - 0.26, 0.04, L / 2 + bedStart - 0.12], { position: [0, 1.0, (bedStart - L / 2) / 2] });
  b.box('plastic-dark', [w - 0.28, 0.3, 0.03], { position: [0, 1.15, bedStart - 0.05] });
  for (const s of [-1, 1]) {
    b.box('plastic-dark', [0.03, 0.3, L / 2 + bedStart - 0.12], { position: [s * (w / 2 - 0.14), 1.15, (bedStart - L / 2) / 2] });
    b.add('plastic-dark', roundedBox(0.06, 0.04, L / 2 + bedStart - 0.1, 0.02), { position: [s * (w / 2 - 0.02), belt + 0.01, (bedStart - L / 2) / 2] }); // bed rail caps
  }
  b.add('paint', roundedBox(w - 0.1, 0.5, 0.06, 0.02), { position: [0, 1.05, -L / 2 - 0.01] });
  b.add('plastic-dark', roundedBox(0.4, 0.08, 0.02, 0.01), { position: [0, 1.15, -L / 2 - 0.045] }); // tailgate handle
  b.add('chrome', roundedBox(w + 0.04, 0.22, 0.26, 0.05), { position: [0, floor + 0.12, -L / 2 + 0.03] });
  b.add('chrome', roundedBox(w + 0.04, 0.3, 0.3, 0.06), { position: [0, floor + 0.14, L / 2 - 0.02] });
  b.add('aluminum', roundedBox(w - 0.2, 0.42, 0.5, 0.04), { position: [0, 1.5, bedStart - 0.32] });
  b.add('accent', new THREE.BoxGeometry(w - 0.3, 0.02, 0.44), { position: [0, 1.72, bedStart - 0.32] });
  frontFascia(b, { w, zFront: L / 2 + 0.08, yLamp: 1.05, yGrille: 0.95, grilleW: 1.3, grilleH: 0.46, floor, lampW: 0.46, lampH: 0.26 });
  rearLamps(b, { w, zRear: -L / 2 - 0.02, y: 1.1, h: 0.44 });
  windshield(b, w * 0.84, 1.8, 1.42, 1.25, 1.9);
  for (const s of [-1, 1]) {
    glassPanel(b, 0.78, 0.46, [s * (w / 2 - 0.05), 1.56, 0.72], [0, (s * Math.PI) / 2, 0]);
    glassPanel(b, 0.6, 0.44, [s * (w / 2 - 0.05), 1.56, -0.02], [0, (s * Math.PI) / 2, 0]);
    doorOutline(b, s, w / 2 + 0.012, 1.2, 0.33, belt - 0.02, floor + 0.16);
    doorOutline(b, s, w / 2 + 0.012, 0.31, -0.33, belt - 0.02, floor + 0.16);
    handle(b, s, w / 2 + 0.012, 1.1, 0.5);
    handle(b, s, w / 2 + 0.012, 1.1, -0.18);
    mirror(b, s, 1.6, 1.15, 0.2, w / 2);
    b.add('plastic-dark', roundedBox(0.14, 0.06, 1.9, 0.02), { position: [s * (w / 2 + 0.04), floor + 0.12, 0.6] }); // running boards
  }
  glassPanel(b, w * 0.7, 0.36, [0, 1.6, bedStart - 0.035], [0, Math.PI, 0]);
  b.box('underbody', [w * 0.76, 0.28, L - 1.2], { position: [0, floor - 0.12, 0] });
  for (const z of [1.95, -1.75]) b.add('underbody', new THREE.CylinderGeometry(0.05, 0.05, w - 0.4, 10), { position: [0, wheelR, z], rotation: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) b.add('accent', new THREE.BoxGeometry(0.008, 0.05, L - 1.4), { position: [s * (w / 2 + 0.014), belt, -0.2] });
  b.add('decal-left', new THREE.PlaneGeometry(1.1, 0.3), { position: [-(w / 2 + 0.02), 0.95, 0.75], rotation: [0, -Math.PI / 2, 0] });
  b.add('decal-right', new THREE.PlaneGeometry(1.1, 0.3), { position: [w / 2 + 0.02, 0.95, 0.75], rotation: [0, Math.PI / 2, 0] });
  b.add('decal-rear', new THREE.PlaneGeometry(1.2, 0.3), { position: [0, 1.05, -L / 2 - 0.05], rotation: [0, Math.PI, 0] });
  const root = new THREE.Group();
  root.name = 'pickup';
  root.add(b.build('body'));
  const rackB = new Builder();
  for (const z of [bedStart - 0.1, -L / 2 + 0.2]) {
    for (const s of [-1, 1]) rackB.add('steel', new THREE.BoxGeometry(0.05, 1.1, 0.05), { position: [s * (w / 2 - 0.2), belt + 0.55, z] });
    rackB.add('steel', new THREE.BoxGeometry(w - 0.3, 0.05, 0.05), { position: [0, 2.4, z] });
  }
  for (const s of [-1, 1]) rackB.add('aluminum', new THREE.BoxGeometry(0.035, 0.08, 2.6), { position: [s * 0.21, 2.48, -1.5] });
  for (let k = 0; k < 9; k++) rackB.add('aluminum', new THREE.CylinderGeometry(0.014, 0.014, 0.42, 6), { position: [0, 2.48, -2.65 + k * 0.3], rotation: [0, 0, Math.PI / 2] });
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
  const belt = 1.6;
  const cw = w * 0.96;
  // Cab tub with the front arch, lofted conventional cab shell above
  const tub = [[cabBack, floor], [cabBack, belt], [cabFront - 0.06, belt], [cabFront, belt - 0.2], [cabFront, floor]];
  b.add('paint', profileWithArches(tub, [{ z: 2.55, r: 0.63 }], cw, { bevel: 0.03 }));
  const S = (z, yTop, hwT, r) => ({ z, section: shellSection({ yBottom: belt - 0.02, yTop, hwB: cw / 2, hwT, r }) });
  b.add('paint', loftShell([
    S(cabBack + 0.02, 2.65, cw / 2 - 0.08, 0.22),
    S(cabBack + 0.3, 2.75, cw / 2 - 0.05, 0.26),
    S(2.2, 2.75, cw / 2 - 0.05, 0.26),
    S(2.5, 2.66, cw / 2 - 0.05, 0.24),
    S(2.95, 2.0, cw / 2 - 0.02, 0.16),
    S(3.15, 1.9, cw / 2 - 0.02, 0.14),
    S(3.55, 1.85, cw / 2 - 0.03, 0.14),
    S(cabFront - 0.02, 1.7, cw / 2 - 0.06, 0.12),
  ]));
  b.add('paint', new THREE.BoxGeometry(0.12, 0.02, 0.5), { position: [0, 1.88, 3.35] });
  b.add('plastic-dark', new THREE.BoxGeometry(cw * 0.7, 0.03, 0.08), { position: [0, 1.98, 2.98] });
  // Cargo box (white) with rear roll-up door, rub rails, corner caps, translucent roof edge
  const boxL = L / 2 + cabBack - 0.35;
  const boxZ = (cabBack - 0.1 - L / 2) / 2;
  b.add('white', roundedBox(w, 2.6, boxL, 0.05), { position: [0, 0.95 + 1.3, boxZ] });
  for (const s of [-1, 1]) {
    b.add('aluminum', new THREE.BoxGeometry(0.03, 0.08, boxL - 0.1), { position: [s * (w / 2 + 0.012), 1.25, boxZ] });
    b.add('aluminum', new THREE.BoxGeometry(0.03, 0.08, boxL - 0.1), { position: [s * (w / 2 + 0.012), 3.4, boxZ] });
    b.add('aluminum', new THREE.BoxGeometry(0.06, 2.6, 0.06), { position: [s * (w / 2 - 0.02), 2.25, -L / 2 + 0.03] });
    for (let i = 1; i < 6; i++) b.add('plastic-dark', new THREE.BoxGeometry(0.008, 2.3, 0.012), { position: [s * (w / 2 + 0.008), 2.25, boxZ - boxL / 2 + i * (boxL / 6)] }); // panel seams
    b.add('amber', new THREE.BoxGeometry(0.02, 0.05, 0.12), { position: [s * (w / 2 + 0.02), 1.1, boxZ] }); // side marker
  }
  b.add('accent', new THREE.BoxGeometry(w + 0.02, 0.12, 0.01), { position: [0, 2.0, -L / 2 - 0.005] });
  b.add('aluminum', new THREE.BoxGeometry(w - 0.2, 2.2, 0.04), { position: [0, 2.15, -L / 2 - 0.02] });
  for (let i = 0; i < 8; i++) b.add('plastic-dark', new THREE.BoxGeometry(w - 0.24, 0.02, 0.01), { position: [0, 1.15 + i * 0.27, -L / 2 - 0.045] });
  b.add('plastic-dark', new THREE.BoxGeometry(0.4, 0.06, 0.05), { position: [0, 1.1, -L / 2 - 0.06] });
  b.add('steel', new THREE.BoxGeometry(w - 0.3, 0.08, 1.1), { position: [0, 0.9, -L / 2 - 0.6] });
  for (const s of [-1, 1]) b.add('steel', new THREE.BoxGeometry(0.08, 1.0, 0.1), { position: [s * (w / 2 - 0.2), 1.3, -L / 2 - 0.1] });
  b.add('steel', new THREE.BoxGeometry(w - 0.4, 0.1, 0.08), { position: [0, 0.5, -L / 2 - 0.15] });
  for (const s of [-1, 1]) b.add('rubber', new THREE.BoxGeometry(0.4, 0.5, 0.03), { position: [s * (w / 2 - 0.3), 0.4, -2.3] });
  b.add('aluminum', new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16), { position: [-(w / 2 - 0.2), 0.8, 0.6], rotation: [Math.PI / 2, 0, 0] });
  b.add('chrome', new THREE.CylinderGeometry(0.06, 0.06, 2.2, 10), { position: [w / 2 - 0.15, 1.9, cabBack - 0.1] });
  frontFascia(b, { w: cw, zFront: cabFront + 0.08, yLamp: 1.4, yGrille: 1.25, grilleW: 1.5, grilleH: 0.6, floor, lampW: 0.5, lampH: 0.28 });
  b.add('chrome', roundedBox(w, 0.36, 0.34, 0.06), { position: [0, floor + 0.14, cabFront - 0.03] });
  rearLamps(b, { w, zRear: -L / 2 - 0.04, y: 1.0, h: 0.4 });
  windshield(b, cw * 0.8, 2.95, 2.0, 2.5, 2.66);
  for (const s of [-1, 1]) {
    glassPanel(b, 0.95, 0.7, [s * (cw / 2 - 0.05), 2.25, 1.95], [0, (s * Math.PI) / 2, 0]);
    doorOutline(b, s, cw / 2 + 0.012, 2.4, 1.45, belt - 0.02, floor + 0.2);
    handle(b, s, cw / 2 + 0.012, 1.65, 1.65);
    mirror(b, s, 2.3, 2.55, 0.32, cw / 2);
    b.add('plastic-dark', new THREE.BoxGeometry(0.3, 0.06, 0.7), { position: [s * (w / 2 - 0.05), floor + 0.25, 1.9] });
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
  addWheels(root, { w, wheelR, front: 2.55, rear: -2.1, width: 0.3, dualRear: true });
  return root;
}
