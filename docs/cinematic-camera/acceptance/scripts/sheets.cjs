// node sheets.cjs [root] [label] — one contact sheet per profile and lot from acceptance/<profile>/<lot>-<shot>.jpg,
// each shot labelled with its name, the mode shown, the reason it was framed and the camera height
// angle. Written to acceptance/sheets/<profile>-<lot>.jpg.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const label = process.argv[3] || 'deployed preview bbc2558';
const SHOTS = ['work-walking', 'work', 'property', 'detail', 'work-inspector', 'work-sheet', 'repair-auto', 'work-repair', 'detail-repair', 'after-controls'];
(async () => {
  const outDir = path.join(root, 'sheets');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 2400, height: 1000 } });
  for (const prof of ['desktop', 'laptop', 'portrait', 'landscape']) {
    const dir = path.join(root, prof);
    if (!fs.existsSync(dir)) continue;
    for (const mf of fs.readdirSync(dir).filter((f) => f.endsWith('-metrics.json'))) {
      const m = JSON.parse(fs.readFileSync(path.join(dir, mf), 'utf8'));
      const cols = prof === 'portrait' ? 5 : prof === 'landscape' ? 3 : 3;
      const cells = SHOTS.filter((s) => fs.existsSync(path.join(dir, `${m.lot}-${s}.jpg`))).map((s) => {
        const sh = m.shots[s];
        const sv = sh?.serviceView;
        const img = fs.readFileSync(path.join(dir, `${m.lot}-${s}.jpg`)).toString('base64');
        return `<div class="c"><div class="l">${s} · ${sv ? `${sv.mode} (${sv.reason})` : '-'} · ${sh.distToTech} m · ${sh.elevationDeg}°${sv && !sv.report ? ' · no report' : ''}</div><img src="data:image/jpeg;base64,${img}"></div>`;
      });
      await page.setContent(`<style>body{margin:0;background:#111;color:#fff;font:600 17px Arial}.t{padding:10px 12px;font-size:22px}.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;padding:8px}.l{padding:4px 2px}img{width:100%;display:block}</style><div class="t">${prof} ${m.size} · ${m.lot} · ${label}</div><div class="g">${cells.join('')}</div>`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, `${prof}-${m.lot}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
    }
  }
  await browser.close();
  console.log('sheets done');
})().catch((e) => { console.error(e); process.exit(1); });
