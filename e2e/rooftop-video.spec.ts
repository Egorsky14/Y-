import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Rooftop service call as a player sees it, recorded to video: the same deterministic setup as rooftop-review.spec
 * (seed 42, a direct call at the lot, accepted and dispatched with the starter van), the drive skipped, then the
 * whole call at 1× under the in-game service camera (Watch Work, opened from the job's inspector) with the HUD on:
 * ladder off the rack, carried, raised, climbed, the rooftop unit diagnosed and repaired (each shortened to about
 * eight seconds of play), back down and the ladder stowed. The game's own canvas is recorded in the page (the
 * browser's MediaRecorder, 30 fps, so the HTML HUD is not in the video) and saved as a download:
 * test-results/rooftop-video/<site>.webm.
 */

test.use({ actionTimeout: 20_000, viewport: { width: 1280, height: 720 }, acceptDownloads: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

const SITES = [
  { key: 'plaza', lot: 'cm-plaza' },
  { key: 'modern', lot: 'a-n-4' },
] as const;

const speed = (page: Page, v: 0 | 1 | 2 | 5) => page.evaluate((x) => window.__ego!.dispatch({ type: 'set-speed', speed: x }), v);
const status = (page: Page, id: string) => page.evaluate((j) => (window.__ego!.getState() as S).jobs[j].status as string, id);

for (const site of SITES) {
  test(`rooftop video: ${site.key}`, async ({ page }) => {
    test.setTimeout(900_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByTestId('seed-input').fill('42');
    await page.getByTestId('new-game').click();
    await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 120_000 });
    await speed(page, 0);
    const jobId = await page.evaluate((lotId) => {
      const e = window.__ego!;
      const s = e.getState() as S;
      e.advanceMinutes(600 - s.clock.minute);
      for (const j of Object.values(s.jobs) as S[]) if (j.status === 'lead') e.dispatch({ type: 'decline-lead', jobId: j.id });
      const id = e.spawnLead({ preferredLotId: lotId, channel: 'direct', faultId: 'contactor' })!;
      const st = e.getState() as S;
      st.customers[st.jobs[id].customerId].trust = 100;
      e.dispatch({ type: 'accept-lead', jobId: id });
      const r = e.dispatch({ type: 'dispatch', jobId: id, technicianId: 'emp-owner', vehicleId: 'veh-1' });
      if (!r.ok) throw new Error(r.reason);
      return id;
    }, site.lot);
    await page.waitForFunction(() => { window.__ego!.advanceMinutes(0.25); return (window.__ego!.getState() as S).vehicles['veh-1'].status === 'onsite'; }, null, { timeout: 120_000, polling: 30 });
    // Open the job and press the inspector's watch button, as a player would.
    await page.evaluate((id) => (window.__ego!.app.getState() as S).select({ kind: 'job', id }), jobId);
    await page.getByTestId('watch-technician').click();
    await page.evaluate(() => (window.__ego!.app.getState() as S).setInspectorCompact(true));
    await page.evaluate(() => {
      const canvas = document.querySelector('.app-world canvas') as HTMLCanvasElement;
      const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 3_000_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
        a.download = 'rooftop.webm';
        document.body.appendChild(a);
        a.click();
      };
      rec.start(1000);
      (window as S).__egoRec = rec;
      // Stage timeline beside the video (seconds into the recording), to name what each moment shows.
      const t0 = performance.now();
      const log: [number, string][] = [];
      (window as S).__egoRecLog = log;
      setInterval(() => {
        const st = (window as S).__egoWorkerStage?.['emp-owner'] ?? '-';
        if (!log.length || log[log.length - 1][1] !== st) log.push([Math.round((performance.now() - t0) / 100) / 10, st]);
      }, 100);
    });
    await speed(page, 1);

    // Up the ladder and to the unit.
    await page.waitForFunction((id) => (window.__ego!.getState() as S).jobs[id].status === 'diagnosing' && (window as S).__egoWorkerStage?.['emp-owner'] === 'roof:work', jobId, { timeout: 240_000 });
    await page.waitForTimeout(8000);
    await page.evaluate((id) => {
      const e = window.__ego!;
      e.advanceMinutes((e.getState() as S).jobs[id].phaseRemaining + 0.1);
      const j = (e.getState() as S).jobs[id];
      e.dispatch({ type: 'choose-diagnosis', jobId: id, faultId: j.faultId });
      e.dispatch({ type: 'submit-quote', jobId: id, quote: { recommendation: 'repair', priceAdjust: 0.8 } });
    }, jobId);
    expect(await status(page, jobId)).toBe('repairing');
    await page.waitForTimeout(8000);
    await page.evaluate((id) => window.__ego!.advanceMinutes((window.__ego!.getState() as S).jobs[id].phaseRemaining + 0.1), jobId);
    // Down, ladder stowed, away.
    await page.waitForFunction(() => (window.__ego!.getState() as S).vehicles['veh-1'].status !== 'onsite', null, { timeout: 240_000 });
    await page.waitForTimeout(2500);
    const download = page.waitForEvent('download', { timeout: 120_000 });
    await page.evaluate(() => (window as S).__egoRec.stop());
    mkdirSync('test-results/rooftop-video', { recursive: true });
    await (await download).saveAs(`test-results/rooftop-video/${site.key}.webm`);
    writeFileSync(`test-results/rooftop-video/${site.key}-stages.json`, JSON.stringify(await page.evaluate(() => (window as S).__egoRecLog)));
    expect(errors, errors.join('\n')).toHaveLength(0);
  });
}
