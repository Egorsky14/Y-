// Paired, interleaved benchmark of two builds: node paired.cjs <labelA> <urlA> <labelB> <urlB> <outFile> [cycles]
// Both builds load in one browser; the page not being measured is frozen through CDP
// (Page.setWebLifecycleState), and measurement windows alternate A B A B ... per view, so slow
// drift (thermals, turbo, background load) hits both builds equally. Per window it records frame
// times (uncapped: vsync and frame limiter off) and, where EXT_disjoint_timer_query_webgl2 is
// available, the GPU time of every WebGLRenderer.render call (needs window.__egoThree: a dev or
// VITE_PROFILE=1 build).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const [la, ua, lb, ub, outFile, cyclesArg = '8'] = process.argv.slice(2);
const cycles = +cyclesArg;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWS = [
  { id: 'overview-1000', minute: 600, cmd: { type: 'reset' } },
  { id: 'hq-1000', minute: 600, cmd: { type: 'hq' } },
  { id: 'neighborhood-1000', minute: 600, cmd: { type: 'focus', target: { x: -21, z: 25 }, distance: 48, azimuth: 0.9 } },
  { id: 'overview-2100', minute: 1260, cmd: { type: 'reset' } },
];

async function open(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(url);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && (window.__egoRender?.vehicleModels ?? 0) >= 1, null, { timeout: 90_000 });
  await page.evaluate(() => {
    window.__ego.dispatch({ type: 'set-speed', speed: 0 });
    window.__gpuMs = [];
    if (!window.__egoThree) return; // no profiling hook: frame times only
    const { gl } = window.__egoThree;
    const ctx = gl.getContext();
    const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2');
    window.__gpuMs = [];
    if (!ext) return;
    const pending = [];
    const orig = gl.render.bind(gl);
    gl.render = (scene, camera) => {
      const q = ctx.createQuery();
      ctx.beginQuery(ext.TIME_ELAPSED_EXT, q);
      orig(scene, camera);
      ctx.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(q);
      while (pending.length && ctx.getQueryParameter(pending[0], ctx.QUERY_RESULT_AVAILABLE)) {
        const done = pending.shift();
        if (!ctx.getParameter(ext.GPU_DISJOINT_EXT)) window.__gpuMs.push(ctx.getQueryParameter(done, ctx.QUERY_RESULT) / 1e6);
        ctx.deleteQuery(done);
      }
    };
  });
  return { page, cdp };
}

const freeze = (p, on) => p.cdp.send('Page.setWebLifecycleState', { state: on ? 'frozen' : 'active' });
const setView = async (p, v) => {
  await p.page.evaluate(({ minute, cmd }) => {
    const s = window.__ego.getState();
    const now = s.clock.minute;
    if (Math.abs(now - minute) > 1) window.__ego.advanceMinutes(minute >= now ? minute - now : 1440 - now + minute);
    window.__ego.app.getState().camera(cmd);
  }, v);
};
const windowMeasure = (p, ms) => p.page.evaluate((ms) => new Promise((res) => {
  window.__gpuMs.length = 0;
  const times = []; let last = performance.now(); const t0 = last;
  const f = () => { const now = performance.now(); times.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else res({ times, gpu: [...window.__gpuMs], calls: window.__egoRender.calls, triangles: window.__egoRender.triangles }); };
  requestAnimationFrame(f);
}), ms);

function summarize(samples) {
  const times = samples.flatMap((s) => s.times.slice(5)).sort((a, b) => a - b);
  const gpu = samples.flatMap((s) => s.gpu.slice(5)).sort((a, b) => a - b);
  const sum = (x) => x.reduce((a, b) => a + b, 0);
  const worst = times.slice(Math.floor(times.length * 0.99));
  const perWindowFps = samples.map((s) => 1000 / (sum(s.times.slice(5)) / (s.times.length - 5))).sort((a, b) => a - b);
  return {
    fps: +(1000 / (sum(times) / times.length)).toFixed(1),
    fpsMedianWindow: +perWindowFps[Math.floor(perWindowFps.length / 2)].toFixed(1),
    p50ms: +times[Math.floor(times.length * 0.5)].toFixed(2),
    p95ms: +times[Math.floor(times.length * 0.95)].toFixed(2),
    p99ms: +times[Math.floor(times.length * 0.99)].toFixed(2),
    low1pctFps: +(1000 / (sum(worst) / worst.length)).toFixed(1),
    gpuMs: gpu.length ? +(sum(gpu) / gpu.length).toFixed(2) : null,
    gpuP50: gpu.length ? +gpu[Math.floor(gpu.length / 2)].toFixed(2) : null,
    gpuP95: gpu.length ? +gpu[Math.floor(gpu.length * 0.95)].toFixed(2) : null,
    calls: samples[0].calls,
    triangles: samples[0].triangles,
    frames: times.length,
  };
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const A = await open(browser, ua);
  await freeze(A, true);
  const B = await open(browser, ub);
  await freeze(B, true);
  const result = { method: `paired, ${cycles} alternating 3 s windows per view per build, 1920x1080`, renderer: null, views: {} };
  result.renderer = await (async () => { await freeze(A, false); const r = await A.page.evaluate(() => { const c = document.querySelector('canvas').getContext('webgl2'); const i = c.getExtension('WEBGL_debug_renderer_info'); return i ? c.getParameter(i.UNMASKED_RENDERER_WEBGL) : 'unknown'; }); await freeze(A, true); return r; })();
  for (const v of VIEWS) {
    const sa = [], sb = [];
    for (const p of [A, B]) { await freeze(p, false); await setView(p, v); await sleep(3000); await freeze(p, true); }
    for (let c = 0; c < cycles; c++) {
      for (const [p, s] of c % 2 === 0 ? [[A, sa], [B, sb]] : [[B, sb], [A, sa]]) {
        await freeze(p, false); await sleep(400);
        s.push(await windowMeasure(p, 3000));
        await freeze(p, true);
      }
    }
    result.views[v.id] = { [la]: summarize(sa), [lb]: summarize(sb) };
    const a = result.views[v.id][la], b = result.views[v.id][lb];
    console.log(v.id.padEnd(18), `${la}: ${a.fps} fps, 1% ${a.low1pctFps}, p99 ${a.p99ms} ms, GPU ${a.gpuMs} ms`, `| ${lb}: ${b.fps} fps, 1% ${b.low1pctFps}, p99 ${b.p99ms} ms, GPU ${b.gpuMs} ms`);
  }
  const all = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  all[`${la}-vs-${lb}`] = result;
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
