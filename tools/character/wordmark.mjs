// Draws the EGO HVAC wordmark for the uniform with the same canvas drawing the game uses for its signs
// (src/world/assets/textures.ts: wordmarkTexture, untagged, light), so the shirt's print matches the brand.
// Run: node tools/character/wordmark.mjs   (writes tools/character/wordmark.png)
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.setContent('<canvas id="c" width="1024" height="256"></canvas>');
const data = await page.evaluate(async () => {
  try { await document.fonts.ready; } catch { /* the Arial fallback is what the game falls back to as well */ }
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  // Same bolt as drawBolt in textures.ts.
  const x = 40, y = 38, k = 1;
  ctx.fillStyle = '#19d3c5';
  ctx.beginPath();
  ctx.moveTo(x + 15 * k, y);
  ctx.lineTo(x + 85 * k, y);
  ctx.lineTo(x + 50 * k, y + 85 * k);
  ctx.lineTo(x + 95 * k, y + 85 * k);
  ctx.lineTo(x + 15 * k, y + 180 * k);
  ctx.lineTo(x + 40 * k, y + 105 * k);
  ctx.lineTo(x, y + 105 * k);
  ctx.closePath();
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = '900 170px Inter, Arial Black, Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('EGO', 165, 128);
  ctx.fillStyle = '#19d3c5';
  ctx.font = '800 118px Inter, Arial Black, Arial, sans-serif';
  ctx.fillText('HVAC', 580, 132);
  return c.toDataURL('image/png');
});
writeFileSync('tools/character/wordmark.png', Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
console.log('wrote tools/character/wordmark.png');
