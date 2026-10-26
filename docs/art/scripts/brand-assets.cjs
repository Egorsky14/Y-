// Icons and the social-sharing image: node brand-assets.cjs <gameUrl> <publicDir>
// PNG icons are rendered from public/icon.svg; og-image.jpg (1200x630) is a real in-game frame
// (seed 42, HQ view at 17:30, HUD hidden) with the title set over it.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [url, pub] = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const svg = fs.readFileSync(path.join(pub, 'icon.svg'), 'utf8');
  const iconPage = await browser.newPage();
  for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    await iconPage.setViewportSize({ width: size, height: size });
    await iconPage.setContent(`<html><body style="margin:0;background:#0b0f14">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await iconPage.screenshot({ path: path.join(pub, name), clip: { x: 0, y: 0, width: size, height: size } });
    console.log(name);
  }
  const game = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await game.goto(url);
  await game.getByTestId('seed-input').fill('42');
  await game.getByTestId('new-game').click();
  await game.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && (window.__egoRender?.vehicleModels ?? 0) >= 1, null, { timeout: 90_000 });
  await game.evaluate(() => {
    window.__ego.dispatch({ type: 'set-speed', speed: 0 });
    const s = window.__ego.getState();
    window.__ego.advanceMinutes((17 * 60 + 30) - s.clock.minute);
    window.__ego.app.getState().camera({ type: 'hq' });
  });
  await game.waitForTimeout(5000);
  await game.addStyleTag({ content: '.app-ui, .loading-screen, .lifecycle-overlay { display: none !important; }' });
  await game.waitForTimeout(300);
  const frame = (await game.locator('canvas').first().screenshot({ type: 'jpeg', quality: 92 })).toString('base64');
  await game.setContent(`<html><body style="margin:0;width:1200px;height:630px;position:relative;font-family:Arial,Helvetica,sans-serif;overflow:hidden">
    <img src="data:image/jpeg;base64,${frame}" style="position:absolute;inset:0;width:1200px;height:630px;object-fit:cover">
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,11,15,.92) 0%,rgba(8,11,15,.7) 40%,rgba(8,11,15,0) 70%)"></div>
    <div style="position:absolute;left:64px;top:150px;color:#eef2f6;width:560px">
      <div style="display:flex;align-items:center;gap:18px">
        <div style="width:84px;height:84px;border-radius:22px;background:linear-gradient(135deg,#1ee3d3,#0f9c92);display:grid;place-items:center;color:#04211f;font-weight:900;font-size:48px">E</div>
        <div style="font-size:22px;letter-spacing:.16em;color:#19d3c5;font-weight:700">HVAC COMPANY OWNER V3</div>
      </div>
      <div style="font-size:72px;font-weight:900;line-height:1.02;margin-top:26px">EGO HVAC<br>Empire</div>
      <div style="font-size:26px;margin-top:22px;color:#c9d2dc;line-height:1.35">Run your own HVAC company.<br>Free in the browser, on phone or computer.</div>
    </div></body></html>`);
  await game.screenshot({ path: path.join(pub, 'og-image.jpg'), type: 'jpeg', quality: 86 });
  console.log('og-image.jpg', fs.statSync(path.join(pub, 'og-image.jpg')).size);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
