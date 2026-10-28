/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { hqParkingStalls, HQ_LOT } from '@/game/world/cityLayout';
import { CIVILIAN_MODELS, HQ_STAFF_ROW, HQ_VISITOR_CARS, parkedCarSpots } from '@/world/vehicles/parkedCarSpots';

/**
 * Graphics Revolution regression checks that do not need a GPU: every asset in the manifest exists
 * as a valid binary glTF within its size budget, the civilian cars ship, and the decorative parked
 * cars are deterministic and never occupy a fleet stall the simulation parks vans in.
 */

interface ManifestAsset {
  id: string;
  category: string;
  file: string;
  bytes: number;
  triangles: number;
  license: string;
}
const manifest = JSON.parse(readFileSync('public/models/manifest.json', 'utf8')) as { assets: ManifestAsset[] };

describe('model assets', () => {
  it('lists every vehicle class, both civilian cars and the Blender props', () => {
    const ids = manifest.assets.map((a) => a.id);
    for (const id of ['full-size-van', 'compact-van', 'pickup', 'box-truck', ...CIVILIAN_MODELS, 'jobsite-kit', 'supply-tools', 'yard-kit']) expect(ids).toContain(id);
  });

  it('ships every yard prop the property plans place as a named node of the yard kit', () => {
    const glb = readFileSync('public/models/props/yard-kit.glb');
    const json = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12))) as { nodes: { name?: string }[] };
    const names = new Set(json.nodes.map((n) => n.name));
    for (const kind of ['dining-set', 'bistro-set', 'lounge-chair', 'grill', 'sofa-set', 'fire-pit', 'umbrella', 'shed', 'planter-pot', 'swing-set', 'trash-bins', 'bench']) expect(names, kind).toContain(kind);
  });

  it('ships each asset as binary glTF 2.0 matching the manifest, within its budget', () => {
    for (const a of manifest.assets) {
      const path = `public/${a.file}`;
      const buf = readFileSync(path);
      expect(buf.toString('ascii', 0, 4), a.id).toBe('glTF');
      expect(buf.readUInt32LE(4), a.id).toBe(2);
      expect(statSync(path).size, a.id).toBe(a.bytes);
      expect(a.license).toBe('project');
      // Fleet vehicles stay under 2 MB / 40k triangles; parked cars are instanced background props.
      const civilian = (CIVILIAN_MODELS as readonly string[]).includes(a.id);
      expect(a.bytes, a.id).toBeLessThan(civilian ? 400_000 : 2_000_000);
      expect(a.triangles, a.id).toBeLessThan(civilian ? 6_000 : 40_000);
    }
  });
});

describe('parked cars', () => {
  it('fills the HQ staff row with one car per employee, up to nine, plus three visitors', () => {
    const atHq = (n: number) => parkedCarSpots(n).filter((s) => Math.abs(s.x - HQ_LOT.center.x) < HQ_LOT.width / 2 && Math.abs(s.z - HQ_LOT.center.z) < HQ_LOT.depth / 2);
    expect(atHq(0)).toHaveLength(HQ_VISITOR_CARS.length);
    expect(atHq(4)).toHaveLength(HQ_VISITOR_CARS.length + 4);
    expect(atHq(30)).toHaveLength(HQ_VISITOR_CARS.length + HQ_STAFF_ROW.length);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(parkedCarSpots(6))).toBe(JSON.stringify(parkedCarSpots(6)));
  });

  it('never parks in or against a fleet stall, even with every stall built', () => {
    // The most stalls the HQ can have: 2 + expanded garage (2) + additional parking (4).
    const stalls = hqParkingStalls(8);
    for (const car of parkedCarSpots(9)) {
      for (const st of stalls) {
        // Stalls are 9 m deep (x) by 8 m wide (z); keep a car's 2.5 m half-length clear of them.
        const clear = Math.abs(car.x - st.pos.x) > 4.5 + 2.5 || Math.abs(car.z - st.pos.z) > 4 + 1.2;
        expect(clear, `${car.x},${car.z} vs stall ${st.pos.x},${st.pos.z}`).toBe(true);
      }
    }
  });
});
