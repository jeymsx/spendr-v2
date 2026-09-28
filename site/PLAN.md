# The Spendr website: the plan

The public website for Spendr, a separate site from the app. It uses Tarsi's page ([tarsi.cloud](https://www.tarsi.cloud/)) as a guide to structure, and follows Spendr's own brand and features throughout.

## Where it lives

| | Address | Built from |
|---|---|---|
| The app | `spendr-v2.vercel.app`, unchanged | repo root, the existing Vercel project |
| The website | its own free `*.vercel.app` name (for example `spendr.vercel.app`) | `site/`, a second Vercel project on the same GitHub repo |

**The app never moves.** Its address is what the installed home-screen app opens. It is also what the phone's data, the Face ID passkeys and push reminders are tied to.

The website's "Open Spendr" buttons link to the app. Nothing redirects.

## Rules

1. **Nothing made up.** Spendr has no store ratings, user counts, awards or press yet, so those Tarsi sections become things that are true:
   - what's new
   - privacy promises
   - an FAQ

   The testimonials section is built but only renders when `src/data/quotes.ts` has real quotes in it. Prices, numbers and claims come from the code.
2. **Spendr's brand, not Tarsi's:**
   - Spendr's mark and its blue, `#2D9DFF`
   - Inter
   - the app's surfaces: navy page `#0b0f14`, panels `#111820`, lifted `#1a2130`, and white on slate-50 in light mode
   - its 18, 24 and 30px radii
   - its voice, which is plain, warm and specific
3. **Spendr's motion language:**
   - surfaces that move, and content that swaps through a short blur
   - curves that settle, with no bounce
   - no glows, no confetti
   - everything off under `prefers-reduced-motion`
4. **One source of truth.** The changelog and the Privacy and Terms text are imported from the app (`src/lib/changelog.js`, `src/lib/policy.js`), so the site can't drift from the app.
5. **Fast and honest to share:**
   - static HTML
   - no analytics
   - a bundled font
   - real Open Graph cards
   - light pages on a phone

## Pages

- **`/` Home:** the full story; see below.
- **`/features`:** every feature, grouped, with screens.
- **`/install`:** adding Spendr to the home screen on iPhone, Android and desktop.
- **`/changelog`:** every release, from the app's own changelog.
- **`/privacy`, `/terms`:** from the app's own text.
- **`/404`**

## Home, top to bottom

Tarsi's structure, Spendr's content:

| # | Tarsi | Spendr |
|---|---|---|
| 1 | Hero: headline, store buttons, "30,000+ people" | Hero: headline, **Open Spendr** and **Add to home screen**, a line of true promises (free, no account needed, works offline), phones with real screens and account cards |
| 2 | Three benefits | Three benefits: see where it goes; stay ahead of the month; pay off and save up |
| 3 | Screenshot carousel | A marquee of real screens, which pauses on hover and scrolls by hand under reduced motion |
| 4 | (features page only) | A showcase with tabs that swap the phone's screen through the app's blur swap. Tabs: Log, Cards, Budgets, Recurring, Debts, Goals, Insights |
| 5 | (none) | Quick log, live: "150 jollibee" types itself and becomes a transaction row |
| 6 | Awards | Wrapped and Achievements: the monthly story and the badges, with real badge art |
| 7 | "Tarsi on the web, too" | "Spendr on your computer, too": the desktop layout, and sync |
| 8 | Testimonials | Privacy: stays on your phone, no tracking, Face ID lock, hide balances. Quotes appear here once there are real ones |
| 9 | Community | What's new: the latest release, straight from the changelog |
| 10 | (none) | FAQ |
| 11 | Download | Final call to action: Open Spendr and Add to home screen |
| 12 | Footer | Product, Legal, Contact, "Made by James Sablay" |

## Screens to capture

Captured from the real app with the demo data (`seed-wrapped-demo.html` and `seed-networth-demo.html`, run on this worktree's dev server):
- Phone: 390×844 at 3×, dark and light.
- Desktop: 1440×900.
- Output: `src/assets/screens/<name>-<theme>.png`.

| Name | Route | Used in |
|---|---|---|
| home | `/` (balances shown) | hero, marquee, showcase |
| transactions | `/transactions` | marquee, showcase: Log |
| expense | `/expense` (keypad with an amount) | features: Log |
| accounts | `/accounts` | showcase: Cards |
| card | `/accounts/:id`, a credit card | features: Cards |
| budget | `/budget` | showcase: Budgets |
| recurring | `/recurring` | showcase: Recurring |
| debts | `/debts` | showcase: Debts |
| goals | `/goals` | showcase: Goals |
| insights | `/insights` | showcase: Insights |
| networth | `/insights/net-worth` | features: Insights |
| forecast | `/insights/forecast` | features: Budgets (Safe to spend) |
| wrapped | `/recap/<last month>`, one slide | Wrapped section |
| achievements | `/achievements` | Achievements section |
| desktop | `/` at 1440×900 | "on your computer, too" |

## Tech

- **Astro** (static output), **Tailwind v4** through `@tailwindcss/vite`, and **Inter** from `@fontsource-variable/inter`.
- Images go through `astro:assets`, which produces AVIF/WebP at the sizes used, with lazy loading.
- Motion is CSS plus about 3 KB of vanilla JS in `src/scripts/`. There is no framework runtime.
  - `IntersectionObserver` reveals
  - the marquee
  - the showcase tabs
  - the quick-log demo
  - the header state
  - the FAQ height animation
  - the theme toggle
- **Theme:** follows the OS, with a toggle remembered in `localStorage`. Screens swap between their dark and light captures with the theme.
- **Addresses:**
  - The canonical and Open Graph URLs come from Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, so whatever name the project gets is correct.
  - The app's address is `APP_URL` in `src/config.ts`.

## Repo integration

- **`site/` is self-contained,** with its own `package.json` and lockfile. It only imports two data files from the app.
- **Root `eslint.config.js`** ignores `site/`.
- **Root `src/index.css`** gets `@source not "../site";`, so the app's Tailwind doesn't scan the website's files.
- **Neither build affects the other.**

## Deploying (the second Vercel project)

1. Vercel → Add New → Project → import this same GitHub repo.
2. Root Directory: `site`. Vercel detects Astro, so leave the defaults.
3. Keep "Include files outside the root directory in the Build Step" on (the default). The site reads the app's changelog and policy text.
4. Name the project. The name becomes the `*.vercel.app` address.
5. Settings → Git → Ignored Build Step: `git diff HEAD^ HEAD --quiet -- . ../src/lib/changelog.js ../src/lib/release.js ../src/lib/policy.js ../package.json` (skip unless the site or its data changed).
6. On the app's project, add an Ignored Build Step of `git diff HEAD^ HEAD --quiet -- . ':!site'` (skip when only the site changed).

## QA checklist

- **Widths:**
  - 360, 390 and 430 (phones)
  - 768 and 834 (iPad portrait)
  - 1024 and 1180 (iPad landscape)
  - 1280, 1440 and 1920 (desktop)
- **Themes:** dark and light, and the toggle.
- **Reduced motion:** nothing moves; everything is still readable and reachable.
- **Keyboard:**
  - skip link
  - focus rings
  - the menu, tabs and FAQ
- **WebKit** (Playwright), checked by seeking animations rather than sampling them over time.
- **Lighthouse:** Performance, Accessibility, Best Practices and SEO all at 95 or above on mobile.
- **Builds and checks:**
  - `astro build` is clean
  - every internal link resolves
  - the app's own `npm run check`, lint and tests still pass

## Progress

- [ ] Worktree and branch `feat/website`
- [ ] App text moved to `src/lib/policy.js`, shared by the app and the site
- [ ] Astro scaffold, tokens, layout, header, footer and theme
- [ ] Demo data and screen captures
- [ ] Home, every section
- [ ] Features, Install, Changelog, Privacy, Terms and 404
- [ ] Motion, all of it
- [ ] Open Graph image, favicons, sitemap and robots.txt
- [ ] QA at every width and theme, reduced motion, WebKit and Lighthouse
- [ ] Repo integration: ESLint ignore, Tailwind `@source not`, the app's checks green
- [ ] Commit on `feat/website`; merge when the other chats have committed
