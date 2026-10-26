// Gameplay smoothness with vsync on: node smooth.cjs <label> <baseUrl> <outFile>
// Plays seed 42 through the game's own actions and camera commands and records, per segment, every
// frame interval, the GPU time of every render (EXT_disjoint_timer_query_webgl2, needs a dev or
// VITE_PROFILE=1 build) and Chrome's Long Animation Frame entries (frames > 50 ms with the scripts
// that ran in them; build with --minify false to keep function names). A frame interval over
// 25 ms at 60 Hz is a missed vsync (a visible hitch).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const [label, url, outFile] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(url);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && (window.__egoRender?.vehicleModels ?? 0) >= 1 && !!window.__egoThree, null, { timeout: 90_000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => {
    window.__rec = { on: false, frames: [], gpu: [], loaf: [] };
    // Frame intervals from requestAnimationFrame, always running.
    let last = performance.now();
    const f = (now) => { if (window.__rec.on) window.__rec.frames.push([now, now - last]); last = now; requestAnimationFrame(f); };
    requestAnimationFrame(f);
    // GPU time per render.
    const { gl } = window.__egoThree;
    const ctx = gl.getContext();
    const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2');
    if (ext) {
      const pending = [];
      const orig = gl.render.bind(gl);
      gl.render = (s, c) => {
        const q = ctx.createQuery();
        const t = performance.now();
        ctx.beginQuery(ext.TIME_ELAPSED_EXT, q);
        orig(s, c);
        ctx.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push([q, t, performance.now() - t]);
        while (pending.length && ctx.getQueryParameter(pending[0][0], ctx.QUERY_RESULT_AVAILABLE)) {
          const [d, at, cpu] = pending.shift();
          if (window.__rec.on && !ctx.getParameter(ext.GPU_DISJOINT_EXT)) window.__rec.gpu.push([at, ctx.getQueryParameter(d, ctx.QUERY_RESULT) / 1e6, cpu]);
          ctx.deleteQuery(d);
        }
      };
    }
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!window.__rec.on) continue;
        window.__rec.loaf.push({ start: e.startTime, duration: e.duration, blocking: e.blockingDuration, render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0, scripts: (e.scripts || []).map((s) => ({ d: Math.round(s.duration), fn: s.sourceFunctionName, src: (s.sourceURL || '').split('/').pop(), inv: s.invoker })) });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  });
  const segments = {};
  const record = async (name, ms, during) => {
    await ev(() => { window.__rec.frames = []; window.__rec.gpu = []; window.__rec.loaf = []; window.__rec.on = true; });
    const t0 = Date.now();
    if (during) await during();
    const left = ms - (Date.now() - t0);
    if (left > 0) await sleep(left);
    const r = await ev(() => { window.__rec.on = false; return { frames: window.__rec.frames, gpu: window.__rec.gpu, loaf: window.__rec.loaf }; });
    const iv = r.frames.map((f) => f[1]).sort((a, b) => a - b);
    const g = r.gpu.map((x) => x[1]).sort((a, b) => a - b);
    const cpu = r.gpu.map((x) => x[2]).sort((a, b) => a - b);
    const sum = (x) => x.reduce((a, b) => a + b, 0);
    const worst = iv.slice(Math.floor(iv.length * 0.99));
    const hitches = r.frames.filter((f) => f[1] > 25);
    segments[name] = {
      seconds: +(sum(iv) / 1000).toFixed(1), frames: iv.length, fps: +(1000 / (sum(iv) / iv.length)).toFixed(1),
      low1pctFps: +(1000 / (sum(worst) / worst.length)).toFixed(1), p99ms: +iv[Math.floor(iv.length * 0.99)].toFixed(1), maxMs: +iv[iv.length - 1].toFixed(1),
      hitches25: hitches.length, hitches50: r.frames.filter((f) => f[1] > 50).length,
      gpuMsMean: g.length ? +(sum(g) / g.length).toFixed(2) : null, gpuMsP99: g.length ? +g[Math.floor(g.length * 0.99)].toFixed(2) : null, gpuMsMax: g.length ? +g[g.length - 1].toFixed(2) : null,
      renderCallCpuMsP99: cpu.length ? +cpu[Math.floor(cpu.length * 0.99)].toFixed(2) : null,
      // For each hitch: the GPU time of the render nearest to it, to separate GPU from main-thread causes.
      hitchDetail: hitches.slice(0, 12).map(([t, d]) => { const near = r.gpu.reduce((b, x) => (Math.abs(x[0] - t) < Math.abs((b?.[0] ?? 1e12) - t) ? x : b), null); return { atMs: Math.round(t), intervalMs: +d.toFixed(1), gpuMs: near ? +near[1].toFixed(2) : null, renderCpuMs: near ? +near[2].toFixed(2) : null }; }),
      loaf: r.loaf.map((l) => ({ ...l, start: Math.round(l.start), duration: Math.round(l.duration), blocking: Math.round(l.blocking), render: Math.round(l.render) })),
    };
    const s = segments[name];
    console.log(name.padEnd(26), `${s.fps} fps, 1% ${s.low1pctFps}, p99 ${s.p99ms} ms, max ${s.maxMs} ms, hitches>25ms ${s.hitches25}, >50ms ${s.hitches50}, GPU mean ${s.gpuMsMean} p99 ${s.gpuMsP99} max ${s.gpuMsMax}, LoAF ${s.loaf.length}`);
  };
  const cam = (c) => ev((c) => window.__ego.app.getState().camera(c), c);
  const speed = (v) => ev((v) => window.__ego.dispatch({ type: 'set-speed', speed: v }), v);

  await speed(1);
  await sleep(3000);
  await record('1-idle-overview-1x', 10000);
  const jobId = await ev(() => {
    const s = window.__ego.getState();
    const lead = Object.values(s.jobs).find((j) => j.status === 'lead');
    return lead.id;
  });
  await record('2-accept-dispatch-follow-1x', 12000, async () => {
    await ev((id) => { window.__ego.dispatch({ type: 'accept-lead', jobId: id }); window.__ego.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' }); }, jobId);
    await sleep(500);
    await cam({ type: 'follow', vehicleId: 'veh-1' });
  });
  await speed(5);
  await record('3-driving-follow-5x', 10000);
  // Wait for arrival, then watch the technician at the unit.
  for (let i = 0; i < 120; i++) { if ((await ev((id) => window.__ego.getState().jobs[id].status, jobId)) === 'diagnosing') break; await sleep(250); }
  await speed(1);
  const pos = await ev(() => window.__ego.getState().employees['emp-owner'].position);
  await cam({ type: 'focus', target: pos, distance: 9 });
  await sleep(1500);
  await record('4-technician-onsite-1x', 10000);
  await record('5-camera-transitions-1x', 12000, async () => {
    const cmds = [{ type: 'reset' }, { type: 'hq' }, { type: 'focus', target: pos, distance: 26 }, { type: 'reset' }, { type: 'focus', target: { x: -21, z: 25 }, distance: 48, azimuth: 0.9 }, { type: 'hq' }];
    for (const c of cmds) { await cam(c); await sleep(1800); }
  });
  await record('6-panels-open-close-1x', 10000, async () => {
    for (const id of ['employees', 'fleet', 'jobs', 'finance']) { await ev((p) => window.__ego.app.getState().openPanel(p), id); await sleep(1300); await ev(() => window.__ego.app.getState().openPanel(null)); await sleep(1000); }
  });
  const all = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  all[label] = segments;
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
