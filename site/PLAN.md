# The Spendr website: the plan

The public website for Spendr, a separate site from the app. It uses Tarsi's page ([tarsi.cloud](https://www.tarsi.cloud/)) as a guide to structure, and follows Spendr's own brand and features throughout.

## Where it lives

| | Address | Built from |
| --- | --- | --- |
| The app | `go-spendr.vercel.app`, which the site links to; `spendr-v2.vercel.app` serves the same build | repo root, the existing Vercel project |
| The website | its own free `*.vercel.app` name: `get-spendr.vercel.app` pairs with the app's | `site/`, a second Vercel project on the same GitHub repo |

**The app's addresses stay put.** An address is what the installed home-screen app opens, and it is also what the phone's data, the Face ID passkeys and push reminders are tied to. Each address keeps its own data, so anyone who installed from `spendr-v2` keeps using that icon, or signs in to sync first.

The website's "Open Spendr" buttons link to the app. Nothing redirects.

## Rules

1. **Nothing made up.** Spendr has no store ratings, user counts, awards or press yet, so those Tarsi sections become things that are true:
   - what's new
   - privacy promises
   - an FAQ

   The testimonials section is built but only renders when `src/data/quotes.ts` has real quotes in it. Prices, numbers and claims come from the code: the counts of banks, badges, levels and challenges are read from the app's modules, and quick log's chips were recorded from the app one keystroke at a time.
2. **Spendr's brand, not Tarsi's:**
   - Spendr's mark and its blue, `#2D9DFF`
   - Inter
   - the app's surfaces: navy page `#0b0f14`, panels `#111820`, lifted `#1a2130`, and white on slate-50 in light mode
   - its 18, 24 and 30px radii
   - its voice, which is plain, warm and specific
3. **Spendr's motion language:**
   - surfaces that move, and content that swaps through a short blur
   - the app's own curves (`--ease-out`, `--ease-sheet`, `--ease-settle`), which settle with no bounce
   - no glows, no confetti; Wrapped's panel is the one loud place, as in the app
   - everything off under `prefers-reduced-motion`
4. **One source of truth.** The changelog, the release notes, the Privacy and Terms text, the achievements, the bank list, the help articles and the glass art are imported from the app (`src/lib/changelog.js`, `src/lib/release.js`, `src/lib/policy.js`, `src/lib/achievements.js`, `src/lib/challenges.js`, `src/lib/phAccounts.js`, `src/lib/help.js`, `src/lib/helpSearch.js`, `src/components/glass/glass.js`), so the site can't drift from the app. The only copy is the eight accent names, in `src/data/app.ts`, because they live in a React module.
5. **Fast and honest to share:**
   - static HTML, CSS inlined, about 6 KB of script
   - no analytics, no cookies
   - a bundled font
   - a real Open Graph card (`public/og.jpg`)
   - below-the-fold sections skip layout until they near the screen (`content-visibility`)

## Pages

- **`/` Home:** the full story; see below.
- **`/features`:** every feature, in ten groups, with screens and a chip rail that follows the reader.
- **`/install`:** iPhone and iPad, Android, and a computer, with the visitor's own device marked.
- **`/changelog`:** every release, from the app's own changelog.
- **`/privacy`, `/terms`:** from the app's own text, word for word.
- **`/help`:** the help centre, from the app's own articles (`src/lib/help.js`), so the site and the app's /help say the same thing. "How can we help?" on a blue panel with the search and quick help links, the ten topics, popular questions, and "Still stuck?" with the email.
  - **`/help/topic/<id>`:** a topic's articles as rows, with every topic beside them on wide screens.
  - **`/help/<id>`:** one article, at the address the app links to: breadcrumbs, the body (steps, tips, screens in a phone or the browser window, "open in Spendr" buttons), related questions, and the rest of its topic in a sidebar.
  - **`/help/search?q=`:** every result, read from the address and kept in it as you type; not indexed, not in the sitemap.
  - Search is the app's own `src/lib/helpSearch.js`, so the same words find the same answers. Its script (`scripts/helpSearch.ts`) fetches the articles only when someone reaches for the field. The field is an ARIA combobox: arrows, Enter, Escape.
- **`/404`**

## Home, top to bottom

Tarsi's structure, Spendr's content:

| # | Tarsi | Spendr |
| --- | --- | --- |
| 1 | Hero: headline, store buttons, "30,000+ people" | "Every peso, accounted for.": **Open Spendr** and **Add to home screen**, three true promises (free, no account needed, works offline), two phones with the demo ledger, and a Safe to spend card, a transaction and a badge floating beside them |
| 2 | "Backed by" | The 29 banks and e-wallets and 35 investments and loans the app knows by name, as moving rows, with the not-affiliated line |
| 3 | Three benefits | Three benefits with the app's glass pictures: see where it goes; stay ahead of the month; pay off and save up |
| 4 | Screenshot carousel | Store-style cards of real screens, drifting past, with a pause button |
| 5 | (features page only) | Seven parts in tabs; the phone swaps its screen through the blur, moving on by itself until someone picks one |
| 6 | (none) | Quick log, live: "185 starbucks" and "1000 from gcash to bpi savings" type themselves, the recorded chips answer, and the app's prefilled form appears |
| 7 | Awards | Wrapped: the story's twelve slides, playing with its own progress bar, with jump buttons |
| 8 | (none) | Achievements: the app's medallions in Badges, Milestones and Challenges tabs |
| 9 | "Tarsi on the web, too" | "The big picture, on a big screen": the desktop layout in a window, Home and Insights |
| 10 | Testimonials | Privacy: on your phone, nothing watching, Face ID, yours to take. Quotes appear here once there are real ones |
| 11 | Community | What's new: the latest release, straight from What's New |
| 12 | (none) | FAQ |
| 13 | Download | "Log your first peso today.": Open Spendr, Add to home screen, and a QR code on wide screens |
| 14 | Footer | Product, Legal, Contact, © James Sablay, the version |

## Screens

Captured from the real app with a demo ledger (Mika's) by `scripts/capture.mjs`. The ledger is `scripts/demo-ledger.json`, a dump of the curated demo data (IndexedDB tables and localStorage), loaded into a fresh Chrome profile, so no real data is read or changed.

- Phone: an iPhone 15 Pro, 393×852 at 3×, **with the real safe areas emulated** (CDP `Emulation.setSafeAreaInsetsOverride`, top 59, bottom 34), so the app pads for the island exactly as on the phone, and `Phone.astro` draws the status bar, island and home indicator into that space.
- Desktop: 1440×900 at 2×.
- Both themes, except Wrapped, which is the same in both.
- Stored as WebP (quality 92) in `src/assets/screens/<name>-<theme>.webp`; Astro makes the sizes each page asks for.

| Name | Route | Used in |
| --- | --- | --- |
| home | `/` (balances shown) | hero, install, quick log's background, OG card |
| transactions, accounts, card, budget, recurring, debts, goals, insights, networth, forecast, achievements | their pages | marquee, showcase, features |
| expense | `/expense`, filled in | features: Logging |
| ql-expense-form, ql-transfer-form | the forms quick log opens | quick log |
| wrapped-* | `/recap/2026-08`, all twelve slides | Wrapped, marquee, features |
| desktop, desktop-insights | `/`, `/insights` at 1440 | "on your computer", features |

To recapture after the app changes:

1. Run the app from the repo root: `npm run dev -- --port 5195`.
2. Once, in `site/`: `npm i --no-save playwright` (it needs Google Chrome installed).
3. In `site/`: `node scripts/capture.mjs` for everything, or `node scripts/capture.mjs dark goals,budget` for some. It writes WebP straight into `src/assets/screens`, and the same app gives byte-identical files.

## Tech

- **Astro 7** (static), **Tailwind v4** through `@tailwindcss/vite`, **Inter** from `@fontsource-variable/inter`, **Tabler** icons (the app's set) inlined at build time, and `qrcode` for the closing QR.
- Motion is CSS plus small scripts beside their sections: arrivals (`[data-reveal]`, IntersectionObserver, once), the hero's load animation (CSS only, so the headline paints at once), the marquees, the showcase tabs, quick log, the Wrapped player (one Web Animations clock drives the bar and the slide), the achievements tabs, the FAQ heights, the header and its phone menu, the theme toggle and the cross-page fade (`@view-transition`).
- **Theme:** follows the OS, with a toggle remembered in `localStorage` (`spendr-site-theme`). Each capture is a `<picture>` whose dark source answers `prefers-color-scheme`; a pick that disagrees with the OS rewrites that media query, so only the shown capture is ever downloaded.
- **Addresses:** the canonical and Open Graph URLs come from Vercel's `VERCEL_PROJECT_PRODUCTION_URL`. The app's address is `APP_URL` in `src/config.ts`.

## Repo integration

- **`site/` is self-contained,** with its own `package.json` and lockfile. It imports the app's pure modules listed above, nothing with React in it.
- **Root `eslint.config.js`** ignores `site/`.
- **Root `src/index.css`** has `@source not "../site";`, so the app's Tailwind doesn't scan the website's files.
- **Neither build affects the other.**

## Deploying (the second Vercel project)

1. Vercel → Add New → Project → import this same GitHub repo.
2. Root Directory: `site`. Vercel detects Astro; leave the build settings as they are. Node 22 or later (the default).
3. Keep "Include files outside the root directory in the Build Step" on (the default). The site reads the app's changelog, policy and badge modules.
4. Name the project. The name becomes the `*.vercel.app` address.
5. Settings → Git → Ignored Build Step, so the site builds only when it or what it reads changed: `git diff HEAD^ HEAD --quiet -- . ../src/lib ../src/components/glass ../package.json`
6. On the app's project, an Ignored Build Step of `git diff HEAD^ HEAD --quiet -- . ':!site'` skips the app when only the site changed.

## QA

- **Widths:** 360, 390, 430 (phones), 768 and 834 (iPad portrait), 1024 and 1180 (iPad landscape), 1280, 1440 and 1920.
- **Themes:** dark and light, and the toggle, with the captures following.
- **Reduced motion:** nothing moves, and everything is in place.
- **Keyboard:** skip link, focus rings, the phone menu (Escape, focus kept inside), the tabs (arrows, Home, End), the FAQ.
- **WebKit** (Playwright), as well as Chrome.
- **Lighthouse (mobile):** Performance 96, Accessibility 100, Best Practices 100, SEO 100.
- **Builds and checks:** `astro build`, and the app's `npm run check`, lint, tests and build.

## Progress

- [x] Worktree and branch `feat/website`
- [x] App text moved to `src/lib/policy.js`, shared by the app and the site (main's daily check-in sentence carried over in the merge)
- [x] Astro scaffold, tokens, layout, header, footer and theme
- [x] Demo data and screen captures, with safe areas, both themes, after merging main (0.11.0 and the desktop refresh)
- [x] Home, every section
- [x] Features, Install, Changelog, Privacy, Terms and 404
- [x] Motion
- [x] Open Graph image, favicons, sitemap and robots.txt
- [x] QA at every width and theme, reduced motion, WebKit and Lighthouse
- [x] Repo integration: ESLint ignore, Tailwind `@source not`
- [ ] Merge into main, when James says so, and set up the second Vercel project
