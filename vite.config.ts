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

// Deliberate crash injection (window.__ego.crash, CrashProbe) exists only in the dev server and in the dedicated
// test build (`vite build --mode crashtest`, see package.json). In a standard production build the flag is the
// literal `false`, so the hook and the code behind it are removed from the bundle.
export default defineConfig(({ command, mode }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_ID__: JSON.stringify(buildId()), __CRASH_HOOKS__: JSON.stringify(command === 'serve' || mode === 'crashtest') },
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
