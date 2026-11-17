import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * The crash-recovery spec breaks parts of the game on purpose through window.__ego.crash, which a standard
 * production build does not contain. This configuration builds the dedicated crash-test bundle (the same
 * production build with the injection hook compiled in, `vite build --mode crashtest`), serves it on its own port
 * and runs only that spec against it. Every other spec runs against the standard build (playwright.config.ts),
 * where e2e/release-hooks.spec.ts checks the hook is absent.
 */
const PROJECTS = ['desktop-1080p', 'iphone-portrait', 'iphone-landscape'];

export default defineConfig({
  ...base,
  projects: (base.projects ?? []).filter((p) => PROJECTS.includes(p.name ?? '')).map((p) => ({ ...p, testMatch: /crash-recovery\.spec\.ts/, testIgnore: [] })),
  use: { ...base.use, baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    command: 'npm run preview:crashtest',
    url: 'http://127.0.0.1:4174',
    // Always a fresh build: a stale bundle would test old code.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
