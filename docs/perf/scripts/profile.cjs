// Rendering cost breakdown: node profile.cjs <label> <baseUrl> <outFile> [width] [height]
// Needs a build that publishes window.__egoThree (RenderProbe). Measures, per view, the uncapped
// frame rate, frame-time percentiles and the GPU time of each render (EXT_disjoint_timer_query_webgl2
// when the browser exposes it), then repeats with one cost centre removed at a time.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const [label, baseUrl, outFile, w = '1920', h = '1080'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-webgl-draft-extensions'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  await page.goto(baseUrl);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && (window.__egoRender?.vehicleModels ?? 0) >= 1 && !!window.__egoThree, null, { timeout: 90_000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));

  // GPU timer around every WebGLRenderer.render call (main pass + shadow pass happen inside it).
  const gpu = await ev(() => {
    const { gl } = window.__egoThree;
    const ctx = gl.getContext();
    const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2');
    const info = ctx.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
    window.__gpuMs = [];
    if (!ext) return { timer: false, renderer };
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
    return { timer: true, renderer };
  });

  // Scene composition by top-level scene child.
  const composition = await ev(() => {
    const { scene } = window.__egoThree;
    const rows = scene.children.map((c, i) => {
      let meshes = 0, tris = 0, casters = 0, instanced = 0;
      const names = new Set();
      c.traverse((o) => {
        if (o.name && names.size < 4) names.add(o.name);
        if (!o.isMesh) return;
        meshes++;
        if (o.castShadow) casters++;
        const g = o.geometry;
        const n = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
        const k = o.isInstancedMesh ? o.count : 1;
        if (o.isInstancedMesh) instanced++;
        tris += n * k;
      });
      return { i, type: c.type, name: c.name, sample: [...names].join(','), meshes, instanced, casters, tris: Math.round(tris) };
    });
    return rows.filter((r) => r.meshes > 0);
  });

  const measure = (ms = 4000) => ev((ms) => new Promise((res) => {
    window.__gpuMs.length = 0;
    const times = []; let last = performance.now(); const t0 = last;
    const f = () => { const now = performance.now(); times.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else {
      times.sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const g = [...window.__gpuMs].sort((a, b) => a - b);
      const r = window.__egoThree.gl.info.render;
      res({
        fps: +(1000 / avg).toFixed(1), avgMs: +avg.toFixed(2), p50ms: +times[Math.floor(times.length * 0.5)].toFixed(2), p99ms: +times[Math.floor(times.length * 0.99)].toFixed(2),
        gpuMs: g.length ? +(g.reduce((a, b) => a + b, 0) / g.length).toFixed(2) : null, gpuP50: g.length ? +g[Math.floor(g.length / 2)].toFixed(2) : null,
        calls: r.calls, triangles: r.triangles,
      });
    } }; requestAnimationFrame(f);
  }), ms);
  const advanceTo = (m) => ev((m) => { const s = window.__ego.getState(); const now = s.clock.minute; window.__ego.advanceMinutes(m >= now ? m - now : 1440 - now + m); }, m);
  const cam = (c) => ev((c) => window.__ego.app.getState().camera(c), c);
  const setHidden = (idx, hidden) => ev(({ idx, hidden }) => { const s = window.__egoThree.scene; for (const i of idx) s.children[i].visible = !hidden; }, { idx, hidden });

  const result = { label, viewport: `${w}x${h}`, gpu, composition, views: {} };
  await advanceTo(600);
  await sleep(3000);
  for (const view of [{ id: 'overview1000', cmd: { type: 'reset' } }, { id: 'hq1000', cmd: { type: 'hq' } }]) {
    await cam(view.cmd); await sleep(2500);
    const v = { base: await measure() };
    // Shadow pass: keep the shadowed shading, skip re-rendering the shadow map.
    await ev(() => { window.__egoThree.gl.shadowMap.autoUpdate = false; }); await sleep(800);
    v.noShadowPass = await measure();
    await ev(() => { window.__egoThree.gl.shadowMap.autoUpdate = true; }); await sleep(800);
    // Remove one top-level group at a time (only the heavy ones).
    for (const row of composition.filter((r) => r.tris > 20000 || r.meshes > 40)) {
      await setHidden([row.i], true); await sleep(800);
      v[`hide#${row.i}`] = await measure(3000);
      await setHidden([row.i], false); await sleep(500);
    }
    v.baseAgain = await measure();
    result.views[view.id] = v;
  }
  result.jsHeapMB = await ev(() => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null));
  const all = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  all[label] = result;
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2));
  console.log(JSON.stringify({ gpu, composition }, null, 1));
  for (const [id, v] of Object.entries(result.views)) for (const [k, m] of Object.entries(v)) console.log(id.padEnd(13), k.padEnd(14), JSON.stringify(m));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
