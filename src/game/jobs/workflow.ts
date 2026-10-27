import { faultById, tierById, EQUIPMENT_TIERS } from './faults';
import type { Employee, GameState, Job, Vehicle } from '../simulation/types';
import { absoluteMinutes } from '../simulation/time';
import { chance, nextInt, pick } from '../simulation/rng';
import { pushEvent } from '../simulation/events';
import { postTransaction, openReceivable } from '../economy/ledger';
import { BALANCE } from '../simulation/newGame';
import {
  durationMultiplier,
  expectedStars,
  fatiguePerHour,
  measurementAccuracy,
  repairAcceptance,
  replacementAcceptance,
  xpMultiplier,
} from '../employees/attributes';
import { levelForXp } from '../employees/roles';
import { routeFromHqToLot, routeFromLotToHq, vehicleSpeed, effectiveToolCapacity } from '../fleet/fleet';
import { VEHICLE_SPECS } from '../fleet/vehicleCatalog';
import { lotById, workPosition } from '../world/cityLayout';
import { raiseAttention } from '../operations/automation';
import { diagMultiplier, effectiveAccuracy, jobTools, qualityStars, readGain, readTools, repairMultiplier, toolsOnSite, vehicleAtJob, workmanship } from '../equipment/performance';

export type ActionResult = { ok: true } | { ok: false; reason: string };

const ACTIVE_STATUSES = new Set(['enroute', 'arriving', 'diagnosing', 'awaiting-diagnosis', 'quoted', 'awaiting-authorization', 'repairing', 'installing']);

export function isActiveJob(job: Job): boolean {
  return ACTIVE_STATUSES.has(job.status);
}

export function employeeAvailable(e: Employee): boolean {
  return e.status === 'idle' && !e.training && !e.jobId;
}

export function vehicleAvailable(v: Vehicle): boolean {
  return v.status === 'parked' && !v.jobId;
}

export function acceptLead(state: GameState, jobId: string): ActionResult {
  const job = state.jobs[jobId];
  if (!job) return { ok: false, reason: 'Unknown job.' };
  if (job.status !== 'lead') return { ok: false, reason: 'This call is no longer a lead.' };
  job.status = 'accepted';
  job.acceptedAt = absoluteMinutes(state.clock);
  job.log.push('Call accepted. Waiting for dispatch.');
  state.stats.leadsAccepted++;
  return { ok: true };
}

export function declineLead(state: GameState, jobId: string): ActionResult {
  const job = state.jobs[jobId];
  if (!job) return { ok: false, reason: 'Unknown job.' };
  if (job.status !== 'lead') return { ok: false, reason: 'Only leads can be declined.' };
  job.status = 'declined';
  job.log.push('Declined by dispatcher.');
  return { ok: true };
}

/** Sends a technician in a vehicle to a job. The vehicle leaves HQ along a real road route. */
export function dispatchJob(state: GameState, jobId: string, technicianId: string, vehicleId: string): ActionResult {
  const job = state.jobs[jobId];
  const tech = state.employees[technicianId];
  const vehicle = state.vehicles[vehicleId];
  if (!job || !tech || !vehicle) return { ok: false, reason: 'Unknown job, employee, or vehicle.' };
  if (job.status !== 'accepted') return { ok: false, reason: 'Accept the call before dispatching.' };
  if (tech.role !== 'technician') return { ok: false, reason: `${tech.name} is not a service technician.` };
  if (!employeeAvailable(tech)) return { ok: false, reason: `${tech.name} is not available right now.` };
  if (!vehicleAvailable(vehicle)) return { ok: false, reason: `${vehicle.nickname} is not at headquarters.` };
  if (job.kind === 'replacement') return { ok: false, reason: 'Replacements need an installation crew dispatch.' };
  const customer = state.customers[job.customerId];
  const route = routeFromHqToLot(vehicle, customer.lotId);
  if (!route) return { ok: false, reason: 'No road route to the customer.' };

  vehicle.route = route;
  vehicle.status = 'enroute';
  vehicle.jobId = job.id;
  vehicle.driverId = tech.id;
  tech.status = 'driving';
  tech.jobId = job.id;
  tech.vehicleId = vehicle.id;
  job.status = 'enroute';
  job.technicianId = tech.id;
  job.vehicleId = vehicle.id;
  const eta = route.totalLength / vehicleSpeed(vehicle);
  job.log.push(`${tech.name} dispatched in ${vehicle.nickname}. Drive time ≈ ${Math.round(eta)} min.`);
  pushEvent(state, { type: 'info', title: `${vehicle.nickname} en route`, body: `${tech.name} → ${customer.address}`, focus: { kind: 'vehicle', id: vehicle.id } });
  return { ok: true };
}

/** Called when the vehicle reaches the customer's curb. */
export function onVehicleArrived(state: GameState, vehicle: Vehicle): void {
  const job = vehicle.jobId ? state.jobs[vehicle.jobId] : undefined;
  vehicle.status = 'onsite';
  vehicle.route = undefined;
  if (!job) return;
  const customer = state.customers[job.customerId];
  job.arrivedAt = absoluteMinutes(state.clock);
  const crew = [job.technicianId, ...job.crewIds].filter((id): id is string => !!id).map((id) => state.employees[id]).filter(Boolean);
  for (const e of crew) {
    e.status = 'walking';
    e.position = { ...vehicle.position };
  }
  if (job.kind === 'replacement') {
    job.status = 'arriving';
    job.phaseTotal = BALANCE.arrivalWalkMinutes * 2;
    job.phaseRemaining = job.phaseTotal;
    job.log.push(`Install crew arrived at ${customer.address}. Unloading equipment.`);
    return;
  }
  job.status = 'arriving';
  job.phaseTotal = BALANCE.arrivalWalkMinutes;
  job.phaseRemaining = job.phaseTotal;
  job.log.push(`Arrived at ${customer.address}. Walking to the equipment.`);
}

function techFor(state: GameState, job: Job): Employee | undefined {
  return job.technicianId ? state.employees[job.technicianId] : undefined;
}

/** Advances timed job phases. */
export function advanceJobPhase(state: GameState, job: Job, dt: number): void {
  if (job.phaseRemaining <= 0) return;
  job.phaseRemaining -= dt;
  const tech = techFor(state, job);
  const customer = state.customers[job.customerId];
  const lot = lotById(customer.lotId)!;
  const crew = [job.technicianId, ...job.crewIds].filter((id): id is string => !!id).map((id) => state.employees[id]).filter(Boolean);

  if (job.status === 'arriving') {
    const t = 1 - Math.max(0, job.phaseRemaining) / job.phaseTotal;
    const vehicle = job.vehicleId ? state.vehicles[job.vehicleId] : undefined;
    crew.forEach((e, i) => {
      const target = workPosition(lot, i);
      const from = vehicle ? vehicle.position : target;
      e.position = { x: from.x + (target.x - from.x) * t, z: from.z + (target.z - from.z) * t };
    });
    if (job.phaseRemaining <= 0) {
      crew.forEach((e) => (e.status = 'working'));
      if (job.kind === 'replacement') {
        const tier = tierById(job.equipmentTierId ?? 'standard');
        const lead = crew[0];
        let minutes = tier.installMinutes * (lead ? durationMultiplier(lead.attributes, lead.fatigue) : 1);
        const crewBonus = Math.max(0.55, 1 - (crew.length - 1) * 0.22);
        minutes *= crewBonus;
        if (state.company.hqUpgrades.includes('staging-area')) minutes *= 0.85;
        if (vehicle?.upgrades.includes('liftgate')) minutes *= 0.85;
        job.status = 'installing';
        job.phaseTotal = minutes;
        job.phaseRemaining = minutes;
        job.log.push(`Installation started. Estimated ${Math.round(minutes)} minutes.`);
      } else {
        // Equipment on site: the technician's kit plus the van's rack (the van is parked at the curb).
        const onSite = toolsOnSite(state, tech, vehicleAtJob(state, job));
        for (const t of onSite) t.jobsUsed++;
        const base = BALANCE.diagnosticBaseMinutes * (tech ? durationMultiplier(tech.attributes, tech.fatigue) : 1);
        const minutes = base * diagMultiplier(faultById(job.faultId), jobTools(state, job));
        job.toolReport = { toolIds: onSite.map((t) => t.id), diagMinutesSaved: base - minutes, repairMinutesSaved: 0 };
        job.status = 'diagnosing';
        job.phaseTotal = minutes;
        job.phaseRemaining = minutes;
        job.log.push(`Diagnostic started. ${tech?.name ?? 'Technician'} is taking measurements${onSite.length ? ` with ${onSite.length} tool${onSite.length === 1 ? '' : 's'} on hand` : ''}.`);
      }
    }
    return;
  }

  if (job.status === 'diagnosing' && job.phaseRemaining <= 0) {
    completeDiagnostic(state, job);
    return;
  }
  if (job.status === 'awaiting-authorization' && job.phaseRemaining <= 0) {
    resolveAuthorization(state, job);
    return;
  }
  if (job.status === 'repairing' && job.phaseRemaining <= 0) {
    completeRepair(state, job);
    return;
  }
  if (job.status === 'installing' && job.phaseRemaining <= 0) {
    completeInstall(state, job);
  }
}

function completeDiagnostic(state: GameState, job: Job): void {
  const tech = techFor(state, job);
  const fault = faultById(job.faultId);
  const accuracy = tech ? measurementAccuracy(tech.attributes, tech.fatigue) : 0.6;
  const defs = jobTools(state, job);
  // One draw per reading, as before: tools change the odds, never the number of draws (determinism).
  job.evidence = fault.evidence.map((ev) => {
    const accurate = chance(state.rng, effectiveAccuracy(accuracy, readGain(defs, ev.measure)));
    const used = readTools(defs, ev.measure).map((d) => d.name);
    return { label: ev.label, value: accurate ? ev.value : ev.noisyValue, accurate, ...(used.length ? { tools: used } : {}) };
  });
  job.status = 'awaiting-diagnosis';
  job.phaseRemaining = 0;
  const customer = state.customers[job.customerId];
  job.log.push('Measurements complete. Review the findings and choose a diagnosis.');
  if (tech) addFatigue(tech, job.phaseTotal);
  // With automatic diagnostics on, the technician decides in this same step; no toast per call.
  const auto = state.company.automation;
  if (!(auto?.diagnostics && state.company.hqUpgrades.includes('operations-center'))) {
    pushEvent(state, { type: 'success', title: `Findings ready: ${customer.name}`, body: 'Review the measurements and pick a diagnosis.', focus: { kind: 'job', id: job.id } });
  }
}

export function chooseDiagnosis(state: GameState, jobId: string, faultId: string): ActionResult {
  const job = state.jobs[jobId];
  if (!job) return { ok: false, reason: 'Unknown job.' };
  if (job.status !== 'awaiting-diagnosis') return { ok: false, reason: 'No diagnosis is pending on this job.' };
  if (!job.diagnosisOptions.includes(faultId)) return { ok: false, reason: 'That diagnosis is not among the candidates.' };
  job.chosenDiagnosis = faultId;
  job.diagnosisCorrect = faultId === job.faultId;
  job.status = 'quoted';
  const chosen = faultById(faultId);
  job.log.push(`Diagnosis: ${chosen.name}. Prepare a recommendation.`);
  if (job.diagnosisCorrect) state.stats.correctDiagnoses++;
  else state.stats.incorrectDiagnoses++;
  return { ok: true };
}

export interface QuoteRequest {
  recommendation: 'repair' | 'replace';
  equipmentTierId?: string;
  financed?: boolean;
  /** Multiplier on catalog price for repairs (0.8..1.3). */
  priceAdjust?: number;
}

export function replacementAvailable(state: GameState): { ok: boolean; reason?: string } {
  const installers = Object.values(state.employees).filter((e) => e.role === 'installer');
  const trucks = Object.values(state.vehicles).filter((v) => VEHICLE_SPECS[v.classId].canCarryReplacement);
  if (installers.length === 0) return { ok: false, reason: 'Hire an installer before selling replacements.' };
  if (trucks.length === 0) return { ok: false, reason: 'You need a full-size van or box truck to deliver equipment.' };
  return { ok: true };
}

/** Presents the recommendation to the customer (or warranty company) and resolves approval. */
export function submitQuote(state: GameState, jobId: string, req: QuoteRequest): ActionResult {
  const job = state.jobs[jobId];
  if (!job) return { ok: false, reason: 'Unknown job.' };
  if (job.status !== 'quoted' || !job.chosenDiagnosis) return { ok: false, reason: 'Choose a diagnosis first.' };
  const tech = techFor(state, job);
  const customer = state.customers[job.customerId];
  const chosen = faultById(job.chosenDiagnosis);
  const priceAdjust = Math.max(0.8, Math.min(1.3, req.priceAdjust ?? 1));
  job.recommendation = req.recommendation;

  if (req.recommendation === 'replace') {
    const avail = replacementAvailable(state);
    if (!avail.ok) return { ok: false, reason: avail.reason! };
    const tier = tierById(req.equipmentTierId ?? 'standard');
    job.equipmentTierId = tier.id;
    job.financed = !!req.financed;
    job.financials.quoteAmount = tier.price;
    job.log.push(`Recommended replacement: ${tier.name} at $${tier.price.toLocaleString()}${req.financed ? ' with financing' : ''}.`);
  } else {
    const price = Math.round(chosen.repairPrice * priceAdjust);
    job.financials.quoteAmount = price;
    job.log.push(`Quoted repair: ${chosen.name} for $${price.toLocaleString()}.`);
  }

  if (customer.channel === 'warranty') {
    job.status = 'awaiting-authorization';
    job.phaseTotal = nextInt(state.rng, 25, 80);
    job.phaseRemaining = job.phaseTotal;
    job.log.push(`Waiting on ${customer.warrantyCompany} authorization (≈${job.phaseTotal} min).`);
    return { ok: true };
  }

  const attrs = tech?.attributes ?? Object.values(state.employees)[0].attributes;
  let p: number;
  if (req.recommendation === 'replace') {
    const tierIndex = EQUIPMENT_TIERS.findIndex((t) => t.id === job.equipmentTierId);
    p = replacementAcceptance(attrs, tierIndex, customer.equipment.ageYears, !!req.financed, customer.trust);
    const advisor = Object.values(state.employees).find((e) => e.role === 'comfort-advisor' && e.status !== 'training');
    if (advisor) p += (advisor.attributes.salesAbility / 100) * 0.2;
    if (state.company.hqUpgrades.includes('sales-office')) p += 0.08;
  } else {
    p = repairAcceptance(attrs, priceAdjust, customer.trust, job.diagnosisCorrect !== false);
  }
  resolveApproval(state, job, chance(state.rng, Math.min(0.97, p)), 'Customer');
  return { ok: true };
}

function resolveAuthorization(state: GameState, job: Job): void {
  const customer = state.customers[job.customerId];
  const approveChance = job.recommendation === 'replace' ? 0.4 : 0.86;
  const approved = chance(state.rng, approveChance);
  resolveApproval(state, job, approved, customer.warrantyCompany ?? 'Warranty company');
  // A denial on an automated job is worth the owner's eye (the visit closes on the diagnostic fee).
  if (!approved && job.auto?.estimate) raiseAttention(state, job, 'warranty-denied', `${customer.warrantyCompany ?? 'The warranty company'} denied the ${job.recommendation === 'replace' ? 'replacement' : 'repair'}. The visit closed on the diagnostic fee.`, false);
}

function resolveApproval(state: GameState, job: Job, approved: boolean, approver: string): void {
  const tech = techFor(state, job);
  const customer = state.customers[job.customerId];
  if (!approved) {
    job.log.push(`${approver} declined the ${job.recommendation === 'replace' ? 'replacement' : 'repair'}.`);
    job.financials.quoteAmount = 0;
    finishVisit(state, job, false);
    return;
  }
  if (job.recommendation === 'replace') {
    job.log.push(`${approver} approved the replacement. Schedule the install crew.`);
    customer.trust = Math.min(100, customer.trust + 8);
    // The diagnostic visit ends; a replacement job is spawned for the install crew.
    finishVisit(state, job, true);
    return;
  }
  const chosen = faultById(job.chosenDiagnosis!);
  const vehicle = job.vehicleId ? state.vehicles[job.vehicleId] : undefined;
  let minutes = chosen.laborMinutes * (tech ? durationMultiplier(tech.attributes, tech.fatigue) : 1);
  if (vehicle) minutes *= toolCapacityPenalty(vehicle);
  if (vehicle?.upgrades.includes('shelving')) minutes *= 0.95;
  // The repair the player chose is the one performed: its steps decide which tools help.
  const withTools = minutes * repairMultiplier(chosen, jobTools(state, job));
  if (job.toolReport) job.toolReport.repairMinutesSaved = minutes - withTools;
  minutes = withTools;
  job.status = 'repairing';
  job.phaseTotal = minutes;
  job.phaseRemaining = minutes;
  job.log.push(`${approver} approved. Repair in progress (≈${Math.round(minutes)} min).`);
}

function addFatigue(e: Employee, minutes: number): void {
  e.fatigue = Math.min(100, e.fatigue + (fatiguePerHour(e.attributes) * minutes) / 60);
}

function grantXp(state: GameState, e: Employee, baseXp: number): void {
  const before = e.level;
  e.xp += Math.round(baseXp * xpMultiplier(e.attributes));
  e.level = levelForXp(e.xp);
  if (e.level > before) {
    // Level-ups grant small, permanent attribute improvements.
    e.attributes.technicalExpertise = Math.min(100, e.attributes.technicalExpertise + 2);
    e.attributes.diagnosticAccuracy = Math.min(100, e.attributes.diagnosticAccuracy + 2);
    e.attributes.speed = Math.min(100, e.attributes.speed + 1);
    e.attributes.customerService = Math.min(100, e.attributes.customerService + 1);
    e.morale = Math.min(100, e.morale + 8);
    pushEvent(state, { type: 'celebration', title: `${e.name} reached level ${e.level}`, body: 'Attributes improved.', focus: { kind: 'employee', id: e.id } });
  }
}

/** Posts the diagnostic fee (always) and returns the crew to the vehicle. */
function finishVisit(state: GameState, job: Job, approvedReplacement: boolean): void {
  const tech = techFor(state, job);
  const customer = state.customers[job.customerId];
  collectDiagnosticFee(state, job);
  if (approvedReplacement) {
    const install = createReplacementJob(state, job);
    job.log.push(`Replacement job ${install.id} created. Dispatch installers from the Jobs panel.`);
    pushEvent(state, { type: 'success', title: `Replacement sold: ${customer.name}`, body: 'Dispatch an install crew with a replacement-capable vehicle.', focus: { kind: 'job', id: install.id } });
  }
  job.status = 'completed';
  job.completedAt = absoluteMinutes(state.clock);
  if (tech) grantXp(state, tech, 25);
  afterCompletion(state, job, approvedReplacement ? 4.3 : undefined);
  returnCrewToHq(state, job);
}

function collectDiagnosticFee(state: GameState, job: Job): void {
  if (job.kind === 'callback') return;
  const customer = state.customers[job.customerId];
  if (customer.channel === 'direct') {
    const fee = state.company.diagnosticFee;
    job.financials.diagnosticFee = fee;
    postTransaction(state, { amount: fee, category: 'service-revenue', memo: `Diagnostic fee — ${customer.name}`, jobId: job.id });
    job.financials.revenueCollected += fee;
  } else {
    const fee = BALANCE.warrantyDiagnosticFee;
    job.financials.diagnosticFee = fee;
    addReceivable(state, job, fee, `${customer.warrantyCompany} diagnostic`);
  }
}

function addReceivable(state: GameState, job: Job, amount: number, memo: string): void {
  const customer = state.customers[job.customerId];
  const existing = job.financials.receivableId ? state.finance.receivables.find((r) => r.id === job.financials.receivableId) : undefined;
  if (existing && existing.status === 'open') {
    existing.amount = Math.round((existing.amount + amount) * 100) / 100;
    return;
  }
  const r = openReceivable(state, {
    jobId: job.id,
    customerId: customer.id,
    amount,
    issuedDay: state.clock.day,
    dueDay: state.clock.day + BALANCE.warrantyNetDays,
    payer: customer.warrantyCompany ?? customer.name,
  });
  job.financials.receivableId = r.id;
  job.log.push(`${memo}: $${amount.toLocaleString()} billed to ${r.payer}, net ${BALANCE.warrantyNetDays} days.`);
}

function completeRepair(state: GameState, job: Job): void {
  const tech = techFor(state, job);
  const customer = state.customers[job.customerId];
  const chosen = faultById(job.chosenDiagnosis!);
  const partsDiscount = state.company.hqUpgrades.includes('parts-warehouse') ? 0.88 : 1;
  const partsCost = Math.round(chosen.partsCost * partsDiscount);
  job.financials.partsCost = partsCost;
  postTransaction(state, { amount: -partsCost, category: 'parts', memo: `Parts — ${chosen.name}`, jobId: job.id });
  collectDiagnosticFee(state, job);

  if (job.kind !== 'callback') {
    if (customer.channel === 'direct') {
      postTransaction(state, { amount: job.financials.quoteAmount, category: 'service-revenue', memo: `Repair — ${chosen.name} — ${customer.name}`, jobId: job.id });
      job.financials.revenueCollected += job.financials.quoteAmount;
    } else {
      const amount = Math.round(job.financials.quoteAmount * BALANCE.warrantyRepairRate);
      job.financials.quoteAmount = amount;
      addReceivable(state, job, amount, 'Authorized repair');
    }
  }

  const quality = tech ? workmanship(chosen, tech.attributes, jobTools(state, job)) : undefined;
  if (quality && job.toolReport) {
    job.toolReport.quality = quality.quality;
    job.toolReport.qualityBase = quality.base;
  }
  job.status = 'completed';
  job.completedAt = absoluteMinutes(state.clock);
  job.log.push(job.diagnosisCorrect ? 'Repair complete. System verified: measured, verified, done right.' : 'Repair complete. The technician noted readings that still look off.');
  if (quality) job.log.push(`Workmanship ${Math.round(quality.quality * 100)}%${quality.quality > quality.base + 0.005 ? ` (the tools added ${Math.round((quality.quality - quality.base) * 100)} points: ${workmanshipNotes(state, job).join(', ')})` : ' (no evacuation or charging instruments on site)'}.`);
  if (tech) {
    addFatigue(tech, job.phaseTotal);
    grantXp(state, tech, job.diagnosisCorrect ? 60 : 30);
    tech.jobsCompleted++;
  }
  state.company.completedJobs++;
  state.stats.jobsCompleted++;
  afterCompletion(state, job);
  returnCrewToHq(state, job);

  if (job.diagnosisCorrect === false && chance(state.rng, 0.75)) {
    // The real fault was never fixed. Schedule a callback.
    state.callbackSchedule.push({ day: state.clock.day + nextInt(state.rng, 1, 3), minute: nextInt(state.rng, 8 * 60, 15 * 60), originJobId: job.id });
    job.log.push('Warning: the original fault remains. Expect a callback.');
  }
  pushEvent(state, {
    type: 'money',
    title: customer.channel === 'direct' ? `Paid: $${(job.financials.revenueCollected).toLocaleString()} from ${customer.name}` : `Billed ${customer.warrantyCompany}: $${(job.financials.quoteAmount + job.financials.diagnosticFee).toLocaleString()}`,
    body: `${chosen.name} — ${job.diagnosisCorrect ? 'correct diagnosis' : 'diagnosis uncertain'}`,
    focus: { kind: 'job', id: job.id },
  });
}

function afterCompletion(state: GameState, job: Job, forcedStars?: number): void {
  const tech = techFor(state, job);
  const customer = state.customers[job.customerId];
  customer.history.push(job.id);
  const waited = (job.arrivedAt ?? 0) - (job.acceptedAt ?? job.arrivedAt ?? 0);
  const correct = job.diagnosisCorrect !== false;
  let stars = forcedStars ?? (tech ? expectedStars(tech.attributes, correct, waited) : 3.5);
  // Verified evacuation and a weighed-in charge show: the customer sees the readings.
  if (forcedStars === undefined && correct && job.toolReport?.quality !== undefined) stars = Math.min(5, stars + qualityStars({ base: job.toolReport.qualityBase ?? job.toolReport.quality, quality: job.toolReport.quality }));
  const trustDelta = correct ? 10 : -15;
  customer.trust = Math.max(0, Math.min(100, customer.trust + trustDelta));
  const reviewChance = customer.channel === 'direct' ? 0.6 : 0.2;
  if (job.kind !== 'callback' && chance(state.rng, reviewChance)) {
    const rounded = Math.round(stars * 2) / 2;
    job.reviewStars = rounded;
    const text = pick(state.rng, rounded >= 4.5 ? FIVE_STAR : rounded >= 3.5 ? FOUR_STAR : LOW_STAR);
    state.company.reviews.push({ id: `rv-${state.nextId++}`, day: state.clock.day, customerName: customer.name, stars: rounded, text });
    recomputeReputation(state);
    pushEvent(state, { type: rounded >= 4.5 ? 'celebration' : rounded >= 3.5 ? 'success' : 'warning', title: `${'★'.repeat(Math.round(rounded))} review from ${customer.name}`, body: text });
  }
  if (tech) {
    tech.morale = Math.max(0, Math.min(100, tech.morale + (correct ? 1.5 : -3)));
  }
}

const FIVE_STAR = [
  'They measured everything and showed me the readings. Fixed the first time.',
  'Finally a company that diagnoses instead of guessing. Cold air in an hour.',
  'Professional, on time, explained the capacitor failure with the meter in hand.',
];
const FOUR_STAR = ['Good work, fair price. Took a bit longer than quoted.', 'Solid tech, clear explanation. Would call again.'];
const LOW_STAR = ['Problem came back a few days later. Not impressed.', 'Replaced a part that didn’t fix it. Still warm in here.'];

export function recomputeReputation(state: GameState): void {
  const reviews = state.company.reviews;
  if (reviews.length === 0) return;
  // Recent reviews weigh more.
  let weight = 0;
  let total = 0;
  reviews.forEach((r, i) => {
    const w = 1 + i / Math.max(1, reviews.length);
    weight += w;
    total += r.stars * w;
  });
  state.company.reputation = Math.round((total / weight) * 100) / 100;
}

function returnCrewToHq(state: GameState, job: Job): void {
  const vehicle = job.vehicleId ? state.vehicles[job.vehicleId] : undefined;
  const customer = state.customers[job.customerId];
  const crew = [job.technicianId, ...job.crewIds].filter((id): id is string => !!id).map((id) => state.employees[id]).filter(Boolean);
  for (const e of crew) {
    e.status = 'returning';
    e.jobId = undefined;
  }
  if (!vehicle) return;
  const route = routeFromLotToHq(vehicle, customer.lotId);
  vehicle.route = route ?? undefined;
  vehicle.status = 'returning';
  vehicle.jobId = undefined;
  if (!route) parkVehicle(state, vehicle);
}

export function parkVehicle(state: GameState, vehicle: Vehicle): void {
  vehicle.status = 'parked';
  vehicle.route = undefined;
  vehicle.jobId = undefined;
  const crewIds = [vehicle.driverId, ...vehicle.passengerIds].filter((id): id is string => !!id);
  crewIds.forEach((id, i) => {
    const e = state.employees[id];
    if (!e) return;
    e.status = 'idle';
    e.vehicleId = undefined;
    e.jobId = undefined;
    e.position = { x: 44 + i * 2, z: 34 + Object.keys(state.employees).indexOf(id) * 2.2 };
  });
  vehicle.driverId = undefined;
  vehicle.passengerIds = [];
}

function createReplacementJob(state: GameState, origin: Job): Job {
  const customer = state.customers[origin.customerId];
  const tier = tierById(origin.equipmentTierId ?? 'standard');
  const job: Job = {
    id: `job-${state.nextId++}`,
    kind: 'replacement',
    customerId: customer.id,
    status: 'accepted',
    complaint: `System replacement: ${tier.name}`,
    faultId: origin.faultId,
    diagnosisOptions: [],
    evidence: [],
    chosenDiagnosis: origin.chosenDiagnosis,
    diagnosisCorrect: true,
    recommendation: 'replace',
    equipmentTierId: tier.id,
    financed: origin.financed,
    createdDay: state.clock.day,
    createdMinute: Math.floor(state.clock.minute),
    expiresAt: Number.POSITIVE_INFINITY,
    acceptedAt: absoluteMinutes(state.clock),
    crewIds: [],
    phaseRemaining: 0,
    phaseTotal: 0,
    financials: { diagnosticFee: 0, quoteAmount: tier.price, partsCost: 0, laborCost: 0, revenueCollected: 0 },
    log: [`Approved replacement from job ${origin.id}: ${tier.name}.`],
    originJobId: origin.id,
  };
  state.jobs[job.id] = job;
  return job;
}

/** Dispatches an install crew (installers and/or technicians) with a replacement-capable vehicle. */
export function dispatchInstall(state: GameState, jobId: string, crewIds: string[], vehicleId: string): ActionResult {
  const job = state.jobs[jobId];
  const vehicle = state.vehicles[vehicleId];
  if (!job || !vehicle) return { ok: false, reason: 'Unknown job or vehicle.' };
  if (job.kind !== 'replacement' || job.status !== 'accepted') return { ok: false, reason: 'This job is not waiting for an install crew.' };
  if (!VEHICLE_SPECS[vehicle.classId].canCarryReplacement) return { ok: false, reason: `${vehicle.nickname} cannot carry a full system.` };
  if (!vehicleAvailable(vehicle)) return { ok: false, reason: `${vehicle.nickname} is not available.` };
  const crew = crewIds.map((id) => state.employees[id]).filter(Boolean);
  if (crew.length === 0) return { ok: false, reason: 'Select at least one installer.' };
  if (crew.length > VEHICLE_SPECS[vehicle.classId].seats) return { ok: false, reason: `${vehicle.nickname} only seats ${VEHICLE_SPECS[vehicle.classId].seats}.` };
  if (!crew.some((e) => e.role === 'installer')) return { ok: false, reason: 'At least one installer is required.' };
  for (const e of crew) {
    if (!employeeAvailable(e)) return { ok: false, reason: `${e.name} is not available.` };
    if (e.role !== 'installer' && e.role !== 'technician') return { ok: false, reason: `${e.name} cannot work installs.` };
  }
  const tier = tierById(job.equipmentTierId ?? 'standard');
  if (state.finance.cash < tier.cost) return { ok: false, reason: `Equipment costs $${tier.cost.toLocaleString()} up front. Not enough cash.` };
  const customer = state.customers[job.customerId];
  const route = routeFromHqToLot(vehicle, customer.lotId);
  if (!route) return { ok: false, reason: 'No route to the customer.' };
  postTransaction(state, { amount: -tier.cost, category: 'parts', memo: `Equipment — ${tier.name} — ${customer.name}`, jobId: job.id });
  job.financials.partsCost = tier.cost;

  vehicle.route = route;
  vehicle.status = 'enroute';
  vehicle.jobId = job.id;
  vehicle.driverId = crew[0].id;
  vehicle.passengerIds = crew.slice(1).map((e) => e.id);
  job.technicianId = crew[0].id;
  job.crewIds = crew.slice(1).map((e) => e.id);
  job.vehicleId = vehicle.id;
  job.status = 'enroute';
  for (const e of crew) {
    e.status = 'driving';
    e.jobId = job.id;
    e.vehicleId = vehicle.id;
  }
  job.log.push(`Install crew (${crew.map((e) => e.name).join(', ')}) dispatched in ${vehicle.nickname}.`);
  pushEvent(state, { type: 'info', title: `Install crew en route`, body: `${vehicle.nickname} → ${customer.address}`, focus: { kind: 'vehicle', id: vehicle.id } });
  return { ok: true };
}

function completeInstall(state: GameState, job: Job): void {
  const customer = state.customers[job.customerId];
  const tier = tierById(job.equipmentTierId ?? 'standard');
  const crew = [job.technicianId, ...job.crewIds].filter((id): id is string => !!id).map((id) => state.employees[id]).filter(Boolean);
  if (customer.channel === 'direct') {
    postTransaction(state, { amount: tier.price, category: 'replacement-revenue', memo: `Replacement — ${tier.name} — ${customer.name}`, jobId: job.id });
    job.financials.revenueCollected += tier.price;
  } else {
    const amount = Math.round(tier.price * 0.8);
    job.financials.quoteAmount = amount;
    addReceivable(state, job, amount, 'Authorized replacement');
  }
  customer.equipment = { type: customer.equipment.type, brand: 'EGO Select', tonnage: customer.equipment.tonnage, ageYears: 0, refrigerant: tier.refrigerant, condition: 100, seer: tier.seer2 };
  job.status = 'completed';
  job.completedAt = absoluteMinutes(state.clock);
  job.log.push(`Installation complete. New ${tier.name} commissioned and verified.`);
  state.company.replacementsCompleted++;
  state.company.completedJobs++;
  state.stats.jobsCompleted++;
  for (const e of crew) {
    addFatigue(e, job.phaseTotal * 0.6);
    grantXp(state, e, 110);
    e.jobsCompleted++;
  }
  afterCompletion(state, job, 4.6);
  returnCrewToHq(state, job);
  pushEvent(state, { type: 'celebration', title: `Replacement installed: ${customer.name}`, body: `${tier.name} — $${tier.price.toLocaleString()} ${customer.channel === 'direct' ? 'collected' : 'billed'}`, focus: { kind: 'job', id: job.id } });
}

const WORKMANSHIP_NOTES: Partial<Record<string, string>> = {
  'micron-gauge': 'evacuation proven on the micron gauge',
  'vacuum-pump': 'deep vacuum on the pump',
  'charging-scale': 'charge weighed in to the nameplate',
  'nitrogen-kit': 'standing nitrogen test held',
};

function workmanshipNotes(state: GameState, job: Job): string[] {
  return jobTools(state, job).flatMap((d) => (d.quality ? [WORKMANSHIP_NOTES[d.id] ?? d.name] : []));
}

/** Tool capacity gates how often a tech can finish on the first visit; low capacity extends repair time (parts run). */
export function toolCapacityPenalty(vehicle: Vehicle): number {
  const cap = effectiveToolCapacity(vehicle);
  return cap >= 10 ? 1 : cap >= 8 ? 1.05 : cap >= 6 ? 1.12 : 1.25;
}

