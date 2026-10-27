import type { GameState } from '../simulation/types';
import type { ActionResult } from '../jobs/workflow';
import { employeeCapacity } from '../fleet/fleet';
import { postTransaction } from '../economy/ledger';
import { pushEvent } from '../simulation/events';
import { programById } from './training';
import { generateCandidate } from './candidates';
import { ROLE_LABELS, type EmployeeRole } from './roles';
import { nextInt, pick } from '../simulation/rng';
import { releaseTools } from '../equipment/inventory';

export function hireCandidate(state: GameState, candidateId: string): ActionResult {
  const candidate = state.candidates.find((c) => c.id === candidateId);
  if (!candidate) return { ok: false, reason: 'That candidate is no longer available.' };
  if (Object.keys(state.employees).length >= employeeCapacity(state)) return { ok: false, reason: 'Headquarters is at employee capacity. Upgrade the facility.' };
  const signing = Math.round(candidate.hourlyWage * 8); // one day of wages as onboarding cost
  if (state.finance.cash < signing) return { ok: false, reason: 'Not enough cash for onboarding costs.' };
  postTransaction(state, { amount: -signing, category: 'payroll', memo: `Onboarding — ${candidate.name}` });
  const idx = Object.keys(state.employees).length;
  const id = `emp-${state.nextId++}`;
  state.employees[id] = {
    id,
    name: candidate.name,
    role: candidate.role,
    isOwner: false,
    attributes: { ...candidate.attributes },
    xp: candidate.experienceYears * 30,
    level: 1,
    hourlyWage: candidate.hourlyWage,
    morale: 75,
    fatigue: 0,
    certifications: candidate.role === 'technician' && candidate.experienceYears >= 3 ? ['EPA 608 Universal'] : [],
    status: 'idle',
    hiredDay: state.clock.day,
    jobsCompleted: 0,
    look: candidate.look,
    position: { x: 44 + (idx % 3) * 2.4, z: 30 + Math.floor(idx / 3) * 2.6 },
  };
  state.candidates = state.candidates.filter((c) => c.id !== candidateId);
  pushEvent(state, { type: 'celebration', title: `Hired ${candidate.name}`, body: `${ROLE_LABELS[candidate.role]} at $${candidate.hourlyWage}/hr`, focus: { kind: 'employee', id } });
  return { ok: true };
}

export function fireEmployee(state: GameState, employeeId: string): ActionResult {
  const e = state.employees[employeeId];
  if (!e) return { ok: false, reason: 'Unknown employee.' };
  if (e.isOwner) return { ok: false, reason: 'You cannot fire yourself.' };
  if (e.status !== 'idle' && e.status !== 'training') return { ok: false, reason: `${e.name} is in the field. Wait until they return.` };
  const severance = Math.round(e.hourlyWage * 8 * 3);
  postTransaction(state, { amount: -severance, category: 'payroll', memo: `Severance — ${e.name}` });
  // Company tools stay with the company.
  const returned = releaseTools(state, { kind: 'employee', id: employeeId }, `${e.name} left`);
  delete state.employees[employeeId];
  for (const other of Object.values(state.employees)) other.morale = Math.max(0, other.morale - 4);
  pushEvent(state, { type: 'warning', title: `${e.name} let go`, body: `Severance ${severance.toLocaleString()}. Team morale dipped.${returned ? ` ${returned} tool${returned === 1 ? '' : 's'} returned to the tool crib.` : ''}` });
  return { ok: true };
}

export function startTraining(state: GameState, employeeId: string, programId: string): ActionResult {
  const e = state.employees[employeeId];
  if (!e) return { ok: false, reason: 'Unknown employee.' };
  const program = programById(programId);
  if (!program.roles.includes(e.role)) return { ok: false, reason: `${program.name} is not offered for ${ROLE_LABELS[e.role]}s.` };
  if (e.status !== 'idle' || e.jobId) return { ok: false, reason: `${e.name} must be idle at headquarters to start training.` };
  if (e.training) return { ok: false, reason: `${e.name} is already in training.` };
  if (program.certification && e.certifications.includes(program.certification)) return { ok: false, reason: `${e.name} already holds ${program.certification}.` };
  if (state.finance.cash < program.cost) return { ok: false, reason: 'Not enough cash for tuition.' };
  postTransaction(state, { amount: -program.cost, category: 'training', memo: `${program.name} — ${e.name}` });
  let days = program.days;
  if (state.company.hqUpgrades.includes('training-room')) days = Math.max(1, days - 1);
  e.training = { programId, daysRemaining: days };
  e.status = 'training';
  pushEvent(state, { type: 'info', title: `${e.name} started ${program.name}`, body: `${days} day${days === 1 ? '' : 's'}, $${program.cost.toLocaleString()}`, focus: { kind: 'employee', id: e.id } });
  return { ok: true };
}

/** Called at the day rollover. */
export function progressTraining(state: GameState): void {
  for (const e of Object.values(state.employees)) {
    if (!e.training) continue;
    e.training.daysRemaining -= 1;
    if (e.training.daysRemaining <= 0) {
      const program = programById(e.training.programId);
      const learn = 0.8 + (e.attributes.learnability / 100) * 0.5;
      for (const [key, gain] of Object.entries(program.gains)) {
        const k = key as keyof typeof e.attributes;
        e.attributes[k] = Math.min(100, Math.round(e.attributes[k] + (gain ?? 0) * learn));
      }
      if (program.certification && !e.certifications.includes(program.certification)) e.certifications.push(program.certification);
      if (!e.specialization) e.specialization = program.name;
      e.training = undefined;
      e.status = 'idle';
      state.stats.trainingsCompleted++;
      e.morale = Math.min(100, e.morale + 6);
      pushEvent(state, { type: 'celebration', title: `${e.name} completed ${program.name}`, body: Object.entries(program.gains).map(([k, v]) => `${k} +${Math.round((v ?? 0) * learn)}`).join(', '), focus: { kind: 'employee', id: e.id } });
    }
  }
}

export function refreshCandidates(state: GameState): void {
  state.candidates = state.candidates.filter((c) => c.availableUntilDay > state.clock.day);
  const roles: EmployeeRole[] = ['technician', 'installer', 'dispatcher', 'comfort-advisor'];
  const target = 4 + Math.min(3, state.company.level);
  while (state.candidates.length < target) {
    const role = state.candidates.filter((c) => c.role === 'technician').length < 2 ? 'technician' : pick(state.rng, roles);
    state.candidates.push(generateCandidate(state.rng, role, state.clock.day, `cand-${state.nextId++}`));
  }
  if (nextInt(state.rng, 0, 3) === 0 && state.candidates.length > 3) state.candidates.shift();
}
