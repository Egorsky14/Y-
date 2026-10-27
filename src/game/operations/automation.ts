import type { GameState, Job, JobAttention, AttentionKind } from '../simulation/types';
import type { ActionResult } from '../jobs/workflow';
import { chooseDiagnosis, submitQuote } from '../jobs/workflow';
import { faultById } from '../jobs/faults';
import { measurementAccuracy } from '../employees/attributes';
import { effectiveAccuracy, jobTools, readGain } from '../equipment/performance';
import { pushEvent } from '../simulation/events';
import { absoluteMinutes } from '../simulation/time';

/**
 * Automated Operations Center (HQ upgrade). Two independent settings:
 *
 * - Automatic diagnostics: when a technician's findings are in, the technician commits to a
 *   diagnosis from their own readings (already rolled with their skill, training and tools).
 *   Mostly-right readings lead to the right fault, mostly-misread readings mislead them into a
 *   lookalike (with the usual callback consequences); evenly split evidence is resolved only by a
 *   technician whose instruments read reliably, otherwise it goes to the owner.
 * - Automatic estimates and deal closing: the technician quotes the repair at the standard catalog
 *   price (no discounts) through the normal quote, customer-acceptance and warranty-authorization
 *   mechanics. Systems that warrant a full replacement go to the owner.
 *
 * Decisions that belong to the owner go to the Owner Attention queue (an attention record on the
 * job) instead of popups. Every action changes the job's status, and the pass only acts on a job in
 * the status it handles, so nothing is ever diagnosed, quoted or paid twice.
 */

export const OPERATIONS_CENTER = 'operations-center' as const;
export const OPERATIONS_MIN_TECHNICIANS = 3;
/** Evidence split this evenly (share of the readings' weight read correctly) is ambiguous. */
export const AMBIGUOUS_LOW = 0.4;
export const AMBIGUOUS_HIGH = 0.6;
/** A technician whose readings are this reliable (with tools) re-checks and settles an even split. */
export const RECHECK_ACCURACY = 0.85;
/** Minutes between the quiet operations digests. */
const DIGEST_MINUTES = 120;

export interface AutomationSettings {
  diagnostics: boolean;
  closing: boolean;
}

export function automation(state: GameState): AutomationSettings {
  return (state.company.automation ??= { diagnostics: false, closing: false });
}

/** Technicians in the company's own convention: everyone in the technician role, owner included. */
export function technicianCount(state: GameState): number {
  return Object.values(state.employees).filter((e) => e.role === 'technician').length;
}

export function hasOperationsCenter(state: GameState): boolean {
  return state.company.hqUpgrades.includes(OPERATIONS_CENTER);
}

export function setAutomation(state: GameState, patch: Partial<AutomationSettings>): ActionResult {
  if (!hasOperationsCenter(state)) return { ok: false, reason: 'Build the Automated Operations Center at headquarters first.' };
  const a = automation(state);
  if (patch.diagnostics !== undefined) a.diagnostics = !!patch.diagnostics;
  if (patch.closing !== undefined) a.closing = !!patch.closing;
  return { ok: true };
}

const ATTENTION_TITLES: Record<AttentionKind, string> = {
  'replacement-approval': 'Replacement needs your approval',
  'uncertain-diagnosis': 'Diagnosis needs your call',
  'automation-blocked': 'Automation could not continue',
  'warranty-denied': 'Warranty denied the work',
};

/** Raises an attention item once (a second call for the same open item does nothing). */
export function raiseAttention(state: GameState, job: Job, kind: AttentionKind, text: string, blocking: boolean): void {
  if (job.attention && !job.attention.resolved && job.attention.kind === kind) return;
  const att: JobAttention = { kind, text, blocking, day: state.clock.day, minute: Math.floor(state.clock.minute), waitStatus: blocking ? job.status : undefined };
  job.attention = att;
  job.log.push(`Owner attention: ${text}`);
  const customer = state.customers[job.customerId];
  pushEvent(state, { type: 'warning', title: `${ATTENTION_TITLES[kind]}: ${customer.name}`, body: text, focus: { kind: 'job', id: job.id } });
}

export function acknowledgeAttention(state: GameState, jobId: string): ActionResult {
  const job = state.jobs[jobId];
  if (!job?.attention || job.attention.resolved) return { ok: false, reason: 'Nothing to acknowledge on this job.' };
  if (job.attention.blocking && job.status === job.attention.waitStatus) return { ok: false, reason: 'This needs a decision on the job first.' };
  job.attention.resolved = { day: state.clock.day, minute: Math.floor(state.clock.minute) };
  return { ok: true };
}

/** Open items for the queue: blocking decisions first, then notices; oldest first. */
export function attentionQueue(state: GameState): Job[] {
  return Object.values(state.jobs)
    .filter((j) => j.attention && !j.attention.resolved)
    .sort((a, b) => Number(b.attention!.blocking) - Number(a.attention!.blocking) || a.attention!.day - b.attention!.day || a.attention!.minute - b.attention!.minute);
}

/** Warranty jobs waiting on authorization (shown in the queue as waiting, no action needed). */
export function waitingOnWarranty(state: GameState): Job[] {
  return Object.values(state.jobs).filter((j) => j.status === 'awaiting-authorization');
}

function counters(state: GameState) {
  return (state.operations ??= { digestAt: absoluteMinutes(state.clock), diagnosed: 0, estimates: 0 });
}

/** Share of the readings' weight the technician read correctly. */
export function evidenceConfidence(job: Job): number {
  const fault = faultById(job.faultId);
  const total = fault.evidence.reduce((s, t) => s + t.weight, 0);
  const right = job.evidence.reduce((s, ev) => s + (ev.accurate ? (fault.evidence.find((t) => t.label === ev.label)?.weight ?? 0) : 0), 0);
  return total > 0 ? right / total : 0;
}

/** How reliably this technician's instruments read on this job's measurements (worst reading). */
function recheckAccuracy(state: GameState, job: Job): number {
  const tech = job.technicianId ? state.employees[job.technicianId] : undefined;
  if (!tech) return 0;
  const base = measurementAccuracy(tech.attributes, tech.fatigue);
  const defs = jobTools(state, job);
  return Math.min(...faultById(job.faultId).evidence.map((ev) => effectiveAccuracy(base, readGain(defs, ev.measure))));
}

function autoDiagnose(state: GameState, job: Job): void {
  const tech = job.technicianId ? state.employees[job.technicianId] : undefined;
  const name = tech?.name ?? 'The technician';
  const c = evidenceConfidence(job);
  let pick: string | undefined;
  if (c >= AMBIGUOUS_HIGH) pick = job.faultId;
  else if (c <= AMBIGUOUS_LOW) pick = faultById(job.faultId).lookalikes.find((id) => job.diagnosisOptions.includes(id)) ?? job.diagnosisOptions.find((id) => id !== job.faultId);
  else if (recheckAccuracy(state, job) >= RECHECK_ACCURACY) pick = job.faultId;
  if (!pick) {
    raiseAttention(state, job, 'uncertain-diagnosis', `${name}'s readings conflict. Review the findings and choose the diagnosis.`, true);
    return;
  }
  const r = chooseDiagnosis(state, job.id, pick);
  if (!r.ok) {
    raiseAttention(state, job, 'automation-blocked', r.reason, true);
    return;
  }
  (job.auto ??= {}).diagnosis = true;
  job.log.push(`Automatic diagnosis: ${name} committed to ${faultById(pick).name}.`);
  counters(state).diagnosed++;
}

/** True when the diagnosed fault on this system calls for a full replacement conversation. */
export function replacementWarranted(state: GameState, job: Job): boolean {
  const fault = faultById(job.chosenDiagnosis!);
  const age = state.customers[job.customerId].equipment.ageYears;
  return fault.replacementCandidate && age >= fault.replacementAgeYears;
}

function autoQuote(state: GameState, job: Job): void {
  if (replacementWarranted(state, job)) {
    const age = state.customers[job.customerId].equipment.ageYears;
    raiseAttention(state, job, 'replacement-approval', `${faultById(job.chosenDiagnosis!).name} on ${/^(8|11|18)/.test(String(age)) ? 'an' : 'a'} ${age}-year-old system. Decide between repair and a full replacement.`, true);
    return;
  }
  const r = submitQuote(state, job.id, { recommendation: 'repair', priceAdjust: 1 });
  if (!r.ok) {
    raiseAttention(state, job, 'automation-blocked', r.reason, true);
    return;
  }
  (job.auto ??= {}).estimate = true;
  job.log.push('Automatic estimate: repair quoted at the standard price.');
  counters(state).estimates++;
}

/** One automation pass (called every simulation step, after the job phases). */
export function runOperations(state: GameState): void {
  const a = state.company.automation;
  const on = !!a && hasOperationsCenter(state) && (a.diagnostics || a.closing);
  for (const job of Object.values(state.jobs)) {
    // A decision the owner made on the job resolves its attention item.
    const att = job.attention;
    if (att && !att.resolved && att.blocking && job.status !== att.waitStatus) att.resolved = { day: state.clock.day, minute: Math.floor(state.clock.minute) };
    if (!on || job.kind === 'replacement') continue;
    if (job.attention && !job.attention.resolved && job.attention.blocking) continue;
    if (job.status === 'awaiting-diagnosis' && a!.diagnostics) autoDiagnose(state, job);
    if (job.status === 'quoted' && a!.closing && job.chosenDiagnosis) autoQuote(state, job);
  }
  if (!on) return;
  // A quiet digest instead of a toast per decision.
  const c = counters(state);
  const now = absoluteMinutes(state.clock);
  if (now - c.digestAt >= DIGEST_MINUTES) {
    if (c.diagnosed + c.estimates > 0) {
      const parts = [c.diagnosed ? `${c.diagnosed} diagnosed` : '', c.estimates ? `${c.estimates} estimate${c.estimates === 1 ? '' : 's'} presented` : ''].filter(Boolean);
      const waiting = attentionQueue(state).length;
      pushEvent(state, { type: 'info', title: `Operations: ${parts.join(' · ')}`, body: waiting ? `${waiting} item${waiting === 1 ? '' : 's'} need your attention in Jobs.` : 'Nothing needs your attention.' });
    }
    c.digestAt = now;
    c.diagnosed = 0;
    c.estimates = 0;
  }
}
