import { test, expect, type Page } from '@playwright/test';

/**
 * Graphics Revolution 3.0 evidence: the technician in the real game, at real jobs, in the same twelve states before and
 * after, from close, gameplay and (when CHARACTER_MOMENTS is set) only the named moments. Everything comes from play:
 * the game is paused for each shot, and the HUD is hidden so nothing is hiding the character.
 *
 * Shots: test-results/character-qa/<QA_LABEL>-<viewport>-<moment>[-view].png. Run with one worker.
 */

test.use({ actionTimeout: 20_000 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;
const LABEL = process.env.QA_LABEL ?? 'shot';
const ONLY = process.env.CHARACTER_MOMENTS?.split(',');
const wanted = (m: string) => !ONLY || ONLY.includes(m);

async function frame(page: Page, azimuthOffset: number, distance: number, targetY: number, elevation = 0.18) {
  await page.evaluate(
    ({ azimuthOffset, distance, targetY, elevation }) => {
      const app = window.__ego!.app.getState() as S;
      // Photo mode lets the camera come down to the character's level; free play keeps it higher.
      app.setPhoto({ on: true });
      const w = window.__egoWorkers?.['emp-owner'];
      if (!w) throw new Error('no worker');
      const head = (window as S).__egoWorkerHeading?.['emp-owner'] ?? 0;
      const az = head + azimuthOffset;
      const dir = { x: Math.sin(az) * Math.cos(elevation), y: Math.sin(elevation), z: Math.cos(az) * Math.cos(elevation) };
      const cam = { x: w.x + dir.x * distance, y: w.y + targetY + dir.y * distance, z: w.z + dir.z * distance };
      const reach = cam.y / dir.y;
      window.__ego!.app.getState().camera({ type: 'focus', target: { x: cam.x - dir.x * reach, z: cam.z - dir.z * reach }, distance: reach, azimuth: az, elevation, targetY: 0 } as S);
    },
    { azimuthOffset, distance, targetY, elevation },
  );
  await page.waitForTimeout(1700);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/character-qa/${LABEL}-${page.viewportSize()!.width}-${name}.png` });
const speed = (page: Page, s: number) =>
  page.evaluate((v) => {
    if (v > 0) (window.__ego!.app.getState() as S).setPhoto({ on: false });
    window.__ego!.dispatch({ type: 'set-speed', speed: v });
  }, s);

async function hideUi(page: Page) {
  await page.addStyleTag({ content: '.top-hud, .action-bar, .world-controls, .toasts, [data-testid="inspector"], .world-labels, .labels-layer, .mission-card, .mission-toast, .service-bar, .hint, .camera-bar, .photo-mode, [data-testid="mission-card"] { display: none !important; }' });
}

async function start(page: Page) {
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  const tap = page.getByTestId('touch-tutorial-ok');
  if (await tap.isVisible().catch(() => false)) await tap.tap();
  await hideUi(page);
  await page.waitForTimeout(1500);
}

const dispatchTo = (page: Page, lotId: string, faultId?: string) =>
  page.evaluate(
    ({ lotId, faultId }) => {
      const e = window.__ego!;
      // Regular business, with the starting call out of the way and the working day under way.
      e.dispatch({ type: 'mission-skip' });
      const s = e.getState() as S;
      for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') e.dispatch({ type: 'decline-lead', jobId: j.id });
      const id = e.spawnLead({ preferredLotId: lotId, channel: 'direct', faultId })!;
      const st = e.getState() as S;
      st.customers[st.jobs[id].customerId].trust = 100;
      e.dispatch({ type: 'accept-lead', jobId: id });
      e.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
      return id;
    },
    { lotId, faultId },
  );

test('renders the character: no shader errors, and its mesh is on screen', async ({ page }) => {
  test.setTimeout(240_000);
  const logged: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logged.push(`${m.type()}: ${m.text().slice(0, 1500)}`); });
  page.on('pageerror', (e) => logged.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) logged.push(`${r.status()} ${r.url()}`); });
  await start(page);
  const info = await page.evaluate(() => (window as S).__egoCharacterDebug?.() ?? null);
  console.log('[character]', JSON.stringify(info));
  for (const l of logged) console.log('[console]', l);
  expect(logged.filter((l) => /shader|program|404|pageerror/i.test(l))).toEqual([]);
});

test('standing, and a ground-level job', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  const vw = page.viewportSize()!.width;
  const close = vw < 800 ? 4.4 : 3.2;
  await frame(page, 0, close, 1.0, 0.1);
  await shot(page, '01-standing-front');
  await frame(page, Math.PI / 2, close, 1.0, 0.1);
  await shot(page, '02-standing-side');
  await frame(page, 0.6, 1.2, 1.56, 0.08);
  await shot(page, '01-face');
  await frame(page, Math.PI, close, 1.0, 0.12);
  await shot(page, '01-standing-back');
  await speed(page, 1);
  await speed(page, 0);
  await page.evaluate(() => {
    const w = window.__egoWorkers!['emp-owner'];
    (window.__ego!.app.getState() as S).camera({ type: 'focus', target: { x: w.x, z: w.z }, distance: 26, azimuth: 0.7, elevation: 0.8, targetY: 0 } as S);
  });
  await page.waitForTimeout(1700);
  await shot(page, '01-gameplay-distance');

  const jobId = await dispatchTo(page, 'n-o-1');
  await page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); return (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 90_000, polling: 30 });
  await speed(page, 1);
  await page.waitForFunction(() => (window as S).__egoWorkerStage?.['emp-owner'] === 'walk', null, { timeout: 40_000 });
  await page.waitForTimeout(1300);
  await speed(page, 0);
  await frame(page, 1.15, close, 0.95, 0.14);
  await shot(page, '03-04-walking-with-toolbox');
  await speed(page, 1);

  await page.waitForFunction((id) => (window.__ego!.getState() as S).jobs[id].status === 'diagnosing' && (window as S).__egoWorkerStage?.['emp-owner'] === 'work', jobId, { timeout: 80_000 });
  await page.waitForTimeout(3600);
  await speed(page, 0);
  await frame(page, 2.3, 2.5, 0.75, 0.22);
  await shot(page, '08-kneeling-ground-condenser');
  await frame(page, -2.2, 2.5, 0.75, 0.22);
  await shot(page, '08-kneeling-other-side');

  await page.evaluate((id) => {
    const e = window.__ego!;
    const s = e.getState() as S;
    e.advanceMinutes(s.jobs[id].phaseRemaining + 0.1);
    const j = (e.getState() as S).jobs[id];
    e.dispatch({ type: 'choose-diagnosis', jobId: id, faultId: j.faultId });
    e.dispatch({ type: 'submit-quote', jobId: id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
  }, jobId);
  const status = await page.evaluate((id) => (window.__ego!.getState() as S).jobs[id].status, jobId);
  if (status === 'repairing') {
    await speed(page, 1);
    await page.waitForTimeout(2800);
    await speed(page, 0);
    await frame(page, 2.3, 2.5, 0.72, 0.24);
    await shot(page, '08-ground-repair');
  }
  expect(errors).toEqual([]);
});

test('the whole rooftop sequence at Mesquite Plaza', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  const vw = page.viewportSize()!.width;
  const close = vw < 800 ? 5 : 3.6;
  await page.evaluate(() => { (window as S).__egoContact = {}; });
  const jobId = await dispatchTo(page, 'cm-plaza', 'contactor');
  await page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); return (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 120_000, polling: 30 });
  await speed(page, 1);
  const at = async (stage: string, wait: number, moment: string, views: [string, number, number, number, number][]) => {
    await page.waitForFunction((st) => (window as S).__egoWorkerStage?.['emp-owner'] === st, `roof:${stage}`, { timeout: 200_000, polling: 30 });
    await page.waitForTimeout(wait);
    if (wanted(moment)) {
      await speed(page, 0);
      for (const [view, az, d, y, el] of views) {
        await frame(page, az, d, y, el);
        await shot(page, `${moment}${view}`);
      }
      await speed(page, 1);
    }
  };
  await at('retrieve', 1700, '05a-taking-ladder-off-rack', [['', 2.4, close + 1.4, 1.4, 0.16]]);
  await at('carry', 2600, '05-carrying-ladder', [['', 1.0, close + 1.5, 1.0, 0.14], ['-side', 2.1, close + 1.5, 1.0, 0.14]]);
  await at('raise', 1600, '05c-raising-ladder', [['', 2.2, close + 2, 1.4, 0.1]]);
  await at('climb', 2300, '06-climbing-ladder', [['', 2.55, close, 0.9, 0.05], ['-side', 1.57, close, 0.9, 0.05]]);
  await at('transfer', 800, '07-onto-roof', [['', 2.3, close, 0.8, 0.18], ['-side', 1.3, close, 0.8, 0.18]]);
  await page.waitForFunction((id) => { const s = window.__ego!.getState() as S; return s.jobs[id].status === 'diagnosing'; }, jobId, { timeout: 200_000, polling: 100 });
  await page.waitForFunction(() => (window as S).__egoWorkerStage?.['emp-owner'] === 'roof:work', null, { timeout: 60_000, polling: 50 });
  await page.waitForTimeout(3600);
  await speed(page, 0);
  await frame(page, 2.3, close - 0.6, 0.75, 0.26);
  await shot(page, '09-diagnosing-rtu');
  await frame(page, -2.2, close - 0.6, 0.75, 0.26);
  await shot(page, '09-diagnosing-rtu-other-side');
  await page.evaluate((id) => {
    const e = window.__ego!;
    const s = e.getState() as S;
    e.advanceMinutes(s.jobs[id].phaseRemaining + 0.1);
    const j = (e.getState() as S).jobs[id];
    e.dispatch({ type: 'choose-diagnosis', jobId: id, faultId: j.faultId });
    e.dispatch({ type: 'submit-quote', jobId: id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
  }, jobId);
  await speed(page, 1);
  await page.waitForTimeout(2800);
  await speed(page, 0);
  await frame(page, 2.3, close - 0.6, 0.75, 0.26);
  await shot(page, '10-repairing-rtu');
  await frame(page, -2.2, close - 0.6, 0.75, 0.26);
  await shot(page, '10-repairing-rtu-other-side');
  await page.evaluate((id) => {
    const e = window.__ego!;
    const s = e.getState() as S;
    e.advanceMinutes(s.jobs[id].phaseRemaining + 0.1);
  }, jobId);
  await speed(page, 1);
  await at('climb', 2600, '11-descending-ladder', [['', 2.55, close, 0.9, 0.05], ['-side', 1.57, close, 0.9, 0.05]]);
  await at('carry', 2400, '11b-carrying-back', [['', 1.0, close + 1.5, 1.0, 0.14]]);
  await at('stow', 1100, '11c-stowing-ladder', [['', 2.2, close + 1.4, 1.4, 0.14]]);
  const worst = await page.evaluate(() => (window as S).__egoContact ?? {});
  console.log(`[contact] worst hand or foot shortfall by clip (m): ${JSON.stringify(worst)}`);
  expect(errors).toEqual([]);
});
