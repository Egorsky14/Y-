// node condensers.cjs <baseUrl> <outDir>: close views of one house unit per generation (seed 42, 10:00, HUD hidden).
// Sets the customers' systems to the four generations in turn and finds one unit of each from the merged cabinet meshes.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const [baseUrl, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(baseUrl);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && !!window.__egoThree, null, { timeout: 120000 });
  await page.evaluate(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  await page.addStyleTag({ content: 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}' });
  await page.evaluate(() => { for (let e = document.querySelector('canvas'); e; e = e.parentElement) e.style.setProperty('visibility', 'visible', 'important'); });
  // Cycle the customers through the four generations so every kind is on the map.
  await page.evaluate(() => {
    const s = window.__ego.getState();
    const kinds = [{ ageYears: 19, refrigerant: 'R-22', brand: 'Rheem' }, { ageYears: 9, refrigerant: 'R-410A', brand: 'Trane' }, { ageYears: 2, refrigerant: 'R-410A', brand: 'Goodman' }, { ageYears: 0, refrigerant: 'R-454B', brand: 'EGO Select' }];
    Object.values(s.customers).forEach((c, i) => Object.assign(c.equipment, kinds[i % 4]));
    window.__ego.dispatch({ type: 'set-speed', speed: 0 });
  });
  await sleep(2500);
  const units = await page.evaluate(() => {
    const out = {};
    window.__egoThree.scene.traverse((o) => {
      const m = /^house-condensers:(unitCabinet\w*|badgeTeal)$/.exec(o.name);
      if (!m) return;
      const p = o.geometry.attributes.position;
      const c = { x: 0, z: 0, n: 0 };
      const x0 = p.getX(0), z0 = p.getZ(0);
      for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - x0, p.getZ(i) - z0) < 1.5) { c.x += p.getX(i); c.z += p.getZ(i); c.n++; }
      out[m[1]] = { x: c.x / c.n, z: c.z / c.n };
    });
    return out;
  });
  console.log(JSON.stringify(units));
  for (const [name, u] of Object.entries(units)) {
    for (const [k, az] of [['a', 0.6], ['b', 2.4], ['c', -2.2]]) {
      await page.evaluate((c) => window.__ego.app.getState().camera(c), { type: 'focus', target: { x: u.x, z: u.z }, distance: 3.6, azimuth: az, elevation: 0.42, targetY: 0.55 });
      await sleep(1800);
      await page.screenshot({ path: path.join(out, `${name}-${k}.jpg`), type: 'jpeg', quality: 86 });
    }
  }
  console.log('errors', errors.length, errors.slice(0, 3));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

