import type { Attributes } from '../employees/attributes';
import { clamp01, durationMultiplier, measurementAccuracy } from '../employees/attributes';
import { FAULTS, type Fault } from '../jobs/faults';
import type { Employee, GameState, Job, ToolItem, Vehicle } from '../simulation/types';
import { BALANCE } from '../simulation/newGame';
import { MAX_DIAG_SAVING, MAX_PROCEDURE_SAVING, MEASURE_LABELS, QUALITY_PROCEDURES, READ_CEILING, toolDef, type MeasureKind, type Procedure, type QualityProcedure, type ToolDef } from './catalog';
import { toolsHeldBy } from './inventory';

/**
 * Effective performance = the technician's own ability (attributes, training, fatigue) adjusted by
 * the tools actually on site. Attributes never change with equipment; tools only act on the
 * mechanics below, each with diminishing, capped returns:
 *
 *   read accuracy    p' = p + (READ_CEILING − p) · gain     (gain = 1 − Π(1 − tool.read[kind]))
 *   diagnostic time  t' = t · (1 − Σ share · saving)        (share = 1 / readings, saving ≤ MAX_DIAG_SAVING)
 *   repair time      t' = t · (1 − Σ share · saving)        (share = 1 / procedures, saving ≤ MAX_PROCEDURE_SAVING)
 *   workmanship      q' = q + (QUALITY_CEILING − q) · gain  (refrigerant-circuit work only)
 *
 * A better technician keeps the lead with the same tools, and nothing reaches certainty.
 */

export const QUALITY_CEILING = 0.98;
/** Review stars gained per point of workmanship the tools add (capped). */
export const QUALITY_STARS_PER_POINT = 1.5;
export const MAX_QUALITY_STARS = 0.5;

export function combine(values: number[]): number {
  return 1 - values.reduce((p, v) => p * (1 - clamp01(v)), 1);
}

/** The tools a technician has on site: their own kit plus the rack of the van they came in, if it is there. */
export function toolsOnSite(state: GameState, tech: Employee | undefined, vehicle: Vehicle | undefined): ToolItem[] {
  const own = tech ? toolsHeldBy(state, { kind: 'employee', id: tech.id }) : [];
  const rack = vehicle ? toolsHeldBy(state, { kind: 'vehicle', id: vehicle.id }) : [];
  return [...own, ...rack];
}

/** The van's equipment is only usable while that van is parked at this job. */
export function vehicleAtJob(state: GameState, job: Job): Vehicle | undefined {
  const v = job.vehicleId ? state.vehicles[job.vehicleId] : undefined;
  return v && v.jobId === job.id && v.status === 'onsite' ? v : undefined;
}

export function jobTools(state: GameState, job: Job): ToolDef[] {
  const tech = job.technicianId ? state.employees[job.technicianId] : undefined;
  return uniqueDefs(toolsOnSite(state, tech, vehicleAtJob(state, job)));
}

function uniqueDefs(items: ToolItem[]): ToolDef[] {
  const seen = new Set<string>();
  const out: ToolDef[] = [];
  for (const t of items) {
    if (seen.has(t.defId)) continue;
    seen.add(t.defId);
    out.push(toolDef(t.defId));
  }
  return out;
}

export function readGain(defs: ToolDef[], kind: MeasureKind): number {
  return combine(defs.map((d) => d.read?.[kind] ?? 0));
}

export function readTools(defs: ToolDef[], kind: MeasureKind): ToolDef[] {
  return defs.filter((d) => (d.read?.[kind] ?? 0) > 0);
}

export function effectiveAccuracy(base: number, gain: number): number {
  return base >= READ_CEILING ? base : base + (READ_CEILING - base) * gain;
}

export function diagMultiplier(fault: Fault, defs: ToolDef[]): number {
  const share = 1 / fault.evidence.length;
  const saved = fault.evidence.reduce((s, ev) => s + share * Math.min(MAX_DIAG_SAVING, combine(defs.map((d) => d.diag?.[ev.measure] ?? 0))), 0);
  return 1 - Math.min(MAX_DIAG_SAVING, saved);
}

export function procedureSaving(defs: ToolDef[], p: Procedure): number {
  return Math.min(MAX_PROCEDURE_SAVING, combine(defs.flatMap((d) => [d.work?.[p] ?? 0, d.work?.general ?? 0])));
}

export function repairMultiplier(fault: Fault, defs: ToolDef[]): number {
  const share = 1 / fault.procedures.length;
  return 1 - fault.procedures.reduce((s, p) => s + share * procedureSaving(defs, p), 0);
}

/** The technician's own workmanship on refrigerant-circuit work, before tools. */
export function baseQuality(attrs: Attributes): number {
  return Math.min(0.9, 0.5 + (attrs.attentionToDetail / 100) * 0.25 + (attrs.technicalExpertise / 100) * 0.15);
}

export function qualityProcedures(fault: Fault): QualityProcedure[] {
  return QUALITY_PROCEDURES.filter((p) => fault.procedures.includes(p));
}

/** Workmanship with tools, or undefined when the repair has no scored refrigerant-circuit step. */
export function workmanship(fault: Fault, attrs: Attributes, defs: ToolDef[]): { base: number; quality: number } | undefined {
  const steps = qualityProcedures(fault);
  if (steps.length === 0) return undefined;
  const base = baseQuality(attrs);
  const gain = steps.reduce((s, p) => s + combine(defs.map((d) => d.quality?.[p] ?? 0)), 0) / steps.length;
  return { base, quality: base + (QUALITY_CEILING - base) * gain };
}

export function qualityStars(q: { base: number; quality: number } | undefined): number {
  if (!q) return 0;
  return Math.min(MAX_QUALITY_STARS, Math.max(0, (q.quality - q.base) * QUALITY_STARS_PER_POINT));
}

// ---- Summaries for the interface -------------------------------------------------------------

export interface MeasureLine {
  kind: MeasureKind;
  label: string;
  base: number;
  effective: number;
  tools: string[];
}

export interface PerformanceSummary {
  measures: MeasureLine[];
  /** Averages over the whole fault catalog: what a typical service call looks like. */
  avgDiagMinutes: { base: number; effective: number };
  avgRepairMinutes: { base: number; effective: number };
  /** Average chance every reading on a call comes back right. */
  allReadingsRight: { base: number; effective: number };
  /** Refrigerant-circuit workmanship (leak repairs, compressor changes). */
  workmanship: { base: number; effective: number };
  tools: ToolDef[];
}

/**
 * The technician's effective performance with a loadout (their kit, plus a van's rack when given).
 * Uses current fatigue, like the field does.
 */
export function performanceSummary(state: GameState, tech: Employee, vehicle?: Vehicle): PerformanceSummary {
  const defs = uniqueDefs(toolsOnSite(state, tech, vehicle));
  return summarize(tech.attributes, tech.fatigue, defs);
}

export function summarize(attrs: Attributes, fatigue: number, defs: ToolDef[]): PerformanceSummary {
  const base = measurementAccuracy(attrs, fatigue);
  const kinds = Object.keys(MEASURE_LABELS) as MeasureKind[];
  const measures = kinds.map((kind) => ({ kind, label: MEASURE_LABELS[kind], base, effective: effectiveAccuracy(base, readGain(defs, kind)), tools: readTools(defs, kind).map((d) => d.name) }));
  const dm = durationMultiplier(attrs, fatigue);
  let diagB = 0;
  let diagE = 0;
  let repB = 0;
  let repE = 0;
  let allB = 0;
  let allE = 0;
  let qB = 0;
  let qE = 0;
  let qN = 0;
  for (const f of FAULTS) {
    diagB += BALANCE.diagnosticBaseMinutes * dm;
    diagE += BALANCE.diagnosticBaseMinutes * dm * diagMultiplier(f, defs);
    repB += f.laborMinutes * dm;
    repE += f.laborMinutes * dm * repairMultiplier(f, defs);
    allB += f.evidence.reduce((p) => p * base, 1);
    allE += f.evidence.reduce((p, ev) => p * effectiveAccuracy(base, readGain(defs, ev.measure)), 1);
    const q = workmanship(f, attrs, defs);
    if (q) {
      qB += q.base;
      qE += q.quality;
      qN++;
    }
  }
  const n = FAULTS.length;
  return {
    measures,
    avgDiagMinutes: { base: diagB / n, effective: diagE / n },
    avgRepairMinutes: { base: repB / n, effective: repE / n },
    allReadingsRight: { base: allB / n, effective: allE / n },
    workmanship: { base: qN ? qB / qN : 0, effective: qN ? qE / qN : 0 },
    tools: defs,
  };
}

/** Faults a tool helps with (diagnosis or repair), for "compatible jobs" in the store. */
export function faultsHelpedBy(def: ToolDef): Fault[] {
  return FAULTS.filter(
    (f) =>
      f.evidence.some((ev) => (def.read?.[ev.measure] ?? 0) > 0 || (def.diag?.[ev.measure] ?? 0) > 0) ||
      f.procedures.some((p) => (def.work?.[p] ?? 0) > 0 || (def.quality?.[p as QualityProcedure] ?? 0) > 0) ||
      (def.work?.general ?? 0) > 0,
  );
}
