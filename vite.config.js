import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    watch: {
      // scripts/ holds the AST checkers, which are run against src rather than
      // being part of it. Without this, editing one - or having one appear and
      // then be deleted - invalidates the module graph and the dev server
      // serves a blank page with no console error, which looks exactly like a
      // bug in whatever you changed last. That cost real debugging time.
      ignored: ['**/scripts/**'],
    },
  },
  build: {
    // Explicit vendor chunks → stable filenames → better long-term caching
    rollupOptions: {
      output: {
        manualChunks: {
          /* react-router as well as -dom: from v7, react-router-dom is a thin
             re-export and the router itself lives in react-router. Naming only
             the -dom package would leave the real code to land in the entry
             chunk instead of this one. */
          'vendor-react':    ['react', 'react-dom', 'react-router', 'react-router-dom'],
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
      includeAssets: ['icons/icon-512.png', 'apple-touch-icon.png', 'favicon.png'],
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
        /* Three entries, and the third is the point.
         *
         * `any` and `maskable` were the SAME file, which cannot be right for
         * both: a maskable icon is cropped to whatever shape the launcher
         * uses - circle, squircle, rounded square - and only the middle ~80%
         * survives. Declaring a full-bleed transparent icon as maskable gets
         * the logo's edges shaved and the gaps filled with whatever the
         * system picks. The maskable one is inset to 72% on white so any crop
         * lands on background. */
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache all static build output
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        // …except the PDF renderer. It is ~1.4 MB — nearly half the precache —
        // and is already dynamically imported (see utils/reportData.js), so
        // precaching it forces every install to pay for a feature most sessions
        // never touch. The runtimeCaching rule below picks it up on first use.
        // …and except the flag set. 265 SVGs from country-flag-icons, of
        // which a given person sees maybe ten: precaching them would be
        // ~600KB every install pays for a list most never open. Same trade as
        // the PDF renderer above, same answer - the rule below catches them
        // on first use, and a flag nobody has seen yet is a grey disc with
        // the currency mark in it rather than a broken image.
        // …and except the Inter subsets nobody here reads. Latin and Latin
        // Extended are precached - the peso sign lives in the second, so every
        // screen needs both. Cyrillic, Greek and Vietnamese are only fetched if
        // a name uses them, and the rule below keeps them once they are. The
        // .woff copies are a fallback for browsers that cannot read woff2,
        // which is none that can install this app.
        globIgnores: [
          '**/react-pdf.browser-*.js', '**/flags/*.svg',
          '**/inter-cyrillic*', '**/inter-greek*', '**/inter-vietnamese*', '**/*.woff',
        ],
        /* The push and notification-click handlers. A separate file pulled
           into the generated worker, because generateSW writes the worker
           itself and has nowhere to put event listeners of our own. */
        importScripts: ['push-sw.js'],
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
            // Country flags: fetched as they are drawn, then kept. They never
            // change within a build, and a wrong-but-cached flag is the least
            // consequential staleness in the app.
            urlPattern: /\/flags\/[A-Z-]+\.svg$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'country-flags',
              expiration: { maxEntries: 80 },
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
            /* The Inter subsets left out of the precache above. Served from
               this origin now rather than Google Fonts - see main.jsx - and
               content-hashed, so CacheFirst can never serve a stale one. */
            urlPattern: /\/assets\/inter-[^/]+\.woff2?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'inter-subsets',
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
