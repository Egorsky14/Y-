// Renders the static vehicle previews used on touch devices: node previews.cjs <baseUrl> <outDir>
// Opens the desktop Fleet marketplace (the live turntable preview), lets each class turn to a
// three-quarter view and saves the preview element as WebP (public/previews/<class>.webp).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [url, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(url);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100, null, { timeout: 90_000 });
  await page.evaluate(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  await page.getByTestId('nav-fleet').click();
  await page.getByRole('button', { name: 'Marketplace' }).click();
  for (const cls of ['compact-van', 'full-size-van', 'pickup', 'box-truck']) {
    await page.getByTestId(`market-class-${cls}`).click();
    await page.waitForFunction(() => { const c = document.querySelector('.panel .vehicle-preview canvas'); return c && getComputedStyle(c).opacity === '1'; }, null, { timeout: 30_000 });
    await page.waitForTimeout(1400); // turntable at ~0.7 rad: a front three-quarter view
    const png = await page.locator('.panel .vehicle-preview').screenshot();
    const webp = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.86);
    }, png.toString('base64'));
    const file = path.join(outDir, `${cls}.webp`);
    fs.writeFileSync(file, Buffer.from(webp.split(',')[1], 'base64'));
    console.log(file, fs.statSync(file).size, 'bytes');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
