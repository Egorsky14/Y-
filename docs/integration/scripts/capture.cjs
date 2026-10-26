// Matched in-game captures for branch comparison.
// Usage: node capture.cjs <label> <baseUrl> <outDir>
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const [label, baseUrl, outRoot] = process.argv.slice(2);
const out = path.join(outRoot, label);
fs.mkdirSync(out, { recursive: true });
const metrics = { label, baseUrl, shots: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(baseUrl);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && (window.__egoRender?.vehicleModels ?? 0) >= 1, null, { timeout: 90_000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  metrics.renderer = await ev(() => {
    const c = document.querySelector('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const d = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  await sleep(4000);

  const cam = (cmd) => ev((c) => window.__ego.app.getState().camera(c), cmd);
  const advanceTo = async (minute) => {
    await ev((m) => {
      const s = window.__ego.getState();
      const now = s.clock.minute;
      const delta = m >= now ? m - now : 1440 - now + m;
      window.__ego.advanceMinutes(delta);
    }, minute);
    await sleep(4500); // let eased lighting settle on branches that do not snap
  };
  const hud = (show) => ev((on) => {
    let st = document.getElementById('__cmp_hide');
    if (on) { if (st) st.remove(); document.querySelectorAll('[data-cmp-keep]').forEach((e) => e.removeAttribute('data-cmp-keep')); return; }
    const canvas = document.querySelector('canvas');
    for (let e = canvas; e; e = e.parentElement) e.setAttribute('data-cmp-keep', '1');
    if (!st) { st = document.createElement('style'); st.id = '__cmp_hide'; document.head.appendChild(st); }
    st.textContent = 'body *:not([data-cmp-keep]):not(canvas){visibility:hidden !important}';
  }, show);
  const fps = () => ev(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(+(n * 1000 / (performance.now() - t0)).toFixed(1)); }; requestAnimationFrame(f); }));
  const shot = async (name, cmd, { measure = false, wait = 2200, withHud = false } = {}) => {
    if (cmd) await cam(cmd);
    await sleep(wait);
    await hud(withHud);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    await hud(true);
    const r = await ev(() => ({ ...window.__egoRender, minute: window.__ego.getState().clock.minute }));
    metrics.shots[name] = { calls: r.calls, triangles: r.triangles, textures: r.textures, geometries: r.geometries, minute: Math.round(r.minute) };
    if (measure) metrics.shots[name].fps = await fps();
  };

  // 1. Opening frame as the player first sees it (07:30-ish), with and without HUD.
  await shot('00-opening-hud', { type: 'reset' }, { withHud: true });
  await shot('01-overview-opening', null, { measure: true });

  // 2. Mid-morning geometry comparisons at 10:00.
  await advanceTo(600);
  await shot('02-overview-1000', { type: 'reset' }, { measure: true });
  await shot('03-hq-wide', { type: 'hq' }, { measure: true });
  await shot('04-hq-entrance', { type: 'focus', target: { x: 62, z: 27 }, distance: 24, azimuth: -1.75 });
  const van = await ev(() => { const v = window.__ego.getState().vehicles['veh-1']; return { x: v.position.x, z: v.position.z, h: v.heading }; });
  await shot('05-van-front', { type: 'focus', target: { x: van.x, z: van.z }, distance: 8.5, azimuth: van.h + 0.65 });
  await shot('06-van-rear', { type: 'focus', target: { x: van.x, z: van.z }, distance: 8.5, azimuth: van.h + Math.PI - 0.65 });
  await shot('07-condenser-idle', { type: 'focus', target: { x: -12.1, z: 22 }, distance: 4.2, azimuth: 1.2 });
  await shot('08-condenser-idle-close', { type: 'focus', target: { x: -12.1, z: 22 }, distance: 3.0, azimuth: 0.55 });
  await shot('09-neighborhood-mid', { type: 'focus', target: { x: -21, z: 25 }, distance: 48, azimuth: 0.9 }, { measure: true });
  await shot('10-street-vegetation', { type: 'focus', target: { x: -60, z: 2 }, distance: 26, azimuth: 0.45 });

  // 3. Technician at the tutorial customer's condenser.
  const leadId = await ev(() => {
    const s = window.__ego.getState();
    const open = Object.values(s.jobs).find((j) => j.status === 'lead' && s.customers[j.customerId].lotId === 'c-n-4');
    if (open) return open.id;
    return window.__ego.spawnLead({ preferredLotId: 'c-n-4', channel: 'direct' });
  });
  metrics.leadId = leadId;
  const dispatched = await ev((id) => {
    const a = window.__ego.dispatch({ type: 'accept-lead', jobId: id });
    const b = window.__ego.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    let guard = 0;
    while (window.__ego.getState().jobs[id].status !== 'diagnosing' && guard++ < 300) window.__ego.advanceMinutes(1);
    const s = window.__ego.getState();
    const e = s.employees['emp-owner'];
    return { a, b, status: s.jobs[id].status, lot: s.customers[s.jobs[id].customerId].lotId, pos: e.position, minute: s.clock.minute };
  }, leadId);
  metrics.dispatch = dispatched;
  await sleep(3000);
  const p = dispatched.pos;
  await shot('11-tech-context', { type: 'focus', target: { x: p.x, z: p.z }, distance: 15, azimuth: 1.1 });
  await shot('12-tech-close', { type: 'focus', target: { x: p.x, z: p.z }, distance: 6.5, azimuth: 1.0 });
  await shot('13-tech-service-side', { type: 'focus', target: { x: p.x, z: p.z }, distance: 5.5, azimuth: 2.4 });
  await shot('14-tech-front', { type: 'focus', target: { x: p.x, z: p.z }, distance: 5.0, azimuth: -0.2 });

  // 4. Evening and night at HQ and in the neighborhood.
  await advanceTo(18 * 60 + 30);
  await shot('15-hq-1830', { type: 'hq' });
  await advanceTo(19 * 60 + 45);
  await shot('16-hq-1945', { type: 'hq' });
  await advanceTo(21 * 60);
  await shot('17-hq-2100', { type: 'hq' }, { measure: true });
  await shot('18-neighborhood-2100', { type: 'focus', target: { x: -21, z: 25 }, distance: 48, azimuth: 0.9 });

  // 5. Next morning at 08:00 (gameplay light at the start of a workday).
  await advanceTo(8 * 60);
  await shot('19-hq-0800', { type: 'hq' });

  metrics.errors = errors;
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify({ label, renderer: metrics.renderer, dispatch: metrics.dispatch, errors: errors.length }));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
