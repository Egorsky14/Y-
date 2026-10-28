import { describe, expect, it } from 'vitest';
import { HOUSE_LOTS } from '@/game/world/cityLayout';
import { ARCHETYPES, clearPlanCache, FRONT_LINE, HOUSE_INFO, inside, overlaps, propertyPlan, UNIT_Z, WALL_X, WALL_Z, type PropertyPlan, type Rect } from '@/world/city/propertyPlan';

/**
 * Environment Revolution: every residential lot gets a deterministic, archetype-driven property
 * plan. These checks run on the plan data (no WebGL): determinism, archetype coverage and spread,
 * pool restraint, and placement rules around the house, driveway, walk and HVAC service access.
 */

const plans = HOUSE_LOTS.map((l) => propertyPlan(l));
const PROP_HALF: Record<string, [number, number]> = { 'dining-set': [1.2, 1.2], 'bistro-set': [0.75, 0.75], 'lounge-chair': [0.4, 1.0], grill: [0.7, 0.35], 'sofa-set': [1.5, 1.3], 'fire-pit': [1.4, 1.3], umbrella: [0.25, 0.25], shed: [1.25, 0.95], 'planter-pot': [0.35, 0.35], 'swing-set': [1.8, 1.35], 'trash-bins': [0.8, 0.4], bench: [0.8, 0.35] };
const propRect = (p: PropertyPlan['props'][number]): Rect => {
  const [hw, hd] = PROP_HALF[p.kind];
  const swap = Math.abs(Math.sin(p.rot)) > 0.7;
  const [w, d] = swap ? [hd, hw] : [hw, hd];
  return { x0: p.x - w, x1: p.x + w, z0: p.z - d, z1: p.z + d };
};
const excl = (plan: PropertyPlan, kind: string) => plan.exclusions.filter((e) => e.kind === kind).map((e) => e.rect);

describe('property plans', () => {
  it('are deterministic across cache resets', () => {
    const first = JSON.stringify(plans);
    clearPlanCache();
    const again = JSON.stringify(HOUSE_LOTS.map((l) => propertyPlan(l)));
    expect(again).toBe(first);
  });

  it('use all eight archetypes, with no two neighbours in a row alike', () => {
    const used = new Set(plans.map((p) => p.archetype));
    for (const a of ARCHETYPES) expect(used, a).toContain(a);
    for (const lot of HOUSE_LOTS) {
      const m = lot.id.match(/^(.*)-(\d+)$/)!;
      const left = HOUSE_LOTS.find((l) => l.id === `${m[1]}-${Number(m[2]) - 1}`);
      if (left) expect(propertyPlan(lot).archetype, `${left.id} / ${lot.id}`).not.toBe(propertyPlan(left).archetype);
    }
  });

  it('respect house styles (modern and premium homes only get compatible landscapes)', () => {
    for (const p of plans) {
      if (p.style === 'premium') expect(['upscale', 'entertainer']).toContain(p.archetype);
      if (p.style === 'modern') expect(['modern-minimal', 'desert-garden', 'entertainer']).toContain(p.archetype);
    }
  });

  it('give pools to a minority of deep backyards only', () => {
    const pools = plans.filter((p) => p.pool);
    expect(pools.length).toBeGreaterThan(0);
    expect(pools.length).toBeLessThanOrEqual(Math.ceil(plans.length * 0.25));
    for (const p of pools) {
      expect(['upscale', 'entertainer']).toContain(p.archetype);
      expect(WALL_Z - HOUSE_INFO[p.style].backZ).toBeGreaterThanOrEqual(10);
    }
  });

  it('give every lot an intentional composition (patio, planting beds, plants)', () => {
    for (const p of plans) {
      expect(p.hardscape.some((h) => h.kind === 'patio'), p.lotId).toBe(true);
      expect(p.ground.length, p.lotId).toBeGreaterThanOrEqual(3);
      expect(p.plants.length, p.lotId).toBeGreaterThanOrEqual(8);
    }
  });

  it('keep patios, decks and pools off the house and inside the walls', () => {
    for (const p of plans) {
      const house = excl(p, 'house');
      for (const h of p.hardscape.filter((h) => h.kind !== 'pad')) {
        for (const f of house) expect(overlaps(h.rect, f, -0.05), `${p.lotId} ${h.kind}`).toBe(false);
        expect(h.rect.x0 >= -WALL_X - 0.01 && h.rect.x1 <= WALL_X + 0.01 && h.rect.z1 <= WALL_Z + 0.01, `${p.lotId} ${h.kind} bounds`).toBe(true);
      }
      for (const s of p.structures.filter((s) => s.kind === 'pool')) for (const f of house) expect(overlaps(s.rect, f, 0.5)).toBe(false);
    }
  });

  it('keep furniture and props off the house, driveway, walk and condenser service access, and apart', () => {
    for (const p of plans) {
      const hard = [...excl(p, 'house'), ...excl(p, 'driveway'), ...excl(p, 'walkway'), ...excl(p, 'service'), ...excl(p, 'approach')];
      const rects = p.props.filter((q) => q.kind !== 'umbrella').map(propRect);
      for (const [i, r] of rects.entries()) {
        for (const h of hard) expect(overlaps(r, h, -0.02), `${p.lotId} ${p.props[i].kind}`).toBe(false);
        expect(r.x0 >= -WALL_X - 0.01 && r.x1 <= WALL_X + 0.01 && r.z0 >= FRONT_LINE - 0.01 && r.z1 <= WALL_Z + 0.01, `${p.lotId} ${p.props[i].kind} bounds`).toBe(true);
        for (const [j, o] of rects.entries()) if (j > i) expect(overlaps(r, o, -0.02), `${p.lotId} ${p.props[i].kind} vs ${p.props[j].kind}`).toBe(false);
      }
    }
  });

  it('keep plants out of the driveway, walk, condenser service zone and technician approach, and off the roof', () => {
    for (const p of plans) {
      const info = HOUSE_INFO[p.style];
      for (const pl of p.plants) {
        for (const kind of ['driveway', 'walkway', 'service', 'approach']) for (const r of excl(p, kind)) expect(inside(pl.x, pl.z, r), `${p.lotId} ${pl.species} in ${kind}`).toBe(false);
        for (const f of info.footprints) expect(inside(pl.x, pl.z, f, 0.3), `${p.lotId} ${pl.species} on the house`).toBe(false);
      }
      // Nothing at all sits on the condenser itself.
      const unit = { x0: info.half + 0.3, x1: info.half + 1.5, z0: UNIT_Z - 0.6, z1: UNIT_Z + 0.6 };
      for (const pl of p.plants) expect(inside(pl.x, pl.z, unit, 0.5)).toBe(false);
      for (const q of p.props) expect(overlaps(propRect(q), unit, 0.3), `${p.lotId} ${q.kind} at the unit`).toBe(false);
    }
  });

  it('produce only finite positions, rotations and scales', () => {
    for (const p of plans) {
      for (const v of [...p.plants.flatMap((q) => [q.x, q.z, q.rotation, q.scale]), ...p.props.flatMap((q) => [q.x, q.z, q.rot]), ...p.ground.flatMap((g) => g.poly.flat()), ...p.hardscape.flatMap((h) => [h.rect.x0, h.rect.x1, h.rect.z0, h.rect.z1])]) expect(Number.isFinite(v)).toBe(true);
      for (const q of p.plants) expect(q.scale).toBeGreaterThan(0.3);
    }
  });

  it('vary meaningfully between lots (far more distinct compositions than the single old template)', () => {
    const signature = (p: PropertyPlan) => [p.archetype, p.pool, p.hardscape.map((h) => `${h.kind}:${h.mat}`).join(','), p.structures.map((s) => s.kind).sort().join(','), p.props.map((q) => q.kind).sort().join(','), p.baseGround].join('|');
    const distinct = new Set(plans.map(signature));
    expect(distinct.size).toBeGreaterThanOrEqual(Math.round(plans.length * 0.6));
    // The old yard plan placed the same patio set, grill and umbrella on every lot; plant species
    // per lot now vary widely.
    const speciesCounts = plans.map((p) => new Set(p.plants.map((q) => q.species)).size);
    expect(Math.max(...speciesCounts)).toBeGreaterThanOrEqual(8);
  });
});
