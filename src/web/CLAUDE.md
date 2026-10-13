# The computer layout (src/web)

Notes for anything under `src/web`, and for desktop-only CSS anywhere.

## How it fits together

- `WebApp.jsx` is the computer's router. Each route renders one of:
  - a desktop page from `pages/` (Home, Transactions, Insights, Settings ...);
  - a phone page inside `ui/PhonePage` (Wrapped, a few detail pages);
  - a phone form inside `ui/RouteDrawer`: a side panel over the page named in
    `under`, which stays mounted beneath it.
- `ui/` holds the desktop's own primitives: Page, Panel, Button, DataTable,
  Drawer, Dialog, Popover, controls, charts, Sankey, Skeletons. Reach for
  these before writing new ones.
- `pro.css` has the `--d-*` tokens and the `d-` classes. `web.css` restyles
  phone components for the computer, under `html.web`. Both load only with
  the desktop bundle.
- `useViewMode.js` picks the layout. `localStorage['spendr-view-mode']`
  (`auto`, `mobile` or `desktop`) forces it; the browser checks do this.

## Rules

- **The phone must not change.** In `src/pages`, `src/components` and
  `src/layouts`, desktop work may only add an export, an inert hook (a class
  or `data-` attribute for web.css to aim at), a refactor that changes
  nothing visible, or a crash fix. How it looks on the computer goes in
  web.css or pro.css. Compare the phone at 393px before and after.
- **pro.css is unlayered, so it beats Tailwind utilities** whatever their
  specificity. A default a utility should be able to override goes in
  `@layer components`. Check with getComputedStyle, not by reading classes.
- **Sheets become centred dialogs** (`html.web .sheet-panel` in
  `src/index.css`, 520px wide, wider with `.sheet-wide`). Footer buttons sit
  at the right at their own width. When the body is centred (a badge, a
  price), put `sheet-foot-fill` on the footer's row so the buttons span it.
- **Portal floating menus to `document.body`.** `.dark .card` has a
  backdrop-filter, which traps `position: fixed` children and their z-index.
- The scroller is `#app-main`: `ui/Page` and `ui/PhonePage` both set it, and
  the phone code looks for it.
- **Keep Spendr's look:** 24px rounded cards, pill buttons, the blue accent,
  navy dark mode, big type. One panel of rows reads better than many small
  cards. Tune tokens in pro.css rather than restyling page by page.
- A new feature needs a route here as well as on the phone: a desktop page,
  or the phone's page in PhonePage or RouteDrawer.

## Checking

At 1440 and 1100 wide (sidebar open), light and dark. In `dev/qa`,
`desktop-sweep.mjs` opens every page and `narrow-desktop.mjs` finds anything
cut off at 1100.
