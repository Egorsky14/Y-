import { test } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

/**
 * Frame-time benchmark for the character work: the opening scene, then ten extra technicians
 * (copies of the owner record with their own ids and looks) standing in the HQ lot in front of a
 * close camera, all animating. Records requestAnimationFrame intervals (mean, p95, worst) over five
 * seconds and the renderer's draw calls and triangles, to test-results/technician-perf/<label>.json.
 * The numbers depend on the machine and on vsync; compare runs on the same machine only.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;
const LABEL = process.env.SHOWCASE_LABEL ?? 'run';

async function sample(page: import('@playwright/test').Page, seconds: number) {
  return page.evaluate(
    (ms) =>
      new Promise<{ mean: number; p95: number; worst: number; frames: number; calls: number; triangles: number }>((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        const t0 = last;
        const tick = (now: number) => {
          times.push(now - last);
          last = now;
          if (now - t0 < ms) requestAnimationFrame(tick);
          else {
            const sorted = [...times].sort((a, b) => a - b);
            const r = window.__egoRender!;
            resolve({ mean: times.reduce((a, b) => a + b, 0) / times.length, p95: sorted[Math.floor(sorted.length * 0.95)], worst: sorted[sorted.length - 1], frames: times.length, calls: r.calls, triangles: r.triangles });
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds * 1000,
  );
}

test('technician frame-time benchmark', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 1 }));
  await page.waitForTimeout(4000);
  const opening = await sample(page, 5);

  await page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    const owner = s.employees['emp-owner'];
    for (let i = 0; i < 10; i++) {
      const id = `emp-bench-${i}`;
      s.employees[id] = { ...structuredClone(owner), id, name: `Bench ${i}`, isOwner: false, look: 1000 + i * 977, status: 'idle', position: { x: 40 + (i % 5) * 1.6, z: 30 + Math.floor(i / 5) * 2.2 } };
    }
    window.__ego!.advanceMinutes(0.01);
    window.__ego!.app.getState().camera({ type: 'focus', target: { x: 43.2, z: 31.1 }, distance: 9, azimuth: -Math.PI / 2 + 0.3, elevation: 0.35, targetY: 0 } as S);
  });
  await page.waitForTimeout(4000);
  const tenTechs = await sample(page, 5);
  await page.screenshot({ path: `test-results/technician-perf/${LABEL}-ten-techs.png` });

  mkdirSync('test-results/technician-perf', { recursive: true });
  const result = { label: LABEL, viewport: page.viewportSize(), opening, tenTechs };
  writeFileSync(`test-results/technician-perf/${LABEL}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
});
