import type { GameState, Job, MissionSummary } from '../simulation/types';
import { spawnLead } from '../jobs/leads';
import { WORKDAY_END, absoluteMinutes, MINUTES_PER_DAY, CAMPAIGN_DAYS } from '../simulation/time';
import { BALANCE } from '../simulation/newGame';
import { faultById } from '../jobs/faults';

/**
 * Mission 01, Rooftop Rescue: the opening of every new campaign.
 *
 * The mission owns no gameplay of its own. It is one ordinary service call at Mesquite Plaza, played through the
 * real job workflow, rooftop access rules, ledger and choreography, plus this thin record of how far the call has
 * got. Its objective is always derived from the job (missionStage), so a save made at any moment resumes on the
 * right one and nothing can drift from the simulation. Only three things differ while it is active:
 *  - a wrong diagnosis is refused with an explanation rather than accepted (workflow.chooseDiagnosis);
 *  - the quote goes through the customer's authorization, a fixed limit and a short review, with no random draw
 *    (Job.authorization), so a first-time player is not lost to a dice roll;
 *  - unrelated leads wait until it ends (processLeadSchedule), then arrive spaced out over the rest of the day.
 *
 * Campaigns without a `mission` record (older saves) never get one: every check here is false for them.
 */

export const ROOFTOP_RESCUE = {
  id: 'rooftop-rescue' as const,
  title: 'Rooftop Rescue',
  lotId: 'cm-plaza',
  customerId: 'cust-cm-plaza',
  /** A cleaning repair at the unit: repairable with the starter kit, and no crane or replacement in sight. */
  faultId: 'dirty-condenser',
  complaint: 'Our rooftop AC has been running all morning, but the office keeps getting warmer and patients are arriving.',
  approver: 'Desert Sun Dental',
  /** Share of the book price the practice manager has approved in advance. */
  limitRatio: 1.15,
  /** Game minutes the practice manager takes to review the quote. */
  authorizationMinutes: 12,
};

/** The van has visibly pulled away from the site after this far along its route (world units): the summary may open. */
export const MISSION_DEPART_DISTANCE = 80;
/** Held leads resume this long after the mission ends, and this far apart (game minutes). */
const RELEASE_DELAY = 20;
const RELEASE_GAP = 25;

export const MISSION_OBJECTIVE_COUNT = 8;
export type MissionStage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Starts the mission on a new campaign. Uses the same random draws as any other lead (seed compatibility). */
export function startOpeningMission(state: GameState): Job | null {
  const m = ROOFTOP_RESCUE;
  const job = spawnLead(state, { channel: 'direct', preferredLotId: m.lotId, faultId: m.faultId, complaint: m.complaint });
  if (!job) return null;
  const book = faultById(m.faultId).repairPrice;
  job.authorization = { approver: m.approver, limit: Math.round(book * m.limitRatio), minutes: m.authorizationMinutes };
  // The opening call waits for the player: it does not expire while they look around.
  job.expiresAt = absoluteMinutes(state.clock) + CAMPAIGN_DAYS * MINUTES_PER_DAY;
  const customer = state.customers[job.customerId];
  state.mission = { id: m.id, jobId: job.id, status: 'active', baseline: { reputation: state.company.reputation, trust: customer.trust } };
  return job;
}

export function missionActive(state: GameState): boolean {
  return state.mission?.status === 'active';
}

export function isMissionJob(state: GameState, jobId: string): boolean {
  return state.mission?.status === 'active' && state.mission.jobId === jobId;
}

export function missionJob(state: GameState): Job | undefined {
  return state.mission ? state.jobs[state.mission.jobId] : undefined;
}

/** The current objective, derived from the real job and vehicle. Null when no mission is being played. */
export function missionStage(state: GameState): MissionStage | null {
  const mission = state.mission;
  if (!mission) return null;
  if (mission.status === 'completed') return 8;
  if (mission.status !== 'active') return null;
  const job = state.jobs[mission.jobId];
  switch (job?.status) {
    case 'lead':
      return 1;
    case 'accepted':
      return 2;
    case 'enroute':
      return 3;
    case 'arriving':
      return 4;
    case 'diagnosing':
    case 'awaiting-diagnosis':
      return 5;
    case 'quoted':
    case 'awaiting-authorization':
      return 6;
    case 'repairing':
    case 'completed':
      return 7;
    default:
      return null;
  }
}

/** The vehicle has left the site with the ladder back on its rack, and has pulled clearly away. */
function hasDeparted(state: GameState, job: Job): boolean {
  const vehicle = job.vehicleId ? state.vehicles[job.vehicleId] : undefined;
  if (!vehicle) return true;
  if (vehicle.packUp || vehicle.status === 'onsite') return false;
  if (vehicle.status === 'returning' && vehicle.route) return vehicle.route.progress >= MISSION_DEPART_DISTANCE;
  return true;
}

/** The job's real figures, read back from the ledger: nothing here is computed separately or paid out. */
export function buildMissionSummary(state: GameState, job: Job): MissionSummary {
  const mission = state.mission!;
  const entries = state.finance.ledger.filter((e) => e.jobId === job.id);
  const revenue = entries.filter((e) => e.category === 'service-revenue').reduce((sum, e) => sum + e.amount, 0);
  const partsCost = -entries.filter((e) => e.category === 'parts').reduce((sum, e) => sum + e.amount, 0);
  const tech = job.technicianId ? state.employees[job.technicianId] : undefined;
  const before = mission.baseline.tech;
  return {
    revenue,
    diagnosticFee: job.financials.diagnosticFee,
    repairRevenue: revenue - job.financials.diagnosticFee,
    partsCost,
    laborCost: job.financials.laborCost,
    netContribution: revenue - partsCost - job.financials.laborCost,
    faultName: faultById(job.faultId).name,
    diagnosisCorrect: job.diagnosisCorrect === true,
    reputationBefore: mission.baseline.reputation,
    reputationAfter: state.company.reputation,
    trustBefore: mission.baseline.trust,
    trustAfter: state.customers[job.customerId].trust,
    reviewStars: job.reviewStars,
    technicianName: tech?.name ?? 'Technician',
    xpGained: tech && before ? tech.xp - before.xp : 0,
    levelBefore: before?.level ?? tech?.level ?? 1,
    levelAfter: tech?.level ?? 1,
  };
}

/** Brings the mission record up to date with the simulation. Runs after every action and simulation step. */
export function syncMission(state: GameState): void {
  const mission = state.mission;
  if (!mission || mission.status !== 'active') return;
  const job = state.jobs[mission.jobId];
  if (!job || job.status === 'declined' || job.status === 'expired' || job.status === 'cancelled') {
    mission.status = 'abandoned';
    releaseHeldLeads(state);
    return;
  }
  if (job.technicianId && !mission.baseline.tech) {
    const tech = state.employees[job.technicianId];
    if (tech) mission.baseline.tech = { xp: tech.xp, level: tech.level };
  }
  if (job.status === 'completed' && hasDeparted(state, job)) {
    mission.status = 'completed';
    mission.summary = buildMissionSummary(state, job);
    // The summary holds the clock until it is read; the speed the player chose comes back with it.
    mission.resumeSpeed = state.speed === 0 ? 1 : state.speed;
    state.speed = 0;
    releaseHeldLeads(state);
  }
}

/** Skipping turns off the guidance and leaves an ordinary call in its current state: no job is created, closed or paid. */
export function skipMission(state: GameState): { ok: true } | { ok: false; reason: string } {
  const mission = state.mission;
  if (!mission || mission.status !== 'active') return { ok: false, reason: 'No mission is running.' };
  const job = state.jobs[mission.jobId];
  mission.status = 'skipped';
  if (job) {
    if (job.status === 'lead') job.expiresAt = absoluteMinutes(state.clock) + BALANCE.leadLifetimeMinutes;
    // A review already under way finishes; any quote from here on follows the normal customer rules.
    if (job.status !== 'awaiting-authorization') delete job.authorization;
  }
  releaseHeldLeads(state);
  return { ok: true };
}

/** The player has read the summary: regular operations begin. */
export function acknowledgeMission(state: GameState): { ok: true } | { ok: false; reason: string } {
  const mission = state.mission;
  if (!mission || mission.status !== 'completed') return { ok: false, reason: 'The mission is not complete.' };
  if (mission.acknowledged) return { ok: true };
  mission.acknowledged = true;
  if (state.speed === 0) state.speed = mission.resumeSpeed ?? 1;
  return { ok: true };
}

/**
 * Leads whose time passed during the mission arrive one by one from now on, instead of all at once. The schedule was
 * drawn as usual when the campaign started, so seeds stay comparable; what no longer fits today is dropped.
 */
function releaseHeldLeads(state: GameState): void {
  const { day, minute } = state.clock;
  const next: GameState['leadSchedule'] = [];
  let n = 0;
  for (const lead of state.leadSchedule) {
    if (lead.day > day || (lead.day === day && lead.minute > minute)) {
      next.push(lead);
      continue;
    }
    const at = minute + RELEASE_DELAY + RELEASE_GAP * n++;
    if (at < WORKDAY_END - 30) next.push({ ...lead, day, minute: at });
  }
  state.leadSchedule = next.sort((a, b) => a.day - b.day || a.minute - b.minute);
}
