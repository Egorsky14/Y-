// node strips.cjs <profile> <lot> <prefix> <cols> — one sheet of the filmstrip frames in
// acceptance/strips/<profile>/strip-<lot>/ whose names start with <prefix> (walk, orbit, zoomOut...),
// to acceptance/sheets/strip-<profile>-<lot>-<prefix>.jpg.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [prof, lot, prefix, cols = '6'] = process.argv.slice(2);
const root = path.join(__dirname, '..');
(async () => {
  const dir = path.join(root, 'strips', prof, `strip-${lot}`);
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).sort();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 2400, height: 900 } });
  const cells = files.map((f) => `<div><div class="l">${f.replace('.jpg', '')}</div><img src="data:image/jpeg;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}"></div>`);
  await page.setContent(`<style>body{margin:0;background:#111;color:#fff;font:600 16px Arial}.t{padding:8px 12px;font-size:20px}.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px}.l{padding:3px}img{width:100%;display:block}</style><div class="t">${prof} · ${lot} · ${prefix} · deployed preview bbc2558</div><div class="g">${cells.join('')}</div>`);
  await page.waitForTimeout(300);
  fs.mkdirSync(path.join(root, 'sheets'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'sheets', `strip-${prof}-${lot}-${prefix}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
  await browser.close();
  console.log(files.length, 'frames');
})().catch((e) => { console.error(e); process.exit(1); });
