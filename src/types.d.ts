/**
 * The shapes stored in Dexie, declared once.
 *
 * ── Why a .d.ts and not TypeScript ──
 *
 * This project is JavaScript and stays JavaScript. TypeScript is here as a
 * CHECKER, not a compiler: `tsc --noEmit` reads these declarations plus the
 * JSDoc on the modules that matter and reports what does not line up. Nothing
 * is transformed, nothing is emitted, and Vite still hands the same .js and
 * .jsx files to esbuild that it always did - so a type error is a build-time
 * conversation and never a runtime difference.
 *
 * That trade is deliberate. A full .ts migration would touch all 194 files to
 * catch the same class of bug this catches in the twenty files where money is
 * actually computed, and every one of those touches is a chance to change
 * behaviour in an app that moves people's money.
 *
 * ── Why so many fields are optional ──
 *
 * Because they genuinely are. These records have been written by ten versions
 * of this app; a transaction from v1 has no `txId`, an account from before v6
 * has no `parentName`, and a row that came back from Supabase has whatever
 * the remote column set was that week. Declaring those required would not
 * make them present - it would only make the checker lie, and a checker that
 * lies gets ignored.
 *
 * Required means "every code path that writes this row writes this field, and
 * every reader may assume it". Everything else is optional and the readers
 * are expected to cope, which is what they already do.
 */

/** A ledger entry. The only table that grows without bound. */
interface Transaction {
  id?: number
  /** A UUID minted at creation. Supabase upserts on it, so it is the identity
   *  that survives a round trip; rows predating it have none. */
  txId?: string
  type: 'expense' | 'inflow' | 'transfer' | string
  amount: number
  date: string
  description?: string
  category?: string | null
  /** The account a one-sided entry hits. Transfers use from/to instead. */
  account?: string | null
  payment?: string | null
  fromAccount?: string | null
  toAccount?: string | null
  /** 0 or 1, never a boolean: IndexedDB will not key a boolean, so a record
   *  written `synced: false` fell out of its own index. See db.js. Declared as
   *  a number rather than that literal union, because rows predating
   *  normalizeSyncedFlags carry whatever they carry and the readers cope. */
  synced?: number
  updatedAt?: string
  /** Set when a bill posted this charge, with the date the bill was due
   *  before it advanced - which is what lets an undo put the bill back. */
  recurringId?: number
  recurringPrevDate?: string
  /** Groups the two halves of a transfer, and a fee with its parent. */
  groupId?: string
  [key: string]: any
}

/** A wallet, bank account, e-wallet or credit card. */
interface Account {
  id?: number
  name: string
  type: 'cash' | 'bank' | 'ewallet' | 'savings' | 'credit' | string
  role?: string | null
  balance?: number
  currency?: string
  color?: string
  /** Credit only; null on every asset account. */
  creditLimit?: number | null
  statementDate?: number | null
  dueDate?: number | null
  cutoffDate?: number | null
  minimumPayment?: number | null
  /** Monthly interest rate as a percentage; 3 means 3%/month. Optional -
   *  a card without one is never offered a finance-charge estimate. */
  interestRate?: number | null
  /** Flat late fee in pesos, capped at the minimum due when applied. */
  lateFee?: number | null
  qrImage?: string | null
  /** Names a parent account, so sub-accounts roll up. By NAME, like the rest
   *  of the schema - see the note in db.js. */
  parentName?: string | null
  sort_order?: number
  /** The card face. Unindexed; normalizeDesign() falls back for unknown keys. */
  design?: string
  /** The card network mark. */
  scheme?: string | null
  customColor?: boolean
  updatedAt?: string
  synced?: number
  [key: string]: any
}

/** What the ledger actually reads. Kept in step with `accounts.balance`. */
interface BalanceRow {
  account: string
  balance: number
}

interface Category {
  id?: number
  name: string
  icon?: string
  color?: string
  type?: string
  /** The monthly limit, or 0/undefined for a category with none. */
  budget?: number
  sort_order?: number
  [key: string]: any
}

interface Debt {
  id?: number
  name: string
  contact?: string | null
  amount: number
  amountPaid?: number
  dueDate?: string | null
  /** Which way the money goes. */
  type: 'i_owe' | 'owed_to_me' | string
  notes?: string | null
  createdAt?: string
  settledAt?: string | null
  [key: string]: any
}

/** A bill that posts itself on a schedule. */
interface Recurring {
  id?: number
  name: string
  amount: number
  category?: string | null
  account?: string | null
  frequency: string
  nextDate: string
  active?: boolean
  [key: string]: any
}

interface Template {
  id?: number
  name: string
  type: string
  amount?: number
  description?: string
  category?: string | null
  account?: string | null
  fromAccount?: string | null
  toAccount?: string | null
  createdAt?: string
  [key: string]: any
}

/**
 * A savings goal.
 *
 * There is no `saved` field, on purpose: progress is derived from real
 * balances every time it is read, so there is nothing to top up and nothing
 * that can drift. lib/goals.js explains the waterfall that splits a shared
 * balance between several goals without counting a peso twice.
 */
interface Goal {
  id?: number
  name: string
  icon?: string
  target: number
  /** Funding accounts, by name. A multi-entry index, so "which goals does
   *  this account fund?" is answered straight from the index. */
  accounts?: string[]
  targetDate?: string | null
  /** Rank, in steps of GOAL_RANK_STEP. Lower fills first. */
  priority?: number
  createdAt?: string
  updatedAt?: string
  archivedAt?: string | null
  synced?: number
  [key: string]: any
}

/** A goal with its derived progress attached - what allocateGoals returns. */
interface AllocatedGoal extends Goal {
  target: number
  saved: number
  remaining: number
  /** 0-100, capped. A goal with no target reports 0 rather than 100. */
  pct: number
  complete: boolean
  archived: boolean
  linkedCount: number
  sources: Array<{ account: string, amount: number }>
}

/** One account's side of the split. */
interface AccountSplit {
  balance: number
  assigned: number
  unassigned: number
  goals: Array<{ goalId?: number, name: string, amount: number }>
}

interface GoalTotals {
  target: number
  saved: number
  unassigned: number
  fundableBalance: number
  count: number
  complete: number
  unfunded: number
  pct: number
}

interface GoalAllocation {
  goals: AllocatedGoal[]
  active: AllocatedGoal[]
  byAccount: Record<string, AccountSplit>
  totals: GoalTotals
}

/** One row per EARNED badge, keyed by the definition's own string key. */
interface BadgeRow {
  key: string
  earnedAt: string
  synced?: number
  [key: string]: any
}

/** The key-value table: seeded flags, tombstones, the user's settings. */
interface MetaRow {
  key: string
  /** Heterogeneous by design: flags, tombstone lists, settings blobs. */
  value?: any
  [key: string]: any
}
