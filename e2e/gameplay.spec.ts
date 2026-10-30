import { test, expect, type Page } from '@playwright/test';

/**
 * Mandatory end-to-end gameplay test (see QA_REPORT.md). Runs the real production build in
 * Chromium with software WebGL and drives the game through the UI, verifying simulation state
 * through the window.__ego test hook.
 */

type Snapshot = {
  day: number;
  minute: number;
  cash: number;
  employees: string[];
  vehicles: string[];
  jobs: [string, string][];
  ledger: number;
};

const SHOT = (name: string) => `docs/screenshots/${name}.png`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

/** Reads from the live GameState inside the page. The callback is serialized, so pass data via `arg`. */
async function state<T, A = undefined>(page: Page, fn: (s: S, arg: A) => T, arg?: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = window.__ego!.getState()! as S;
      return new Function('s', 'arg', `return (${src})(s, arg)`)(s, a) as T;
    },
    [fn.toString(), arg] as const,
  );
}

async function waitForJobStatus(page: Page, jobId: string, statuses: string[], timeout = 90_000) {
  await page.waitForFunction(
    ([id, list]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = window.__ego?.getState() as any;
      return !!s && list.includes(s.jobs[id]?.status);
    },
    [jobId, statuses] as const,
    { timeout, polling: 200 },
  );
}

async function waitForVehicleStatus(page: Page, vehicleId: string, status: string, timeout = 90_000) {
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ([id, st]) => (window.__ego?.getState() as any)?.vehicles[id]?.status === st,
    [vehicleId, status] as const,
    { timeout, polling: 200 },
  );
}

async function snapshot(page: Page): Promise<Snapshot> {
  return state(page, (s) => ({
    day: s.clock.day,
    minute: Math.round(s.clock.minute * 1000) / 1000,
    cash: s.finance.cash,
    employees: Object.keys(s.employees).sort(),
    vehicles: Object.keys(s.vehicles).sort(),
    jobs: Object.values(s.jobs).map((j: S) => [j.id, j.status] as [string, string]).sort(),
    ledger: s.finance.ledger.length,
  }));
}

test('full gameplay loop: dispatch, diagnose, repair, grow, train, save and reload', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  // 1. Start a new company.
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.screenshot({ path: SHOT('00-main-menu') });
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  const startCash: number = await state(page, (s) => s.finance.cash);
  expect(startCash).toBe(25000);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: SHOT('01-overview') });

  // 2. Receive a customer lead: a glowing pin appears over the customer's house.
  const pin = page.locator('.job-pin').first();
  await expect(pin).toBeVisible({ timeout: 15_000 });
  const leadId: string = await state(page, (s) => (Object.values(s.jobs) as S[]).find((j) => j.status === 'lead').id);
  const lead = await state(
    page,
    (s, id) => {
      const j = s.jobs[id];
      const c = s.customers[j.customerId];
      return { lotId: c.lotId as string, name: c.name as string, faultId: j.faultId as string, channel: c.channel as string };
    },
    leadId,
  );
  expect(lead.channel).toBe('direct');
  await pin.click();
  await expect(page.getByTestId('inspector')).toContainText(lead.name);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOT('02-service-call') });
  await page.getByTestId('accept-lead').click();

  // 3. Dispatch a branded truck.
  await expect(page.getByTestId('dispatch-go')).toBeVisible();
  await expect(page.getByTestId('dispatch-tech')).toHaveValue('emp-owner');
  await expect(page.getByTestId('dispatch-vehicle')).toHaveValue('veh-1');
  await page.getByTestId('dispatch-go').click();
  const dispatched = await state(page, (s, id) => ({ v: s.vehicles['veh-1'].status, route: s.vehicles['veh-1'].route.totalLength, job: s.jobs[id].status, tech: s.employees['emp-owner'].status }), leadId);
  expect(dispatched.v).toBe('enroute');
  expect(dispatched.job).toBe('enroute');
  expect(dispatched.tech).toBe('driving');
  expect(dispatched.route).toBeGreaterThan(100);

  // 4. Watch the truck follow a valid route: it moves, stays within a lane of a street centerline, and the ETA shrinks.
  await page.getByTestId('cam-follow').click();
  const p0 = await state(page, (s) => ({ ...s.vehicles['veh-1'].position, eta: s.vehicles['veh-1'].route.totalLength - s.vehicles['veh-1'].route.progress }));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOT('03-van-en-route') });
  const p1 = await state(page, (s) => ({ ...s.vehicles['veh-1'].position, eta: s.vehicles['veh-1'].route.totalLength - s.vehicles['veh-1'].route.progress }));
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(5);
  expect(p1.eta).toBeLessThan(p0.eta);
  const streets = [-100, 0, 100];
  const avenues = [-130, 0, 130];
  const onRoad = streets.some((z) => Math.abs(p1.z - z) < 6) || avenues.some((x) => Math.abs(p1.x - x) < 6) || (p1.x > 7 && p1.x < 70 && p1.z > 7 && p1.z < 93); // or still inside the HQ lot
  expect(onRoad).toBe(true);
  await expect(page.locator(`[data-testid="vehicle-tag-veh-1"]`)).toContainText('En route');

  // Speed up and wait for arrival.
  await page.getByTestId('speed-5').click();
  await waitForVehicleStatus(page, 'veh-1', 'onsite');

  // 5. Observe the technician at the property.
  await waitForJobStatus(page, leadId, ['diagnosing']);
  const onsite = await state(page, (s) => ({ tech: s.employees['emp-owner'].status, pos: s.employees['emp-owner'].position, van: s.vehicles['veh-1'].position }));
  expect(onsite.tech).toBe('working');
  expect(Math.hypot(onsite.pos.x - onsite.van.x, onsite.pos.z - onsite.van.z)).toBeGreaterThan(3);
  await page.getByTestId('speed-1').click();
  await page.evaluate((pos) => window.__ego!.app.getState().camera({ type: 'focus', target: pos, distance: 26 }), onsite.pos);
  await page.waitForTimeout(1500);
  // The Blender-authored service kit (bag, gauge manifold and hoses) is staged at the unit.
  await page.waitForFunction(() => (window.__egoRender?.kits ?? 0) >= 1, null, { timeout: 20_000 });
  await page.screenshot({ path: SHOT('04-technician-diagnosing') });

  // 5b. "Watch technician" (Cinematic Service Camera, docs/cinematic-camera): the panel collapses to
  // its header and the camera flies to a composed close-up of the work, a few metres off at a low or
  // moderate height, the technician and unit filling a good part of the screen with nothing in front.
  // The camera bar switches to Detail and Property and back. None of it changes the job.
  await page.evaluate((id) => window.__ego!.app.getState().select({ kind: 'job', id }), leadId);
  await page.getByTestId('watch-technician').click();
  await expect(page.getByTestId('inspector')).toHaveClass(/compact/);
  await expect(page.getByTestId('service-camera-bar')).toBeVisible();
  await page.waitForTimeout(1800);
  type Framing = { mode: string; report: { fill: number; foreground: number; roof: number } | null };
  const framing = () => page.evaluate(() => window.__egoServiceView as Framing);
  const work = await framing();
  expect(work.mode).toBe('work');
  expect(work.report!.fill).toBeGreaterThan(0.45);
  expect(work.report!.foreground).toBeLessThanOrEqual(0.05);
  expect(work.report!.roof).toBeLessThanOrEqual(0.05);
  const watched = await page.evaluate(() => window.__egoRender!.cam);
  const tech = await state(page, (s) => s.employees['emp-owner'].position);
  expect(Math.hypot(watched[0] - tech.x, watched[2] - tech.z)).toBeGreaterThan(1.5);
  expect(Math.hypot(watched[0] - tech.x, watched[2] - tech.z)).toBeLessThan(7.5);
  expect(watched[1]).toBeGreaterThan(1);
  expect(watched[1]).toBeLessThan(3.6);
  await page.getByTestId('service-view-detail').click();
  await page.waitForTimeout(1600);
  expect((await framing()).mode).toBe('detail');
  await page.getByTestId('service-view-property').click();
  await page.waitForTimeout(1600);
  expect((await framing()).mode).toBe('property');
  await page.getByTestId('service-view-work').click();
  await page.waitForTimeout(1600);
  expect((await framing()).mode).toBe('work');
  expect(await state(page, (s, id) => s.jobs[id].status, leadId)).toMatch(/diagnosing|awaiting-diagnosis/);

  // 6. Diagnose the system. The collapsed panel says a decision is waiting; tapping it brings the findings back.
  await page.getByTestId('speed-5').click();
  await waitForJobStatus(page, leadId, ['awaiting-diagnosis']);
  await page.getByTestId('speed-1').click();
  await page.getByTestId('inspector-notice').click();
  await expect(page.getByTestId('inspector')).not.toHaveClass(/compact/);
  await expect(page.getByTestId('evidence')).toBeVisible();
  await expect(page.getByTestId('evidence').locator('.evidence-item')).toHaveCount(3);
  await page.screenshot({ path: SHOT('05-findings') });
  await page.getByTestId(`diagnosis-${lead.faultId}`).click();
  await page.getByTestId('confirm-diagnosis').click();
  const diag = await state(page, (s, id) => s.jobs[id].diagnosisCorrect, leadId);
  expect(diag).toBe(true);

  // 7. Quote and complete work.
  await expect(page.getByTestId('present-quote')).toBeVisible();
  await page.screenshot({ path: SHOT('06-quote') });
  await page.getByTestId('quote-repair').click();
  await page.getByTestId('present-quote').click();
  await page.getByTestId('speed-5').click();
  await waitForJobStatus(page, leadId, ['completed']);

  // 8. Collect payment.
  const paid = await state(page, (s, id) => ({ cash: s.finance.cash as number, job: s.jobs[id].financials, ledgerForJob: s.finance.ledger.filter((e: S) => e.jobId === id).map((e: S) => [e.category, e.amount]) }), leadId);
  expect(paid.cash).toBeGreaterThan(startCash);
  expect(paid.job.revenueCollected).toBeGreaterThanOrEqual(95);
  expect(paid.ledgerForJob.length).toBeGreaterThanOrEqual(1);
  await page.getByTestId('speed-1').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOT('07-payment') });
  await expect(page.getByTestId('hud-cash')).toContainText(`$${Math.round(paid.cash).toLocaleString('en-US')}`);
  await page.getByTestId('speed-5').click();
  await waitForVehicleStatus(page, 'veh-1', 'parked');
  await page.getByTestId('speed-1').click();

  // 9. Hire another technician.
  await page.getByTestId('nav-employees').click();
  await expect(page.getByTestId('panel-employees')).toBeVisible();
  await page.getByRole('button', { name: /Hiring market/ }).click();
  const candidateId = await state(page, (s) => s.candidates.find((c: S) => c.role === 'technician').id);
  await page.screenshot({ path: SHOT('08-hiring-market') });
  await page.getByTestId(`hire-${candidateId}`).click();
  const hiredId: string = await state(page, (s) => (Object.values(s.employees) as S[]).find((e) => !e.isOwner).id);
  expect(hiredId).toBeTruthy();
  await expect(page.getByTestId('celebration')).toContainText('Hired');
  // The first hire also unlocks the First Hire milestone a tick later. Celebrations queue: once the
  // milestone is waiting, the banner must still show "Hired", then the milestone after it.
  await page.waitForFunction(() => {
    const { celebrations } = window.__ego!.app.getState() as unknown as { celebrations: { title: string }[] };
    return celebrations.some((t) => t.title.startsWith('Milestone'));
  }, null, { timeout: 20_000 });
  await expect(page.getByTestId('celebration')).toContainText('Hired');
  await expect(page.getByTestId('celebration-waiting')).toBeVisible();
  await page.getByTestId('celebration').click({ timeout: 5000 });
  await expect(page.getByTestId('celebration')).toContainText('Milestone');
  await page.keyboard.press('Escape');

  // 10. Purchase a second vehicle (used compact van if listed, otherwise new; financed with a loan).
  await page.getByTestId('nav-fleet').click();
  await expect(page.getByTestId('panel-fleet')).toBeVisible();
  await page.getByRole('button', { name: 'Marketplace' }).click();
  await page.getByTestId('market-class-compact-van').click();
  const usedListing = await state(page, (s) => s.usedListings.find((l: S) => l.classId === 'compact-van')?.id ?? null);
  if (usedListing) await page.getByTestId(`market-used-${usedListing}`).click();
  await page.getByTestId('financing-loan').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOT('09-vehicle-marketplace') });
  const cashBeforeBuy: number = await state(page, (s) => s.finance.cash);
  await page.getByTestId('buy-vehicle').click();
  const fleet = await state(page, (s) => ({ ids: Object.keys(s.vehicles) as string[], loans: s.finance.loans.length as number, cash: s.finance.cash as number }));
  expect(fleet.ids.length).toBe(2);
  expect(fleet.loans).toBe(1);
  expect(fleet.cash).toBeLessThan(cashBeforeBuy);
  const secondVehicleId = fleet.ids.find((id) => id !== 'veh-1')!;
  await page.keyboard.press('Escape');
  await page.getByTestId('cam-hq').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('10-two-vans-at-hq') });

  // 11 + 12. Assign the new employee to the new vehicle and complete a second job.
  const job2 = await page.evaluate(() => window.__ego!.spawnLead({ channel: 'direct', preferredLotId: 'c-s-3', faultId: 'thermostat' }));
  expect(job2).toBeTruthy();
  // The new call is at the far side of the neighborhood: locate it from the Jobs board.
  await page.getByTestId('nav-jobs').click();
  await page.getByTestId(`job-row-${job2}`).click();
  await page.getByTestId('job-show-on-map').click();
  await expect(page.locator(`[data-testid="job-pin-${job2}"]`)).toBeVisible();
  await page.getByTestId('accept-lead').click();
  await page.getByTestId('dispatch-tech').selectOption(hiredId);
  await page.getByTestId('dispatch-vehicle').selectOption(secondVehicleId);
  await page.getByTestId('dispatch-go').click();
  const second = await state(page, (s, a) => ({ driver: s.vehicles[a.v].driverId, status: s.vehicles[a.v].status, techStatus: s.employees[a.e].status, unit1: s.vehicles['veh-1'].status }), { v: secondVehicleId, e: hiredId });
  expect(second.driver).toBe(hiredId);
  expect(second.status).toBe('enroute');
  expect(second.techStatus).toBe('driving');
  expect(second.unit1).toBe('parked');
  await page.getByTestId('speed-5').click();
  await waitForJobStatus(page, job2!, ['awaiting-diagnosis']);
  await page.getByTestId(`diagnosis-thermostat`).click();
  await page.getByTestId('confirm-diagnosis').click();
  await page.getByTestId('quote-repair').click();
  await page.getByTestId('present-quote').click();
  await waitForJobStatus(page, job2!, ['completed']);
  await waitForVehicleStatus(page, secondVehicleId, 'parked');
  await page.getByTestId('speed-1').click();
  const afterSecond = await state(page, (s, e) => ({ xp: s.employees[e].xp as number, jobs: s.employees[e].jobsCompleted, completed: s.stats.jobsCompleted as number }), hiredId);
  expect(afterSecond.completed).toBeGreaterThanOrEqual(1);
  expect(afterSecond.xp).toBeGreaterThan(0);

  // 13. Train the employee.
  const accBefore: number = await state(page, (s, e) => s.employees[e].attributes.diagnosticAccuracy, hiredId);
  await page.getByTestId('nav-employees').click();
  await page.getByRole('button', { name: /Training academy/ }).click();
  const hiredName: string = await state(page, (s, e) => s.employees[e].name, hiredId);
  await page.locator('.list-item', { hasText: hiredName }).first().click();
  await page.getByTestId('train-electrical-diagnostics').click();
  const training = await state(page, (s, e) => ({ status: s.employees[e].status, days: s.employees[e].training?.daysRemaining }), hiredId);
  expect(training.status).toBe('training');
  expect(training.days).toBe(2);
  await page.screenshot({ path: SHOT('11-training') });
  await page.keyboard.press('Escape');

  // 14. Verify measurable improvement after the course finishes (fast-forward three days).
  await page.evaluate(() => window.__ego!.advanceMinutes(1440 * 3));
  const accAfter = await state(page, (s, e) => ({ acc: s.employees[e].attributes.diagnosticAccuracy as number, status: s.employees[e].status, certs: s.employees[e].certifications as string[] }), hiredId);
  expect(accAfter.acc).toBeGreaterThan(accBefore);
  expect(accAfter.status).toBe('idle');
  expect(accAfter.certs).toContain('Electrical I');

  // Finance panel sanity: books reconcile.
  await page.getByTestId('nav-finance').click();
  await expect(page.getByTestId('panel-finance')).toContainText('Books reconciled');
  await page.screenshot({ path: SHOT('12-finances') });
  await page.keyboard.press('Escape');

  // 15. Save the game (paused so the snapshot is exact).
  await page.keyboard.press(' ');
  const before = await snapshot(page);
  await page.getByTestId('save-game').click();
  await expect(page.getByTestId('save-game')).toContainText('Saved');

  // 16. Reload the game.
  await page.reload();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.getByTestId('continue-game').click();
  await expect(page.getByTestId('hud-cash')).toBeVisible();

  // 17. Confirm the full state persists.
  const after = await snapshot(page);
  expect(after.employees).toEqual(before.employees);
  expect(after.vehicles).toEqual(before.vehicles);
  expect(after.jobs).toEqual(before.jobs);
  expect(after.ledger).toBe(before.ledger);
  expect(after.day).toBe(before.day);
  expect(after.cash).toBeCloseTo(before.cash, 2);
  const loadedSpeed = await state(page, (s) => s.speed);
  expect(loadedSpeed).toBe(0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('13-after-reload') });

  // Performance sample: frames per second over two seconds (software GL in CI, GPU on a PC).
  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start < 2000) requestAnimationFrame(tick);
          else resolve(frames / 2);
        };
        requestAnimationFrame(tick);
      }),
  );
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector('canvas')?.getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? (gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) as string) : 'unknown renderer';
  });
  console.log(`[perf] ${fps.toFixed(1)} fps (headless, ${renderer})`);

  const realErrors = consoleErrors.filter((e) => !e.includes('deprecated') && !e.includes('PCFSoftShadowMap'));
  expect(realErrors, realErrors.join('\n')).toEqual([]);
});
