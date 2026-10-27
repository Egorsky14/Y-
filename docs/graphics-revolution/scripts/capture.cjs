// Graphics Revolution captures and measurements: node capture.cjs <label> <baseUrl> <outDir> [WxH] [--perf] [--hud]
// Needs a VITE_PROFILE=1 build (window.__egoThree). Seed 42, simulation paused, HUD hidden unless --hud.
// The same camera commands and clock for every build, so before/after pairs are matched.
//   - World views at 10:00, a service call (van at the curb, technician at the condenser), 17:30 and 21:00.
//   - --perf: per view, GPU time of every render (EXT_disjoint_timer_query_webgl2) and frame intervals over
//     a 3 s window with vsync off, plus draw calls and triangles. Writes <outDir>/<label>/metrics.json.
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

(async () => {
  const launchArgs = ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'];
  if (perf) launchArgs.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs });
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
  if (!flags.has('--hud')) {
    await page.addStyleTag({ content: 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} .loading-screen,.lifecycle-overlay{display:none!important}' });
    await ev(() => { for (let e = document.querySelector('canvas'); e; e = e.parentElement) e.style.setProperty('visibility', 'visible', 'important'); });
  }
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
  const metrics = { label, size, shots: {}, errors };
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const shot = async (name, cmd, opts = {}) => {
    if (only.length && !only.some((o) => name.startsWith(o))) return;
    if (cmd) await cam(cmd);
    await sleep(opts.wait ?? 2400);
    await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 82 });
    const r = await ev(() => window.__egoRender);
    const m = { calls: r.calls, triangles: r.triangles, geometries: r.geometries, textures: r.textures };
    if (perf && opts.perf !== false) {
      await ev(() => { window.__gpuMs.length = 0; window.__frames.length = 0; });
      await sleep(3000);
      const p = await ev(() => ({ gpu: window.__gpuMs.slice(), frames: window.__frames.slice() }));
      const meanF = p.frames.reduce((a, b) => a + b, 0) / Math.max(1, p.frames.length);
      m.gpuMsMedian = median(p.gpu) && +median(p.gpu).toFixed(2);
      m.gpuMsMean = p.gpu.length ? +(p.gpu.reduce((a, b) => a + b, 0) / p.gpu.length).toFixed(2) : null;
      m.frameMsMean = +meanF.toFixed(2);
      m.fps = +(1000 / meanF).toFixed(1);
      m.samples = p.gpu.length;
    }
    metrics.shots[name] = m;
    console.log(label, name, JSON.stringify(m));
  };

  const SERVICE = !mobile;
  await advanceTo(600);
  await shot('01-overview-1000', { type: 'reset' });
  await shot('02-hq-1000', { type: 'hq' });
  await shot('03-hq-parking-1000', { type: 'focus', target: { x: 40, z: 50 }, distance: 34, azimuth: -1.9, elevation: 0.42 });
  await shot('04-neighborhood-1000', { type: 'focus', target: { x: -21, z: 25 }, distance: 48, azimuth: 0.9 });
  await shot('05-street-close-1000', { type: 'focus', target: { x: -40, z: 0 }, distance: 24, azimuth: 0.6, elevation: 0.32 });
  await shot('06-supply-depot-1000', { type: 'focus', target: { x: 65, z: -130 }, distance: 60, azimuth: 0.5, elevation: 0.5 });
  await shot('07-hq-van-close-1000', { type: 'focus', target: { x: 22, z: 22 }, distance: 11, azimuth: -2.2, elevation: 0.3, targetY: 1 }, { perf: false });
  if (mobile) {
    fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(label, 'errors', errors.length);
    await browser.close();
    return;
  }

  // Service call: the tutorial lead, dispatched with the owner and Unit 1, played to the repair.
  const job = await ev(() => {
    const s = window.__ego.getState();
    const lead = Object.values(s.jobs).find((j) => j.status === 'lead');
    window.__ego.dispatch({ type: 'accept-lead', jobId: lead.id });
    window.__ego.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    return { id: lead.id, lot: s.customers[lead.customerId].lotId };
  });
  await page.waitForFunction((id) => { window.__ego.advanceMinutes(0.5); const j = window.__ego.getState().jobs[id]; return j.status === 'diagnosing'; }, job.id, { timeout: 60_000, polling: 30 });
  // Let the walk-up finish in real time so the technician stands at the unit.
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 1 }));
  await sleep(12000);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  const geo = await ev((lotId) => {
    const scene = window.__egoThree.scene;
    const house = scene.getObjectByName(`house:${lotId}`);
    const hp = house.getWorldPosition(house.position.clone());
    const w = window.__egoWorkers?.['emp-owner'];
    const v = window.__egoVehicles?.['veh-1'];
    return { house: { x: hp.x, z: hp.z }, tech: w ? { x: w.x, z: w.z } : null, van: { x: v.x, z: v.z } };
  }, job.lot);
  const tech = geo.tech ?? geo.van;
  const az = Math.atan2(geo.van.x - geo.house.x, geo.van.z - geo.house.z);
  await shot('08-service-wide-1000', { type: 'focus', target: { x: (tech.x + geo.van.x) / 2, z: (tech.z + geo.van.z) / 2 }, distance: 30, azimuth: az + 0.5, elevation: 0.7 });
  await shot('09-van-at-home-1000', { type: 'focus', target: geo.van, distance: 12, azimuth: az + 0.9, elevation: 0.35, targetY: 1 }, { perf: false });
  await shot('10-tech-unit-close-1000', { type: 'focus', target: tech, distance: 6.5, azimuth: az + 0.75, elevation: 0.38, targetY: 0.7 });
  await shot('11-tech-unit-close-b-1000', { type: 'focus', target: tech, distance: 6.5, azimuth: az - 0.75, elevation: 0.38, targetY: 0.7 }, { perf: false });
  metrics.serviceGeo = geo;

  if (only.length && !only.some((o) => +o >= 12)) { fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2)); await browser.close(); return; }
  await advanceTo(17 * 60 + 30);
  await shot('12-overview-1730', { type: 'reset' });
  await shot('13-neighborhood-1730', { type: 'focus', target: { x: -21, z: 25 }, distance: 48, azimuth: 0.9 }, { perf: false });
  await shot('14-hq-1730', { type: 'hq' }, { perf: false });
  await advanceTo(21 * 60);
  await shot('15-overview-2100', { type: 'reset' });
  await shot('16-hq-2100', { type: 'hq' }, { perf: false });
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(label, 'errors', errors.length, errors.slice(0, 5));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
