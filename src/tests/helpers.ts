import { GameEngine } from '@/game/simulation/engine';
import type { GameState, Job } from '@/game/simulation/types';

/** A campaign whose first call is an ordinary residential job (no mission): the fixture for tests of the regular systems. */
export function newEngine(seed = 42): GameEngine {
  return GameEngine.newGame({ seed, opening: 'residential-call' });
}

export function firstLead(state: GameState): Job {
  const lead = Object.values(state.jobs).find((j) => j.status === 'lead');
  if (!lead) throw new Error('No lead available');
  return lead;
}

/** Advances until predicate is true or maxMinutes elapsed. Returns minutes advanced. */
export function advanceUntil(engine: GameEngine, predicate: (s: GameState) => boolean, maxMinutes = 2000, stepMinutes = 0.5): number {
  let elapsed = 0;
  while (!predicate(engine.state) && elapsed < maxMinutes) {
    engine.advanceMinutes(stepMinutes);
    elapsed += stepMinutes;
  }
  if (!predicate(engine.state)) throw new Error(`Condition not met within ${maxMinutes} minutes`);
  return elapsed;
}

export function expectOk(result: { ok: boolean; reason?: string }): void {
  if (!result.ok) throw new Error(`Action failed: ${result.reason}`);
}
