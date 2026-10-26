import { createRng, nextInt } from './rng';
import { emptyBanking } from '../economy/banking/loans';
import type { Employee, GameState, Vehicle, Competitor } from './types';
import { SAVE_SCHEMA_VERSION } from './types';
import { generateCustomers } from '../customers/generate';
import { baseAttributes } from '../employees/candidates';
import { generateCandidate } from '../employees/candidates';
import { hqParkingStalls } from '../world/cityLayout';
import { postTransaction } from '../economy/ledger';
import { MILESTONE_DEFS } from '../progression/milestones';
import { scheduleLeadsForDay, spawnLead } from '../jobs/leads';
import { nameSeed } from '../customers/names';
import { WORKDAY_START } from './time';
import { refreshUsedListings } from '../fleet/fleet';

export interface NewGameOptions {
  seed?: number;
  companyName?: string;
  ownerName?: string;
  startingCash?: number;
  /** Spawn the tutorial lead immediately (vertical slice default). */
  immediateLead?: boolean;
}

export const BALANCE = {
  startingCash: 25000,
  diagnosticFee: 95,
  warrantyDiagnosticFee: 75,
  /** Warranty companies pay this share of retail repair price. */
  warrantyRepairRate: 0.65,
  warrantyNetDays: 35,
  ownerDailyDraw: 150,
  baseVehicleCapacity: 2,
  baseEmployeeCapacity: 4,
  leadLifetimeMinutes: 240,
  diagnosticBaseMinutes: 40,
  arrivalWalkMinutes: 1.5,
  minutesPerRealSecond: 1,
};

export function createNewGame(options: NewGameOptions = {}): GameState {
  const seed = options.seed ?? 20260101;
  const rng = createRng(seed);
  const ownerName = options.ownerName ?? 'Alex Ego';
  const customers = generateCustomers(rng);

  const owner: Employee = {
    id: 'emp-owner',
    name: ownerName,
    role: 'technician',
    isOwner: true,
    attributes: {
      ...baseAttributes(rng, 'technician', 0.6),
      technicalExpertise: 68,
      diagnosticAccuracy: 66,
      customerService: 62,
      salesAbility: 48,
      leadership: 60,
    },
    xp: 0,
    level: 1,
    hourlyWage: 0,
    morale: 80,
    fatigue: 0,
    certifications: ['EPA 608 Universal'],
    status: 'idle',
    hiredDay: 1,
    jobsCompleted: 0,
    look: nameSeed(ownerName),
    position: { x: 44, z: 34 },
  };

  const stalls = hqParkingStalls(8);
  const van: Vehicle = {
    id: 'veh-1',
    classId: 'compact-van',
    nickname: 'Unit 1',
    isUsed: true,
    purchasePrice: 15800,
    purchaseDay: 1,
    condition: 78,
    mileage: 64200,
    reliability: 82,
    upgrades: ['full-wrap', 'ladder-rack'],
    paint: 'ego-black',
    status: 'parked',
    position: { ...stalls[0].pos },
    heading: stalls[0].heading,
    passengerIds: [],
    stall: 0,
  };

  const competitors: Competitor[] = [
    { id: 'comp-desert-chill', name: 'Desert Chill Air', reputation: 4.1, priceLevel: 0.95, marketingBudget: 900, capacity: 12, marketShare: 0.38, color: '#2e6fd8' },
    { id: 'comp-sunbelt', name: 'Sunbelt Comfort Pros', reputation: 3.6, priceLevel: 0.85, marketingBudget: 1400, capacity: 18, marketShare: 0.34, color: '#e0862e' },
    { id: 'comp-redrock', name: 'Red Rock Mechanical', reputation: 4.5, priceLevel: 1.15, marketingBudget: 500, capacity: 6, marketShare: 0.22, color: '#c43b3b' },
  ];

  const state: GameState = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    seed,
    rng,
    clock: { day: 1, minute: WORKDAY_START + 30 },
    speed: 1,
    elapsedMinutes: 0,
    nextId: 1,
    company: {
      name: options.companyName ?? 'EGO HVAC Services LLC',
      level: 1,
      reputation: 4.2,
      reviews: [
        { id: 'rv-seed-1', day: 0, customerName: 'Previous customer', stars: 5, text: 'Found the actual problem instead of guessing. Measured everything.' },
        { id: 'rv-seed-2', day: 0, customerName: 'Previous customer', stars: 4, text: 'Showed up on time and explained the readings.' },
        { id: 'rv-seed-3', day: 0, customerName: 'Previous customer', stars: 4, text: 'Fair price, honest tech.' },
      ],
      hqUpgrades: [],
      marketShare: 0.06,
      diagnosticFee: BALANCE.diagnosticFee,
      completedJobs: 0,
      replacementsCompleted: 0,
    },
    finance: {
      cash: 0,
      ledger: [],
      receivables: [],
      loans: [],
      leases: [],
      banking: emptyBanking(),
      today: { revenue: 0, expenses: 0 },
      history: [],
    },
    customers,
    jobs: {},
    employees: { [owner.id]: owner },
    candidates: [],
    vehicles: { [van.id]: van },
    usedListings: [],
    competitors,
    marketing: { localServicesAds: 0, searchAds: 0, neighborhoodFlyers: 0, brandRecognition: 8 },
    milestones: MILESTONE_DEFS.map((m) => ({ id: m.id })),
    leadSchedule: [],
    callbackSchedule: [],
    events: [],
    nextEventId: 1,
    stats: {
      leadsReceived: 0,
      leadsAccepted: 0,
      leadsExpired: 0,
      leadsLost: 0,
      jobsCompleted: 0,
      correctDiagnoses: 0,
      incorrectDiagnoses: 0,
      callbacks: 0,
      trainingsCompleted: 0,
      totalRevenue: 0,
      totalExpenses: 0,
      distanceDriven: 0,
    },
    campaignComplete: false,
  };

  postTransaction(state, { amount: options.startingCash ?? BALANCE.startingCash, category: 'opening-balance', memo: 'Owner capital contribution' });
  // Opening balance is capital, not revenue.
  state.stats.totalRevenue = 0;
  state.finance.today.revenue = 0;

  // Hiring market and used-vehicle market.
  const roles = ['technician', 'technician', 'installer', 'dispatcher', 'comfort-advisor'] as const;
  roles.forEach((role, i) => state.candidates.push(generateCandidate(rng, role, 1, `cand-${i + 1}`)));
  refreshUsedListings(state);

  // Today's remaining leads plus the tutorial lead.
  scheduleLeadsForDay(state, { minMinute: state.clock.minute + 45 });
  if (options.immediateLead !== false) {
    spawnLead(state, { channel: 'direct', preferredLotId: 'c-n-4', faultId: 'run-capacitor' });
  }
  // Add a few more to make the schedule interesting on day 1.
  state.leadSchedule.push({ day: 1, minute: state.clock.minute + nextInt(rng, 40, 90), channel: 'warranty' });
  state.leadSchedule.sort((a, b) => a.minute - b.minute);

  state.events.push({
    id: state.nextEventId++,
    day: 1,
    minute: state.clock.minute,
    type: 'info',
    title: 'Welcome to EGO HVAC',
    body: 'Most HVAC companies guess. We measure. Accept the first service call and dispatch Unit 1.',
  });
  return state;
}
