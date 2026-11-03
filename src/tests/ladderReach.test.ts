import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HOUSE_LOTS } from '@/game/world/cityLayout';
import { roofSpec } from '@/game/world/rooftops';
import type { VehicleClass } from '@/game/fleet/vehicleCatalog';
import { frameAt, roofPlan, type ChoreoFrame } from '@/world/scene/rooftopChoreo';
import { reachPosture } from '@/world/characters/reachPosture';
import { RIG_MEASURES } from '@/world/characters/rigData.generated';

/**
 * Whatever a hand is told to hold, it can get to: every frame of a rooftop job, at every roof the ladder reaches, for every
 * vehicle class, with the posture the character takes. A hand out of reach stops short in the air, which is the defect
 * this guards against. The in-game contact report (e2e/character-qa) measures the same thing on the real skeleton.
 */

const KLASSES: VehicleClass[] = ['compact-van', 'full-size-van', 'pickup', 'box-truck'];
/** Stages where the character stands; on the ladder its own clip sets the body. */
const ALLOWED_SHORT = 0.03;

function handShort(f: ChoreoFrame) {
  if (!f.limbs.handL && !f.limbs.handR) return 0;
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(f.lean, f.heading, 0, 'YXZ')).setPosition(f.pos);
  const inv = m.invert();
  const L = f.limbs.handL?.clone().applyMatrix4(inv);
  const R = f.limbs.handR?.clone().applyMatrix4(inv);
  if (f.anim === 'climb' || f.anim === 'step-over') {
    // These clips set the body themselves, with no lean to reach.
    const feet = f.limbs.footL && f.limbs.footR ? (f.limbs.footL.clone().applyMatrix4(inv).y + f.limbs.footR.clone().applyMatrix4(inv).y) / 2 : null;
    const pelvisY = feet === null ? RIG_MEASURES.pelvisY - 0.05 : Math.min(RIG_MEASURES.pelvisY, Math.max(0.62, feet + 0.7));
    return reachPosture(L, R, pelvisY, -0.02, f.anim === 'climb' ? 0.09 : 0.16, 0).short;
  }
  const pitch = f.anim === 'raise' || f.anim === 'reach' ? -0.08 : f.anim === 'pull' ? 0.1 : 0.04;
  return reachPosture(L, R, RIG_MEASURES.pelvisY - 0.02, 0.007, pitch).short;
}

function worstByStage(lotId: string, klass: VehicleClass) {
  const spec = roofSpec(lotId)!;
  const plan = roofPlan(spec, klass, spec.van)!;
  const out: Record<string, number> = {};
  for (const stages of [plan.up, plan.down]) {
    const total = stages.reduce((s, x) => s + x.dur, 0);
    const dir = stages === plan.up ? 'up' : 'down';
    for (let t = 0; t <= total; t += 1 / 30) {
      const f = frameAt(stages, t);
      const key = `${dir}:${f.stage}`;
      out[key] = Math.max(out[key] ?? 0, handShort(f));
    }
  }
  return out;
}

const SITES = ['cm-plaza', ...HOUSE_LOTS.map((l) => l.id).filter((id) => roofSpec(id) && roofPlan(roofSpec(id)!, 'compact-van', roofSpec(id)!.van))];

describe('ladder hand reach', () => {
  it.each(KLASSES)('every hand target is in reach with a %s', (klass) => {
    const worst: Record<string, number> = {};
    for (const site of SITES) {
      for (const [k, v] of Object.entries(worstByStage(site, klass))) worst[k] = Math.max(worst[k] ?? 0, v);
    }
    const over = Object.entries(worst).filter(([, v]) => v > ALLOWED_SHORT).map(([k, v]) => `${k} ${v.toFixed(3)}`);
    expect(over, `${klass} at ${SITES.join(', ')}`).toEqual([]);
  });
});
