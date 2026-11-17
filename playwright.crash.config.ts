import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * The crash-recovery spec breaks parts of the game on purpose through window.__ego.crash, which only the crash-test
 * build contains (`vite build --mode crashtest`: the test build plus crash injection). This configuration builds
 * it, serves it on its own port and runs only that spec against it. The other specs run against the test build
 * (playwright.config.ts), and the production build is checked by playwright.release.config.ts.
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
