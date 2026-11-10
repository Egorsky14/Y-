import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/simulation/engine';
import { nameSeed } from '@/game/customers/names';
import type { EmployeeRole } from '@/game/employees/roles';
import { appearanceFor, partsFor } from '@/world/characters/technicianModel';
import { deserialize, serialize } from '@/persistence/save';
import { reconcileCash } from '@/game/economy/ledger';

const ROLES: EmployeeRole[] = ['technician', 'installer', 'dispatcher', 'comfort-advisor'];

/** Every field of an appearance names something the character model has. */
function expectWearable(look: number): void {
  const a = appearanceFor(look);
  expect(['oval', 'square', 'round', 'long', 'broad', 'weathered'], `face for look ${look}`).toContain(a.face);
  expect(['slim', 'avg', 'heavy']).toContain(a.build);
  expect(['crop', 'buzz', 'curly', 'swept', 'receding', 'bald']).toContain(a.hair);
  expect(['none', 'mustache', 'goatee', 'full']).toContain(a.beard);
  expect(a.skin).toMatch(/^#[0-9a-f]{6}$/);
  expect(a.hairColor).toMatch(/^#[0-9a-f]{6}$/);
  expect(a.height).toBeGreaterThanOrEqual(0.94);
  expect(a.height).toBeLessThanOrEqual(1.06 + 1e-9);
  for (const role of ROLES) for (const lod of [0, 1, 2] as const) for (const p of partsFor(a, role, lod)) expect(p, `part for look ${look}`).not.toMatch(/undefined/);
}

describe('hiring: any candidate can be drawn', () => {
  // Looks are unsigned 32-bit name hashes (nameSeed). Half of them are 2^31 or more; decoding those with a
  // signed shift gave a negative index and no face, and drawing the new hire threw (the P0 "kicked out" bug).
  it('appearanceFor gives a wearable look over the whole unsigned 32-bit range', () => {
    for (const look of [0, 1, 2 ** 31 - 1, 2 ** 31, 2524117870, 3126882328, 2 ** 32 - 1]) expectWearable(look);
    let x = 12345;
    for (let i = 0; i < 2000; i++) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      expectWearable(x);
    }
  });

  it('a look below 2^31 is unchanged (existing staff keep their appearance)', () => {
    // Reference values from the signed decoding, which was correct for these.
    expect(appearanceFor(2043034997)).toEqual({ build: 'heavy', face: 'long', hair: 'receding', beard: 'goatee', skin: '#7e5238', hairColor: '#121212', height: 1.06 });
    expect(appearanceFor(1784119150)).toEqual({ build: 'avg', face: 'round', hair: 'receding', beard: 'none', skin: '#c99a72', hairColor: '#2b1d14', height: 1.02 });
  });

  it('every candidate over 100 campaigns has a wearable look', () => {
    for (let seed = 1; seed <= 100; seed++) for (const c of GameEngine.newGame({ seed }).state.candidates) {
      expect(c.look).toBe(nameSeed(c.name));
      expectWearable(c.look);
    }
  });
});

describe('hiring: the simulation', () => {
  for (const role of ROLES) {
    it(`hiring a ${role} charges once, adds one employee, and survives a save`, () => {
      const engine = GameEngine.newGame({ seed: 42 });
      const c = engine.state.candidates.find((x) => x.role === role)!;
      expect(c).toBeTruthy();
      const cash = engine.state.finance.cash;
      const staff = Object.keys(engine.state.employees).length;
      expect(engine.dispatch({ type: 'hire', candidateId: c.id }).ok).toBe(true);
      expect(engine.state.finance.cash).toBe(cash - Math.round(c.hourlyWage * 8));
      expect(Object.keys(engine.state.employees).length).toBe(staff + 1);
      const hired = Object.values(engine.state.employees).find((e) => e.name === c.name)!;
      expect(hired.role).toBe(role);
      expectWearable(hired.look);
      // The same candidate cannot be hired twice.
      expect(engine.dispatch({ type: 'hire', candidateId: c.id }).ok).toBe(false);
      expect(engine.state.finance.cash).toBe(cash - Math.round(c.hourlyWage * 8));
      engine.advanceMinutes(600);
      expect(reconcileCash(engine.state).ok).toBe(true);
      const back = deserialize(serialize(engine.state))!;
      expect(back.employees[hired.id]).toEqual(engine.state.employees[hired.id]);
    });
  }
});
