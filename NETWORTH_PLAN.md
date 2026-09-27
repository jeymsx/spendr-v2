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
- [ ] `lib/flows.js`: `isAdjustment`, `isSpend`, `isIncome`, plus tests. Switch every income/spending total to it.
- [ ] `lib/accountMeta.js`: new types `investment` and `loan`, new roles `invested` and `loan`,
  and the helpers `bucketOf`, `isLiquid`, `isInvestment`, `isLoan`, `isSpendable`.
  Replace the "not credit means asset" checks where they matter.
- [ ] `lib/netWorth.js`: `netWorthBreakdown()`, one source for Dashboard, useFinanceSummary,
  the Accounts list, Insights, recap and the PDF. Keep `netWorthNow`'s signature.
- [ ] Fix: editing a transaction re-stamps `baseAmount` (txHelpers `updateTransaction` and TxDetailSheet's inline edit).
- [ ] Sync mappers and OPTIONAL_COLS for the new fields.

### Phase 1 — net worth counts everything
- [ ] Debts in net worth (the toggle, Preferences › Behaviour, meta `netWorthDebts`).
  - History: settlement rows are neutral, and debts are opened at `createdAt`.
- [ ] Balance correction rows carry `adjust: 'correction'` (AccountForm).
- [ ] Home wallet breakdown shows only the tiles that apply; the Accounts list gets new groups.
- [ ] Rewrite the NetWorthPage footnote.

### Phase 2 — forecast (+ rename Bills → Recurring)
- [ ] `utils/recurring.js`: `semimonthly`; `advanceNextDate` snaps to the 15th and month end.
- [ ] Recurring `type` inflow:
  - RecurringForm gets a Bill/Income switch and inflow categories.
  - `postRecurringCharge` writes an inflow for income.
  - The Recurring page gets an Income section and correct signs.
  - Notifications/reminders stay bills-only.
- [ ] Rename the visible "Bills" labels to "Recurring" (QuickActions, page titles, form titles).
- [ ] `lib/forecast.js`, a pure `buildForecast()`, plus tests.
  - It starts from net liquid (liquid − card owed now).
  - Events: recurring bills and income (overdue bills land today); loan payments; debts you owe with a due date.
  - Card dues are listed, flagged `counted:false`.
  - Everyday spending = median weekly spend over the last 12 weeks ÷ 7. It leaves out bill posts,
    installments, adjustments and settlements.
  - Output: days, events, lowest, firstBelowFloor, firstNegative, safeToSpend (until the next payday, else 14 days).
- [ ] Home: UpcomingSection becomes "Safe to spend" plus the next 3 items. Empty state asks for a payday.
- [ ] Insights: a forecast card, and the `/insights/forecast` page with its own range (1M/3M/6M in the period store).
  - The page has a chart (floor line, today, lowest dot), the tightest-day sentence and day cards. The floor is edited here only.
- [ ] Notifications: below-floor and run-out warnings that clear themselves.

### Phase 3 — investments
- [ ] New-account flow: type Investment, a kind chip (UITF/fund, MP2/Pag-IBIG, Stocks, Insurance/VUL, Time deposit, Property, Other), value now, paid in so far.
- [ ] The opening value is written as a value row (history steps on the creation date).
- [ ] AccountDetail variant:
  - Worth, "as of", an Old value chip after 45 days, Paid in and gain.
  - Buttons Update value and Add money.
  - No goals, no card UI.
- [ ] UpdateValueSheet (ui/Sheet): new total plus date, writing a value row.
- [ ] Kept out of expense/inflow/recurring pickers, goals, liquid badges, spendable and the forecast.
- [ ] Stale-value notification.

### Phase 4 — loans
- [ ] New-account flow: type Loan, then amount owed, monthly payment, due day, and months left or rate.
- [ ] AccountDetail variant: Owed, paid/left bar, paid-off-by, a next-payment card with Pay.
- [ ] LoanPaySheet: from account, amount, date, a split preview; writes the transfer and the interest expense.
- [ ] Loan dues in the forecast and the notifications.

### Finish
- [ ] `src/supabase/migrations/023_net_worth_forecast.sql`.
- [ ] Changelog entry (lib/changelog.js). Version bump? Leave that to the user; don't push.
- [ ] Full QA pass: `npm run check`, `npm run lint`, `npm test`, `npm run build`.
  - Browser QA on port 5190: long names, small phone, light/dark, reduced motion, empty states.
- [ ] Independent review agents (math, UI consistency). Fix what they find.
- [ ] Write the morning report (at the bottom of this file) with what to look at on localhost.

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
