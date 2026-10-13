# The website (site/)

Spendr's public website: static Astro 7 with Tailwind v4. It deploys as its
own Vercel project from this repo (Root Directory `site`), and has its own
`package.json` and lockfile, so run its commands from here.

```bash
npm ci
npm run dev      # :4321
npm run build
npm run check    # astro check
```

`PLAN.md` is the original plan, the Vercel setup and the QA record.

## It reads the app

- The changelog, What's New, privacy and terms, achievements, challenges, the
  bank list, help articles and the glass art are imported from `../src/lib`
  and `../src/components/glass/glass.js` at build time. Editing those changes
  the site too, so keep them free of React and browser-only code.
- Feature copy is in `src/data/features.ts`, the FAQ in `src/data/faq.ts`, the
  home page's sections in `src/components/home/`. When a release adds
  something people should know about, update them.
- The app's address is `APP_URL` in `src/config.ts`. The site's own comes from
  Vercel's `VERCEL_PROJECT_PRODUCTION_URL`.

## Rules

- **Nothing made up.** No ratings, user counts, press or testimonials that
  don't exist. Counts come from the app's modules.
- Same words rules as the app: sentence case, no em dashes, short.
- Same motion rules: no bounce, no glows, and nothing moves under
  `prefers-reduced-motion`.
- Below-the-fold sections use `content-visibility: auto`. Force them visible
  before a full-page screenshot or an audit, or they come out blank.

## Screenshots

The images in `src/assets/screens` are captured from the real app with Mika's
demo ledger (`scripts/demo-ledger.json`), never drawn. The steps are at the
top of `scripts/capture.mjs`: the app on :5195, Playwright installed here with
`--no-save`, then `node scripts/capture.mjs both`. The clock is pinned to the
evening of 28 September 2026 (`CAPTURE_AT`), when the demo ledger ends.

A new screen needs an entry in `PAGES` in capture.mjs, and demo rows in the
ledger if its page would be empty.

## Checking

`../dev/qa/website.mjs` checks the features page and home at 390 and 1440,
light and dark, against `npm run dev -- --port 4325` (or `SITE_PORT`).
