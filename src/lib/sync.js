import db, { dbReady, getUnsyncedTxs, SYNCED, SYNCED_TABLES } from '../db/db'
import { reverseBalanceEffect } from '../db/balances'
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
    /* Both are plain properties with no Dexie index, the same shape
       installmentId uses. They DO cross to Supabase, unlike installmentId,
       because losing them costs more than a lookup: a refund with no
       refundOf still nets correctly - it is a negative amount and every sum
       adds - but the "Refunded 500 of 2,400" line and the refundable cap
       both go, and split legs stop reading as one purchase. */
    refund_of:        r.refundOf ?? null,
    split_id:         r.splitId ?? null,
    /* What this row settled, so deleting it anywhere puts the debt back.
       See 013 - keyed on the debts' stable ids, never on local_id. */
    settles:          r.settles ?? null,
    credit_sync_id:   r.creditSyncId ?? null,
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
    sync_id:         r.syncId ?? null,
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
    interest_rate:   r.interestRate ?? null,
    late_fee:        r.lateFee ?? null,
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
    sync_id:    r.syncId ?? null,
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
    sync_id:     r.syncId ?? null,
    local_id:    r.id,
    name:        r.name,
    contact:     r.contact   ?? null,
    amount:      r.amount,
    amount_paid: r.amountPaid ?? 0,
    due_date:    r.dueDate   ?? null,
    type:        r.type,
    notes:       r.notes     ?? null,
    created_at:  r.createdAt ?? null,
    /* A receivable opened by a shared expense remembers which purchase it
       came from and which category to credit when it settles. See 009. */
    source_tx_id:    r.sourceTxId ?? null,
    source_category: r.sourceCategory ?? null,
    /* Filed away rather than deleted. See 012. */
    archived_at:     r.archivedAt ?? null,
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
    sync_id:    r.syncId ?? null,
    local_id:   r.id,
    name:       r.name,
    amount:     r.amount,
    category:   r.category,
    account:    r.account,
    frequency:  r.frequency,
    next_date:  r.nextDate,
    active:     r.active,
    split:      r.split ?? null,
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
    sync_id:     r.syncId ?? null,
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
    sync_id:     r.syncId ?? null,
    local_id:    r.id,
    name:        r.name,
    type:        r.type,
    amount:      r.amount       ?? null,
    description: r.description  ?? null,
    category:    r.category     ?? null,
    account:     r.account      ?? null,
    from_account: r.fromAccount ?? null,
    to_account:  r.toAccount    ?? null,
    /* Spread rather than `created_at: r.createdAt ?? null`.

       The column defaults to now(), and a default only applies when the
       column is OMITTED - an explicit null stores a null. So a template with
       no local createdAt has to leave the key out entirely to keep the
       behaviour it has today, which is to be stamped by the server. */
    ...(r.createdAt ? { created_at: r.createdAt } : {}),
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
    refundOf:    row.refund_of ?? null,
    splitId:     row.split_id ?? null,
    settles:     row.settles ?? null,
    creditSyncId: row.credit_sync_id ?? null,
    synced:      SYNCED,
    updatedAt:   row.updated_at,
  }
}

/**
 * The stable id, folded in ONLY when the remote actually has one.
 *
 * Spread rather than `syncId: row.sync_id ?? null`, for the same reason
 * templateToRow spreads created_at: an explicit null would be WRITTEN, and
 * writing null here erases the local identity every time a device pulls from
 * a database that has not been stamped yet. Absent has to stay absent.
 *
 * @param {Record<string, any>} row
 */
const syncIdOf = (row) => (row.sync_id ? { syncId: row.sync_id } : {})

/** @param {Record<string, any>} row  a row as Supabase returned it */
export function rowToAccount(row) {
  return {
    ...syncIdOf(row),
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
    /* Undefined when 007 has not run, which normalises to "no estimate"
       rather than an error - same shape as design/custom_color above. */
    interestRate:   row.interest_rate ?? null,
    lateFee:        row.late_fee ?? null,
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
    ...syncIdOf(row),
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
    ...syncIdOf(row),
    name:       row.name,
    contact:    row.contact,
    amount:     row.amount,
    amountPaid: row.amount_paid,
    dueDate:    row.due_date,
    type:       row.type,
    notes:      row.notes,
    createdAt:  row.created_at,
    sourceTxId:      row.source_tx_id ?? null,
    sourceCategory:  row.source_category ?? null,
    archivedAt:      row.archived_at ?? null,
    updatedAt:  row.updated_at,
  }
}

/** @param {Record<string, any>} row  a row as Supabase returned it */
export function rowToRecurring(row) {
  return {
    ...syncIdOf(row),
    name:      row.name,
    amount:    row.amount,
    category:  row.category,
    account:   row.account,
    frequency: row.frequency,
    nextDate:  row.next_date,
    active:    row.active,
    split:     row.split ?? null,
    updatedAt: row.updated_at,
  }
}

/** @param {Record<string, any>} row  a row as Supabase returned it */
export function rowToTemplate(row) {
  return {
    ...syncIdOf(row),
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
    ...syncIdOf(row),
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
  const [nameMeta, currencyMeta, skipMeta, rolloverMeta] = await Promise.all([
    db.meta.get('displayName'),
    db.meta.get('currency'),
    db.meta.get('skipConfirm'),
    db.meta.get('budgetRollover'),
  ])
  const accentColor = localStorage.getItem('accentColor') ?? '#2D9DFF'
  /* 'spendr-theme' - ThemeContext namespaces its key. Theme and accent both
     live in localStorage rather than Dexie because they have to be readable
     before the database opens, or the first paint is the wrong colour. */
  const theme = localStorage.getItem('spendr-theme')
  /* The newest of the three local stamps, not `now`.
     
     Sending `now` would make every push look newer than every pull, which
     defeats the comparison on the other side the moment two devices are in
     play - the second device's pull would always lose to whichever one
     synced last, regardless of who actually changed a setting. */
  const localTs = [nameMeta, currencyMeta, skipMeta, rolloverMeta]
    .map(m => (m?.updatedAt ? new Date(m.updatedAt).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0)
  const row = {
    user_id:      userId,
    display_name: nameMeta?.value ?? null,
    currency:     currencyMeta?.value ?? 'PHP',
    accent_color: accentColor,
    skip_confirm: skipMeta?.value ?? false,
    /* Both were the settings that reset themselves on a new device: theme
       never crossed at all, and budget_rollover had nowhere to go until 015.
       The second matters more than it sounds - it decides whether every
       category carries its unspent budget forward, so a fresh install
       quietly changed what the budget page reported. */
    theme:           theme ?? null,
    budget_rollover: rolloverMeta?.value ?? null,
    updated_at:   new Date(localTs || Date.now()).toISOString(),
  }
  const { error } = await supabase
    .from('user_preferences')
    .upsert(row, { onConflict: 'user_id' })
  if (!error) return

  /* Drop the columns 015 adds and try once more, the same net every other
     push has. A database that has not had the migration would otherwise
     fail the whole preferences push - and take the display name, the
     currency and the accent down with the two new fields. Degraded means
     theme and the carry-over switch stay on this device. */
  if (UNKNOWN_COLUMN.test(error.message ?? '')) {
    const retry = /** @type {Record<string, any>} */ ({ ...row })
    for (const col of OPTIONAL_COLS.user_preferences ?? []) delete retry[col]
    const { error: again } = await supabase
      .from('user_preferences')
      .upsert(retry, { onConflict: 'user_id' })
    if (!again) {
      console.warn('[sync] user_preferences: run migration 015 for theme and carry-over')
      return
    }
    throw new Error(`user_preferences push: ${again.message}`)
  }

  throw new Error(`user_preferences push: ${error.message}`)
}

/** @param {string} userId */
export async function pullPreferences(userId) {
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

  /* ── Newer wins, which every other table already did and this did not ──
     
     This used to overwrite local unconditionally, and fullSync pulls BEFORE
     it pushes - so a preference changed since the last sync was reverted by
     the next one and then pushed back in its reverted state. Turn on "Skip
     confirmation", switch away from the app and back, and it is off again on
     both devices. Same for the display name, the currency and the accent.
     
     The fix is the rule pullSimpleTable has always used - compare updated_at
     and take the newer - which needs the local side to carry a time, so the
     three writers stamp one now. A local row with no stamp counts as 0 and
     loses, which is right: it predates this and the remote value is all the
     information there is. */
  const remoteTs = data.updated_at ? new Date(data.updated_at).getTime() : 0
  /** @param {string} key */
  const localIsNewer = async (key) => {
    const row = await db.meta.get(key)
    const localTs = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0
    return localTs > remoteTs
  }

  if (data.display_name && !(await localIsNewer('displayName'))) {
    await db.meta.put({ key: 'displayName', value: data.display_name, updatedAt: data.updated_at })
    await db.meta.put({ key: 'userName',    value: data.display_name, updatedAt: data.updated_at })
  }
  if (data.currency && !(await localIsNewer('currency'))) {
    await db.meta.put({ key: 'currency', value: data.currency, updatedAt: data.updated_at })
  }
  if (data.accent_color) {
    localStorage.setItem('accentColor', data.accent_color)
  }
  /* Applied on the next boot rather than this one, the same as the accent:
     both are read once when ThemeContext initialises. A pull that arrives
     mid-session leaves the colours alone until the app is next opened, which
     is the case this exists for - a reinstall, where it is opened next
     anyway. */
  if (data.theme) {
    localStorage.setItem('spendr-theme', data.theme)
  }
  if (data.budget_rollover != null && !(await localIsNewer('budgetRollover'))) {
    await db.meta.put({ key: 'budgetRollover', value: data.budget_rollover, updatedAt: data.updated_at })
  }
  if (data.skip_confirm != null && !(await localIsNewer('skipConfirm'))) {
    await db.meta.put({ key: 'skipConfirm', value: data.skip_confirm, updatedAt: data.updated_at })
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
      const opts = { onConflict: 'user_id,tx_id', ignoreDuplicates: false }
      const { error } = await supabase.from('transactions').upsert(rows, opts)
      if (error) {
        /* Transactions do not go through pushTable, so they never had its
           unknown-column net - which meant 009 was the first migration that
           could break transaction sync outright rather than degrade it.
           Same retry, same reasoning: drop what the table does not know
           about and push the rows, so the ledger still syncs on a database
           that is a migration behind. */
        const optional = OPTIONAL_COLS.transactions ?? []
        if (optional.length && UNKNOWN_COLUMN.test(error.message ?? '')) {
          const trimmed = rows.map(row => {
            const copy = { ...row }
            for (const col of optional) delete copy[col]
            return copy
          })
          const retry = await supabase.from('transactions').upsert(trimmed, opts)
          if (retry.error) throw new Error(`transactions push: ${retry.error.message}`)
          console.warn(
            '[sync] transactions: dropping %s and retrying.'
            + ' Run 009_refunds_splits_shared.sql to sync them: %s',
            optional.join(', '), error.message,
          )
        } else {
          throw new Error(`transactions push: ${error.message}`)
        }
      }
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
  /* Resolved on the STABLE id, not on local_id. See 011 - and the failure
     that finally forced it, which was not the slow duplication the migration
     was written for but a hard stop:

       local debt at id 5 carries syncId X
       the remote row carrying X sits at local_id 21, because the ids moved
       upsert on (user_id, local_id=5) matches nothing, so it INSERTs
       the insert carries syncId X, which the partial unique index rejects

     and the push throws, taking every table after it down with it. Once the
     ids on the two sides stop lining up, local_id is not merely a weak key,
     it is one that cannot succeed. */
  await pushTable('debts',      db.debts,      debtToRow,     userId, 'user_id,sync_id')
  await pushTable('recurring',  db.recurring,  recurringToRow, userId, 'user_id,sync_id')
  await pushTable('templates',  db.templates,  templateToRow,  userId, 'user_id,sync_id')
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
/* 011 adds sync_id to all six of these. It is listed as optional on every one
   because a phone running this build can meet a database that has not had 011
   applied, and losing the stable id must cost nothing more than staying on
   local_id for another sync - which is exactly where we already are. */
const OPTIONAL_COLS = {
  accounts: ['design', 'custom_color', 'interest_rate', 'late_fee', 'sync_id'],
  categories: ['sync_id'],
  goals: ['sync_id'],
  /* created_at is declared in 003_schema.sql, so it should be there - but a
     live table can have drifted from the migrations, and this is the existing
     net for exactly that. If it is missing the push drops the column and
     retries instead of failing template sync outright. */
  templates: ['created_at', 'sync_id'],
  /* 009. Until it is run, a refund still nets correctly on another device -
     the amount is negative and every sum adds - it just loses the link back
     to what it refunded. Degraded, not wrong, which is the right trade for
     not blocking the ledger on a migration. */
  transactions: ['refund_of', 'split_id', 'settles', 'credit_sync_id'],
  user_preferences: ['theme', 'budget_rollover'],
  debts: ['source_tx_id', 'source_category', 'sync_id', 'archived_at'],
  /* 010. Until it runs, a shared bill still posts and still charges the
     right amount - it just stops opening the receivables on another
     device. */
  recurring: ['split', 'sync_id'],
}

// PostgREST reports an unknown column as PGRST204 with a message naming it,
// and Postgres itself as 42703. Matching the text covers both and does not
// depend on which layer rejected it.
const UNKNOWN_COLUMN = /could not find the '.*' column|does not exist|42703|PGRST204/i

/**
 * A push rejected by a unique constraint on local_id, which is never the
 * conflict target for the tables that hit this.
 *
 * Renaming an account makes the push an INSERT - no remote row carries the
 * new name - and that INSERT repeats the local_id the renamed row already
 * has remotely. `accounts_user_id_local_id_key` rejects it, and because the
 * violated constraint is not the one the upsert is resolving on, no upsert
 * can get past it. syncToSupabase awaits each push in turn, so one rename
 * stopped every table after it from syncing at all.
 *
 * 008_rename_safe_sync.sql drops those two constraints, which is the actual
 * fix and explains itself at length. This is what keeps sync working on a
 * database where that has not been run yet - including, unavoidably, every
 * device that syncs before its owner gets round to it.
 */
/**
 * Exported for the test, because the regex is the whole risk here.
 *
 * A first draft alternated on the bare SQLSTATE `23505`, which is EVERY
 * unique violation. Paired with the caller's guard - any table whose conflict
 * target is not local_id - that would have quietly retried a genuine
 * duplicate-name or duplicate-tx_id rejection with a column stripped out.
 * Matching the constraint by name is the precise signal and costs nothing.
 *
 * @param {string} [message]
 */
export function isLocalIdConflict(message) {
  return /duplicate key value.*_user_id_local_id_key/is.test(String(message ?? ''))
}

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

  /* A row with no stable id cannot be upserted on one.
   *
   * The index behind `user_id,sync_id` is PARTIAL - `where sync_id is not
   * null` - so a null simply does not participate: it can never conflict,
   * and every push would insert another copy. One unstamped row would
   * duplicate itself on every sync, for ever.
   *
   * db.js v11 backfills every row and its creating hook stamps every new
   * one, so this should find nothing. It is here because the failure mode is
   * unbounded growth rather than an error. */
  if (conflictCols.includes('sync_id')) {
    const before = rows.length
    rows = rows.filter(r => r.sync_id)
    if (rows.length < before) {
      console.warn('[sync] %s: %d row(s) have no syncId and were not pushed',
        tableName, before - rows.length)
    }
    if (!rows.length) return
  }

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

  /* Retry without local_id. It is a convenience, not an identity: the pull
     looks a row up by local_id first and falls straight back to its name, so
     a row that arrives with none still reconciles. Losing it costs a lookup;
     letting the push throw costs every table after this one. */
  if (isLocalIdConflict(error.message) && !conflictCols.includes('local_id')) {
    const withoutLocalId = rows.map(({ local_id: _drop, ...rest }) => rest)
    const retry = await supabase.from(tableName).upsert(withoutLocalId, opts)
    if (!retry.error) {
      console.warn(
        '[sync] %s: a renamed row collided on local_id, so it was pushed without one.'
        + ' Run 008_rename_safe_sync.sql to stop this recurring: %s',
        tableName, error.message,
      )
      return
    }
  }

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

/** How many rows to ask for at a time. */
const PAGE = 1000

/**
 * How far the last sync got, per stream, as an ISO timestamp.
 *
 * ── Why the high-water mark is the MAX ROW SEEN, not "now" ──
 *
 * The obvious version stamps the clock when a sync finishes. That loses a row
 * written between the query returning and the clock being read, and it is
 * wrong by however far the phone's clock is from the server's - which on a
 * phone is a real quantity, not a rounding error.
 *
 * Taking the largest updated_at actually received has neither problem. It is
 * a value the SERVER produced, so it is in the server's own time; and
 * anything newer than the newest row seen is, by definition, still to come.
 * The worst case is re-reading a row, which is idempotent.
 *
 * ── Which streams may use one ──
 *
 * transactions and deletions, and nothing else. Both have their timestamp
 * written by Postgres - transactions by the set_updated_at trigger, deletions
 * by the tombstone's own default. The other six tables carry whatever the
 * client wrote, so a watermark over them would skip every row written by a
 * device whose clock runs slow. They are a few dozen rows; they get pulled in
 * full, for ever, and that is the right trade.
 */
const WATERMARK_KEY = 'syncWatermark'

async function getWatermarks() {
  const row = await db.meta.get(WATERMARK_KEY)
  return row?.value ?? {}
}

/** Only ever forward. An out-of-order write must not rewind the stream.
 *  @param {string} name @param {string|null} iso */
async function advanceWatermark(name, iso) {
  if (!iso) return
  const marks = await getWatermarks()
  if (marks[name] && marks[name] >= iso) return
  await db.meta.put({ key: WATERMARK_KEY, value: { ...marks, [name]: iso } })
}

/** Back to a full pull next time. Anything that rewrites the local database
 *  behind sync's back has to call this, or the delta will step over rows the
 *  new copy never had. */
export async function resetWatermarks() {
  await db.meta.delete(WATERMARK_KEY)
}

/** The newest timestamp in a batch, for the watermark. Exported for the test:
 *  it is what decides how far the stream advances, so it is worth pinning.
 *  @param {any[]} rows @param {string} column */
export function newest(rows, column) {
  let max = null
  for (const r of rows) {
    const v = r?.[column]
    if (v && (!max || v > max)) max = v
  }
  return max
}

/**
 * Rows deleted elsewhere, removed from here.
 *
 * A pull cannot tell "deleted" from "you already have it" by absence, so a
 * deletion has to arrive as its own row. Migration 014 writes one from an
 * AFTER DELETE trigger, which is why nothing in the client has to remember to
 * record them.
 *
 * Balances are reversed on the way out. The device that did the deleting
 * reversed its own; this one has to reverse ITS copy or every account it
 * touched drifts by the amount of the row. Nothing is cascaded here - each
 * row the other device removed produced a tombstone of its own, so the same
 * set arrives, and cascading would double up.
 *
 * @param {string} userId
 */
async function pullDeletions(userId) {
  const marks = await getWatermarks()
  const rows = await fetchAllRows('deletions', userId, supabase,
    marks.deletions ? { column: 'deleted_at', after: marks.deletions } : null)
  if (!rows.length) return

  for (const t of rows) {
    const key = t.row_key
    if (!key) continue

    if (t.table_name === 'transactions') {
      const tx = await db.transactions.where('txId').equals(key).first()
      if (!tx) continue
      await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
        await reverseBalanceEffect(/** @type {any} */ (tx))
        await db.transactions.delete(tx.id)
      })
      continue
    }

    if (!SYNCED_TABLES.includes(t.table_name)) continue
    const table = db.table(t.table_name)
    const row = await table.where('syncId').equals(key).first()
    if (row) await table.delete(row.id)
  }

  await advanceWatermark('deletions', newest(rows, 'deleted_at'))
}

/**
 * Every row of a table, however many there are.
 *
 * ── The bug this is the fix for ──
 *
 * The pulls used to be a bare `.select('*').eq('user_id', …)`, which reads as
 * "all of them" and is not. PostgREST caps what one response may contain -
 * Supabase ships that cap at 1,000 - and it does not fail when it truncates.
 * It returns 1,000 rows and a 200.
 *
 * So the pull worked perfectly for a year and then quietly stopped bringing
 * back the newest transactions, on the day the table reached 1,001. Signing
 * in on a fresh device restored everything up to early September and silently
 * dropped the 36 rows past the cap. Nothing errored, nothing was logged, and
 * the only symptom was recent history missing.
 *
 * ── Why it advances by what arrived ──
 *
 * Not by PAGE. If the server's cap is lower than PAGE - a project can be
 * configured to 100 - then every page comes back short, and a loop that
 * stopped on `length < PAGE` would stop after the first one and call it
 * complete. Stepping by the number of rows actually received is correct
 * whatever the cap turns out to be, and the loop ends on an empty page.
 *
 * ── Why it orders ──
 *
 * A range over an unordered query is not a stable window: Postgres may return
 * rows in a different order between requests, so pages could overlap and miss.
 * `id` is the primary key, so it is unique and total.
 *
 * Exported, and `client` injectable, because the loop is the whole risk and
 * it cannot be exercised against a real Supabase in a unit test - the same
 * reason deleteRecurringRemote takes its queue.
 *
 * @param {string} tableName
 * @param {string} userId
 * @param {any} [client]
 * @param {{column: string, after: string}|null} [since]  only rows changed
 *   after this timestamp - see the watermark note on pullTxs
 */
export async function fetchAllRows(tableName, userId, client = supabase, since = null) {
  /** @type {any[]} */
  const out = []
  let from = 0

  /* A page counter, not a row counter: the exit is the empty page, and this
     only exists so a server that somehow always returns rows cannot spin
     forever. 1,000 pages is a million rows. */
  for (let guard = 0; guard < 1000; guard++) {
    let q = client
      .from(tableName)
      .select('*')
      .eq('user_id', userId)
    if (since) q = q.gt(since.column, since.after)

    const { data, error } = await q
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`${tableName} pull: ${error.message}`)
    if (!data?.length) break

    out.push(...data)
    from += data.length
  }

  return out
}

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
  /* Matched on NAME alone. It used to require the amount to match too, and
     that is what duplicated a bill every time one was edited:

       remote iCloud 599, local iCloud edited to 699
       -> local_id does not resolve (ids shift after a JSON restore)
       -> falls back here, 599 !== 699, no match
       -> the remote row is added as a SECOND bill

     and the copy could not be deleted, because the remote delete is queued by
     local_id and the remote row's id is the stale one. Every refresh brought
     it back.

     Amount is the field most likely to change on a bill and the worst
     possible thing to identify one by. Two bills sharing a name is far rarer,
     and merging those is recoverable in a way that a resurrecting duplicate
     is not. */
  await pullSimpleTable('recurring', db.recurring, rowToRecurring, null, userId,
    row => (row.name ? db.recurring.where('name').equals(row.name).first() : null),
    pending)
  await pullSimpleTable('templates',  db.templates,  rowToTemplate,  'name', userId, null, pending)
  await optionalSync('goals pull', () =>
    pullSimpleTable('goals', db.goals, rowToGoal, 'name', userId, null, pending))
  await optionalSync('badges pull', () => pullBadges(userId))

  // Guarantee system categories exist locally even if never pushed to Supabase
  await ensureSystemCategories()
}

/** @param {string} userId */
async function pullTxs(userId) {
  /* Only what has changed since last time.
   *
   * The ledger is the one table that grows without limit, and the only one
   * whose updated_at is written by Postgres rather than by whichever phone
   * happened to save the row - see the note on WATERMARK_KEY for why that
   * distinction decides which streams may use a watermark at all.
   *
   * With no watermark this is a full pull, paged. That is the first sync on a
   * device, and it is also what a restore falls back to, because
   * restoreBackup clears the mark. */
  const marks = await getWatermarks()
  const data = await fetchAllRows('transactions', userId, supabase,
    marks.transactions ? { column: 'updated_at', after: marks.transactions } : null)
  if (!data.length) return

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

  /* After the write, never before. A watermark moved ahead of rows that were
     not stored is a gap nothing will ever go back for. */
  await advanceWatermark('transactions', newest(data, 'updated_at'))
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
  const data = await fetchAllRows(tableName, userId)
  if (!data.length) return

  // Every stable id the server knows about, for the collision test below.
  const remoteSyncIds = new Set(data.map(r => r.sync_id).filter(Boolean))

  for (const row of data) {
    if (isPendingDelete(pending, tableName, row)) continue

    /* Identity first. A stamped row is found by its stamp and nothing else,
       because being findable is the entire job of having one. */
    const bySync = row.sync_id
      ? await dexieTable.where('syncId').equals(row.sync_id).first()
      : null

    const localId = row.local_id
    const existing = bySync ? null : localId ? await dexieTable.get(localId) : null

    // Prefer a custom finder (compound key), fall back to single nameKey
    const byName = (bySync || existing) ? null
      : findFn ? await findFn(row)
      : nameKey && row[nameKey]
        ? await dexieTable.where(nameKey).equals(row[nameKey]).first()
        : null

    /* A weaker key matched a row that already carries a DIFFERENT stable id.
       Whether that is a collision turns on one question: is the local row's
       own id present on the server?

         it is      - this local row is already represented remotely, so the
                      row we are holding is a second one and local_id agreeing
                      is the coincidence. Refuse, and let it arrive as itself.

         it is not  - nobody has ever seen this local row's id, which is what
                      the v11 upgrade looks like from the other side: both
                      devices minted an id for a row that predates stamping
                      and neither knows about the other's. Adopt, and the two
                      converge on the server's.

       Refusing in that second case is what would turn every pre-existing row
       into a duplicate the first time a second device syncs - the exact
       failure this whole change exists to prevent. */
    const weak = existing ?? byName
    const collides = !!(
      row.sync_id && weak?.syncId && weak.syncId !== row.sync_id
      && remoteSyncIds.has(weak.syncId)
    )

    const target   = bySync ?? (collides ? null : weak)
    const remotets = row.updated_at ? new Date(row.updated_at).getTime() : 0
    const localts  = target?.updatedAt ? new Date(target.updatedAt).getTime() : 0

    if (!target) {
      await dexieTable.add(fromRow(row))
    } else {
      /* Adopt the remote identity even when the remote CONTENT is older.
         Identity is not content. Both devices minted their own syncId in the
         v11 upgrade, so for any row that predates this they hold two ids for
         one thing and have to converge on one - and the one already on the
         server is the one every other device will meet. Gate this behind the
         timestamp and the device holding the newer copy never yields, so the
         two never agree and every sync re-inserts. */
      if (row.sync_id && target.syncId !== row.sync_id) {
        /* syncId alone, and that matters: db/db.js treats a bookkeeping-only
           change as not an edit and leaves updatedAt where it is. Bumping it
           here would leave the row permanently newer than the copy it just
           synced from, so the real content could never arrive. */
        await dexieTable.update(target.id, { syncId: row.sync_id })
      }
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
  const data = await fetchAllRows('badges', userId)
  if (!data.length) return

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
  /* And the ones somebody else made. Before the content pull rather than
     after: a row deleted remotely is not in the content pull anyway, and
     doing it first means a device coming back from a long absence sheds what
     is gone before it starts merging what is not. */
  await optionalSync('deletions pull', () => pullDeletions(userId))
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
 * @param {string|null} [syncId]  the row's stable id, when it has one
 * @param {typeof queueRemoteDelete} [queue]
 */
export async function deleteDebtRemote(_userId, debtId, syncId = null, queue = queueRemoteDelete) {
  await queue('debts', { local_id: debtId })
  /* And by the stable id when the row has one, for the reason spelled out
     under deleteRecurringRemote: a local_id shifts whenever the database is
     cleared and re-filled, and a delete aimed at an id the server no longer
     recognises matches nothing at all - the row survives, the next pull
     brings it back, and deleting it again does nothing either. sync_id does
     not shift. Queueing both costs one extra no-op DELETE and covers the
     rows that predate stamping. */
  if (syncId) await queue('debts', { sync_id: syncId })
}

/**
 * Bills push on local_id but pull matches on NAME, so queue both - the same
 * shape deleteTemplateRemote uses, and for the same reason.
 *
 * By id alone was not enough: a local_id shifts whenever the database is
 * cleared and re-filled (a JSON restore does exactly that, since Dexie's
 * auto-increment does not reset), and a delete aimed at an id the remote row
 * no longer has matches nothing. The row survives, the next pull re-adds it,
 * and deleting it again does nothing either.
 *
 * Deleting one row too many is repaired by the push that follows, which
 * re-uploads every surviving local bill.
 *
 * `queue` is injectable so this can be tested without a database - the two
 * calls it makes ARE the behaviour, and they are what went wrong.
 *
 * @param {number|null} localId
 * @param {string} [name]
 * @param {(table: string, match: Record<string, any>) => any} [queue]
 */
export async function deleteRecurringRemote(localId, name, queue = queueRemoteDelete) {
  if (localId != null) await queue('recurring', { local_id: localId })
  if (name)            await queue('recurring', { name })
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
