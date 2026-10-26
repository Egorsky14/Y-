import { useApp } from './store';
import { AUTOSAVE_KEY, saveToStorage } from '@/persistence/save';

/**
 * Fixed real-time loop driving the simulation. Independent of React render timing:
 * it runs on requestAnimationFrame but accumulates wall-clock time, clamps large gaps
 * (tab switches) and steps the engine in constant increments.
 */
export function startGameLoop(): () => void {
  let last = performance.now();
  let raf = 0;
  let autosaveAccumulator = 0;
  let lastDay = -1;
  const STEP = 1 / 30; // real seconds per simulation step
  let accumulator = 0;

  const frame = (now: number) => {
    // Clamp catch-up to one second so a hitch or a slow frame never spirals, while a 2 fps
    // software renderer still keeps the simulation on real time.
    const dt = Math.min(1.0, (now - last) / 1000);
    last = now;
    const { engine, screen, settings } = useApp.getState();
    if (engine && screen === 'game') {
      accumulator += dt;
      while (accumulator >= STEP) {
        engine.tick(STEP);
        accumulator -= STEP;
      }
      autosaveAccumulator += dt;
      const day = engine.state.clock.day;
      if (settings.autosave && (autosaveAccumulator > 45 || (lastDay !== -1 && day !== lastDay))) {
        autosaveAccumulator = 0;
        saveToStorage(engine.state, AUTOSAVE_KEY);
      }
      lastDay = day;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  // Phones suspend or kill background tabs without warning (app switch, phone call, closing the
  // tab): autosave whenever the page is hidden. requestAnimationFrame pauses while hidden, so the
  // simulation waits too, and catch-up on return is capped at one second by the clamp above.
  const persist = () => {
    const { engine, screen, settings } = useApp.getState();
    if (engine && screen === 'game' && settings.autosave) saveToStorage(engine.state, AUTOSAVE_KEY);
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') persist();
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', persist);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', persist);
  };
}
