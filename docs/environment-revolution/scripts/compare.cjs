// Side-by-side before/after sheets from matched captures: node compare.cjs
// Writes docs/environment-revolution/compare/<name>.jpg (labelled, same seed, clock and camera).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const PAIRS = [
  ['01-six-house-neighborhood', 'E01-six-houses'],
  ['02-classic-xeriscape-backyard', 'E16-classic'],
  ['03-modern-minimal-backyard', 'E17-modern'],
  ['04-upscale-pool', 'E18-upscale-pool'],
  ['05-family-backyard', 'E13-backyard-d'],
  ['06-modest-rental-backyard', 'E03-backyard'],
  ['07-desert-garden', 'E11-backyard-b'],
  ['08-street-level-property', 'E02-house-street'],
  ['09-golden-hour-street', 'E08b-golden-street'],
  ['10-headquarters', 'E06-hq'],
  ['11-hq-roof-and-yard', 'E07-hq-yard'],
  ['12-golden-hour', 'E08-golden-hour'],
  ['13-night', 'E09-night'],
  ['14-mobile-390x844', 'E10-mobile-neighborhood', true],
];
(async () => {
  const out = path.join(root, 'compare');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [name, shot, mobile] of PAIRS) {
    const [a, b] = mobile ? [`before-390/${shot}.jpg`, `after-390/${shot}.jpg`] : [`before/${shot}.jpg`, `after/${shot}.jpg`];
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
