// Side-by-side before/after sheets from matched captures: node compare.cjs
// Writes docs/world-polish/compare/<name>.jpg (labelled; same seed, clock, camera and game state).
// A: world composition, B: headquarters, C: technician, D: activity, E: phone.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const PAIRS = [
  ['A1-overview', 'W01-overview'],
  ['A2-overview-east', 'W01b-overview-east'],
  ['A3-overview-west', 'W01c-overview-west'],
  ['A4-boundary-northeast', 'W02-boundary-ne'],
  ['A5-boundary-southwest', 'W03-boundary-sw'],
  ['A6-horizon-west', 'W13-horizon-west'],
  ['A7-golden-hour', 'W10-golden'],
  ['B1-hq-overview', 'W05-hq'],
  ['B2-hq-yard-receiving', 'W06-hq-yard'],
  ['B3-hq-golden', 'W10b-golden-hq'],
  ['C1-probing', 'W08d-probe-profile'],
  ['C2-reading-gauges', 'W08e-gauges-profile'],
  ['C3-wrench', 'W09c-wrench-profile'],
  ['C4-reach-to-bag', 'W09d-reach-profile'],
  ['C5-fan-check', 'W09e-fan-check-profile'],
  ['C6-diagnosis-side', 'W08c-diagnosis-side'],
  ['C7-repair-side', 'W09b-repair-side'],
  ['C8-arrival', 'W07-arrival'],
  ['D1-street', 'W04-street'],
  ['D2-night', 'W11-night'],
  ['E1-mobile-overview', 'W12a-mobile-overview', true],
  ['E2-mobile-street', 'W12b-mobile-street', true],
];
(async () => {
  const out = path.join(root, 'compare');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let n = 0;
  for (const [name, shot, mobile] of PAIRS) {
    const [a, b] = mobile ? [`before-390/${shot}.jpg`, `after-390/${shot}.jpg`] : [`before/${shot}.jpg`, `after/${shot}.jpg`];
    if (!fs.existsSync(path.join(root, a)) || !fs.existsSync(path.join(root, b))) {
      console.log('missing', name, a, b);
      continue;
    }
    const page = await browser.newPage({ viewport: mobile ? { width: 820, height: 900 } : { width: 1920, height: 600 } });
    const src = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, f)).toString('base64');
    await page.setContent(`<body style="margin:0;background:#111;display:flex;gap:4px;font:600 22px Arial;color:#fff">
      ${[['BEFORE (3.0, 67b0538)', a], ['AFTER (3.1)', b]].map(([l, f]) => `<div style="position:relative;flex:1"><img src="${src(f)}" style="width:100%;display:block"><span style="position:absolute;left:12px;top:10px;background:#000a;padding:4px 10px;border-radius:4px">${l}</span></div>`).join('')}</body>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
    await page.close();
    n++;
  }
  await browser.close();
  console.log('sheets', n);
})().catch((e) => { console.error(e); process.exit(1); });
