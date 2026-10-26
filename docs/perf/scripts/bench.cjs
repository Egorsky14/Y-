// Uncapped benchmark (perf.cjs plus 1% lows): node bench.cjs <label> <baseUrl> <outFile>
const { chromium } = require('@playwright/test');
const fs = require('fs');
const [label, baseUrl, outFile] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(baseUrl);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && (window.__egoRender?.vehicleModels ?? 0) >= 1, null, { timeout: 90_000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  await sleep(4000);
  const measure = () => ev(() => new Promise((res) => {
    const times = []; let last = performance.now(); const t0 = last;
    const f = () => { const now = performance.now(); times.push(now - last); last = now; if (now - t0 < 5000) requestAnimationFrame(f); else {
      times.sort((a, b) => a - b); const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const r = window.__egoRender;
      res({ fps: +(1000 / avg).toFixed(1), p50ms: +times[Math.floor(times.length * 0.5)].toFixed(2), p95ms: +times[Math.floor(times.length * 0.95)].toFixed(2), p99ms: +times[Math.floor(times.length * 0.99)].toFixed(2), low1pct: +(1000 / (times.slice(Math.floor(times.length * 0.99)).reduce((a, b) => a + b, 0) / times.slice(Math.floor(times.length * 0.99)).length)).toFixed(1), calls: r.calls, triangles: r.triangles, textures: r.textures, geometries: r.geometries });
    } }; requestAnimationFrame(f);
  }));
  const advanceTo = (m) => ev((m) => { const s = window.__ego.getState(); const now = s.clock.minute; window.__ego.advanceMinutes(m >= now ? m - now : 1440 - now + m); }, m);
  const result = { label };
  await advanceTo(600);
  await ev(() => window.__ego.app.getState().camera({ type: 'reset' })); await sleep(2500);
  result.overview1000 = await measure();
  await ev(() => window.__ego.app.getState().camera({ type: 'hq' })); await sleep(2500);
  result.hq1000 = await measure();
  await advanceTo(21 * 60); await sleep(3000);
  result.hq2100 = await measure();
  await ev(() => window.__ego.app.getState().camera({ type: 'reset' })); await sleep(2500);
  result.overview2100 = await measure();
  result.loadMs = await ev(() => Math.round(performance.getEntriesByType('navigation')[0]?.duration ?? 0));
  result.jsHeapMB = await ev(() => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null));
  const all = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  all[label] = result;
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2));
  console.log(JSON.stringify(result));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
