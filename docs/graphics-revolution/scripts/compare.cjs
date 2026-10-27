// Side-by-side before/after sheets from matched captures: node compare.cjs
// Writes docs/graphics-revolution/compare/<name>.jpg (labelled, same seed, clock and camera).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const PAIRS = [
  ['01-van-closeup', 'before/07-hq-van-close-1000.jpg', 'after/07-hq-van-close-1000.jpg'],
  ['02-van-at-customer', 'before/09-van-at-home-1000.jpg', 'after/09-van-at-home-1000.jpg'],
  ['03-service-call', 'before/08-service-wide-1000.jpg', 'after/08-service-wide-1000.jpg'],
  ['04-technician-at-unit', 'before/11-tech-unit-close-b-1000.jpg', 'after/11-tech-unit-close-b-1000.jpg'],
  ['05-hq', 'before/02-hq-1000.jpg', 'after/02-hq-1000.jpg'],
  ['06-hq-parking', 'before/03-hq-parking-1000.jpg', 'after/03-hq-parking-1000.jpg'],
  ['07-neighborhood', 'before/04-neighborhood-1000.jpg', 'after/04-neighborhood-1000.jpg'],
  ['08-city-overview', 'before/01-overview-1000.jpg', 'after/01-overview-1000.jpg'],
  ['09-golden-hour-street', 'before/18-street-close-1845.jpg', 'after/18-street-close-1845.jpg'],
  ['10-golden-hour-overview', 'before/17-overview-1845.jpg', 'after/17-overview-1845.jpg'],
  ['11-night', 'before/15-overview-2100.jpg', 'after/15-overview-2100.jpg'],
  ['12-supply-depot', 'before/06-supply-depot-1000.jpg', 'after/06-supply-depot-1000.jpg'],
  ['13-mobile-390x844', 'before-390/01-overview-1000.jpg', 'after-390/01-overview-1000.jpg'],
];
(async () => {
  const out = path.join(root, 'compare');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [name, a, b] of PAIRS) {
    const mobile = a.includes('-390');
    const page = await browser.newPage({ viewport: mobile ? { width: 820, height: 900 } : { width: 1920, height: 600 } });
    const src = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, f)).toString('base64');
    await page.setContent(`<body style="margin:0;background:#111;display:flex;gap:4px;font:600 22px Arial;color:#fff">
      ${[['BEFORE', a], ['AFTER', b]].map(([l, f]) => `<div style="position:relative;flex:1"><img src="${src(f)}" style="width:100%;display:block"><span style="position:absolute;left:12px;top:10px;background:#000a;padding:4px 10px;border-radius:4px">${l}</span></div>`).join('')}</body>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
    await page.close();
  }
  await browser.close();
  console.log('sheets', PAIRS.length);
})().catch((e) => { console.error(e); process.exit(1); });
