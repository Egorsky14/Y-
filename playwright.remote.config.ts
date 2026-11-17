import release from './playwright.release.config';
import { defineConfig } from '@playwright/test';

/**
 * Runs the production-release spec against a deployed URL:
 *   REMOTE_URL=https://... npx playwright test -c playwright.remote.config.ts
 * A deployment is a production build and has no test hooks, so the hook-driven suites cannot run against it; this
 * spec uses the real interface only.
 */
export default defineConfig({
  ...release,
  webServer: undefined,
  use: { ...release.use, baseURL: process.env.REMOTE_URL ?? 'https://hvaccompanyownerv3.vercel.app' },
});
