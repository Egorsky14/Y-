import { createNewGame, type NewGameOptions, BALANCE } from './newGame';
import { advance } from './tick';
import { applyAction, type GameAction } from './actions';
import type { GameState } from './types';
import type { ActionResult } from '../jobs/workflow';

/**
 * The simulation engine owns a GameState and exposes two entry points: `tick(realSeconds)`
 * and `dispatch(action)`. It has no knowledge of React, Three.js, or timers.
 */
export class GameEngine {
  state: GameState;
  /** Monotonic counter bumped on every mutation so subscribers can detect change cheaply. */
  version = 0;
  private listeners = new Set<() => void>();

  constructor(state: GameState) {
    this.state = state;
  }

  static newGame(options?: NewGameOptions): GameEngine {
    return new GameEngine(createNewGame(options));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Advances game time based on elapsed real seconds and the current speed. */
  tick(realSeconds: number): void {
    if (this.state.speed === 0 || this.state.campaignComplete) return;
    const minutes = realSeconds * this.state.speed * BALANCE.minutesPerRealSecond;
    advance(this.state, minutes);
    this.notify();
  }

  /** Advances exactly `minutes` of game time regardless of speed (tests, fast-forward). */
  advanceMinutes(minutes: number): void {
    advance(this.state, minutes);
    this.notify();
  }

  dispatch(action: GameAction): ActionResult {
    const result = applyAction(this.state, action);
    this.notify();
    return result;
  }

  replace(state: GameState): void {
    this.state = state;
    this.notify();
  }
}
