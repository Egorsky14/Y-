// Before/after sheets for the service-call scene: node servicecall-sheets.cjs <rootDir>
// Rows per beat: gameplay view (before | after) and close review (before | best after angle).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const out = path.join(root, 'compare');
fs.mkdirSync(out, { recursive: true });
const BEATS = [
  ['1-arrival', 'Van arrives', 'close-curb'],
  ['2-exit', 'Technician gets out', 'close-curb'],
  ['3-walk', 'Walk-up', 'close-curb'],
  ['4-at-unit', 'At the unit', 'close-b'],
  ['5-service', 'Service, gauges connected', 'close-b'],
];
const img = (f) => (fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : '');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1606, height: 900 } });
  for (const [beat, title, closeAfter] of BEATS) {
    const cells = [
      ['Before · gameplay', img(path.join(root, 'before', `${beat}-game.png`))],
      ['After · gameplay', img(path.join(root, 'after', `${beat}-game.png`))],
      ['Before · close', img(path.join(root, 'before', `${beat}-close.png`))],
      ['After · close', img(path.join(root, 'after', `${beat}-${closeAfter}.png`))],
    ];
    await p.setContent(`<html><body style="margin:0;background:#111;font:600 15px system-ui;color:#eee">
      <div style="padding:8px 12px;font-size:18px">${title}</div>
      <div id="g" style="display:grid;grid-template-columns:800px 800px;gap:6px">${cells.map(([t, s]) => `<div style="position:relative"><img src="${s}" style="width:800px;display:block"><span style="position:absolute;left:8px;top:8px;background:rgba(0,0,0,.65);padding:3px 8px;border-radius:4px">${t}</span></div>`).join('')}</div></body></html>`);
    await p.waitForFunction(() => [...document.images].every((i) => i.complete));
    await p.locator('body').screenshot({ path: path.join(out, `${beat}.jpg`), type: 'jpeg', quality: 80 });
    console.log(beat);
  }
  await b.close();
})();
