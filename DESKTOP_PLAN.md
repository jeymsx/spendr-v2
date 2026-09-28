# Desktop refresh (feat/desktop)

The desktop app (src/web) was built on 2026-09-03 and had drifted: no
investments or loans (its Accounts list dropped them and counted a loan as an
asset), the old Insights, no Goals, Budget, Recurring income, Recently deleted
from the list, templates, or any of the Settings pages added since. The goal:
**everything the phone has, looking like the phone, laid out for a landscape
screen.**

## The approach

- **The phone's pages are the desktop's pages.** Every route the phone has,
  the desktop has, rendering the same page component, so a feature added to
  the phone arrives here with it, synced through the same Dexie tables and
  SyncManager. No second implementation to drift again.
- **Laid out for landscape by the shell, not by forks.**
  - *Split view* for anything that is a list and a thing in it: the list on
    the left, the thing on the right, both scrolling on their own, like Mail
    or Settings on a Mac. Accounts, Recurring, Debts, Goals, Budget,
    Settings, Insights (overview left, its pages right).
  - *Two columns* for Home, composed from the phone's own sections.
  - *A centred column* for Transactions and the single-task pages (forms,
    notifications, achievements, the changelog).
- **Desktop-only styling lives in src/web/web.css**, loaded only by the
  desktop bundle, under `html.web`. Phone files gain only inert hook classes
  and exports, plus one refactor: Home's sections become components so both
  layouts can place them (the phone renders them exactly as before).
- **Toasts** on desktop are sonner, bottom right, stacked, with the same
  showToast() API everywhere (ToastContext hands them to a presenter the
  desktop registers).

## Phases

1. Shell: sidebar in the phone's material, every section in it with badges,
   notifications, the add menu with quick log, sync state. Toasts.
2. Routes: every phone route.
3. Split views, with a sensible default on the right and the list item
   that is open marked.
4. Home in two columns.
5. Transactions, editing, Recently deleted.
6. Everything else: notifications, achievements, Wrapped, import, forms.
7. Polish and QA: 1280/1440/1920, light/dark/Clean, the phone unchanged.
8. Retire the old desktop pages.

## Coordination

The onboarding chat (feat/onboarding) edits src/web/pages/WebSettings.jsx
(an Install row). This branch retires that file: desktop Settings is the
phone's Settings in a split view, so their phone Settings row shows here on
its own. Resolve that conflict by taking the deletion.

## Log

- **2026-09-28, shell.** A sidebar in the phone's material lists every
  section, with the phone's badges (goals reached, bills due, debts past
  their date, unread notifications). Sync status sits at its foot; click it
  to sync. The add menu has quick log, and E, I, T and Q open each form
  from anywhere. Under 1280px the sidebar folds to icons. Toasts are sonner
  cards in the bottom right (WebToaster). ToastContext hands them over
  through setToastPresenter, and the phone keeps its bar.
- **Routes.** Every phone address is routed (WebApp.jsx). routes.test.js
  fails if one is missing.
- **Split views** (pages/WebSections.jsx, components/WebPane.jsx).
  - Sections: Accounts (opens the first account), Insights (opens Trend),
    Recurring, Debts, Goals, Budget with a category's page, and Settings
    (opens Preferences).
  - The item open on the right is ringed in the list, via `[data-web-id]`
    hooks on the phone's rows and Insights' own `[data-zoom]`.
  - Back buttons are hidden where they would only step through the list
    (the `subpage-back` hook). The card zoom stays on the phone.
- **Home** is the phone's Dashboard with `layout="desktop"`. Its sections
  are now named pieces, so the phone draws exactly what it did while the
  desktop puts them in two columns. The account cards become a grid.
- **Retired:** WebDashboard, WebAccounts, WebTransactions, WebInsights,
  WebRecurring, WebDebts, WebSettings, WebPanel and WebSelect.
- **Also:** What's New shows on the desktop, quick log is centred in a
  column, and rows answer hover.
- **QA.**
  - Every route checked in light and dark at 1100, 1280, 1440 and 1920, and
    in the Clean style.
  - Flows walked: the split views, the edit and back steps, the add
    overlay, a sheet, a toast with Undo, quick log, What's New, the
    new-account and new-bill forms.
  - The phone's pages screenshot pixel-identical to main.
- **Gate:** check 7/7, lint, 1749 tests, build. sonner is only in the
  desktop chunk.

## Left for later

- **Dead code.** The `variant="sheet"` desktop modals of the budget,
  template and category managers (BudgetManagerSheet, TemplateManagerSheet,
  and the Settings.jsx re-exports) were only for the retired WebSettings,
  and their comments still name it. CategoryManagerSheet is still used by
  settings/Categories.jsx. The onboarding branch has merged, so this is
  free to do; it was left because it touches phone files and changes
  nothing anyone sees.
- ~~**Merge conflict.**~~ Resolved in 663e86a, the merge of origin/main
  (0.11.0) into local main. WebSettings.jsx stayed deleted: its Install row
  is in the phone's Settings, which the desktop shows. The same merge made
  the desktop honour the daily check-in's `?log=quick` link (AddFlow.jsx),
  as the phone's AppLayout does.
- **Not pushed.** Local main is ahead of origin/main with this work, waiting
  for James to review it. The desktop has no What's New note yet; it would
  go in the next release's notes.

