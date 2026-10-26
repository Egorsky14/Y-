// In-game captures of the Blender job-site kit: node kitshots.cjs <baseUrl> <outDir>
// Needs a dev or VITE_PROFILE=1 build (reads the kit's world position from window.__egoThree).
// Seed 42; accepts the tutorial lead, dispatches the owner in veh-1 through the game's own actions,
// advances to the diagnosis visit, pauses, then frames the kit at gameplay and close-up distances.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [url, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => (window.__egoRender?.calls ?? 0) > 100 && !!window.__egoThree, null, { timeout: 90_000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => window.__ego.dispatch({ type: 'set-speed', speed: 0 }));
  const jobId = await ev(() => {
    const s = window.__ego.getState();
    const lead = Object.values(s.jobs).find((j) => j.status === 'lead');
    window.__ego.dispatch({ type: 'accept-lead', jobId: lead.id });
    window.__ego.dispatch({ type: 'dispatch', jobId: lead.id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
    return lead.id;
  });
  for (let i = 0; i < 400; i++) {
    const st = await ev((id) => window.__ego.getState().jobs[id].status, jobId);
    if (st === 'diagnosing') break;
    await ev(() => window.__ego.advanceMinutes(1));
    await sleep(30);
  }
  await page.waitForFunction(() => (window.__egoRender?.kits ?? 0) >= 1, null, { timeout: 30_000 });
  await sleep(2500); // let the technician walk in and settle
  const kit = await ev(() => {
    const k = window.__egoThree.scene.getObjectByName('jobsite-kit');
    const p = k.getWorldPosition(k.position.clone());
    const meshes = []; k.traverse((o) => { if (o.isMesh) meshes.push(o.name || o.parent?.name); });
    return { x: p.x, z: p.z, yaw: k.rotation.y, meshes: meshes.length, names: [...new Set(meshes)] };
  });
  // Hide the HUD so only the 3D frame is captured.
  await ev(() => { const s = document.createElement('style'); s.textContent = 'body *:not(canvas){visibility:hidden !important}'; document.head.appendChild(s); for (let e = document.querySelector('canvas'); e; e = e.parentElement) e.style.setProperty('visibility', 'visible', 'important'); });
  const shot = async (name, distance, azimuth, elevation, target = kit) => {
    await ev((c) => window.__ego.app.getState().camera(c), { type: 'focus', target: { x: target.x, z: target.z }, distance, azimuth, ...(elevation !== undefined ? { elevation } : {}) });
    await sleep(2600);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  };
  await shot('kit-gameplay', 26, kit.yaw + 0.9);
  await shot('kit-mid', 7, kit.yaw + 0.7);
  // Photo Mode allows the camera down to 1.5 m (gameplay stops at 5 m); it never touches the simulation.
  await ev(() => window.__ego.app.getState().setPhoto({ on: true }));
  await sleep(800);
  const man = await ev(() => { const k = window.__egoThree.scene.getObjectByName('jobsite-kit'); const m = k.getObjectByName('manifold'); const b = new (m.position.constructor)(); m.updateWorldMatrix(true, true); const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; m.traverse((o) => { if (!o.isMesh) return; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], bb.min.getComponent(i)); box.max[i] = Math.max(box.max[i], bb.max.getComponent(i)); } }); void b; return { x: (box.min[0] + box.max[0]) / 2, z: (box.min[2] + box.max[2]) / 2 }; });
  await shot('kit-close', 1.8, kit.yaw + 0.5, 0.55);
  await shot('kit-close-side', 1.8, kit.yaw + 2.1, 0.45);
  await shot('manifold-close', 1.5, kit.yaw + 0.3, 0.95, man);
  await shot('kit-with-tech', 3.2, kit.yaw - 0.4, 0.35);
  const render = await ev(() => window.__egoRender);
  fs.writeFileSync(path.join(outDir, 'kitshots.json'), JSON.stringify({ jobId, kit, render, errors }, null, 2));
  console.log(JSON.stringify({ jobId, kit, kits: render.kits, calls: render.calls, errors }));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
