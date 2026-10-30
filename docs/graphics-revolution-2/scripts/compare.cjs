// Side-by-side before/after sheets from matched captures: node compare.cjs
// Writes docs/graphics-revolution-2/compare/<name>.jpg (same seed, clock, camera and game state).
// Flagship sheets first: N night grading, S shadow fit, then the rest; G condenser generations (after only).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const PAIRS = [
  ['N1-night-overview', 'W11-night'],
  ['N2-night-street-horizon', 'W11b-night-street'],
  ['S1-shadows-service-site', 'W08b-service-wide'],
  ['S2-shadows-street', 'W04-street'],
  ['S3-shadows-hq-yard', 'W06-hq-yard'],
  ['S4-shadows-technician-profile', 'W09c-wrench-profile'],
  ['00-overview', 'W01-overview'],
  ['B1-technician-probing', 'W08d-probe-profile'],
  ['B2-technician-reading-gauges', 'W08e-gauges-profile'],
  ['B3-technician-wrench', 'W09c-wrench-profile'],
  ['B4-technician-reach-to-bag', 'W09d-reach-profile'],
  ['B5-technician-fan-check', 'W09e-fan-check-profile'],
  ['00-hq', 'W05-hq'],
  ['01-overview-east', 'W01b-overview-east'],
  ['02-overview-west', 'W01c-overview-west'],
  ['03-boundary-northeast', 'W02-boundary-ne'],
  ['04-boundary-southwest', 'W03-boundary-sw'],
  ['05-horizon-west', 'W13-horizon-west'],
  ['06-technician-arrival', 'W07-arrival'],
  ['07-diagnosis', 'W08-diagnosis'],
  ['08-diagnosis-side', 'W08c-diagnosis-side'],
  ['09-repair', 'W09-repair'],
  ['09b-repair-side', 'W09b-repair-side'],
  ['10-service-site', 'W08b-service-wide'],
  ['11-selected-lot', 'W14-selected-lot'],
  ['12-hq-yard', 'W06-hq-yard'],
  ['13-golden-hour', 'W10-golden'],
  ['14-golden-hq', 'W10b-golden-hq'],
  ['15-night', 'W11-night'],
  ['16-night-street', 'W11b-night-street'],
  ['17-mobile-overview', 'W12a-mobile-overview', true],
  ['18-mobile-street', 'W12b-mobile-street', true],
  ['19-mobile-diagnosis', 'W12c-mobile-diagnosis', true],
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
      ${[['BEFORE (adf3224)', a], ['AFTER', b]].map(([l, f]) => `<div style="position:relative;flex:1"><img src="${src(f)}" style="width:100%;display:block"><span style="position:absolute;left:12px;top:10px;background:#000a;padding:4px 10px;border-radius:4px">${l}</span></div>`).join('')}</body>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
    await page.close();
    n++;
  }
  // Condenser generations, from condensers/ (one unit per generation, service side and guard side).
  const gens = [['legacy', 'unitCabinetFaded', 'Legacy R-22 (over 15 years)'], ['standard', 'unitCabinet', 'Standard'], ['current', 'unitCabinetGraphite', 'Current (4 years or newer)'], ['ego', 'badgeTeal', 'EGO install']];
  if (gens.every(([, f]) => fs.existsSync(path.join(root, 'condensers', `${f}-a.jpg`)))) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const src = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, 'condensers', f)).toString('base64');
    const cells = gens.flatMap(([, f, l]) => [['a', l + ': guard side'], ['b', l + ': service side']].map(([k, t]) => `<div style="position:relative"><img src="${src(`${f}-${k}.jpg`)}" style="width:100%;display:block"><span style="position:absolute;left:10px;top:8px;background:#000a;padding:3px 8px;border-radius:4px">${t}</span></div>`));
    await page.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:1fr 1fr;gap:4px;font:600 18px Arial;color:#fff">${cells.join('')}</body>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, 'G-condenser-generations.jpg'), type: 'jpeg', quality: 80, fullPage: true });
    await page.close();
    n++;
  }
  await browser.close();
  console.log('sheets', n);
})().catch((e) => { console.error(e); process.exit(1); });
