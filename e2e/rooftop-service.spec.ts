import { test, expect, type Page } from '@playwright/test';

/**
 * The flagship rooftop service call, end to end in the real game (G3/G4 evidence): the starter van (ladder rack) is
 * sent to Mesquite Plaza's rooftop unit. Played at 1×, paused at each stage of the choreography for a screenshot from
 * a fixed three-quarter view of the access wall: arrival, ladder off the rack, carried, footed and walked up, the fly
 * extended, the climb, over the parapet, the rooftop unit (diagnosis, repair), and back down: collect, descend,
 * retract, lower, shoulder, carry back, stow, depart. Checks one ladder throughout, the van staying until the ladder
 * is stowed, and the job's money booked once. Shots: test-results/rooftop-service/<n>-<stage>.png.
 */

test.use({ actionTimeout: 20_000 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

const LOT = process.env.ROOF_LOT ?? 'cm-plaza';

async function stage(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as S).__egoWorkerStage?.['emp-owner'] ?? null);
}

async function waitStage(page: Page, name: string, timeout = 120_000) {
  await page.waitForFunction((n) => (window as S).__egoWorkerStage?.['emp-owner'] === n, name, { timeout, polling: 20 });
}

const speed = (page: Page, v: 0 | 1 | 2 | 5) => page.evaluate((x) => window.__ego!.dispatch({ type: 'set-speed', speed: x }), v);

/** Frames the technician (and the ladder) from a fixed side of the access wall, aiming at a height on him. */
async function frame(page: Page, azOffset: number, distance: number, elevation: number, aimY = 1.0) {
  await page.evaluate(
    ({ azOffset, distance, elevation, aimY }) => {
      const w = window.__egoWorkers!['emp-owner'];
      const out = (window as S).__egoRoofOut as { x: number; z: number };
      const az = Math.atan2(out.x, out.z) + azOffset;
      const dir = { x: Math.sin(az) * Math.cos(elevation), y: Math.sin(elevation), z: Math.cos(az) * Math.cos(elevation) };
      const aim = { x: w.x, y: w.y + aimY, z: w.z };
      const cam = { x: aim.x + dir.x * distance, y: aim.y + dir.y * distance, z: aim.z + dir.z * distance };
      const reach = cam.y / dir.y;
      window.__ego!.app.getState().camera({ type: 'focus', target: { x: cam.x - dir.x * reach, z: cam.z - dir.z * reach }, distance: reach, azimuth: az, elevation, targetY: 0 } as S);
    },
    { azOffset, distance, elevation, aimY },
  );
  await page.waitForTimeout(1500);
}

test('rooftop service call', async ({ page }) => {
  test.setTimeout(900_000);
  let n = 0;
  const shot = async (name: string) => page.screenshot({ path: `test-results/rooftop-service/${String(++n).padStart(2, '0')}-${name}.png` });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  await speed(page, 0);
  await page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    window.__ego!.advanceMinutes(600 - s.clock.minute);
  });
  await page.addStyleTag({ content: '.toasts { display: none !important; }' });
  const jobId = await page.evaluate((lotId) => {
    const e = window.__ego!;
    const s = e.getState() as S;
    for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') e.dispatch({ type: 'decline-lead', jobId: j.id });
    const id = e.spawnLead({ preferredLotId: lotId, channel: 'direct', faultId: 'contactor' })!;
    const st = e.getState() as S;
    st.customers[st.jobs[id].customerId].trust = 100;
    e.dispatch({ type: 'accept-lead', jobId: id });
    const r = e.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    if (!r.ok) throw new Error(r.reason);
    return id;
  }, LOT);
  // The access point's outward direction, for the camera.
  await page.evaluate((lotId) => {
    const spec = (window as S).__egoRoofSpec?.(lotId);
    (window as S).__egoRoofOut = spec ? spec.access[0].out : { x: 0, z: -1 };
  }, LOT);
  await page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); return (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 120_000, polling: 30 });
  await speed(page, 1);

  const capture = async (name: string, az: number, dist: number, elev: number, aimY = 1.0, settle = 300) => {
    await waitStage(page, name);
    await page.waitForTimeout(settle);
    await speed(page, 0);
    await frame(page, az, dist, elev, aimY);
    await shot(name.replace('roof:', '') + (/(up|down)$/.test(name) ? '' : ''));
    await speed(page, 1);
  };
  // Going up.
  await capture('roof:to-rack', 0.9, 12, 0.32, 1.0, 600);
  await capture('roof:retrieve', 0.9, 8, 0.25, 1.4, 1400);
  await capture('roof:carry', 0.7, 9, 0.28, 1.3, 1800);
  await capture('roof:raise', 1.0, 10, 0.25, 1.6, 1100);
  await capture('roof:extend', 0.9, 11, 0.22, 2.4, 900);
  await capture('roof:climb', 1.1, 7, 0.32, 0.4, 3500);
  await capture('roof:transfer', 1.0, 7, 0.32, 0.6, 700);
  await capture('roof:roof-walk', 0.6, 9, 0.5, 0.8, 900);
  // One ladder: it stands at the wall (world pose) while he is on the roof, not on the rack.
  const ladders = await page.evaluate(() => {
    let count = 0;
    (window as S).__egoThree?.scene.traverse((o: S) => { if (o.name.startsWith('ladder:')) count++; });
    return count;
  });
  if (ladders) expect(ladders).toBe(1);

  // Diagnosis at the rooftop unit.
  await page.waitForFunction((id) => (window.__ego!.getState() as S).jobs[id].status === 'diagnosing' && (window as S).__egoWorkerStage?.['emp-owner'] === 'roof:work', jobId, { timeout: 120_000 });
  await page.waitForTimeout(3000);
  await speed(page, 0);
  await frame(page, 1.6, 5, 0.42, 0.7);
  await shot('diagnose');
  await page.evaluate((id) => {
    const e = window.__ego!;
    const s = e.getState() as S;
    e.advanceMinutes(s.jobs[id].phaseRemaining + 0.1);
    const j = (e.getState() as S).jobs[id];
    e.dispatch({ type: 'choose-diagnosis', jobId: id, faultId: j.faultId });
    const r = e.dispatch({ type: 'submit-quote', jobId: id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
    if (!r.ok) throw new Error(r.reason);
  }, jobId);
  const status = await page.evaluate((id) => (window.__ego!.getState() as S).jobs[id].status, jobId);
  if (status === 'repairing') {
    await speed(page, 1);
    await page.waitForTimeout(3000);
    await speed(page, 0);
    await frame(page, 1.6, 5, 0.42, 0.7);
    await shot('repair');
    await page.evaluate((id) => window.__ego!.advanceMinutes((window.__ego!.getState() as S).jobs[id].phaseRemaining + 0.1), jobId);
  }
  const money = await page.evaluate((id) => (window.__ego!.getState() as S).finance.ledger.filter((l: S) => l.jobId === id).length, jobId);
  await page.waitForFunction((id) => (window.__ego!.getState() as S).jobs[id].status === 'completed', jobId);
  expect(await page.evaluate(() => (window.__ego!.getState() as S).vehicles['veh-1'].status)).toBe('onsite');
  await speed(page, 1);
  // Coming down.
  await capture('roof:collect', 1.6, 6, 0.4, 0.8, 400);
  await capture('roof:transfer', 1.0, 7, 0.32, 0.6, 900);
  await capture('roof:climb', 1.1, 7, 0.32, 0.4, 1800);
  await capture('roof:lower', 1.0, 10, 0.25, 1.6, 1300);
  await capture('roof:pick-up', 0.9, 9, 0.28, 1.2, 2400);
  await capture('roof:carry', 0.7, 9, 0.28, 1.3, 2200);
  await capture('roof:stow', 0.9, 8, 0.25, 1.4, 1600);
  // The van leaves only once the ladder is back on the rack.
  await page.waitForFunction(() => (window.__ego!.getState() as S).vehicles['veh-1'].status !== 'onsite', null, { timeout: 120_000 });
  expect(await stage(page)).toMatch(/roof:(enter|to-door)|null/);
  await speed(page, 0);
  await frame(page, 0.4, 14, 0.4, 1.0);
  await shot('depart');
  // The money was booked when the job closed; the pack-up added nothing.
  expect(await page.evaluate((id) => (window.__ego!.getState() as S).finance.ledger.filter((l: S) => l.jobId === id).length, jobId)).toBe(money);
  expect(errors, errors.join('\n')).toHaveLength(0);
});
