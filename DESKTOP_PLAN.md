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
