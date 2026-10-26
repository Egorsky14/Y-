import { useMemo } from 'react';
import * as THREE from 'three';
import { PARK_LOT, WORLD_HALF } from '@/game/world/cityLayout';
import { STATIC_MATERIALS } from '../buildings/materials';
import { applyWorldUVs } from '../assets/pbr';
import { makeDecoRng } from '../assets/random';

/**
 * Terrain: a PBR desert floor with gentle undulation beyond the neighborhood, park turf,
 * and two rings of noise-displaced mountains that fade into the haze.
 */
export function Ground() {
  const floor = useMemo(() => {
    const size = WORLD_HALF * 9;
    const g = new THREE.PlaneGeometry(size, size, 96, 96);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const rnd = makeDecoRng(515);
    const phases = Array.from({ length: 6 }, () => [rnd() * 6.28, 0.004 + rnd() * 0.006, rnd() * 6.28, 0.004 + rnd() * 0.006]);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z);
      // Flat inside the developed area, rolling dunes beyond.
      const fade = THREE.MathUtils.smoothstep(r, 240, 420);
      let h = 0;
      for (const [a, f, b2, f2] of phases) h += Math.sin(x * f + a) * Math.cos(z * f2 + b2);
      p.setY(i, h * 2.2 * fade - 0.02);
    }
    g.computeVertexNormals();
    applyWorldUVs(g, 10);
    return g;
  }, []);
  const sand = useMemo(() => STATIC_MATERIALS.sand(), []);
  const lawn = useMemo(() => STATIC_MATERIALS.lawn(), []);
  const parkGeo = useMemo(() => applyWorldUVs(new THREE.PlaneGeometry(PARK_LOT.width - 2, PARK_LOT.depth - 2).rotateX(-Math.PI / 2), 2), []);
  return (
    <group name="terrain">
      <mesh geometry={floor} material={sand} receiveShadow />
      <mesh geometry={parkGeo} material={lawn} position={[PARK_LOT.center.x, 0.02, PARK_LOT.center.z]} receiveShadow />
      <Mountains />
    </group>
  );
}

function mountainRing(radius: number, width: number, height: number, seed: number, segments: number): THREE.BufferGeometry {
  // A ring of terrain: angular segments × radial rows, displaced by layered sine noise.
  const rows = 6;
  const positions: number[] = [];
  const rnd = makeDecoRng(seed);
  const bumps = Array.from({ length: 14 }, () => [rnd() * Math.PI * 2, 0.5 + rnd() * 0.5, 2 + Math.floor(rnd() * 7)]);
  const heightAt = (a: number, t: number) => {
    let h = 0;
    for (const [phase, amp, freq] of bumps) h += amp * Math.max(0, Math.sin(a * freq + phase));
    const profile = Math.sin(t * Math.PI); // zero at inner and outer edge, peak in the middle
    return h * height * 0.3 * profile + rnd() * 0.8 * profile;
  };
  const grid: THREE.Vector3[][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      const r = radius + t * width;
      row.push(new THREE.Vector3(Math.cos(a) * r, heightAt(a, t), Math.sin(a) * r));
    }
    grid.push(row);
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rows; j++) {
      const p00 = grid[i][j];
      const p10 = grid[i + 1][j];
      const p01 = grid[i][j + 1];
      const p11 = grid[i + 1][j + 1];
      positions.push(p00.x, p00.y, p00.z, p01.x, p01.y, p01.z, p10.x, p10.y, p10.z);
      positions.push(p10.x, p10.y, p10.z, p01.x, p01.y, p01.z, p11.x, p11.y, p11.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Altitude-banded vertex colors: alluvial fans at the base, red-brown rock, pale limestone caps.
  const colors = new Float32Array(positions.length);
  const low = new THREE.Color('#b89a7b');
  const mid = new THREE.Color('#9a6f55');
  const high = new THREE.Color('#c9b7a4');
  const tmp = new THREE.Color();
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    const t = THREE.MathUtils.clamp(y / (height * 0.9), 0, 1);
    if (t < 0.45) tmp.copy(low).lerp(mid, t / 0.45);
    else tmp.copy(mid).lerp(high, (t - 0.45) / 0.55);
    colors[i] = tmp.r;
    colors[i + 1] = tmp.g;
    colors[i + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function Mountains() {
  const near = useMemo(() => mountainRing(560, 260, 120, 77, 180), []);
  const far = useMemo(() => mountainRing(800, 420, 200, 99, 150), []);
  const distant = useMemo(() => mountainRing(1150, 500, 280, 123, 120), []);
  return (
    <group>
      <mesh geometry={near} frustumCulled={false} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} flatShading />
      </mesh>
      <mesh geometry={far} frustumCulled={false}>
        <meshStandardMaterial vertexColors roughness={1} flatShading />
      </mesh>
      <mesh geometry={distant} frustumCulled={false}>
        <meshStandardMaterial vertexColors roughness={1} flatShading color="#d8cfc6" />
      </mesh>
    </group>
  );
}
