# Spendr v2

A personal finance tracker PWA built for mobile-first use. Designed for Filipino users (PHP as default currency) but supports USD, SGD, and EUR. All data is stored locally in IndexedDB (Dexie.js) and optionally synced to Supabase for cross-device access.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite |
| Styling | Tailwind CSS v4 |
| Local DB | Dexie.js (IndexedDB) |
| Backend / Auth | Supabase (Postgres + Auth) |
| Charts | Recharts |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Routing | React Router v6 |
| PDF Reports | Custom (reportData.js) |
| CSV Parse | PapaParse |

The app works fully offline. Supabase sync is optional and additive — it runs push-then-pull on demand or on login.

---

## Architecture

### Data Flow
- All reads/writes go directly to **Dexie (IndexedDB)** — never to Supabase directly from components.
- `useLiveQuery` (custom wrapper around Dexie's liveQuery) makes all queries reactive.
- Supabase sync (`src/lib/sync.js`) runs separately: push local state up, then pull remote state down. Push always runs before pull to avoid remote overwriting fresh local changes.
- The `meta` table in Dexie stores key-value app settings (`displayName`, `currency`, `skipConfirm`, `lastSync`, etc.).

### Sync Strategy
- **Transactions**: Only unsynced records (falsy `synced` field) are pushed. Deletions are tracked via a `deletedTxIds` tombstone in the `meta` table.
- **Accounts / Categories / Debts / Recurring / Templates**: Full push every sync (small datasets).
- **Preferences**: Pushed as a single `user_preferences` row upserted by `user_id`.
- Conflict key for accounts: `user_id, name`. For categories: `user_id, name, type`.

### Database Schema (Dexie — current version 7)

| Table | Key Fields |
|---|---|
| `transactions` | `++id, txId, type, date, description, category, account, fromAccount, toAccount, amount, synced` |
| `accounts` | `++id, name, type, role, balance, currency, creditLimit, statementDate, dueDate, cutoffDate, minimumPayment, color, parentName, sort_order` |
| `categories` | `++id, name, icon, color, type, budget, sort_order` |
| `debts` | `++id, name, contact, amount, amountPaid, dueDate, type, notes, createdAt` |
| `recurring` | `++id, name, amount, category, account, frequency, nextDate, active` |
| `templates` | `++id, name, type, amount, description, category, account, fromAccount, toAccount, createdAt` |
| `meta` | `key` (key-value store) |

### Supabase Tables
- `transactions` — mirrors Dexie transactions
- `accounts` — includes `parent_name`, `sort_order`, `qr_image`
- `categories` — includes `sort_order`
- `debts`
- `recurring`
- `templates`
- `user_preferences` — `display_name`, `currency`, `accent_color`, `skip_confirm`

> **Required migrations (run in Supabase SQL editor):**
> ```sql
> ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_name TEXT;
> ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
> ```

---

## Pages & Features

### Onboarding (`/onboarding`)
Multi-step setup shown only on first launch:
1. **Welcome** — logo + sign-in or continue as guest
2. **Display name** — stored in `meta.displayName`
3. **Currency** — PHP (default), USD, SGD, EUR
4. **Accounts** — pick from Philippine presets (GCash, Maya, BPI, BDO, UnionBank, etc.) grouped by type, or add a custom account
5. **Categories** — pick expense and inflow categories from presets or create custom ones

After onboarding, `meta.onboarded = true` is set and the user is redirected to the dashboard. On sign-in, a full sync runs immediately.

---

### Dashboard (`/`)
The home screen. Shows:

- **Greeting** — time-aware ("Good morning/afternoon/evening, [name]") with a context hint line that cycles through: over-budget warnings → near-budget warnings → bills due today → today's spend → day-of-week fallback
- **Balance cards** — horizontal scroll row showing each top-level account (parent accounts show combined child balance; child accounts are excluded from this row). Credit accounts show available credit. Tapping a card opens that account's detail sheet.
- **Spending vs. Income bar** — current month totals, side by side
- **Recent transactions** — last 5, tappable to open detail sheet
- **Quick templates** — one-tap buttons for saved transaction templates

Balance cards use an animated count-up on first load.

---

### Transactions (`/transactions`)
Full transaction history with:

- **Search** — filters by description or category name
- **Filter sheet** — filter by: transaction type (All / Expense / Inflow / Transfer), date range (All time / This week / This month / Last month / Custom date range), account, category. Duplicate category names (e.g. "Others" exists for both expense and inflow) are deduplicated in the filter UI.
- **Grouped list** — transactions grouped by date, showing relative dates ("Today", "Yesterday", then "MMM D")
- **Infinite scroll** — loads 30 at a time, more on scroll
- **Transaction detail sheet** — tap any row to see full details, edit, or delete
- **Edit** — opens pre-filled Add Expense / Add Inflow / Transfer form

---

### Add Expense / Add Inflow (`/add-expense`, `/add-inflow`)
Bottom sheet form:
- Custom numeric keypad (no system keyboard)
- Account picker sheet (shows balance or available credit per account)
- Category picker sheet (emoji icon + color)
- Description text field
- Date picker (defaults to today)
- Optional confirmation step (shows a review card before saving) — can be skipped via the "Skip Confirmation" preference
- Low balance warning toast if account balance would go negative

Saving calls `applyBalanceEffect()` which updates account balances and propagates to parent accounts.

---

### Transfer (`/transfer`)
Transfers between two accounts:
- From account + To account pickers (same account excluded from both)
- Same numeric keypad, date, and optional confirmation step
- Creates a `transfer` type transaction; both account balances update atomically

---

### Accounts (`/accounts`)
Account management page:

#### Account Types
- **Cash** — physical cash
- **E-Wallet** — GCash, Maya, etc.
- **Bank** — BPI, BDO, UnionBank, etc.
- **Credit** — credit cards (tracks available credit via billing cycle)
- **Savings** — savings accounts

#### Account Grouping (Sub-accounts)
Accounts support one level of parent-child hierarchy:
- A **parent account** (e.g. "Maya") groups sub-accounts (e.g. "Maya Wallet", "Maya Savings")
- The parent shows a combined balance on the accounts list (sum of own + children balances)
- Children show a "Part of [Parent]" badge in their detail sheet
- Creating a child: set `parentName` in the account form; the parent picker only shows non-credit, non-child accounts
- Renaming a parent automatically updates all children's `parentName`
- Parent accounts cannot be deleted while they have sub-accounts

#### Credit Accounts
Extra fields: credit limit, statement date, due date, cutoff date, minimum payment. Available credit is computed live: `creditLimit - thisTotal - nextTotal` where totals are expenses within and after the current billing cycle.

#### Account Detail Sheet
- Shows current balance (own balance, not combined)
- For credit: shows balance used + credit limit progress bar + statement/due dates + minimum payment
- Transaction list filtered to that account
- **For parent accounts**: shows sub-accounts list + "Add Sub-account" button; direct transactions section below
- Edit button → opens account form
- Balance adjustment → manual correction with reason; propagates to parent
- QR code → attach a QR image for quick payment reference (crop + store as base64)
- Delete → blocked if account has transactions or sub-accounts

#### Sort Accounts
A sort button (↕ icon, circle style) opens a modal where top-level accounts (parents + flat) can be drag-reordered. `sort_order` is saved to Dexie and synced to Supabase. This order determines the sequence in the account picker sheet across all forms.

---

### Insights (`/insights`)
Analytics page with month navigation (← / →):

#### Spending by Category (Donut Chart)
- Donut chart with per-segment gradient fill
- Tapping a segment highlights it (others dim to 30% opacity)
- Center label shows total spend (idle) or selected category name + amount + percentage (when a segment is selected)
- 2-column legend below: color dot + category name + exact amount
- Only expense transactions included

#### Income vs. Expenses (Bar Chart)
- Monthly grouped bar chart for the past 6 months
- Side-by-side bars: income (green) vs. expenses (primary color)

#### Spending Trend (Area Chart)
- Daily cumulative or per-day spending for the selected month
- Smooth area curve

#### Category Budgets
- Progress bars per category that has a budget set
- Shows spent vs. budget, highlights over-budget categories in red

---

### Debts (`/debts`)
Track money lent or borrowed:
- **Types**: "I lent" (you lent money to someone) or "I owe" (you owe someone)
- Fields: name, contact (optional), total amount, due date (optional), notes
- **Partial payments** — record payments over time; progress bar shows how much has been paid
- Status badges: Unpaid / Partial / Paid / Overdue
- Paying a debt: opens a payment sheet with account picker + amount — deducts from account balance and records as a transaction
- Paid debts are visually separated (moved to bottom / faded)
- Deletes sync to Supabase via `deleteDebtRemote`

---

### Recurring (`/recurring`)
Scheduled repeating expenses:
- **Frequencies**: Daily, Weekly, Monthly, Yearly
- Fields: name, amount, category, account, frequency, next date
- Active/paused toggle
- "Pay now" — records the transaction immediately and advances `nextDate` to the next occurrence
- Dashboard shows upcoming bills (within 7 days)
- Monthly cost equivalent shown per recurring item (e.g. a weekly ₱500 shows as ≈₱2,167/mo)

---

### Settings (`/settings`)

#### Profile
- Display name (synced)
- Currency selection
- Email shown (read-only)

#### Appearance
- Dark / Light mode toggle
- Accent color picker — 8 presets + custom hex; stored in `localStorage` and synced via `user_preferences`

#### Preferences
- **Skip Confirmation** — when on, transactions save instantly without the review step. Synced across devices.

#### Manage
- **Accounts** — navigates to `/accounts`
- **Categories** — opens category manager sheet; drag-to-reorder, add/edit/delete expense and inflow categories; `sort_order` synced
- **Quick Templates** — manage one-tap transaction templates

#### Data & Reports
- **Import Data** (`/import`) — CSV import wizard (see below)
- **Export Transactions (CSV)** — downloads all transactions as a CSV
- **Full Backup (JSON)** — downloads all tables (transactions, accounts, categories, templates, recurring, debts) as a JSON file
- **Monthly PDF Report** — pick a month from the last 12, generates a formatted PDF with spending summary + transaction list

#### Sync
- Manual sync button — shows last sync timestamp
- Sync status: idle / syncing / error

#### Account
- Sign out (with confirmation)
- Reset app data (wipes all local Dexie data + resets onboarding)

---

### Import Wizard (`/import`)
Two-step CSV import:
1. **Upload** — drag-and-drop or file picker, accepts `.csv`
2. **Preview & Import** — validates columns, shows a preview table of all rows, flags invalid rows (missing fields, unknown type, zero amount). Supports both the current export format and the legacy format. Skips duplicate `txId` records already in the local DB.

---

## Key Shared Components

| Component | Purpose |
|---|---|
| `AccountPickerSheet` | Bottom sheet for selecting an account; groups sub-accounts under their parent; respects `sort_order` |
| `CategoryPickerSheet` | Bottom sheet for selecting a category; filtered by transaction type |
| `NumericKeypad` | Custom decimal keypad (avoids mobile system keyboard) |
| `TemplateConfirmSheet` | Confirms before applying a quick template |
| `TxDetailSheet` | Full transaction detail view with edit/delete |
| `Navbar` | Fixed bottom nav with Home, Transactions, + (add), Accounts, Insights tabs; includes `env(safe-area-inset-bottom)` padding for iPhone home indicator |

---

## Utility Modules

| File | Purpose |
|---|---|
| `src/db/txHelpers.js` | `applyBalanceEffect()` — applies balance changes after a transaction; `updateParentBalance()` — recomputes parent account balance from children |
| `src/utils/moneyInput.js` | `parseMoney`, `moneyChangeHandler`, `numToMoneyStr` — handles Philippine money string formatting/parsing |
| `src/utils/creditCycle.js` | `getCycleRange()` — computes current billing cycle start/end from a cutoff date |
| `src/utils/recurring.js` | `advanceNextDate()`, `toMonthlyAmount()` — recurring schedule helpers |
| `src/utils/reportData.js` | Monthly PDF report generation |
| `src/lib/sync.js` | Full Supabase sync: `syncToSupabase`, `syncFromSupabase`, `fullSync` |
| `src/lib/phAccounts.js` | Philippine bank/ewallet presets for onboarding |
| `src/lib/phCategories.js` | Default expense/inflow category presets |
| `src/context/ThemeContext` | Dark/light mode — persisted in `localStorage` |
| `src/context/ToastContext` | Global toast notifications |
| `src/context/AuthContext` | Supabase auth session |

---

## Design System

- **Primary color**: configurable accent (default `#2D9DFF`), applied via CSS variable `--color-primary`
- **Dark mode**: class-based (`dark:`), default on
- **Currency**: Philippine Peso (₱) by default; all formatters use `Intl.NumberFormat('en-PH')`
- **Bottom sheets**: slide-up panels with `sheet-panel` / `sheet-panel-exit` CSS animations, backdrop blur overlay, drag handle
- **Rounded corners**: `rounded-2xl` (16px) as standard card radius
- **Scroll lock**: `useScrollLock` hook prevents background scroll when a sheet is open
- **Safe area**: bottom navbar uses `env(safe-area-inset-bottom)` for iPhone home indicator

---

## Environment Variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Set in `.env.local`. The app runs fully offline without these — Supabase features (auth, sync) are simply unavailable.
