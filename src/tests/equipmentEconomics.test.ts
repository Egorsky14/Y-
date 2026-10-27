import { describe, expect, it } from 'vitest';
import { FAULTS, type Fault } from '@/game/jobs/faults';
import { STARTER_KIT, TOOLS, toolDef, type ToolDef } from '@/game/equipment/catalog';
import { diagMultiplier, effectiveAccuracy, qualityStars, readGain, repairMultiplier, workmanship } from '@/game/equipment/performance';
import { durationMultiplier, measurementAccuracy, type Attributes } from '@/game/employees/attributes';
import { createNewGame, BALANCE } from '@/game/simulation/newGame';

/**
 * Per-call economics of every tool, computed exactly from the formulas the jobs use (no campaign
 * noise: a full 90-day run diverges after the first different reading, so single-tool effects drown
 * in seed variance). For each fault, in the game's lead mix, it enumerates the 8 right/misread
 * combinations of the three readings and applies the careful-player rule (right diagnosis when the
 * correctly read evidence carries at least half the weight), then adds time saved and workmanship.
 *
 * Money values come from the game's own numbers and are stated here so they can be checked:
 * - a technician hour is worth BUSY_HOUR in a busy market (revenue per technician-hour in the
 *   busy-market scenarios) and NORMAL_HOUR in a normal one;
 * - a wrong diagnosis costs, in expectation, the 75% callback (an unpaid visit: diagnostic plus the
 *   real repair's labor and parts) and the review hit, valued at REVIEW_COST.
 */

const NORMAL_HOUR = 117;
const BUSY_HOUR = 190;
const CALLBACK_RATE = 0.75;
const TRAVEL_MIN = 30;
const REVIEW_COST = 60;
/** Value of one review star on a call (reputation drives leads); used for workmanship. */
const STAR_VALUE = 40;

/** The game's lead mix (jobs/leads.ts pickFaultFor), averaged over young and old systems. */
function leadWeight(f: Fault): number {
  if (f.id === 'compressor') return (1.0 + 0.25) / 2;
  if (f.replacementCandidate) return (1.6 + 0.5) / 2;
  if (f.id === 'run-capacitor' || f.id === 'contactor') return 2.2;
  return 1;
}

function pCorrect(f: Fault, base: number, defs: ToolDef[]): number {
  const total = f.evidence.reduce((a, e) => a + e.weight, 0);
  const ps = f.evidence.map((e) => effectiveAccuracy(base, readGain(defs, e.measure)));
  let p = 0;
  for (let mask = 0; mask < 8; mask++) {
    let prob = 1;
    let right = 0;
    f.evidence.forEach((e, i) => {
      const ok = (mask >> i) & 1;
      prob *= ok ? ps[i] : 1 - ps[i];
      if (ok) right += e.weight;
    });
    if (right >= total / 2) p += prob;
  }
  return p;
}

interface CallValue {
  pCorrect: number;
  minutes: number;
  stars: number;
}

/** Expected outcome of one call in the lead mix with a loadout. */
function perCall(attrs: Attributes, defs: ToolDef[]): CallValue {
  const base = measurementAccuracy(attrs, 0);
  const dm = durationMultiplier(attrs, 0);
  let w = 0;
  const out = { pCorrect: 0, minutes: 0, stars: 0 };
  for (const f of FAULTS) {
    const k = leadWeight(f);
    w += k;
    out.pCorrect += k * pCorrect(f, base, defs);
    out.minutes += k * (BALANCE.diagnosticBaseMinutes * dm * diagMultiplier(f, defs) + f.laborMinutes * dm * repairMultiplier(f, defs));
    out.stars += k * qualityStars(workmanship(f, attrs, defs));
  }
  return { pCorrect: out.pCorrect / w, minutes: out.minutes / w, stars: out.stars / w };
}

/** Expected cost of one wrong diagnosis in the lead mix (the unpaid return visit and the review hit). */
function wrongCost(attrs: Attributes, hour: number): number {
  const dm = durationMultiplier(attrs, 0);
  let w = 0;
  let c = 0;
  for (const f of FAULTS) {
    const k = leadWeight(f);
    w += k;
    const visit = ((BALANCE.diagnosticBaseMinutes + f.laborMinutes) * dm + TRAVEL_MIN) / 60;
    c += k * (CALLBACK_RATE * (visit * hour + f.partsCost) + REVIEW_COST);
  }
  return c / w;
}

const owner = createNewGame().employees['emp-owner'].attributes;
/** A typical new hire from the market: average skills. */
const hire: Attributes = { ...owner, diagnosticAccuracy: 50, attentionToDetail: 50, technicalExpertise: 50, speed: 50 };

function toolRows(attrs: Attributes, hour: number) {
  const kit = STARTER_KIT.map((id) => toolDef(id));
  const before = perCall(attrs, kit);
  const wrong = wrongCost(attrs, hour);
  return TOOLS.filter((t) => !STARTER_KIT.includes(t.id)).map((t) => {
    const after = perCall(attrs, [...kit, t]);
    const dCorrect = after.pCorrect - before.pCorrect;
    const dMin = before.minutes - after.minutes;
    const dStars = after.stars - before.stars;
    const value = dCorrect * wrong + (dMin / 60) * hour + dStars * STAR_VALUE;
    return { tool: t.name, tier: t.tier, price: t.price, correctPts: Math.round(dCorrect * 1000) / 10, minSaved: Math.round(dMin * 10) / 10, starsPerCall: Math.round(dStars * 1000) / 1000, valuePerCall: Math.round(value * 100) / 100, paybackCalls: value > 0 ? Math.round(t.price / value) : Infinity };
  });
}

describe('equipment economics per service call', () => {
  it('every tool has a real use, none pays for itself absurdly fast, and the busy market shortens payback', () => {
    const busy = toolRows(owner, BUSY_HOUR);
    const normal = toolRows(owner, NORMAL_HOUR);
    const novice = toolRows(hire, BUSY_HOUR);
    console.log(`[economics] wrong diagnosis costs ≈ $${Math.round(wrongCost(owner, BUSY_HOUR))} busy, $${Math.round(wrongCost(owner, NORMAL_HOUR))} normal`);
    console.log('[economics] owner (Diag 66), busy market');
    console.table(busy);
    console.log('[economics] owner, normal market');
    console.table(normal.map(({ tool, valuePerCall, paybackCalls }) => ({ tool, valuePerCall, paybackCalls })));
    console.log('[economics] typical hire (Diag 50), busy market');
    console.table(novice.map(({ tool, correctPts, valuePerCall, paybackCalls }) => ({ tool, correctPts, valuePerCall, paybackCalls })));
    for (const r of busy) {
      // Useful: every tool earns something on an ordinary call mix.
      expect(r.valuePerCall, r.tool).toBeGreaterThan(0);
      // Not overpowered: nothing pays back within a week of one technician's calls (~3 a day).
      expect(r.paybackCalls, r.tool).toBeGreaterThan(20);
      // Not useless: everything pays back within a technician's year (~700 calls) when busy.
      expect(r.paybackCalls, r.tool).toBeLessThan(700);
    }
    // Time is worth more when the phone is ringing: payback is shorter in a busy market.
    for (const r of busy) expect(r.paybackCalls).toBeLessThanOrEqual(normal.find((n) => n.tool === r.tool)!.paybackCalls);
    // The same tools are worth more in the hands of a weaker diagnostician (bigger gap to close).
    const sum = (rows: typeof busy) => rows.reduce((a, r) => a + r.correctPts, 0);
    expect(sum(novice)).toBeGreaterThan(sum(busy));
  });
});
