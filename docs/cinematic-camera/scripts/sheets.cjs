// node sheets.cjs — before/after comparison sheets from docs/cinematic-camera/{before,after}[-390]/,
// one per lot and screen: the previous build's shots on top, the cinematic camera's below, the same
// moment of the same job in each column. Written to docs/cinematic-camera/compare/.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const STYLE = { 'c-n-4': 'ranch (tutorial, seed 42)', 'a-n-2': 'two-story', 'a-s-2': 'premium', 'b-n-2': 'spanish', 'a-n-4': 'modern', 'n-o-1': 'premium (palm, garden wall)', 's-o-4': 'spanish (yard plants)', 'c-s-1': 'spanish (camera was in a plant)', 'a-s-1': 'modern (street pole)' };
const COLS = {
  desktop: [['property', 'Property view'], ['work', 'Watch work'], ['work-inspector', 'Watch work, inspector open'], ['detail', 'Detail (diagnosis)'], ['detail-repair', 'Detail (repair)']],
  phone: [['property', 'Property view'], ['work', 'Watch work'], ['detail', 'Detail (diagnosis)'], ['detail-repair', 'Detail (repair)']],
};
const img = (file) => (fs.existsSync(file) ? `<img src="data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}">` : '<div class="none">not in this build</div>');
(async () => {
  const out = path.join(root, 'compare');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 2400, height: 900 } });
  let n = 0;
  for (const lot of Object.keys(STYLE)) {
    for (const screen of ['desktop', 'phone']) {
      const suffix = screen === 'phone' ? '-390' : '';
      const cols = COLS[screen];
      const row = (label, dir) => `<div class="lab">${label}</div>` + cols.map(([shot]) => `<div class="cell">${img(path.join(root, dir + suffix, `${lot}-${shot}.jpg`))}</div>`).join('');
      const head = '<div></div>' + cols.map(([, t]) => `<div class="h">${t}</div>`).join('');
      const html = `<style>body{margin:0;background:#111;color:#fff;font:600 18px Arial}.g{display:grid;grid-template-columns:120px repeat(${cols.length},1fr);gap:6px;padding:8px}.h{padding:4px 2px}.lab{writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;padding:6px;background:#222}img{width:100%;display:block}.none{display:grid;place-items:center;height:100%;min-height:120px;background:#222;color:#888}.t{padding:10px 12px;font-size:22px}</style>
        <div class="t">${lot} · ${STYLE[lot]} · ${screen === 'phone' ? '390×844 phone portrait' : '1920×1080 desktop'} · before: Visual Quality Pass 36d8841 · after: Cinematic Service Camera 2.0</div>
        <div class="g">${head}${row('before', 'before')}${row('after', 'after')}</div>`;
      await page.setContent(html);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(out, `${lot}-${screen}.jpg`), type: 'jpeg', quality: 78, fullPage: true });
      n++;
    }
  }
  await browser.close();
  console.log('sheets', n);
})().catch((e) => { console.error(e); process.exit(1); });
