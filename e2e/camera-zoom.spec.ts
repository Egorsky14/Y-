import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Manual zoom in the real game, with real input: the mouse wheel on desktop, a two-finger pinch through the browser's touch
 * pipeline on phones, and the on-screen buttons. No test here passes because an event arrived: each one measures where the
 * camera went, how large the technician is drawn on screen, and that the rendered picture changed.
 *
 * The bug this guards: the zoom pivoted on a point on the ground, so on a roof zooming in flew down through the deck, away from
 * the technician (2.2 m to 14.3 m in Detail at Mesquite Plaza), and the director froze for 8 s and then replaced the
 * player's distance with its own. Before-and-after shots: test-results/camera-zoom/. Run with one worker.
 */

test.use({ actionTimeout: 20_000 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;
type Metrics = { d: number; px: number; onScreen: boolean; camY: number; techY: number; stage: string; factor: number; reason: string };

const isTouch = (page: Page) => page.evaluate(() => matchMedia('(pointer: coarse)').matches);
const shotName = (page: Page, name: string) => `test-results/camera-zoom/${page.viewportSize()!.width}-${name}.png`;

async function metrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => {
    const w = window as S;
    const c = w.__egoRender.cam as number[];
    const p = w.__egoWorkers['emp-owner'];
    const stage = w.__egoWorkerStage?.['emp-owner'] ?? '-';
    const working = stage === 'work' || stage === 'roof:work';
    const s = { x: p.x, y: p.y + (working ? 0.85 : 1.3), z: p.z };
    // How large a person is drawn at his distance, by projecting a fixed 1 m upright at him; poses do not change it.
    const a = w.__egoProject(s.x, s.y - 0.5, s.z);
    const b = w.__egoProject(s.x, s.y + 0.5, s.z);
    const mid = w.__egoProject(s.x, s.y, s.z);
    const box = document.querySelector('.app-world canvas')!.getBoundingClientRect();
    return {
      d: Math.hypot(c[0] - s.x, c[1] - s.y, c[2] - s.z),
      px: Math.hypot(a.x - b.x, a.y - b.y),
      onScreen: mid.inFront && mid.x > box.left && mid.x < box.right && mid.y > box.top && mid.y < box.bottom,
      camY: c[1],
      techY: p.y,
      stage,
      factor: w.__egoServiceZoom.factor,
      reason: w.__egoServiceView?.reason ?? '-',
    };
  });
}

async function start(page: Page) {
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  if (await isTouch(page)) await page.getByTestId('new-game').tap();
  else await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  const ok = page.getByTestId('touch-tutorial-ok');
  if (await ok.isVisible().catch(() => false)) await ok.tap();
  await page.waitForTimeout(500);
}

const dispatchTo = (page: Page, lot: string) =>
  page.evaluate((lotId) => {
    const e = window.__ego!;
    e.dispatch({ type: 'mission-skip' });
    const s = e.getState() as S;
    for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') e.dispatch({ type: 'decline-lead', jobId: j.id });
    const id = e.spawnLead({ preferredLotId: lotId, channel: 'direct', faultId: 'contactor' })!;
    const st = e.getState() as S;
    st.customers[st.jobs[id].customerId].trust = 100;
    e.dispatch({ type: 'accept-lead', jobId: id });
    e.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    return id;
  }, lot);

const untilOnsite = (page: Page) => page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); return (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 120_000, polling: 30 });
const stageIs = (page: Page, stage: string) => page.waitForFunction((st) => (window as S).__egoWorkerStage?.['emp-owner'] === st, stage, { timeout: 240_000, polling: 40 });
const setSpeed = (page: Page, v: number) => page.evaluate((x) => window.__ego!.dispatch({ type: 'set-speed', speed: x }), v);

async function press(page: Page, testId: string) {
  if (await isTouch(page)) await page.getByTestId(testId).tap();
  else await page.getByTestId(testId).click();
}

async function watch(page: Page, jobId: string) {
  await page.evaluate((id) => (window.__ego!.app.getState() as S).select({ kind: 'job', id }), jobId);
  await press(page, 'watch-technician');
  await page.evaluate(() => (window.__ego!.app.getState() as S).setInspectorCompact(true));
}

async function overWorld(page: Page) {
  const { width, height } = page.viewportSize()!;
  await page.mouse.move(width * 0.45, height * 0.55);
}

/** The real wheel: negative notches zoom in. */
async function wheel(page: Page, notches: number, pixels = 120) {
  await overWorld(page);
  for (let i = 0; i < Math.abs(notches); i++) {
    await page.mouse.wheel(0, Math.sign(notches) * pixels);
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(500);
}

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: number[][]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
}

/** A real two-finger pinch: spread > 0 moves the fingers apart (zooming in). */
async function pinch(page: Page, cdp: CDPSession, spread: number) {
  const box = (await page.locator('.app-world canvas').first().boundingBox())!;
  const r0 = spread > 0 ? 25 : 25 + Math.abs(spread);
  const reach = 25 + Math.abs(spread);
  // Where a player would pinch: somewhere both fingers touch the world for the whole gesture, not a card over it.
  const spot = await page.evaluate(([w, h, r]) => {
    for (const fy of [0.55, 0.45, 0.65, 0.35, 0.75]) {
      for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const x = w * fx;
        const y = h * fy;
        const onWorld = [-r, -r / 2, r / 2, r].every((d) => document.elementFromPoint(x + d, y)?.closest('.app-world'));
        if (onWorld) return [x, y];
      }
    }
    return null;
  }, [box.width, box.height, reach]);
  expect(spot, 'there is open world to pinch on').not.toBeNull();
  const cx = box.x + spot![0];
  const cy = box.y + spot![1];
  const at = (r: number) => [[cx - r, cy], [cx + r, cy]];
  await touch(cdp, 'touchStart', at(r0));
  for (let i = 1; i <= 10; i++) {
    await touch(cdp, 'touchMove', at(r0 + (spread * i) / 10));
    await page.waitForTimeout(25);
  }
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(600);
}

async function differs(page: Page, before: Buffer, name: string) {
  const after = await page.screenshot({ path: shotName(page, name) });
  expect(after.equals(before), `${name}: the rendered picture did not change`).toBe(false);
}

const near = (a: number, b: number, share: number) => Math.abs(a - b) / Math.max(b, 1e-3) <= share;

test.beforeAll(() => mkdirSync('test-results/camera-zoom', { recursive: true }));

test('residential service: Property, Watch Work and Detail all zoom, and keep it', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  test.skip(await isTouch(page), 'wheel test: touch has its own below');
  const job = await dispatchTo(page, 'n-o-1');
  await untilOnsite(page);
  await setSpeed(page, 1);
  await watch(page, job);
  await stageIs(page, 'walk');
  await page.waitForTimeout(800);

  // Walking: zoom in, and the followed view keeps him at that distance as he walks.
  const w0 = await metrics(page);
  await wheel(page, -3);
  const w1 = await metrics(page);
  expect(w1.d, 'walking: wheel in brings the camera closer').toBeLessThan(w0.d * 0.85);
  await stageIs(page, 'work');
  await page.waitForTimeout(3500);

  for (const mode of ['detail', 'property', 'work'] as const) {
    await press(page, `service-view-${mode}`);
    await page.waitForTimeout(2600);
    const home = await metrics(page);
    expect(home.factor, `${mode}: a deliberate mode change starts at its own distance`).toBe(1);
    const before = await page.screenshot({ path: shotName(page, `residential-${mode}-1-default`) });

    await wheel(page, -5);
    const zin = await metrics(page);
    expect(zin.d, `${mode}: wheel in moves the camera closer`).toBeLessThan(home.d * 0.8);
    expect(zin.px, `${mode}: wheel in draws him larger`).toBeGreaterThan(home.px * 1.2);
    expect(zin.onScreen, `${mode}: he stays on screen`).toBe(true);
    await differs(page, before, `residential-${mode}-2-zoomed-in`);

    // Past the director's old 8 s hold-off, with him working: no snapping back.
    await page.waitForTimeout(10_000);
    const held = await metrics(page);
    expect(near(held.d, zin.d, 0.05), `${mode}: zoom held after 10 s (${zin.d.toFixed(2)} → ${held.d.toFixed(2)} m)`).toBe(true);

    await wheel(page, 9);
    const zout = await metrics(page);
    expect(zout.d, `${mode}: wheel out moves the camera farther than the default`).toBeGreaterThan(home.d * 1.1);
    expect(zout.px).toBeLessThan(home.px * 0.92);
    await page.screenshot({ path: shotName(page, `residential-${mode}-3-zoomed-out`) });
    await wheel(page, -4);
  }

  // Back to Watch Work, in close: the job moving on keeps the zoom.
  await press(page, 'service-view-work');
  await page.waitForTimeout(2600);
  await wheel(page, -6);
  const close = await metrics(page);
  await page.evaluate((id) => {
    const e = window.__ego!;
    e.advanceMinutes((e.getState() as S).jobs[id].phaseRemaining + 0.1);
    const j = (e.getState() as S).jobs[id];
    e.dispatch({ type: 'choose-diagnosis', jobId: id, faultId: j.faultId });
    e.dispatch({ type: 'submit-quote', jobId: id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
  }, job);
  await page.waitForTimeout(4000);
  const repairing = await metrics(page);
  expect(repairing.reason, 'the director did reframe for the new phase').toBe('phase');
  expect(near(repairing.factor, close.factor, 0.02), 'that reframe kept the zoom').toBe(true);
  expect(near(repairing.d, close.d, 0.35), `distance after the phase change (${close.d.toFixed(2)} → ${repairing.d.toFixed(2)} m)`).toBe(true);

  // Right in: close enough to inspect him, and never through him.
  await wheel(page, -30);
  const tight = await metrics(page);
  expect(tight.d, 'closest zoom').toBeLessThan(1.6);
  expect(tight.d, 'never inside him').toBeGreaterThan(0.9);
  expect(tight.onScreen).toBe(true);
  await page.screenshot({ path: shotName(page, 'residential-closest') });

  // Reset, the deliberate way back.
  await press(page, 'service-zoom-reset');
  await page.waitForTimeout(2200);
  const reset = await metrics(page);
  expect(reset.factor).toBe(1);
  expect(reset.d, 'reset returns to the default framing').toBeGreaterThan(tight.d * 1.5);
  expect(errors).toEqual([]);
});

test('rooftop service: zoom holds through carrying, climbing and the roof, at every speed', async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  test.skip(await isTouch(page), 'wheel test: touch has its own below');
  const job = await dispatchTo(page, 'cm-plaza');
  await untilOnsite(page);
  await setSpeed(page, 1);
  await watch(page, job);

  // Carrying the ladder: he walks, and the view keeps him at the chosen distance (before: 1.9 m, then 8 m, then a reset).
  await stageIs(page, 'roof:carry');
  await page.waitForTimeout(1500);
  // He is moving and the shot may be between follow moves, so one reading before the wheel says little: the player's zoom
  // is read here, and the camera's answer is measured below, once framed and steady.
  await wheel(page, -4);
  const c1 = await metrics(page);
  expect(c1.factor, 'carrying: the wheel took').toBeLessThan(0.75);
  // The shot may be between follow moves as the wheel turns; it brings him back at that distance, and from then on he stays.
  await expect.poll(async () => (await metrics(page)).onScreen, { message: 'carrying: he is framed at the zoomed distance', timeout: 6000 }).toBe(true);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: shotName(page, 'rooftop-carry-zoomed') });
  const framed = await metrics(page);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1000);
    const m = await metrics(page);
    if (m.stage !== 'roof:carry') break;
    expect(m.factor, 'carrying: the zoom is kept').toBeLessThan(0.95);
    expect(near(m.d, framed.d, 0.3), `carrying: the distance holds as he walks, after ${i + 1} s (${framed.d.toFixed(2)} → ${m.d.toFixed(2)} m)`).toBe(true);
    expect(m.onScreen, `carrying: he stays on screen after ${i + 1} s`).toBe(true);
  }

  if ((await metrics(page)).stage === 'roof:carry') {
    const held = await metrics(page);
    await wheel(page, 3);
    await page.waitForTimeout(600);
    const back = await metrics(page);
    expect(back.d, 'carrying: wheel out moves the camera back').toBeGreaterThan(held.d * 1.15);
    expect(back.px, 'carrying: wheel out draws him smaller').toBeLessThan(held.px * 0.9);
    await wheel(page, -3);
  }

  // Climbing: the zoom carries over, he stays on screen as he rises, and the limit keeps the rails in shot.
  await stageIs(page, 'roof:climb');
  await page.waitForTimeout(1900);
  const climbA = await metrics(page);
  expect(climbA.onScreen, 'climbing: on screen').toBe(true);
  expect(climbA.factor, 'climbing: the zoom from the ground is still there').toBeLessThan(0.95);
  await wheel(page, -30);
  const climbB = await metrics(page);
  expect(climbB.d, 'ladder limit: rails stay in shot').toBeGreaterThan(2.0);
  expect(climbB.onScreen).toBe(true);
  await page.screenshot({ path: shotName(page, 'rooftop-climb-closest') });
  await page.waitForTimeout(1200);
  const climbC = await metrics(page);
  expect(climbC.techY, 'he kept climbing').toBeGreaterThan(climbA.techY);
  expect(climbC.onScreen, 'climbing: still on screen further up').toBe(true);
  expect(climbC.d, 'climbing: the camera rose with him').toBeLessThan(climbB.d * 1.5);

  await stageIs(page, 'roof:work');
  await page.waitForTimeout(3000);

  // The reproduced bug: Detail on the roof, zooming in, flew down through the deck.
  await press(page, 'service-view-detail');
  await page.waitForTimeout(2600);
  const d0 = await metrics(page);
  const before = await page.screenshot({ path: shotName(page, 'rooftop-detail-1-default') });
  await wheel(page, -10);
  const d1 = await metrics(page);
  expect(d1.d, 'rooftop Detail: wheel in goes toward him, not away').toBeLessThan(d0.d);
  expect(d1.camY, 'rooftop Detail: the camera stays above the deck').toBeGreaterThan(d1.techY + 0.4);
  expect(d1.onScreen).toBe(true);
  expect(d1.d, 'rooftop Detail: close enough for face, hands and tools').toBeLessThan(1.6);
  await differs(page, before, 'rooftop-detail-2-closest');
  await wheel(page, 14);
  const d2 = await metrics(page);
  expect(d2.d, 'rooftop Detail: wheel out comes back').toBeGreaterThan(d1.d * 2);
  expect(d2.camY).toBeGreaterThan(d2.techY);

  // Watch Work and Property on the roof, out to the whole work area.
  await press(page, 'service-view-work');
  await page.waitForTimeout(2600);
  const w0 = await metrics(page);
  await wheel(page, 12);
  const w1 = await metrics(page);
  expect(w1.d, 'rooftop Watch Work: wheel out').toBeGreaterThan(w0.d * 1.5);
  expect(w1.onScreen).toBe(true);
  await page.screenshot({ path: shotName(page, 'rooftop-work-area') });
  await press(page, 'service-view-property');
  await page.waitForTimeout(2600);
  const p0 = await metrics(page);
  await wheel(page, -6);
  const p1 = await metrics(page);
  expect(p1.d, 'rooftop Property: wheel in').toBeLessThan(p0.d * 0.8);
  expect(p1.camY).toBeGreaterThan(p1.techY);

  // At each game speed the zoom still answers and is kept.
  await press(page, 'service-view-work');
  await page.waitForTimeout(2600);
  await wheel(page, -5);
  for (const v of [2, 5, 1]) {
    await setSpeed(page, v);
    await page.waitForTimeout(1200);
    const a = await metrics(page);
    await wheel(page, 2);
    const b = await metrics(page);
    expect(b.d, `at ${v}×: wheel out answers`).toBeGreaterThan(a.d * 1.1);
    await wheel(page, -2);
    await page.waitForTimeout(800);
    const c = await metrics(page);
    expect(near(c.d, a.d, 0.12), `at ${v}×: wheel in returns (${a.d.toFixed(2)} → ${c.d.toFixed(2)} m)`).toBe(true);
  }

  // Coming down: the job moves on and the zoom goes with it.
  const zoomed = (await metrics(page)).factor;
  await page.evaluate((id) => {
    const e = window.__ego!;
    e.advanceMinutes((e.getState() as S).jobs[id].phaseRemaining + 0.1);
    const j = (e.getState() as S).jobs[id];
    e.dispatch({ type: 'choose-diagnosis', jobId: id, faultId: j.faultId });
    e.dispatch({ type: 'submit-quote', jobId: id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
    e.advanceMinutes((e.getState() as S).jobs[id].phaseRemaining + 0.1);
  }, job);
  await page.waitForFunction(() => (window as S).__egoWorkerStage?.['emp-owner'] === 'roof:climb', null, { timeout: 120_000, polling: 40 });
  await page.waitForTimeout(1500);
  const down = await metrics(page);
  expect(near(down.factor, zoomed, 0.25), `descending: zoom kept (${zoomed.toFixed(2)} → ${down.factor.toFixed(2)})`).toBe(true);
  expect(down.onScreen, 'descending: on screen').toBe(true);
  await page.screenshot({ path: shotName(page, 'rooftop-descending') });
  expect(errors).toEqual([]);
});

test('van arrival: the wheel works while he is still inside, and the zoom carries over as he steps out', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  test.skip(await isTouch(page), 'wheel test: touch has its own below');

  // Residential, at full running speed: straight in as the van pulls up, during the service camera's first flight.
  const home = await dispatchTo(page, 'n-o-1');
  await untilOnsite(page);
  await setSpeed(page, 1);
  await watch(page, home);
  expect((await metrics(page)).stage, 'residential: he is still in the van').toBe('riding');
  await wheel(page, -3);
  const rides = await metrics(page);
  expect(rides.factor, 'residential: the wheel took while he rides in').toBeLessThan(0.8);
  await stageIs(page, 'walk');
  // A zoom during the flight to the site used to drag its destination short of the site, which ended the service camera.
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).serviceView?.mode), 'residential: the service camera stayed on').toBe('work');
  await expect.poll(async () => (await metrics(page)).onScreen, { message: 'residential: framed as he walks', timeout: 8000 }).toBe(true);
  const walks = await metrics(page);
  expect(near(walks.factor, rides.factor, 0.05), `residential: zoom kept as he steps out (${rides.factor.toFixed(2)} → ${walks.factor.toFixed(2)})`).toBe(true);
  await page.screenshot({ path: shotName(page, 'arrival-residential-walking') });
  expect(errors).toEqual([]);
});

test('van arrival at a roof: the camera answers while he is in the van, and the zoom carries over', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  test.skip(await isTouch(page), 'wheel test: touch has its own below');
  // With nobody to scale about, the zoom pivots on the shot's aim point on the ground, so the camera's height is in direct proportion to it.
  const height = () => page.evaluate(() => window.__egoRender!.cam[1]);
  const roof = await dispatchTo(page, 'cm-plaza');
  await untilOnsite(page);
  await setSpeed(page, 1);
  await watch(page, roof);
  await setSpeed(page, 0);
  expect((await metrics(page)).stage, 'rooftop: he is still in the van').toBe('roof:riding');
  await page.waitForTimeout(2000);
  const v0 = await height();
  const before = await page.screenshot({ path: shotName(page, 'arrival-rooftop-1-default') });
  await wheel(page, -4);
  const v1 = await height();
  expect(v1, `rooftop: wheel in brings the camera in (height ${v0.toFixed(2)} → ${v1.toFixed(2)} m)`).toBeLessThan(v0 * 0.85);
  await differs(page, before, 'arrival-rooftop-2-zoomed-in');
  await wheel(page, 4);
  const v2 = await height();
  expect(near(v2, v0, 0.05), `rooftop: wheel out undoes it (height ${v0.toFixed(2)} → ${v2.toFixed(2)} m)`).toBe(true);
  await wheel(page, -3);
  const held = (await metrics(page)).factor;
  expect(held).toBeLessThan(0.8);
  await setSpeed(page, 1);
  await stageIs(page, 'roof:to-rack');
  await page.waitForTimeout(600);
  const out = await metrics(page);
  expect(near(out.factor, held, 0.05), `rooftop: zoom kept as he steps out (${held.toFixed(2)} → ${out.factor.toFixed(2)})`).toBe(true);
  await expect.poll(async () => (await metrics(page)).onScreen, { message: 'rooftop: framed once he is out', timeout: 8000 }).toBe(true);
  await page.screenshot({ path: shotName(page, 'arrival-rooftop-3-out-of-the-van') });
  expect(errors).toEqual([]);
});

test('ladder at 5×: the wheel works mid-climb and mid-descent, and the camera keeps him', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  test.skip(await isTouch(page), 'wheel test: touch has its own below');
  const job = await dispatchTo(page, 'cm-plaza');
  await untilOnsite(page);
  await setSpeed(page, 1);
  await watch(page, job);
  await setSpeed(page, 5);

  // Going up.
  await stageIs(page, 'roof:climb');
  const start0 = await metrics(page);
  expect(start0.factor).toBe(1);
  // No settling time here: at 5× the climb is over in moments.
  await overWorld(page);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(30);
  }
  const mid = await metrics(page);
  await page.screenshot({ path: shotName(page, 'ladder-5x-up') });
  expect(mid.stage, 'still on the ladder as the wheel turned').toMatch(/roof:(climb|transfer)/);
  await page.waitForTimeout(250);
  const zoomed = await metrics(page);
  expect(zoomed.factor, 'climbing at 5×: the wheel took').toBeLessThan(0.8);
  expect(zoomed.d, 'climbing at 5×: not inside him').toBeGreaterThan(0.9);

  // On the roof at the unit: he is framed at that zoom, and closer than the default framing, which is the visible proof.
  await stageIs(page, 'roof:work');
  await setSpeed(page, 1);
  await page.waitForTimeout(2600);
  const onRoof = await metrics(page);
  expect(near(onRoof.factor, zoomed.factor, 0.1), `zoom kept to the roof (${zoomed.factor.toFixed(2)} → ${onRoof.factor.toFixed(2)})`).toBe(true);
  expect(onRoof.onScreen, 'on the roof: on screen').toBe(true);
  expect(onRoof.camY, 'on the roof: above the deck').toBeGreaterThan(onRoof.techY + 0.4);
  await page.screenshot({ path: shotName(page, 'ladder-5x-on-roof-zoomed') });
  await press(page, 'service-zoom-reset');
  await page.waitForTimeout(2300);
  const fresh = await metrics(page);
  expect(fresh.factor).toBe(1);
  expect(onRoof.d, `the zoom made him closer than the default framing (${onRoof.d.toFixed(2)} vs ${fresh.d.toFixed(2)} m)`).toBeLessThan(fresh.d * 0.85);
  expect(onRoof.px, 'and larger on screen').toBeGreaterThan(fresh.px * 1.15);

  // Coming down at 5×, out and back in on the rungs.
  await wheel(page, -3);
  const kept = (await metrics(page)).factor;
  await page.evaluate((id) => {
    const e = window.__ego!;
    e.advanceMinutes((e.getState() as S).jobs[id].phaseRemaining + 0.1);
    const j = (e.getState() as S).jobs[id];
    e.dispatch({ type: 'choose-diagnosis', jobId: id, faultId: j.faultId });
    e.dispatch({ type: 'submit-quote', jobId: id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
    e.advanceMinutes((e.getState() as S).jobs[id].phaseRemaining + 0.1);
  }, job);
  await setSpeed(page, 5);
  await stageIs(page, 'roof:climb');
  const down0 = await metrics(page);
  expect(near(down0.factor, kept, 0.1), `zoom kept to the descent (${kept.toFixed(2)} → ${down0.factor.toFixed(2)})`).toBe(true);
  await overWorld(page);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  const down1 = await metrics(page);
  expect(down1.factor, 'descending at 5×: the wheel took').toBeGreaterThan(down0.factor * 1.2);
  await page.screenshot({ path: shotName(page, 'ladder-5x-down') });
  await page.waitForFunction(() => (window.__ego!.getState() as S).vehicles['veh-1'].status !== 'onsite', null, { timeout: 120_000 });
  expect(errors).toEqual([]);
});

test('free play: the wheel zooms the city, keeps a followed truck, leaves the panels alone; Photo Mode unchanged', async ({ page }) => {
  test.setTimeout(240_000);
  await start(page);
  test.skip(await isTouch(page), 'wheel test: touch has its own below');
  const cam = () => page.evaluate(() => window.__egoRender!.cam);
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  await page.evaluate(() => window.__ego!.dispatch({ type: 'mission-skip' }));
  await press(page, 'cam-reset');
  await page.waitForTimeout(1500);

  // City overview, in and back out.
  const a = await cam();
  await wheel(page, -8);
  const b = await cam();
  expect(dist(a, b), 'city: wheel in moves the camera').toBeGreaterThan(5);
  expect(b[1], 'city: wheel in brings it down').toBeLessThan(a[1]);
  await wheel(page, 8);
  const c = await cam();
  expect(dist(a, c), 'city: wheel out undoes it').toBeLessThan(2);

  // The page itself never scrolls or zooms.
  expect(await page.evaluate(() => [window.scrollX, window.scrollY, visualViewport?.scale ?? 1])).toEqual([0, 0, 1]);

  // A panel scrolls itself; the camera stays.
  await press(page, 'nav-finance');
  await page.waitForTimeout(500);
  // The point to scroll over is whatever sits at the screen's centre with the panel open: it must be the panel, not the world.
  const { width, height } = page.viewportSize()!;
  const overPanel = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y)!; return !el.closest('.app-world, .world-labels'); }, [width / 2, height / 2]);
  expect(overPanel, 'the finance panel covers the centre of the screen').toBe(true);
  await page.mouse.move(width / 2, height / 2);
  const beforePanel = await cam();
  await page.mouse.wheel(0, -480);
  await page.waitForTimeout(500);
  expect(dist(beforePanel, await cam()), 'wheel over a panel leaves the camera').toBeLessThan(0.01);
  await page.evaluate(() => (window.__ego!.app.getState() as S).openPanel(null));

  // Drags keep working, again and again, with the game running. The controls used to be rebuilt ten times a second, which
  // dropped a held pointer's release and left every later gesture ignored.
  await setSpeed(page, 1);
  for (let g = 1; g <= 3; g++) {
    const { width: w, height: h } = page.viewportSize()!;
    const s0 = await cam();
    await page.mouse.move(w * 0.5, h * 0.5);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(w * 0.5 + i * 12 * (g % 2 ? 1 : -1), h * 0.5 + i * 6);
      await page.waitForTimeout(60);
    }
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(dist(s0, await cam()), `drag ${g} of 3 held for half a second moves the camera`).toBeGreaterThan(1);
  }

  // Following a truck: zooming must not drop the follow.
  const job = await dispatchTo(page, 'n-o-1');
  await page.evaluate(() => (window.__ego!.app.getState() as S).camera({ type: 'follow', vehicleId: 'veh-1' }));
  await page.waitForTimeout(1400);
  const f0 = await cam();
  await wheel(page, -4);
  const f1 = await cam();
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).followVehicleId), 'still following the truck').toBe('veh-1');
  expect(f1[1], 'following: the zoom took').toBeLessThan(f0[1]);
  expect(job).toBeTruthy();

  // Photo Mode keeps its own controls.
  await page.evaluate(() => (window.__ego!.app.getState() as S).setPhoto({ on: true }));
  await page.waitForTimeout(500);
  const p0 = await cam();
  await wheel(page, -3);
  expect(dist(p0, await cam()), 'Photo Mode: the wheel still zooms').toBeGreaterThan(0.5);
  await page.evaluate(() => (window.__ego!.app.getState() as S).setPhoto({ on: false }));
});

test('touch: a real pinch and the buttons zoom the service camera and the city', async ({ page }) => {
  test.setTimeout(420_000);
  await start(page);
  test.skip(!(await isTouch(page)), 'touch only');
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => window.__ego!.dispatch({ type: 'mission-skip' }));
  const scroll = () => page.evaluate(() => [window.scrollX, window.scrollY, visualViewport?.scale ?? 1]);

  // City: pinch after pinch, with the game running. Before the fix only an instant first gesture did anything.
  await setSpeed(page, 1);
  await page.getByTestId('cam-reset').tap();
  await page.waitForTimeout(1500);
  const camNow = () => page.evaluate(() => window.__egoRender!.cam);
  const span = (c: number[]) => Math.hypot(c[0] - 22, c[1], c[2] - 14);
  let last = span(await camNow());
  for (let g = 1; g <= 3; g++) {
    await pinch(page, cdp, 25);
    const now = span(await camNow());
    expect(now, `city: pinch ${g} of 3 brings the camera closer (${last.toFixed(1)} → ${now.toFixed(1)} m)`).toBeLessThan(last * 0.8);
    last = now;
  }
  await pinch(page, cdp, -25);
  expect(span(await camNow()), 'city: pinching in moves it back out').toBeGreaterThan(last * 1.2);
  expect(await scroll(), 'the page itself does not scroll or zoom').toEqual([0, 0, 1]);

  // A job at Mesquite Plaza, on the roof, where the zoom used to fail.
  const job = await dispatchTo(page, 'cm-plaza');
  await untilOnsite(page);
  await setSpeed(page, 1);
  await watch(page, job);
  await stageIs(page, 'roof:work');
  await page.waitForTimeout(3000);
  for (const mode of ['detail', 'property', 'work'] as const) {
    await page.getByTestId(`service-view-${mode}`).tap();
    await page.waitForTimeout(2600);
    const home = await metrics(page);
    const before = await page.screenshot({ path: shotName(page, `touch-${mode}-1-default`) });
    await pinch(page, cdp, 30);
    const zin = await metrics(page);
    expect(zin.d, `${mode}: pinch moves the camera closer (${JSON.stringify({ home, zin })})`).toBeLessThan(home.d * 0.92);
    expect(zin.px, `${mode}: pinch draws him larger`).toBeGreaterThan(home.px * 1.05);
    expect(zin.camY, `${mode}: above the deck`).toBeGreaterThan(zin.techY);
    await differs(page, before, `touch-${mode}-2-pinched-in`);
    // A pinch is also a drag to the controls: past the director's hold-off, the zoom must survive its return.
    await page.waitForTimeout(9000);
    const held = await metrics(page);
    expect(near(held.factor, zin.factor, 0.03), `${mode}: pinch kept after 9 s`).toBe(true);
    expect(near(held.d, zin.d, 0.2), `${mode}: distance kept after 9 s (${zin.d.toFixed(2)} → ${held.d.toFixed(2)} m)`).toBe(true);
    await pinch(page, cdp, -30);
    const zout = await metrics(page);
    expect(zout.d, `${mode}: pinching in moves it back out`).toBeGreaterThan(zin.d * 1.08);
    expect(await scroll()).toEqual([0, 0, 1]);
  }

  // The buttons: every one reachable, nothing on top of them.
  await page.getByTestId('service-view-work').tap();
  await page.waitForTimeout(2600);
  const covered = await page.evaluate(() =>
    ['service-zoom-in', 'service-zoom-out', 'service-zoom-reset', 'service-view-work', 'service-view-exit'].filter((id) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(top === el || el.contains(top));
    }),
  );
  expect(covered, 'zoom and camera buttons are not covered').toEqual([]);
  const m0 = await metrics(page);
  await page.getByTestId('service-zoom-in').tap();
  await page.getByTestId('service-zoom-in').tap();
  await page.waitForTimeout(700);
  const m1 = await metrics(page);
  expect(m1.d, '+ moves the camera closer').toBeLessThan(m0.d * 0.8);
  await page.getByTestId('service-zoom-out').tap();
  await page.waitForTimeout(700);
  const m2 = await metrics(page);
  expect(m2.d, '− moves it back').toBeGreaterThan(m1.d * 1.15);
  await page.getByTestId('service-zoom-reset').tap();
  await page.waitForTimeout(2200);
  const m3 = await metrics(page);
  expect(m3.factor, 'reset').toBe(1);
  expect(near(m3.d, m0.d, 0.1), `reset returns to the default framing (${m0.d.toFixed(2)} → ${m3.d.toFixed(2)} m)`).toBe(true);
  await page.screenshot({ path: shotName(page, 'touch-after-reset') });
});
