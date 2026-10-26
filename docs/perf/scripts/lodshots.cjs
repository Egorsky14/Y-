// Matched captures for LOD / shadow checks: node lodshots.cjs <label> <baseUrl> <outDir>
// Same seed, paused simulation and camera commands for every build; HUD hidden. Writes PNGs and metrics.json.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [label, baseUrl, outRoot] = process.argv.slice(2);
const out = path.join(outRoot, label);
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(baseUrl);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && (window.__egoRender?.vehicleModels ?? 0) >= 1, null, { timeout: 90_000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  await ev(() => { const s = document.createElement('style'); s.textContent = 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}'; document.head.appendChild(s); for (let e = document.querySelector('canvas'); e; e = e.parentElement) e.style.setProperty('visibility', 'visible', 'important'); });
  const advanceTo = async (m) => { await ev((m) => { const s = window.__ego.getState(); const now = s.clock.minute; window.__ego.advanceMinutes(m >= now ? m - now : 1440 - now + m); }, m); await sleep(4000); };
  const cam = (c) => ev((c) => window.__ego.app.getState().camera(c), c);
  const metrics = { label, shots: {}, errors };
  const shot = async (name, cmd) => {
    await cam(cmd); await sleep(2600);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    const r = await ev(() => window.__egoRender);
    metrics.shots[name] = { calls: r.calls, triangles: r.triangles };
  };
  await advanceTo(600);
  await shot('a-overview-1000', { type: 'reset' });
  await shot('b-hq-overview-1000', { type: 'hq' });
  await shot('c-neighborhood-1000', { type: 'focus', target: { x: -21, z: 25 }, distance: 48, azimuth: 0.9 });
  await shot('d-veg-close-1000', { type: 'focus', target: { x: -60, z: 2 }, distance: 16, azimuth: 0.45 });
  // Street palms straddling the 60 m switch distance.
  await shot('e-veg-lodband-1000', { type: 'focus', target: { x: -60, z: 2 }, distance: 60, azimuth: 0.45 });
  await shot('f-park-palms-1000', { type: 'focus', target: { x: 170, z: 50 }, distance: 40, azimuth: 2.3 });
  await advanceTo(17 * 60 + 30);
  await shot('g-hq-1730-shadows', { type: 'hq' });
  await shot('h-neighborhood-1730', { type: 'focus', target: { x: -21, z: 25 }, distance: 48, azimuth: 0.9 });
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(label, 'errors:', errors.length, JSON.stringify(metrics.shots));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
