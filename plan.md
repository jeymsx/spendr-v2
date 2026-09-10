# Spendr — what to build next

Written 10 September 2026, on `feat/goals`, after building the goals feature.

Everything here is grounded in this codebase rather than a generic checklist:
the numbers were measured, the file references are real, and where something is
already fine I have said so instead of padding the list. Ordered by what it
buys you, not by effort.

---

## 0. Read this first

**Goals is done and committed** (`ce62f14`), but two things are outstanding:

1. **Run `src/supabase/migrations/004_goals.sql`** in the Supabase SQL editor.
   Until then goals stay on-device: `optionalSync` in [sync.js](src/lib/sync.js)
   deliberately steps over the goals push and pull so a missing remote table
   cannot abort the whole sync.
2. **Remove the three demo goals before you sign in to Supabase on localhost.**
   [seed-goals-demo.js](seed-goals-demo.js) has the one-paste undo. They are
   written `synced: 0`; harmless today because of the point above, dangerous the
   moment the migration lands.

The implementation is explained at the top of [src/lib/goals.js](src/lib/goals.js)
— read that file's header rather than this document if you want to know how the
allocation works.

---

## 1. Correctness first — a wrong figure costs more than a missing feature

This is a money app. Everything in this section outranks everything below it.

### 1.1 The credit card due date is a guess

[utils/creditCycle.js](src/utils/creditCycle.js) derives the due date as the
month following `cycleEnd`. Real cards use a fixed grace period from the
statement date, and Philippine issuers vary — BPI and Metrobank are ~20 days,
some are 25. If your card's due day is earlier in the month than its statement
day, the current logic is off by a month.

You already store `dueDate` as a day-of-month on the account. Prefer the stored
day and only fall back to the derived one; and when a derived date is being
shown, say so, because "Due Sep 25" reads as fact.

**Why it matters:** a due date that is wrong by a month is how a card gets paid
late. Highest-value fix on this list.

### 1.2 There is no test runner

`package.json` has exactly three scripts: `dev`, `build`, `preview`. No test
framework, no eslint. Over this session, **five ReferenceErrors, one temporal
dead-zone crash, and one rules-of-hooks crash all shipped past a green
`vite build`** — a build that succeeds proves the bundle parsed, nothing more.

I wrote three AST checkers while working (unbound identifiers, use-before-
declaration, hooks-after-early-return) and 50 unit tests for the goals
allocator, but **they live in a temp directory and are gone when this session
ends.** That is the single biggest piece of debt here.

```jsonc
// package.json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "check": "node scripts/scopecheck.mjs src/**/*.{js,jsx} && node scripts/tdzcheck.mjs src/**/*.{js,jsx} && node scripts/hookcheck.mjs src/**/*.jsx",
  "test": "vitest run"
}
```

Then move the checkers into `scripts/`, add `vitest`, and port the goals tests
as the first real suite. The money logic is where tests earn their keep and it
is all pure and already testable:

| Module | What to pin down |
|---|---|
| `lib/goals.js` | 50 tests exist — port them verbatim |
| `utils/creditCycle.js` | cycle boundaries, statement-paid detection, §1.1 |
| `utils/installments.js` | the "next statement counted every future installment" bug |
| `utils/scheduled.js` | the cutoff that keeps future rows out of "spent" |
| `utils/recurring.js` | next-occurrence across month ends and February |
| `lib/accountBrands.js` | `aaSafeStops` still clears 4.5:1 through the overlays |

### 1.3 Deleting an account with history is a dead end

[Accounts.jsx](src/pages/Accounts.jsx) blocks deletion when transactions
reference the account and offers no way forward. Since accounts are keyed by
**name** everywhere (transactions, balances, `parentName`, and now goal links),
the fix is a reassign step: "move 47 transactions to … then delete". The rename
cascade already does exactly this work — it just isn't reachable from delete.

Add **archiving** alongside it. A closed account still has to keep its history
but should not clutter pickers or the card stack.

### 1.4 Renames cascade in application code, not in the database

The cascade lives in one `db.transaction` in the account form. Goals now join
it, and that is three call sites and counting. Every new table that references
an account name is a chance to forget one — a goal pointing at a renamed
account would silently read ₱0, which looks like a real number.

Either centralise it as `renameAccount(oldName, newName)` in `db/txHelpers.js`,
or move to account **ids** with names as display-only. The second is correct but
touches the sync conflict keys (`user_id,name`) and is a migration; the first is
an afternoon and removes the whole class of bug.

---

## 2. Accessibility — one systemic issue, one real gap

### 2.1 The muted-text pair fails contrast, in 235 places

`text-slate-400 dark:text-slate-500` appears **235 times** in `src/`. Measured:

| Pair | Ratio | Verdict |
|---|---|---|
| `slate-400` on white | **2.56:1** | fails AA *and* AA-large |
| `slate-400` on `slate-50` | **2.45:1** | fails both |
| `slate-500` on `#0d1117` | **3.98:1** | large text only |
| `slate-500` on white | 4.76:1 | passes |
| `slate-400` on `#0d1117` | 7.38:1 | passes |

The light-mode half is the problem, and it is on captions, dates, account
subtitles and hints — the small text where it matters most. Note the pair is
**backwards**: `slate-400` is the safe choice in dark mode and the failing one
in light.

Swap to `text-slate-500 dark:text-slate-400` and it passes in both. Do it as
one mechanical pass with a `--dry-run` diff first; a handful of instances sit on
coloured or overlaid backgrounds and need the composite measured, not the bare
pair. (Every card gradient in
[accountBrands.js](src/lib/accountBrands.js) is already solved *through* its
overlay stack — same discipline applies here.)

### 2.2 Toasts are silent to screen readers

`aria-live` does not appear anywhere in `src/`. Every confirmation the app gives
— "Goal created", "Account updated", "Failed to save" — is invisible to assistive
tech. One attribute on the toast container in
[ToastContext.jsx](src/context/ToastContext.jsx) fixes all of them:
`role="status" aria-live="polite"`, and `aria-live="assertive"` for errors.

### 2.3 Smaller, verified

- **White on `--color-primary` is 2.85:1.** It is your brand blue and I left it
  alone deliberately, but it fails on the primary button, which is the most
  important control in the app. Darkening the button's blue ~15% while keeping
  the brand colour for accents would clear 4.5:1 without changing the identity.
- **`prefers-reduced-motion` covers three things and misses the rest.** There
  are exactly three blocks in [index.css](src/index.css): the wallet tab, the
  wallet fold, and the account cards. Not covered: the count-up on the net-worth
  figure (a number visibly ticking), every sheet slide-up, and every progress-bar
  width transition — including the new goal bars. The count-up is the one that
  matters; it is motion carrying information, so it needs a static fallback
  rather than a faster animation.

---

## 3. Performance

### 3.1 `@react-pdf/renderer` is 1.43 MB

```
1428K  react-pdf.browser-*.js      ← the monthly PDF report
 332K  CartesianChart-*.js         ← recharts
 204K  vendor-supabase-*.js
 192K  index-*.js
 164K  vendor-react-*.js
```

It is already a separate chunk, so it does not block first paint — but it *is*
in the service worker precache (55 entries, 1.9 MB), so every install pays for
it whether or not a report is ever generated. Exclude it from the precache
globs in the PWA config and let it load on demand; a report is a deliberate act
and can afford a spinner.

`/budget` no longer imports recharts. `Insights` and `AccountDetail` still do —
`AccountDetail`'s use is one bare 30-day line, which is perhaps 40 lines of
hand-rolled SVG. Dropping recharts there would take the chart off the account
page's critical path entirely.

### 3.2 Everything reads the whole table

Every surface does `db.transactions.toArray()` and filters in JavaScript. Fine
today, and it will stay fine for a year or two of personal use. When it stops
being fine the fix is `where('date').between(...)` — the `date` index already
exists. **Not worth doing until it hurts**; noted so it is not a surprise.

---

## 4. UI/UX tweaks

Small, cheap, and each one removes a real papercut.

1. **Empty states that do the next thing.** Several read "No upcoming
   payments" and stop. Every empty state should carry the action that fills it
   — the new goals page does this ("Add your first goal"); make it the standard.

2. **Undo instead of confirm.** Deletes currently open a confirm step. A toast
   with UNDO is faster and safer: it does not interrupt the common case, and it
   covers accidents the confirm dialog never sees.

3. ~~**The amount keypad should be everywhere money is entered.**~~ *Done, the
   other way round.* This asked for `NumericKeypad` to spread; the call went to
   the plain `inputMode="decimal"` field instead, because that is what Add
   Expense, Add Inflow, Transfer and every sheet already used - the keypad was
   one screen out of many. A custom pad also cannot do what a real input does
   for free: caret, select-all, paste, hardware keyboard on the desktop build,
   dictation. The component is deleted; there is one way to type an amount.

4. **Pull-to-refresh has no result.** The "↓ Pull to sync" affordance appears
   even when signed out, where syncing is impossible. Hide it, or say what it
   would do.

5. **Relative dates past "Yesterday".** `fmtDate` handles today and yesterday
   then falls back to "Sep 8". "3 days ago" reads better up to about a week.

6. **Tapping a figure should explain it.** "Using 65% of spending budget" and
   the new "28%" goals tile are both derived from several inputs. A long-press
   or an ⓘ that shows the arithmetic builds more trust than any amount of
   polish — this is the same reasoning behind "Where it comes from" on /goals.

7. **The three planner tiles are 111 px tall** for an icon, a word and a
   figure. Slightly generous; worth revisiting once there is real data in all
   three.

---

## 5. Feature additions

Ordered by value for how this app is actually used. The comparisons are to what
YNAB, Monarch, Copilot, Actual and Lunch Money do, and where they do it *badly*
I have said so rather than copying.

### 5.1 Budget rollover — the biggest single gap

`rollover` and `carryover` appear nowhere in `src/`. Every budget is a fresh
monthly limit, so underspending in September buys nothing in October and one
bad month is permanently "over".

This is the mechanic YNAB is built on and the one people miss most. Per
category: **reset monthly** (today's behaviour), **roll the surplus forward**,
or **roll the deficit forward too** (harsher, and honest). It needs a stored
per-category-per-month record rather than the single `budget` field, so it is
the largest item here — and still the one I would do first.

### 5.2 Goals, next steps

The waterfall is deliberately minimal. In rough order:

- **"Start from today."** Right now a ₱90,000 goal on an account already
  holding ₱120,000 is instantly complete — correct for a bucket model, and
  occasionally not what you meant. An optional `baseline` (the balance to
  ignore) would express "save ₱90,000 *more*". I left it out because it
  reintroduces a typed-in number, which is exactly what you asked to avoid;
  worth adding only if the current behaviour actually annoys you.
- **Contribution history.** A goal knows its balance now but not that it was
  ₱20,000 last month. Sampling monthly totals into a small table would give a
  real trend line and a projected completion date from *observed* saving rather
  than from arithmetic on the target date.
- **Milestones.** 25/50/75/100% with a toast. Cheap, and the only genuinely
  motivating thing in most savings apps.
- **Goal-aware transfers.** "Move ₱5,000 to Emergency Fund" could preselect the
  funding account on the transfer screen.
- **Round-up saving.** Every expense rounds to the next ₱100 and the difference
  transfers to your top-ranked goal. Very popular; needs a real transfer, not a
  derived figure, so it is a change in kind rather than degree.

### 5.3 A net-worth history

Every balance is a current value; nothing is retained. A monthly snapshot table
written on the first launch of each month would give the one chart that answers
"am I actually getting ahead" — and it is the chart every one of the apps above
leads with. Cheap to add, impossible to backfill, which argues for adding it
**now** so the history starts accumulating.

### 5.4 Bills, properly

`recurring` holds a schedule and requires a manual "Post now" — no auto-post
exists (`autoPost` appears nowhere). That is the right default for a country
where cash still moves by hand, but:

- **Overdue is currently just a red date.** It should be a count you can act on.
- **Auto-post for the certain ones** (Netflix, Spotify) with an undo window.
- **Post from a notification.** The service worker is already registered.

### 5.5 Insights that say something

The Insights page shows what happened. What people want is what it *means*:
- "Food is up 32% on your 3-month average"
- "This is the fourth month running that Shopping went over"
- "Your spending is ₱1,200/day; the month has 20 days left and ₱5,250 in it"

All computable from data already stored, no new schema.

### 5.6 Shared or multi-currency

`currency` exists on every account and a `currency` meta key exists, but
`en-PH` is hardcoded in **30 files** — a near-identical `fmt`/`fmtCompact` pair
copy-pasted into almost every page and sheet. So the field promises support that
does not exist, and adding it later means editing thirty files.

Worth doing the cheap half now regardless of multi-currency: **one shared
formatter module.** Thirty copies of the same eight-line function is thirty
chances for two screens to format the same amount differently, which is the
kind of inconsistency people notice in a money app. Extracting it is mechanical
and makes §5.6 a small change instead of a large one.

---

## 6. Deliberately not doing

Saying no is part of a plan:

- **Bank sync / open banking.** No usable aggregator for PH consumer accounts,
  and offline-first is the app's actual advantage.
- **Splitting bills with people.** `debts` covers the informal case, which is
  what actually happens.
- **Investment tracking.** A savings-and-spending app that also does portfolios
  does neither well.
- **A web/desktop rewrite.** `src/web/**` already covers desktop. Per the
  existing constraint, mobile files gain exports and CSS hooks only.

---

## 7. If you only do three things

1. **§1.2 — a test runner and the three checkers in `scripts/`.** Everything
   else on this list is safer afterwards, and the checkers have already caught
   seven crashes that the build did not.
2. **§1.1 — the credit due date.** It is the one figure on the screen that can
   cost real money by being wrong.
3. **§2.1 — the contrast pass.** 235 instances, one mechanical swap, and the
   small text in light mode goes from 2.56:1 to passing.

Then §5.1 (rollover) as the first proper feature.
