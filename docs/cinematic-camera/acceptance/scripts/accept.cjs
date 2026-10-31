// Cinematic camera acceptance capture: node accept.cjs <outDir> <profile> <lotId>
// Plays one service call at <lotId> (seed 42, 10:00) the way a player does, against the URL in
// ACCEPT_URL (the deployed preview; the share token stays in the environment, never in the repo).
//   profiles: desktop 1920x1080, laptop 1366x768, portrait 390x844 touch, landscape 844x390 touch
// Captures, with HUD, toasts and inspector exactly as rendered:
//   work-walking   "Watch technician" pressed as soon as he steps out of the van (follow)
//   work           after he has reached the unit
//   property, detail, work-inspector (inspector expanded; not on portrait phones)
//   work-repair, detail-repair once the repair has started
// Records, from the deployed build's own probes: camera pose every probe tick (each 3rd frame) and
// every frame time, the composition report per shot, UI rectangles, page errors. From these:
// transition duration, peak speed, overshoot and reversals per mode switch, frame times during
// switches against an idle window. Then a control test: desktop right-drag orbit, wheel zoom, pan
// away; touch two-finger orbit, pinch in/out, one-finger pan away. Each followed by a 10 s hold.
// If the build exposes __egoThree (local VITE_PROFILE=1 build of the same commit), every shot also
// gets a pixel mask: the technician (magenta) and the job-site kit (cyan) drawn flat with and
// without depth testing, so visible share = depth-tested pixels / silhouette pixels.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [outRoot, profile, lotId] = process.argv.slice(2);
const baseUrl = process.env.ACCEPT_URL;
if (!baseUrl) throw new Error('ACCEPT_URL not set');
const PROFILES = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const P = PROFILES[profile];
const { width: W, height: H } = P.viewport;
const touch = !!P.hasTouch;
const out = path.join(outRoot, profile);
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const ctx = await browser.newContext(P);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const failed = [];
  page.on('requestfailed', (r) => failed.push(r.url().replace(/\?.*/, '')));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(/\?.*/, '')}`); });
  await page.goto(baseUrl);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && (window.__egoRender?.vehicleModels ?? 0) >= 1, null, { timeout: 120_000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const profileBuild = await ev(() => !!window.__egoThree);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  if (touch) await page.getByTestId('touch-tutorial-ok').tap().catch(() => undefined);
  await ev(() => { const s = window.__ego.getState(); window.__ego.advanceMinutes(600 - s.clock.minute); });
  await sleep(1500);

  // Frame and camera recorder.
  await ev(() => {
    const a = (window.__acc = { s: [], marks: [], frames: [], tech: [] });
    let last = performance.now();
    let sv = null;
    let n = 0;
    const loop = (t) => {
      const c = window.__egoRender?.cam;
      a.s.push([+t.toFixed(1), +(t - last).toFixed(1), c ? +c[0].toFixed(3) : 0, c ? +c[1].toFixed(3) : 0, c ? +c[2].toFixed(3) : 0]);
      last = t;
      // Every reframe the director makes, and the technician's (simulated) position 5 times a second.
      if (window.__egoServiceView && window.__egoServiceView !== sv) {
        sv = window.__egoServiceView;
        a.frames.push({ t: +t.toFixed(0), reason: sv.reason, mode: sv.mode, requested: sv.requested, phase: sv.phase, ms: sv.ms, fill: sv.report ? +(+sv.report.fill).toFixed(3) : null });
      }
      if (n++ % 12 === 0) {
        const e = window.__ego.getState()?.employees['emp-owner'];
        if (e) a.tech.push([+t.toFixed(0), +e.position.x.toFixed(2), +e.position.z.toFixed(2), e.status]);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const mark = (name) => ev((name) => window.__acc.marks.push({ name, t: performance.now() }), name);

  const job = await ev((lotId) => {
    const s = window.__ego.getState();
    let lead = Object.values(s.jobs).find((j) => j.status === 'lead' && s.customers[j.customerId].lotId === lotId);
    if (!lead) {
      for (const j of Object.values(s.jobs)) if (j.status === 'lead') window.__ego.dispatch({ type: 'decline-lead', jobId: j.id });
      const id = window.__ego.spawnLead({ preferredLotId: lotId });
      lead = window.__ego.getState().jobs[id];
    }
    const st = window.__ego.getState();
    st.customers[lead.customerId].trust = 100;
    window.__ego.dispatch({ type: 'accept-lead', jobId: lead.id });
    window.__ego.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    return { id: lead.id, lot: st.customers[lead.customerId].lotId, faultId: lead.faultId };
  }, lotId);
  if (job.lot !== lotId) throw new Error(`lead went to ${job.lot}, not ${lotId}`);
  await page.waitForFunction(() => { window.__ego.advanceMinutes(0.25); return window.__ego.getState().vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 90_000, polling: 30 });
  await ev((id) => window.__ego.app.getState().select({ kind: 'job', id }), job.id);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 1 }));
  await sleep(400);

  const techState = () => ev(() => { const e = window.__ego.getState().employees['emp-owner']; return e.position; });
  const metrics = { profile, size: `${W}x${H}`, lot: job.lot, profileBuild, shots: {}, controls: {}, errors, failed };
  const uiRects = () => ev(() => {
    const r = {};
    for (const [k, sel] of Object.entries({ hud: '.top-hud', inspector: '[data-testid="inspector"]', actionBar: '.action-bar', worldControls: '.world-controls', serviceBar: '[data-testid="service-camera-bar"]', toasts: '.toasts' })) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      if (b.width && b.height && getComputedStyle(el).visibility !== 'hidden') r[k] = [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
    }
    r.inspectorCompact = !!document.querySelector('[data-testid="inspector"].compact');
    return r;
  });
  // Pixel mask (profile build only).
  const maskFn = (ui) => {
    const T = window.__egoThree;
    if (!T) return null;
    const { gl, scene, camera } = T;
    let Basic = null;
    scene.traverse((o) => { if (!Basic && o.isMesh && o.material && o.material.type === 'MeshBasicMaterial') Basic = o.material.constructor; });
    const targets = { tech: scene.getObjectByName('employee:emp-owner'), kit: scene.getObjectByName('jobsite-kit') };
    const ctx = gl.getContext();
    const w = ctx.drawingBufferWidth, h = ctx.drawingBufferHeight;
    const dpr = w / window.innerWidth;
    const buf = new Uint8Array(w * h * 4);
    const rects = Object.entries(ui).filter(([k, v]) => Array.isArray(v) && k !== 'toasts').map(([, v]) => v.map((n) => n * dpr));
    const res = {};
    for (const [name, obj] of Object.entries(targets)) {
      if (!obj || !Basic) { res[name] = null; continue; }
      const color = name === 'tech' ? [1, 0, 1] : [0, 1, 1];
      const meshes = [];
      obj.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) meshes.push(o); });
      const count = (depth) => {
        const saved = meshes.map((m) => [m.material, m.renderOrder]);
        const mat = new Basic({ depthTest: depth, depthWrite: depth, fog: false, toneMapped: false });
        mat.color.setRGB(...color);
        meshes.forEach((m) => { m.material = mat; m.renderOrder = depth ? m.renderOrder : 1e6; });
        gl.setRenderTarget(null);
        gl.render(scene, camera);
        ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, buf);
        meshes.forEach((m, i) => { m.material = saved[i][0]; m.renderOrder = saved[i][1]; });
        mat.dispose();
        let n = 0, underUi = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const r = buf[i], g = buf[i + 1], b = buf[i + 2];
          const hit = name === 'tech' ? r > 200 && g < 70 && b > 200 : r < 70 && g > 200 && b > 200;
          if (!hit) continue;
          n++;
          const top = h - 1 - y;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (top < y0) y0 = top; if (top > y1) y1 = top;
          for (const [rx, ry, rw, rh] of rects) if (x >= rx && x < rx + rw && top >= ry && top < ry + rh) { underUi++; break; }
        }
        return { n, underUi, box: n ? [x0 / w, y0 / h, (x1 - x0 + 1) / w, (y1 - y0 + 1) / h].map((v) => +v.toFixed(3)) : null };
      };
      const seen = count(true);
      const all = count(false);
      res[name] = { visible: all.n ? +(seen.n / all.n).toFixed(3) : 0, pixels: all.n, screenShare: +(all.n / (w * h)).toFixed(4), box: all.box, heightShare: all.box ? all.box[3] : 0, underUi: all.n ? +(all.underUi / all.n).toFixed(3) : 0 };
    }
    return res;
  };

  const shot = async (name) => {
    await page.screenshot({ path: path.join(out, `${job.lot}-${name}.jpg`), type: 'jpeg', quality: 84 });
    const ui = await uiRects();
    const sv = await ev(() => window.__egoServiceView ?? null);
    const cam = await ev(() => window.__egoRender.cam.map((v) => +v.toFixed(2)));
    const t = await techState();
    const dx = cam[0] - t.x, dz = cam[2] - t.z;
    const flat = Math.hypot(dx, dz);
    metrics.shots[name] = { cam, tech: [+t.x.toFixed(2), +t.z.toFixed(2)], distToTech: +Math.hypot(flat, cam[1] - 1).toFixed(2), elevationDeg: +((Math.atan2(cam[1] - 1, flat) * 180) / Math.PI).toFixed(1), serviceView: sv, ui, mask: profileBuild ? await ev(maskFn, ui) : null, at: Date.now() };
  };
  const click = (id) => ev((id) => { const b = document.querySelector(`[data-testid="${id}"]`); if (b) b.click(); return !!b; }, id);

  // 1. Watch technician while he walks up from the van.
  const pressed = await click('watch-technician');
  metrics.watchButton = pressed;
  await mark('watch-press');
  // FILMSTRIP=1: a frame every 0.7 s from the press until he reaches the unit (and after each
  // control: at release, 1.5 s and 10 s later), into <profile>/strip-<lot>/.
  const strip = process.env.FILMSTRIP === '1';
  const stripDir = path.join(out, `strip-${job.lot}`);
  if (strip) fs.mkdirSync(stripDir, { recursive: true });
  const pressAt = Date.now();
  const still = (name) => page.screenshot({ path: path.join(stripDir, `${name}.jpg`), type: 'jpeg', quality: 70, scale: 'css' });
  if (strip) {
    for (let i = 0; i < 26; i++) {
      await still(`walk-${String(Date.now() - pressAt).padStart(5, '0')}ms`);
      if ((await ev(() => window.__egoServiceView?.reason)) === 'arrived' && i > 2) break;
      await sleep(450);
    }
  } else {
    await sleep(1800);
  }
  await shot('work-walking');
  for (let i = 0; i < 160; i++) {
    const r = await ev(() => window.__egoServiceView?.reason);
    if (r === 'arrived') break;
    await sleep(250);
  }
  metrics.arrivedReason = await ev(() => window.__egoServiceView?.reason);
  await sleep(3200);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  await mark('idle');
  await sleep(2500);
  await shot('work');

  const sw = async (id, name, wait = 3200) => {
    await mark(name);
    await click(id);
    await sleep(wait);
    await shot(name);
  };
  await sw('service-view-property', 'property');
  await sw('service-view-work', 'work-from-property');
  await sw('service-view-detail', 'detail');
  await sw('service-view-property', 'property-from-detail');
  await sw('service-view-detail', 'detail-from-property');
  await sw('service-view-work', 'work-again');
  const portraitPhone = W < 600;
  if (!portraitPhone) {
    await mark('inspector-expand');
    await click('inspector-compact');
    await sleep(3200);
    await shot('work-inspector');
    await mark('inspector-collapse');
    await click('inspector-compact');
    await sleep(2500);
  } else {
    // The sheet expanded over the work: what the player sees after tapping it.
    await mark('inspector-expand');
    await click('inspector-compact');
    await sleep(3200);
    await shot('work-sheet');
    await mark('inspector-collapse');
    await click('inspector-compact');
    await sleep(2500);
  }

  // 2. Repair phase.
  await page.waitForFunction((id) => { const s = window.__ego.getState().jobs[id].status; if (s === 'diagnosing') window.__ego.advanceMinutes(0.25); return s !== 'diagnosing'; }, job.id, { timeout: 60_000, polling: 50 });
  await ev((j) => {
    window.__ego.dispatch({ type: 'choose-diagnosis', jobId: j.id, faultId: j.faultId });
    window.__ego.dispatch({ type: 'submit-quote', jobId: j.id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
  }, job);
  await page.waitForFunction((id) => { const s = window.__ego.getState().jobs[id].status; if (s !== 'repairing') window.__ego.advanceMinutes(0.1); return s === 'repairing' || s === 'completed' || s === 'declined'; }, job.id, { timeout: 60_000, polling: 50 });
  metrics.repairStatus = await ev((id) => window.__ego.getState().jobs[id].status, job.id);
  await mark('phase-repair');
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 1 }));
  await sleep(2500);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  await sleep(1500);
  metrics.repairViewMode = await ev(() => window.__ego.app.getState().serviceView?.mode ?? null);
  await shot('repair-auto');
  await sw('service-view-work', 'work-repair');
  await sw('service-view-detail', 'detail-repair');
  await sw('service-view-work', 'work-repair-2', 3000);

  // 3. Player control.
  const camNow = () => ev(() => window.__egoRender.cam.slice());
  const t = await techState();
  const geo = (c) => ({ dist: +Math.hypot(c[0] - t.x, c[1] - 1, c[2] - t.z).toFixed(2), az: +((Math.atan2(c[0] - t.x, c[2] - t.z) * 180) / Math.PI).toFixed(1), y: +c[1].toFixed(2) });
  const dd = (a, b) => +Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]).toFixed(3);
  const hold = async (name, before) => {
    await sleep(700);
    const released = await camNow();
    if (strip) {
      await still(`${name}-a-release`);
      await sleep(1500);
      await still(`${name}-b-1.5s`);
      await sleep(8500);
      await still(`${name}-c-10s`);
    } else await sleep(10_000);
    const later = await camNow();
    metrics.controls[name] = { before: geo(before), released: geo(released), moved: dd(before, released), driftAfter10s: dd(released, later), serviceView: await ev(() => window.__ego.app.getState().serviceView?.mode ?? null) };
  };
  const cx = Math.round(W * (portraitPhone ? 0.5 : 0.45)), cy = Math.round(H * 0.55);
  if (!touch) {
    let b = await camNow();
    await mark('orbit');
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 14; i++) { await page.mouse.move(cx + (160 * i) / 14, cy); await sleep(16); }
    await page.mouse.up({ button: 'right' });
    await hold('orbit', b);
    b = await camNow();
    await mark('zoom-in');
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await sleep(60); }
    await hold('zoomIn', b);
    b = await camNow();
    await mark('zoom-out');
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await sleep(60); }
    await hold('zoomOut', b);
    b = await camNow();
    await mark('pan-away');
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 16; i++) { await page.mouse.move(cx - (420 * i) / 16, cy - (120 * i) / 16); await sleep(16); }
    await page.mouse.up();
    await hold('panAway', b);
  } else {
    const cdp = await ctx.newCDPSession(page);
    const touchSeq = async (frames) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: frames[0] });
      for (const f of frames.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: f }); await sleep(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const two = (fn) => Array.from({ length: 15 }, (_, i) => fn(i / 14).map(([x, y], id) => ({ x: Math.round(x), y: Math.round(y), id })));
    let b = await camNow();
    await mark('orbit');
    await touchSeq(two((k) => [[cx - 50 + 130 * k, cy], [cx + 50 + 130 * k, cy]]));
    await hold('orbit', b);
    b = await camNow();
    await mark('pinch-in');
    await touchSeq(two((k) => [[cx - 40 - 70 * k, cy], [cx + 40 + 70 * k, cy]]));
    await hold('zoomIn', b);
    b = await camNow();
    await mark('pinch-out');
    await touchSeq(two((k) => [[cx - 110 + 75 * k, cy], [cx + 110 - 75 * k, cy]]));
    await hold('zoomOut', b);
    b = await camNow();
    await mark('pan-away');
    await touchSeq(Array.from({ length: 16 }, (_, i) => [{ x: Math.round(cx - (W * 0.45 * i) / 15), y: Math.round(cy - (H * 0.12 * i) / 15), id: 0 }]));
    await hold('panAway', b);
  }
  await shot('after-controls');
  await mark('end');

  // Analysis of the recorder.
  const acc = await ev(() => window.__acc);
  const analyse = (from, to) => {
    const s = acc.s.filter((r) => r[0] >= from && r[0] < to);
    const dts = s.map((r) => r[1]).sort((a, b) => a - b);
    const q = (p) => dts.length ? dts[Math.min(dts.length - 1, Math.floor(p * dts.length))] : null;
    const pts = [];
    for (const r of s) { const l = pts[pts.length - 1]; if (!l || l[1] !== r[2] || l[2] !== r[3] || l[3] !== r[4]) pts.push([r[0], r[2], r[3], r[4]]); }
    let path = 0, vmax = 0, moveEnd = from, reversals = 0, overshoot = 0;
    const fin = pts.length ? pts[pts.length - 1] : null;
    let prevV = null, minToFinal = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [t0, ...a] = pts[i - 1], [t1, ...c] = pts[i];
      const d = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      path += d;
      const v = d / Math.max(1e-3, (t1 - t0) / 1000);
      if (v > vmax) vmax = v;
      if (d > 0.002) moveEnd = t1;
      const vec = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      if (prevV && d > 0.01) { const dot = vec[0] * prevV[0] + vec[1] * prevV[1] + vec[2] * prevV[2]; if (dot < 0) reversals++; }
      if (d > 0.01) prevV = vec;
      const toFin = Math.hypot(c[0] - fin[1], c[1] - fin[2], c[2] - fin[3]);
      if (toFin > minToFinal + 0.03) overshoot = Math.max(overshoot, toFin - minToFinal);
      minToFinal = Math.min(minToFinal, toFin);
    }
    return { frames: s.length, dtP50: q(0.5), dtP95: q(0.95), dtMax: dts.length ? dts[dts.length - 1] : null, longFrames: dts.filter((d) => d > 50).length, path: +path.toFixed(2), peakSpeed: +vmax.toFixed(2), settleMs: Math.round(moveEnd - from), reversals, overshoot: +overshoot.toFixed(3) };
  };
  metrics.transitions = {};
  for (let i = 0; i < acc.marks.length - 1; i++) {
    const m = acc.marks[i];
    metrics.transitions[m.name] = analyse(m.t, acc.marks[i + 1].t);
  }
  metrics.reframes = acc.frames;
  // Camera path and technician path while he walks up (watch press to idle), for the follow review.
  const w0 = acc.marks.find((m) => m.name === 'watch-press').t, w1 = acc.marks.find((m) => m.name === 'idle').t;
  metrics.walkup = { cam: acc.s.filter((r, i) => r[0] >= w0 && r[0] < w1 && i % 6 === 0).map((r) => [Math.round(r[0] - w0), r[2], r[3], r[4]]), tech: acc.tech.filter((r) => r[0] >= w0 && r[0] < w1).map((r) => [Math.round(r[0] - w0), r[1], r[2], r[3]]), reframes: acc.frames.filter((f) => f.t >= w0 && f.t < w1).map((f) => ({ ...f, t: Math.round(f.t - w0) })) };
  fs.writeFileSync(path.join(out, `${job.lot}-metrics.json`), JSON.stringify(metrics, null, 1));
  console.log(profile, job.lot, 'profileBuild', profileBuild, 'repair', metrics.repairStatus, 'errors', errors.length, errors.slice(0, 3), 'failed', failed.length, failed.slice(0, 3));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
