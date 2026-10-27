import { defineConfig, devices } from '@playwright/test';
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
    { name: 'desktop-1080p', use: { viewport: { width: 1920, height: 1080 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'laptop-768p', use: { viewport: { width: 1366, height: 768 } }, testMatch: /graphics\.spec\.ts/ },
    { name: 'small-1024', use: { viewport: { width: 1024, height: 768 } }, testMatch: /(graphics|banking-layout|supply|automation)\.spec\.ts/ },
    // Phones and a tablet, emulated in Chromium (touch, coarse pointer, mobile viewport and DPR).
    // The banking layout check also runs on phones with touch: iPhone 14 in Safari (390×664, browser
    // bars visible) and the full 390×844 screen (installed web app, no browser bars).
    { name: 'iphone-portrait', use: { ...devices['iPhone 14'], browserName: 'chromium' }, testMatch: /(mobile|banking-layout)\.spec\.ts/ },
    { name: 'phone-390x844', use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, browserName: 'chromium' }, testMatch: /(banking-layout|supply|automation)\.spec\.ts/ },
    // The supply depot workflow also runs on a landscape phone (short screen, side inspector).
    { name: 'iphone-landscape', use: { ...devices['iPhone 14 landscape'], browserName: 'chromium' }, testMatch: /(mobile|supply)\.spec\.ts/ },
    { name: 'android-portrait', use: { ...devices['Pixel 7'], browserName: 'chromium' }, testMatch: /mobile\.spec\.ts/ },
    { name: 'android-landscape', use: { ...devices['Pixel 7 landscape'], browserName: 'chromium' }, testMatch: /mobile\.spec\.ts/ },
    { name: 'tablet-portrait', use: { ...devices['iPad (gen 7)'], browserName: 'chromium' }, testMatch: /mobile\.spec\.ts/ },
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
