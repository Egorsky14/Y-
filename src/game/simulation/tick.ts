import type { GameState, Vehicle } from './types';
import { processBankingDay } from '../economy/banking/banking';
import { MINUTES_PER_DAY, CAMPAIGN_DAYS } from './time';
import { advanceJobPhase, isActiveJob, onVehicleArrived, parkVehicle } from '../jobs/workflow';
import { expireLeads, processLeadSchedule, scheduleLeadsForDay, spawnLead } from '../jobs/leads';
import { sampleRoute, vehicleSpeed, refreshUsedListings } from '../fleet/fleet';
import { VEHICLE_SPECS } from '../fleet/vehicleCatalog';
import { postTransaction } from '../economy/ledger';
import { pushEvent } from './events';
import { progressTraining, refreshCandidates } from '../employees/hr';
import { releaseTools } from '../equipment/inventory';
import { runOperations } from '../operations/automation';
import { runDailyMarketing, updateCompetition } from '../marketing/marketing';
import { checkMilestones } from '../progression/milestones';
import { chance, nextInt } from './rng';
import { BALANCE } from './newGame';

/** Maximum simulated minutes per sub-step; keeps movement and phase logic stable at 5x. */
const MAX_STEP = 0.5;

/**
 * Advances the simulation by `minutes` of game time. Pure function of state; the caller
 * decides how real time maps to game minutes (speed multiplier, pause).
 */
export function advance(state: GameState, minutes: number): void {
  if (state.campaignComplete) return;
  let remaining = minutes;
  while (remaining > 1e-9) {
    const dt = Math.min(MAX_STEP, remaining);
    step(state, dt);
    remaining -= dt;
  }
}

function step(state: GameState, dt: number): void {
  state.clock.minute += dt;
  state.elapsedMinutes += dt;

  for (const vehicle of Object.values(state.vehicles)) moveVehicle(state, vehicle, dt);
  for (const job of Object.values(state.jobs)) if (isActiveJob(job)) advanceJobPhase(state, job, dt);
  // Operations Center: act on findings and quotes in the same step they appear.
  runOperations(state);

  processLeadSchedule(state);
  processCallbacks(state);
  expireLeads(state);

  if (state.clock.minute >= MINUTES_PER_DAY) {
    state.clock.minute -= MINUTES_PER_DAY;
    endOfDay(state);
  }
  checkMilestones(state);
}

function moveVehicle(state: GameState, vehicle: Vehicle, dt: number): void {
  if (!vehicle.route || (vehicle.status !== 'enroute' && vehicle.status !== 'returning')) return;
  const speed = vehicleSpeed(vehicle);
  const distance = speed * dt;
  vehicle.route.progress = Math.min(vehicle.route.totalLength, vehicle.route.progress + distance);
  vehicle.mileage += distance * 0.0006; // world units → "miles" for the odometer
  state.stats.distanceDriven += distance;
  const fuel = VEHICLE_SPECS[vehicle.classId].fuelPerUnit * distance;
  // Fuel is accrued and posted at end of day to keep the ledger readable.
  (vehicle as Vehicle & { fuelAccrued?: number }).fuelAccrued = ((vehicle as Vehicle & { fuelAccrued?: number }).fuelAccrued ?? 0) + fuel;
  const sample = sampleRoute(vehicle.route, vehicle.route.progress);
  vehicle.position = { x: sample.x, z: sample.z };
  vehicle.heading = sample.heading;
  if (vehicle.route.progress >= vehicle.route.totalLength - 1e-6) {
    if (vehicle.status === 'enroute') onVehicleArrived(state, vehicle);
    else parkVehicle(state, vehicle);
  }
}

function processCallbacks(state: GameState): void {
  const due = state.callbackSchedule.filter((c) => c.day < state.clock.day || (c.day === state.clock.day && c.minute <= state.clock.minute));
  if (due.length === 0) return;
  state.callbackSchedule = state.callbackSchedule.filter((c) => !due.includes(c));
  for (const cb of due) {
    const origin = state.jobs[cb.originJobId];
    if (!origin) continue;
    const customer = state.customers[origin.customerId];
    const job = spawnLead(state, { preferredLotId: customer.lotId, faultId: origin.faultId, kind: 'callback', originJobId: origin.id });
    if (job) {
      state.stats.callbacks++;
      customer.trust = Math.max(0, customer.trust - 10);
      state.company.reviews.push({ id: `rv-${state.nextId++}`, day: state.clock.day, customerName: customer.name, stars: 2, text: 'Had to call them back out. The first fix didn’t hold.' });
    }
  }
}

function endOfDay(state: GameState): void {
  const day = state.clock.day;
  // Payroll: everyone but the owner is paid for an 8-hour day; the owner takes a draw.
  for (const e of Object.values(state.employees)) {
    if (e.isOwner) continue;
    const overtime = e.fatigue > 70 ? 1.25 : 1;
    postTransaction(state, { amount: -Math.round(e.hourlyWage * 8 * overtime), category: 'payroll', memo: `Wages — ${e.name}` });
  }
  postTransaction(state, { amount: -BALANCE.ownerDailyDraw, category: 'owner-draw', memo: 'Owner draw' });

  // Fleet costs
  const upkeepMult = state.company.hqUpgrades.includes('fleet-maintenance') ? 0.7 : 1;
  for (const v of Object.values(state.vehicles)) {
    const spec = VEHICLE_SPECS[v.classId];
    postTransaction(state, { amount: -Math.round(spec.upkeepPerDay * upkeepMult), category: 'vehicle-upkeep', memo: `Upkeep — ${v.nickname}` });
    const fuel = (v as Vehicle & { fuelAccrued?: number }).fuelAccrued ?? 0;
    if (fuel > 0.5) postTransaction(state, { amount: -Math.round(fuel), category: 'fuel', memo: `Fuel — ${v.nickname}` });
    (v as Vehicle & { fuelAccrued?: number }).fuelAccrued = 0;
    v.condition = Math.max(10, v.condition - 0.12 * (state.company.hqUpgrades.includes('fleet-maintenance') ? 0.5 : 1));
  }

  // Leases (loans and the credit line settle at the end of the day, after collections)
  for (const lease of state.finance.leases) {
    if (day >= lease.nextPaymentDay) {
      const v = state.vehicles[lease.vehicleId];
      postTransaction(state, { amount: -lease.monthlyPayment, category: 'lease-payment', memo: `Lease — ${v?.nickname ?? lease.vehicleId}` });
      lease.nextPaymentDay += 30;
    }
  }

  // Receivables: warranty companies pay late sometimes.
  for (const r of state.finance.receivables) {
    if (r.status !== 'open' || day < r.dueDay) continue;
    if (chance(state.rng, 0.82)) {
      r.status = 'paid';
      postTransaction(state, { amount: r.amount, category: 'warranty-collection', memo: `Collected from ${r.payer}`, jobId: r.jobId });
      pushEvent(state, { type: 'money', title: `${r.payer} paid $${r.amount.toLocaleString()}` });
    } else {
      r.dueDay += nextInt(state.rng, 7, 14);
    }
  }

  runDailyMarketing(state);
  updateCompetition(state);
  progressTraining(state);
  // Banking: installments, credit-line interest and statements, delinquency, credit rating.
  processBankingDay(state);

  // Rest, morale, turnover
  for (const e of Object.values(state.employees)) {
    e.fatigue = Math.max(0, e.fatigue - 40);
    if (e.status === 'off-duty') e.status = 'idle';
    const overworked = e.jobsCompleted > 0 && e.fatigue > 50;
    e.morale = Math.max(0, Math.min(100, e.morale + (overworked ? -2 - (100 - e.attributes.stressTolerance) / 50 : 0.6)));
    if (!e.isOwner && e.morale < 20 && chance(state.rng, 0.15) && e.status === 'idle') {
      pushEvent(state, { type: 'warning', title: `${e.name} quit`, body: 'Low morale from overwork. Watch fatigue and give raises.' });
      releaseTools(state, { kind: 'employee', id: e.id }, `${e.name} quit`);
      delete state.employees[e.id];
    }
  }

  // Expire any leftover leads, record history, roll the day.
  for (const job of Object.values(state.jobs)) {
    if (job.status === 'lead') {
      job.status = 'expired';
      state.stats.leadsExpired++;
    }
  }
  state.finance.history.push({ day, cash: state.finance.cash, revenue: state.finance.today.revenue, expenses: state.finance.today.expenses });
  state.finance.today = { revenue: 0, expenses: 0 };
  state.clock.day += 1;

  if (state.clock.day > CAMPAIGN_DAYS) {
    state.campaignComplete = true;
    state.speed = 0;
    pushEvent(state, { type: 'celebration', title: 'The First 90 Days are complete', body: 'Review your campaign summary.' });
    return;
  }

  refreshCandidates(state);
  if (day % 3 === 0) refreshUsedListings(state);
  scheduleLeadsForDay(state);
  if (state.clock.day === 2) {
    pushEvent(state, { type: 'info', title: 'Day 2', body: 'Leads arrive during working hours. Hire a dispatcher so none are missed.' });
  }
}
