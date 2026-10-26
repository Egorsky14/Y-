// Lighting values at fixed game minutes: node atmo.cjs <label> <baseUrl> <outFile>
const { chromium } = require('@playwright/test');
const fs = require('fs');
const [label, baseUrl, outFile] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(baseUrl);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => !!window.__egoAtmo && (window.__egoRender?.calls ?? 0) > 100, null, { timeout: 90_000 });
  await page.evaluate(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  const out = {};
  for (const m of [7 * 60, 8 * 60, 10 * 60, 13 * 60, 16 * 60, 17 * 60 + 30, 18 * 60 + 30, 19 * 60 + 15, 20 * 60, 21 * 60]) {
    await page.evaluate((m) => { const s = window.__ego.getState(); const now = s.clock.minute; window.__ego.advanceMinutes(m >= now ? m - now : 1440 - now + m); }, m);
    await sleep(4500);
    const a = await page.evaluate(() => window.__egoAtmo);
    out[`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`] = { sun: +a.sunIntensity.toFixed(2), exposure: +a.exposure.toFixed(3), elevation: +a.elevation.toFixed(3) };
  }
  const all = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  all[label] = out;
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
