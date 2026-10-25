/**
 * Employee attributes (1–100). Every attribute drives at least one documented formula;
 * see GAME_DESIGN.md "Attribute effects" and the functions in this module.
 */
export const ATTRIBUTE_KEYS = [
  'stamina',
  'workCapacity',
  'learnability',
  'technicalExpertise',
  'diagnosticAccuracy',
  'speed',
  'reliability',
  'customerService',
  'communication',
  'salesAbility',
  'leadership',
  'stressTolerance',
  'attentionToDetail',
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  stamina: 'Stamina',
  workCapacity: 'Work Capacity',
  learnability: 'Learnability',
  technicalExpertise: 'Technical Expertise',
  diagnosticAccuracy: 'Diagnostic Accuracy',
  speed: 'Speed',
  reliability: 'Reliability',
  customerService: 'Customer Service',
  communication: 'Communication',
  salesAbility: 'Sales Ability',
  leadership: 'Leadership',
  stressTolerance: 'Stress Tolerance',
  attentionToDetail: 'Attention to Detail',
};

export const ATTRIBUTE_EFFECTS: Record<AttributeKey, string> = {
  stamina: 'Fatigue gained per job hour (higher = less fatigue).',
  workCapacity: 'Jobs per day before overtime penalties apply.',
  learnability: 'XP multiplier and training speed.',
  technicalExpertise: 'Repair duration and callback risk.',
  diagnosticAccuracy: 'Probability each measurement is read correctly.',
  speed: 'Diagnostic and repair duration.',
  reliability: 'Chance of a late start / sick day.',
  customerService: 'Review star rating and customer trust gain.',
  communication: 'Lead conversion (dispatchers) and quote acceptance.',
  salesAbility: 'Replacement close rate and upsell acceptance.',
  leadership: 'Crew efficiency bonus when leading installs.',
  stressTolerance: 'Morale loss under heavy workload.',
  attentionToDetail: 'Installation quality and evidence completeness.',
};

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function clampAttr(v: number): number {
  return Math.max(1, Math.min(100, Math.round(v)));
}

/** Probability (0..1) a single measurement is accurate. */
export function measurementAccuracy(attrs: Attributes, fatigue: number): number {
  const base = 0.45 + (attrs.diagnosticAccuracy / 100) * 0.5 + (attrs.attentionToDetail / 100) * 0.08;
  const fatiguePenalty = (fatigue / 100) * 0.2;
  return clamp01(base - fatiguePenalty);
}

/** Multiplier applied to base task durations. 1.0 at speed 50, ~0.7 at speed 100, ~1.3 at speed 1. */
export function durationMultiplier(attrs: Attributes, fatigue: number): number {
  const speedFactor = 1.3 - (attrs.speed / 100) * 0.6;
  const expertiseFactor = 1.1 - (attrs.technicalExpertise / 100) * 0.2;
  const fatigueFactor = 1 + (fatigue / 100) * 0.25;
  return speedFactor * expertiseFactor * fatigueFactor;
}

/** Fatigue added per 60 minutes of field work. */
export function fatiguePerHour(attrs: Attributes): number {
  return 9 - (attrs.stamina / 100) * 6;
}

/** XP multiplier from learnability. */
export function xpMultiplier(attrs: Attributes): number {
  return 0.8 + (attrs.learnability / 100) * 0.6;
}

/** Expected review stars (1..5) from a successful job. */
export function expectedStars(attrs: Attributes, correctDiagnosis: boolean, waitedMinutes: number): number {
  let stars = 3.4 + (attrs.customerService / 100) * 1.4 + (attrs.communication / 100) * 0.4;
  if (!correctDiagnosis) stars -= 1.6;
  if (waitedMinutes > 240) stars -= 0.5;
  return Math.max(1, Math.min(5, stars));
}

/** Probability a customer approves a repair quote. */
export function repairAcceptance(attrs: Attributes, priceRatio: number, trust: number, correctDiagnosis: boolean): number {
  // priceRatio = quoted / catalog price. Trust 0..100.
  let p = 0.55 + (attrs.communication / 100) * 0.2 + (attrs.salesAbility / 100) * 0.1 + (trust / 100) * 0.15;
  p -= (priceRatio - 1) * 0.9;
  if (!correctDiagnosis) p -= 0.05;
  return clamp01(p);
}

/** Probability a customer approves a replacement quote. */
export function replacementAcceptance(attrs: Attributes, tierIndex: number, equipmentAge: number, financing: boolean, trust: number): number {
  let p = 0.18 + (attrs.salesAbility / 100) * 0.4 + (attrs.communication / 100) * 0.1 + (trust / 100) * 0.1;
  p += Math.min(0.2, Math.max(0, equipmentAge - 10) * 0.025);
  p -= tierIndex * 0.07;
  if (financing) p += 0.12;
  return clamp01(p);
}
