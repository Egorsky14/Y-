import { ATTRIBUTE_KEYS, clampAttr, type Attributes } from './attributes';
import { ROLE_BASE_WAGE, ROLE_CORE_ATTRIBUTES, type EmployeeRole } from './roles';
import { nextInt, nextRange, pick, type RngState } from '../simulation/rng';
import { randomPersonName, nameSeed } from '../customers/names';
import type { Candidate } from '../simulation/types';

export function baseAttributes(rng: RngState, role: EmployeeRole, quality: number): Attributes {
  const attrs = {} as Attributes;
  const core = ROLE_CORE_ATTRIBUTES[role];
  for (const key of ATTRIBUTE_KEYS) {
    const isCore = core.includes(key);
    const center = isCore ? 40 + quality * 35 : 30 + quality * 25;
    attrs[key] = clampAttr(center + nextRange(rng, -12, 12));
  }
  return attrs;
}

const SUMMARIES: Record<EmployeeRole, string[]> = {
  technician: ['Residential service background, comfortable with electrical and refrigerant work.', 'Former warranty-network tech looking for a diagnostics-first shop.', 'Fast, friendly, still building refrigeration depth.'],
  installer: ['Changeout crew lead for three summers.', 'Sheet metal and brazing experience, wants steady install work.', 'Apprentice installer, eager and strong.'],
  dispatcher: ['Call-center CSR with scheduling software experience.', 'Former front desk at a plumbing shop. Calm on the phone.', 'Organized, detail-oriented, new to HVAC.'],
  'comfort-advisor': ['In-home sales for windows and solar, strong closer.', 'Ex-technician moving into sales, explains systems clearly.', 'Retail sales background, learning the HVAC vocabulary.'],
};

export function generateCandidate(rng: RngState, role: EmployeeRole, day: number, id: string): Candidate {
  const quality = nextRange(rng, 0.15, 0.95);
  const attributes = baseAttributes(rng, role, quality);
  const experienceYears = Math.max(0, Math.round(quality * 12 + nextRange(rng, -2, 2)));
  const wage = Math.round((ROLE_BASE_WAGE[role] * (0.85 + quality * 0.6) + experienceYears * 0.4) * 2) / 2;
  const name = randomPersonName(rng);
  return {
    id,
    name,
    role,
    attributes,
    hourlyWage: wage,
    experienceYears,
    look: nameSeed(name),
    availableUntilDay: day + nextInt(rng, 3, 7),
    summary: pick(rng, SUMMARIES[role]),
  };
}
