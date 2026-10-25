import type { AttributeKey } from './attributes';

export type EmployeeRole = 'technician' | 'installer' | 'dispatcher' | 'comfort-advisor';

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  technician: 'Service Technician',
  installer: 'Installer',
  dispatcher: 'Dispatcher / CSR',
  'comfort-advisor': 'Comfort Advisor',
};

export const ROLE_DESCRIPTIONS: Record<EmployeeRole, string> = {
  technician: 'Diagnoses HVAC problems, performs repairs, and spots replacement opportunities.',
  installer: 'Performs equipment replacements with an installation crew.',
  dispatcher: 'Answers calls, converts leads, and keeps the schedule tight.',
  'comfort-advisor': 'Visits homeowners, presents replacement options and financing, closes sales.',
};

/** Attributes the role leans on; used for hiring candidate generation and UI emphasis. */
export const ROLE_CORE_ATTRIBUTES: Record<EmployeeRole, AttributeKey[]> = {
  technician: ['technicalExpertise', 'diagnosticAccuracy', 'speed', 'customerService'],
  installer: ['technicalExpertise', 'attentionToDetail', 'stamina', 'speed'],
  dispatcher: ['communication', 'customerService', 'stressTolerance', 'reliability'],
  'comfort-advisor': ['salesAbility', 'communication', 'customerService', 'reliability'],
};

/** Base hourly wage by role; candidate wage is scaled by skill. */
export const ROLE_BASE_WAGE: Record<EmployeeRole, number> = {
  technician: 28,
  installer: 26,
  dispatcher: 20,
  'comfort-advisor': 24,
};

export const XP_PER_LEVEL = [0, 120, 300, 560, 900, 1350, 1900, 2600, 3400, 4400];

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < XP_PER_LEVEL.length; i++) if (xp >= XP_PER_LEVEL[i]) level = i + 1;
  return level;
}

export function xpToNextLevel(xp: number): { next: number; progress: number } {
  const level = levelForXp(xp);
  if (level >= XP_PER_LEVEL.length) return { next: XP_PER_LEVEL[XP_PER_LEVEL.length - 1], progress: 1 };
  const base = XP_PER_LEVEL[level - 1];
  const next = XP_PER_LEVEL[level];
  return { next, progress: (xp - base) / (next - base) };
}
