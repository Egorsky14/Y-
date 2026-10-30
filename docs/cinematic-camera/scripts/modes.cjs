// Service camera evidence: node modes.cjs <label> <baseUrl> <outDir> <WxH> <lotId>
// Seed 42, 10:00, HUD and inspector on screen (the composition a player sees). Puts the owner and
// Unit 1 on a service call at <lotId> (the tutorial lead on c-n-4, a spawned lead elsewhere), plays
// in real time until the technician kneels at the unit, selects the job, then captures:
//   property         the establishing shot ("Property" in the camera bar; older builds: the
//                    "Show on map" site camera, serviceSiteCamera)
//   work             "Watch technician" as the button leaves it
//   work-inspector   desktop: the same mode with the inspector expanded (older builds: = work)
//   detail           diagnosis close-up ("Detail"; new builds only)
//   work-repair, detail-repair   after diagnosis and an approved quote, once the repair has started
// Every shot records the camera pose; new builds also record the composition report.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [label, baseUrl, outRoot, size, lotId] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const mobile = W < 600;
const out = path.join(outRoot, label);
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const ctx = await browser.newContext(mobile ? { viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(baseUrl);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && (window.__egoRender?.vehicleModels ?? 0) >= 1 && !!window.__egoThree, null, { timeout: 120_000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  if (mobile) await page.getByTestId('touch-tutorial-ok').tap().catch(() => undefined);
  await page.addStyleTag({ content: '.toasts,.celebration,.hint{display:none!important}' });
  await ev(() => { const s = window.__ego.getState(); window.__ego.advanceMinutes(600 - s.clock.minute); });
  await sleep(1500);

  const job = await ev((lotId) => {
    const s = window.__ego.getState();
    let lead = Object.values(s.jobs).find((j) => j.status === 'lead' && s.customers[j.customerId].lotId === lotId);
    if (!lead) {
      for (const j of Object.values(s.jobs)) if (j.status === 'lead') window.__ego.dispatch({ type: 'decline-lead', jobId: j.id });
      const id = window.__ego.spawnLead({ preferredLotId: lotId });
      lead = window.__ego.getState().jobs[id];
    }
    const st = window.__ego.getState();
    st.customers[lead.customerId].trust = 100;
    window.__ego.dispatch({ type: 'accept-lead', jobId: lead.id });
    window.__ego.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    const c = st.customers[lead.customerId];
    return { id: lead.id, lot: c.lotId, faultId: lead.faultId };
  }, lotId);
  if (job.lot !== lotId) throw new Error(`lead went to ${job.lot}, not ${lotId}`);
  await page.waitForFunction(() => { window.__ego.advanceMinutes(0.25); return window.__ego.getState().vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 90_000, polling: 30 });
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 1 }));
  const techPos = () => ev(() => { const o = window.__egoThree.scene.getObjectByName('employee:emp-owner'); if (!o || !o.visible) return null; const p = o.getWorldPosition(o.position.clone()); const v = window.__ego.getState().vehicles['veh-1'].position; return { x: p.x, z: p.z, fromVan: Math.hypot(p.x - v.x, p.z - v.z) }; });
  const settle = async () => {
    let last = null;
    let still = 0;
    for (let i = 0; i < 320 && still < 5; i++) {
      await sleep(250);
      const w = await techPos();
      still = w && last && w.fromVan > 3 && Math.hypot(w.x - last.x, w.z - last.z) < 0.01 ? still + 1 : 0;
      last = w;
    }
    if (still < 5) throw new Error('technician never settled at the unit');
  };
  await settle();
  await sleep(1200);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));

  const pose = () => ev(() => { const c = window.__egoThree.camera.position; return [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)]; });
  const metrics = { label, size, lot: job.lot, shots: {}, errors };
  const shot = async (name) => {
    await page.screenshot({ path: path.join(out, `${job.lot}-${name}.jpg`), type: 'jpeg', quality: 86 });
    metrics.shots[name] = { camera: await pose(), composition: await ev(() => window.__egoServiceView ?? null) };
  };
  const click = (id) => ev((id) => { const b = document.querySelector(`[data-testid="${id}"]`); if (b) b.click(); return !!b; }, id);
  const isNew = async () => !!(await ev(() => document.querySelector('[data-testid="watch-technician"]') && true)) && (await ev(() => !!window.__egoServiceViewApi));

  await ev((id) => window.__ego.app.getState().select({ kind: 'job', id }), job.id);
  await sleep(500);
  const fresh = await isNew();
  metrics.build = fresh ? 'cinematic' : 'previous';

  // Establishing shot.
  if (fresh) {
    await click('watch-technician');
    await sleep(400);
    await click('service-view-property');
  } else {
    // serviceSiteCamera, from the scene: the van at the curb, the unit, the house.
    await ev(() => {
      const t = window.__egoThree.scene;
      const v = window.__ego.getState().vehicles['veh-1'].position;
      const u = t.getObjectByName('jobsite-kit').getWorldPosition(t.getObjectByName('jobsite-kit').position.clone());
      const st = window.__ego.getState();
      const lotId = Object.values(st.customers).find((c) => Object.values(st.jobs).some((j) => j.customerId === c.id && j.status !== 'declined' && j.status !== 'lead'))?.lotId;
      const h = t.getObjectByName(`house:${lotId}`);
      const c = h.getWorldPosition(h.position.clone());
      window.__ego.app.getState().camera({ type: 'focus', target: { x: v.x * 0.36 + u.x * 0.44 + c.x * 0.2, z: v.z * 0.36 + u.z * 0.44 + c.z * 0.2 }, distance: 38, azimuth: Math.atan2(v.x - u.x, v.z - u.z) + 0.35, elevation: 0.66, targetY: 3 });
    });
  }
  await sleep(2800);
  await shot('property');

  // Watch work, as the button leaves it.
  if (fresh) await click('service-view-work');
  else await click('watch-technician');
  await sleep(3000);
  await shot('work');
  if (!mobile) {
    if (fresh && (await ev(() => document.querySelector('[data-testid="inspector"]').classList.contains('compact')))) {
      await click('inspector-compact');
      await sleep(3000);
    }
    await shot('work-inspector');
    if (fresh) {
      await click('inspector-compact');
      await sleep(2000);
    }
  }
  if (fresh) {
    await click('service-view-detail');
    await sleep(3000);
    await shot('detail');
  }

  // Repair phase: diagnose, quote (approved: trust 100, low price), wait for the repair to start.
  await page.waitForFunction((id) => { const s = window.__ego.getState().jobs[id].status; if (s === 'diagnosing') window.__ego.advanceMinutes(0.25); return s !== 'diagnosing'; }, job.id, { timeout: 60_000, polling: 50 });
  await ev((j) => {
    window.__ego.dispatch({ type: 'choose-diagnosis', jobId: j.id, faultId: j.faultId });
    window.__ego.dispatch({ type: 'submit-quote', jobId: j.id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
  }, job);
  await page.waitForFunction((id) => { const s = window.__ego.getState().jobs[id].status; if (s !== 'repairing') window.__ego.advanceMinutes(0.1); return s === 'repairing' || s === 'completed' || s === 'declined'; }, job.id, { timeout: 60_000, polling: 50 });
  metrics.repairStatus = await ev((id) => window.__ego.getState().jobs[id].status, job.id);
  // A couple of real seconds at 1× for the technician to change to the repair pose and tools.
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 1 }));
  await sleep(2500);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  await sleep(300);
  if (fresh) {
    await click('service-view-work');
    await sleep(3000);
  } else {
    await click('watch-technician');
    await sleep(3000);
  }
  await shot('work-repair');
  if (fresh) {
    await click('service-view-detail');
    await sleep(3000);
    await shot('detail-repair');
  }
  if (fresh && !mobile) {
    // Player control: a hand orbit is never undone while the camera is clear (the camera holds where
    // the player left it), and after leaving the service camera a layout change does not move it.
    await click('service-view-work');
    await sleep(2600);
    await page.mouse.move(W / 2, H / 2);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 10; i++) await page.mouse.move(W / 2 + (90 * i) / 10, H / 2);
    await page.mouse.up({ button: 'right' });
    await sleep(900);
    const released = await pose();
    await sleep(2500);
    const held = await pose();
    await click('service-view-exit');
    await sleep(300);
    const left = await pose();
    await click('inspector-compact');
    await sleep(2500);
    const after = await pose();
    const d = (a, b) => +Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]).toFixed(3);
    metrics.control = { orbitHeldDrift: d(released, held), afterExitLayoutDrift: d(left, after), serviceViewAfterExit: await ev(() => window.__ego.app.getState().serviceView) };
  }
  fs.writeFileSync(path.join(out, `${job.lot}-metrics.json`), JSON.stringify(metrics, null, 2));
  console.log(label, job.lot, metrics.build, 'repair', metrics.repairStatus, 'errors', errors.length, errors.slice(0, 3));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
