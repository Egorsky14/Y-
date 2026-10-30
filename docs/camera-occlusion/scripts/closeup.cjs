// Close-up camera evidence: node closeup.cjs <label> <baseUrl> <outDir> <WxH> <lotId> [--ui]
// Seed 42, 10:00, HUD hidden. Puts the owner and Unit 1 on a service call at <lotId> (the tutorial
// lead on c-n-4, a spawned lead elsewhere), plays in real time until the technician kneels at the
// unit, then captures:
//   <lot>-legacy   the close camera used before the fix (street-side quarter from the van-to-house
//                  heading + 0.75 rad, 6.5 m / 8 m on phones, 0.38 rad, look-at 0.7 m), as the
//                  World Immersion and Graphics Revolution 2 captures framed it;
//   <lot>-watch    the in-game "Watch technician" close-up (new builds only: the inspector button);
//   <lot>-orbit-*  desktop only: a real right-drag orbit from the watched view toward the house,
//                  just after release and 1.8 s later, with the camera track written to metrics.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const [label, baseUrl, outRoot, size, lotId] = args.filter((a) => !a.startsWith('--'));
// --ui keeps the HUD and inspector on screen (the in-game composition); otherwise the canvas only.
const ui = args.includes('--ui');
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
  if (!ui) await page.addStyleTag({ content: 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} .loading-screen,.lifecycle-overlay{display:none!important}' });
  if (!ui) await ev(() => { for (let e = document.querySelector('canvas'); e; e = e.parentElement) e.style.setProperty('visibility', 'visible', 'important'); });
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
    return { id: lead.id, lot: c.lotId, equipment: c.equipment };
  }, lotId);
  if (job.lot !== lotId) throw new Error(`lead went to ${job.lot}, not ${lotId}`);
  await page.waitForFunction(() => { window.__ego.advanceMinutes(0.25); return window.__ego.getState().vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 90_000, polling: 30 });
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 1 }));
  // The technician's scene object (window.__egoWorkers has two writers): kneeling = visible, 3 m or
  // more from the van, and still for 5 samples.
  const techPos = () => ev(() => { const o = window.__egoThree.scene.getObjectByName('employee:emp-owner'); if (!o || !o.visible) return null; const p = o.getWorldPosition(o.position.clone()); const v = window.__ego.getState().vehicles['veh-1'].position; return { x: p.x, z: p.z, fromVan: Math.hypot(p.x - v.x, p.z - v.z) }; });
  let last = null;
  let still = 0;
  for (let i = 0; i < 320 && still < 5; i++) {
    await sleep(250);
    const w = await techPos();
    still = w && last && w.fromVan > 3 && Math.hypot(w.x - last.x, w.z - last.z) < 0.01 ? still + 1 : 0;
    last = w;
  }
  if (still < 5) throw new Error('technician never settled at the unit');
  await sleep(1200);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  const geo = await ev((lotId) => {
    const house = window.__egoThree.scene.getObjectByName(`house:${lotId}`);
    const hp = house.getWorldPosition(house.position.clone());
    const v = window.__ego.getState().vehicles['veh-1'];
    const u = window.__egoThree.scene.getObjectByName('jobsite-kit'); const up = u ? u.getWorldPosition(u.position.clone()) : hp; return { unit: { x: up.x, z: up.z }, house: { x: hp.x, z: hp.z }, van: { x: v.position.x, z: v.position.z }, tech: (() => { const o = window.__egoThree.scene.getObjectByName('employee:emp-owner'); const q = o.getWorldPosition(o.position.clone()); return { x: q.x, z: q.z }; })(), status: window.__ego.getState().jobs[Object.keys(window.__ego.getState().jobs).find((k) => window.__ego.getState().customers[window.__ego.getState().jobs[k].customerId].lotId === lotId && window.__ego.getState().jobs[k].status !== 'declined')].status };
  }, job.lot);
  const pose = () => ev(() => { const c = window.__egoThree.camera.position; return [c.x, c.y, c.z]; });
  const metrics = { label, size, lot: job.lot, equipment: job.equipment, geo, shots: {}, errors };
  const shot = async (name) => {
    await page.screenshot({ path: path.join(out, `${job.lot}-${name}.jpg`), type: 'jpeg', quality: 86 });
    metrics.shots[name] = { camera: await pose() };
  };

  const az = Math.atan2(geo.van.x - geo.house.x, geo.van.z - geo.house.z);
  await ev((c) => window.__ego.app.getState().camera(c), { type: 'focus', target: { x: geo.tech.x, z: geo.tech.z }, distance: mobile ? 8 : 6.5, azimuth: az + 0.75, elevation: 0.38, targetY: 0.7 });
  await sleep(2400);
  await shot('legacy');

  // Diagnostic tools up close (Photo Mode allows the camera inside 5 m): hands, meter, leads and
  // gauges from the technician's open side, at the same heading the watched close-up uses.
  await ev(() => window.__ego.app.getState().setPhoto({ on: true }));
  await sleep(500);
  const toolsAz = Math.atan2(geo.tech.x - geo.house.x, geo.tech.z - geo.house.z);
  // The orbit target stays on the ground, so aim through the hands: camera 2.4 m from a point 0.6 m up
  // between technician and unit, target where that sight line meets the ground.
  const hands = { x: geo.tech.x * 0.75 + geo.unit.x * 0.25, y: 0.62, z: geo.tech.z * 0.75 + geo.unit.z * 0.25 };
  const az2 = toolsAz - 0.35;
  const el = 0.32;
  const C = { x: hands.x + Math.sin(az2) * Math.cos(el) * 2.4, y: hands.y + Math.sin(el) * 2.4, z: hands.z + Math.cos(az2) * Math.cos(el) * 2.4 };
  const t = C.y / (C.y - hands.y);
  const G = { x: C.x + (hands.x - C.x) * t, z: C.z + (hands.z - C.z) * t };
  const dist = Math.hypot(C.x - G.x, C.y, C.z - G.z);
  await ev((c) => window.__ego.app.getState().camera(c), { type: 'focus', target: G, distance: dist, azimuth: az2, elevation: Math.asin(C.y / dist) });
  await sleep(2400);
  await shot('tools');
  await ev(() => window.__ego.app.getState().setPhoto({ on: false }));
  await sleep(600);

  // In-game close-up: select the job, press "Watch technician" in the inspector.
  await ev((id) => window.__ego.app.getState().select({ kind: 'job', id }), job.id);
  await sleep(400);
  const hasWatch = await ev(() => { const b = document.querySelector('[data-testid="watch-technician"]'); if (b) b.click(); return !!b; });
  metrics.watchButton = hasWatch;
  if (hasWatch) {
    await sleep(2600);
    await shot('watch');
    if (!mobile) {
      // Orbit by hand toward the house (MapControls: right-drag rotates), both ways in turn.
      metrics.orbit = [];
      for (const [dir, dx] of [['right', 260], ['left', -520]]) {
        const before = await pose();
        await page.mouse.move(W / 2, H / 2);
        await page.mouse.down({ button: 'right' });
        for (let i = 1; i <= 12; i++) await page.mouse.move(W / 2 + (dx * i) / 12, H / 2);
        await page.mouse.up({ button: 'right' });
        await sleep(120);
        const released = await pose();
        await shot(`orbit-${dir}-released`);
        await sleep(1800);
        const settled = await pose();
        await shot(`orbit-${dir}-settled`);
        // Stability: no further motion once settled (no oscillation).
        const track = [];
        for (let i = 0; i < 10; i++) { await sleep(200); track.push(await pose()); }
        const drift = Math.max(...track.map((p) => Math.hypot(p[0] - settled[0], p[1] - settled[1], p[2] - settled[2])));
        const moved = Math.hypot(settled[0] - released[0], settled[1] - released[1], settled[2] - released[2]);
        metrics.orbit.push({ dir, before, released, settled, settleMove: +moved.toFixed(3), driftAfterSettle: +drift.toFixed(4) });
      }
    }
  }
  fs.writeFileSync(path.join(out, `${job.lot}-metrics.json`), JSON.stringify(metrics, null, 2));
  console.log(label, job.lot, 'watch', hasWatch, JSON.stringify(metrics.orbit ?? null), 'errors', errors.length, errors.slice(0, 3));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
