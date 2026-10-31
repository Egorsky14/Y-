import { test, expect, type Page } from '@playwright/test';

/**
 * Service camera acceptance regressions (docs/cinematic-camera/acceptance/REPORT.md), on desktop,
 * laptop, 1024×768 and phones held either way. One service call at the palm-tree house (n-o-1):
 *  - Watch technician pressed as the van parks: every walking shot is composed (never the unit's
 *    fixed close-up), and the view follows him without stopping, swooping or turning on the way;
 *  - the camera bar overlaps no other control and every bar and bottom-row button can be pressed;
 *  - Property, Watch Work and Detail are composed shots (no silent fallback), with the subject kept
 *    out from under the collapsed inspector card;
 *  - a hand orbit is kept (no automatic correction afterwards) and zoom stops short of the technician.
 */

test.use({ actionTimeout: 20_000 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;
type View = { requested: string; mode: string; reason: string; walking: boolean; report: { fill: number } | null; safe: { avoid?: number[][] } };

const LOT = 'n-o-1';
const view = (page: Page) => page.evaluate(() => (window as unknown as { __egoServiceView?: View }).__egoServiceView ?? null);
const cam = (page: Page) => page.evaluate(() => window.__egoRender!.cam);
const techPos = (page: Page) => page.evaluate(() => (window.__ego!.getState() as S).employees['emp-owner'].position as { x: number; z: number });

async function press(page: Page, testId: string, touch: boolean) {
  if (touch) await page.getByTestId(testId).tap();
  else await page.getByTestId(testId).click();
}

/** Every control in the bottom row and the camera bar is the topmost element at its own centre, and the bar overlaps nothing. */
async function barLayout(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const rect = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el || getComputedStyle(el).visibility === 'hidden') return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? r : null;
    };
    const bar = rect('[data-testid="service-camera-bar"]');
    if (!bar) return ['no camera bar'];
    for (const sel of ['.action-bar', '.world-controls', '[data-testid="inspector"]', '.top-hud > *', '.toasts > *']) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        const ox = Math.min(bar.right, r.right) - Math.max(bar.left, r.left);
        const oy = Math.min(bar.bottom, r.bottom) - Math.max(bar.top, r.top);
        if (ox > 1 && oy > 1) problems.push(`camera bar overlaps ${sel} by ${Math.round(ox)}x${Math.round(oy)}`);
      }
    }
    for (const b of Array.from(document.querySelectorAll<HTMLElement>('[data-testid="service-camera-bar"] button, .action-bar button, .world-controls button'))) {
      const r = b.getBoundingClientRect();
      if (!r.width || getComputedStyle(b).visibility === 'hidden') continue;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || !(b === top || b.contains(top))) problems.push(`covered: ${(b.dataset.testid || b.textContent || '').trim().slice(0, 20)}`);
    }
    return problems;
  });
}

test('service camera: walk-up follow, layout, composed modes, player control', async ({ page }, info) => {
  const touch = !!info.project.use.hasTouch;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await press(page, 'new-game', touch);
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  if (touch) await page.getByTestId('touch-tutorial-ok').tap();
  await page.evaluate(() => {
    window.__ego!.dispatch({ type: 'set-speed', speed: 0 });
    const s = window.__ego!.getState() as S;
    window.__ego!.advanceMinutes(600 - s.clock.minute);
  });

  // A service call at the palm-tree house, driven until the van is parked there.
  const jobId = await page.evaluate((lotId) => {
    const s = window.__ego!.getState() as S;
    for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') window.__ego!.dispatch({ type: 'decline-lead', jobId: j.id });
    const id = window.__ego!.spawnLead({ preferredLotId: lotId })!;
    const st = window.__ego!.getState() as S;
    st.customers[st.jobs[id].customerId].trust = 100;
    window.__ego!.dispatch({ type: 'accept-lead', jobId: id });
    window.__ego!.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    return id;
  }, LOT);
  await page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); return (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 90_000, polling: 30 });
  await page.evaluate((id) => window.__ego!.app.getState().select({ kind: 'job', id }), jobId);
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 1 }));

  // 1. Watch technician as he gets out: record the camera and every framing until he kneels.
  await page.evaluate(() => {
    const w = window as unknown as { __rec: { t: number; c: number[] }[]; __frames: { t: number; v: View }[] };
    w.__rec = [];
    w.__frames = [];
    let last: unknown = null;
    const loop = (t: number) => {
      w.__rec.push({ t, c: window.__egoRender!.cam.slice() });
      const v = (window as unknown as { __egoServiceView?: View }).__egoServiceView;
      if (v && v !== last) w.__frames.push({ t, v: (last = v) as View, why: (window as unknown as { __egoServiceFollow?: string }).__egoServiceFollow } as never);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await press(page, 'watch-technician', touch);
  await page.waitForFunction(() => (window as unknown as { __egoServiceView?: View }).__egoServiceView?.reason === 'arrived', null, { timeout: 40_000, polling: 100 });
  const walk = await page.evaluate(() => {
    const w = window as unknown as { __rec: { t: number; c: number[] }[]; __frames: { t: number; v: View }[] };
    return { rec: w.__rec, frames: w.__frames.map((f) => ({ t: f.t, reason: f.v.reason, walking: f.v.walking, composed: !!f.v.report, why: (f as unknown as { why?: string }).why })) };
  });
  const t0 = walk.rec[0].t;
  const arrivedAt = walk.frames.find((f) => f.reason === 'arrived')!.t;
  // Every shot framed while he walks is composed around him (the old fixed close-up of the unit had no report).
  const walkingFrames = walk.frames.filter((f) => f.walking);
  expect(walkingFrames.length, 'walking framings').toBeGreaterThan(0);
  expect(walkingFrames.filter((f) => !f.composed), 'walking framings that were not composed').toEqual([]);
  // After the opening flight the follow is continuous and gentle: no 0.25 s step faster
  // than 4 m/s (the old swoop reached 15-20 m/s) and no stop of a second or more while he walks.
  const steps: { t: number; v: number }[] = [];
  for (let i = 1, j = 0; i < walk.rec.length; i++) {
    if (walk.rec[i].t - walk.rec[j].t < 250) continue;
    const [a, b] = [walk.rec[j], walk.rec[i]];
    steps.push({ t: b.t - t0, v: Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]) / ((b.t - a.t) / 1000) });
    j = i;
  }
  // From the end of the opening flight (1.1 s after the first framing) until he kneels.
  const followFrom = walk.frames[0].t - t0 + 1100 + 250;
  const following = steps.filter((s) => s.t > followFrom && s.t < arrivedAt - t0 - 300);
  expect(following.length, 'follow samples').toBeGreaterThan(8);
  expect(Math.max(...following.map((s) => s.v)), 'fastest follow step (m/s)').toBeLessThan(4);
  let still = 0;
  let longestStill = 0;
  for (const s of following) longestStill = Math.max(longestStill, (still = s.v < 0.05 ? still + 1 : 0));
  expect(longestStill * 0.25, 'longest stop while following (s)').toBeLessThan(1);

  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  const work = (await view(page))!;
  expect(work.mode).toBe('work');
  expect(work.report, 'Watch Work composed').not.toBeNull();

  // 2. Camera bar layout.
  expect(await barLayout(page), 'camera bar layout').toEqual([]);

  // 3. Property and Detail are composed shots; the collapsed card is avoided where it reaches into the view.
  for (const mode of ['property', 'detail'] as const) {
    await press(page, `service-view-${mode}`, touch);
    await page.waitForTimeout(2600);
    const v = (await view(page))!;
    expect(v.mode, `${mode} shown`).toBe(mode);
    expect(v.report, `${mode} composed`).not.toBeNull();
  }
  await press(page, 'service-view-work', touch);
  await page.waitForTimeout(2600);
  if (await page.locator('[data-testid="inspector"].compact').count()) expect((await view(page))!.safe.avoid?.length ?? 0, 'collapsed card avoided').toBeGreaterThan(0);

  // 4. A hand orbit stays where the player left it.
  const W = page.viewportSize()!.width;
  const H = page.viewportSize()!.height;
  const cx = Math.round(W * 0.5);
  const cy = Math.round(H * 0.55);
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  const drag = async (pts: (k: number) => [number, number][]) => {
    await cdp!.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0).map(([x, y], id) => ({ x, y, id })) });
    for (let i = 1; i <= 14; i++) {
      await cdp!.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i / 14).map(([x, y], id) => ({ x: Math.round(x), y: Math.round(y), id })) });
      await page.waitForTimeout(16);
    }
    await cdp!.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  if (touch) await drag((k) => [[cx - 50 + 130 * k, cy], [cx + 50 + 130 * k, cy]]);
  else {
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 14; i++) await page.mouse.move(cx + (160 * i) / 14, cy);
    await page.mouse.up({ button: 'right' });
  }
  await page.waitForTimeout(800);
  const released = await cam(page);
  await page.waitForTimeout(9000);
  const held = await cam(page);
  expect(Math.hypot(held[0] - released[0], held[1] - released[1], held[2] - released[2]), 'camera moved by itself after an orbit (m)').toBeLessThan(0.05);

  // 5. Zooming right in stops short of the technician.
  if (touch) await drag((k) => [[cx - 30 - 120 * k, cy], [cx + 30 + 120 * k, cy]]);
  else for (let i = 0; i < 14; i++) await page.mouse.wheel(0, -200);
  await page.waitForTimeout(900);
  const c = await cam(page);
  const t = await techPos(page);
  expect(Math.hypot(c[0] - t.x, c[2] - t.z), 'camera distance from the technician after zooming in (m)').toBeGreaterThan(0.9);
  expect(c[1], 'camera height after zooming in (m)').toBeGreaterThan(0.4);

  await page.screenshot({ path: `docs/screenshots/service-camera-${W}x${H}.png` });
  expect(errors).toEqual([]);
});
