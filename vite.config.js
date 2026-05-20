import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
        theme_color: '#2D9DFF',
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
        runtimeCaching: [
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
