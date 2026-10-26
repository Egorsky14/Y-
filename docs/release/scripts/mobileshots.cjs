// Mobile layout captures (Chromium device emulation): node mobileshots.cjs <baseUrl> <outDir> [deviceIds]
// For each device: menu, game HUD after loading, a tapped job pin (inspector), Team and Fleet
// panels. Records horizontal overflow, controls outside the viewport and small touch targets.
const { chromium, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [url, outDir, only] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const DEVICES = {
  'iphone-portrait': { ...devices['iPhone 14'], defaultBrowserType: undefined },
  'iphone-landscape': { ...devices['iPhone 14 landscape'], defaultBrowserType: undefined },
  'android-portrait': { ...devices['Pixel 7'], defaultBrowserType: undefined },
  'android-landscape': { ...devices['Pixel 7 landscape'], defaultBrowserType: undefined },
  'tablet-portrait': { ...devices['iPad (gen 7)'], defaultBrowserType: undefined },
};

async function audit(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const overflowX = document.documentElement.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1;
    const offscreen = [], small = [];
    for (const el of document.querySelectorAll('button, [role=button], a, input, select, .job-pin')) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || st.visibility === 'hidden' || st.display === 'none') continue;
      if (el.closest('.panel-tabs, .ledger, .world-labels')) continue; // scroll containers / world-anchored pins
      const label = (el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28);
      if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) {
        // inside a scrollable panel body is fine
        if (!el.closest('.panel-body, .inspector-body, .menu')) offscreen.push(label);
      }
      if (Math.min(r.width, r.height) < 36 && !el.closest('.panel-body, .inspector-body')) small.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return { vw, vh, overflowX, offscreen, small };
  });
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const report = {};
  for (const [id, dev] of Object.entries(DEVICES)) {
    if (only && !only.split(',').includes(id)) continue;
    const ctx = await browser.newContext(dev);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);
    await page.getByTestId('main-menu').waitFor();
    await page.screenshot({ path: path.join(outDir, `${id}-1-menu.png`) });
    const r = { menu: await audit(page) };
    await page.getByTestId('seed-input').fill('42');
    const t0 = Date.now();
    await page.getByTestId('new-game').tap();
    await page.getByTestId('loading-screen').waitFor({ timeout: 5000 }).catch(() => {});
    await page.screenshot({ path: path.join(outDir, `${id}-2-loading.png`) });
    await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
    r.readyMs = Date.now() - t0;
    r.quality = await page.evaluate(() => window.__ego.app.getState().settings.quality);
    const tut = page.getByTestId('touch-tutorial-ok');
    if (await tut.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(outDir, `${id}-3-tutorial.png`) });
      await tut.tap();
    }
    await page.evaluate(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, `${id}-4-game.png`) });
    r.game = await audit(page);
    const pin = page.locator('.job-pin').first();
    if (await pin.isVisible().catch(() => false)) {
      await pin.tap();
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(outDir, `${id}-5-job.png`) });
      r.job = await audit(page);
      await page.locator('.inspector .close').first().tap().catch(() => {});
    }
    for (const [panel, n] of [['employees', 6], ['fleet', 7]]) {
      await page.getByTestId(`nav-${panel}`).tap();
      await page.waitForTimeout(900);
      if (panel === 'fleet') await page.getByRole('button', { name: 'Marketplace' }).tap().catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outDir, `${id}-${n}-${panel}.png`) });
      r[panel] = await audit(page);
      await page.locator('.panel .close').first().tap();
      await page.waitForTimeout(400);
    }
    r.webglContexts = await page.evaluate(() => document.querySelectorAll('canvas').length);
    r.errors = errors;
    report[id] = r;
    console.log(id, JSON.stringify(r));
    await ctx.close();
  }
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
