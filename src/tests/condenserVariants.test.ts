import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { condenserPosition, HOUSE_LOTS } from '@/game/world/cityLayout';
import { buildHouseCondensers, condenserGeneration, type CondenserGeneration } from '@/world/buildings/HouseCondensers';

/**
 * Outdoor units show the customer's system generation (HouseCondensers). The technician's kneel,
 * hands and gauge hoses are fitted to the cabinet, so every generation must keep the same
 * footprint, height and position at condenserPosition(lot).
 */

const GENS: CondenserGeneration[] = ['legacy', 'standard', 'current', 'ego'];
// Plain stand-ins: the shared materials build canvas textures, which need a DOM.
const plain = new Map<string, THREE.Material>();
const materials = (key: string) => plain.get(key) ?? plain.set(key, new THREE.MeshBasicMaterial()).get(key)!;

function cabinetBox(gen: CondenserGeneration, lotIndex: number): THREE.Box3 {
  const lot = HOUSE_LOTS[lotIndex];
  const g = buildHouseCondensers([lot], { [lot.id]: gen }, materials);
  const box = new THREE.Box3();
  for (const m of g.children) if (/unitCabinet/.test(m.name)) box.union(new THREE.Box3().setFromObject(m));
  return box;
}

describe('condenser generations', () => {
  it('follows the system age, refrigerant and installer', () => {
    expect(condenserGeneration({ ageYears: 19, refrigerant: 'R-22', brand: 'Carrier' })).toBe('legacy');
    expect(condenserGeneration({ ageYears: 16, refrigerant: 'R-410A', brand: 'Trane' })).toBe('legacy');
    expect(condenserGeneration({ ageYears: 9, refrigerant: 'R-410A', brand: 'Lennox' })).toBe('standard');
    expect(condenserGeneration({ ageYears: 2, refrigerant: 'R-410A', brand: 'Goodman' })).toBe('current');
    // workflow.ts installs replacements as EGO Select at age 0.
    expect(condenserGeneration({ ageYears: 0, refrigerant: 'R-454B', brand: 'EGO Select' })).toBe('ego');
  });

  it('keeps the cabinet the same size and in the same place in every generation', () => {
    for (const i of [0, 5, HOUSE_LOTS.findIndex((l) => l.style === 'premium')]) {
      const lot = HOUSE_LOTS[i];
      const ref = cabinetBox('standard', i);
      const c = ref.getCenter(new THREE.Vector3());
      const p = condenserPosition(lot);
      expect(Math.hypot(c.x - p.x, c.z - p.z)).toBeLessThan(0.3);
      for (const gen of GENS) {
        const b = cabinetBox(gen, i);
        expect(b.min.distanceTo(ref.min)).toBeLessThan(0.01);
        expect(b.max.distanceTo(ref.max)).toBeLessThan(0.01);
      }
    }
  });

  it('builds every house unit into a few shared meshes', () => {
    const gens = Object.fromEntries(HOUSE_LOTS.map((l, i) => [l.id, GENS[i % GENS.length]]));
    const g = buildHouseCondensers(HOUSE_LOTS, gens, materials);
    expect(g.children.length).toBeLessThan(16);
  });
});
