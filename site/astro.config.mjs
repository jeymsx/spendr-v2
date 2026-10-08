import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'

/*
 * The website's own address. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every
 * build to the project's production domain (no scheme), so the canonical and
 * Open Graph URLs are right whatever the project ends up being called. The
 * fallback is only for builds on a laptop.
 */
const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
const site = host ? `https://${host}` : 'http://localhost:4321'

export default defineConfig({
  site,
  // features.html rather than features/index.html; vercel.json's cleanUrls
  // serves it at /features. The CSS is inlined: about 14 KB gzipped, and one
  // round trip fewer before a phone on a slow connection can paint anything.
  build: { format: 'file', inlineStylesheets: 'always' },
  trailingSlash: 'never',
  devToolbar: { enabled: false },
  integrations: [
    // The help centre's results page is a search box, not content.
    sitemap({ filter: page => !page.endsWith('/404') && !page.endsWith('/help/search') }),
  ],
  vite: {
    plugins: [tailwindcss()],
    // The changelog, the policy text, the badges and the glass art are the
    // app's own modules, one directory up.
    server: { fs: { allow: ['..'] } },
  },
})
