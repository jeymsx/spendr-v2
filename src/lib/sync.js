import db, { dbReady, getUnsyncedTxs, SYNCED } from '../db/db'
import { supabase } from './supabase'
// Single definition, shared with onboarding — the two lists used to be
// separate copies, so a system category added to one was missing from the
// other and new users ended up with a different set than syncing users.
import { SYSTEM_CATS } from './phCategories'

// ── Pending remote deletes ────────────────────────────────────────────────────
// Deleting a row locally has to delete it remotely too, or the next pull re-adds
// it — pullSimpleTable inserts any remote row it can't match locally. Doing that
// delete inline fails silently when offline, which on a phone is most of the
// time, so deletions are queued and retried until they land. Transactions
// already worked this way via deletedTxIds; this generalises it.

const PENDING_KEY = 'pendingDeletes'

/**
 * Record that a row must be deleted from Supabase.
 * @param {string} table  Supabase table name.
 * @param {object} match  Column/value pairs identifying the row, e.g. { name }.
 */
export async function queueRemoteDelete(table, match) {
  const meta = await db.meta.get(PENDING_KEY)
  const list = meta?.value ?? []
  list.push({ table, match })
  await db.meta.put({ key: PENDING_KEY, value: list })
}

async function getPendingDeletes() {
  const meta = await db.meta.get(PENDING_KEY)
  return meta?.value ?? []
}

/** True when a pulled row is one we're still trying to delete.
 *
 * @param {Array<{table: string, match?: Record<string, any>}>} pending
 * @param {string} table
 * @param {Record<string, any>} row  a row as Supabase returned it
 */
export function isPendingDelete(pending, table, row) {
  return pending.some(p =>
    p.table === table &&
    Object.entries(p.match ?? {}).every(([k, v]) => row[k] === v),
  )
}

// Runs before the pull so a queued delete can't be undone by this very sync.
// Entries that fail stay queued; over-deleting is safe because the push that
// follows re-uploads every surviving local row.
/** @param {string} userId */
async function flushPendingDeletes(userId) {
  const list = await getPendingDeletes()
  if (!list.length) return

  const remaining = []
  for (const entry of list) {
    let q = supabase.from(entry.table).delete().eq('user_id', userId)
    for (const [col, val] of Object.entries(entry.match ?? {})) q = q.eq(col, val)
    const { error } = await q
    if (error) {
      console.error('[sync] delete %s failed:', entry.table, error.message)
      remaining.push(entry)
    }
  }
  await db.meta.put({ key: PENDING_KEY, value: remaining })
}

// ── Row mapping: Dexie → Supabase ─────────────────────────────────────────────

/* ── The row mappers are exported for tests ──────────────────────────────────
   Every one of them is pure: a record in, a record out, no clock beyond a
   fallback timestamp and no database. They are also where the two schemas
   disagree - Dexie keys a one-sided entry on `account` and Supabase keys
   everything on from_account/to_account - and that asymmetry is invisible
   until a transfer comes back from a pull pointing the wrong way.

   Nothing else imports them. The export exists so sync.test.js can. */

/**
 * @param {Transaction} r
 * @param {string} userId
 */
export function toSupabaseRow(r, userId) {
  const type = r.type
  /* local_id is always null here and filled by the caller, so the literal on
     its own infers `null` as its type. @type instead of a value change. */
  return /** @type {Record<string, any>} */ ({
    user_id:          userId,
    local_id:         null,
    tx_id:            r.txId ?? null,
    type,
    transaction_date: r.date,
    description:      r.description,
    category:         r.category,
    // Dexie uses `account` for expense/inflow and fromAccount/toAccount for transfer.
    // Supabase uses from_account/to_account for all types.
    from_account:     type === 'expense'  ? (r.account ?? null)
                    : type === 'transfer' ? (r.fromAccount ?? null)
                    : null,
    to_account:       type === 'inflow'   ? (r.account ?? null)
                    : type === 'transfer' ? (r.toAccount ?? null)
                    : null,
    amount:           r.amount,
    synced:           true,
    updated_at:       r.updatedAt ?? new Date().toISOString(),
  })
}

/**
 * @param {Account} r
 * @param {string} userId
 */
export function accountToRow(r, userId) {
  return {
    user_id:         userId,
    name:            r.name,
    type:            r.type,
    role:            r.role            ?? null,
    balance:         r.balance,
    currency:        r.currency,
    credit_limit:    r.creditLimit    ?? null,
    statement_date:  r.statementDate  ?? null,
    due_date:        r.dueDate        ?? null,
    cutoff_date:     r.cutoffDate     ?? null,
    minimum_payment: r.minimumPayment ?? null,
    color:           r.color,
    qr_image:        r.qrImage        ?? null,
    parent_name:     r.parentName     ?? null,
    // Optional: see OPTIONAL_ACCOUNT_COLS below. Dropped and retried if the
    // remote table has not had migration 005 applied yet.
    design:          r.design         ?? null,
    custom_color:    r.customColor    ?? null,
    sort_order:      r.sort_order     ?? 0,
    updated_at:      r.updatedAt ?? new Date().toISOString(),
  }
}

/**
 * @param {Category} r
 * @param {string} userId
 */
export function categoryToRow(r, userId) {
  return {
    user_id:    userId,
    name:       r.name,
    icon:       r.icon,
    color:      r.color,
    type:       r.type,
    budget:     r.budget,
    sort_order: r.sort_order ?? 0,
    updated_at: r.updatedAt ?? new Date().toISOString(),
  }
}

/**
 * @param {Debt} r
 * @param {string} userId
 */
export function debtToRow(r, userId) {
  return {
    user_id:     userId,
    local_id:    r.id,
    name:        r.name,
    contact:     r.contact   ?? null,
    amount:      r.amount,
    amount_paid: r.amountPaid ?? 0,
    due_date:    r.dueDate   ?? null,
    type:        r.type,
    notes:       r.notes     ?? null,
    created_at:  r.createdAt ?? null,
    updated_at:  r.updatedAt ?? new Date().toISOString(),
  }
}

/**
 * @param {Recurring} r
 * @param {string} userId
 */
export function recurringToRow(r, userId) {
  return {
    user_id:    userId,
    local_id:   r.id,
    name:       r.name,
    amount:     r.amount,
    category:   r.category,
    account:    r.account,
    frequency:  r.frequency,
    next_date:  r.nextDate,
    active:     r.active,
    updated_at: r.updatedAt ?? new Date().toISOString(),
  }
}

/**
 * @param {Goal} r
 * @param {string} userId
 */
export function goalToRow(r, userId) {
  return {
    user_id:     userId,
    local_id:    r.id,
    name:        r.name,
    icon:        r.icon        ?? null,
    target:      r.target      ?? 0,
    // A jsonb array, not a join table. The local schema keeps funding accounts
    // inline for the reasons in db/db.js v9; mirroring that here keeps goals a
    // single row remotely too, so a goal and its accounts can never arrive
    // half-synced.
    accounts:    r.accounts    ?? [],
    target_date: r.targetDate  ?? null,
    priority:    r.priority    ?? 0,
    archived_at: r.archivedAt  ?? null,
    created_at:  r.createdAt   ?? null,
    updated_at:  r.updatedAt   ?? new Date().toISOString(),
  }
}

/* No local_id: the key IS the identity, here and in IndexedDB. See the
   DIVERGENCE note in migrations/006_badges.sql. */
/**
 * @param {BadgeRow} r
 * @param {string} userId
 */
export function badgeToRow(r, userId) {
  return {
    user_id:    userId,
    key:        r.key,
    earned_at:  r.earnedAt ?? null,
    updated_at: r.updatedAt ?? r.earnedAt ?? new Date().toISOString(),
  }
}

/**
 * @param {Template} r
 * @param {string} userId
 */
export function templateToRow(r, userId) {
  return {
    user_id:     userId,
    local_id:    r.id,
    name:        r.name,
    type:        r.type,
    amount:      r.amount       ?? null,
    description: r.description  ?? null,
    category:    r.category     ?? null,
    account:     r.account      ?? null,
    from_account: r.fromAccount ?? null,
    to_account:  r.toAccount    ?? null,
    updated_at:  r.updatedAt ?? r.createdAt ?? new Date().toISOString(),
  }
}

// ── Row mapping: Supabase → Dexie ─────────────────────────────────────────────

/**
 * @param {Record<string, any>} row  a row as Supabase returned it
 * @returns {Transaction}
 */
export function toDexieRecord(row) {
  const type = row.type
  return {
    txId:        row.tx_id,
    type,
    date:        row.transaction_date,
    description: row.description,
    category:    row.category,
    account:     type === 'expense'  ? row.from_account
               : type === 'inflow'   ? row.to_account
               : null,
    fromAccount: type === 'transfer' ? row.from_account : null,
    toAccount:   type === 'transfer' ? row.to_account   : null,
    amount:      row.amount,
    synced:      SYNCED,
    updatedAt:   row.updated_at,
  }
}

/** @param {Record<string, any>} row  a row as Supabase returned it */
export function rowToAccount(row) {
  return {
    name:           row.name,
    type:           row.type,
    role:           row.role,
    balance:        row.balance,
    currency:       row.currency,
    creditLimit:    row.credit_limit,
    statementDate:  row.statement_date,
    dueDate:        row.due_date,
    cutoffDate:     row.cutoff_date,
    minimumPayment: row.minimum_payment,
    color:          row.color,
    qrImage:        row.qr_image    ?? null,
    parentName:     row.parent_name ?? null,
    // undefined when the column does not exist yet, which normalizeDesign
    // renders as 'classic' - so a pull from a pre-migration table is a
    // no-op here rather than an error.
    design:         row.design ?? null,
    customColor:    row.custom_color ?? false,
    sort_order:     row.sort_order  ?? 0,
    updatedAt:      row.updated_at,
  }
}

/** @param {Record<string, any>} row  a row as Supabase returned it */
export function rowToCategory(row) {
  return {
    name:       row.name,
    icon:       row.icon,
    color:      row.color,
    type:       row.type,
    budget:     row.budget,
    sort_order: row.sort_order ?? 0,
    updatedAt:  row.updated_at,
  }
}

/** @param {Record<string, any>} row  a row as Supabase returned it */
export function rowToDebt(row) {
  return {
    name:       row.name,
    contact:    row.contact,
    amount:     row.amount,
    amountPaid: row.amount_paid,
    dueDate:    row.due_date,
    type:       row.type,
    notes:      row.notes,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  }
}

/** @param {Record<string, any>} row  a row as Supabase returned it */
export function rowToRecurring(row) {
  return {
    name:      row.name,
    amount:    row.amount,
    category:  row.category,
    account:   row.account,
    frequency: row.frequency,
    nextDate:  row.next_date,
    active:    row.active,
    updatedAt: row.updated_at,
  }
}

/** @param {Record<string, any>} row  a row as Supabase returned it */
export function rowToTemplate(row) {
  return {
    name:        row.name,
    type:        row.type,
    amount:      row.amount,
    description: row.description,
    category:    row.category,
    account:     row.account,
    fromAccount: row.from_account,
    toAccount:   row.to_account,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

/** @param {Record<string, any>} row  a row as Supabase returned it */
export function rowToGoal(row) {
  return {
    name:       row.name,
    icon:       row.icon,
    target:     row.target ?? 0,
    // Postgres can hand back null for an empty jsonb column, and every reader
    // treats `accounts` as an array - Array.isArray rather than ?? [] so a
    // malformed value degrades to "no account attached" instead of throwing
    // inside the allocator.
    accounts:   Array.isArray(row.accounts) ? row.accounts : [],
    targetDate: row.target_date,
    priority:   row.priority ?? 0,
    archivedAt: row.archived_at ?? null,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
    synced:     SYNCED,
  }
}

// ── User preferences ─────────────────────────────────────────────────────────

/** @param {string} userId */
async function pushPreferences(userId) {
  const [nameMeta, currencyMeta, skipMeta] = await Promise.all([
    db.meta.get('displayName'),
    db.meta.get('currency'),
    db.meta.get('skipConfirm'),
  ])
  const accentColor = localStorage.getItem('accentColor') ?? '#2D9DFF'
  const row = {
    user_id:      userId,
    display_name: nameMeta?.value ?? null,
    currency:     currencyMeta?.value ?? 'PHP',
    accent_color: accentColor,
    skip_confirm: skipMeta?.value ?? false,
    updated_at:   new Date().toISOString(),
  }
  const { error } = await supabase
    .from('user_preferences')
    .upsert(row, { onConflict: 'user_id' })
  if (error) throw new Error(`user_preferences push: ${error.message}`)
}

/** @param {string} userId */
async function pullPreferences(userId) {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return // no row yet — first sign-in
    throw new Error(`user_preferences pull: ${error.message}`)
  }
  if (!data) return
  if (data.display_name) {
    await db.meta.put({ key: 'displayName', value: data.display_name })
    await db.meta.put({ key: 'userName',    value: data.display_name })
  }
  if (data.currency) {
    await db.meta.put({ key: 'currency', value: data.currency })
  }
  if (data.accent_color) {
    localStorage.setItem('accentColor', data.accent_color)
  }
  if (data.skip_confirm != null) {
    await db.meta.put({ key: 'skipConfirm', value: data.skip_confirm })
  }
}

// ── Tables that may not exist remotely yet ───────────────────────────────────
//
// `goals` ships with a Supabase migration (src/supabase/migrations/004_goals.sql).
// Until that is
// applied, every goals query comes back "relation does not exist" - and since
// syncToSupabase awaits each push in sequence and pushTable throws, one missing
// table would abort the whole sync and take transactions, accounts and
// categories down with it.
//
// So goals sync is fault-isolated: a schema error is logged and stepped over,
// anything else is re-thrown. The local database is the source of truth either
// way, so the cost of the table being absent is that goals stay on the device -
// not that the rest of the app stops syncing.
const MISSING_TABLE = /relation .* does not exist|could not find the table|schema cache/i

/**
 * @param {string} label
 * @param {() => Promise<any>} fn
 */
async function optionalSync(label, fn) {
  try {
    await fn()
  } catch (e) {
    if (MISSING_TABLE.test(e?.message ?? '')) {
      console.warn('[sync] %s skipped - run the Supabase migration:', label, e.message)
      return
    }
    throw e
  }
}

// ── Push to Supabase ──────────────────────────────────────────────────────────

/** @param {string} userId */
export async function syncToSupabase(userId) {
  if (!userId) return

  // Transactions: only push unsynced (falsy synced field = unsynced)
  const unsyncedTxs = await getUnsyncedTxs()

  // Push tombstoned deletions first
  const deletedMeta = await db.meta.get('deletedTxIds')
  const deletedTxIds = deletedMeta?.value ?? []
  if (deletedTxIds.length > 0) {
    const { error: delErr } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId)
      .in('tx_id', deletedTxIds)
    if (!delErr) {
      await db.meta.put({ key: 'deletedTxIds', value: [] })
    }
  }

  if (unsyncedTxs.length > 0) {
    // Only push transactions that have a stable tx_id
    const rows = unsyncedTxs.filter(r => r.txId).map(r => toSupabaseRow(r, userId))

    if (rows.length > 0) {
      const { error } = await supabase
        .from('transactions')
        .upsert(rows, { onConflict: 'user_id,tx_id', ignoreDuplicates: false })
      if (error) throw new Error(`transactions push: ${error.message}`)
    }

    // Mark as synced locally
    const ids = unsyncedTxs.map(r => r.id).filter(Boolean)
    if (ids.length) {
      await db.transactions.where('id').anyOf(ids).modify({ synced: SYNCED })
    }
  }

  // Other tables: always push all (small datasets, no per-record tracking needed)
  await pushTable('accounts',   db.accounts,   accountToRow,  userId, 'user_id,name')
  await pushTable('categories', db.categories, categoryToRow, userId, 'user_id,name,type')
  await pushTable('debts',      db.debts,      debtToRow,     userId)
  await pushTable('recurring',  db.recurring,  recurringToRow, userId)
  await pushTable('templates',  db.templates,  templateToRow,  userId)
  // Last, and fault-isolated: see optionalSync above.
  await optionalSync('goals push', () =>
    pushTable('goals', db.goals, goalToRow, userId, 'user_id,name'))
  await optionalSync('badges push', () =>
    pushTable('badges', db.badges, badgeToRow, userId, 'user_id,key'))
  await pushPreferences(userId)
}

/**
 * Columns that may not exist remotely yet, per table.
 *
 * `design` arrives with src/supabase/migrations/005_account_design.sql. The
 * problem is that pushTable sends EVERY account in one upsert and PostgREST
 * rejects the whole request if it names a column the table does not have - so
 * shipping the mapping before the migration ran would not have degraded
 * gracefully, it would have stopped accounts syncing altogether, for real
 * financial data.
 *
 * Rather than make the app depend on migration order, the push drops these
 * columns and retries once when the error says the column is unknown. The
 * result is that design syncs the moment the migration is applied and simply
 * stays on-device until then, with no flag to set and nothing to remember.
 */
/** Columns a table may not have yet, by table name.
 *  @type {Record<string, string[]>} */
const OPTIONAL_COLS = {
  accounts: ['design', 'custom_color'],
}

// PostgREST reports an unknown column as PGRST204 with a message naming it,
// and Postgres itself as 42703. Matching the text covers both and does not
// depend on which layer rejected it.
const UNKNOWN_COLUMN = /could not find the '.*' column|does not exist|42703|PGRST204/i

// conflictCols: the Supabase UNIQUE constraint columns to resolve on.
// Accounts and categories use their name-based constraints because the
// IndexedDB auto-increment counter does NOT reset on table.clear(), so
// local_ids can shift after a reset while names remain stable.
/**
 * @param {string} tableName
 * @param {import("dexie").Table<any, any>} dexieTable
 * @param {(r: any, userId: string) => Record<string, any>} toRow
 * @param {string} userId
 * @param {string} [conflictCols]
 */
async function pushTable(tableName, dexieTable, toRow, userId, conflictCols = 'user_id,local_id') {
  const records = await dexieTable.toArray()
  if (!records.length) return

  let rows = records.map(r => toRow(r, userId))

  // Deduplicate rows by conflict key so Postgres never sees two rows with the
  // same conflict target in one batch ("cannot affect row a second time").
  const keys = conflictCols.split(',').filter(k => k !== 'user_id')
  if (keys.length > 0) {
    const seen = new Set()
    rows = rows.filter(row => {
      const key = keys.map(k => row[k]).join('|')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const opts = { onConflict: conflictCols, ignoreDuplicates: false }
  const { error } = await supabase.from(tableName).upsert(rows, opts)
  if (!error) return

  const optional = OPTIONAL_COLS[tableName] ?? []
  if (optional.length && UNKNOWN_COLUMN.test(error.message ?? '')) {
    console.warn(
      '[sync] %s: dropping %s and retrying - run the migration to sync it:',
      tableName, optional.join(', '), error.message,
    )
    const trimmed = rows.map(row => {
      const copy = { ...row }
      for (const col of optional) delete copy[col]
      return copy
    })
    const retry = await supabase.from(tableName).upsert(trimmed, opts)
    if (retry.error) throw new Error(`${tableName} push: ${retry.error.message}`)
    return
  }

  throw new Error(`${tableName} push: ${error.message}`)
}

// ── Pull from Supabase ────────────────────────────────────────────────────────

async function ensureSystemCategories() {
  for (const cat of SYSTEM_CATS) {
    const exists = await db.categories
      .where('name').equals(cat.name)
      .and(c => c.type === cat.type)
      .first()
    if (!exists) await db.categories.add({ ...cat, budget: 0 })
  }
}

/** @param {string} userId */
export async function syncFromSupabase(userId) {
  if (!userId) return

  // Rows we're still trying to delete must not be re-added by this pull.
  const pending = await getPendingDeletes()

  await pullPreferences(userId)
  await pullTxs(userId)
  await pullSimpleTable('accounts',   db.accounts,   rowToAccount,   'name', userId, null, pending)
  // Categories: match on name+type to avoid confusing same-named categories of different types
  await pullSimpleTable('categories', db.categories, rowToCategory, null, userId,
    row => db.categories.where('name').equals(row.name).and(c => c.type === row.type).first(), pending)
  await pullSimpleTable('debts', db.debts, rowToDebt, null, userId,
    row => {
      if (row.contact) {
        return db.debts.where('contact').equals(row.contact)
          .and(d => d.type === row.type && d.amount === row.amount).first()
      }
      if (row.name) {
        return db.debts.where('name').equals(row.name)
          .and(d => d.type === row.type).first()
      }
      return null
    }, pending)
  await pullSimpleTable('recurring', db.recurring, rowToRecurring, null, userId,
    row => row.name
      ? db.recurring.where('name').equals(row.name).and(r => r.amount === row.amount).first()
      : null, pending)
  await pullSimpleTable('templates',  db.templates,  rowToTemplate,  'name', userId, null, pending)
  await optionalSync('goals pull', () =>
    pullSimpleTable('goals', db.goals, rowToGoal, 'name', userId, null, pending))
  await optionalSync('badges pull', () => pullBadges(userId))

  // Guarantee system categories exist locally even if never pushed to Supabase
  await ensureSystemCategories()
}

/** @param {string} userId */
async function pullTxs(userId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
  if (error) throw new Error(`transactions pull: ${error.message}`)
  if (!data?.length) return

  const deletedMeta = await db.meta.get('deletedTxIds')
  const deletedSet = new Set(deletedMeta?.value ?? [])

  // Read local rows once and index them by txId. The previous version ran one
  // awaited indexed lookup per remote row, so a year of history meant thousands
  // of sequential IndexedDB round-trips on every sync.
  const byTxId = new Map()
  for (const t of await db.transactions.toArray()) {
    if (t.txId) byTxId.set(t.txId, t)
  }

  /** @type {Transaction[]} */
  const toAdd = []
  /** @type {Transaction[]} */
  const toPut = []
  const seen  = new Set() // guards against duplicate tx_ids inside one payload

  for (const row of data) {
    if (!row.tx_id) continue // skip rows without a stable key
    if (deletedSet.has(row.tx_id)) continue // skip locally-deleted transactions
    if (seen.has(row.tx_id)) continue
    seen.add(row.tx_id)

    const existing = byTxId.get(row.tx_id)
    const remotets = row.updated_at ? new Date(row.updated_at).getTime() : 0
    const localts  = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0

    if (!existing) {
      toAdd.push({ ...toDexieRecord(row) })
    } else if (remotets > localts) {
      // Spread `existing` first to mirror Dexie's partial .update(): fields the
      // remote row doesn't carry (recurringId, recurringPrevDate, …) survive.
      toPut.push({ ...existing, ...toDexieRecord(row) })
    }
  }

  // Two bulk writes instead of N single writes. Besides the IndexedDB savings,
  // this collapses N liveQuery notifications into 2, so the UI stops re-running
  // every transactions query once per synced row.
  if (toAdd.length) await db.transactions.bulkAdd(toAdd)
  if (toPut.length) await db.transactions.bulkPut(toPut)
}

// findFn: optional async (row) => existing local record | null
// Used when a simple single-key lookup isn't enough (e.g. categories: name+type).
/**
 * @param {string} tableName
 * @param {import("dexie").Table<any, any>} dexieTable
 * @param {(row: Record<string, any>) => Record<string, any>} fromRow
 * @param {string} nameKey
 * @param {string} userId
 * @param {((row: Record<string, any>) => Promise<any>)} [findFn]  when a single-key lookup is not enough (categories match on name AND type)
 * @param {Array<{table: string, match?: Record<string, any>}>} [pending]
 */
async function pullSimpleTable(tableName, dexieTable, fromRow, nameKey, userId, findFn, pending = []) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('user_id', userId)
  if (error) throw new Error(`${tableName} pull: ${error.message}`)
  if (!data?.length) return

  for (const row of data) {
    if (isPendingDelete(pending, tableName, row)) continue

    const localId = row.local_id
    const existing = localId ? await dexieTable.get(localId) : null

    // Prefer a custom finder (compound key), fall back to single nameKey
    const byName = existing ? null
      : findFn ? await findFn(row)
      : nameKey && row[nameKey]
        ? await dexieTable.where(nameKey).equals(row[nameKey]).first()
        : null

    const target   = existing ?? byName
    const remotets = row.updated_at ? new Date(row.updated_at).getTime() : 0
    const localts  = target?.updatedAt ? new Date(target.updatedAt).getTime() : 0

    if (!target) {
      await dexieTable.add(fromRow(row))
    } else {
      if (remotets > localts) {
        await dexieTable.update(target.id, fromRow(row))
      }
    }
  }
}

/**
 * Badges, merged rather than reconciled.
 *
 * pullSimpleTable cannot serve this table: it matches rows by `local_id` and
 * writes with `dexieTable.update(target.id, …)`, and badges have neither - the
 * badge's key is its primary key (see db/db.js v10).
 *
 * The merge rule is also different, and simpler than last-write-wins: a badge
 * is earned or it is not, so the union is what both sides want, and where the
 * two disagree about WHEN, the earlier date is the true one. You did the thing
 * on the day you did it; syncing a second device later must not re-date it.
 *
 * Nothing is ever deleted here. A badge missing remotely is one this device
 * earned offline and has not pushed yet, not one that was taken away.
 *
 * @param {string} userId
 */
async function pullBadges(userId) {
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .eq('user_id', userId)
  if (error) throw new Error(`badges pull: ${error.message}`)
  if (!data?.length) return

  for (const row of data) {
    if (!row.key) continue
    const local = await db.badges.get(row.key)
    const remoteAt = row.earned_at ?? null

    if (!local) {
      await db.badges.put({ key: row.key, earnedAt: remoteAt, synced: SYNCED })
      continue
    }

    // Earlier wins. A missing date on either side loses to a real one.
    const localAt = local.earnedAt ?? null
    const earliest = !localAt ? remoteAt
      : !remoteAt ? localAt
      : (new Date(remoteAt) < new Date(localAt) ? remoteAt : localAt)

    if (earliest !== localAt) {
      await db.badges.put({ ...local, earnedAt: earliest, synced: SYNCED })
    }
  }
}

// ── Deduplicate local accounts ────────────────────────────────────────────────
// Seed and pull can race on a fresh device, both creating a Cash record.
// Keep the record with the most recent updatedAt (the one from pull has the
// correct balance); delete any extras with the same name.

async function deduplicateLocalAccounts() {
  const accounts = await db.accounts.toArray()
  /** @type {Record<string, Account>} */
  const seen = {}
  for (const acct of accounts) {
    const prev = seen[acct.name]
    if (!prev) { seen[acct.name] = acct; continue }
    const prevTs = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0
    const currTs = acct.updatedAt ? new Date(acct.updatedAt).getTime() : 0
    if (currTs > prevTs || (currTs === prevTs && (acct.balance ?? 0) > (prev.balance ?? 0))) {
      await db.accounts.delete(prev.id)
      seen[acct.name] = acct
    } else {
      await db.accounts.delete(acct.id)
    }
  }
}

// ── Full sync ─────────────────────────────────────────────────────────────────

/** @param {string} userId */
export async function fullSync(userId) {
  if (!userId) throw new Error('Not authenticated')
  // Wait for the initial seed to complete so the pull doesn't race with it
  // and create duplicate seeded records (e.g. two Cash accounts).
  await dbReady
  // Land queued deletions first, so the pull below can't resurrect them.
  await flushPendingDeletes(userId)
  // Pull so a fresh device gets correct remote state before pushing.
  await syncFromSupabase(userId)
  // Clean up any duplicates that seed vs. pull races may have left behind.
  await deduplicateLocalAccounts()
  await syncToSupabase(userId)
}

// ── Deletion helpers (call these alongside the local db.delete) ───────────────

// These queue rather than delete inline, so a deletion made offline still lands
// on the next successful sync instead of being quietly reverted by the pull.

/**
 * @param {string} _userId
 * @param {number} debtId
 */
export async function deleteDebtRemote(_userId, debtId) {
  await queueRemoteDelete('debts', { local_id: debtId })
}

/**
 * @param {string} _userId
 * @param {number} recurringId
 */
export async function deleteRecurringRemote(_userId, recurringId) {
  await queueRemoteDelete('recurring', { local_id: recurringId })
}

/** Accounts are unique on (user_id, name).
 *
 * @param {string} name
 */
export async function deleteAccountRemote(name) {
  if (name) await queueRemoteDelete('accounts', { name })
}

/** Categories are unique on (user_id, name, type).
 *
 * @param {string} name
 * @param {string} type
 */
export async function deleteCategoryRemote(name, type) {
  if (name) await queueRemoteDelete('categories', { name, type })
}

/**
 * Templates push on local_id but pull matches on name, so queue both: missing
 * the row means it resurrects, while deleting one row too many is repaired by
 * the push that re-uploads every surviving local template.
 *
 * @param {number} localId
 * @param {string} name
 */
export async function deleteTemplateRemote(localId, name) {
  if (localId != null) await queueRemoteDelete('templates', { local_id: localId })
  if (name)            await queueRemoteDelete('templates', { name })
}
