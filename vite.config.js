import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    // Explicit vendor chunks → stable filenames → better long-term caching
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-dexie':    ['dexie'],
          'vendor-dnd':      ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
    // Modern target — smaller output, no legacy polyfills
    target: 'esnext',
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/icon-512.png'],
      devOptions: { enabled: true },
      manifest: {
        name: 'Spendr',
        short_name: 'Spendr',
        description: 'Personal finance tracker — track spending, income, and more.',
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-512.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache all static build output
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // …except the PDF renderer. It is ~1.4 MB — nearly half the precache —
        // and is already dynamically imported (see utils/reportData.js), so
        // precaching it forces every install to pay for a feature most sessions
        // never touch. The runtimeCaching rule below picks it up on first use.
        globIgnores: ['**/react-pdf.browser-*.js'],
        runtimeCaching: [
          {
            // PDF renderer chunk: fetched on the first monthly-report export,
            // then cached so later exports work offline. Filenames are
            // content-hashed, so CacheFirst can never serve a stale build.
            urlPattern: /\/assets\/react-pdf\.browser-[^/]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-renderer',
              expiration: { maxEntries: 2 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Supabase REST + Auth: network-first, fall back to cache when offline
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\//i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts stylesheet
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // Google Fonts files — immutable, cache for 1 year
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
