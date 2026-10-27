import type { GameState, ToolHolder, ToolItem, Vehicle } from '../simulation/types';
import type { ActionResult } from '../jobs/workflow';
import { postTransaction } from '../economy/ledger';
import { pushEvent } from '../simulation/events';
import { effectiveToolCapacity } from '../fleet/fleet';
import { RESALE_RATE, STARTER_KIT, toolDef, type ToolId } from './catalog';

/**
 * Company equipment: purchases, the HQ tool crib, technician kits and vehicle racks.
 *
 * Every physical tool has exactly one holder, so one tool can never benefit two technicians at
 * once. A portable tool may ride in a van as shared stock: it then serves whoever runs the job in
 * that van (one job per van at a time). Vehicle tools (vacuum pump, recovery machine, nitrogen kit)
 * ride in vans only. Tools cannot move while their technician or van is out on a job.
 */

const HISTORY_LIMIT = 12;

export function tools(state: GameState): Record<string, ToolItem> {
  return (state.tools ??= {});
}

function note(state: GameState, item: ToolItem, text: string): void {
  item.history.push({ day: state.clock.day, text });
  if (item.history.length > HISTORY_LIMIT) item.history.splice(0, item.history.length - HISTORY_LIMIT);
}

export function holderLabel(state: GameState, holder: ToolHolder): string {
  if (holder.kind === 'employee') return state.employees[holder.id]?.name ?? 'former employee';
  if (holder.kind === 'vehicle') return state.vehicles[holder.id]?.nickname ?? 'former vehicle';
  return 'HQ tool crib';
}

export function sameHolder(a: ToolHolder, b: ToolHolder): boolean {
  return a.kind === b.kind && (a.kind === 'inventory' || (b.kind !== 'inventory' && a.id === b.id));
}

export function toolsHeldBy(state: GameState, holder: ToolHolder): ToolItem[] {
  return Object.values(tools(state)).filter((t) => sameHolder(t.holder, holder));
}

/** Equipment-rack space in a vehicle: the same tool slots the vehicle's shelving upgrades add to. */
export function rackCapacity(vehicle: Vehicle): number {
  return effectiveToolCapacity(vehicle);
}

export function rackUsed(state: GameState, vehicleId: string): number {
  return toolsHeldBy(state, { kind: 'vehicle', id: vehicleId }).reduce((s, t) => s + toolDef(t.defId).bulk, 0);
}

/** Why the tool cannot be moved right now (it is out on a job), or null. */
export function lockedReason(state: GameState, item: ToolItem): string | null {
  const h = item.holder;
  if (h.kind === 'employee') {
    const e = state.employees[h.id];
    if (e && (e.jobId || !['idle', 'training', 'off-duty'].includes(e.status))) return `${e.name} has it in the field.`;
  }
  if (h.kind === 'vehicle') {
    const v = state.vehicles[h.id];
    if (v && v.status !== 'parked') return `${v.nickname} is out with it.`;
  }
  return null;
}

/** Validates a destination for a tool (without moving it). */
export function checkDestination(state: GameState, defId: ToolId, to: ToolHolder, ignoreItemId?: string): ActionResult {
  const def = toolDef(defId);
  if (to.kind === 'inventory') return { ok: true };
  const others = toolsHeldBy(state, to).filter((t) => t.id !== ignoreItemId);
  if (to.kind === 'employee') {
    const e = state.employees[to.id];
    if (!e) return { ok: false, reason: 'Unknown employee.' };
    if (e.role !== 'technician' && e.role !== 'installer') return { ok: false, reason: `${e.name} does not work in the field.` };
    if (def.mount === 'vehicle') return { ok: false, reason: `${def.name} rides in a vehicle, not in a technician's kit.` };
    if (e.jobId || !['idle', 'training', 'off-duty'].includes(e.status)) return { ok: false, reason: `${e.name} is in the field. Equip them at headquarters.` };
    if (others.some((t) => t.defId === defId)) return { ok: false, reason: `${e.name} already carries a ${def.name.toLowerCase()}.` };
    return { ok: true };
  }
  const v = state.vehicles[to.id];
  if (!v) return { ok: false, reason: 'Unknown vehicle.' };
  if (v.status !== 'parked') return { ok: false, reason: `${v.nickname} must be parked at headquarters to load equipment.` };
  if (others.some((t) => t.defId === defId)) return { ok: false, reason: `${v.nickname} already carries a ${def.name.toLowerCase()}.` };
  const used = others.reduce((s, t) => s + toolDef(t.defId).bulk, 0);
  if (used + def.bulk > rackCapacity(v) + 1e-9) return { ok: false, reason: `${v.nickname}'s rack is full (${used} of ${rackCapacity(v)} used, ${def.name} needs ${def.bulk}). Add shelving or tool storage, or unload something.` };
  return { ok: true };
}

/** Buys one tool at the Pro Supply Depot, optionally equipping it straight away. */
export function purchaseTool(state: GameState, defId: ToolId, assignTo?: ToolHolder): ActionResult & { itemId?: string } {
  let def;
  try {
    def = toolDef(defId);
  } catch {
    return { ok: false, reason: 'Unknown product.' };
  }
  const to = assignTo ?? { kind: 'inventory' };
  const dest = checkDestination(state, def.id, to);
  if (!dest.ok) return dest;
  if (state.finance.cash < def.price) return { ok: false, reason: `${def.name} costs $${def.price.toLocaleString()}. Not enough cash.` };
  postTransaction(state, { amount: -def.price, category: def.accounting === 'capital' ? 'equipment-purchase' : 'tools', memo: `${def.name} — Pro Supply Depot` });
  const item: ToolItem = { id: `tool-${state.nextId++}`, defId: def.id, purchaseDay: state.clock.day, purchasePrice: def.price, holder: to, condition: 100, jobsUsed: 0, history: [] };
  note(state, item, `Bought for $${def.price.toLocaleString()}`);
  if (to.kind !== 'inventory') note(state, item, `Issued to ${holderLabel(state, to)}`);
  tools(state)[item.id] = item;
  pushEvent(state, { type: 'success', title: `Bought ${def.name}`, body: `$${def.price.toLocaleString()} · ${holderLabel(state, to)}` });
  return { ok: true, itemId: item.id };
}

/** Moves a tool between the tool crib, a technician and a vehicle rack. */
export function assignTool(state: GameState, itemId: string, to: ToolHolder): ActionResult {
  const item = tools(state)[itemId];
  if (!item) return { ok: false, reason: 'Unknown tool.' };
  if (sameHolder(item.holder, to)) return { ok: false, reason: `Already with ${holderLabel(state, to)}.` };
  const locked = lockedReason(state, item);
  if (locked) return { ok: false, reason: locked };
  const dest = checkDestination(state, item.defId, to, item.id);
  if (!dest.ok) return dest;
  const from = holderLabel(state, item.holder);
  item.holder = to;
  note(state, item, to.kind === 'inventory' ? `Returned to the tool crib from ${from}` : `Moved from ${from} to ${holderLabel(state, to)}`);
  return { ok: true };
}

/** What a surplus tool fetches: 40% of its cost, less straight-line wear over its life (never below 10%). */
export function resalePrice(state: GameState, item: ToolItem): number {
  const def = toolDef(item.defId);
  const remaining = Math.max(0.1, 1 - (state.clock.day - item.purchaseDay) / def.lifeDays);
  return Math.round((def.price * remaining * RESALE_RATE) / 5) * 5;
}

export function sellTool(state: GameState, itemId: string): ActionResult {
  const item = tools(state)[itemId];
  if (!item) return { ok: false, reason: 'Unknown tool.' };
  const locked = lockedReason(state, item);
  if (locked) return { ok: false, reason: locked };
  const def = toolDef(item.defId);
  const proceeds = resalePrice(state, item);
  postTransaction(state, { amount: proceeds, category: 'equipment-sale', memo: `Sold ${def.name}` });
  delete tools(state)[itemId];
  pushEvent(state, { type: 'money', title: `Sold ${def.name} for $${proceeds.toLocaleString()}` });
  return { ok: true };
}

/** Sends every tool held by an employee or vehicle back to the crib (before they leave the company). */
export function releaseTools(state: GameState, holder: ToolHolder, reason: string): number {
  const held = toolsHeldBy(state, holder);
  for (const t of held) {
    t.holder = { kind: 'inventory' };
    note(state, t, `Returned to the tool crib (${reason})`);
  }
  return held.length;
}

/** Repairs references to employees or vehicles that no longer exist (quits, older saves). */
export function returnOrphanTools(state: GameState): number {
  let n = 0;
  for (const t of Object.values(tools(state))) {
    const h = t.holder;
    const gone = (h.kind === 'employee' && !state.employees[h.id]) || (h.kind === 'vehicle' && !state.vehicles[h.id]);
    if (!gone) continue;
    t.holder = { kind: 'inventory' };
    note(state, t, 'Returned to the tool crib (holder left the company)');
    n++;
  }
  return n;
}

/** The kit the business starts with. It came with the company, so it has no purchase cost. */
export function grantStarterKit(state: GameState, employeeId: string): void {
  for (const defId of STARTER_KIT) {
    const item: ToolItem = { id: `tool-${state.nextId++}`, defId, purchaseDay: state.clock.day, purchasePrice: 0, holder: { kind: 'employee', id: employeeId }, condition: 100, jobsUsed: 0, history: [] };
    note(state, item, 'Starter kit');
    tools(state)[item.id] = item;
  }
}

/** Capital equipment at cost less straight-line depreciation over its life (expensed tools carry no book value). */
export function equipmentBookValue(state: GameState): number {
  let total = 0;
  for (const t of Object.values(tools(state))) {
    const def = toolDef(t.defId);
    if (def.accounting !== 'capital') continue;
    total += t.purchasePrice * Math.max(0, 1 - (state.clock.day - t.purchaseDay) / def.lifeDays);
  }
  return total;
}
