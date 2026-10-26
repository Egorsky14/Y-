import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// The CI container ships a SwiftShader Chromium at a fixed path. On a developer machine that
// path does not exist, so fall back to the installed Google Chrome through Playwright's
// `channel` (no browser download). Set PW_CHROMIUM to point at any other Chromium executable.
const containerChromium = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM ?? (existsSync(containerChromium) ? containerChromium : undefined);
const softwareGl = executablePath !== undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 1_200_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  projects: [
    { name: 'desktop-1080p', use: { viewport: { width: 1920, height: 1080 } } },
    { name: 'laptop-768p', use: { viewport: { width: 1366, height: 768 } }, testMatch: /graphics\.spec\.ts/ },
    { name: 'small-1024', use: { viewport: { width: 1024, height: 768 } }, testMatch: /graphics\.spec\.ts/ },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...(executablePath ? {} : { channel: 'chrome' }),
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: softwareGl ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
