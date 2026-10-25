import { SAVE_SCHEMA_VERSION, type GameState } from '@/game/simulation/types';

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
  // Schema 1 is the first public schema. Future versions add cases here.
  if (envelope.schemaVersion > SAVE_SCHEMA_VERSION) throw new Error(`Save is from a newer version (${envelope.schemaVersion}).`);
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
