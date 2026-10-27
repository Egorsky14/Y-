/**
 * HVAC fault catalog. Each fault describes the real-world problem, the symptoms the
 * customer reports, the measurements a technician gathers, and the correct repair.
 */
import type { MeasureKind, Procedure } from '../equipment/catalog';

export type EquipmentType = 'split-ac-gas-furnace' | 'heat-pump' | 'package-unit';

export interface EvidenceTemplate {
  /** Short label, e.g. "Capacitor reading". */
  label: string;
  /** What the reading measures; decides which tools sharpen it (equipment/catalog.ts). */
  measure: MeasureKind;
  /** Value shown when the technician measures accurately. */
  value: string;
  /** Alternative, misleading value shown when the measurement is botched. */
  noisyValue: string;
  /** How strongly this evidence points to the true fault (0..1). */
  weight: number;
}

export interface Fault {
  id: string;
  name: string;
  /** What the customer says on the phone. */
  complaint: string;
  /** Typical for which equipment types; empty = any. */
  equipment: EquipmentType[];
  evidence: EvidenceTemplate[];
  /** Faults that present similarly and are offered as alternative diagnoses. */
  lookalikes: string[];
  partsCost: number;
  laborMinutes: number;
  /** Steps of the repair; labor time splits evenly across them and tools shorten the steps they serve. */
  procedures: Procedure[];
  /** Retail repair price charged to direct customers. */
  repairPrice: number;
  /** Whether the fault often makes replacement the better recommendation on old equipment. */
  replacementCandidate: boolean;
  /** Minimum equipment age (years) before replacement becomes a sensible recommendation. */
  replacementAgeYears: number;
}

export const FAULTS: Fault[] = [
  {
    id: 'run-capacitor',
    name: 'Failed run capacitor',
    complaint: 'AC is humming outside but the fan isn’t spinning and the house is warm.',
    equipment: [],
    evidence: [
      { label: 'Capacitor', measure: 'electrical', value: '12.1 µF on a 45 µF rated cap (bulged top)', noisyValue: '44 µF, within spec', weight: 0.9 },
      { label: 'Compressor amps', measure: 'current', value: 'Locked-rotor amps on start, then trips', noisyValue: 'Normal start amps', weight: 0.5 },
      { label: 'Condenser fan', measure: 'visual', value: 'Fan spins freely by hand, no start', noisyValue: 'Fan stiff, bearing noise', weight: 0.4 },
    ],
    lookalikes: ['condenser-fan-motor', 'contactor'],
    partsCost: 38,
    laborMinutes: 35,
    procedures: ['electrical'],
    repairPrice: 289,
    replacementCandidate: false,
    replacementAgeYears: 99,
  },
  {
    id: 'condenser-fan-motor',
    name: 'Failed condenser fan motor',
    complaint: 'The outdoor unit is really loud and then shuts off. Air inside is barely cool.',
    equipment: [],
    evidence: [
      { label: 'Fan motor windings', measure: 'electrical', value: 'Open winding, 0 Ω across C-R', noisyValue: 'Windings read normal', weight: 0.9 },
      { label: 'Capacitor', measure: 'electrical', value: '5.0 µF, within spec', noisyValue: '2.1 µF, failed', weight: 0.4 },
      { label: 'High-side pressure', measure: 'pressure', value: '412 psi, high-pressure switch tripping', noisyValue: '240 psi normal', weight: 0.5 },
    ],
    lookalikes: ['run-capacitor', 'dirty-condenser'],
    partsCost: 165,
    laborMinutes: 70,
    procedures: ['electrical', 'mechanical'],
    repairPrice: 689,
    replacementCandidate: false,
    replacementAgeYears: 99,
  },
  {
    id: 'blower-motor',
    name: 'Blower motor failure',
    complaint: 'Nothing is coming out of the vents even though the thermostat is calling.',
    equipment: ['split-ac-gas-furnace', 'heat-pump'],
    evidence: [
      { label: 'Blower motor', measure: 'visual', value: 'Motor seized, thermal overload tripped, 0 CFM', noisyValue: 'Motor turns freely', weight: 0.9 },
      { label: 'Control board', measure: 'electrical', value: '120 V present at blower terminals', noisyValue: 'No voltage to blower', weight: 0.6 },
      { label: 'Filter', measure: 'visual', value: 'Filter moderately dirty', noisyValue: 'Filter clean', weight: 0.2 },
    ],
    lookalikes: ['control-board', 'restricted-airflow'],
    partsCost: 320,
    laborMinutes: 95,
    procedures: ['electrical', 'mechanical'],
    repairPrice: 1150,
    replacementCandidate: true,
    replacementAgeYears: 14,
  },
  {
    id: 'restricted-airflow',
    name: 'Restricted airflow / dirty evaporator coil',
    complaint: 'The AC runs all day but the house never gets below 80.',
    equipment: [],
    evidence: [
      { label: 'Static pressure', measure: 'airflow', value: '1.1" WC total external static (rated 0.5")', noisyValue: '0.45" WC normal', weight: 0.8 },
      { label: 'Evaporator coil', measure: 'visual', value: 'Coil matted with debris, 32 °F suction line, frost', noisyValue: 'Coil clean', weight: 0.8 },
      { label: 'Supply/return delta-T', measure: 'temperature', value: '9 °F delta-T (target 18–20)', noisyValue: '19 °F delta-T', weight: 0.5 },
    ],
    lookalikes: ['refrigerant-leak', 'blower-motor'],
    partsCost: 25,
    laborMinutes: 110,
    procedures: ['cleaning', 'airflow'],
    repairPrice: 495,
    replacementCandidate: false,
    replacementAgeYears: 99,
  },
  {
    id: 'refrigerant-leak',
    name: 'Refrigerant leak',
    complaint: 'It cooled fine last summer. Now it blows but it’s not cold.',
    equipment: [],
    evidence: [
      { label: 'Suction pressure', measure: 'pressure', value: '48 psi R-410A, superheat 38 °F', noisyValue: '118 psi, superheat 10 °F', weight: 0.9 },
      { label: 'Leak search', measure: 'leak', value: 'Electronic detector alarms at the evaporator U-bends', noisyValue: 'No leak found', weight: 0.8 },
      { label: 'Delta-T', measure: 'temperature', value: '8 °F', noisyValue: '18 °F', weight: 0.4 },
    ],
    lookalikes: ['restricted-airflow', 'compressor'],
    partsCost: 240,
    laborMinutes: 150,
    procedures: ['recovery', 'brazing', 'pressure-test', 'evacuation', 'charging'],
    repairPrice: 1390,
    replacementCandidate: true,
    replacementAgeYears: 12,
  },
  {
    id: 'contactor',
    name: 'Failed contactor',
    complaint: 'Indoor fan runs, outdoor unit is dead silent.',
    equipment: [],
    evidence: [
      { label: 'Contactor coil', measure: 'electrical', value: '24 V at coil, contacts pitted and not pulling in', noisyValue: 'Contactor pulls in normally', weight: 0.9 },
      { label: 'Line voltage', measure: 'electrical', value: '242 V at disconnect', noisyValue: '0 V at disconnect', weight: 0.4 },
      { label: 'Capacitor', measure: 'electrical', value: '44 µF within spec', noisyValue: '20 µF, weak', weight: 0.3 },
    ],
    lookalikes: ['run-capacitor', 'thermostat'],
    partsCost: 42,
    laborMinutes: 35,
    procedures: ['electrical'],
    repairPrice: 265,
    replacementCandidate: false,
    replacementAgeYears: 99,
  },
  {
    id: 'compressor',
    name: 'Compressor failure',
    complaint: 'There was a loud buzz, the breaker tripped, and now it won’t stay on.',
    equipment: [],
    evidence: [
      { label: 'Compressor windings', measure: 'electrical', value: 'Grounded winding, 0.3 MΩ to ground', noisyValue: 'Windings read balanced', weight: 0.95 },
      { label: 'Breaker', measure: 'current', value: 'Trips within 3 s of compressor call', noisyValue: 'Holds normally', weight: 0.6 },
      { label: 'Capacitor', measure: 'electrical', value: '45 µF within spec', noisyValue: '12 µF failed', weight: 0.3 },
    ],
    lookalikes: ['run-capacitor', 'contactor'],
    partsCost: 1850,
    laborMinutes: 300,
    procedures: ['electrical', 'recovery', 'brazing', 'pressure-test', 'evacuation', 'charging'],
    repairPrice: 3850,
    replacementCandidate: true,
    replacementAgeYears: 9,
  },
  {
    id: 'thermostat',
    name: 'Faulty thermostat',
    complaint: 'The thermostat screen is blank and the system won’t turn on.',
    equipment: [],
    evidence: [
      { label: 'Thermostat', measure: 'electrical', value: 'No 24 V at R terminal on stat, 24 V at the board — bad stat', noisyValue: '24 V present at stat', weight: 0.8 },
      { label: 'Control board', measure: 'electrical', value: 'Board status LED normal', noisyValue: 'Board fault code 33', weight: 0.5 },
      { label: 'Float switch', measure: 'visual', value: 'Closed, drain clear', noisyValue: 'Float switch open', weight: 0.3 },
    ],
    lookalikes: ['control-board', 'condensate-drain'],
    partsCost: 95,
    laborMinutes: 40,
    procedures: ['controls', 'electrical'],
    repairPrice: 349,
    replacementCandidate: false,
    replacementAgeYears: 99,
  },
  {
    id: 'condensate-drain',
    name: 'Condensate drainage problem',
    complaint: 'The AC shuts off randomly and there’s water near the furnace closet.',
    equipment: ['split-ac-gas-furnace', 'heat-pump'],
    evidence: [
      { label: 'Float switch', measure: 'visual', value: 'Float switch open, pan full of water', noisyValue: 'Float switch closed', weight: 0.9 },
      { label: 'Drain line', measure: 'visual', value: 'Primary drain blocked with biofilm', noisyValue: 'Drain flows freely', weight: 0.8 },
      { label: 'Thermostat', measure: 'electrical', value: 'Stat powers up, calls for cool', noisyValue: 'Stat blank', weight: 0.3 },
    ],
    lookalikes: ['thermostat', 'restricted-airflow'],
    partsCost: 18,
    laborMinutes: 45,
    procedures: ['cleaning'],
    repairPrice: 245,
    replacementCandidate: false,
    replacementAgeYears: 99,
  },
  {
    id: 'control-board',
    name: 'Control board failure',
    complaint: 'The system clicks, the lights flash, but nothing happens.',
    equipment: ['split-ac-gas-furnace', 'heat-pump'],
    evidence: [
      { label: 'Control board', measure: 'electrical', value: 'Burnt trace near blower relay, no output on G/Y', noisyValue: 'Board outputs normal', weight: 0.9 },
      { label: 'Transformer', measure: 'electrical', value: '26 V secondary, healthy', noisyValue: '0 V secondary', weight: 0.4 },
      { label: 'Blower motor', measure: 'visual', value: 'Motor runs when jumpered', noisyValue: 'Motor seized', weight: 0.5 },
    ],
    lookalikes: ['blower-motor', 'thermostat'],
    partsCost: 285,
    laborMinutes: 80,
    procedures: ['controls', 'electrical'],
    repairPrice: 890,
    replacementCandidate: true,
    replacementAgeYears: 15,
  },
  {
    id: 'dirty-condenser',
    name: 'Dirty condenser coil',
    complaint: 'The outdoor unit gets really hot and the AC struggles in the afternoon.',
    equipment: [],
    evidence: [
      { label: 'Condenser coil', measure: 'visual', value: 'Coil packed with cottonwood and dust, 38 °F approach', noisyValue: 'Coil clean, 12 °F approach', weight: 0.8 },
      { label: 'High-side pressure', measure: 'pressure', value: '398 psi, subcooling 22 °F', noisyValue: '245 psi normal', weight: 0.7 },
      { label: 'Fan motor', measure: 'current', value: 'Motor runs, amps 10% above rated', noisyValue: 'Motor open winding', weight: 0.3 },
    ],
    lookalikes: ['condenser-fan-motor', 'refrigerant-leak'],
    partsCost: 15,
    laborMinutes: 60,
    procedures: ['cleaning'],
    repairPrice: 325,
    replacementCandidate: false,
    replacementAgeYears: 99,
  },
  {
    id: 'ductwork',
    name: 'Ductwork disconnect / leakage',
    complaint: 'Two bedrooms get no air at all and the attic is freezing.',
    equipment: [],
    evidence: [
      { label: 'Duct inspection', measure: 'visual', value: 'Flex duct pulled off the plenum collar, cooling the attic', noisyValue: 'Ducts intact', weight: 0.9 },
      { label: 'Static pressure', measure: 'airflow', value: '0.3" WC total, unusually low', noisyValue: '0.5" WC normal', weight: 0.6 },
      { label: 'Register airflow', measure: 'airflow', value: '0 CFM at two bedrooms, 180 CFM elsewhere', noisyValue: 'Balanced airflow', weight: 0.7 },
    ],
    lookalikes: ['restricted-airflow', 'blower-motor'],
    partsCost: 60,
    laborMinutes: 90,
    procedures: ['mechanical', 'airflow'],
    repairPrice: 540,
    replacementCandidate: false,
    replacementAgeYears: 99,
  },
];

export function faultById(id: string): Fault {
  const f = FAULTS.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown fault ${id}`);
  return f;
}

/** Equipment tiers available for replacement sales. */
export interface EquipmentTier {
  id: string;
  name: string;
  seer2: number;
  refrigerant: 'R-410A' | 'R-454B';
  /** Wholesale equipment + materials cost. */
  cost: number;
  /** Installed retail price. */
  price: number;
  /** Installation labor in minutes with a two-person crew. */
  installMinutes: number;
  description: string;
}

export const EQUIPMENT_TIERS: EquipmentTier[] = [
  {
    id: 'standard',
    name: 'Standard Efficiency 14.3 SEER2',
    seer2: 14.3,
    refrigerant: 'R-454B',
    cost: 5200,
    price: 9800,
    installMinutes: 420,
    description: 'Single-stage R-454B system. Reliable, budget friendly.',
  },
  {
    id: 'comfort',
    name: 'Two-Stage 16 SEER2',
    seer2: 16,
    refrigerant: 'R-454B',
    cost: 7400,
    price: 13900,
    installMinutes: 450,
    description: 'Two-stage compressor, quieter, better humidity control.',
  },
  {
    id: 'inverter',
    name: 'Variable-Speed Inverter 18 SEER2',
    seer2: 18,
    refrigerant: 'R-454B',
    cost: 10400,
    price: 18900,
    installMinutes: 510,
    description: 'Inverter-driven, communicating controls, best efficiency and comfort.',
  },
];

export function tierById(id: string): EquipmentTier {
  const t = EQUIPMENT_TIERS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown equipment tier ${id}`);
  return t;
}
