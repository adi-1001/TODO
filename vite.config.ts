/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
      manifest: {
        name: 'Study Space',
        short_name: 'Study Space',
        description: 'A calm study, task and focus-time space that works offline on PC and phone.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        background_color: '#F5F5F7',
        theme_color: '#F5F5F7',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Only the Latin font files are stored for offline use; the browser fetches the Greek,
        // Cyrillic or Vietnamese ones on demand if a note ever needs them.
        globIgnores: ['**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // Listen on the local network so a phone on the same Wi-Fi can open the dev server.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    // The app chunk holds every view on purpose (eager imports, so switching views never
    // flashes). It is about 505 KB raw, 138 KB gzip; warn only if it grows well past that.
    chunkSizeWarningLimit: 560,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'supabase';
          // Capacitor plugins are imported only inside the Android app; leave them to Rollup so
          // they stay in their own lazy chunks. @capacitor/core is tiny and used for detection.
          if (id.includes('@capacitor/app') || id.includes('@capacitor/local-notifications') || id.includes('@capacitor/filesystem') || id.includes('@capawesome-team')) return undefined;
          if (id.includes('dexie')) return 'dexie';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react';
          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
