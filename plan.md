# Spendr — what to build next

Rewritten 2026-09-11, after a full pass over the codebase. Every number here
was measured rather than estimated; where something is a judgement call it says
so.

## Where the project actually is

|  |  |
| --- | --- |
| Code | 28,437 lines across 116 files |
| Comments | 4,283 lines (13% of non-blank — reasoning, not noise) |
| Screens | 21 routes, plus 15 sheets |
| Data | 15 Dexie tables, 5 Supabase migrations |
| Dependencies | 15 runtime, 12 dev |
| Tests | 48, all on pure logic |

**Grade: product-grade, pre-operational.**

The craft is above the average enterprise codebase — offline-first with a real
sync layer, two complete UIs sharing one set of logic, contrast solved by
measurement rather than taste, and comments that explain *why*. That is not
"medium build" work.

What is missing is not polish, it is the **safety net**. Enterprise-grade is
mostly about what happens when you are not looking, and right now: nothing runs
the tests on push, nothing blocks a bad merge, nothing tells you a deploy broke,
and nothing catches a type error before a user does. Five data shapes changed in
one evening and every one had to be verified by hand.

Six things would close that gap, roughly in order of value per hour:

1. **CI** — `npm run check && npm run lint && npm test && npm run build` on push.
   Half an hour. Without it every other item on this list decays.
2. **RLS on the two unprotected tables** (below). Security, one file.
3. **Error monitoring** — a crash in production is currently invisible.
4. **TypeScript**, incrementally via JSDoc + `checkJs` on `src/lib` and `src/db`
   first. That is where the sync shapes live, and where a wrong shape is silent.
5. **Split the two big files.** `Settings.jsx` is 3,240 code lines and
   `Accounts.jsx` 2,022. Both would fail any review on size alone.
6. **A component-test layer.** 48 tests over ~28k lines is about 1%. The pure
   logic is covered; nothing renders.

---

## 1. Security and correctness — do these first

### RLS is missing on `templates` and `user_preferences`

Both are created in `003_schema.sql` with no `enable row level security` and no
policy anywhere, and both sync: `pushTable('templates', …)` at sync.js:433,
`pullSimpleTable` at :550. Every other synced table has a policy —
transactions, accounts, categories, debts and recurring in `001_init.sql`, goals
in `004_goals.sql`.

The anon key ships in the client. With open signups, any account can read and
write every user's templates, which hold descriptions, amounts, categories and
accounts. One migration fixes it; write it before inviting a second user.

### Two migrations are still unapplied

`004_goals.sql` and `005_account_design.sql`. Until they run, goals do not sync
and card designs fall back via the drop-and-retry path in `optionalSync`.

### Demo rows must go before signing in on localhost

8 seeded rows — 5 debts, 3 goals — tagged `demoSeed`. `pushTable` pushes all
local rows unconditionally, so signing in merges fictional people into real
cloud data. Undo blocks are in `seed-debts-demo.js` and `seed-goals-demo.js`.

### Sync may break on rename

`accounts` and `categories` declare `unique (user_id, local_id)` but the push
uses a `user_id,name` conflict target. Renaming a row locally then syncing is
the untested path; worth a deliberate test before it matters.

### The credit-card due-date bug

Still open, still noted, still unfixed from the previous plan.

---

## 2. Accessibility — measured, not guessed

A DOM probe now walks all 17 routes in light mode, resolves each element's
composited background up the ancestor chain, and applies real WCAG thresholds.
It lives in the session scratchpad and is worth moving into `scripts/`.

### The one that matters: white text on filled buttons

Measured, white on the raw accent, against the 4.5:1 that 14–15px bold needs:

| accent | ratio | verdict |
| --- | --- | --- |
| Cosmos | 4.26:1 | marginal |
| Blush | 3.00:1 | fails |
| Azure (default) | 2.85:1 | fails |
| Ember | 2.78:1 | fails |
| Lagoon | 2.13:1 | fails |
| Sage | 2.01:1 | fails |
| Amber | 1.78:1 | fails |
| **Honey** | **1.61:1** | barely legible |

This is **every filled button in the app** — Continue, Save Changes, Review
Expense, the FAB — in both themes, since the fill does not change with theme.

The fix is a second token, `--color-primary-strong`, used for filled surfaces
only, derived per accent. The amount each needs to darken to clear 4.5:1 is
already solved:

```text
Azure  keep 77% → #237AC5      Lagoon keep 67% → #158665
Cosmos keep 97% → #805BEF      Amber  keep 61% → #9C6D2B
Blush  keep 80% → #BF5177      Ember  keep 77% → #C35252
Sage   keep 65% → #358642      Honey  keep 58% → #93720F
```

Deliberately not applied yet: it changes the app's signature colour and wants a
decision, not a late-night commit. Note that Honey and Amber become visibly
duller — which is the honest cost of legible white text on them, and an argument
for either dark text on those two, or dropping them.

### Already fixed

Debt avatar initials (all ten palette colours failed, 2.15–4.47:1), "Record a
payment", the budget limit chip, the currency chip, and the budgets "spent"
line. Two new utilities — `.accent-ink` and `.tone-ink` — generalise what
`.budget-tone-ok` was doing for one page.

### Remaining, lower priority

- The **navbar's active tab icon** is 2.85:1 against 3:1 in light mode.
  Marginal, and it is the app's signature. Worth revisiting with the button
  colour, since both are the same root cause.
- The **`text-slate-400 dark:text-slate-500` pair** is backwards for light
  mode and appears roughly 235 times. slate-400 on white is 2.56:1; slate-500
  works in both themes. A find-and-replace, but a big diff.
- The **accent picker's 6–7px preview text** measures ~4.1:1. It is a
  thumbnail of a screen and is `aria-hidden`, so it is decorative — noted so
  nobody "fixes" it.

### Untested

No screen reader pass. No keyboard-only pass — and the app is touch-first, so
tab order has never been exercised. Reduced-motion is honoured in three places
and ignored elsewhere.

---

## 3. Modal or page? — a rule, and where the app breaks it

The app has 21 routes and 15 sheets, and until tonight the split was accidental.
A rule that holds up:

**A sheet is for one decision you can finish in a few seconds without losing
your place.** Pick a thing, confirm a thing, or nudge one value. It keeps the
context behind it visible, and that visibility is the point.

**A page is for a task with more than one step, its own scroll, or its own
sub-state** — and for anything you might want to link to or come back to.

Two corollaries worth stating because both were violated:

- **A sheet must never open another sheet.** That was the reason Categories and
  Monthly Budgets became pages. A sheet over a sheet has no clear way back and
  no clear owner of the backdrop.
- **A sheet is not a place to keep pending state.** Budgets held unsaved edits
  behind a "Discard/Done" header, which is a page's job.

### Where it stands now

|  | shape | verdict |
| --- | --- | --- |
| Category / account / template pickers | sheet | correct — one decision, context matters |
| Overdraw, duplicate, template confirm | sheet | correct — a question, then gone |
| Add expense / inflow / transfer | page | correct — multi-field, own scroll |
| Categories, Monthly Budgets, Accent | page | fixed tonight |
| Bills, Debts, Goals, and each bill | page | correct |
| **Category form** | sheet over a page | correct now |
| **Profile, Sheets config, Restore, Reset** | sheet | **wrong** — see below |
| **Templates manager** | sheet | **wrong** — a list you manage |
| **`TxDetailSheet`** | sheet | **borderline** — see below |

### What to change

**Promote to pages:** Templates manager (a list with CRUD — same argument as
Categories), Restore Backup and Reset App (multi-step, destructive, and a
"where am I" moment matters), and Sheets config (a form with credentials).
Profile can stay a sheet: it is two fields.

**`TxDetailSheet` is the interesting one.** It is a detail *and* an editor, and
at 800 lines it is the app's most complex sheet. It works, and the
detail-and-edit-are-the-same-layout idea is genuinely good. But a transaction is
a thing you might want to link to, and the sheet cannot be. Proposal:
`/transactions/:id` as a page, keeping the same rows, with the sheet retained
for the quick-look case from the Recent list. Not urgent; it is the best-built
sheet in the app.

**The desktop layer keeps its modals.** A two-pane layout has room to show
context beside a modal, which is exactly when a modal is right. This is why
`CategoryManager` and `BudgetManager` take a variant rather than being
converted outright.

---

## 4. Copy — where it reads as machine-written

The tell is not length, it is **explaining rather than labelling**. Apple names
things and trusts the interface; the pattern to avoid is a sentence that teaches
you a concept you did not ask about.

Measured — the longest user-facing strings in the app:

| chars | where |  |
| --- | --- | --- |
| 166 | Goals empty state | "Name what you are saving for, set the amount, and point it at the account holding the money. Progress comes from the real balance…" |
| 124 | Goals delete confirm | "The goal goes; your money does not move. Nothing was ever taken out…" |
| 122 | Reset confirm | "This will permanently delete all transactions, accounts, categories…" |
| 105 | AccountNew credit hint | "A credit card's balance comes from its charges, so it starts at zero…" |
| 97 | Budget empty state | "Give a category a monthly limit and this page starts tracking it…" |

Two of these are **fine and should stay**: the reset confirm and the goal-delete
confirm. A destructive action must say exactly what it destroys — that is not
verbosity, it is consent.

The rest are the pattern to cut. Goals' empty state teaches the whole feature
before you have used it. Apple would write **"No goals yet"** and a button, and
let the first goal teach the feature.

### Rules to hold

- **Empty state:** a short title, at most one short line, and a button that does
  the next thing. If the title and the button are enough, drop the line.
- **Never explain the model.** "Progress comes from the real balance" is
  documentation. Cut it, or move it behind an info affordance.
- **Buttons are verbs, and specific.** "Add account", not "Continue" where
  "Continue" could mean anything.
- **No em-dash asides in UI copy.** They read as written-by-committee. Fine in
  code comments, wrong on a button's helper text.
- **Sentence case everywhere.** Mostly done; the sheets are the holdout.
- **Trust the number.** "₱3,400 remaining · 77% used" needs no sentence around
  it.

### Empty states that do the next thing

Agreed and partly done. Bills, Debts and Goals now offer the action. Still to
do: **Transactions** with an active filter (offer "Clear filters", not just "No
transactions"), **Insights** with no data for the month (offer the previous
month rather than an empty chart), and **Accounts** when only Cash exists
(offer the institution picker).

---

## 5. UI polish worth doing

- **`AddActionSheet`** is the last flush-bottom slab among the primary flows.
  Bring it onto the floating-glass treatment the filter and transaction sheets
  use.
- **Skeletons.** Dashboard has one; Insights, Accounts and Transactions flash
  empty then populate. Reserve the height.
- **Toast placement.** `bottom-28` clears the navbar but collides with the
  floating sheets. Should sit above whatever is topmost.
- **The `+ Limit` chip** on Budgets is the only place a control looks like a
  label. Make it read as tappable.
- **Insights bullet glyphs** stay emoji, deliberately — twelve distinct marks
  for twelve editorial remarks is the one place emoji beat a monochrome set.
- **Goal icons** are still user-set emoji and the only remaining emoji in
  identity data. Unlike categories there is no name→icon map to derive from,
  because goal names are freeform, so this one genuinely needs a picker.

---

## 6. Features, in rough order of value

1. **Quick log** — hold the FAB, type "150 jollibee", land on a pre-filled
   expense. In progress on `feat/quick-log`; see that branch's notes for the
   parser-versus-model reasoning.
2. **Budget rollover** — unspent budget carrying to next month is the single
   most-requested feature in every budgeting app and Spendr has no answer.
3. **Search that spans everything**, not just transactions.
4. **Scheduled/future transactions as first-class**, rather than the
   `scheduledCutoff` special case threaded through three files.
5. **Multi-currency**, properly. `currency` exists on accounts and nothing
   converts.
6. **Shared/household accounts.** The RLS work above is the prerequisite.

---

## 7. Retired from the previous plan

- ~~The amount keypad should be everywhere~~ — resolved the other way. Every
  money field is the system keyboard now; `NumericKeypad` is deleted.
- ~~Move the AST checkers into `scripts/`~~ — done, behind `npm run check`,
  with Vite told to ignore the directory.
- ~~No test runner~~ — Vitest, 48 tests, `npm test`.
- ~~No linter~~ — ESLint 10 flat config, `npm run lint`. Its most useful
  result was negative: `no-undef` and `rules-of-hooks` both report zero, which
  is the checkers having done their job. The 134 findings are the React-19 rule
  set and are warnings, with the reasoning recorded in the config.
- ~~Pull-to-refresh has no result~~ — done. It now says "Sync needs an account"
  and offers Settings.

## Known lint backlog

134 warnings, none of them a crash: 45 `react-refresh/only-export-components`
(mostly `icons.jsx`, by design), 35 `no-unused-vars`, 28
`react-hooks/set-state-in-effect`, 14 `exhaustive-deps`, and 9 others. Two are
false positives on inspection. The one worth fixing first is
`AccountDetail.jsx:416` — a ref written during render. Idempotent today, but it
is the kind of thing that breaks under concurrent rendering.
