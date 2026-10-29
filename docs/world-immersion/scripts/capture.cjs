// World Immersion captures: node capture.cjs <label> <baseUrl> <outDir> [WxH] [--perf] [--only=W01,W02]
// Needs a VITE_PROFILE=1 build (window.__egoThree). Seed 42, HUD hidden, fixed camera commands and
// clock, so before/after pairs are matched. The simulation is paused (speed 0) for every still; the
// service call is the tutorial lead, dispatched with the owner and Unit 1 and played in real time
// only between stills.
//   W01 city overview (maximum zoom, 10:00), W01b/W01c the same from two other azimuths,
//   W02 north-east boundary, W03 south-west boundary, W04 residential street, W05 HQ overview,
//   W06 HQ service yard, W07 technician arrival (walking from the van), W08 diagnosis at the unit,
//   W09 repair, W10 overview at 17:30, W11 overview at 21:00. Phones (W < 600): W12a overview,
//   W12b street, W12c diagnosis.
//   --perf: GPU time per render (EXT_disjoint_timer_query_webgl2), mean frame time with vsync off,
//   draw calls, triangles, geometries and textures per view, written to <outDir>/<label>/metrics.json.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [label, baseUrl, outRoot, size = '1920x1080'] = args.filter((a) => !a.startsWith('--'));
const [W, H] = size.split('x').map(Number);
const mobile = W < 600;
const perf = flags.has('--perf');
const only = (args.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const out = path.join(outRoot, label);
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERVIEW = { type: 'focus', target: { x: 0, z: 0 }, distance: 340, azimuth: 0.62, elevation: 0.6 };
const VIEWS = [
  ['W01-overview', OVERVIEW],
  ['W01b-overview-east', { ...OVERVIEW, azimuth: 2.25 }],
  ['W01c-overview-west', { ...OVERVIEW, azimuth: -2.3 }],
  ['W02-boundary-ne', { type: 'focus', target: { x: 140, z: -190 }, distance: 240, azimuth: -0.75, elevation: 0.36 }],
  ['W03-boundary-sw', { type: 'focus', target: { x: -140, z: 190 }, distance: 240, azimuth: Math.PI - 0.75, elevation: 0.36 }],
  ['W13-horizon-west', { type: 'focus', target: { x: -120, z: -160 }, distance: 300, azimuth: 0.95, elevation: 0.2 }],
  ['W04-street', { type: 'focus', target: { x: -64, z: 4 }, distance: 72, azimuth: 0.55, elevation: 0.55 }],
  ['W05-hq', { type: 'hq' }],
  ['W06-hq-yard', { type: 'focus', target: { x: 85, z: 68 }, distance: 42, azimuth: -0.9, elevation: 0.62 }],
];
const MOBILE_VIEWS = [
  ['W12a-mobile-overview', { ...OVERVIEW, distance: 330 }],
  ['W12b-mobile-street', VIEWS[5][1]],
];
const PERF_VIEWS = new Set(['W01-overview', 'W02-boundary-ne', 'W04-street', 'W05-hq', 'W08-diagnosis', 'W12a-mobile-overview']);

(async () => {
  const launchArgs = ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'];
  if (perf) launchArgs.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs });
  const ctx = await browser.newContext(mobile ? { viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  await page.goto(baseUrl);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && (window.__egoRender?.vehicleModels ?? 0) >= 1 && !!window.__egoThree, null, { timeout: 120_000 });
  const loadMs = Date.now() - t0;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  if (mobile) await page.getByTestId('touch-tutorial-ok').tap().catch(() => undefined);
  await page.addStyleTag({ content: 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} .loading-screen,.lifecycle-overlay{display:none!important}' });
  await ev(() => { for (let e = document.querySelector('canvas'); e; e = e.parentElement) e.style.setProperty('visibility', 'visible', 'important'); });
  if (perf) {
    await ev(() => {
      const { gl } = window.__egoThree;
      const c = gl.getContext();
      const ext = c.getExtension('EXT_disjoint_timer_query_webgl2');
      window.__gpuMs = [];
      window.__frames = [];
      let last = performance.now();
      const loop = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      if (!ext) return;
      const pending = [];
      const orig = gl.render.bind(gl);
      gl.render = (s, cam) => {
        const q = c.createQuery();
        c.beginQuery(ext.TIME_ELAPSED_EXT, q);
        orig(s, cam);
        c.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push(q);
        while (pending.length && c.getQueryParameter(pending[0], c.QUERY_RESULT_AVAILABLE)) {
          const d = pending.shift();
          if (!c.getParameter(ext.GPU_DISJOINT_EXT)) window.__gpuMs.push(c.getQueryParameter(d, c.QUERY_RESULT) / 1e6);
          c.deleteQuery(d);
        }
      };
    });
  }
  const advanceTo = async (m) => { await ev((m) => { const s = window.__ego.getState(); const now = s.clock.minute; window.__ego.advanceMinutes(m >= now ? m - now : 1440 - now + m); }, m); await sleep(1500); };
  const cam = (c) => ev((c) => window.__ego.app.getState().camera(c), c);
  const metrics = { label, size, loadMs, shots: {}, errors };
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const want = (name) => !only.length || only.some((o) => name.startsWith(o));
  const shot = async (name, cmd, opts = {}) => {
    if (!want(name)) return;
    if (cmd) await cam(cmd);
    await sleep(opts.wait ?? 2600);
    await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 86 });
    const r = await ev(() => window.__egoRender);
    const m = { calls: r.calls, triangles: r.triangles, geometries: r.geometries, textures: r.textures };
    if (perf && PERF_VIEWS.has(name)) {
      await ev(() => { window.__gpuMs.length = 0; window.__frames.length = 0; });
      await sleep(3000);
      const p = await ev(() => ({ gpu: window.__gpuMs.slice(), frames: window.__frames.slice() }));
      const meanF = p.frames.reduce((a, b) => a + b, 0) / Math.max(1, p.frames.length);
      m.gpuMsMedian = median(p.gpu) && +median(p.gpu).toFixed(2);
      m.frameMsMean = +meanF.toFixed(2);
      m.fps = +(1000 / meanF).toFixed(1);
      m.samples = p.gpu.length;
    }
    metrics.shots[name] = m;
    console.log(label, name, JSON.stringify(m));
  };

  await advanceTo(600);
  if (mobile) { for (const [name, cmd] of MOBILE_VIEWS) await shot(name, cmd); }
  else for (const [name, cmd] of VIEWS) await shot(name, cmd);

  // Service call: the tutorial lead, dispatched with the owner and Unit 1.
  const serviceWanted = ['W07', 'W08', 'W09', 'W12c'].some((n) => want(n)) && (mobile ? want('W12c') : true);
  if (serviceWanted) {
    const job = await ev(() => {
      const s = window.__ego.getState();
      const lead = Object.values(s.jobs).find((j) => j.status === 'lead');
      s.customers[lead.customerId].trust = 100;
      window.__ego.dispatch({ type: 'accept-lead', jobId: lead.id });
      window.__ego.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
      return { id: lead.id, lot: s.customers[lead.customerId].lotId };
    });
    await page.waitForFunction(() => { window.__ego.advanceMinutes(0.25); return window.__ego.getState().vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 60_000, polling: 30 });
    const geo = await ev((lotId) => {
      const house = window.__egoThree.scene.getObjectByName(`house:${lotId}`);
      const hp = house.getWorldPosition(house.position.clone());
      const v = window.__ego.getState().vehicles['veh-1'];
      return { house: { x: hp.x, z: hp.z }, van: { x: v.position.x, z: v.position.z } };
    }, job.lot);
    const az = Math.atan2(geo.van.x - geo.house.x, geo.van.z - geo.house.z);
    const mid = { x: geo.van.x * 0.6 + geo.house.x * 0.4, z: geo.van.z * 0.6 + geo.house.z * 0.4 };
    await cam({ type: 'focus', target: mid, distance: 16, azimuth: az + 0.75, elevation: 0.42, targetY: 1 });
    // Play in real time until the technician has stepped out and is walking to the unit.
    await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 1 }));
    // Walking up the yard: 3 m from where the technician first appeared beside the van.
    let walking = null;
    let first = null;
    for (let i = 0; i < 200 && !walking; i++) {
      await sleep(100);
      const w = await ev(() => { const w = window.__egoWorkers?.['emp-owner']; const o = window.__egoThree.scene.getObjectByName('employee:emp-owner'); return w && o?.visible ? { x: w.x, z: w.z } : null; });
      if (w && !first) first = w;
      if (w && first && Math.hypot(w.x - first.x, w.z - first.z) > 3) walking = w;
    }
    await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
    if (!mobile && walking) await shot('W07-arrival', { type: 'focus', target: walking, distance: 9, azimuth: az + Math.PI - 0.7, elevation: 0.3, targetY: 0.9 });
    // Continue until the technician kneels at the unit (stopped moving), still diagnosing.
    await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 1 }));
    let lastPos = null;
    let still = 0;
    for (let i = 0; i < 160 && still < 5; i++) {
      await sleep(250);
      const w = await ev(() => window.__egoWorkers?.['emp-owner'] ?? null);
      still = w && lastPos && Math.hypot(w.x - lastPos.x, w.z - lastPos.z) < 0.01 ? still + 1 : 0;
      lastPos = w;
    }
    await sleep(1500);
    await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
    const tech = await ev(() => window.__egoWorkers['emp-owner']);
    const status1 = await ev((id) => window.__ego.getState().jobs[id].status, job.id);
    const close = { type: 'focus', target: tech, distance: mobile ? 8 : 6.5, azimuth: az + 0.75, elevation: 0.38, targetY: 0.7 };
    await shot(mobile ? 'W12c-mobile-diagnosis' : 'W08-diagnosis', close);
    if (!mobile) {
      await shot('W08c-diagnosis-side', { ...close, azimuth: az - 0.75 });
      const wide = { type: 'focus', target: { x: (tech.x + geo.van.x) / 2, z: (tech.z + geo.van.z) / 2 }, distance: 30, azimuth: az + 0.5, elevation: 0.7 };
      await shot('W08b-service-wide', wide);
      // The lot selected (as after clicking the house or its job pin): the selection highlight on the property.
      await ev((lotId) => window.__ego.app.getState().select({ kind: 'lot', id: lotId }), job.lot);
      await shot('W14-selected-lot', { ...wide, distance: 34 });
      await ev(() => window.__ego.app.getState().select(null));
      // Repair: finish the diagnosis, choose the real fault, quote a repair; the job goes to repairing.
      await page.waitForFunction((id) => { window.__ego.advanceMinutes(1); return window.__ego.getState().jobs[id].status === 'awaiting-diagnosis'; }, job.id, { timeout: 60_000, polling: 30 });
      const status2 = await ev((id) => {
        const j = window.__ego.getState().jobs[id];
        window.__ego.dispatch({ type: 'choose-diagnosis', jobId: id, faultId: j.faultId });
        window.__ego.dispatch({ type: 'submit-quote', jobId: id, quote: { recommendation: 'repair' } });
        return window.__ego.getState().jobs[id].status;
      }, job.id);
      await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 1 }));
      await sleep(2500);
      await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
      await shot('W09-repair', { ...close, azimuth: az + 0.4 });
      await shot('W09b-repair-side', { ...close, azimuth: az - 0.75 });
      metrics.service = { job, geo, tech, statusAtDiagnosis: status1, statusAtRepair: status2 };
    }
  }
  if (!mobile && (want('W10') || want('W11'))) {
    await advanceTo(17 * 60 + 30);
    await shot('W10-golden', OVERVIEW);
    await shot('W10b-golden-hq', { type: 'hq' });
    await advanceTo(21 * 60);
    await shot('W11-night', OVERVIEW);
    await shot('W11b-night-street', VIEWS[5][1]);
  }
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(label, 'errors', errors.length, errors.slice(0, 5));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
