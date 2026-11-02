import { test, expect, type Page } from '@playwright/test';

/**
 * Mission 01, Rooftop Rescue, played through the real UI in the production build, from the New Game button to regular
 * business. Nothing here calls the simulation to make progress: the test presses what a player presses, and only reads
 * state to check it. The evidence shots come from these runs: docs/rooftop-first-mission/evidence/<project>/.
 *
 * Run sequentially with one worker. Every project plays at 1×; MISSION_SPEED=5 plays it at 5×.
 */

test.use({ actionTimeout: 30_000 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

const state = <T>(page: Page, fn: (s: S) => T): Promise<T> => page.evaluate((src) => new Function('s', `return (${src})(s)`)(window.__ego!.getState()) as T, fn.toString());
const jobOf = (page: Page) => page.evaluate(() => { const s = window.__ego!.getState() as S; return s.jobs[s.mission.jobId]; }) as Promise<S>;
/** The card redraws a few times a second, so this waits for it. */
const expectObjective = (page: Page, stage: string) => expect(page.getByTestId('mission-card')).toHaveAttribute('data-stage', stage);

async function press(page: Page, testId: string, touch: boolean) {
  const el = page.getByTestId(testId);
  if (touch) await el.tap();
  else await el.click();
}

/** Starts a new company the way a player does, and dismisses the first-run touch help if it appears. */
async function newGame(page: Page, touch: boolean, seed = '42') {
  await page.goto('/');
  await page.getByTestId('seed-input').fill(seed);
  await press(page, 'new-game', touch);
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  if (touch) await press(page, 'touch-tutorial-ok', true);
}

async function waitStage(page: Page, name: string, seen: Set<string>, timeout = 240_000) {
  await page.waitForFunction((n) => (window as S).__egoWorkerStage?.['emp-owner'] === n, name, { timeout, polling: 30 });
  seen.add(name);
}

/** MISSION_SPEED=5 plays the mission at 5× instead of 1×, with its evidence kept apart. */
const FAST = process.env.MISSION_SPEED === '5';
const dir = (project: string) => `docs/rooftop-first-mission/evidence/${project}${FAST ? '-5x' : ''}`;

/** Whether the technician's body is really on screen right now: inside the view, and not under the card or the bars. */
const techInView = (page: Page, parts: [string, number][]) =>
  page.evaluate((parts) => {
    const w = window.__egoWorkers?.['emp-owner'];
    if (!w) return { ok: false, why: 'no technician' };
    const margin = 8;
    for (const [part, height] of parts) {
      const p = (window as S).__egoProject(w.x, w.y + height, w.z) as { x: number; y: number; inFront: boolean };
      if (!p.inFront || p.x < margin || p.y < margin || p.x > innerWidth - margin || p.y > innerHeight - margin) return { ok: false, why: `${part} off screen at ${Math.round(p.x)},${Math.round(p.y)}` };
      for (const sel of ['.mission-card', '.top-hud', '.action-bar', '.world-controls', '.service-bar', '.inspector']) {
        for (const el of Array.from(document.querySelectorAll(sel))) {
          const r = el.getBoundingClientRect();
          if (r.width && p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom) return { ok: false, why: `${part} under ${sel} at ${Math.round(p.x)},${Math.round(p.y)}` };
        }
      }
    }
    return { ok: true, why: '' };
  }, parts);

/** The objective card, the inspector panel and the bars must all stay fully readable and usable. */
async function expectCardClearOfPanel(page: Page, where: string) {
  const overlaps = await page.evaluate(() => {
    const a = document.querySelector('.mission-card')?.getBoundingClientRect();
    if (!a) return [];
    // The top HUD is a full-width invisible row: what counts is the pieces drawn in it.
    return ['.inspector', '.action-bar', '.top-hud > *', '.service-bar'].filter((sel) =>
      Array.from(document.querySelectorAll(sel)).some((el) => {
        const b = el.getBoundingClientRect();
        // A pixel or two of touching borders is not an overlap.
        return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      }),
    );
  });
  expect(overlaps, `${where}: the objective card overlaps`).toEqual([]);
}

/** Standing or climbing: a body on screen with the head behind the card does not count. */
const UPRIGHT: [string, number][] = [['head', 1.7], ['chest', 1.0]];
/** Kneeling at the unit: his head and shoulders are about this high above the deck, where the hands and panel are. */
const KNEELING: [string, number][] = [['shoulders', 0.9], ['hands', 0.6]];

/** Samples that sight line while something plays out, and returns the share of samples he was visible. */
async function sampleSight(page: Page, label: string, samples: number, gapMs: number, parts = UPRIGHT): Promise<number> {
  let seen = 0;
  const misses: string[] = [];
  for (let i = 0; i < samples; i++) {
    const v = await techInView(page, parts);
    if (v.ok) seen++;
    else misses.push(v.why);
    await page.waitForTimeout(gapMs);
  }
  const share = seen / samples;
  console.log(`[sight] ${label}: ${seen}/${samples}${misses.length ? ' misses: ' + misses.join('; ') : ''}`);
  return share;
}

test('Mission 01 end to end, from New Game to regular business', async ({ page }, info) => {
  test.setTimeout(1_500_000);
  const touch = !!info.project.use.hasTouch;
  const fast = FAST;
  const shot = (name: string) => page.screenshot({ path: `${dir(info.project.name)}/${name}.png` });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newGame(page, touch);

  // --- The opening.
  await expect(page.getByTestId('mission-card')).toBeVisible();
  await expectObjective(page, '1');
  await expect(page.getByTestId('mission-card')).toContainText('Rooftop Rescue');
  await expect(page.getByTestId('mission-card')).toContainText('Mesquite Plaza');
  await expect(page.getByTestId('hint')).toHaveCount(0);
  await page.waitForTimeout(3200);
  await shot('01-opening-mesquite-plaza');
  const opening = await state(page, (s) => ({ jobs: Object.values(s.jobs).map((j: S) => ({ status: j.status, lot: s.customers[j.customerId].lotId, customer: j.customerId })), mission: s.mission.status, upgrades: s.vehicles['veh-1'].upgrades, cash: s.finance.cash }));
  expect(opening.jobs).toEqual([{ status: 'lead', lot: 'cm-plaza', customer: 'cust-cm-plaza' }]);
  expect(opening.mission).toBe('active');
  expect(opening.upgrades).toContain('ladder-rack');
  await page.waitForTimeout(5000);
  await expect(page.getByTestId('mission-van-tag')).toBeVisible();
  await shot('02-plaza-and-available-van');

  // The camera stays the player's: speed and panels work during the mission.
  await press(page, 'nav-jobs', touch);
  await expect(page.locator('.panel')).toBeVisible();
  await page.evaluate(() => (window.__ego!.app.getState() as S).openPanel(null));
  await expect(page.locator('.panel')).toHaveCount(0);

  // --- 1. Accept the call.
  await press(page, 'mission-open-call', touch);
  await expect(page.getByTestId('accept-lead')).toBeVisible();
  await expect(page.getByTestId('roof-access-note')).toContainText('Unit 1');
  await page.waitForTimeout(1800);
  await expectCardClearOfPanel(page, 'accept');
  await shot('03-objective-accept-call');
  await press(page, 'accept-lead', touch);

  // --- 2. Dispatch the crew: the real form, with the starter technician and van.
  await expect(page.getByTestId('dispatch-go')).toBeVisible();
  await expectObjective(page, '2');
  await expect(page.getByTestId('dispatch-vehicle')).toContainText('Unit 1');
  await expectCardClearOfPanel(page, 'dispatch');
  await shot('04-objective-dispatch');
  await press(page, 'dispatch-go', touch);

  // --- 3. Travel. The player's speed choice applies from here (5× on the phones).
  await page.waitForFunction(() => (window.__ego!.getState() as S).jobs[(window.__ego!.getState() as S).mission.jobId].status === 'enroute');
  await expectObjective(page, '3');
  await expect(page.getByTestId('mission-follow')).toBeVisible();
  await page.waitForTimeout(1600);
  await shot('05-van-driving');
  if (fast) await press(page, 'speed-5', touch);

  // --- 4. Access the roof, on the real choreography. The service camera opens by itself.
  const seen = new Set<string>();
  await page.waitForFunction(() => (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite', null, { timeout: 240_000, polling: 100 });
  await expect(page.getByTestId('service-camera-bar')).toBeVisible();
  // Pulling up: the van at the site first, then the service camera goes to the technician.
  await expect(page.getByTestId('service-view-property')).toHaveAttribute('aria-pressed', 'true');
  await expectObjective(page, '4');
  await page.waitForTimeout(fast ? 900 : 5000);
  await shot('06-van-arrival');
  await expect(page.getByTestId('service-view-work')).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await waitStage(page, 'roof:retrieve', seen);
  await page.waitForTimeout(fast ? 120 : 1300);
  await shot('07-ladder-retrieval');
  await waitStage(page, 'roof:carry', seen);
  await waitStage(page, 'roof:raise', seen);
  await waitStage(page, 'roof:climb', seen);
  // The camera has to keep him in sight while he climbs, not only once it has settled.
  const climbSight = await sampleSight(page, 'climb', fast ? 6 : 10, fast ? 120 : 340);
  expect(climbSight, 'the technician stays in view on the ladder').toBeGreaterThanOrEqual(0.8);
  await shot('08-technician-climbing');
  const climbing = await page.evaluate(() => window.__egoWorkers?.['emp-owner']);
  expect(climbing!.y, 'on the ladder, off the ground').toBeGreaterThan(0.5);
  // While the player is only watching, the card stays out of the view.
  const cardHeight = await page.getByTestId('mission-card').evaluate((el) => el.getBoundingClientRect().height);
  expect(cardHeight, 'card stays small while only watching').toBeLessThan(touch ? 110 : 260);
  await waitStage(page, 'roof:roof-walk', seen);

  // --- 5. Diagnose at the unit. The technician is really on the roof.
  await page.waitForFunction(() => (window as S).__egoWorkerStage?.['emp-owner'] === 'roof:work' && (window.__ego!.getState() as S).jobs[(window.__ego!.getState() as S).mission.jobId].status === 'diagnosing', null, { timeout: 240_000, polling: 50 });
  seen.add('roof:work');
  const onRoof = await page.evaluate(() => window.__egoWorkers?.['emp-owner']);
  expect(onRoof!.y, 'on the roof deck').toBeGreaterThan(3.5);
  await expectObjective(page, '5');
  await page.waitForTimeout(fast ? 900 : 2500);
  expect(await sampleSight(page, 'diagnosis', 6, 150, KNEELING), 'the technician is in view at the unit').toBe(1);
  await shot('09-rooftop-diagnosis');
  // All three service camera shots work here; the player can leave and come back.
  await press(page, 'service-view-property', touch);
  await page.waitForTimeout(fast ? 500 : 2000);
  await shot('10-property-view-on-the-roof');
  await press(page, 'service-view-work', touch);

  await page.waitForFunction(() => (window.__ego!.getState() as S).jobs[(window.__ego!.getState() as S).mission.jobId].status === 'awaiting-diagnosis', null, { timeout: 240_000, polling: 50 });
  await expect(page.getByTestId('evidence')).toBeVisible();
  const job = await jobOf(page);
  expect(job.evidence).toHaveLength(3);
  await page.waitForTimeout(400);
  await expectCardClearOfPanel(page, 'findings');
  await shot('11-findings');
  // A wrong answer is refused and changes nothing.
  const wrong = job.diagnosisOptions.find((f: string) => f !== job.faultId);
  await press(page, `diagnosis-${wrong}`, touch);
  await press(page, 'confirm-diagnosis', touch);
  await expect(page.getByTestId('error-banner')).toContainText('Not quite');
  expect((await jobOf(page)).status).toBe('awaiting-diagnosis');
  await press(page, `diagnosis-${job.faultId}`, touch);
  await press(page, 'confirm-diagnosis', touch);

  // --- 6. Prepare the repair: the real quote, then the customer's review.
  await expect(page.getByTestId('present-quote')).toBeVisible();
  await expectObjective(page, '6');
  await expect(page.getByTestId('quote-limit')).toBeVisible();
  await expectCardClearOfPanel(page, 'quote');
  await shot('12-quote-and-authorization');
  await press(page, 'present-quote', touch);
  await page.waitForFunction(() => (window.__ego!.getState() as S).jobs[(window.__ego!.getState() as S).mission.jobId].status !== 'quoted');
  const reviewing = await jobOf(page);
  expect(reviewing.status).toBe('awaiting-authorization');
  expect(await state(page, (s) => s.finance.ledger.filter((l: S) => l.jobId === s.mission.jobId).length)).toBe(0);

  // --- 7. The repair, then down, ladder stowed, depart.
  await page.waitForFunction(() => (window.__ego!.getState() as S).jobs[(window.__ego!.getState() as S).mission.jobId].status === 'repairing', null, { timeout: 240_000, polling: 50 });
  await expectObjective(page, '7');
  await page.waitForTimeout(fast ? 1000 : 3000);
  expect(await sampleSight(page, 'repair', 6, 150, KNEELING), 'the technician is in view during the repair').toBe(1);
  await shot('13-rooftop-repair');
  await page.waitForFunction(() => (window.__ego!.getState() as S).jobs[(window.__ego!.getState() as S).mission.jobId].status === 'completed', null, { timeout: 400_000, polling: 50 });
  // The job has closed on the roof; the mission has not: the van waits for the ladder.
  expect(await state(page, (s) => ({ van: s.vehicles['veh-1'].status, mission: s.mission.status, packing: !!s.vehicles['veh-1'].packUp }))).toEqual({ van: 'onsite', mission: 'active', packing: true });
  const money = await state(page, (s) => s.finance.ledger.filter((l: S) => l.jobId === s.mission.jobId).length);
  expect(money).toBe(3);
  await waitStage(page, 'roof:collect', seen);
  await waitStage(page, 'roof:climb', seen);
  const descentSight = await sampleSight(page, 'descent', fast ? 4 : 8, fast ? 100 : 300);
  expect(descentSight, 'the technician stays in view coming down').toBeGreaterThanOrEqual(0.75);
  await shot('14-technician-descending');
  await waitStage(page, 'roof:stow', seen);
  await page.waitForTimeout(fast ? 150 : 1000);
  await shot('15-ladder-secured-on-van');
  const whileStowing = await state(page, (s) => ({ van: s.vehicles['veh-1'].status, mission: s.mission.status }));
  expect(whileStowing).toEqual({ van: 'onsite', mission: 'active' });

  // The van drives off with the camera on it, and only then does the mission close.
  await page.waitForFunction(() => (window.__ego!.getState() as S).vehicles['veh-1'].status === 'returning', null, { timeout: 240_000, polling: 30 });
  await page.waitForTimeout(fast ? 200 : 2500);
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).followVehicleId), 'the camera sees the van off').toBe('veh-1');
  await shot('15b-van-departing');

  // --- 8. The summary, only after the van has really left, showing the ledger's own figures.
  await expect(page.getByTestId('mission-summary')).toBeVisible({ timeout: 240_000 });
  const real = await state(page, (s) => {
    const entries = s.finance.ledger.filter((l: S) => l.jobId === s.mission.jobId);
    return {
      revenue: entries.filter((l: S) => l.category === 'service-revenue').reduce((n: number, l: S) => n + l.amount, 0),
      parts: -entries.filter((l: S) => l.category === 'parts').reduce((n: number, l: S) => n + l.amount, 0),
      entries: entries.length,
      van: s.vehicles['veh-1'].status,
      jobStatus: s.jobs[s.mission.jobId].status,
      summary: s.mission.summary,
      speed: s.speed,
    };
  });
  expect(real.jobStatus).toBe('completed');
  expect(real.van).not.toBe('onsite');
  expect(real.entries).toBe(3);
  expect(real.summary.revenue).toBe(real.revenue);
  expect(real.summary.partsCost).toBe(real.parts);
  expect(real.summary.netContribution).toBe(real.revenue - real.parts);
  expect(real.speed).toBe(0);
  const dollars = (n: number) => '$' + Math.abs(n).toLocaleString('en-US');
  await expect(page.getByTestId('mission-revenue')).toContainText(dollars(real.revenue));
  await expect(page.getByTestId('mission-parts')).toContainText(dollars(real.parts));
  await expect(page.getByTestId('mission-net')).toContainText(dollars(real.revenue - real.parts));
  await page.waitForTimeout(400);
  await shot('16-mission-summary');
  for (const s of ['roof:retrieve', 'roof:carry', 'roof:raise', 'roof:climb', 'roof:roof-walk', 'roof:work', 'roof:collect', 'roof:stow']) expect([...seen], s).toContain(s);

  // --- Regular business begins.
  await press(page, 'mission-continue', touch);
  await expect(page.getByTestId('mission-summary')).toHaveCount(0);
  await expect(page.getByTestId('mission-card')).toHaveCount(0);
  expect(await state(page, (s) => s.speed)).toBe(fast ? 5 : 1);
  const before = await state(page, (s) => Object.keys(s.jobs).length);
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 5 }));
  await page.waitForFunction((n) => Object.keys((window.__ego!.getState() as S).jobs).length > n, before, { timeout: 300_000, polling: 200 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  await shot('17-regular-business');
  const next = await state(page, (s) => (Object.values(s.jobs) as S[]).find((j) => j.status === 'lead'));
  expect(next.id).not.toBe(job.id);
  expect(next.authorization).toBeUndefined();
  expect(await state(page, (s) => s.finance.ledger.filter((l: S) => l.jobId === s.mission.jobId).length)).toBe(3);
  expect(errors, errors.join('\n')).toHaveLength(0);
});

test('save and reload during the opening rooftop sequence', async ({ page }, info) => {
  test.setTimeout(900_000);
  const touch = !!info.project.use.hasTouch;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newGame(page, touch, '7');
  await press(page, 'mission-open-call', touch);
  await press(page, 'accept-lead', touch);
  await press(page, 'dispatch-go', touch);
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 5 }));
  await page.waitForFunction(() => (window as S).__egoWorkerStage?.['emp-owner'] === 'roof:climb', null, { timeout: 300_000, polling: 30 });
  await page.evaluate(() => window.__ego!.dispatch({ type: 'set-speed', speed: 0 }));
  const before = await page.evaluate(() => { const s = window.__ego!.getState() as S; return { status: s.jobs[s.mission.jobId].status, y: window.__egoWorkers?.['emp-owner'].y, jobs: Object.keys(s.jobs) }; });
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).save())).toBe(true);
  await page.reload();
  await press(page, 'continue-game', touch);
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  await page.waitForTimeout(1500);
  // Back on the ladder, on the same objective, in the same job.
  await expect(page.getByTestId('mission-card')).toBeVisible();
  await expectObjective(page, '4');
  const after = await page.evaluate(() => { const s = window.__ego!.getState() as S; return { status: s.jobs[s.mission.jobId].status, y: window.__egoWorkers?.['emp-owner'].y, jobs: Object.keys(s.jobs), stage: (window as S).__egoWorkerStage?.['emp-owner'] }; });
  expect(after.status).toBe(before.status);
  expect(after.jobs).toEqual(before.jobs);
  expect(after.stage).toMatch(/roof:(climb|mount|transfer)/);
  await expect(page.getByTestId('service-camera-bar')).toBeVisible();
  await page.screenshot({ path: `${dir(info.project.name)}/resumed-on-the-ladder.png` });
  // Skipping from here turns the guide off and leaves the same job running. (Small screens keep the card folded
  // while the player is only watching, so it opens first.)
  if (touch) await press(page, 'mission-minimize', true);
  await press(page, 'mission-skip', touch);
  await expect(page.getByTestId('mission-card')).toHaveCount(0);
  expect(await page.evaluate(() => { const s = window.__ego!.getState() as S; return { status: s.jobs[s.mission.jobId].status, mission: s.mission.status, jobs: Object.keys(s.jobs).length }; })).toEqual({ status: before.status, mission: 'skipped', jobs: before.jobs.length });
  expect(errors, errors.join('\n')).toHaveLength(0);
});

test('an existing company continues where it was: no mission, no second call', async ({ page }, info) => {
  test.setTimeout(600_000);
  const touch = !!info.project.use.hasTouch;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newGame(page, touch, '3');
  // Rewrites the store as the previous version left it: schema 5, no mission, an ordinary job under way.
  const saved = await page.evaluate(() => {
    const e = window.__ego!;
    const s0 = e.getState() as S;
    e.dispatch({ type: 'decline-lead', jobId: s0.mission.jobId });
    const id = e.spawnLead({ preferredLotId: 'c-n-4', channel: 'direct', faultId: 'run-capacitor' })!;
    e.dispatch({ type: 'accept-lead', jobId: id });
    e.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    const s = JSON.parse(JSON.stringify(e.getState())) as S;
    delete s.mission;
    for (const j of Object.keys(s.jobs)) if (j !== id) delete s.jobs[j];
    s.schemaVersion = 5;
    localStorage.setItem('ego-hvac-v3:save', JSON.stringify({ schemaVersion: 5, savedAt: new Date().toISOString(), appVersion: '0.1.0', state: s }));
    localStorage.removeItem('ego-hvac-v3:autosave');
    return { id, jobs: Object.keys(s.jobs), ledger: s.finance.ledger.length };
  });
  await page.reload();
  await press(page, 'continue-game', touch);
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('mission-card')).toHaveCount(0);
  await expect(page.getByTestId('mission-summary')).toHaveCount(0);
  const s = await page.evaluate(() => { const st = window.__ego!.getState() as S; return { mission: st.mission ?? null, jobs: Object.keys(st.jobs), ledger: st.finance.ledger.length, status: Object.values(st.jobs).map((j: S) => j.status), lot: Object.values(st.jobs).map((j: S) => st.customers[j.customerId].lotId) }; });
  expect(s.mission).toBeNull();
  expect(s.jobs).toEqual(saved.jobs);
  expect(s.ledger).toBe(saved.ledger);
  expect(s.lot).toEqual(['c-n-4']);
  await page.screenshot({ path: `${dir(info.project.name)}/existing-save-no-mission.png` });
  expect(errors, errors.join('\n')).toHaveLength(0);
});
