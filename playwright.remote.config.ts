import base from './playwright.config';
import { defineConfig } from '@playwright/test';

/** Runs the same suites against a deployed URL: REMOTE_URL=https://... npx playwright test -c playwright.remote.config.ts */
export default defineConfig({
  ...base,
  webServer: undefined,
  use: { ...base.use, baseURL: process.env.REMOTE_URL ?? 'https://hvaccompanyownerv3.vercel.app' },
});
