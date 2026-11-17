import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;
function buildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.EGO_BUILD_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

// Three kinds of build (ARCHITECTURE.md, "Development, test and production interfaces"):
//   production  `vite build`                    no test hooks, no crash injection
//   test        `vite build --mode e2e`         test hooks (window.__ego.dispatch and friends) for the Playwright specs
//   crash test  `vite build --mode crashtest`   test hooks plus deliberate crash injection (window.__ego.crash)
// The dev server has both. In a production build each flag is the literal `false`, so the hooks and the code behind
// them are removed from the bundle.
export default defineConfig(({ command, mode }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_ID__: JSON.stringify(buildId()), __TEST_HOOKS__: JSON.stringify(command === 'serve' || mode === 'e2e' || mode === 'crashtest'), __CRASH_HOOKS__: JSON.stringify(command === 'serve' || mode === 'crashtest') },
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('@react-three') || id.includes('three-stdlib') || id.includes('troika') || id.includes('node_modules/zustand')) return 'r3f';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
}));
