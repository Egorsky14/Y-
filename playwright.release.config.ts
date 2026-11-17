import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * The standard production build (`vite build`, the bundle that is deployed), served on its own port, with the one
 * spec that needs no test hooks: e2e/production-release.spec.ts. It checks the hooks are absent and plays the game
 * through the real interface on a desktop and a phone.
 */
export const RELEASE_PROJECTS = ['desktop-1080p', 'iphone-portrait'];

export default defineConfig({
  ...base,
  projects: (base.projects ?? []).filter((p) => RELEASE_PROJECTS.includes(p.name ?? '')).map((p) => ({ ...p, testMatch: /production-release\.spec\.ts/, testIgnore: [] })),
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    command: 'npm run preview:release',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
