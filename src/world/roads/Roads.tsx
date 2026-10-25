import { useMemo } from 'react';
import * as THREE from 'three';
import { STREETS, ROAD_WIDTH, SIDEWALK_WIDTH, HOUSE_LOTS, inwardDir, HQ_LOT, WAREHOUSE_LOT, COMPETITOR_LOT } from '@/game/world/cityLayout';
import { MeshBuilder } from '../assets/pbr';
import { STATIC_MATERIALS, UV_SCALES } from '../buildings/materials';
import { signTexture } from '../assets/textures';

/**
 * Street network as merged static geometry: asphalt with PBR detail, crisp markings,
 * curbs with gutters, jointed sidewalks, crosswalks, stop lines, manholes, driveway aprons,
 * stop signs and street-name blades. Everything here is decorative (not selectable).
 */

const CURB_H = 0.15;

function buildRoads(): THREE.Group {
  const mats: Record<string, THREE.Material> = {
    asphalt: STATIC_MATERIALS.asphalt(),
    concrete: STATIC_MATERIALS.concrete(),
    curb: new THREE.MeshStandardMaterial({ color: '#c9c4b8', roughness: 0.95 }),
    white: new THREE.MeshStandardMaterial({ color: '#e8e8e4', roughness: 0.6 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#e2c45a', roughness: 0.6 }),
    manhole: new THREE.MeshStandardMaterial({ color: '#5a5d61', roughness: 0.6, metalness: 0.6 }),
    pole: new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.45, metalness: 0.7 }),
    stop: new THREE.MeshStandardMaterial({ color: '#c4262e', roughness: 0.5 }),
    stopText: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }),
  };
  const b = new MeshBuilder(mats, UV_SCALES);
  const half = ROAD_WIDTH / 2;
  const walk = SIDEWALK_WIDTH;

  for (const s of STREETS) {
    const length = s.to - s.from;
    const center = (s.from + s.to) / 2;
    const isX = s.axis === 'x';
    const pos = (along: number, across: number, y: number): [number, number, number] => (isX ? [along, y, s.at + across] : [s.at + across, y, along]);
    const size = (alongLen: number, acrossLen: number, h: number): [number, number, number] => (isX ? [alongLen, h, acrossLen] : [acrossLen, h, alongLen]);
    // Asphalt slab (slightly below curb top so the curb reads as a step)
    b.box('asphalt', size(length, ROAD_WIDTH + 0.6, 0.08), pos(center, 0, 0.0));
    // Gutters, curbs and sidewalks on both sides
    for (const side of [-1, 1]) {
      b.box('concrete', size(length, 0.5, 0.06), pos(center, side * (half + 0.05), 0.02));
      b.box('curb', size(length, 0.3, CURB_H), pos(center, side * (half + 0.4), CURB_H / 2));
      b.box('concrete', size(length, walk, CURB_H), pos(center, side * (half + 0.55 + walk / 2), CURB_H / 2 - 0.005));
    }
    // Center dashes and edge lines
    const dash = 3;
    const gap = 6;
    for (let a = s.from + 4; a < s.to - 4; a += dash + gap) {
      if (Math.abs(a) < 8 || Math.abs(Math.abs(a) - (isX ? 130 : 100)) < 8) continue; // keep intersections clean
      b.box('yellow', size(dash, 0.14, 0.012), pos(a + dash / 2, 0, 0.05));
    }
    for (const side of [-1, 1]) b.box('white', size(length - 8, 0.12, 0.012), pos(center, side * (half - 0.35), 0.05));
    // Manholes
    for (let a = s.from + 37; a < s.to; a += 61) b.add('manhole', new THREE.CylinderGeometry(0.45, 0.45, 0.012, 16), pos(a, 1.4, 0.046));
  }

  // Intersections: asphalt patch, crosswalk bars, stop lines, stop signs and street blades.
  const ew = STREETS.filter((s) => s.axis === 'x');
  const ns = STREETS.filter((s) => s.axis === 'z');
  for (const sx of ew) {
    for (const sz of ns) {
      const cx = sz.at;
      const cz = sx.at;
      b.box('asphalt', [ROAD_WIDTH + 2 * walk + 1.4, 0.09, ROAD_WIDTH + 2 * walk + 1.4], [cx, 0.0, cz]);
      // Corner sidewalk pads with curb returns
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
        const px = cx + dx * (half + 0.55 + walk / 2);
        const pz = cz + dz * (half + 0.55 + walk / 2);
        b.box('concrete', [walk, CURB_H, walk], [px, CURB_H / 2 - 0.005, pz]);
        b.box('curb', [0.3, CURB_H, walk], [cx + dx * (half + 0.4), CURB_H / 2, pz]);
        b.box('curb', [walk, CURB_H, 0.3], [px, CURB_H / 2, cz + dz * (half + 0.4)]);
      }
      // Crosswalk bars on all four approaches
      for (const d of [-1, 1]) {
        for (let k = -3; k <= 3; k++) {
          b.box('white', [0.5, 0.012, 2.4], [cx + k * 1.2, 0.06, cz + d * (half + 0.9 + 1.2)]);
          b.box('white', [2.4, 0.012, 0.5], [cx + d * (half + 0.9 + 1.2), 0.06, cz + k * 1.2]);
        }
        // Stop lines
        b.box('white', [half - 0.6, 0.012, 0.4], [cx + d * (half / 2 + 0.2), 0.06, cz - d * (half + 3.6)]);
        b.box('white', [0.4, 0.012, half - 0.6], [cx + d * (half + 3.6), 0.06, cz + d * (half / 2 + 0.2)]);
      }
      // Stop signs on the near-right corner of each approach, plus one street-name blade pair
      for (const [dx, dz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
        const px = cx + dx * (half + 0.8);
        const pz = cz + dz * (half + 0.8);
        b.add('pole', new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8), [px, 1.3, pz]);
        b.add('stop', new THREE.CylinderGeometry(0.42, 0.42, 0.03, 8), [px, 2.45, pz], [Math.PI / 2, 0, dx * dz > 0 ? 0 : Math.PI / 2]);
        b.box('stopText', [0.5, 0.1, 0.01], [px, 2.45, pz + (dx * dz > 0 ? 0.02 : 0)], [0, dx * dz > 0 ? 0 : Math.PI / 2, 0]);
      }
      b.add('pole', new THREE.CylinderGeometry(0.035, 0.04, 3.3, 8), [cx + half + 1.1, 1.65, cz - half - 1.1]);
    }
  }

  // Driveway aprons (curb cut) for every lot that touches a street, including commercial lots.
  const lots = [...HOUSE_LOTS, HQ_LOT, WAREHOUSE_LOT, COMPETITOR_LOT];
  for (const lot of lots) {
    const dir = inwardDir(lot.facing);
    const horizontal = dir.z !== 0;
    const sideSign = lot.facing === 'north' || lot.facing === 'west' ? -1 : 1;
    const wide = lot.kind === 'house' ? (lot.style === 'premium' ? 8.5 : lot.style === 'two-story' ? 5.2 : 5.5) : lot.kind === 'hq' ? 10 : 9;
    const offset = lot.kind === 'house' ? (lot.style === 'premium' ? 11 : lot.style === 'two-story' ? 9.5 : lot.style === 'modern' ? 5 : lot.style === 'spanish' ? 5.4 : 5) : 0;
    const ax = lot.curb.x + dir.x * (half + 0.3 + walk / 2) + (horizontal ? sideSign * offset : 0);
    const az = lot.curb.z + dir.z * (half + 0.3 + walk / 2) + (horizontal ? 0 : sideSign * offset);
    // Apron replaces the curb: a sloped concrete wedge from the gutter up to sidewalk level
    b.box('concrete', horizontal ? [wide, CURB_H + 0.02, walk + 0.9] : [walk + 0.9, CURB_H + 0.02, wide], [ax, CURB_H / 2 + 0.005, az]);
  }
  return b.build('roads');
}

export function Roads() {
  const roads = useMemo(() => buildRoads(), []);
  const blades = useMemo(() => buildStreetBlades(), []);
  return (
    <group name="roads">
      <primitive object={roads} />
      <primitive object={blades} />
    </group>
  );
}

/** Street-name blades at each intersection, one textured plane per name. */
function buildStreetBlades(): THREE.Group {
  const g = new THREE.Group();
  const ew = STREETS.filter((s) => s.axis === 'x');
  const ns = STREETS.filter((s) => s.axis === 'z');
  const half = ROAD_WIDTH / 2;
  for (const sx of ew) {
    for (const sz of ns) {
      const px = sz.at + half + 1.1;
      const pz = sx.at - half - 1.1;
      const makeBlade = (name: string, y: number, rotY: number) => {
        const tex = signTexture(name.toUpperCase(), '#ffffff', '#1f5e3a');
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.36), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide }));
        m.position.set(px, y, pz);
        m.rotation.y = rotY;
        g.add(m);
      };
      makeBlade(sx.name, 3.1, 0);
      makeBlade(sz.name, 2.75, Math.PI / 2);
    }
  }
  return g;
}
