/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { PREPAINT_SCRIPT } from './src/theme/prepaint';

/** Inlines the theme pre-paint script as the first thing in <head> (no flash of the wrong theme). */
function themePrepaint(): Plugin {
  return {
    name: 'irent-theme-prepaint',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{ tag: 'script', children: PREPAINT_SCRIPT, injectTo: 'head-prepend' }],
    },
  };
}

export default defineConfig({
  plugins: [react(), themePrepaint()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: cached across deploys and loaded in parallel with the app chunk.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules[/\\](react|react-dom|scheduler|react-router|react-router-dom)[/\\]/.test(id)) return 'vendor-react';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (/node_modules[/\\](i18next|react-i18next|@reduxjs|redux|react-redux|reselect|immer|zod)[/\\]/.test(id)) return 'vendor-state';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    // happy-dom, not jsdom: jsdom's AbortController/AbortSignal shadow Node's native ones on globalThis,
    // which breaks any test that reaches a real (MSW-intercepted) fetch call under Node >=24's stricter
    // undici `instanceof AbortSignal` check inside fetchBaseQuery's combined timeout signal
    // (vitest-dev/vitest#8374, fixed upstream in Vitest 4; happy-dom does not touch these globals).
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Absolute URLs so fetch works under Node (relative URLs cannot be resolved outside a browser).
    env: {
      VITE_API_URL: 'http://localhost:4000/api',
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_CONTACT_PHONE: '+63 917 000 0000',
      VITE_USE_MOCKS: 'false',
    },
    restoreMocks: true,
  },
});
