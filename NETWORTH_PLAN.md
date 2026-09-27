# Net worth, forecast, investments, loans — build plan and log

Branch `feat/net-worth-forecast`, worktree `C:/Users/JamesSablay/AppData/Local/Temp/spendr-networth`.
Started 2026-09-28 while the user sleeps. Their instructions, verbatim in spirit:

- Implement **every phase**, on a separate branch. Check everything, fix bugs.
- Act as senior engineer + QA + UI/UX designer; keep it consistent with the app; reuse components.
- **Don't touch the desktop app** (`src/web/**`). Shared lib/hooks may change semantics, but no edits under `src/web/`.
- **Rename "Bills" to "Recurring"** (the page and its entry points).
- **No crypto.** Investments are **value-only**, typed by hand, as in Latr's `lib/holdings.ts`.
- **Debts count toward net worth, behind a toggle** in Preferences › Behaviour.
- The forecast is ported from Latr (`../finance-simulator`, `lib/finance.ts` buildProjection), trimmed.
- UX must stay simple: no new tabs, reuse existing screens, and hide what isn't used.
- **Write the SQL migration afterwards:** `src/supabase/migrations/023_…sql`. 022 is taken by trash.

## Key design decision (read this first after a context compression)

**No new transaction types.** Everything is composed from expense/inflow/transfer, the same way
refunds already are (see `lib/txMoney.js` header):

- **Balance corrections and investment value updates** are inflow/expense rows carrying
  `adjust: 'correction' | 'value'`. `lib/flows.js` `isSpend`/`isIncome` leave them out of every
  income/spending total. Legacy rows are matched by the description 'Balance adjustment'.
  - They still move balances, net worth history, trends and sync with no new plumbing, because they
    are ordinary rows.
- **Contributions and withdrawals** (bank ↔ investment) are transfers.
- **Loan payments** are a transfer of the principal into the loan account plus an expense for the
  interest (category "Loan interest"), written together in one Dexie transaction.
- **Loan accounts store a negative balance.** The UI shows the amount owed as positive. Loans reuse
  the existing credit columns:
  - `minimumPayment` is the monthly payment;
  - `dueDate` is the due day;
  - `interestRate` is the monthly %, worked out from the months left when the user leaves it blank.
- **Investment accounts get `kind` and `investedStart`**; these need new account columns.
  - "Paid in" = `investedStart` + transfers in − transfers out. "Worth" = balance.
  - "As of" = the latest value row, falling back to the date of the opening value.
- **Recurring gets `type`** ('inflow' for income; missing means bill) and the frequency
  `semimonthly` (the 15th and the last day of the month).
- **Settings live in `db.meta`:** `netWorthDebts` (default true) and `forecastFloor` (default 0).
- **Dexie needs no schema bump**: the new fields are unindexed. Supabase needs migration 023, adding
  `transactions.adjust`, `accounts.kind`, `accounts.invested_start`, `accounts.valued_at` and `recurring.type`.
- **Value rows** use the category 'Investment' (it already has a chart glyph).
- **Loan interest** goes in the category 'Loan interest', created on first use like Transfer Fee.

## Phases (tick as done; the commit hash goes in the log)

### Phase 0 — groundwork (invisible)
- [x] `lib/flows.js`: `isAdjustment`, `isSpend`, `isIncome`, plus tests. Switch every income/spending total to it.
- [x] `lib/accountMeta.js`: new types `investment` and `loan`, new roles `invested` and `loan`,
  and the helpers `bucketOf`, `isLiquid`, `isInvestment`, `isLoan`, `isSpendable`.
  Replace the "not credit means asset" checks where they matter.
- [x] `lib/netWorth.js`: `netWorthBreakdown()`, one source for Dashboard, useFinanceSummary,
  the Accounts list, Insights, recap and the PDF. Keep `netWorthNow`'s signature.
- [x] Fix: editing a transaction re-stamps `baseAmount` (txHelpers `updateTransaction` and TxDetailSheet's inline edit).
- [x] Sync mappers and OPTIONAL_COLS for the new fields.

### Phase 1 — net worth counts everything
- [x] Debts in net worth (the toggle, Preferences › Behaviour, meta `netWorthDebts`).
  - History: settlement rows are neutral, and debts are opened at `createdAt`.
- [x] Balance correction rows carry `adjust: 'correction'` (AccountForm).
- [x] Home wallet breakdown shows only the tiles that apply; the Accounts list gets new groups.
- [x] Rewrite the NetWorthPage footnote.

### Phase 2 — forecast (+ rename Bills → Recurring)
- [x] `utils/recurring.js`: `semimonthly`; `advanceNextDate` snaps to the 15th and month end.
- [x] Recurring `type` inflow:
  - RecurringForm gets a Bill/Income switch and inflow categories.
  - `postRecurringCharge` writes an inflow for income.
  - The Recurring page gets an Income section and correct signs.
  - Notifications/reminders stay bills-only.
- [x] Rename the visible "Bills" labels to "Recurring" (QuickActions, page titles, form titles).
- [x] `lib/forecast.js`, a pure `buildForecast()`, plus tests.
  - It starts from net liquid (liquid − card owed now).
  - Events: recurring bills and income (overdue bills land today); loan payments; debts you owe with a due date.
  - Card dues are listed, flagged `counted:false`.
  - Everyday spending = median weekly spend over the last 12 weeks ÷ 7. It leaves out bill posts,
    installments, adjustments and settlements.
  - Output: days, events, lowest, firstBelowFloor, firstNegative, safeToSpend (until the next payday, else 14 days).
- [x] Home: UpcomingSection becomes "Safe to spend" plus the next 3 items. Empty state asks for a payday.
- [x] Insights: a forecast card, and the `/insights/forecast` page with its own range (1M/3M/6M in the period store).
  - The page has a chart (floor line, today, lowest dot), the tightest-day sentence and day cards. The floor is edited here only.
- [x] Notifications: below-floor and run-out warnings that clear themselves.

### Phase 3 — investments
- [x] New-account flow: type Investment, a kind chip (UITF/fund, MP2/Pag-IBIG, Stocks, Insurance/VUL, Time deposit, Property, Other), value now, paid in so far.
- [x] The opening value is written as a value row (history steps on the creation date).
- [x] AccountDetail variant:
  - Worth, "as of", an Old value chip after 45 days, Paid in and gain.
  - Buttons Update value and Add money.
  - No goals, no card UI.
- [x] UpdateValueSheet (ui/Sheet): new total plus date, writing a value row.
- [x] Kept out of expense/inflow/recurring pickers, goals, liquid badges, spendable and the forecast.
- [x] Stale-value notification.

### Phase 4 — loans
- [x] New-account flow: type Loan, then amount owed, monthly payment, due day, and months left or rate.
- [x] AccountDetail variant: Owed, paid/left bar, paid-off-by, a next-payment card with Pay.
- [x] LoanPaySheet: from account, amount, date, a split preview; writes the transfer and the interest expense.
- [x] Loan dues in the forecast and the notifications.

### Finish
- [x] `src/supabase/migrations/023_net_worth_forecast.sql`.
- [x] Changelog entry (lib/changelog.js). Version bump? Leave that to the user; don't push.
- [x] Full QA pass: `npm run check`, `npm run lint`, `npm test`, `npm run build`.
  - Browser QA on port 5190: long names, small phone, light/dark, reduced motion, empty states.
- [x] Independent review agents (math, UI consistency). Fix what they find.
- [x] Write the morning report (at the bottom of this file) with what to look at on localhost.

## Rules from memory that apply here
- A green `vite build` proves nothing. `npm run check` runs scopecheck/tdz/imports/hooks. Then open the page and trigger the sheet.
- Use Write/Edit, never bash heredocs, for anything with an escape.
- Lists use the Transactions card pattern: day heading + hairline, one `ui/Card clip` per group, `Divider inset="glyph"`, cat-tile rows.
- Motion: zero-bounce springs, no glows or gradients. Captions short ("vs last week").
- StrictMode double-mounts: effects that flip flags must re-claim them in the effect body.
- Scratch files must stay out of `src/` (Vite reloads). Checker scripts go in `node_modules/.spendr-checkers/`.
- UI primitives live in `src/components/ui`:
  - Button, IconButton, Sheet, Card, Divider, SectionLabel, SectionHeading, StatTrio, EmptyState, MoneyField, AmountInput, Segmented, Switch, RollingNumber, Skeleton*.
  - `className` is for layout only.
- Desktop reuses mobile sheets (AccountFormSheet, RecurringFormSheet...), so changes there show up on desktop too. That's fine as long as desktop doesn't break.
- Switch importers first and delete old exports last (the user's tab is on :5174 against main, not this worktree).

## Log
- **7640099** Phase 0 done:
  - flows.js wired into every total (Insights, Budget, Home, recap, PDF, badges, challenges, achievements, rollover, notifications, reminders).
  - netWorthBreakdown is used by Dashboard, useFinanceSummary, Insights, recap and the PDF.
  - The history sweep handles debts (netWorthMoves / debtsNetAt).
  - loans.js, investments.js and db/accountWrites.js (recordValue, createInvestment, payLoan).
  - AccountForm handles investment/loan create and edit.
  - repriceForEdit fixes the stale baseAmount bug.
  - Sync mappers and OPTIONAL_COLS updated. Accounts gain a third column, `valued_at`.
  - Tests added: flows, netWorth, loans, investments, netWorthMoves, repriceForEdit, and reportData loans/people.
- **d859d8c** Phases 1-4 UI done:
  - Preferences toggle.
  - Home wallet tiles, and Upcoming turned into "Next 30 days" (Safe to spend plus 3 events, via `toUpcomingItem`).
  - Accounts groups and summary.
  - ListCard and Tiles cards for investment and loan.
  - AccountDetail variants: investment hero plus Update value / Add money; loan progress plus Next payment card plus Pay.
  - New sheets: UpdateValueSheet, LoanPaySheet.
  - AccountForm and AccountNew handle investment/loan (kind chips, paid in, loan step with a back-solved rate).
  - PH_HOLDINGS presets (only in AccountNew).
  - RecurringForm Bill/Income switch, and `?type=income` defaults to semimonthly.
  - Recurring page renamed and handles income. RecurringDetail handles income.
  - The QuickActions disc is labelled Recurring.
  - Forecast: lib/forecast.js, useForecast, ForecastPage (/insights/forecast), and the Explore wide tile.
  - Notifications: loan-due, investment-stale, forecast-short/floor. Reminders for loans.
  - Full suite green: 1608 tests. check and lint clean.
- **9f9b119** Browser QA round 1 (Playwright harness in `%TEMP%/pwk/nw-qa.mjs`, dev server :5196):
  - /insights/forecast was never registered in App.jsx, so the page was blank. Fixed.
  - Income form: opens on the next cut-off, "Next payday", the chosen frequency scrolls into view, picked dates snap.
  - "About 25 payments left" for 24 typed (rate rounding). monthsToClear tolerance + rateLabel.
  - Investments can't be grouped under an account. Update value uses the accent colour.
  - Captions shortened after 360px checks. Tests for notifications, reminders, recurring type.
  - Migration 023 written. Three What's New notes appended to 0.9.0 (as 1c9f8cb did).
- Browser flows verified through the UI then the DB: loan pay (−₱9,070 principal, ₱3,780 interest expense,
  BPI −₱12,850), Mark received (inflow + nextDate → Oct 15), balance correction (`adjust: 'correction'`),
  debts toggle (net worth moves by the people figure), floor save (warning + amber line).
- A loan's "Last 30 days" delta was red when the loan went DOWN. TrendDelta now gets isOwed.
- **b81c90f** Three independent reviews (money maths, React/UI, sync/desktop) and their fixes:
  - Sync: the unknown-column retry drops one named column at a time, never the conflict target (it used to drop
    every optional column, which 023's new columns would have triggered on every push).
  - Loans: installments matched one to one (late ≠ next month early; missed = overdue), interest once per
    installment, payoff without a phantom balance, both halves of a payment delete together.
  - Debt history: paid-by-no-row amounts open the debt lower; shared-bill refunds settle; receivables open on the
    purchase date.
  - Safe to spend uses a fixed 45-day payday lookahead (Home and the Forecast page agree).
  - CategoryDetail excludes adjustments; investments deletable; FX on a new investment's opening value;
    desktop-shared fixes (useFinanceSummary, RecurringFormSheet, no investment/loan type on desktop).
  - Gate: check 7/7, lint clean, 1659 tests, build. Browser re-run of every flow plus an overdue-loan ledger.

---

# Morning report (2026-09-28)

Everything in the plan is built, on `feat/net-worth-forecast` (5 commits on top of `1c9f8cb`). Not pushed, not
merged, version not bumped. Desktop (`src/web/**`) untouched.

## Before anything else: run migration 023

`src/supabase/migrations/023_net_worth_forecast.sql` - five nullable columns (`transactions.adjust`,
`accounts.kind / invested_start / valued_at`, `recurring.type`). Additive, re-runnable. **Run it in the Supabase
SQL editor before any device opens this build.** Sync keeps working without it (the retry now drops only the
missing column), but a correction or value row pushed before it runs never gets its `adjust` mark on the server
(harmless: the app also matches those rows by description).

## How to look at it

- The branch lives in this worktree: `C:/Users/JamesSablay/AppData/Local/Temp/spendr-networth`. A dev server
  from it was left running at http://localhost:5196; if it has stopped, `npm run dev -- --port 5190` there.
- Git will not check the branch out in the main repo while this worktree holds it. To use :5174 instead,
  `git worktree remove C:/Users/JamesSablay/AppData/Local/Temp/spendr-networth` first, then check it out.
- Your real data works as is: nothing needs converting. New things only appear once you add them.

## What to try (about 10 minutes)

1. **Settings › Preferences › Count debts in net worth** (on by default). Toggle it and watch Home's net worth.
2. **Accounts › + › Investments filter › Pag-IBIG MP2**: value now, "paid in so far". Then on its page:
   Update value, Add money, the "Old value" mark after 45 days.
3. **Accounts › + › Loans › any loan**: amount owed, monthly payment, due day, months left (the rate is worked
   out). On its page: Make a payment (see the principal / interest split), the progress bar, "Done by".
4. **Recurring** (was Bills): add your salary with the Income switch; "Twice a month" = 15th and month end.
   "Mark received" on its page posts it.
5. **Home › Next 30 days** and **Insights › Next 30 days › Forecast**: Safe to spend, tightest day, the floor
   (tap Floor to set one), every bill/payday/loan payment by day.

## Decisions I made that you may want to revisit

- **No new transaction types.** Corrections and value updates are inflow/expense rows marked `adjust`, left out of
  every income/spending total (`lib/flows.js`). A loan payment is a transfer (principal) + an expense (interest,
  category "Loan interest").
- **Loan rate is monthly %, back-solved from months left** when you leave it blank (lenders quote payment and
  months, not effective rates).
- **Interest is charged once per installment.** A payment matches the oldest open installment if it came after the
  due date before it; extra payments in the same month are all principal.
- **Safe to spend** = lowest point before the next payday (looking up to 45 days), minus the floor; with no payday,
  the next 14 days. Card due dates are listed but not subtracted again (the start figure already takes them off).
- **Archived people still count** in net worth (archiving files a person away; it doesn't forgive the debt).
- Home tile for people is labelled **Debts**, to match the quick action and the Preferences switch.
- What's New: three notes appended to 0.9.0's list (as 1c9f8cb did). When you bump to 0.10.0, move the first five
  into `CHANGELOG` under 0.9.0 so What's New shows only the new three.

## Known limitations (deliberately left)

- **Desktop** was not touched, so: WebAccounts has no Investments/Loans section (desktop no longer offers those
  types when creating an account), WebInsights/WebTransactions filter on raw `type` so value updates count as
  income/spending there, WebRecurring counts income in its bill totals, and WebDashboard's net worth hint still says
  "Assets minus credit owed".
- **Update value has no date field** - it always writes today. `recordValue` supports a date, but a back-dated value
  would currently erase contributions made after that date, so it stays off until that is handled.
- Deleting a value update leaves the account's "Updated …" date where it was.
- A loan Spendr has never seen a payment for is never shown as overdue (it can't know what was paid before).
- The import wizard's balance recalculation restarts accounts not in the CSV from zero - a loan's opening balance
  included (pre-existing behaviour, now more visible).
- With no exchange rate, a foreign-currency recurring amount is counted at face value in the forecast.
- Forecast warnings, once recorded as notifications, stay in the list for 90 days even after the shortfall is gone.
- Latr (the other repo) still reads investments as liquid money via its own sheets; untouched.

## Files worth reading first

`lib/flows.js`, `lib/netWorth.js`, `lib/forecast.js`, `lib/loans.js`, `lib/investments.js`, `db/accountWrites.js`,
`pages/insights/ForecastPage.jsx`, `pages/AccountDetail.jsx` (the investment and loan variants).
