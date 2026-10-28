// Environment Revolution captures: node capture.cjs <label> <baseUrl> <outDir> [WxH] [--perf] [--only=E01,E02]
// Needs a VITE_PROFILE=1 build (window.__egoThree). Seed 42, simulation paused, HUD hidden. The same
// camera commands and clock for every build, so before/after pairs are matched. Views:
//   E01 six neighbouring houses (block A, south row with the north row behind), E02 a house from the
//   street, E03 a backyard, E04 an upscale property, E05 a modest property, E06 HQ overview, E07 HQ
//   parking and service yard, E08 the six-house view at 17:30, E09 at 21:00, plus extra backyards
//   (E11–E13) and street views (E14–E15). Phones (W < 600) capture E01, E02, E06 and E10.
//   --perf: GPU time per render (EXT_disjoint_timer_query_webgl2), mean frame time with vsync off,
//   draw calls and triangles per view, written to <outDir>/<label>/metrics.json.
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

// Block A south row (a-s-1..4 at x -108, -79, -50, -21, centre z -25, facing Sunset Mesa Dr at z 0);
// its backyards run north to z -43. Block A north row (a-n) backs onto them from z -57.
const SIX = { type: 'focus', target: { x: -64, z: -34 }, distance: 92, azimuth: 0.32, elevation: 0.86 };
const VIEWS = [
  ['E01-six-houses', SIX],
  ['E02-house-street', { type: 'focus', target: { x: -79, z: -16 }, distance: 34, azimuth: 0.25, elevation: 0.42, targetY: 1 }],
  ['E03-backyard', { type: 'focus', target: { x: -50, z: -37 }, distance: 26, azimuth: Math.PI - 0.5, elevation: 0.62 }],
  ['E04-upscale', { type: 'focus', target: { x: -79, z: -30 }, distance: 36, azimuth: Math.PI - 0.7, elevation: 0.7 }],
  ['E05-modest', { type: 'focus', target: { x: -21, z: -30 }, distance: 32, azimuth: 0.6, elevation: 0.75 }],
  ['E06-hq', { type: 'hq' }],
  ['E07-hq-yard', { type: 'focus', target: { x: 85, z: 70 }, distance: 50, azimuth: -0.9, elevation: 0.7 }],
  ['E11-backyard-b', { type: 'focus', target: { x: -108, z: -37 }, distance: 26, azimuth: Math.PI - 0.5, elevation: 0.62 }],
  ['E12-backyard-c', { type: 'focus', target: { x: -21, z: -37 }, distance: 26, azimuth: Math.PI + 0.5, elevation: 0.62 }],
  ['E13-backyard-d', { type: 'focus', target: { x: 51, z: -37 }, distance: 26, azimuth: Math.PI - 0.5, elevation: 0.62 }],
  ['E14-street', { type: 'focus', target: { x: -64, z: 2 }, distance: 30, azimuth: 0.9, elevation: 0.34, targetY: 1 }],
  ['E15-roofs', { type: 'focus', target: { x: 36, z: 25 }, distance: 70, azimuth: 0.7, elevation: 0.95 }],
  // Archetype close-ups: a-n-2 (classic xeriscape) and a-n-4 (modern minimal) backyards, c-n-3 (upscale, pool).
  ['E16-classic', { type: 'focus', target: { x: -79, z: -62 }, distance: 30, azimuth: 0.5, elevation: 0.7 }],
  ['E17-modern', { type: 'focus', target: { x: -21, z: -62 }, distance: 30, azimuth: -0.5, elevation: 0.7 }],
  ['E18-upscale-pool', { type: 'focus', target: { x: -50, z: 37 }, distance: 32, azimuth: 0.45, elevation: 0.72 }],
];
const MOBILE = new Set(['E01-six-houses', 'E02-house-street', 'E06-hq']);

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
  const metrics = { label, size, shots: {}, errors };
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const shot = async (name, cmd, opts = {}) => {
    if (only.length && !only.some((o) => name.startsWith(o))) return;
    await cam(cmd);
    await sleep(opts.wait ?? 2400);
    await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 84 });
    const r = await ev(() => window.__egoRender);
    const m = { calls: r.calls, triangles: r.triangles, geometries: r.geometries, textures: r.textures };
    if (perf && opts.perf !== false) {
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
  for (const [name, cmd] of VIEWS) if (!mobile || MOBILE.has(name)) await shot(name, cmd, { perf: ['E01-six-houses', 'E06-hq', 'E03-backyard', 'E14-street'].includes(name) });
  if (mobile) {
    await shot('E10-mobile-neighborhood', { type: 'focus', target: { x: -64, z: -30 }, distance: 70, azimuth: 0.3, elevation: 0.9 });
  } else {
    await advanceTo(17 * 60 + 30);
    await shot('E08-golden-hour', SIX, { perf: false });
    await shot('E08b-golden-street', VIEWS[1][1], { perf: false });
    await advanceTo(21 * 60);
    await shot('E09-night', SIX);
    await shot('E09b-night-street', VIEWS[1][1], { perf: false });
  }
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(label, 'errors', errors.length, errors.slice(0, 5));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
