// In-page A/B of the vegetation and shadow-caster changes: node inpage.cjs <baseUrl> <outFile> [cycles]
// Loads one optimized build (dev or VITE_PROFILE=1) and alternates, in the same page and the same
// view, between the optimized state and the reverted state (far palms drawn with the near mesh,
// desert scatter and flat decals casting shadows again). No page or build switch, so neither
// drift nor page-order bias enters the comparison. Records GPU time per render and frame times.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const [url, outFile, cyclesArg = '8'] = process.argv.slice(2);
const cycles = +cyclesArg;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWS = [
  { id: 'overview-1000', minute: 600, cmd: { type: 'reset' } },
  { id: 'hq-1000', minute: 600, cmd: { type: 'hq' } },
  { id: 'neighborhood-1000', minute: 600, cmd: { type: 'focus', target: { x: -21, z: 25 }, distance: 48, azimuth: 0.9 } },
  { id: 'veg-lodband-1000', minute: 600, cmd: { type: 'focus', target: { x: -60, z: 2 }, distance: 60, azimuth: 0.45 } },
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(url);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && (window.__egoRender?.vehicleModels ?? 0) >= 1 && !!window.__egoThree, null, { timeout: 90_000 });
  const setup = await page.evaluate(() => {
    window.__ego.dispatch({ type: 'set-speed', speed: 0 });
    const { gl, scene } = window.__egoThree;
    const ctx = gl.getContext();
    const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2');
    window.__gpuMs = [];
    if (ext) {
      const pending = [];
      const orig = gl.render.bind(gl);
      gl.render = (s, c) => {
        const q = ctx.createQuery();
        ctx.beginQuery(ext.TIME_ELAPSED_EXT, q);
        orig(s, c);
        ctx.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push(q);
        while (pending.length && ctx.getQueryParameter(pending[0], ctx.QUERY_RESULT_AVAILABLE)) {
          const d = pending.shift();
          if (!ctx.getParameter(ext.GPU_DISJOINT_EXT)) window.__gpuMs.push(ctx.getQueryParameter(d, ctx.QUERY_RESULT) / 1e6);
          ctx.deleteQuery(d);
        }
      };
    }
    // Reversible handles on everything the optimization changed.
    const near = scene.getObjectByName('palm:near');
    const far = scene.getObjectByName('palm:far');
    const farGeo = far.geometry;
    const veg = scene.getObjectByName('vegetation');
    const castingGeos = new Set();
    veg.traverse((o) => { if (o.isInstancedMesh && o.castShadow) castingGeos.add(o.geometry); });
    const scatter = [];
    veg.traverse((o) => { if (o.isInstancedMesh && !o.castShadow && castingGeos.has(o.geometry)) scatter.push(o); });
    const flat = [];
    scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.castShadow || !o.receiveShadow || !/^(roads|houses|hq):/.test(o.name)) return;
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      if (g.boundingBox.max.y - g.boundingBox.min.y < 0.03) flat.push(o);
    });
    window.__revert = (on) => {
      far.geometry = on ? near.geometry : farGeo;
      for (const o of scatter) o.castShadow = on;
      for (const o of flat) o.castShadow = on;
    };
    return { timer: !!ext, scatterLayers: scatter.length, flatMeshes: flat.length };
  });
  const measure = (ms) => page.evaluate((ms) => new Promise((res) => {
    window.__gpuMs.length = 0;
    const times = []; let last = performance.now(); const t0 = last;
    const f = () => { const now = performance.now(); times.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else res({ times: times.slice(5), gpu: window.__gpuMs.slice(5), calls: window.__egoThree.gl.info.render.calls, triangles: window.__egoThree.gl.info.render.triangles }); };
    requestAnimationFrame(f);
  }), ms);
  const summarize = (ws) => {
    const sum = (x) => x.reduce((a, b) => a + b, 0);
    const t = ws.flatMap((w) => w.times).sort((a, b) => a - b);
    const g = ws.flatMap((w) => w.gpu).sort((a, b) => a - b);
    const worst = t.slice(Math.floor(t.length * 0.99));
    const gpuPerWindow = ws.map((w) => sum(w.gpu) / w.gpu.length);
    return {
      fps: +(1000 / (sum(t) / t.length)).toFixed(1), p50ms: +t[Math.floor(t.length / 2)].toFixed(2), p99ms: +t[Math.floor(t.length * 0.99)].toFixed(2), low1pctFps: +(1000 / (sum(worst) / worst.length)).toFixed(1),
      gpuMs: +(sum(g) / g.length).toFixed(2), gpuP50: +g[Math.floor(g.length / 2)].toFixed(2), gpuWindowMin: +Math.min(...gpuPerWindow).toFixed(2), gpuWindowMax: +Math.max(...gpuPerWindow).toFixed(2),
      calls: ws[0].calls, triangles: ws[0].triangles,
    };
  };
  const result = { method: `in-page A/B, ${cycles} alternating 2.5 s windows per state, 1920x1080 High, uncapped`, setup, views: {} };
  for (const v of VIEWS) {
    await page.evaluate(({ minute, cmd }) => { const s = window.__ego.getState(); const now = s.clock.minute; if (Math.abs(now - minute) > 1) window.__ego.advanceMinutes(minute >= now ? minute - now : 1440 - now + minute); window.__ego.app.getState().camera(cmd); }, v);
    await sleep(3000);
    const opt = [], rev = [];
    for (let c = 0; c < cycles; c++) {
      for (const on of c % 2 === 0 ? [false, true] : [true, false]) {
        await page.evaluate((on) => window.__revert(on), on);
        await sleep(400);
        (on ? rev : opt).push(await measure(2500));
      }
    }
    await page.evaluate(() => window.__revert(false));
    const o = summarize(opt), r = summarize(rev);
    result.views[v.id] = { reverted: r, optimized: o, gpuSavedMs: +(r.gpuMs - o.gpuMs).toFixed(2), gpuSavedPct: +((1 - o.gpuMs / r.gpuMs) * 100).toFixed(1) };
    console.log(v.id.padEnd(18), `reverted GPU ${r.gpuMs} ms (${r.gpuWindowMin}-${r.gpuWindowMax}), ${r.fps} fps, 1% ${r.low1pctFps}, ${r.calls} calls, ${(r.triangles / 1000).toFixed(0)}k tris`, `| optimized GPU ${o.gpuMs} ms (${o.gpuWindowMin}-${o.gpuWindowMax}), ${o.fps} fps, 1% ${o.low1pctFps}, ${o.calls} calls, ${(o.triangles / 1000).toFixed(0)}k tris`);
  }
  const all = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  all[new Date().toISOString()] = result;
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2));
  console.log(JSON.stringify(setup));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
