// node review-sheet.cjs <dir> <out.jpg> <columns> — one labelled sheet of every <lot>-watch.jpg in <dir>
// (the in-game "Watch technician" close-ups from closeup.cjs), for reviewing framing across lot types.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [dir, out, cols = '3'] = process.argv.slice(2);
const STYLE = { 'c-n-4': 'ranch (tutorial)', 'a-n-2': 'two-story', 'a-s-2': 'premium', 'b-n-2': 'spanish', 'a-n-4': 'modern' };
(async () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('-watch.jpg')).sort();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 900 } });
  const cells = files.map((f) => {
    const lot = f.replace('-watch.jpg', '');
    const src = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
    return `<div style="position:relative"><img src="${src}" style="width:100%;display:block"><span style="position:absolute;left:8px;top:8px;background:#000b;padding:3px 8px;border-radius:4px">${lot} · ${STYLE[lot] ?? ''}</span></div>`;
  });
  await page.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;font:600 16px Arial;color:#fff">${cells.join('')}</body>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, type: 'jpeg', quality: 80, fullPage: true });
  await browser.close();
  console.log('sheet', files.length);
})().catch((e) => { console.error(e); process.exit(1); });
