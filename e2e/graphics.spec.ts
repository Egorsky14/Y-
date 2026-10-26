import { test, expect, type Page } from '@playwright/test';

/**
 * Graphics and gameplay regression for the premium build. Runs in both configured viewports.
 * Verifies WebGL rendering, model loading, world structure, selection, routed driving with
 * animated wheels and chassis, the technician at the right property without clipping, and
 * a clean console.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

async function state<T, A = undefined>(page: Page, fn: (s: S, arg: A) => T, arg?: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = window.__ego!.getState()! as S;
      return new Function('s', 'arg', `return (${src})(s, arg)`)(s, a) as T;
    },
    [fn.toString(), arg] as const,
  );
}

test('renders the premium world and drives the branded van with animated wheels', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('hud-cash')).toBeVisible();

  // 1. WebGL rendering with real draw calls.
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100, null, { timeout: 30_000 });
  const gpu = await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext;
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? (gl.getParameter(d.UNMASKED_RENDERER_WEBGL) as string) : 'unknown';
  });
  console.log(`[graphics] renderer: ${gpu} viewport ${testInfo.project.name}`);

  // 2 + 3 + 4. Headquarters, the glTF van and all 32 houses are in the scene graph.
  await page.waitForFunction(() => (window.__egoRender?.vehicleModels ?? 0) >= 1, null, { timeout: 30_000 });
  const render = await page.evaluate(() => window.__egoRender!);
  expect(render.houses).toBe(32);
  expect(render.vehicleModels).toBeGreaterThanOrEqual(1);
  expect(render.workers).toBeGreaterThanOrEqual(1);
  expect(render.instanced).toBeGreaterThanOrEqual(6);
  expect(render.triangles).toBeGreaterThan(100_000);
  console.log(`[graphics] draw calls ${render.calls}, triangles ${render.triangles}, textures ${render.textures}`);
  const modelResponse = await page.evaluate(async () => {
    const r = await fetch('./models/vehicles/full-size-van.glb');
    return { ok: r.ok, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength };
  });
  expect(modelResponse.ok).toBe(true);
  expect(modelResponse.bytes).toBeGreaterThan(100_000);

  // 6. Selecting a customer property opens its inspector.
  await page.getByTestId('cam-reset').click();
  const pin = page.locator('.job-pin').first();
  await expect(pin).toBeVisible({ timeout: 15_000 });
  await pin.click();
  await expect(page.getByTestId('inspector')).toContainText('Direct customer');
  const leadId: string = await state(page, (s) => (Object.values(s.jobs) as S[]).find((j) => j.status === 'lead').id);

  // 5 + 7 + 8. Dispatch; the van follows the road route while wheels spin and the chassis responds.
  await page.getByTestId('accept-lead').click();
  await page.getByTestId('dispatch-go').click();
  await page.getByTestId('cam-follow').click();
  await page.waitForFunction(() => !!window.__egoVehicles?.['veh-1'], null, { timeout: 30_000 });
  // Bay door 1 rolls up while the van moves through the yard.
  await page.waitForFunction(() => (window.__egoBayDoors?.[0] ?? 0) > 0.2, null, { timeout: 60_000 });
  const v0 = await page.evaluate(() => window.__egoVehicles!['veh-1']);
  // Poll until the rendered van has travelled and its wheels have turned (software GL is slow).
  await page.waitForFunction(
    (start) => {
      const v = window.__egoVehicles?.['veh-1'];
      return !!v && Math.hypot(v.x - start.x, v.z - start.z) > 3 && Math.abs(v.wheelSpin - start.wheelSpin) > 1;
    },
    v0,
    { timeout: 60_000 },
  );
  const v1 = await page.evaluate(() => window.__egoVehicles!['veh-1']);
  expect(Math.hypot(v1.x - v0.x, v1.z - v0.z)).toBeGreaterThan(3);
  expect(Math.abs(v1.wheelSpin - v0.wheelSpin)).toBeGreaterThan(1);
  const sim = await state(page, (s) => ({ x: s.vehicles['veh-1'].position.x, z: s.vehicles['veh-1'].position.z }));
  expect(Math.hypot(sim.x - v1.x, sim.z - v1.z)).toBeLessThan(4); // render follows the simulation
  const streets = [-100, 0, 100];
  const avenues = [-130, 0, 130];
  const onRoad = streets.some((z) => Math.abs(sim.z - z) < 6) || avenues.some((x) => Math.abs(sim.x - x) < 6) || (sim.x > 7 && sim.x < 70 && sim.z > 7 && sim.z < 93);
  expect(onRoad).toBe(true);

  // 9 + 10. Technician arrives at the correct property and works outside the wall.
  await page.getByTestId('speed-5').click();
  await page.waitForFunction((id) => (window.__ego!.getState() as S).jobs[id].status === 'diagnosing', leadId, { timeout: 120_000 });
  const tech = await state(
    page,
    (s, id) => {
      const job = s.jobs[id];
      const c = s.customers[job.customerId];
      const e = s.employees[job.technicianId];
      return { lotId: c.lotId, pos: e.position, status: e.status, vehicle: s.vehicles['veh-1'].status };
    },
    leadId,
  );
  expect(tech.status).toBe('working');
  expect(tech.vehicle).toBe('onsite');
  // The rendered technician stands on the ground at the simulated spot (no sinking, no floating).
  // The view eases toward the simulation, so wait for it to settle: on a GPU at 60 fps the walk is
  // still converging when the job flips to diagnosing; the software renderer snapped in one frame.
  const techId = (await state(page, (s, id) => s.jobs[id].technicianId, leadId)) as string;
  await page.waitForFunction(
    ([id, p]) => {
      const w = window.__egoWorkers?.[id];
      return !!w && Math.hypot(w.x - p.x, w.z - p.z) < 1.5;
    },
    [techId, tech.pos] as const,
    { timeout: 10_000 },
  );
  const techRender = await page.evaluate((id) => window.__egoWorkers?.[id], techId);
  expect(techRender).toBeTruthy();
  expect(Math.abs(techRender!.y)).toBeLessThan(0.12);
  expect(Math.hypot(techRender!.x - tech.pos.x, techRender!.z - tech.pos.z)).toBeLessThan(1.5);
  expect(tech.lotId).toBe('c-n-4'); // the tutorial customer's lot, across the street from HQ
  // c-n-4 is a ranch home centered at (-21, 25), 16 m wide: the worker must be clear of the wall.
  expect(Math.abs(tech.pos.x - -21)).toBeGreaterThan(8 + 0.9);

  // 11 + 12. Diagnosis and payment.
  await page.waitForFunction((id) => (window.__ego!.getState() as S).jobs[id].status === 'awaiting-diagnosis', leadId, { timeout: 120_000 });
  const faultId: string = await state(page, (s, id) => s.jobs[id].faultId, leadId);
  await page.getByTestId(`diagnosis-${faultId}`).click();
  await page.getByTestId('confirm-diagnosis').click();
  await page.getByTestId('quote-repair').click();
  await page.getByTestId('present-quote').click();
  await page.waitForFunction((id) => (window.__ego!.getState() as S).jobs[id].status === 'completed', leadId, { timeout: 120_000 });
  const paid = await state(page, (s, id) => ({ cash: s.finance.cash as number, collected: s.jobs[id].financials.revenueCollected as number }), leadId);
  expect(paid.collected).toBeGreaterThanOrEqual(95);
  expect(paid.cash).toBeGreaterThan(25000);

  // 13. Lighting follows the clock: evening drops the sun and exposure, night brings the lamps up.
  const noon = await page.evaluate(() => window.__egoAtmo!);
  await page.evaluate(() => {
    const s = window.__ego!.getState() as S;
    window.__ego!.advanceMinutes(Math.max(0, 20.5 * 60 - s.clock.minute));
  });
  await page.waitForFunction((dayExposure) => !!window.__egoAtmo && window.__egoAtmo.exposure < dayExposure - 0.15 && window.__egoAtmo.sunIntensity < 0.6, noon.exposure, { timeout: 30_000 });
  const evening = await page.evaluate(() => window.__egoAtmo!);
  expect(evening.elevation).toBeLessThan(noon.elevation);

  // 14. Photo mode hides the HUD, frees the camera and restores everything on exit without touching the simulation.
  const cashBefore = await state(page, (s) => s.finance.cash as number);
  await page.getByTestId('photo-mode-toggle').click();
  await expect(page.getByTestId('photo-mode')).toBeVisible();
  await expect(page.getByTestId('hud-cash')).toHaveCount(0);
  await page.evaluate(() => window.__ego!.app.getState().setPhoto({ minute: 12 * 60, weather: 'clear' }));
  await page.waitForFunction(() => !!window.__egoAtmo && window.__egoAtmo.minute === 12 * 60, null, { timeout: 20_000 });
  await page.getByTestId('photo-exit').click();
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  const cashAfter = await state(page, (s) => s.finance.cash as number);
  expect(cashAfter).toBe(cashBefore);

  // 15. Layout: the HUD, action bar and world controls all fit the viewport.
  const bar = await page.getByTestId('nav-finance').boundingBox();
  const controls = await page.getByTestId('cam-reset').boundingBox();
  expect(bar && controls && bar.x + bar.width <= controls.x, 'action bar overlaps world controls').toBe(true);
  for (const id of ['hud-cash', 'cam-reset', 'nav-fleet']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(testInfo.project.use.viewport!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(testInfo.project.use.viewport!.height + 1);
  }

  // 17. No browser errors (Three.js deprecation warnings are not errors).
  const real = errors.filter((e) => !e.includes('deprecated') && !e.includes('PCFSoftShadowMap'));
  expect(real, real.join('\n')).toEqual([]);
});
