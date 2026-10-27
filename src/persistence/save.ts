import { SAVE_SCHEMA_VERSION, type GameState } from '@/game/simulation/types';
import { emptyBanking, upgradeLoan } from '@/game/economy/banking/loans';
import { grantStarterKit, returnOrphanTools } from '@/game/equipment/inventory';

export const SAVE_KEY = 'ego-hvac-v3:save';
export const AUTOSAVE_KEY = 'ego-hvac-v3:autosave';
export const SETTINGS_KEY = 'ego-hvac-v3:settings';

export interface SaveEnvelope {
  schemaVersion: number;
  savedAt: string;
  appVersion: string;
  state: GameState;
}

export function serialize(state: GameState): string {
  const envelope: SaveEnvelope = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    appVersion: '0.1.0',
    state,
  };
  return JSON.stringify(envelope);
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
  state.schemaVersion = SAVE_SCHEMA_VERSION;
  return state;
}

export function deserialize(json: string): GameState {
  const envelope = JSON.parse(json) as SaveEnvelope;
  if (!envelope || typeof envelope.schemaVersion !== 'number' || !envelope.state) throw new Error('Not a valid save file.');
  return migrate(envelope);
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveToStorage(state: GameState, key = SAVE_KEY): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadFromStorage(key = SAVE_KEY): GameState | null {
  const s = storage();
  if (!s) return null;
  try {
    const json = s.getItem(key);
    return json ? deserialize(json) : null;
  } catch {
    return null;
  }
}

export function hasSave(key = SAVE_KEY): boolean {
  const s = storage();
  return !!s && s.getItem(key) !== null;
}

export function clearSave(key = SAVE_KEY): void {
  storage()?.removeItem(key);
}
