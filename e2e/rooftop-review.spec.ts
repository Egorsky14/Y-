import { test, expect, type Page } from '@playwright/test';

/**
 * Rooftop visual review: the whole rooftop service call in the real game, reproduced without waiting for a random
 * lead (the same deterministic setup as rooftop-service.spec: seed 42, a direct call spawned at the lot, accepted and
 * dispatched with the starter van), at Mesquite Plaza (commercial) and the modern home a-n-4 (residential). At each of
 * the twelve review moments the game is paused and shot twice with the HUD hidden: a wide view from the access wall's
 * side (ladder, van and building in frame) and a close-up of the technician (face, proportions, hands, boots,
 * uniform). Shots: test-results/rooftop-review/<site>-<project>/<nn>-<moment>-{wide,close}.png.
 */

test.use({ actionTimeout: 20_000 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

const SITES = [
  { key: 'plaza', lot: 'cm-plaza' },
  { key: 'modern', lot: 'a-n-4' },
] as const;

const speed = (page: Page, v: 0 | 1 | 2 | 5) => page.evaluate((x) => window.__ego!.dispatch({ type: 'set-speed', speed: x }), v);

async function waitFor(page: Page, pred: string, arg: unknown, timeout = 120_000) {
  await page.waitForFunction(new Function('arg', pred) as (a: unknown) => boolean, arg, { timeout, polling: 20 });
}
const stageIs = (page: Page, name: string, extra = 'true') => waitFor(page, `const s = window.__egoWorkerStage?.['emp-owner']; const w = window.__egoWorkers?.['emp-owner']; return s === arg && (${extra});`, name);

/** Wide view: from a fixed side of the access wall (its outward direction plus azOffset), aimed at a height on him. */
async function wide(page: Page, azOffset: number, distance: number, elevation: number, aimY: number) {
  await page.evaluate(
    ({ azOffset, distance, elevation, aimY }) => {
      const w = window.__egoWorkers!['emp-owner'];
      const out = (window as S).__egoRoofOut as { x: number; z: number };
      const az = Math.atan2(out.x, out.z) + azOffset;
      aim(w.x, w.y + aimY, w.z, az, distance, elevation);
      function aim(x: number, y: number, z: number, az: number, distance: number, elevation: number) {
        const dir = { x: Math.sin(az) * Math.cos(elevation), y: Math.sin(elevation), z: Math.cos(az) * Math.cos(elevation) };
        const cam = { x: x + dir.x * distance, y: y + dir.y * distance, z: z + dir.z * distance };
        const reach = cam.y / dir.y;
        window.__ego!.app.getState().camera({ type: 'focus', target: { x: cam.x - dir.x * reach, z: cam.z - dir.z * reach }, distance: reach, azimuth: az, elevation, targetY: 0 } as S);
      }
    },
    { azOffset, distance, elevation, aimY },
  );
  await page.waitForTimeout(1400);
}

/**
 * Close-up in the game's Photo mode (which lets the camera come close and low; free play keeps its distance):
 * relative to the way he faces (0 = his face; or to the access wall's outward side), aimed at a height on his body.
 */
async function close(page: Page, azOffset: number, distance: number, elevation: number, aimY: number, fromWall = false) {
  await page.evaluate(
    ({ azOffset, distance, elevation, aimY, fromWall }) => {
      const app = window.__ego!.app.getState() as S;
      app.setPhoto({ on: true });
      const w = window.__egoWorkers!['emp-owner'];
      const out = (window as S).__egoRoofOut as { x: number; z: number };
      const head = fromWall ? Math.atan2(out.x, out.z) : ((window as S).__egoWorkerHeading?.['emp-owner'] ?? 0);
      // The rig orbits a ground point: put the camera where it should be and orbit the ground point on its sight line.
      const az = head + azOffset;
      const dir = { x: Math.sin(az) * Math.cos(elevation), y: Math.sin(elevation), z: Math.cos(az) * Math.cos(elevation) };
      const cam = { x: w.x + dir.x * distance, y: w.y + aimY + dir.y * distance, z: w.z + dir.z * distance };
      const reach = cam.y / dir.y;
      app.camera({ type: 'focus', target: { x: cam.x - dir.x * reach, z: cam.z - dir.z * reach }, distance: reach, azimuth: az, elevation, targetY: 0 } as S);
    },
    { azOffset, distance, elevation, aimY, fromWall },
  );
  await page.waitForTimeout(1400);
}
const photoOff = (page: Page) => page.evaluate(() => (window.__ego!.app.getState() as S).setPhoto({ on: false }));

for (const site of SITES) {
  test(`rooftop review: ${site.key}`, async ({ page }, info) => {
    test.setTimeout(900_000);
    const phone = (page.viewportSize()?.width ?? 1920) < 700;
    // Phones see less across: step back a little so the same things stay in frame.
    const zoom = phone ? 1.45 : 1;
    const dir = `test-results/rooftop-review/${site.key}-${info.project.name}`;
    let n = 0;
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByTestId('seed-input').fill('42');
    await page.getByTestId('new-game').click();
    await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
    await speed(page, 0);
    const gotIt = page.getByRole('button', { name: /Got it/ });
    if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
    const jobId = await page.evaluate((lotId) => {
      const e = window.__ego!;
      const s = e.getState() as S;
      e.advanceMinutes(600 - s.clock.minute);
      for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') e.dispatch({ type: 'decline-lead', jobId: j.id });
      const id = e.spawnLead({ preferredLotId: lotId, channel: 'direct', faultId: 'contactor' })!;
      const st = e.getState() as S;
      st.customers[st.jobs[id].customerId].trust = 100;
      e.dispatch({ type: 'accept-lead', jobId: id });
      const r = e.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
      if (!r.ok) throw new Error(r.reason);
      const spec = (window as S).__egoRoofSpec?.(lotId);
      (window as S).__egoRoofOut = spec.access[0].out;
      (window as S).__egoRoofEdge = spec.edgeY;
      return id;
    }, site.lot);
    const edge = await page.evaluate(() => (window as S).__egoRoofEdge as number);
    await page.addStyleTag({ content: '.top-hud, .action-bar, .world-controls, .toasts, [data-testid="inspector"], .world-labels, .labels-layer, .camera-bar, .service-bar, .photo-mode { display: none !important; }' });
    await page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); return (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 120_000, polling: 30 });
    await speed(page, 1);

    type View = [az: number, dist: number, elev: number, aimY: number, fromWall?: boolean];
    const moment = async (name: string, w: View, c: View) => {
      await speed(page, 0);
      const tag = `${String(++n).padStart(2, '0')}-${name}`;
      await photoOff(page);
      await wide(page, w[0], w[1] * zoom, w[2], w[3]);
      await page.screenshot({ path: `${dir}/${tag}-wide.png` });
      await close(page, c[0], c[1] * zoom, c[2], c[3], c[4]);
      await page.screenshot({ path: `${dir}/${tag}-close.png` });
      await photoOff(page);
      await speed(page, 1);
    };
    const at = async (stage: string, settle: number, extra?: string) => {
      await stageIs(page, stage, extra);
      if (settle) await page.waitForTimeout(settle);
    };

    // 1–8: up.
    await at('roof:to-rack', 900);
    await moment('beside-truck', [0.9, 11, 0.3, 1.0], [0.5, 2.8, 0.12, 1.2]);
    await at('roof:retrieve', 1500);
    await moment('retrieve-ladder', [0.9, 8, 0.25, 1.4], [0.9, 3.2, 0.15, 1.3]);
    await at('roof:carry', 1600);
    await moment('carry-ladder', [0.7, 9, 0.28, 1.3], [1.0, 4.0, 0.12, 1.3]);
    await at('roof:raise', 1500);
    await moment('ladder-setup', [1.0, 10, 0.25, 1.8], [2.3, 3.6, 0.15, 1.3]);
    await at('roof:mount', 300);
    await moment('begin-climb', [0.6, 7, 0.3, 0.9], [2.4, 3.0, 0.1, 1.0]);
    await at('roof:climb', 0, `w && w.y > ${edge * 0.42}`);
    await moment('halfway-up', [1.1, 7, 0.3, 0.6], [2.4, 3.0, 0.1, 1.0]);
    await at('roof:transfer', 700);
    await moment('onto-roof', [1.0, 7, 0.32, 0.6], [2.5, 3.2, 0.15, 1.0]);
    await at('roof:roof-walk', 900);
    await moment('to-rooftop-unit', [0.6, 9, 0.5, 0.8], [0.6, 3.2, 0.15, 1.1]);

    // 9–10: diagnosis and repair at the unit.
    await page.waitForFunction((id) => (window.__ego!.getState() as S).jobs[id].status === 'diagnosing' && (window as S).__egoWorkerStage?.['emp-owner'] === 'roof:work', jobId, { timeout: 120_000 });
    await page.waitForTimeout(3000);
    await moment('rooftop-diagnosis', [1.6, 5, 0.42, 0.7], [2.2, 2.6, 0.2, 0.7]);
    await speed(page, 0);
    await page.evaluate((id) => {
      const e = window.__ego!;
      e.advanceMinutes((e.getState() as S).jobs[id].phaseRemaining + 0.1);
      const j = (e.getState() as S).jobs[id];
      e.dispatch({ type: 'choose-diagnosis', jobId: id, faultId: j.faultId });
      const r = e.dispatch({ type: 'submit-quote', jobId: id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
      if (!r.ok) throw new Error(r.reason);
    }, jobId);
    expect(await page.evaluate((id) => (window.__ego!.getState() as S).jobs[id].status, jobId)).toBe('repairing');
    await speed(page, 1);
    await page.waitForTimeout(3000);
    await moment('rooftop-repair', [1.6, 5, 0.42, 0.7], [-2.2, 2.6, 0.2, 0.7]);
    await page.evaluate((id) => window.__ego!.advanceMinutes((window.__ego!.getState() as S).jobs[id].phaseRemaining + 0.1), jobId);
    await page.waitForFunction((id) => (window.__ego!.getState() as S).jobs[id].status === 'completed', jobId);

    // 11–12: down and stowed.
    await at('roof:climb', 0, `w && w.y < ${edge * 0.55}`);
    await moment('descending', [1.1, 7, 0.3, 0.6], [2.4, 3.0, 0.1, 1.0]);
    await at('roof:to-door', 200);
    await moment('ladder-on-truck', [0.9, 9, 0.3, 1.4], [0.9, 5.5, 0.3, 1.4, true]);

    expect(n).toBe(12);
    expect(errors, errors.join('\n')).toHaveLength(0);
  });
}

/**
 * Discoverability: Mesquite Plaza selected between calls, as the player finds it. The inspector says the system is on
 * the roof and how it is reached, and Show rooftop unit frames the cabinet and the ladder's access point; the office
 * says its roof is out of reach; then a rooftop call arrives and its map pin and Jobs row are marked Rooftop.
 * Shots: test-results/rooftop-review/discover-<project>/.
 */
test('rooftop discoverability', async ({ page }, info) => {
  test.setTimeout(300_000);
  const dir = `test-results/rooftop-review/discover-${info.project.name}`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
  await speed(page, 0);
  await page.addStyleTag({ content: '.toasts { display: none !important; }' });
  // Phones open with the touch-controls card: dismiss it as a player would.
  const gotIt = page.getByRole('button', { name: /Got it/ });
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
  await page.evaluate(() => {
    const e = window.__ego!;
    for (const j of Object.values((e.getState() as S).jobs) as S[]) if (j.status === 'lead') e.dispatch({ type: 'decline-lead', jobId: j.id });
    (e.app.getState() as S).select({ kind: 'lot', id: 'cm-plaza' });
  });
  // On a phone the inspector is a bottom sheet: scroll the buttons into it, as a player swipes.
  const centre = page.getByRole('button', { name: 'Center camera on property' });
  await centre.scrollIntoViewIfNeeded();
  await centre.click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${dir}/1-property-selected.png` });
  await expect(page.getByTestId('roof-site-note')).toContainText('Rooftop unit');
  await page.getByTestId('show-rooftop-unit').scrollIntoViewIfNeeded();
  await page.getByTestId('show-rooftop-unit').click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${dir}/2-show-rooftop-unit.png` });
  await page.evaluate(() => (window.__ego!.app.getState() as S).select({ kind: 'lot', id: 'cm-office' }));
  await expect(page.getByTestId('roof-site-note')).toContainText('out of ladder reach');
  const id = await page.evaluate(() => {
    const e = window.__ego!;
    (e.app.getState() as S).select(null);
    (e.app.getState() as S).camera({ type: 'focus', target: { x: 168, z: -40 }, distance: 70 });
    return e.spawnLead({ preferredLotId: 'cm-plaza', channel: 'direct' })!;
  });
  await page.waitForTimeout(1800);
  await expect(page.getByTestId(`job-pin-${id}`)).toContainText('Rooftop');
  await page.screenshot({ path: `${dir}/3-rooftop-call-pin.png` });
  await page.evaluate(() => (window.__ego!.app.getState() as S).openPanel('jobs'));
  await expect(page.getByTestId('rooftop-tag').first()).toBeVisible();
  await page.screenshot({ path: `${dir}/4-jobs-list.png` });
  expect(errors, errors.join('\n')).toHaveLength(0);
});

