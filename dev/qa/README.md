# Browser checks

Scripts that drive a real Chrome against the dev server, the way a person
would: they load data, tap through a feature at phone and computer sizes,
print a `PASS` or `FAIL` line per check, and leave screenshots in
`%TEMP%/spendr-qa-out` (or `QA_OUT`), outside the repo so no dev server
watches them.

They sign in with a fake session and sync to a **stand-in for Supabase** on
your machine, never the real cloud.

## Once

- Google Chrome installed. Set `CHROME` to its path if it isn't in the usual
  place.
- `npm ci --prefix dev/qa/standin`
- Most checks load the sample ledger from `dev/seed-sample-data.html`; the
  rest write their own data with `seed.mjs`.

## Running

Three terminals, from the repo root (Git Bash):

```bash
node dev/qa/standin/server.mjs
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=anon npx vite --port 5190 --strictPort
node dev/qa/run.mjs                      # everything, one at a time: about 45 minutes
node dev/qa/run.mjs --jobs 2             # faster, less steady: see below
node dev/qa/run.mjs wishlist home-rail   # some
node dev/qa/wishlist.mjs                 # one, on its own
```

- Load the app once before running: a cold dev server can take longer than
  a check waits for its first page.
- `APP_PORT` (or `APP`, a whole address) points the checks at another server.
  Only ever one started with the stand-in's address, as above.
- `run.mjs` keeps checks that sign in to one lane, emptying the stand-in
  before each, since they share it. The rest run side by side with `--jobs`.
- Side by side is faster but not steadier: on 2026-10-13, `--jobs 3` failed
  9 of 16 checks that then passed one at a time, on timing alone. Rerun a
  failure on its own before believing it.
- Restart the dev server for a long run. One left up for hours stalled page
  loads and failed healthy checks.
- Some checks take a width or theme: `W=1100 THEME=dark node dev/qa/desktop-sweep.mjs`.

## The checks

| Check | What it covers |
|---|---|
| `phone-smoke` | The main screens, empty screens, pull to sync, Back on a cold page, What's New |
| `desktop-sweep` | Every desktop page: loads, no errors, nothing too wide, a title at the top (`W`, `THEME`) |
| `narrow-desktop` | At 1100 with the sidebar open, nothing wider than its page or cut off (`W`, `SIDEBAR`) |
| `empty-ledger` | With no data, every page's skeleton gives way to its empty state |
| `tap-targets` | A list, not a pass or fail: anything under 32px a finger has to hit, with where to find it. Not in the default run |
| `back-guard` | System Back closes sheets, asks before losing a form, skips stale entries |
| `form-guards` | Every form asks before typed input is thrown away, and only then |
| `scroll-restore` | Back lands where you left a desktop page |
| `desktop-drawers` | A form's side panel keeps the page under it mounted |
| `desktop-settings` | Desktop Settings: overview, sticky nav, accent picker, Recently deleted (`W`, `THEME`) |
| `live-sync` | Two devices: an expense on the phone reaches the laptop live |
| `balances` | Two devices: every balance ends where the ledger says |
| `report-a-bug` | Report a bug from the phone; the developer's inbox on the computer |
| `change-the-others` | Recategorising one row offers to move the others like it |
| `template-amount` | A template's amount can be changed on its confirm sheet |
| `installments` | An installment plan counts as one purchase everywhere |
| `wishlist` | The wishlist on the phone and computer: add, wait, decide, buy |
| `home-rail` | Home's eight round buttons, in order, scrolling sideways |
| `getting-started` | The Getting started list in Notifications (not Home or Help), its panel and bell row on the computer, its help article |
| `notes`, `note-order` | Folders, tags and search; opening a note doesn't reorder the list |
| `trend-phone`, `trend-desktop` | Insights' Trend: lines on and off, ranges, its settings |
| `cash-flow-chart`, `cash-flow-report` | The cash flow chart's labels; hovering and opening its bands |
| `export-xlsx` | The spreadsheet export and what's in it |
| `spending-dialogs-wrapped` | 1.0.1's fixes: Spending's columns, dialog buttons, Wrapped's share icon |
| `csp` | The production build under `vercel.json`'s headers: no Content Security Policy refusals. Needs `npx vite build` first (not `npm run build` while a dev server runs: it rewrites `public/flags`, which crashed one); not in the default run |
| `website` | The website's features page and home. Needs the site on :4325 (`cd site && npm run dev -- --port 4325`); not in the default run |

## Keeping them current

Every check in the default run passed on 2026-10-13 (1.0.1), along with
`csp` and `website`. When one fails, look at whether the app or the check is
out of date before fixing either: most failures so far were checks written
for an older screen, or waiting a fixed time for a page that was still
compiling. Prefer `s.until(...)` over a fixed `sleep`.

## Writing one

Copy the nearest check. The harness gives you:

- `session()`: a headless Chrome with a throwaway profile, on a free port.
- `s.goto`, `s.evaluate` (a string of page JS), `s.until`, `s.clickText`,
  `s.shot('name.png')`, `s.consoleLog`.
- `s.check(name, ok, detail)` prints the line; `s.close()` prints the tally
  and fails the run if anything failed.
- Signing in: a fake session in `localStorage['sb-localhost-auth-token']`,
  then answer the first-sync question (see `wishlist.mjs`).

Traps:

- `evaluate` takes a template string, so a regex in it needs its backslashes
  doubled: `/\\d+/`, not `/\d+/`.
- A badge earned on first load celebrates over the page; dismiss it with
  "Back to Home" before tapping what's underneath.
- `innerText` skips sections still under `content-visibility`; use
  `textContent`.
- `element.focus()` fires no focus event in headless Chrome until
  `Emulation.setFocusEmulationEnabled` is on.
- Don't time gestures with real sleeps; timers in a background tab run late.
- Don't write files under `src/` while checks run: Vite reloads every open
  page.
