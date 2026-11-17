import { SAVE_SCHEMA_VERSION, type GameState } from '@/game/simulation/types';
import { emptyBanking, upgradeLoan } from '@/game/economy/banking/loans';
import { grantStarterKit, returnOrphanTools } from '@/game/equipment/inventory';
import { commercialCustomers } from '@/game/customers/generate';
import { formatClock } from '@/game/simulation/time';

/**
 * Saving and save recovery.
 *
 * Two slots: the manual save (written when the player saves, saves and exits, or starts a company) and the
 * autosave (written by the game loop every 45 s, at midnight and when the page is hidden). "Continue" loads the
 * newest save that is valid, whichever slot it is in, and says which one; see planRecovery for the full policy.
 *
 * Rules this module keeps:
 * - Reading never writes: inspecting or loading a slot leaves storage exactly as it was.
 * - A slot is only ever written with the game it is for: loading the autosave does not touch the manual save.
 * - Nothing is deleted to recover. A save that cannot be read stays where it is, and the first time a write is
 *   about to replace a save the running game did not come from (unreadable, or newer than what was loaded), that
 *   save is first copied to a "kept" slot.
 */

export const SAVE_KEY = 'ego-hvac-v3:save';
export const AUTOSAVE_KEY = 'ego-hvac-v3:autosave';
export const SETTINGS_KEY = 'ego-hvac-v3:settings';
/** A slot's set-aside copy: `${slot}:kept`. One per slot. */
export const KEPT_SUFFIX = ':kept';
export const SAVE_SEQ_KEY = 'ego-hvac-v3:save-seq';
export const LOAD_GUARD_KEY = 'ego-hvac-v3:load-guard';
export const SAVE_SLOTS = [SAVE_KEY, AUTOSAVE_KEY, SAVE_KEY + KEPT_SUFFIX, AUTOSAVE_KEY + KEPT_SUFFIX] as const;

export interface SaveEnvelope {
  schemaVersion: number;
  /** Wall-clock time of the write (ISO). Shown to the player; orders saves only when `seq` is missing. */
  savedAt: string;
  appVersion: string;
  /**
   * Write counter on this device, one higher for every save written to any slot. This, not the wall clock, says
   * which of two saves is newer (clocks get changed). Saves from before it existed have none.
   */
  seq?: number;
  /** FNV-1a of the state text exactly as written: a save that was cut short or altered does not match. */
  checksum?: string;
  state: GameState;
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const STATE_MARK = ',"state":';

export function serialize(state: GameState, meta: { seq?: number; now?: Date } = {}): string {
  const body = JSON.stringify(state);
  const head: Omit<SaveEnvelope, 'state'> = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: (meta.now ?? new Date()).toISOString(),
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.1.0',
    ...(meta.seq !== undefined ? { seq: meta.seq } : {}),
    checksum: fnv1a(body),
  };
  // The state goes last and verbatim, so its checksum can be checked against the stored text.
  return `${JSON.stringify(head).slice(0, -1)}${STATE_MARK}${body}}`;
}

/** Applies forward migrations for older save schemas. */
export function migrate(envelope: SaveEnvelope): GameState {
  const state = envelope.state;
  if (envelope.schemaVersion > SAVE_SCHEMA_VERSION) throw new Error(`Save is from a newer version (${envelope.schemaVersion}).`);
  // Schema 1 → 2: business banking. Vehicle loans gain lender/term/payment-record fields; the
  // banking state (credit line, rating, history) starts empty. Ledger history is kept as is.
  if (envelope.schemaVersion < 2) {
    state.finance.banking ??= emptyBanking();
    for (const loan of state.finance.loans) upgradeLoan(loan, state.clock.day);
  }
  // Schema 2 → 3: company equipment. Older companies get the same starter kit a new company
  // starts with (the owner's hand tools and meter; expensed, so no book value appears).
  if (envelope.schemaVersion < 3 || !state.tools) {
    state.tools ??= {};
    const owner = Object.values(state.employees).find((e) => e.isOwner);
    if (owner && Object.keys(state.tools).length === 0) grantStarterKit(state, owner.id);
  }
  returnOrphanTools(state);
  // Schema 3 → 4: Operations Center. Automation starts off; jobs have no attention items.
  state.company.automation ??= { diagnostics: false, closing: false };
  // Schema 4 → 5: rooftop service. The commercial customers (fixed records) join older campaigns; equipment
  // placement is derived from the customer's system and building, so existing customers keep theirs.
  for (const c of commercialCustomers()) state.customers[c.id] ??= c;
  // Schema 5 → 6: Mission 01. It opens new campaigns only: a running campaign keeps its jobs and is never given one.
  state.schemaVersion = SAVE_SCHEMA_VERSION;
  return state;
}

export function deserialize(json: string): GameState {
  const envelope = JSON.parse(json) as SaveEnvelope;
  if (!envelope || typeof envelope.schemaVersion !== 'number' || !envelope.state) throw new Error('Not a valid save file.');
  return migrate(envelope);
}

// ---------------------------------------------------------------------------------------------------------------------
// Inspecting a slot

export type SlotStatus =
  /** Nothing stored. */
  | 'empty'
  /** Reads, migrates and has everything a company needs. */
  | 'valid'
  /** Damaged: not JSON, cut short, altered, or missing parts of the company. */
  | 'corrupt'
  /** Intact, but this build cannot use it: written by a newer version, or the upgrade from its version failed. */
  | 'incompatible';

/** What the menu shows about a save, so the player can tell them apart. */
export interface SaveSummary {
  company: string;
  day: number;
  /** Time of day in the game, e.g. "2:14 PM". */
  time: string;
  cash: number;
  staff: number;
  seed: number;
  elapsedMinutes: number;
}

export interface SlotInfo {
  key: string;
  kind: 'manual' | 'autosave';
  /** A set-aside copy (see KEPT_SUFFIX), not a live slot. */
  kept: boolean;
  status: SlotStatus;
  /** Why it is not valid, for the developer; null when valid or empty. */
  reason: string | null;
  savedAt: Date | null;
  /** Write counter; 0 for saves from before it existed. */
  seq: number;
  /** Identifies this exact write: changes whenever the slot is written again. */
  stamp: string;
  summary: SaveSummary | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Throws unless the state has what the game needs to run and draw a company. */
export function validateState(state: GameState): void {
  const s = state as unknown as Record<string, unknown>;
  const need = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`Save is missing ${what}.`);
  };
  need(isObject(s), 'its company');
  for (const n of ['seed', 'elapsedMinutes', 'nextId', 'nextEventId']) need(isNumber(s[n]), n);
  for (const o of ['rng', 'clock', 'company', 'finance', 'customers', 'jobs', 'employees', 'vehicles', 'tools', 'marketing', 'stats']) need(isObject(s[o]), o);
  for (const a of ['candidates', 'usedListings', 'competitors', 'milestones', 'leadSchedule', 'callbackSchedule', 'events']) need(Array.isArray(s[a]), a);
  need(isNumber(state.clock.day) && isNumber(state.clock.minute), 'the clock');
  need(isNumber(state.finance.cash) && Array.isArray(state.finance.ledger), 'the finances');
  need(typeof state.company.name === 'string' && isNumber(state.company.level), 'the company record');
  need(Object.values(state.employees).some((e) => isObject(e) && e.isOwner), 'the owner');
  for (const [id, c] of Object.entries(state.jobs)) need(isObject(c) && typeof c.status === 'string' && isObject(state.customers[c.customerId]), `the customer of job ${id}`);
}

function slotIdentity(key: string): Pick<SlotInfo, 'key' | 'kind' | 'kept'> {
  const kept = key.endsWith(KEPT_SUFFIX);
  const base = kept ? key.slice(0, -KEPT_SUFFIX.length) : key;
  return { key, kind: base === AUTOSAVE_KEY ? 'autosave' : 'manual', kept };
}

/**
 * Reads what a slot holds without changing it. Never throws. The state is returned migrated and ready to load
 * when the slot is valid (a fresh object each call), null otherwise.
 */
export function inspectJson(key: string, json: string | null): { info: SlotInfo; state: GameState | null } {
  const id = slotIdentity(key);
  const none = { savedAt: null, seq: 0, summary: null };
  if (json === null) return { info: { ...id, ...none, status: 'empty', reason: null, stamp: '' }, state: null };
  const rawStamp = `raw:${json.length}:${fnv1a(json.slice(0, 4096))}`;
  const bad = (status: 'corrupt' | 'incompatible', reason: string, extra: Partial<SlotInfo> = {}) => ({ info: { ...id, ...none, status, reason, stamp: rawStamp, ...extra }, state: null });
  let envelope: SaveEnvelope;
  try {
    envelope = JSON.parse(json) as SaveEnvelope;
  } catch {
    return bad('corrupt', 'It is not readable (damaged or cut short).');
  }
  if (!isObject(envelope) || !isNumber(envelope.schemaVersion) || !isObject(envelope.state)) return bad('corrupt', 'It is not a saved company.');
  const at = typeof envelope.savedAt === 'string' ? new Date(envelope.savedAt) : null;
  const savedAt = at && !Number.isNaN(at.getTime()) ? at : null;
  const seq = isNumber(envelope.seq) && envelope.seq > 0 ? Math.floor(envelope.seq) : 0;
  const stamp = `${seq}:${savedAt?.toISOString() ?? ''}:${envelope.checksum ?? fnv1a(json.slice(0, 4096)) + json.length}`;
  const meta = { savedAt, seq, stamp };
  if (envelope.schemaVersion > SAVE_SCHEMA_VERSION) return bad('incompatible', `It was made by a newer version of the game (save format ${envelope.schemaVersion}; this version reads up to ${SAVE_SCHEMA_VERSION}).`, meta);
  if (typeof envelope.checksum === 'string') {
    const at0 = json.indexOf(STATE_MARK);
    if (at0 < 0 || fnv1a(json.slice(at0 + STATE_MARK.length, -1)) !== envelope.checksum) return bad('corrupt', 'Its contents do not match its checksum (damaged or altered).', meta);
  }
  // The parts every version of a save has. Without them it is damaged, whatever its version says.
  const parts = envelope.state as unknown as Record<string, unknown>;
  const missing = ['clock', 'company', 'finance', 'customers', 'jobs', 'employees', 'vehicles'].find((k) => !isObject(parts[k]));
  if (missing) return bad('corrupt', `Save is missing ${missing}.`, meta);
  let state: GameState;
  try {
    state = migrate(envelope);
  } catch (e) {
    return bad('incompatible', `It could not be brought up to this version (${e instanceof Error ? e.message : 'upgrade failed'}).`, meta);
  }
  try {
    validateState(state);
  } catch (e) {
    return bad('corrupt', e instanceof Error ? e.message : 'It is incomplete.', meta);
  }
  const summary: SaveSummary = { company: state.company.name, day: state.clock.day, time: formatClock(state.clock), cash: state.finance.cash, staff: Object.keys(state.employees).length, seed: state.seed, elapsedMinutes: state.elapsedMinutes };
  return { info: { ...id, ...meta, status: 'valid', reason: null, summary }, state };
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function rawSlot(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function inspectSlot(key: string): SlotInfo {
  return inspectJson(key, rawSlot(key)).info;
}

/** Every slot on this device, live and kept. */
export function inspectSlots(): SlotInfo[] {
  return SAVE_SLOTS.map((k) => inspectSlot(k));
}

// ---------------------------------------------------------------------------------------------------------------------
// Choosing what to continue from

/** Positive when a is the newer save. The write counter decides; saves from before it existed go by their time. */
export function compareNewest(a: SlotInfo, b: SlotInfo): number {
  if (a.seq !== b.seq) return a.seq - b.seq;
  const ta = a.savedAt?.getTime() ?? 0;
  const tb = b.savedAt?.getTime() ?? 0;
  if (ta !== tb) return ta - tb;
  return (a.summary?.elapsedMinutes ?? 0) - (b.summary?.elapsedMinutes ?? 0);
}

/** A load that has been started and not yet seen to work: how repeated crash-on-load is noticed. */
export interface LoadGuard {
  key: string;
  stamp: string;
  /** Loads of this exact save that were started and never confirmed. */
  attempts: number;
  /** A failure was recorded while it was loading or in its first seconds. */
  failed: boolean;
}

/** Whether the last tries at loading this exact save went wrong (a recorded failure, or two that never finished). */
export function isSuspect(slot: SlotInfo, guard: LoadGuard | null): boolean {
  return !!guard && slot.status === 'valid' && guard.key === slot.key && guard.stamp === slot.stamp && (guard.failed || guard.attempts >= 2);
}

export interface RecoveryPlan {
  /** What "Continue" loads; null when no save on the device can be loaded. */
  primary: SlotInfo | null;
  /** Why the primary is not simply "the newest save", when it is not; null otherwise. */
  notice: null | { kind: 'unreadable-skipped' | 'suspect-skipped' | 'suspect-only'; skipped: SlotInfo };
  /** Other loadable saves that hold different progress, newest first. Never loaded unless the player picks one. */
  others: SlotInfo[];
  /** Saves that are there but cannot be loaded. They are left in place. */
  unreadable: SlotInfo[];
}

const sameProgress = (a: SlotInfo, b: SlotInfo) => a.summary!.seed === b.summary!.seed && a.summary!.elapsedMinutes === b.summary!.elapsedMinutes && a.summary!.cash === b.summary!.cash;

/**
 * The save-selection policy. Pure: the same slots and guard give the same plan.
 *
 * 1. Only valid saves can be continued from. A corrupt or incompatible one is reported and left where it is.
 * 2. Among the valid live slots, the newest wins (compareNewest), whether it is the manual save or the autosave.
 * 3. If something newer than the winner could not be read, the plan says so (the player is on an older save).
 * 4. A save whose last load attempts went wrong (isSuspect) is not picked while another loadable save exists;
 *    it is offered as an explicit choice instead. With no alternative it is still offered, with a warning.
 * 5. Kept copies are never picked automatically, only listed, unless no live slot can be loaded.
 */
export function planRecovery(slots: SlotInfo[], guard: LoadGuard | null = null): RecoveryPlan {
  const present = slots.filter((s) => s.status !== 'empty');
  const valid = present.filter((s) => s.status === 'valid').sort((a, b) => compareNewest(b, a));
  const unreadable = present.filter((s) => s.status !== 'valid');
  const live = valid.filter((s) => !s.kept);
  const pool = live.length ? live : valid;
  const sound = pool.filter((s) => !isSuspect(s, guard));
  const primary = sound[0] ?? pool[0] ?? null;
  let notice: RecoveryPlan['notice'] = null;
  if (primary) {
    const suspect = pool.find((s) => isSuspect(s, guard));
    // An unreadable live slot is worth a sentence unless it is known to be older than what is being loaded.
    const newerUnreadable = unreadable.find((s) => !s.kept && !((s.seq > 0 || s.savedAt) && compareNewest(s, primary) < 0));
    if (suspect && primary !== suspect) notice = { kind: 'suspect-skipped', skipped: suspect };
    else if (suspect) notice = { kind: 'suspect-only', skipped: suspect };
    else if (newerUnreadable) notice = { kind: 'unreadable-skipped', skipped: newerUnreadable };
  }
  const others = primary ? valid.filter((s) => s !== primary && !sameProgress(s, primary)) : [];
  // Two other saves with the same progress (a kept copy of a slot that still holds it) are one choice.
  const distinct = others.filter((s, i) => !others.slice(0, i).some((o) => sameProgress(o, s)));
  return { primary, notice, others: distinct, unreadable };
}

/** "Autosave" / "Manual save" / "Set-aside autosave". */
export function slotName(slot: Pick<SlotInfo, 'kind' | 'kept'>): string {
  const base = slot.kind === 'autosave' ? 'autosave' : 'manual save';
  return slot.kept ? `Set-aside ${base}` : base.charAt(0).toUpperCase() + base.slice(1);
}

/** "today at 2:14 PM" / "Mar 3 at 2:14 PM". */
export function savedWhen(at: Date | null, now = new Date()): string {
  if (!at) return 'at an unknown time';
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return at.toDateString() === now.toDateString() ? `today at ${time}` : `${at.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

/** One line that tells a save apart: "Autosave · Day 3, 2:14 PM · saved today at 7:54 PM". */
export function describeSlot(slot: SlotInfo, now = new Date()): string {
  if (!slot.summary) return `${slotName(slot)} · cannot be read`;
  return `${slotName(slot)} · Day ${slot.summary.day}, ${slot.summary.time} · saved ${savedWhen(slot.savedAt, now)}`;
}

/** The sentence shown when Continue is not simply loading the newest save. */
export function describeNotice(plan: RecoveryPlan): string | null {
  const n = plan.notice;
  if (!n || !plan.primary) return null;
  const from = slotName(plan.primary).toLowerCase();
  const skipped = slotName(n.skipped).toLowerCase();
  if (n.kind === 'unreadable-skipped')
    return n.skipped.status === 'incompatible'
      ? `Your ${skipped} was made by a newer version of the game and cannot be opened here, so this continues from your ${from}. Nothing has been deleted.`
      : `Your ${skipped} is damaged and cannot be opened, so this continues from your ${from}. Nothing has been deleted.`;
  if (n.kind === 'suspect-skipped') return `The game did not start properly from your ${skipped} last time, so this continues from your ${from} instead. The ${skipped} is still here if you want to try it again.`;
  return `The game did not start properly from this save last time. You can try it again; nothing will be deleted.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Writing

/** What the running game was started from: decides which existing saves a write must set aside first. */
let session: { loaded: SlotInfo | null } = { loaded: null };
/** Slots already written (or checked) by this session: their contents are this game's own. */
const owned = new Set<string>();

/** Called when a company is loaded (with the save it came from) or started new (null). */
export function beginSession(loaded: SlotInfo | null): void {
  session = { loaded };
  owned.clear();
}

function nextSeq(s: Storage): number {
  let last = 0;
  try {
    last = Math.max(0, Math.floor(Number(s.getItem(SAVE_SEQ_KEY)) || 0));
    // The counter key may be gone (cleared storage, an older build): never go below what the slots already hold.
    for (const key of SAVE_SLOTS) {
      const m = /"seq":(\d+)/.exec(s.getItem(key)?.slice(0, 400) ?? '');
      if (m) last = Math.max(last, Number(m[1]));
    }
  } catch {
    /* unreadable counter: start from what we have */
  }
  return last + 1;
}

/**
 * Before the first write of a session replaces what is in a slot: if that save is not this game's own past
 * (it cannot be read, or it is newer than the save this game was loaded from), copy it to the slot's kept copy.
 * Starting a new company replaces the old one by the player's own confirmed choice, so only an unreadable save
 * is set aside then.
 */
function setAside(s: Storage, key: string): void {
  if (owned.has(key) || key.endsWith(KEPT_SUFFIX)) return;
  owned.add(key);
  const existing = s.getItem(key);
  if (existing === null) return;
  const { info } = inspectJson(key, existing);
  const loaded = session.loaded;
  const foreign = info.status !== 'valid' || (!!loaded && info.stamp !== loaded.stamp && compareNewest(info, loaded) > 0);
  if (!foreign) return;
  try {
    s.setItem(key + KEPT_SUFFIX, existing);
  } catch {
    /* no room for a copy: the write below still must not be lost */
  }
}

export function saveToStorage(state: GameState, key = SAVE_KEY): boolean {
  const s = storage();
  if (!s) return false;
  try {
    setAside(s, key);
    const seq = nextSeq(s);
    s.setItem(key, serialize(state, { seq }));
    s.setItem(SAVE_SEQ_KEY, String(seq));
    return true;
  } catch {
    return false;
  }
}

/** The migrated state in a slot, or null when it is empty or cannot be loaded. Does not change the slot. */
export function loadFromStorage(key = SAVE_KEY): GameState | null {
  return inspectJson(key, rawSlot(key)).state;
}

/** The slot's description and its state together (one read). */
export function readSlot(key: string): { info: SlotInfo; state: GameState | null } {
  return inspectJson(key, rawSlot(key));
}

export function hasSave(key = SAVE_KEY): boolean {
  return rawSlot(key) !== null;
}

export function clearSave(key = SAVE_KEY): void {
  storage()?.removeItem(key);
}

/** The plan for the saves on this device right now. */
export function currentPlan(): RecoveryPlan {
  return planRecovery(inspectSlots(), readLoadGuard());
}

// ---------------------------------------------------------------------------------------------------------------------
// Crash-on-load guard

export function readLoadGuard(): LoadGuard | null {
  try {
    const raw = storage()?.getItem(LOAD_GUARD_KEY);
    const g: unknown = raw ? JSON.parse(raw) : null;
    if (isObject(g) && typeof g.key === 'string' && typeof g.stamp === 'string' && isNumber(g.attempts)) return { key: g.key, stamp: g.stamp, attempts: g.attempts, failed: g.failed === true };
  } catch {
    /* unreadable guard: as if there were none */
  }
  return null;
}

function writeLoadGuard(guard: LoadGuard | null): void {
  try {
    if (guard) storage()?.setItem(LOAD_GUARD_KEY, JSON.stringify(guard));
    else storage()?.removeItem(LOAD_GUARD_KEY);
  } catch {
    /* storage blocked: the guard is a convenience, never a requirement */
  }
}

/** A load of this save is starting. Counted until confirmLoad says the game came up from it. */
export function beginLoad(slot: SlotInfo): void {
  const g = readLoadGuard();
  const same = !!g && g.key === slot.key && g.stamp === slot.stamp;
  writeLoadGuard({ key: slot.key, stamp: slot.stamp, attempts: same ? g.attempts + 1 : 1, failed: same ? g.failed : false });
}

/** The game has been running from the loaded save: the load worked. */
export function confirmLoad(): void {
  writeLoadGuard(null);
}

/** A failure was recorded before the load was confirmed. The save itself is not touched. */
export function failLoad(): void {
  const g = readLoadGuard();
  if (g) writeLoadGuard({ ...g, failed: true });
}
