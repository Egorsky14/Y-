// Samples frames from a recorded video into PNGs (Chrome via Playwright): node tools/video-frames.mjs <video> <outPrefix> <count>
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve, dirname, basename } from 'node:path';
import { writeFileSync } from 'node:fs';

const [src, prefix, countArg] = process.argv.slice(2);
const count = Number(countArg) || 8;
// Optional window (seconds): FRAMES_FROM / FRAMES_TO.
const from = Number(process.env.FRAMES_FROM ?? 0);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const htmlPath = resolve(dirname(resolve(src)), basename(src) + ".frames.html");
writeFileSync(htmlPath, `<body style="margin:0;background:#000"><video id="v" muted src="${basename(src)}" style="width:1280px;height:720px"></video></body>`);
await page.goto(pathToFileURL(htmlPath).href);
// MediaRecorder files carry no duration until read to the end: seek far to make the browser measure it.
const duration = await page.evaluate(async () => {
  const v = document.getElementById('v');
  await new Promise((r) => (v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, { once: true })));
  if (!Number.isFinite(v.duration)) {
    v.currentTime = 1e7;
    await new Promise((r) => v.addEventListener('durationchange', r, { once: true }));
  }
  return v.duration;
});
console.log('duration', duration.toFixed(1), 's');
// Or exact times (seconds), comma-separated: FRAMES_AT=12.5,30
const at = process.env.FRAMES_AT ? process.env.FRAMES_AT.split(",").map(Number) : null;
for (let i = 0; i < (at ? at.length : count); i++) {
  const to = Number(process.env.FRAMES_TO ?? duration);
  const t = at ? at[i] : from + ((to - from) * (i + 0.5)) / count;
  await page.evaluate(async (t) => {
    const v = document.getElementById('v');
    v.currentTime = t;
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  }, t);
  await page.screenshot({ path: `${prefix}-${String(i + 1).padStart(2, '0')}-${t.toFixed(0)}s.png` });
}
await browser.close();
