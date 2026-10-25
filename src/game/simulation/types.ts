import type { Attributes } from '../employees/attributes';
import type { EmployeeRole } from '../employees/roles';
import type { PaintId, VehicleClass, VehicleUpgradeId } from '../fleet/vehicleCatalog';
import type { EquipmentType } from '../jobs/faults';
import type { HqUpgradeId } from '../progression/hqUpgrades';
import type { Vec2 } from '../world/geometry';
import type { RngState } from './rng';
import type { GameClock } from './time';

export const SAVE_SCHEMA_VERSION = 1;

export type CustomerChannel = 'warranty' | 'direct';

export interface Equipment {
  type: EquipmentType;
  brand: string;
  tonnage: number;
  ageYears: number;
  refrigerant: 'R-22' | 'R-410A' | 'R-454B';
  /** 0..100 */
  condition: number;
  seer: number;
}

export interface Customer {
  id: string;
  name: string;
  lotId: string;
  address: string;
  channel: CustomerChannel;
  equipment: Equipment;
  /** 0..100 trust in EGO HVAC. */
  trust: number;
  /** Job ids, most recent last. */
  history: string[];
  /** Home warranty company, when channel = warranty. */
  warrantyCompany?: string;
}

export type JobStatus =
  | 'lead'
  | 'accepted'
  | 'enroute'
  | 'arriving'
  | 'diagnosing'
  | 'awaiting-diagnosis'
  | 'quoted'
  | 'awaiting-authorization'
  | 'repairing'
  | 'awaiting-install'
  | 'installing'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'cancelled';

export interface Evidence {
  label: string;
  value: string;
  /** True when the technician read it correctly. Hidden from the player until job completion. */
  accurate: boolean;
}

export type JobKind = 'service' | 'callback' | 'replacement';

export interface JobFinancials {
  diagnosticFee: number;
  quoteAmount: number;
  partsCost: number;
  laborCost: number;
  revenueCollected: number;
  receivableId?: string;
}

export interface Job {
  id: string;
  kind: JobKind;
  customerId: string;
  status: JobStatus;
  complaint: string;
  /** Hidden ground truth. */
  faultId: string;
  /** Candidate diagnoses presented to the player (includes the true fault). */
  diagnosisOptions: string[];
  evidence: Evidence[];
  chosenDiagnosis?: string;
  diagnosisCorrect?: boolean;
  recommendation?: 'repair' | 'replace';
  equipmentTierId?: string;
  financed?: boolean;
  createdDay: number;
  createdMinute: number;
  /** Absolute game minute the lead expires if not accepted. */
  expiresAt: number;
  acceptedAt?: number;
  arrivedAt?: number;
  completedAt?: number;
  technicianId?: string;
  vehicleId?: string;
  crewIds: string[];
  /** Remaining minutes for the current timed phase. */
  phaseRemaining: number;
  phaseTotal: number;
  financials: JobFinancials;
  /** Narrative log lines shown in the inspector. */
  log: string[];
  /** Linked original job for callbacks. */
  originJobId?: string;
  reviewStars?: number;
}

export type EmployeeStatus = 'idle' | 'driving' | 'walking' | 'working' | 'training' | 'returning' | 'off-duty';

export interface Employee {
  id: string;
  name: string;
  role: EmployeeRole;
  isOwner: boolean;
  attributes: Attributes;
  xp: number;
  level: number;
  hourlyWage: number;
  morale: number;
  fatigue: number;
  certifications: string[];
  specialization?: string;
  status: EmployeeStatus;
  /** Current job id when assigned. */
  jobId?: string;
  vehicleId?: string;
  /** Training in progress. */
  training?: { programId: string; daysRemaining: number };
  hiredDay: number;
  jobsCompleted: number;
  /** Visual seed for character appearance. */
  look: number;
  /** World position when not inside a vehicle. */
  position: Vec2;
}

export interface Candidate {
  id: string;
  name: string;
  role: EmployeeRole;
  attributes: Attributes;
  hourlyWage: number;
  experienceYears: number;
  look: number;
  /** Day the candidate leaves the market. */
  availableUntilDay: number;
  summary: string;
}

export type VehicleStatus = 'parked' | 'enroute' | 'onsite' | 'returning' | 'maintenance';

export interface RouteState {
  waypoints: { x: number; z: number; onRoad: boolean }[];
  /** Distance travelled along the polyline. */
  progress: number;
  totalLength: number;
}

export interface Vehicle {
  id: string;
  classId: VehicleClass;
  nickname: string;
  isUsed: boolean;
  purchasePrice: number;
  purchaseDay: number;
  condition: number;
  mileage: number;
  reliability: number;
  upgrades: VehicleUpgradeId[];
  paint: PaintId;
  status: VehicleStatus;
  position: Vec2;
  heading: number;
  route?: RouteState;
  jobId?: string;
  driverId?: string;
  passengerIds: string[];
  /** Parking stall index at HQ. */
  stall: number;
  financing?: { loanId: string } | { leaseId: string };
}

export interface LedgerEntry {
  id: string;
  day: number;
  minute: number;
  amount: number;
  category:
    | 'service-revenue'
    | 'replacement-revenue'
    | 'warranty-collection'
    | 'payroll'
    | 'parts'
    | 'fuel'
    | 'vehicle-upkeep'
    | 'vehicle-purchase'
    | 'vehicle-sale'
    | 'vehicle-upgrade'
    | 'loan-payment'
    | 'lease-payment'
    | 'training'
    | 'marketing'
    | 'facility'
    | 'refund'
    | 'owner-draw'
    | 'opening-balance';
  memo: string;
  jobId?: string;
}

export interface Receivable {
  id: string;
  jobId: string;
  customerId: string;
  amount: number;
  issuedDay: number;
  dueDay: number;
  payer: string;
  status: 'open' | 'paid' | 'disputed';
}

export interface Loan {
  id: string;
  principal: number;
  balance: number;
  monthlyPayment: number;
  aprPercent: number;
  /** Day numbers on which payments post. */
  nextPaymentDay: number;
  purpose: string;
}

export interface Lease {
  id: string;
  monthlyPayment: number;
  nextPaymentDay: number;
  vehicleId: string;
}

export interface Review {
  id: string;
  day: number;
  customerName: string;
  stars: number;
  text: string;
}

export interface Competitor {
  id: string;
  name: string;
  reputation: number;
  priceLevel: number;
  marketingBudget: number;
  capacity: number;
  marketShare: number;
  color: string;
}

export interface MarketingState {
  /** Daily budgets. */
  localServicesAds: number;
  searchAds: number;
  neighborhoodFlyers: number;
  brandRecognition: number;
}

export interface MilestoneState {
  id: string;
  achievedDay?: number;
}

export interface FinanceState {
  cash: number;
  ledger: LedgerEntry[];
  receivables: Receivable[];
  loans: Loan[];
  leases: Lease[];
  /** Running totals for the current day (reset at midnight). */
  today: { revenue: number; expenses: number };
  /** Daily history for charts. */
  history: { day: number; cash: number; revenue: number; expenses: number }[];
}

export interface CompanyState {
  name: string;
  level: number;
  reputation: number;
  reviews: Review[];
  hqUpgrades: HqUpgradeId[];
  marketShare: number;
  diagnosticFee: number;
  /** Count of jobs completed by kind. */
  completedJobs: number;
  replacementsCompleted: number;
}

export interface GameEvent {
  id: number;
  day: number;
  minute: number;
  type: 'info' | 'success' | 'warning' | 'celebration' | 'money';
  title: string;
  body?: string;
  /** Linked entity for click-to-focus. */
  focus?: { kind: 'job' | 'vehicle' | 'employee' | 'lot'; id: string };
}

export interface GameState {
  schemaVersion: number;
  seed: number;
  rng: RngState;
  clock: GameClock;
  speed: 0 | 1 | 2 | 5;
  /** Cumulative game minutes simulated. */
  elapsedMinutes: number;
  nextId: number;
  company: CompanyState;
  finance: FinanceState;
  customers: Record<string, Customer>;
  jobs: Record<string, Job>;
  employees: Record<string, Employee>;
  candidates: Candidate[];
  vehicles: Record<string, Vehicle>;
  /** Used vehicles currently for sale. */
  usedListings: { id: string; classId: VehicleClass; price: number; condition: number; mileage: number }[];
  competitors: Competitor[];
  marketing: MarketingState;
  milestones: MilestoneState[];
  /** Leads scheduled to arrive later today. */
  leadSchedule: { day: number; minute: number; channel: CustomerChannel }[];
  /** Callbacks caused by incorrect diagnoses, fired on the scheduled day. */
  callbackSchedule: { day: number; minute: number; originJobId: string }[];
  events: GameEvent[];
  nextEventId: number;
  /** Stats used for campaign summary. */
  stats: {
    leadsReceived: number;
    leadsAccepted: number;
    leadsExpired: number;
    leadsLost: number;
    jobsCompleted: number;
    correctDiagnoses: number;
    incorrectDiagnoses: number;
    callbacks: number;
    trainingsCompleted: number;
    totalRevenue: number;
    totalExpenses: number;
    distanceDriven: number;
  };
  campaignComplete: boolean;
}
