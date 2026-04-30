/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Auto-update keeps the service worker in sync with new builds without
      // a "click to reload" prompt — appropriate for a small audience that
      // pushes often. Switch to 'prompt' before M10 if customers want control.
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Markur by OfficeMark',
        short_name: 'Markur',
        description: 'A digital passport for every sign in your building — by OfficeMark.',
        theme_color: '#1d1b1a',
        background_color: '#f5f0e8',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Workbox precaches the built assets. Keep PDF.js worker out of the
        // precache because it's 1.4 MB and not always needed offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        globIgnores: ['**/pdf.worker.min*'],
        // Avoid stale HTML on next deploy.
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/accept\//, /^\/api\//, /^\/auth\//],
        runtimeCaching: [
          {
            // Supabase Storage signed URLs for floor plans + asset photos
            // are cache-while-revalidate so they survive offline. Signed URLs
            // expire eventually; we accept that the cache may serve a stale
            // image until the next revalidation re-issues a fresh URL.
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/sign\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'waymarks-storage',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // PDF.js worker on first use. Cache once it's loaded.
            urlPattern: /\/assets\/pdf\.worker\.min.*\.mjs$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'waymarks-pdf-worker',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
      devOptions: {
        // Don't enable in dev — too noisy. Build + serve to test the SW.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/unit/**/*.{test,spec}.{ts,tsx}'],
  },
});
