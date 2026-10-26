import { describe, expect, it } from 'vitest';
import { enqueueCelebrations, useApp, type Toast } from '@/app/store';

const toast = (id: number, title = `c${id}`): Toast => ({ id, type: 'celebration', title, createdAt: 0 });

describe('celebration queue', () => {
  it('keeps arrival order and never replaces the banner on screen', () => {
    const q = enqueueCelebrations([toast(1, 'Hired Maria')], [toast(2, 'Milestone'), toast(3, 'Company Level 2')]);
    expect(q.map((t) => t.title)).toEqual(['Hired Maria', 'Milestone', 'Company Level 2']);
  });

  it('drops the oldest waiting entries on overflow, not the head', () => {
    const q = enqueueCelebrations([toast(1)], [2, 3, 4, 5, 6].map((i) => toast(i)), 4);
    expect(q.map((t) => t.id)).toEqual([1, 4, 5, 6]);
  });

  it('a first hire that unlocks a milestone on the same tick still shows "Hired" first', () => {
    const app = useApp.getState();
    app.newGame(42);
    const engine = useApp.getState().engine!;
    const candidate = engine.state.candidates[0];
    expect(app.dispatch({ type: 'hire', candidateId: candidate.id }).ok).toBe(true);
    engine.advanceMinutes(5);
    useApp.getState().bump();
    const { celebrations, toasts } = useApp.getState();
    expect(celebrations.length).toBeGreaterThanOrEqual(2); // the hire and the First Hire milestone
    expect(celebrations[0].title).toBe(`Hired ${candidate.name}`);
    expect(toasts.some((t) => t.type === 'celebration')).toBe(false);
    // Dismissing the head (timer or click) brings up the next one, in order.
    const rest = celebrations.slice(1).map((t) => t.title);
    useApp.getState().dismissCelebration(celebrations[0].id);
    expect(useApp.getState().celebrations.map((t) => t.title)).toEqual(rest);
  });
});
