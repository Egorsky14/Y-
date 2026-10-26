// Service-call scene captures: node servicecall.cjs <baseUrl> <outDir>
// Seed 42, tutorial lead. Accepts and dispatches through the game's actions, then plays the arrival
// at 1x game speed in real time (the scene's own pacing) and captures fixed beats from a gameplay
// view and a close review view, both framed from the street side of the house. Needs a dev or
// VITE_PROFILE=1 build (reads positions from window.__egoThree / __ego).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [url, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && !!window.__egoThree, null, { timeout: 120_000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  await page.addStyleTag({ content: 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} .loading-screen,.lifecycle-overlay{display:none!important}' });
  await ev(() => { for (let e = document.querySelector('canvas'); e; e = e.parentElement) e.style.setProperty('visibility', 'visible', 'important'); });
  const job = await ev(() => {
    const s = window.__ego.getState();
    const lead = Object.values(s.jobs).find((j) => j.status === 'lead');
    window.__ego.dispatch({ type: 'accept-lead', jobId: lead.id });
    window.__ego.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    return { id: lead.id, lot: s.customers[lead.customerId].lotId };
  });
  // Fast-forward the drive in small steps until the van is a few seconds from the curb.
  for (let i = 0; i < 400; i++) {
    const v = await ev(() => { const v = window.__ego.getState().vehicles['veh-1']; return { st: v.status, left: v.route ? v.route.totalLength - v.route.progress : 0 }; });
    if (v.st !== 'enroute' || v.left < 40) break;
    await ev(() => window.__ego.advanceMinutes(0.25));
    await sleep(20);
  }
  // Frame: the house's street side, looking at the stretch between curb and condenser.
  const geo = await ev((lotId) => {
    const s = window.__ego.getState();
    const scene = window.__egoThree.scene;
    const house = scene.getObjectByName(`house:${lotId}`);
    const lot = s.customers[Object.values(s.jobs)[0].customerId] && null; void lot;
    const v = s.vehicles['veh-1'];
    const hp = house ? house.getWorldPosition(house.position.clone()) : { x: 0, z: 0 };
    return { house: { x: hp.x, z: hp.z }, van: { x: v.position.x, z: v.position.z } };
  }, job.lot);
  const shots = [];
  const beat = async (name) => {
    const tech = await ev(() => { const w = window.__egoWorkers?.['emp-owner']; return w ? { x: w.x, z: w.z } : null; });
    // The drawn van (window.__egoVehicles): parked at a job it sits in the curb lane, not at the route's end.
    const v = await ev(() => { const v = window.__ego.getState().vehicles['veh-1']; const r = window.__egoVehicles?.['veh-1']; return { x: r?.x ?? v.position.x, z: r?.z ?? v.position.z, st: v.status }; });
    const focus = tech && (await ev(() => window.__egoThree.scene.getObjectByName('employee:emp-owner')?.visible)) ? tech : v;
    // Street-side azimuth: from the house toward the street.
    const az = Math.atan2(v.x - geo.house.x, v.z - geo.house.z);
    // Close review from the street side of the technician, swung either way (one side faces the house wall).
    for (const [label, dist, el, target, swing] of [['game', 30, 0.75, { x: (focus.x + v.x) / 2, z: (focus.z + v.z) / 2 }, 0.5], ['close-a', 6.5, 0.38, focus, 0.75], ['close-b', 6.5, 0.38, focus, -0.75], ['close-curb', 7.5, 0.32, focus, Math.PI - 0.5]]) {
      await ev((c) => window.__ego.app.getState().camera(c), { type: 'focus', target, distance: dist, azimuth: az + swing, elevation: el, targetY: 0.7 });
      await sleep(1600);
      const file = path.join(outDir, `${name}-${label}.png`);
      await page.screenshot({ path: file });
      shots.push(file);
    }
    const st = await ev((id) => { const s = window.__ego.getState(); return { job: s.jobs[id].status, tech: s.employees['emp-owner'].status, phase: +(1 - s.jobs[id].phaseRemaining / (s.jobs[id].phaseTotal || 1)).toFixed(2) }; }, job.id);
    console.log(name, JSON.stringify({ ...st, van: v.st, techVisible: !!tech }));
  };
  // Play at 1x in real time; pause at each beat so the camera can frame it, then resume.
  const play = async (pred, maxMs = 30_000) => {
    await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 1 }));
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs && !(await ev(pred, job.id))) await sleep(30);
    await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  };
  await play((id) => window.__ego.getState().vehicles['veh-1'].status === 'onsite');
  // Beats: real-time seconds of 1x play after the van reaches the curb (BEATS env overrides).
  // The default suits the arrival choreography; the baseline set used the sim's 1.5-minute walk.
  const beats = (process.env.BEATS || '1-arrival:1.0,2-exit:3.0,3-walk:3.5,4-at-unit:9.6,5-service:2.6').split(',').map((b) => b.split(':'));
  for (const [name, secs] of beats) {
    await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 1 }));
    await sleep(+secs * 1000);
    await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
    await beat(name);
  }
  fs.writeFileSync(path.join(outDir, 'errors.json'), JSON.stringify(errors, null, 2));
  console.log('errors', errors.length);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
