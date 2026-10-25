import type { GameEvent, GameState } from './types';

export function pushEvent(state: GameState, event: Omit<GameEvent, 'id' | 'day' | 'minute'>): GameEvent {
  const full: GameEvent = { ...event, id: state.nextEventId++, day: state.clock.day, minute: Math.floor(state.clock.minute) };
  state.events.push(full);
  if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
  return full;
}
