// Side-by-side comparison sheets: node compose.cjs <root> <outDir> <label,label,...> [shot,shot,...]
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const [root, outDir, labelsArg, shotsArg] = process.argv.slice(2);
const labels = labelsArg.split(',');
fs.mkdirSync(outDir, { recursive: true });
const shots = shotsArg ? shotsArg.split(',') : fs.readdirSync(path.join(root, labels[0])).filter((f) => f.endsWith('.png')).map((f) => f.replace('.png', ''));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const w = labels.length === 2 ? 800 : 640;
  const page = await browser.newPage({ viewport: { width: w * labels.length + (labels.length - 1) * 6, height: 600 } });
  for (const s of shots) {
    const cells = labels.map((l) => {
      const metrics = JSON.parse(fs.readFileSync(path.join(root, l, 'metrics.json'), 'utf8')).shots[s] || {};
      const m = metrics.calls ? ` · ${metrics.calls} calls · ${(metrics.triangles / 1000).toFixed(0)}k tris${metrics.fps ? ` · ${metrics.fps} fps` : ''}` : '';
      return `<div class="c"><img src="${pathToFileURL(path.join(root, l, s + '.png')).href}"><div class="t">${l}${m}</div></div>`;
    }).join('');
    const html = path.join(root, '_sheet.html');
    fs.writeFileSync(html, `<html><body style="margin:0;background:#111;font:600 14px system-ui;color:#eee"><div id="row" style="display:flex;gap:6px">${cells}</div><style>.c{width:${w}px;position:relative}.c img{width:${w}px;display:block}.t{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.65);padding:3px 8px;border-radius:4px}</style></body></html>`);
    await page.goto(pathToFileURL(html).href);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    const jpg = process.argv[6] === 'jpg';
    await page.locator('#row').screenshot(jpg ? { path: path.join(outDir, `${s}.jpg`), type: 'jpeg', quality: 82 } : { path: path.join(outDir, `${s}.png`) });
  }
  await browser.close();
  console.log(`composed ${shots.length} sheets`);
})().catch((e) => { console.error(e); process.exit(1); });
