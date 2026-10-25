import type { GameState } from '../simulation/types';
import { pushEvent } from '../simulation/events';

export interface MilestoneDef {
  id: string;
  title: string;
  description: string;
  phase: 'early' | 'mid' | 'late';
  check: (state: GameState) => boolean;
}

const employees = (s: GameState) => Object.values(s.employees).filter((e) => !e.isOwner);

export const MILESTONE_DEFS: MilestoneDef[] = [
  { id: 'first-diagnostic', title: 'First Diagnostic', description: 'Complete your first paid diagnostic.', phase: 'early', check: (s) => Object.values(s.jobs).some((j) => j.chosenDiagnosis !== undefined) },
  { id: 'first-repair', title: 'First Repair', description: 'Repair a customer’s system.', phase: 'early', check: (s) => Object.values(s.jobs).some((j) => j.status === 'completed' && j.recommendation === 'repair' && j.financials.quoteAmount > 0) },
  { id: 'first-review', title: 'First Positive Review', description: 'Earn a 4-star or better review.', phase: 'early', check: (s) => s.company.reviews.some((r) => r.day >= 1 && r.stars >= 4) },
  { id: 'first-hire', title: 'First Hire', description: 'Hire your first employee.', phase: 'early', check: (s) => employees(s).length >= 1 },
  { id: 'second-vehicle', title: 'Second Vehicle', description: 'Grow the fleet to two vehicles.', phase: 'mid', check: (s) => Object.keys(s.vehicles).length >= 2 },
  { id: 'first-training', title: 'Trained Technician', description: 'Complete a training program.', phase: 'mid', check: (s) => s.stats.trainingsCompleted >= 1 },
  { id: 'first-replacement', title: 'First Replacement', description: 'Install a complete system.', phase: 'mid', check: (s) => s.company.replacementsCompleted >= 1 },
  { id: 'installer-hired', title: 'Install Crew', description: 'Hire an installer.', phase: 'mid', check: (s) => employees(s).some((e) => e.role === 'installer') },
  { id: 'advisor-hired', title: 'Sales Team', description: 'Hire a comfort advisor.', phase: 'mid', check: (s) => employees(s).some((e) => e.role === 'comfort-advisor') },
  { id: 'five-star', title: 'Five Stars', description: 'Earn a five-star review.', phase: 'mid', check: (s) => s.company.reviews.some((r) => r.day >= 1 && r.stars >= 4.75) },
  { id: 'hq-upgrade', title: 'Headquarters Upgrade', description: 'Expand the headquarters.', phase: 'late', check: (s) => s.company.hqUpgrades.length >= 1 },
  { id: 'promotion', title: 'Promotion', description: 'An employee reaches level 3.', phase: 'late', check: (s) => Object.values(s.employees).some((e) => e.level >= 3) },
  { id: 'revenue-50k', title: '$50k Revenue', description: 'Bill $50,000 in total revenue.', phase: 'late', check: (s) => s.stats.totalRevenue >= 50000 },
  { id: 'revenue-150k', title: '$150k Revenue', description: 'Bill $150,000 in total revenue.', phase: 'late', check: (s) => s.stats.totalRevenue >= 150000 },
  { id: 'fleet-four', title: 'Fleet of Four', description: 'Operate four vehicles.', phase: 'late', check: (s) => Object.keys(s.vehicles).length >= 4 },
];

export function milestoneDef(id: string): MilestoneDef {
  return MILESTONE_DEFS.find((m) => m.id === id)!;
}

/** Evaluates milestone conditions and emits celebration events for newly achieved ones. */
export function checkMilestones(state: GameState): void {
  for (const m of state.milestones) {
    if (m.achievedDay !== undefined) continue;
    const def = milestoneDef(m.id);
    if (def.check(state)) {
      m.achievedDay = state.clock.day;
      pushEvent(state, { type: 'celebration', title: `Milestone: ${def.title}`, body: def.description });
    }
  }
  const level = companyLevelFor(state);
  if (level > state.company.level) {
    state.company.level = level;
    pushEvent(state, { type: 'celebration', title: `Company Level ${level}`, body: 'EGO HVAC is growing. New upgrades and candidates unlocked.' });
  }
}

export function companyLevelFor(state: GameState): number {
  const r = state.stats.totalRevenue;
  const achieved = state.milestones.filter((m) => m.achievedDay !== undefined).length;
  let level = 1;
  if (r >= 15000 || achieved >= 3) level = 2;
  if (r >= 45000 && achieved >= 5) level = 3;
  if (r >= 100000 && achieved >= 8) level = 4;
  if (r >= 200000 && achieved >= 11) level = 5;
  return level;
}
