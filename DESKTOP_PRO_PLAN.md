# Desktop, rebuilt as a desktop (feat/desktop-pro)

The desktop (src/web) has been the phone's pages laid out for a landscape
screen (DESKTOP_PLAN.md). It works, but it looks like a phone in a window:
64-72px rows, 18-28px corners, glass, leather and plastic, shadows under
everything, one card per day in Transactions. The ask (2026-10-05): **a real
desktop version, clean, a professional desktop look; consistent spacing,
padding and style on every page; a top bar with global search; built in
phases.**

## What changes in the approach

- **The main sections get desktop pages of their own**, in src/web/pages,
  built from desktop primitives (src/web/ui). They reuse the phone's data
  logic (lib/*, db/*, hooks, the pages' exported helpers) so the figures can
  never disagree with the phone; only the presentation is new.
- **Deep or rarely used phone screens stay the phone's own** (forms, the
  settings sub-pages, a few detail pages), shown in the desktop's frame and
  restyled by CSS onto the desktop's ground (pro.css section 2) - the
  "phone sizing" fix: flat hairline cards, smaller corners, denser rows.
- **Phone files still only gain inert hooks and exports.** The phone does not
  change.
- The cost, said plainly: a feature added to a phone section page now needs
  a desktop counterpart. The shared logic keeps that to presentation.

## Design system (src/web/pro.css, src/web/ui)

- Tokens: `--d-bg` page, `--d-panel` white panels, `--d-sunken`, `--d-border`
  hairlines, three text greys, `--d-pos/neg/warn`, radii 6/8/12, 32px
  controls, 40px rows, 28px page gutter, 56px top bar. Light and dark (a
  neutral dark, not the accent-tinted one).
- No shadows on surfaces. Shadows only on things that float: menus,
  popovers, modals, the drawer.
- Colour only where it means something: money in/out, over budget, the
  accent for the one primary action and the selection.
- Type: 22px page titles, 14px panel titles, 13px body and tables, 12px
  labels; tabular numbers everywhere.
- One icon family (src/web/ui/icons.jsx), 16px, 2px stroke on a 24 grid.

## Phases

0. **Foundation** - tokens, primitives, the shell: a quieter sidebar, a top
   bar with global search (Ctrl/Cmd+K command palette), the add menu, the
   bell, the account menu. Phone pages re-pointed at the tokens.
1. **Transactions** - a real table: sortable columns, filters toolbar,
   multi-select with bulk recategorise and delete, filtered totals, a detail
   drawer, keyboard navigation.
2. **Home** - KPIs, cash flow, accounts, upcoming, budget, recent.
3. **Accounts** - grouped table with totals; account page with its
   transactions.
4. **Budget** - category table (budget, spent, left, progress), the
   category page.
5. **Insights / Reports** - spending, cash flow, net worth, forecast.
6. **Goals, Recurring, Debts** - tables or grids with detail.
7. **The rest** - Settings frame, Notes, Achievements, Import,
   Notifications, forms and modals on the desktop ground.
8. **QA and release** - 1100/1440/1920, light/dark/Clean, keyboard, the
   phone unchanged, then a release.

## Log

- **2026-10-05.** Plan written; light-mode card work committed first
  (fbaca04).
