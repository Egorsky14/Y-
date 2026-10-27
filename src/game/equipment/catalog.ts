/**
 * Pro Supply Depot catalog. Every tool is data: its price, tier, where it is carried and what it
 * does. The effect fields map onto mechanics the simulation already has (see performance.ts):
 *
 * - `read`: per measurement kind, the share of the gap between the technician's own read accuracy
 *   and the ceiling (READ_CEILING) that the tool closes. A skilled technician with a tool stays
 *   ahead of a novice with the same tool, and nobody reaches 100%.
 * - `diag`: per measurement kind, the share of that measurement's time the tool saves.
 * - `work`: per repair procedure ('general' = every procedure), the share of that procedure's time
 *   the tool saves.
 * - `quality`: per refrigerant-circuit procedure, the share of the workmanship gap the tool closes
 *   (evacuation depth, weighed-in charge, a verified pressure test).
 *
 * Several tools covering the same thing combine with diminishing returns: 1 − Π(1 − e).
 */

/** What a diagnostic measurement reads (see EvidenceTemplate.measure in jobs/faults.ts). */
export type MeasureKind = 'electrical' | 'current' | 'pressure' | 'leak' | 'airflow' | 'temperature' | 'visual';

/** Steps of a repair (see Fault.procedures in jobs/faults.ts). Labor time splits evenly across them. */
export type Procedure = 'electrical' | 'mechanical' | 'controls' | 'cleaning' | 'airflow' | 'recovery' | 'brazing' | 'pressure-test' | 'evacuation' | 'charging';

/** Procedures whose workmanship is scored (an evacuation, charge or pressure test done well or not). */
export const QUALITY_PROCEDURES = ['pressure-test', 'evacuation', 'charging'] as const;
export type QualityProcedure = (typeof QUALITY_PROCEDURES)[number];

export type ToolId =
  | 'hand-tools'
  | 'multimeter'
  | 'clamp-meter'
  | 'digital-manifold'
  | 'leak-detector'
  | 'manometer'
  | 'charging-scale'
  | 'micron-gauge'
  | 'vacuum-pump'
  | 'recovery-machine'
  | 'nitrogen-kit'
  | 'thermal-camera';

export type ToolTier = 'basic' | 'professional' | 'advanced';
export type ToolCategory = 'hand' | 'electrical' | 'refrigerant' | 'airflow' | 'evacuation' | 'inspection';

export interface ToolDef {
  id: ToolId;
  name: string;
  category: ToolCategory;
  tier: ToolTier;
  price: number;
  description: string;
  /** Portable tools go with a technician (or ride in a van as shared stock); vehicle tools ride in a van only. */
  mount: 'technician' | 'vehicle';
  /** Equipment-rack space taken in a vehicle (the rack holds effectiveToolCapacity units). */
  bulk: number;
  /** Expensed small tools are a cost when bought; capital tools are assets depreciated over lifeDays. */
  accounting: 'expense' | 'capital';
  lifeDays: number;
  read?: Partial<Record<MeasureKind, number>>;
  diag?: Partial<Record<MeasureKind, number>>;
  work?: Partial<Record<Procedure | 'general', number>>;
  quality?: Partial<Record<QualityProcedure, number>>;
  /** Plain-language summary of where it helps (shown in the store). */
  helpsWith: string;
}

/** No reading is ever certain: tools close the gap toward this ceiling. */
export const READ_CEILING = 0.97;
/** A purchase at or above this price is a capital asset; below it, a tool expense. */
export const CAPITALIZATION_THRESHOLD = 1000;
/** Upper bounds on tool help, however many tools stack. */
export const MAX_DIAG_SAVING = 0.35;
export const MAX_PROCEDURE_SAVING = 0.55;
/** Share of book value paid when surplus equipment is sold back. */
export const RESALE_RATE = 0.4;

export const TOOLS: ToolDef[] = [
  {
    id: 'hand-tools',
    name: 'Professional hand tool set',
    category: 'hand',
    tier: 'basic',
    price: 450,
    description: 'Insulated screwdrivers, nut drivers, hex keys, tubing cutter, swaging and flaring set in a hard case.',
    mount: 'technician',
    bulk: 1,
    accounting: 'expense',
    lifeDays: 1825,
    work: { general: 0.08 },
    helpsWith: 'Every repair runs about 8% faster.',
  },
  {
    id: 'multimeter',
    name: 'Digital multimeter',
    category: 'electrical',
    tier: 'basic',
    price: 180,
    description: 'True-RMS meter with capacitance and temperature: volts, ohms, microfarads.',
    mount: 'technician',
    bulk: 0.5,
    accounting: 'expense',
    lifeDays: 1825,
    read: { electrical: 0.35 },
    diag: { electrical: 0.1 },
    helpsWith: 'Capacitor, winding, contactor, board and thermostat readings.',
  },
  {
    id: 'clamp-meter',
    name: 'Clamp meter',
    category: 'electrical',
    tier: 'basic',
    price: 260,
    description: 'Clamp-on amp meter with inrush capture for compressor and motor starts.',
    mount: 'technician',
    bulk: 0.5,
    accounting: 'expense',
    lifeDays: 1825,
    read: { current: 0.45, electrical: 0.1 },
    diag: { current: 0.15 },
    work: { electrical: 0.05 },
    helpsWith: 'Compressor and motor amperage, breaker trips, locked-rotor starts.',
  },
  {
    id: 'digital-manifold',
    name: 'Digital refrigerant manifold',
    category: 'refrigerant',
    tier: 'professional',
    price: 780,
    description: 'Four-valve digital manifold with pipe-clamp probes: live superheat and subcooling.',
    mount: 'technician',
    bulk: 1,
    accounting: 'expense',
    lifeDays: 1825,
    read: { pressure: 0.5, temperature: 0.3 },
    diag: { pressure: 0.25, temperature: 0.1 },
    work: { charging: 0.15 },
    helpsWith: 'Suction and head pressure, superheat, subcooling and charging.',
  },
  {
    id: 'leak-detector',
    name: 'Electronic leak detector',
    category: 'refrigerant',
    tier: 'professional',
    price: 560,
    description: 'Heated-diode detector sensitive to A2L and HFC refrigerants down to 0.1 oz/yr.',
    mount: 'technician',
    bulk: 0.5,
    accounting: 'expense',
    lifeDays: 1825,
    read: { leak: 0.6 },
    diag: { leak: 0.3 },
    helpsWith: 'Finding refrigerant leaks instead of guessing at them.',
  },
  {
    id: 'manometer',
    name: 'Digital manometer',
    category: 'airflow',
    tier: 'professional',
    price: 340,
    description: 'Dual-port manometer for total external static pressure and duct testing.',
    mount: 'technician',
    bulk: 0.5,
    accounting: 'expense',
    lifeDays: 1825,
    read: { airflow: 0.55 },
    diag: { airflow: 0.2 },
    work: { airflow: 0.15 },
    helpsWith: 'Static pressure, restricted coils and duct leakage.',
  },
  {
    id: 'charging-scale',
    name: 'Refrigerant charging scale',
    category: 'refrigerant',
    tier: 'professional',
    price: 290,
    description: 'Wireless 110 kg scale: charge by weight to the nameplate, not by feel.',
    mount: 'technician',
    bulk: 1,
    accounting: 'expense',
    lifeDays: 1825,
    work: { charging: 0.1 },
    quality: { charging: 0.5 },
    helpsWith: 'Accurate weighed-in charge after a leak repair or compressor change.',
  },
  {
    id: 'micron-gauge',
    name: 'Micron gauge',
    category: 'evacuation',
    tier: 'professional',
    price: 240,
    description: 'Vacuum gauge that proves the system is dry: pull to 500 microns and hold.',
    mount: 'technician',
    bulk: 0.5,
    accounting: 'expense',
    lifeDays: 1825,
    work: { evacuation: 0.1 },
    quality: { evacuation: 0.6 },
    helpsWith: 'A verified, moisture-free evacuation (no timed guess).',
  },
  {
    id: 'vacuum-pump',
    name: 'Vacuum pump',
    category: 'evacuation',
    tier: 'professional',
    price: 1150,
    description: '8 CFM two-stage pump with a large-bore hose kit. Rides in the van.',
    mount: 'vehicle',
    bulk: 2,
    accounting: 'capital',
    lifeDays: 1825,
    work: { evacuation: 0.4 },
    quality: { evacuation: 0.15 },
    helpsWith: 'Evacuation in a fraction of the time.',
  },
  {
    id: 'recovery-machine',
    name: 'Recovery machine',
    category: 'refrigerant',
    tier: 'advanced',
    price: 1650,
    description: 'Oil-less recovery unit rated for A2L refrigerants. Rides in the van.',
    mount: 'vehicle',
    bulk: 3,
    accounting: 'capital',
    lifeDays: 1825,
    work: { recovery: 0.5 },
    helpsWith: 'Recovering the charge before brazing: compressor and leak repairs.',
  },
  {
    id: 'nitrogen-kit',
    name: 'Nitrogen pressure-test kit',
    category: 'refrigerant',
    tier: 'advanced',
    price: 690,
    description: 'Nitrogen cylinder, regulator and test manifold for brazing purge and standing pressure tests.',
    mount: 'vehicle',
    bulk: 2,
    accounting: 'expense',
    lifeDays: 1825,
    read: { leak: 0.2 },
    work: { 'pressure-test': 0.35, brazing: 0.1 },
    quality: { 'pressure-test': 0.5 },
    helpsWith: 'Confirming leaks and proving a repair holds pressure.',
  },
  {
    id: 'thermal-camera',
    name: 'Thermal imaging camera',
    category: 'inspection',
    tier: 'advanced',
    price: 1900,
    description: 'Infrared camera for coil frost, duct leaks into the attic and overheating terminals.',
    mount: 'technician',
    bulk: 0.5,
    accounting: 'capital',
    lifeDays: 1825,
    read: { visual: 0.35, temperature: 0.3, airflow: 0.15 },
    diag: { visual: 0.2, temperature: 0.1 },
    helpsWith: 'Visual inspections, coils, duct leaks and temperature splits.',
  },
];

export const TOOL_IDS = TOOLS.map((t) => t.id);

export function toolDef(id: ToolId | string): ToolDef {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown tool ${id}`);
  return t;
}

export const TIER_LABELS: Record<ToolTier, string> = { basic: 'Basic', professional: 'Professional', advanced: 'Advanced' };
export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  hand: 'Hand tools',
  electrical: 'Electrical',
  refrigerant: 'Refrigerant',
  airflow: 'Airflow',
  evacuation: 'Evacuation',
  inspection: 'Inspection',
};
export const MEASURE_LABELS: Record<MeasureKind, string> = {
  electrical: 'Electrical readings',
  current: 'Amperage',
  pressure: 'Refrigerant pressure',
  leak: 'Leak search',
  airflow: 'Airflow and static',
  temperature: 'Temperature splits',
  visual: 'Visual inspection',
};
export const PROCEDURE_LABELS: Record<Procedure, string> = {
  electrical: 'Electrical repair',
  mechanical: 'Motor and mechanical',
  controls: 'Controls',
  cleaning: 'Cleaning and drains',
  airflow: 'Airflow and ducts',
  recovery: 'Refrigerant recovery',
  brazing: 'Brazing',
  'pressure-test': 'Pressure test',
  evacuation: 'Evacuation',
  charging: 'Charging',
};

/** The starter kit every new company owns: enough for the tutorial and entry-level calls. */
export const STARTER_KIT: ToolId[] = ['hand-tools', 'multimeter'];
