import { FAULTS, faultById } from './faults';
import { chance, nextFloat, nextInt, pick, shuffle, type RngState } from '../simulation/rng';
import type { CustomerChannel, GameState, Job } from '../simulation/types';
import { WORKDAY_END, WORKDAY_START, absoluteMinutes } from '../simulation/time';
import { pushEvent } from '../simulation/events';
import { BALANCE } from '../simulation/newGame';

/** Poisson sample via Knuth's algorithm (fine for small lambdas). */
export function poisson(rng: RngState, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= nextFloat(rng);
  } while (p > L);
  return k - 1;
}

export function hasDispatcher(state: GameState): boolean {
  return Object.values(state.employees).some((e) => e.role === 'dispatcher' && e.status !== 'training');
}

/** Expected direct leads per day from reputation, marketing, and brand. */
export function directLeadRate(state: GameState): number {
  const rep = state.company.reputation;
  const m = state.marketing;
  let rate = 0.35 + Math.max(0, rep - 3) * 0.5;
  rate += (m.localServicesAds / 45) * 0.55;
  rate += (m.searchAds / 70) * 0.5;
  rate += (m.neighborhoodFlyers / 60) * 0.35;
  rate += m.brandRecognition / 40;
  const wrapped = Object.values(state.vehicles).filter((v) => v.upgrades.includes('full-wrap')).length;
  const decals = Object.values(state.vehicles).filter((v) => v.upgrades.includes('basic-decals')).length;
  rate *= 1 + wrapped * 0.06 + decals * 0.02;
  rate *= 0.8 + state.company.marketShare * 1.5;
  return rate;
}

export function warrantyLeadRate(state: GameState): number {
  return Math.min(5, 1.5 + state.company.level * 0.45);
}

export function scheduleLeadsForDay(state: GameState, opts: { minMinute?: number } = {}): void {
  const start = Math.max(WORKDAY_START, opts.minMinute ?? WORKDAY_START);
  const end = WORKDAY_END - 30;
  if (start >= end) return;
  const fraction = (end - start) / (WORKDAY_END - 30 - WORKDAY_START);
  const nWarranty = poisson(state.rng, warrantyLeadRate(state) * fraction);
  const nDirect = poisson(state.rng, directLeadRate(state) * fraction);
  const push = (channel: CustomerChannel) => state.leadSchedule.push({ day: state.clock.day, minute: nextInt(state.rng, start, end), channel });
  for (let i = 0; i < nWarranty; i++) push('warranty');
  for (let i = 0; i < nDirect; i++) push('direct');
  state.leadSchedule.sort((a, b) => a.minute - b.minute);
}

function pickFaultFor(state: GameState, equipmentAge: number): string {
  const weighted = FAULTS.map((f) => {
    let w = 1;
    if (f.id === 'run-capacitor' || f.id === 'contactor') w = 2.2;
    if (f.replacementCandidate) w = equipmentAge >= 12 ? 1.6 : 0.5;
    if (f.id === 'compressor') w = equipmentAge >= 12 ? 1.0 : 0.25;
    return { id: f.id, w };
  });
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = nextFloat(state.rng) * total;
  for (const x of weighted) {
    r -= x.w;
    if (r <= 0) return x.id;
  }
  return weighted[weighted.length - 1].id;
}

export interface SpawnLeadOptions {
  channel?: CustomerChannel;
  preferredLotId?: string;
  faultId?: string;
  kind?: 'service' | 'callback';
  originJobId?: string;
}

/** Creates a new lead for an idle customer. Returns null when nobody is available. */
export function spawnLead(state: GameState, opts: SpawnLeadOptions = {}): Job | null {
  const busyCustomers = new Set(
    Object.values(state.jobs)
      .filter((j) => !['completed', 'declined', 'expired', 'cancelled'].includes(j.status))
      .map((j) => j.customerId),
  );
  let candidates = Object.values(state.customers).filter((c) => !busyCustomers.has(c.id));
  if (opts.preferredLotId) {
    const pref = candidates.find((c) => c.lotId === opts.preferredLotId);
    if (pref) candidates = [pref];
  } else if (opts.channel) {
    const byChannel = candidates.filter((c) => c.channel === opts.channel);
    if (byChannel.length > 0) candidates = byChannel;
  }
  if (candidates.length === 0) return null;
  const customer = pick(state.rng, candidates);
  if (opts.preferredLotId && opts.channel && customer.channel !== opts.channel) customer.channel = opts.channel;

  const faultId = opts.faultId ?? pickFaultFor(state, customer.equipment.ageYears);
  const fault = faultById(faultId);
  const options = shuffle(state.rng, [fault.id, ...fault.lookalikes.slice(0, 2)]);
  const now = absoluteMinutes(state.clock);
  const lifetime = BALANCE.leadLifetimeMinutes + (state.company.hqUpgrades.includes('dispatch-center') ? 120 : 0);
  const job: Job = {
    id: `job-${state.nextId++}`,
    kind: opts.kind ?? 'service',
    customerId: customer.id,
    status: 'lead',
    complaint: opts.kind === 'callback' ? `Callback: the problem came back. ${fault.complaint}` : fault.complaint,
    faultId,
    diagnosisOptions: options,
    evidence: [],
    createdDay: state.clock.day,
    createdMinute: Math.floor(state.clock.minute),
    expiresAt: now + lifetime,
    crewIds: [],
    phaseRemaining: 0,
    phaseTotal: 0,
    financials: { diagnosticFee: 0, quoteAmount: 0, partsCost: 0, laborCost: 0, revenueCollected: 0 },
    log: [`${customer.channel === 'warranty' ? customer.warrantyCompany : customer.name} called: "${fault.complaint}"`],
    originJobId: opts.originJobId,
  };
  state.jobs[job.id] = job;
  state.stats.leadsReceived++;
  pushEvent(state, {
    type: 'info',
    title: opts.kind === 'callback' ? `Callback request: ${customer.name}` : `New service call: ${customer.name}`,
    body: `${customer.address} · ${customer.channel === 'warranty' ? customer.warrantyCompany : 'Direct customer'}`,
    focus: { kind: 'job', id: job.id },
  });
  return job;
}

/** Fires scheduled leads whose time has come. Without a dispatcher some calls go unanswered. */
export function processLeadSchedule(state: GameState): void {
  const due = state.leadSchedule.filter((l) => l.day === state.clock.day && l.minute <= state.clock.minute);
  if (due.length === 0) return;
  state.leadSchedule = state.leadSchedule.filter((l) => !(l.day === state.clock.day && l.minute <= state.clock.minute));
  const dispatcher = Object.values(state.employees).find((e) => e.role === 'dispatcher' && e.status !== 'training');
  for (const lead of due) {
    // Owner-run shops miss some calls while the owner is in an attic.
    const ownerBusy = Object.values(state.employees).some((e) => e.isOwner && e.status !== 'idle');
    let missChance = dispatcher ? 0.03 - (dispatcher.attributes.communication / 100) * 0.03 : ownerBusy ? 0.3 : 0.1;
    if (lead.channel === 'warranty') missChance *= 0.5; // warranty desks leave voicemail / portal tickets
    if (chance(state.rng, missChance)) {
      state.stats.leadsLost++;
      pushEvent(state, { type: 'warning', title: 'Missed call', body: 'A customer called while nobody could answer. A dispatcher would catch these.' });
      continue;
    }
    spawnLead(state, { channel: lead.channel });
  }
}

export function expireLeads(state: GameState): void {
  const now = absoluteMinutes(state.clock);
  for (const job of Object.values(state.jobs)) {
    if (job.status === 'lead' && now >= job.expiresAt) {
      job.status = 'expired';
      job.log.push('Lead expired: the customer called another company.');
      state.stats.leadsExpired++;
      const customer = state.customers[job.customerId];
      customer.trust = Math.max(0, customer.trust - 5);
      pushEvent(state, { type: 'warning', title: `Lead lost: ${customer.name}`, body: 'Nobody accepted the call in time.' });
    }
  }
}
