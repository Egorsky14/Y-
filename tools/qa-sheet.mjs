// Labeled contact sheet from real screenshots: node tools/qa-sheet.mjs <out.png> <cols> <title> <img>[=label] ...
// Renders an HTML grid in Chrome (Playwright) and screenshots it; images are referenced, never altered.
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve, basename } from 'node:path';

const [out, colsArg, title, ...items] = process.argv.slice(2);
const cols = Number(colsArg) || 3;
const W = Number(process.env.SHEET_W) || 626;
const cells = items.map((it) => {
  const [p, label] = it.split('=');
  return { src: pathToFileURL(resolve(p)).href, label: label ?? basename(p, '.png') };
});
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#15181c;color:#e8eaed;font:14px system-ui,sans-serif;padding:14px;width:${cols * (W + 14) + 14}px}
h1{font-size:20px;margin:0 0 10px}
.g{display:grid;grid-template-columns:repeat(${cols},${W}px);gap:14px}
figure{margin:0}img{width:${W}px;display:block;border-radius:4px}
figcaption{padding:5px 2px 0;font-weight:600}</style>
<h1>${title}</h1><div class="g">${cells.map((c) => `<figure><img src="${c.src}"><figcaption>${c.label}</figcaption></figure>`).join('')}</div>`;
import { writeFileSync } from "node:fs";
const htmlPath = resolve(out.replace(/.png$/, ".html"));
writeFileSync(htmlPath, html);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: cols * (W + 14) + 28, height: 600 } });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
