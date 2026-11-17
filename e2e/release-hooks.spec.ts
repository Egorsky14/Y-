import { test, expect } from '@playwright/test';

/**
 * A standard production build must not contain deliberate crash injection. window.__ego.crash and the component
 * that throws on request exist only in the dev server and in the crash-test build (vite.config.ts `__CRASH_HOOKS__`,
 * playwright.crash.config.ts). This runs against the standard build, like every spec but crash-recovery.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

test('the production build has no crash injection: no hook, no way to arm it, no trace in the bundle', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // No hook on the page.
  expect(await page.evaluate(() => typeof window.__ego?.crash)).toBe('undefined');
  expect(await page.evaluate(() => Object.keys(window.__ego ?? {}).sort())).toEqual(['advanceMinutes', 'app', 'crashLog', 'dispatch', 'getState', 'spawnLead']);

  // No trace of it in the JavaScript that was shipped.
  const scripts = await page.evaluate(async () => {
    const urls = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'), (s) => s.src);
    const seen = new Set<string>();
    const out: { url: string; text: string }[] = [];
    while (urls.length) {
      const url = urls.pop()!;
      if (seen.has(url)) continue;
      seen.add(url);
      const text = await (await fetch(url)).text();
      out.push({ url, text });
      for (const m of text.matchAll(/from\s*["'](\.\/[^"']+\.js)["']|import\(\s*["'](\.\/[^"']+\.js)["']\s*\)/g)) urls.push(new URL(m[1] ?? m[2], url).href);
    }
    return out.map((s) => ({ url: s.url.split('/').pop()!, size: s.text.length, simulated: s.text.includes('Simulated'), hook: /__ego\.crash|\.crash\s*=/.test(s.text) }));
  });
  expect(scripts.length, 'the app chunks were read').toBeGreaterThanOrEqual(3);
  expect(scripts.reduce((n, s) => n + s.size, 0)).toBeGreaterThan(500_000);
  expect(scripts.filter((s) => s.simulated || s.hook), 'no script contains the injected failure or the hook').toEqual([]);

  // And it cannot be armed through the store either: the setter ignores it, and nothing reads the field.
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('new-game').click();
  await page.waitForFunction(() => window.__ego?.app.getState().sceneReady, null, { timeout: 180_000 });
  for (const scope of ['panel', 'hud', 'world', 'app', 'simulation', 'fatal']) {
    await page.evaluate(() => (window.__ego!.app as S).setState({ crashTest: null }));
    await page.evaluate((s) => (window.__ego!.app.getState() as S).setCrashTest({ scope: s, sticky: true }), scope);
    expect(await page.evaluate(() => (window.__ego!.app.getState() as S).crashTest)).toBeNull();
    // Forcing the field past the setter still breaks nothing.
    await page.evaluate((s) => (window.__ego!.app as S).setState({ crashTest: { scope: s, sticky: true }, panel: 'employees' }), scope);
    await page.waitForTimeout(700);
    for (const id of ['recovery-app', 'recovery-world', 'recovery-hud', 'recovery-panel', 'recovery-simulation', 'recovery-static']) await expect(page.getByTestId(id)).toHaveCount(0);
    await expect(page.getByTestId('panel-employees')).toBeVisible();
    await expect(page.locator('.app-world canvas')).toBeVisible();
  }
  expect(await page.evaluate(() => (window.__ego!.app.getState() as S).simFault)).toBeNull();
  const f0 = await page.evaluate(() => window.__egoRender?.frame ?? 0);
  await page.waitForFunction((start) => (window.__egoRender?.frame ?? 0) > start + 10, f0, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
