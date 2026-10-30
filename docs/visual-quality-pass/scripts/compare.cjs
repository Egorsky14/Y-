// Side-by-side before/after sheets from matched captures: node compare.cjs
// Writes docs/visual-quality-pass/compare/<name>.jpg (same seed, clock, camera and game state).
// The ten acceptance views come first.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const PAIRS = [
  // The ten acceptance views, in order.
  ['01-hq-overview', 'W05-hq'],
  ['02-residential-street', 'W04-street'],
  ['03-technician-arrival', 'W07-arrival'],
  ['04-technician-diagnosing', 'W08-diagnosis'],
  ['05-diagnostic-tools', 'W15-tools'],
  ['06-technician-repair', 'W09-repair'],
  ['07-tutorial-property-in-game', 'W16-service-ui'],
  ['08-medium-distance-district', 'W13-horizon-west'],
  ['08b-medium-distance-northeast', 'W02-boundary-ne'],
  ['09-city-overview', 'W01-overview'],
  ['10-mobile-service-call', 'W12c-mobile-diagnosis', true],
  ['10b-mobile-service-call-in-game', 'W12d-mobile-service-ui', true],
  // Everything else from the matched set.
  ['11-service-site', 'W08b-service-wide'],
  ['12-diagnosis-side', 'W08c-diagnosis-side'],
  ['13-repair-side', 'W09b-repair-side'],
  ['14-probe-profile', 'W08d-probe-profile'],
  ['15-gauges-profile', 'W08e-gauges-profile'],
  ['16-wrench-profile', 'W09c-wrench-profile'],
  ['17-reach-profile', 'W09d-reach-profile'],
  ['18-fan-check-profile', 'W09e-fan-check-profile'],
  ['19-selected-lot', 'W14-selected-lot'],
  ['20-hq-yard', 'W06-hq-yard'],
  ['21-overview-east', 'W01b-overview-east'],
  ['22-overview-west', 'W01c-overview-west'],
  ['23-boundary-southwest', 'W03-boundary-sw'],
  ['24-golden-hour', 'W10-golden'],
  ['25-golden-hq', 'W10b-golden-hq'],
  ['26-night', 'W11-night'],
  ['27-night-street', 'W11b-night-street'],
  ['28-mobile-overview', 'W12a-mobile-overview', true],
  ['29-mobile-street', 'W12b-mobile-street', true],
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
      ${[['BEFORE (f6d86f0)', a], ['AFTER', b]].map(([l, f]) => `<div style="position:relative;flex:1"><img src="${src(f)}" style="width:100%;display:block"><span style="position:absolute;left:12px;top:10px;background:#000a;padding:4px 10px;border-radius:4px">${l}</span></div>`).join('')}</body>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
    await page.close();
    n++;
  }
  await browser.close();
  console.log('sheets', n);
})().catch((e) => { console.error(e); process.exit(1); });
