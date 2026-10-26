// Pixel difference between two capture sets: node pixdiff.cjs <root> <labelA> <labelB> <outDir>
// For each shot: mean absolute RGB difference, share of pixels that changed visibly (>24/255 on any
// channel), and a heat map (changed pixels in red over a dimmed copy of B).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [root, a, b, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const shots = fs.readdirSync(path.join(root, a)).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const results = {};
  for (const s of shots) {
    const ua = 'data:image/png;base64,' + fs.readFileSync(path.join(root, a, s + '.png')).toString('base64');
    const ub = 'data:image/png;base64,' + fs.readFileSync(path.join(root, b, s + '.png')).toString('base64');
    const r = await page.evaluate(async ([ua, ub]) => {
      const load = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; });
      const [ia, ib] = await Promise.all([load(ua), load(ub)]);
      const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
      const x = c.getContext('2d');
      x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
      x.drawImage(ib, 0, 0); const img = x.getImageData(0, 0, c.width, c.height); const db = img.data;
      let sum = 0, changed = 0; const n = c.width * c.height;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
        sum += (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
        if (d > 24) { changed++; db[i] = 255; db[i + 1] = 0; db[i + 2] = 0; } else { db[i] *= 0.45; db[i + 1] *= 0.45; db[i + 2] *= 0.45; }
      }
      x.putImageData(img, 0, 0);
      return { meanAbs: +(sum / n).toFixed(3), changedPct: +((changed / n) * 100).toFixed(3), heat: c.toDataURL('image/png') };
    }, [ua, ub]);
    fs.writeFileSync(path.join(outDir, `${s}-heat.png`), Buffer.from(r.heat.split(',')[1], 'base64'));
    results[s] = { meanAbs: r.meanAbs, changedPct: r.changedPct };
    console.log(s.padEnd(22), `mean |Δ| ${r.meanAbs}`, `changed ${r.changedPct}%`);
  }
  fs.writeFileSync(path.join(outDir, 'diff.json'), JSON.stringify(results, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
