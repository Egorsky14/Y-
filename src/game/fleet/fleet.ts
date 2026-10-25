import { VEHICLE_SPECS, type VehicleClass, type VehicleUpgradeId, upgradeById, type PaintId } from './vehicleCatalog';
import type { GameState, Vehicle, RouteState } from '../simulation/types';
import { nextInt, nextRange, pick } from '../simulation/rng';
import { HQ_APRON, hqParkingStalls, lotById } from '../world/cityLayout';
import { curbNodeId, getRoadGraph } from '../world/roadGraph';
import { findPath, pathToWaypoints, routeLength, type RouteWaypoint } from '../world/pathfinding';
import { LANE_OFFSET } from '../world/cityLayout';
import { postTransaction } from '../economy/ledger';
import { pushEvent } from '../simulation/events';
import { BALANCE } from '../simulation/newGame';

export function vehicleCapacity(state: GameState): number {
  let cap = BALANCE.baseVehicleCapacity;
  if (state.company.hqUpgrades.includes('expanded-garage')) cap += 2;
  if (state.company.hqUpgrades.includes('additional-parking')) cap += 4;
  return cap;
}

export function employeeCapacity(state: GameState): number {
  let cap = BALANCE.baseEmployeeCapacity;
  if (state.company.hqUpgrades.includes('additional-parking')) cap += 4;
  if (state.company.hqUpgrades.includes('dispatch-center')) cap += 2;
  if (state.company.hqUpgrades.includes('sales-office')) cap += 2;
  return cap;
}

export function refreshUsedListings(state: GameState): void {
  const classes: VehicleClass[] = ['compact-van', 'full-size-van', 'pickup', 'box-truck'];
  state.usedListings = state.usedListings.filter(() => nextRange(state.rng, 0, 1) > 0.35);
  while (state.usedListings.length < 4) {
    const classId = pick(state.rng, classes);
    const spec = VEHICLE_SPECS[classId];
    const condition = nextInt(state.rng, 55, 92);
    const mileage = nextInt(state.rng, 38000, 142000);
    const price = Math.round((spec.priceUsed * (0.75 + (condition / 100) * 0.45)) / 100) * 100;
    state.usedListings.push({ id: `used-${state.nextId++}`, classId, price, condition, mileage });
  }
}

export function freeStall(state: GameState): number {
  const used = new Set(Object.values(state.vehicles).map((v) => v.stall));
  for (let i = 0; i < 16; i++) if (!used.has(i)) return i;
  return 0;
}

export type FinancingChoice = 'cash' | 'loan' | 'lease';

export function monthlyLoanPayment(principal: number, aprPercent: number, months: number): number {
  const r = aprPercent / 100 / 12;
  return Math.round(((principal * r) / (1 - Math.pow(1 + r, -months))) * 100) / 100;
}

export interface PurchaseRequest {
  classId: VehicleClass;
  /** Used listing id, or undefined for new. */
  listingId?: string;
  financing: FinancingChoice;
  nickname?: string;
  paint?: PaintId;
}

export function purchaseVehicle(state: GameState, req: PurchaseRequest): { ok: true; vehicle: Vehicle } | { ok: false; reason: string } {
  if (Object.keys(state.vehicles).length >= vehicleCapacity(state)) return { ok: false, reason: 'No parking capacity at headquarters. Upgrade the garage or parking.' };
  const spec = VEHICLE_SPECS[req.classId];
  let price = spec.priceNew;
  let condition = 100;
  let mileage = nextInt(state.rng, 8, 40);
  let isUsed = false;
  if (req.listingId) {
    const listing = state.usedListings.find((l) => l.id === req.listingId);
    if (!listing) return { ok: false, reason: 'That listing has already sold.' };
    price = listing.price;
    condition = listing.condition;
    mileage = listing.mileage;
    isUsed = true;
  }
  const id = `veh-${state.nextId++}`;
  const stall = freeStall(state);
  const stalls = hqParkingStalls(16);
  const vehicle: Vehicle = {
    id,
    classId: req.classId,
    nickname: req.nickname ?? `Unit ${Object.keys(state.vehicles).length + 1}`,
    isUsed,
    purchasePrice: price,
    purchaseDay: state.clock.day,
    condition,
    mileage,
    reliability: Math.round(55 + condition * 0.4),
    upgrades: [],
    paint: req.paint ?? 'ego-black',
    status: 'parked',
    position: { ...stalls[stall].pos },
    heading: stalls[stall].heading,
    passengerIds: [],
    stall,
  };

  if (req.financing === 'cash') {
    if (state.finance.cash < price) return { ok: false, reason: 'Not enough cash for an outright purchase.' };
    postTransaction(state, { amount: -price, category: 'vehicle-purchase', memo: `${spec.name} (${isUsed ? 'used' : 'new'})` });
  } else if (req.financing === 'loan') {
    const down = Math.round(price * 0.15);
    if (state.finance.cash < down) return { ok: false, reason: `Need $${down.toLocaleString()} for the 15% down payment.` };
    postTransaction(state, { amount: -down, category: 'vehicle-purchase', memo: `${spec.name} down payment` });
    const principal = price - down;
    const loanId = `loan-${state.nextId++}`;
    state.finance.loans.push({
      id: loanId,
      principal,
      balance: principal,
      monthlyPayment: monthlyLoanPayment(principal, 8.9, 60),
      aprPercent: 8.9,
      nextPaymentDay: state.clock.day + 30,
      purpose: `${spec.name} ${vehicle.nickname}`,
    });
    vehicle.financing = { loanId };
  } else {
    if (isUsed) return { ok: false, reason: 'Leases are only available on new vehicles.' };
    const monthly = Math.round(price * 0.021);
    if (state.finance.cash < monthly) return { ok: false, reason: 'Not enough cash for the first lease payment.' };
    postTransaction(state, { amount: -monthly, category: 'lease-payment', memo: `${spec.name} first lease payment` });
    const leaseId = `lease-${state.nextId++}`;
    state.finance.leases.push({ id: leaseId, monthlyPayment: monthly, nextPaymentDay: state.clock.day + 30, vehicleId: id });
    vehicle.financing = { leaseId };
  }
  if (req.listingId) state.usedListings = state.usedListings.filter((l) => l.id !== req.listingId);
  state.vehicles[id] = vehicle;
  pushEvent(state, { type: 'success', title: `${spec.name} added to the fleet`, body: `${vehicle.nickname} is parked at headquarters.`, focus: { kind: 'vehicle', id } });
  return { ok: true, vehicle };
}

export function resaleValue(state: GameState, vehicle: Vehicle): number {
  const spec = VEHICLE_SPECS[vehicle.classId];
  const yearsOwned = (state.clock.day - vehicle.purchaseDay) / 365;
  const slower = state.company.hqUpgrades.includes('expanded-garage') ? 0.8 : 1;
  const base = vehicle.purchasePrice * Math.max(0.3, 1 - spec.depreciation * slower * yearsOwned - 0.08);
  const upgradesValue = vehicle.upgrades.reduce((s, u) => s + upgradeById(u).cost * 0.3, 0);
  return Math.round((base * (0.6 + (vehicle.condition / 100) * 0.4) + upgradesValue) / 50) * 50;
}

export function sellVehicle(state: GameState, vehicleId: string): { ok: boolean; reason?: string } {
  const vehicle = state.vehicles[vehicleId];
  if (!vehicle) return { ok: false, reason: 'Unknown vehicle.' };
  if (vehicle.status !== 'parked') return { ok: false, reason: 'Vehicle must be parked at headquarters to sell.' };
  if (Object.keys(state.vehicles).length <= 1) return { ok: false, reason: 'You cannot sell your only vehicle.' };
  if (vehicle.financing && 'leaseId' in vehicle.financing) return { ok: false, reason: 'Leased vehicles are returned, not sold. (Lease buyout not available yet.)' };
  const proceeds = resaleValue(state, vehicle);
  postTransaction(state, { amount: proceeds, category: 'vehicle-sale', memo: `Sold ${vehicle.nickname}` });
  if (vehicle.financing && 'loanId' in vehicle.financing) {
    const loanId = vehicle.financing.loanId;
    const loan = state.finance.loans.find((l) => l.id === loanId);
    if (loan) {
      postTransaction(state, { amount: -loan.balance, category: 'loan-payment', memo: `Loan payoff for ${vehicle.nickname}` });
      state.finance.loans = state.finance.loans.filter((l) => l.id !== loan.id);
    }
  }
  for (const e of Object.values(state.employees)) if (e.vehicleId === vehicleId) e.vehicleId = undefined;
  delete state.vehicles[vehicleId];
  pushEvent(state, { type: 'money', title: `Sold ${vehicle.nickname} for $${proceeds.toLocaleString()}` });
  return { ok: true };
}

export function installUpgrade(state: GameState, vehicleId: string, upgradeId: VehicleUpgradeId): { ok: boolean; reason?: string } {
  const vehicle = state.vehicles[vehicleId];
  if (!vehicle) return { ok: false, reason: 'Unknown vehicle.' };
  if (vehicle.status !== 'parked') return { ok: false, reason: 'Vehicle must be at headquarters.' };
  if (vehicle.upgrades.includes(upgradeId)) return { ok: false, reason: 'Already installed.' };
  const upgrade = upgradeById(upgradeId);
  const spec = VEHICLE_SPECS[vehicle.classId];
  if (upgradeId === 'liftgate' && !spec.liftgateCompatible) return { ok: false, reason: 'Liftgates fit box trucks only.' };
  if (upgradeId === 'full-wrap' && vehicle.upgrades.includes('basic-decals')) vehicle.upgrades = vehicle.upgrades.filter((u) => u !== 'basic-decals');
  if (upgradeId === 'basic-decals' && vehicle.upgrades.includes('full-wrap')) return { ok: false, reason: 'This vehicle already has a full wrap.' };
  if (state.finance.cash < upgrade.cost) return { ok: false, reason: 'Not enough cash.' };
  postTransaction(state, { amount: -upgrade.cost, category: 'vehicle-upgrade', memo: `${upgrade.name} on ${vehicle.nickname}` });
  vehicle.upgrades.push(upgradeId);
  return { ok: true };
}

export function effectiveToolCapacity(vehicle: Vehicle): number {
  let cap = VEHICLE_SPECS[vehicle.classId].toolCapacity;
  if (vehicle.upgrades.includes('shelving')) cap += 2;
  if (vehicle.upgrades.includes('tool-storage')) cap += 2;
  return cap;
}

export function effectiveCargo(vehicle: Vehicle): number {
  const base = VEHICLE_SPECS[vehicle.classId].cargoCapacity;
  return vehicle.upgrades.includes('cargo-upgrade') ? Math.round(base * 1.25) : base;
}

export function vehicleSpeed(vehicle: Vehicle): number {
  const spec = VEHICLE_SPECS[vehicle.classId];
  return spec.speed * (0.85 + (vehicle.condition / 100) * 0.15);
}

// ---- Routing -------------------------------------------------------------------

/** Route from the vehicle's HQ stall to a lot's curb. */
export function routeFromHqToLot(vehicle: Vehicle, lotId: string): RouteState | null {
  const graph = getRoadGraph();
  const path = findPath(graph, curbNodeId('hq'), curbNodeId(lotId));
  if (!path) return null;
  const waypoints: RouteWaypoint[] = [{ pos: { ...vehicle.position }, onRoad: false }, { pos: { ...HQ_APRON }, onRoad: false }, ...pathToWaypoints(graph, path)];
  return { waypoints: waypoints.map((w) => ({ x: w.pos.x, z: w.pos.z, onRoad: w.onRoad })), progress: 0, totalLength: routeLength(waypoints) };
}

/** Route from a lot's curb back to the vehicle's HQ stall. */
export function routeFromLotToHq(vehicle: Vehicle, lotId: string): RouteState | null {
  const graph = getRoadGraph();
  const path = findPath(graph, curbNodeId(lotId), curbNodeId('hq'));
  if (!path) return null;
  const stall = hqParkingStalls(16)[vehicle.stall];
  const waypoints: RouteWaypoint[] = [...pathToWaypoints(graph, path), { pos: { ...HQ_APRON }, onRoad: false }, { pos: { ...stall.pos }, onRoad: false }];
  return { waypoints: waypoints.map((w) => ({ x: w.pos.x, z: w.pos.z, onRoad: w.onRoad })), progress: 0, totalLength: routeLength(waypoints) };
}

/** Route between two lots (job to job). */
export function routeLotToLot(fromLotId: string, toLotId: string): RouteState | null {
  const graph = getRoadGraph();
  const path = findPath(graph, curbNodeId(fromLotId), curbNodeId(toLotId));
  if (!path) return null;
  const waypoints = pathToWaypoints(graph, path);
  return { waypoints: waypoints.map((w) => ({ x: w.pos.x, z: w.pos.z, onRoad: w.onRoad })), progress: 0, totalLength: routeLength(waypoints) };
}

/** Position and heading along a route at the given progress, applying right-lane offset on road legs. */
export function sampleRoute(route: RouteState, progress: number): { x: number; z: number; heading: number } {
  const wps = route.waypoints;
  if (wps.length === 0) return { x: 0, z: 0, heading: 0 };
  if (wps.length === 1) return { x: wps[0].x, z: wps[0].z, heading: 0 };
  let remaining = Math.max(0, Math.min(progress, route.totalLength));
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1];
    const b = wps[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (remaining <= len || i === wps.length - 1) {
      const t = len > 0 ? Math.min(1, remaining / len) : 1;
      const nx = len > 0 ? dx / len : 0;
      const nz = len > 0 ? dz / len : 1;
      // Right-hand lane offset: right = (-nz, nx)
      const off = b.onRoad && a.onRoad ? LANE_OFFSET : b.onRoad || a.onRoad ? LANE_OFFSET * t : 0;
      return { x: a.x + dx * t - nz * off, z: a.z + dz * t + nx * off, heading: Math.atan2(nx, nz) };
    }
    remaining -= len;
  }
  const last = wps[wps.length - 1];
  return { x: last.x, z: last.z, heading: 0 };
}

export function etaMinutes(vehicle: Vehicle): number {
  if (!vehicle.route) return 0;
  return (vehicle.route.totalLength - vehicle.route.progress) / vehicleSpeed(vehicle);
}

export function lotCurbPosition(lotId: string): { x: number; z: number } {
  const lot = lotById(lotId)!;
  return lot.curb;
}
