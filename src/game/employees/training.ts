import type { AttributeKey } from './attributes';
import type { EmployeeRole } from './roles';

export interface TrainingProgram {
  id: string;
  name: string;
  description: string;
  cost: number;
  /** Duration in workdays. */
  days: number;
  roles: EmployeeRole[];
  /** Attribute gains applied on completion. */
  gains: Partial<Record<AttributeKey, number>>;
  certification?: string;
}

export const TRAINING_PROGRAMS: TrainingProgram[] = [
  {
    id: 'electrical-diagnostics',
    name: 'Electrical Diagnostics',
    description: 'Meters, capacitors, contactors, motors. Fewer misreads, faster electrical calls.',
    cost: 900,
    days: 2,
    roles: ['technician', 'installer'],
    gains: { diagnosticAccuracy: 10, technicalExpertise: 5, speed: 3 },
    certification: 'Electrical I',
  },
  {
    id: 'refrigeration-fundamentals',
    name: 'Refrigeration Fundamentals',
    description: 'Superheat, subcooling, leak search, charging by weight.',
    cost: 1200,
    days: 3,
    roles: ['technician', 'installer'],
    gains: { technicalExpertise: 9, diagnosticAccuracy: 6 },
    certification: 'EPA 608 Universal',
  },
  {
    id: 'airflow-diagnostics',
    name: 'Airflow Diagnostics',
    description: 'Static pressure, delta-T, duct leakage and coil restriction.',
    cost: 800,
    days: 2,
    roles: ['technician'],
    gains: { diagnosticAccuracy: 8, attentionToDetail: 6 },
  },
  {
    id: 'inverter-systems',
    name: 'Inverter Systems',
    description: 'Variable-speed, communicating controls, A2L refrigerant handling.',
    cost: 1800,
    days: 3,
    roles: ['technician', 'installer'],
    gains: { technicalExpertise: 12, learnability: 3 },
    certification: 'Inverter Specialist',
  },
  {
    id: 'advanced-troubleshooting',
    name: 'Advanced Troubleshooting',
    description: 'Intermittent faults, control boards, systematic isolation.',
    cost: 1500,
    days: 3,
    roles: ['technician'],
    gains: { diagnosticAccuracy: 12, speed: 5, technicalExpertise: 4 },
  },
  {
    id: 'customer-communication',
    name: 'Customer Communication',
    description: 'Explaining findings plainly, setting expectations, earning reviews.',
    cost: 600,
    days: 1,
    roles: ['technician', 'installer', 'dispatcher', 'comfort-advisor'],
    gains: { customerService: 10, communication: 8 },
  },
  {
    id: 'replacement-sales',
    name: 'Replacement Sales',
    description: 'Options presentation, financing, handling objections without pressure.',
    cost: 1400,
    days: 2,
    roles: ['technician', 'comfort-advisor'],
    gains: { salesAbility: 14, communication: 4 },
  },
  {
    id: 'installation-quality',
    name: 'Installation Quality',
    description: 'Brazing, nitrogen purge, commissioning, airflow setup.',
    cost: 1300,
    days: 3,
    roles: ['installer', 'technician'],
    gains: { attentionToDetail: 12, technicalExpertise: 6 },
    certification: 'Install Quality',
  },
  {
    id: 'safety-training',
    name: 'Safety Training',
    description: 'Ladders, electrical lockout, attic heat protocols.',
    cost: 400,
    days: 1,
    roles: ['technician', 'installer', 'dispatcher', 'comfort-advisor'],
    gains: { reliability: 6, stamina: 4 },
    certification: 'OSHA 10',
  },
];

export function programById(id: string): TrainingProgram {
  const p = TRAINING_PROGRAMS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown training program ${id}`);
  return p;
}
