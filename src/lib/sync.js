import db, { dbReady, getUnsyncedTxs, SYNCED, SYNCED_TABLES, TRASH_DAYS, UNSYNCED } from '../db/db'
import { reconcileBalances } from '../db/balances'
import { supabase } from './supabase'
import { roundMoney } from './currency'
import { SYNCED_WITH_KEY, accountHasData, deviceStanding, localOnlyDeltas } from './firstSync'
// Single definition, shared with onboarding — the two lists used to be
// separate copies, so a system category added to one was missing from the
// other and new users ended up with a different set than syncing users.
import { SYSTEM_CATS } from './phCategories'
import { NUDGE_KEY } from './nudge'
import { FORECAST_FLOOR_KEY, FORECAST_SETTINGS_KEY, readForecastSettings } from './forecastSettings'
import { TREND_SETTINGS_KEY, readTrendSettings } from './trendSettings'
import { asRemoteWrites } from './syncSignal'
import { docText, noteTitle } from './noteText'

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

/**
 * Take back a remote delete that has not gone out yet - for a row that has
 * been put back (Recently deleted). Matched on every column the queued
 * delete names, so only a delete aimed at this row is dropped.
 *
 * @param {string} table
 * @param {Record<string, any>} row  column/value pairs the row can be known by
 */
export async function cancelRemoteDelete(table, row) {
  const meta = await db.meta.get(PENDING_KEY)
  const list = meta?.value ?? []
  const kept = list.filter((/** @type {{table: string, match?: Record<string, any>}} */ p) => !(p.table === table
    && Object.entries(p.match ?? {}).length > 0
    && Object.entries(p.match ?? {}).every(([k, v]) => row[k] !== undefined && row[k] === v)))
  if (kept.length !== list.length) await db.meta.put({ key: PENDING_KEY, value: kept })
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
// follows re-uploads every surviving local row - which is why a table that
// had a delete land is put back to wholly unsent below: a push now sends only
// the rows that have changed, and a survivor of an over-broad delete (two goals
// with one name) has not.
/** @param {string} userId */
async function flushPendingDeletes(userId) {
  const list = await getPendingDeletes()
  if (!list.length) return

  const remaining = []
  /** @type {Set<string>} */
  const landed = new Set()
  for (const entry of list) {
    let q = supabase.from(entry.table).delete().eq('user_id', userId)
    for (const [col, val] of Object.entries(entry.match ?? {})) q = q.eq(col, val)
    const { error } = await q
    if (error) {
      console.error('[sync] delete %s failed:', entry.table, error.message)
      remaining.push(entry)
    } else {
      landed.add(entry.table)
    }
  }
  await db.meta.put({ key: PENDING_KEY, value: remaining })
  for (const table of landed) await forgetSent(table)
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
 * A transaction as the other devices are told of it the moment it is saved
 * (lib/liveShare.js): the row the cloud will hold, so applyRemoteTransaction
 * takes it as it takes one from the stream, with this device's own stamp where
 * the cloud's is not written yet. The cloud's replaces it a moment later.
 *
 * @param {Transaction} r
 * @param {string} userId
 * @returns {Record<string, any>}
 */
export function toShareRow(r, userId) {
  return { ...toSupabaseRow(r, userId), updated_at: r.updatedAt }
}

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
    /* Which bill wrote this charge. 017 - and unlike recurringId beside it,
       this one is portable, so a bill's history survives a new device. */
    recurring_sync_id: r.recurringSyncId ?? null,
    /* 018. What the amount is IN, and what it was worth in the ledger's
       currency on the day - priced once, at write time, because re-deriving
       a past figure at today's rate rewrites a month you had closed. Null on
       every row written before the column existed, which reads as "the
       ledger's own currency, at parity" and is true of all of them. */
    currency:         r.currency ?? null,
    base_amount:      r.baseAmount ?? null,
    base_currency:    r.baseCurrency ?? null,
    /* 019. What ARRIVED at the destination of a transfer between two
       currencies, and in which one. Null on every other row - a same-currency
       transfer lands as `amount` - see lib/transferLegs.js. */
    to_amount:        r.toAmount ?? null,
    to_currency:      r.toCurrency ?? null,
    /* 023. A row the app wrote to move a balance rather than money you earned
       or spent - 'correction' or 'value'. See lib/flows.js. Null on every
       other row. */
    adjust:           r.adjust ?? null,
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
    /* 033. What the account opened with; every device works the balance out
       from it and its own ledger (db/balances.js reconcileBalances), so the
       balance above is only the sender's view of it. */
    opening_balance: typeof r.opening === 'number' ? r.opening : null,
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
    /* 023. An investment's kind, what had gone into it before Spendr was
       keeping track, and the day its value was last confirmed - see
       lib/investments.js. Null on everything else. */
    kind:            r.kind           ?? null,
    invested_start:  r.investedStart  ?? null,
    valued_at:       r.valuedAt       ?? null,
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
    /* 032. Whether this category carries its unspent budget into the next
       month - true, false, or null for "follow the setting for all of them" -
       and the month it started carrying from (lib/rollover.js). Until 032 has
       run the push leaves both out and retries (OPTIONAL_COLS), so they stay
       on the device that set them. */
    rollover:      r.rollover ?? null,
    rollover_from: r.rolloverFrom ?? null,
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
    /* 023. 'inflow' for income that arrives on a schedule - a salary. Null is
       a bill, which is every row written before the column existed. */
    type:       r.type ?? null,
    /* 032. The day of the month a monthly, quarterly or yearly bill falls on,
       so one due on the 31st does not drift to the 28th the first time a
       short month rolls it forward. Null for a bill that has none, which is
       every row written before the column existed. */
    due_day:    r.dueDay ?? null,
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
 * One attempt at a challenge. See migrations/021_challenges.sql.
 *
 * No local_id, unlike the tables that predate syncIds. The pull falls back to
 * matching on it when a sync_id is new to this device - which for those
 * tables is how a row from before stamping finds itself. Every challenge has
 * had a syncId from the moment it was created, so here the fallback could only
 * ever do harm: two devices each number their first challenge 1, and the
 * second to sync would take the first's over and lose its own.
 *
 * @param {ChallengeRow} r
 * @param {string} userId
 */
export function challengeToRow(r, userId) {
  return {
    user_id:     userId,
    sync_id:     r.syncId ?? null,
    key:         r.key,
    // jsonb: a cap and its category, an amount - whatever that challenge was started with.
    params:      r.params ?? {},
    start_day:   r.startDay,
    end_day:     r.endDay,
    status:      r.status,
    started_at:  r.startedAt ?? null,
    finished_at: r.finishedAt ?? null,
    updated_at:  r.updatedAt ?? new Date().toISOString(),
  }
}

/**
 * One deletion in Recently deleted. See migrations/022_trash.sql.
 *
 * Sent without this device's row numbers. The copies inside are of rows as
 * they were HERE - a transaction's `id`, a debt's, the bill a charge came
 * from - and those numbers name different rows, or nothing, on another
 * device: putting one back there would find "it is already back" in some
 * stranger at the same number, or roll the wrong bill's date on. What is
 * left identifies each row everywhere - a transaction's txId, a debt's
 * syncId, a charge's recurringSyncId - and that is what putting back looks
 * things up by.
 *
 * @param {Record<string, any>} r
 * @param {string} userId
 */
export function trashToRow(r, userId) {
  /** @param {Record<string, any>} o @param {string[]} keys */
  const without = (o, keys) => {
    const copy = { ...o }
    for (const k of keys) delete copy[k]
    return copy
  }
  return {
    user_id:    userId,
    sync_id:    r.syncId ?? null,
    deleted_at: r.deletedAt,
    entry: {
      txs:      (r.txs ?? []).map((/** @type {Record<string, any>} */ t) => without(t, ['id', 'recurringId', 'synced'])),
      /* syncedAt is this device's note of what it last agreed on with the
         cloud: of no use to another device, and put back on a row it would
         read as "sent already" for a row that never was. */
      debts:    (r.debts ?? []).map((/** @type {Record<string, any>} */ d) => without(d, ['id', 'synced', 'syncedAt'])),
      unhooked: (r.unhooked ?? []).map((/** @type {Record<string, any>} */ u) => without(u, ['id'])),
      paid:     (r.paid ?? []).map((/** @type {Record<string, any>} */ p) => without(p, ['id'])),
    },
    updated_at: r.updatedAt ?? r.deletedAt ?? new Date().toISOString(),
  }
}

/**
 * A note. See migrations/027_notes.sql.
 *
 * The document goes up whole, as jsonb, the way Recently deleted's entries
 * do: it is read back as one piece, never queried inside. The title rides
 * along only so the table reads sensibly on the server; the device that pulls
 * a note works its own out from the document (rowToNote), so the two cannot
 * disagree.
 *
 * @param {NoteRow} r
 * @param {string} userId
 */
export function noteToRow(r, userId) {
  return {
    user_id:    userId,
    sync_id:    r.syncId ?? null,
    title:      r.title ?? '',
    content:    r.doc && typeof r.doc === 'object' ? r.doc : {},
    pinned:     !!r.pinned,
    /* Filing (028_note_folders.sql): the folder is named by its syncId, which
       is the same on every device, and the tags are plain words. Until 028
       has run the push leaves both out and retries (OPTIONAL_COLS). */
    tags:           Array.isArray(r.tags) ? r.tags : [],
    folder_sync_id: r.folder ?? null,
    created_at: r.createdAt ?? null,
    edited_at:  r.editedAt ?? null,
    deleted_at: r.deletedAt ?? null,
    updated_at: r.updatedAt ?? new Date().toISOString(),
  }
}

/**
 * A folder of notes. See migrations/028_note_folders.sql.
 *
 * @param {NoteFolderRow} r
 * @param {string} userId
 */
export function folderToRow(r, userId) {
  return {
    user_id:    userId,
    sync_id:    r.syncId ?? null,
    name:       r.name,
    created_at: r.createdAt ?? null,
    updated_at: r.updatedAt ?? new Date().toISOString(),
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
    recurringSyncId: row.recurring_sync_id ?? null,
    currency:     row.currency ?? null,
    baseAmount:   row.base_amount ?? null,
    baseCurrency: row.base_currency ?? null,
    /* Only when the remote HAS the column. A database that has not had 019
       returns rows without the key, and writing null here would wipe a
       received leg this device knows about - the pull spreads this over the
       local row, so an absent key has to stay absent. */
    ...('to_amount' in row ? { toAmount: row.to_amount ?? null, toCurrency: row.to_currency ?? null } : {}),
    // 023. Only when set - a row is never un-marked - for the same reason as above.
    ...(row.adjust ? { adjust: row.adjust } : {}),
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
    // 033. Only when the cloud has one: a null must not blank the one this device worked out.
    ...(row.opening_balance != null && Number.isFinite(Number(row.opening_balance)) ? { opening: Number(row.opening_balance) } : {}),
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
    /* 023. Only when set: none of these is ever cleared back to nothing, and
       a database without the columns must not blank what this device knows. */
    ...(row.kind ? { kind: row.kind } : {}),
    ...(row.invested_start != null ? { investedStart: row.invested_start } : {}),
    ...(row.valued_at ? { valuedAt: row.valued_at } : {}),
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
    /* 032. Only when the server has a value: a database that has not had the
       migration returns rows without the keys, and a category nobody has set
       a carry-over on returns nulls - neither says anything about this
       device's choice, and spreading a null over it would un-set it. The app
       only ever turns a carry-over on or off, never back to "unset", so a
       null is always "never set", the same reading 023's columns get. */
    ...(row.rollover != null ? { rollover: !!row.rollover } : {}),
    ...(row.rollover_from ? { rolloverFrom: row.rollover_from } : {}),
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
    /* 023. Only when there is one: every row written since says 'inflow' or
       'expense' outright, and a null is a bill from before the column - left
       absent, so it cannot turn a salary this device knows back into a bill. */
    ...(row.type ? { type: row.type } : {}),
    /* 032. Only when there is one, for the same reason: a database without
       the column, or a bill from before it, must not blank the day this
       device knows the bill falls on. */
    ...(row.due_day != null ? { dueDay: Number(row.due_day) } : {}),
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

/** @param {Record<string, any>} row  a row as Supabase returned it */
export function rowToChallenge(row) {
  return {
    ...syncIdOf(row),
    key:        row.key,
    params:     row.params && typeof row.params === 'object' ? row.params : {},
    startDay:   row.start_day,
    endDay:     row.end_day,
    status:     row.status ?? 'active',
    startedAt:  row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    updatedAt:  row.updated_at,
    synced:     SYNCED,
  }
}

/**
 * A note from the server. Its title and text are worked out here, from the
 * document itself, rather than taken from the row.
 *
 * `pushed`: it is on the server, so deleting it for good has to delete it
 * there too (lib/notes.js deleteNoteForever).
 *
 * @param {Record<string, any>} row  a row as Supabase returned it
 * @returns {NoteRow}
 */
export function rowToNote(row) {
  const doc = row.content && typeof row.content === 'object' && row.content.type === 'doc'
    ? row.content
    : { type: 'doc', content: [] }
  return {
    ...syncIdOf(row),
    doc,
    title:     noteTitle(doc),
    text:      docText(doc),
    pinned:    !!row.pinned,
    /* Only when the server has the columns: a row from before 028 says
       nothing about filing, and must not clear what this device has set. */
    ...('tags' in row ? { tags: Array.isArray(row.tags) ? row.tags.map(String) : [] } : {}),
    ...('folder_sync_id' in row ? { folder: row.folder_sync_id ?? null } : {}),
    createdAt: row.created_at ?? null,
    editedAt:  row.edited_at ?? row.updated_at ?? null,
    deletedAt: row.deleted_at ?? null,
    updatedAt: row.updated_at,
    synced:    SYNCED,
    pushed:    true,
  }
}

/** @param {Record<string, any>} row @returns {NoteFolderRow} */
export function rowToFolder(row) {
  return {
    ...syncIdOf(row),
    name:      String(row.name ?? ''),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at,
    synced:    SYNCED,
  }
}

/** @param {Record<string, any>} row */
export function rowToTrash(row) {
  const entry = row.entry && typeof row.entry === 'object' ? row.entry : {}
  const list = (/** @type {any} */ v) => (Array.isArray(v) ? v : [])
  return {
    ...syncIdOf(row),
    deletedAt: row.deleted_at,
    txs:       list(entry.txs),
    debts:     list(entry.debts),
    unhooked:  list(entry.unhooked),
    paid:      list(entry.paid),
    updatedAt: row.updated_at,
    synced:    SYNCED,
  }
}

// ── User preferences ─────────────────────────────────────────────────────────

/** @param {string} userId */
async function pushPreferences(userId) {
  const [nameMeta, currencyMeta, skipMeta, rolloverMeta, nudgeMeta, forecastMeta, floorMeta, trendMeta] = await Promise.all([
    db.meta.get('displayName'),
    db.meta.get('currency'),
    db.meta.get('skipConfirm'),
    db.meta.get('budgetRollover'),
    db.meta.get(NUDGE_KEY),
    db.meta.get(FORECAST_SETTINGS_KEY),
    db.meta.get(FORECAST_FLOOR_KEY),
    db.meta.get(TREND_SETTINGS_KEY),
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
  const localTs = [nameMeta, currencyMeta, skipMeta, rolloverMeta, nudgeMeta, forecastMeta, floorMeta, trendMeta]
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
    /* The daily check-in (024). It has to reach every device, or the next
       device to upload the reminder list deletes the check-ins it did not
       know to build - see lib/nudge.js. */
    daily_nudge:     nudgeMeta?.value ?? null,
    /* 025. How the forecast is worked out, and its floor - so the phone and
       the laptop tell you the same thing about the next 30 days. */
    forecast_settings: forecastMeta?.value ?? null,
    forecast_floor:    floorMeta?.value ?? null,
    /* 029. How the Trend chart is drawn. */
    trend_settings:    trendMeta?.value ?? null,
    updated_at:   new Date(localTs || Date.now()).toISOString(),
  }
  const { error } = await supabase
    .from('user_preferences')
    .upsert(row, { onConflict: 'user_id' })
  if (!error) return

  /* Leave out the column the database does not have yet and try again, the
     same net every other push has. A database that has not had 015 would
     otherwise fail the whole preferences push - and take the display name,
     the currency and the accent down with the two new fields. Degraded means
     theme and the carry-over switch stay on this device. */
  const { error: again } = await upsertWithoutUnknown('user_preferences', [row], { onConflict: 'user_id' }, error)
  if (again) throw new Error(`user_preferences push: ${again.message}`)
}

/**
 * @param {string} userId
 * @param {{first?: boolean}} [opts]  a device's first sync with an account
 *   that already has data: the account's settings win, whatever the stamps say
 */
export async function pullPreferences(userId, { first = false } = {}) {
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
    /* Setup stamps the name and currency as it saves them, so they beat a
       new account's defaults. Against an account with a history, those
       stamps are only the time setup ran. See lib/firstSync.js. */
    if (first) return false
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
  /* 'off' travels as a value, not as a null, so switching the check-in off
     on one device switches it off on the others. */
  if (data.daily_nudge != null && !(await localIsNewer(NUDGE_KEY))) {
    await db.meta.put({ key: NUDGE_KEY, value: data.daily_nudge, updatedAt: data.updated_at })
  }
  // Checked on the way in: a row written by a newer version cannot break the forecast.
  if (data.forecast_settings != null && !(await localIsNewer(FORECAST_SETTINGS_KEY))) {
    await db.meta.put({ key: FORECAST_SETTINGS_KEY, value: readForecastSettings(data.forecast_settings), updatedAt: data.updated_at })
  }
  if (data.forecast_floor != null && Number.isFinite(Number(data.forecast_floor)) && !(await localIsNewer(FORECAST_FLOOR_KEY))) {
    await db.meta.put({ key: FORECAST_FLOOR_KEY, value: Math.max(0, Number(data.forecast_floor)), updatedAt: data.updated_at })
  }
  // The same: checked on the way in, so a row from a newer version cannot break the chart.
  if (data.trend_settings != null && !(await localIsNewer(TREND_SETTINGS_KEY))) {
    await db.meta.put({ key: TREND_SETTINGS_KEY, value: readTrendSettings(data.trend_settings), updatedAt: data.updated_at })
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

/** The labels of the optional steps that found their table missing, this session.
 *  unsentTables leaves those out: a push that cannot happen is not worth asking for again.
 *  @type {Set<string>} */
const absentRemotely = new Set()

/**
 * @param {string} label
 * @param {() => Promise<any>} fn
 */
async function optionalSync(label, fn) {
  try {
    await fn()
    // It ran: the table is there now (its migration was run while the app was open).
    absentRemotely.delete(label)
  } catch (e) {
    if (MISSING_TABLE.test(e?.message ?? '')) {
      absentRemotely.add(label)
      console.warn('[sync] %s skipped - run the Supabase migration:', label, e.message)
      return
    }
    throw e
  }
}

// ── Push to Supabase ──────────────────────────────────────────────────────────

/**
 * The ledger, up: queued deletions, then the transactions not yet sent.
 *
 * Its own step because it is the part that is safe to do first. A row here is
 * marked unsent by the device that wrote it, so sending it needs no pull to
 * know what is newer - which is what lets a transaction saved on the phone
 * reach the cloud before the rest of a sync has finished its round trips.
 *
 * @param {string} userId
 */
export async function pushLedger(userId) {
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
        const { error: again } = await upsertWithoutUnknown('transactions', rows, opts, error)
        if (again) throw new Error(`transactions push: ${again.message}`)
      }
    }

    // Mark as synced locally
    const ids = unsyncedTxs.map(r => r.id).filter(Boolean)
    if (ids.length) {
      await db.transactions.where('id').anyOf(ids).modify({ synced: SYNCED })
    }
  }
}

/**
 * The small tables, each pushed a row at a time by pushTable: how to read one,
 * how to turn a row of it into the cloud's, and what the upsert resolves on.
 *
 * Kept in one place because two things have to agree on it - the push, and the
 * look at what is left to push (unsentTables) - and a list that is written out
 * twice is how the second one comes to miss a table.
 *
 * `label` is the name of the optionalSync step for a table that may not exist
 * in the cloud yet (its migration not run); null for one that has to.
 *
 * @type {Record<string, {table: () => import("dexie").Table<any, any>, toRow: (r: any, userId: string) => Record<string, any>, on: string, label: string|null}>}
 */
const SMALL_TABLES = {
  accounts:     { table: () => db.accounts,     toRow: accountToRow,   on: 'user_id,name',      label: null },
  categories:   { table: () => db.categories,   toRow: categoryToRow,  on: 'user_id,name,type', label: null },
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
  debts:        { table: () => db.debts,        toRow: debtToRow,      on: 'user_id,sync_id',   label: null },
  recurring:    { table: () => db.recurring,    toRow: recurringToRow, on: 'user_id,sync_id',   label: null },
  templates:    { table: () => db.templates,    toRow: templateToRow,  on: 'user_id,sync_id',   label: null },
  goals:        { table: () => db.goals,        toRow: goalToRow,      on: 'user_id,name',      label: 'goals push' },
  badges:       { table: () => db.badges,       toRow: badgeToRow,     on: 'user_id,key',       label: 'badges push' },
  challenges:   { table: () => db.challenges,   toRow: challengeToRow, on: 'user_id,sync_id',   label: 'challenges push' },
  note_folders: { table: () => db.note_folders, toRow: folderToRow,    on: 'user_id,sync_id',   label: 'note folders push' },
}

/** The steps for the two tables that keep their own marks, by their optionalSync names. */
const TRASH_STEP = 'trash push'
const NOTES_STEP = 'notes push'

/**
 * One of the small tables, up: the rows changed since they last went.
 *
 * @param {string} name  a key of SMALL_TABLES
 * @param {string} userId
 */
function pushSmall(name, userId) {
  const spec = SMALL_TABLES[name]
  return pushTable(name, spec.table(), spec.toRow, userId, spec.on)
}

/**
 * The same, for a table that may not be in the cloud yet: fault-isolated,
 * see optionalSync above.
 *
 * @param {string} name  a key of SMALL_TABLES that has a label
 * @param {string} userId
 */
function pushOptional(name, userId) {
  return optionalSync(/** @type {string} */ (SMALL_TABLES[name].label), () => pushSmall(name, userId))
}

/**
 * @param {string} userId
 * @param {{only?: Set<string>|null}} [opts]  the tables this device has changed since it last pushed, when that is all that has to go. A table nothing was written to is not sent again: the cloud streams every row of an upsert to every device whether or not it changed. Null sends everything - which is every row that has changed, of every table, since a table sends only those either way
 */
export async function syncToSupabase(userId, { only = null } = {}) {
  if (!userId) return
  /** @param {string} table */
  const wants = (table) => !only || only.has(table)

  await pushLedger(userId)

  /* Other tables: a row at a time, and only the rows that have changed since
     they last went (see isUnsent) - and only the tables in `only` when it is
     given. Trash and notes keep their own marks, so they always run and send
     what is unsent. */
  if (wants('accounts'))   await pushSmall('accounts',   userId)
  if (wants('categories')) await pushSmall('categories', userId)
  if (wants('debts'))      await pushSmall('debts',      userId)
  if (wants('recurring'))  await pushSmall('recurring',  userId)
  if (wants('templates'))  await pushSmall('templates',  userId)
  // Last, and fault-isolated: see optionalSync above.
  if (wants('goals'))      await pushOptional('goals',      userId)
  if (wants('badges'))     await pushOptional('badges',     userId)
  if (wants('challenges')) await pushOptional('challenges', userId)
  await optionalSync(TRASH_STEP, () => pushTrash(userId))
  if (wants('note_folders')) await pushOptional('note_folders', userId)
  await optionalSync(NOTES_STEP, () => pushNotes(userId))
  if (wants('meta')) await pushPreferences(userId)
}

/**
 * A note that is waiting to go: it has an id to be known by, it has changed
 * since it last went, and it has something in it.
 *
 * @param {Record<string, any>} n
 */
const noteIsUnsent = n => !!(n.syncId && n.synced !== SYNCED && (n.text ?? '').trim())

/** @param {Record<string, any>} r  a deletion in Recently deleted */
const trashIsUnsent = r => !!(r.syncId && r.synced !== SYNCED)

/**
 * The tables that have something to send, by their names here.
 *
 * What a sync - or a pull - that has just ended looks at. A pull writes into
 * the very tables a person is using, and the watcher of local changes
 * (localChanges.js) is deliberately told nothing of what happens while it
 * does, or a pull would start a push and the push's echo a pull. That also
 * silences a person's own save made in the same moment: the row is changed,
 * marked as changed, and nobody asked for it to be sent. This is how it gets
 * asked for. Cheap by design: the small tables are a few dozen rows, and the
 * two with documents in them are only looked at as far as their first unsent
 * one.
 *
 * Without the tables whose migration has not run (they could never be sent,
 * and asking again would only repeat the refusal).
 *
 * @param {string} userId
 * @returns {Promise<Set<string>>}
 */
export async function unsentTables(userId) {
  /** @type {Set<string>} */
  const out = new Set()
  await Promise.all(Object.entries(SMALL_TABLES).map(async ([name, spec]) => {
    if (spec.label && absentRemotely.has(spec.label)) return
    const { pending } = await unsentRows(name, spec.table(), spec.toRow, userId, spec.on)
    if (pending.length) out.add(name)
  }))
  if (!absentRemotely.has(TRASH_STEP) && await db.trash.filter(trashIsUnsent).first()) out.add('trash')
  if (!absentRemotely.has(NOTES_STEP) && await db.notes.filter(noteIsUnsent).first()) out.add('notes')
  return out
}

/**
 * Every row of the small tables - or of one - put down as not sent.
 *
 * Two uses, one idea: the note on a row that it was sent no longer holds.
 *
 *   a device adding what it has to an account that already has data (the
 *   first sync's "keep both"): its rows may carry a note that they were sent -
 *   to the account this device last synced with, which is not this one. The
 *   pull that follows marks the rows it matches as the account's own; what is
 *   still unmarked after it is what this device alone has, and goes up.
 *
 *   a table that has had a delete land in the cloud (flushPendingDeletes): the
 *   delete may have taken a row this device still has, and what the cloud lacks
 *   has to be sent again whether or not it has changed.
 *
 * @param {string} [only]  a key of SMALL_TABLES; every one of them when it is left out
 */
async function forgetSent(only) {
  for (const [name, spec] of Object.entries(SMALL_TABLES)) {
    if (only && name !== only) continue
    await spec.table().toCollection().modify((/** @type {Record<string, any>} */ row) => { delete row.syncedAt })
  }
}

/**
 * Notes, up: only the ones changed since they last went.
 *
 * Not pushTable, which sends every row on every sync. A note is a document,
 * and a week of them re-sent each time the app comes to the front would be
 * all cost - so each goes when it has changed, and is marked when it has.
 *
 * Blank notes stay behind. A note is made the moment you tap the pencil, and
 * one opened and left without a word is thrown away (lib/notes.js); until it
 * has something in it, it is nobody's business but this device's.
 *
 * An edit made while the push was on its way keeps its mark: the row is
 * marked sent only if it is still the row that was sent.
 *
 * @param {string} userId
 */
async function pushNotes(userId) {
  const rows = (await db.notes.toArray()).filter(noteIsUnsent)
  if (!rows.length) return
  const opts = { onConflict: 'user_id,sync_id', ignoreDuplicates: false }
  const payload = rows.map(r => noteToRow(r, userId))
  const { error } = await supabase.from('notes').upsert(payload, opts)
  if (error) {
    const { error: again } = await upsertWithoutUnknown('notes', payload, opts, error)
    if (again) throw new Error(`notes push: ${again.message}`)
  }
  await db.transaction('rw', db.notes, async () => {
    for (const r of rows) {
      const now = await db.notes.get(/** @type {number} */ (r.id))
      if (!now) continue
      await db.notes.update(/** @type {number} */ (r.id),
        now.updatedAt === r.updatedAt ? { synced: SYNCED, pushed: true } : { pushed: true })
    }
  })
}

/**
 * Notes, down: which ones changed, and then only those, whole.
 *
 * A first request for every note's id and stamp, and a second for the notes
 * that are new here or newer there - so a sync that finds nothing new moves a
 * few bytes a note, not every document. The stamps are the devices' own
 * (no trigger writes them, as for every table but transactions), which is
 * why this is a comparison per note and not a watermark.
 *
 * @param {string} userId
 * @param {Array<{table: string, match?: Record<string, any>}>} pending
 * @param {{first?: boolean}} [opts]  a first sync takes the server's copy of
 *   every note both sides hold, as pullSimpleTable does
 */
async function pullNotes(userId, pending, { first = false } = {}) {
  const heads = await fetchAllRows('notes', userId, supabase, null, 'id,sync_id,updated_at')
  if (!heads.length) return
  /** @type {Map<string, NoteRow>} */
  const local = new Map()
  for (const n of await db.notes.toArray()) if (n.syncId) local.set(n.syncId, n)

  const want = heads.filter(h => {
    if (!h.sync_id || isPendingDelete(pending, 'notes', h)) return false
    const mine = local.get(h.sync_id)
    if (!mine || first) return true
    const theirs = h.updated_at ? new Date(h.updated_at).getTime() : 0
    const ours = mine.updatedAt ? new Date(mine.updatedAt).getTime() : 0
    return theirs > ours
  }).map(h => h.sync_id)

  for (let i = 0; i < want.length; i += 100) {
    const { data, error } = await supabase.from('notes').select('*')
      .eq('user_id', userId).in('sync_id', want.slice(i, i + 100))
    if (error) throw new Error(`notes pull: ${error.message}`)
    for (const row of data ?? []) {
      const mine = local.get(row.sync_id)
      /* Not over a note that was written to while this was being read: the
         copy looked at above is from before the request, and a note being
         typed in does not wait. The newer words stay, still marked unsent,
         and go up in the push that follows. */
      if (mine?.id != null) await updateIfUnchanged(db.notes, mine, rowToNote(row))
      else await db.notes.add(rowToNote(row))
    }
  }
}

/**
 * Recently deleted, up: only what has not gone up yet.
 *
 * Not pushTable, which re-sends every row of a table on every sync. A
 * deletion is never edited, and each holds whole copies of the rows it took
 * - sending a month of them again every time would be all cost - so each
 * goes once, and is marked when it has.
 *
 * @param {string} userId
 */
async function pushTrash(userId) {
  const rows = (await db.trash.toArray()).filter(trashIsUnsent)
  if (!rows.length) return
  const { error } = await supabase.from('trash')
    .upsert(rows.map(r => trashToRow(r, userId)), { onConflict: 'user_id,sync_id', ignoreDuplicates: false })
  if (error) throw new Error(`trash push: ${error.message}`)
  await db.transaction('rw', db.trash, async () => {
    for (const r of rows) await db.trash.update(r.id, { synced: SYNCED })
  })
}

/**
 * Recently deleted, down - and what has passed thirty days goes, here and
 * on the server, rather than arriving on a new device only to be purged the
 * first time Recently deleted is opened.
 *
 * @param {string} userId
 * @param {Array<{table: string, match?: Record<string, any>}>} pending
 * @param {{first?: boolean}} [opts]
 */
async function pullTrash(userId, pending, opts = {}) {
  await pullSimpleTable('trash', db.trash, rowToTrash, null, userId, null, pending, opts)
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString()
  const old = await db.trash.where('deletedAt').below(cutoff).toArray()
  for (const e of old) if (e.syncId) await queueRemoteDelete('trash', { sync_id: e.syncId })
  if (old.length) await db.trash.bulkDelete(old.map(e => e.id))
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
/* 023's four are here too. Until it runs, an investment's value updates still
   sync and still move its balance - they are ordinary rows - but another
   device counts them as income until the column arrives (unless they carry
   the description the app gives them, which lib/flows.js also matches), and a
   salary pulled from the server reads as a bill. */
const OPTIONAL_COLS = {
  /* 033's opening_balance too. Until it runs, each device keeps the opening
     it worked out for itself (db/balances.js), and the first push after it
     runs sends it (pullSimpleTable). */
  accounts: ['design', 'custom_color', 'interest_rate', 'late_fee', 'sync_id', 'kind', 'invested_start', 'valued_at', 'opening_balance'],
  /* 032's two. Until it runs, a category's carry-over setting stays on the
     device that made it: the budget page there still works, the others fall
     back to the setting for all categories. */
  categories: ['sync_id', 'rollover', 'rollover_from'],
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
  /* 018's three are here for the same reason: until the migration runs, a
     foreign-currency row still syncs and still nets correctly in its own
     account - it just loses the figure that was priced on the day, and the
     reader falls back to today's rate. */
  /* 019's two as well. Until it runs, a cross-currency transfer still syncs
     and still moves both balances correctly - the balances travel on the
     accounts - but another device reading the row sees one number for both
     ends, which is how every transfer read before 019. */
  transactions: [
    'refund_of', 'split_id', 'settles', 'credit_sync_id', 'recurring_sync_id',
    'currency', 'base_amount', 'base_currency', 'to_amount', 'to_currency', 'adjust',
  ],
  /* 024's daily_nudge too. Until it runs, the check-in's time stays on the
     device it was set on. */
  user_preferences: ['theme', 'budget_rollover', 'daily_nudge', 'forecast_settings', 'forecast_floor', 'trend_settings'],
  debts: ['source_tx_id', 'source_category', 'sync_id', 'archived_at'],
  /* 010. Until it runs, a shared bill still posts and still charges the
     right amount - it just stops opening the receivables on another
     device. */
  /* 032's due_day too. Until it runs, the day a bill falls on stays on the
     device that set it, and another device rolls it forward from the date
     alone, which is what it did before there was a day to remember. */
  recurring: ['split', 'sync_id', 'type', 'due_day'],
  /* 028. Until it runs, a note still syncs - its words, its pin, its bin -
     and stays filed and tagged only on the device that did it. */
  notes: ['tags', 'folder_sync_id'],
}

// PostgREST reports an unknown column as PGRST204 with a message naming it,
// and Postgres itself as 42703. Matching the text covers both and does not
// depend on which layer rejected it.
const UNKNOWN_COLUMN = /could not find the '.*' column|does not exist|42703|PGRST204/i

/**
 * The column a push was refused for, when the refusal names one.
 *
 *   PostgREST  "Could not find the 'adjust' column of 'transactions' in the schema cache"
 *   Postgres   'column "adjust" of relation "transactions" does not exist'
 *              'column transactions.adjust does not exist'
 *
 * @param {string|undefined|null} message
 * @returns {string|null}
 */
export function unknownColumnOf(message) {
  const m = String(message ?? '')
  const hit = /could not find the '([^']+)' column/i.exec(m)
    ?? /column "([^"]+)"/i.exec(m)
    ?? /column (?:\w+\.)?(\w+) does not exist/i.exec(m)
  return hit ? hit[1] : null
}

/**
 * What to leave out of the next attempt, after a push was refused for an
 * unknown column.
 *
 * ── Only the one it named ──
 *
 * The first version of this net dropped EVERY optional column at once. That
 * was harmless while the list only held columns the live database had long
 * since gained - but the moment one new column is added ahead of its
 * migration, one refusal took refund links, split ids, currencies and
 * sync_id down with it, on every row pushed until the migration ran. So:
 * the column the refusal names, if it is optional; the whole optional list
 * only when the message names nothing (the old net, for a message this
 * cannot read); and never a column the upsert matches on, because a push
 * without its conflict target is an INSERT that collides with the row it
 * meant to update.
 *
 * @param {string} message
 * @param {string[]} optional     the table's OPTIONAL_COLS
 * @param {string[]} dropped      already left out on an earlier attempt
 * @param {string[]} keep         the conflict target
 * @returns {string[]}
 */
export function columnsToDrop(message, optional, dropped = [], keep = []) {
  const candidates = optional.filter(c => !dropped.includes(c) && !keep.includes(c))
  const named = unknownColumnOf(message)
  if (named) return candidates.includes(named) ? [named] : []
  return candidates
}

/**
 * Retry an upsert that was refused for an unknown column, leaving out one
 * missing column at a time until it goes through or there is nothing left
 * that may be dropped. Returns the last error, or null.
 *
 * @param {string} table
 * @param {Array<Record<string, any>>} rows
 * @param {{onConflict: string, ignoreDuplicates?: boolean}} opts
 * @param {{message?: string}} firstError
 * @returns {Promise<{error: any, dropped: string[], rows: Array<Record<string, any>>}>}  `rows` is what the last attempt sent, without the columns it left out
 */
async function upsertWithoutUnknown(table, rows, opts, firstError) {
  const optional = OPTIONAL_COLS[table] ?? []
  const keep = String(opts.onConflict ?? '').split(',').map(s => s.trim())
  /** @type {any} */
  let error = firstError
  let current = rows
  /** @type {string[]} */
  const dropped = []
  for (let i = 0; i <= optional.length && error; i++) {
    if (!UNKNOWN_COLUMN.test(error.message ?? '')) break
    const drop = columnsToDrop(error.message ?? '', optional, dropped, keep)
    if (!drop.length) break
    dropped.push(...drop)
    current = current.map(row => {
      const copy = { ...row }
      for (const col of drop) delete copy[col]
      return copy
    })
    ;({ error } = await supabase.from(table).upsert(current, opts))
  }
  if (!error && dropped.length) {
    console.warn('[sync] %s: pushed without %s. Run the migration that adds them.', table, dropped.join(', '))
  }
  return { error, dropped, rows: current }
}

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

/**
 * A push rejected by the unique index on (user_id, sync_id), for a table the
 * upsert is resolving on something else.
 *
 * Accounts and categories (and goals) are upserted on their NAME, and 016 put
 * a plain unique index on (user_id, sync_id) beside it. Rename a row and the
 * name matches nothing, so Postgres takes the INSERT branch - carrying the
 * sync_id the renamed row already has remotely, which that index rejects.
 * Same shape as isLocalIdConflict, and a worse ending: no retry without a
 * column gets past it, because the row's identity is the very thing that
 * collides. What does is resolving on the identity - `user_id,sync_id` - which
 * finds the row the rename was meant to update and changes its name.
 *
 * Matched by the index's name, for the reason isLocalIdConflict is: the bare
 * SQLSTATE is every unique violation there is, and a duplicate NAME is a real
 * refusal that has to reach the person rather than be quietly retried.
 *
 * @param {string} [message]
 */
export function isSyncIdConflict(message) {
  return /duplicate key value.*_user_sync_id_key/is.test(String(message ?? ''))
}

/**
 * The value that says which version of a row this is, for "is it still the
 * one that was sent": a row's own stamp, or for a badge, which has none, the
 * day it was earned.
 *
 * @param {Record<string, any>|null|undefined} row
 */
const versionOf = (row) => row?.updatedAt ?? row?.earnedAt ?? null

/**
 * Whether a row of the small tables has changed since the cloud and this
 * device last agreed on it - the only kind a push sends.
 *
 * ── Why a mark on the row ──
 *
 * These tables used to be sent whole, every row of the table on every push,
 * with the device's own timestamps. A device that had not looked at the cloud
 * for a while then wrote its stale copies of rows another device had changed
 * in the meantime, and its (older) timestamps did nothing to stop it: the
 * upsert replaces whatever is there. Last write won, whoever had last edited.
 *
 * Now a row carries `syncedAt`, the updatedAt it had when the cloud and this
 * device last held the same row - set by a pull for a row it brought in, and
 * by a push for a row it sent. Every edit moves updatedAt (the hook in
 * db/db.js), so a row whose updatedAt is not its syncedAt has been written
 * since, and is the only one worth sending. A row with no syncedAt has never
 * been seen by the cloud in this form - a new row, or one from before this
 * existed, which is sent once and marked.
 *
 * A row with no updatedAt at all (a badge's has only the day it was earned)
 * is unsent until it has been marked once, and not again.
 *
 * @param {Record<string, any>} row
 */
export function isUnsent(row) {
  if (!row.syncedAt) return true
  return row.updatedAt != null && row.updatedAt !== row.syncedAt
}

/**
 * What a push of one of the small tables would send, row by row: each local
 * record beside the cloud's row for it.
 *
 * The same selection is made by the push and by the look at what is left
 * (unsentTables), so what that look reports is exactly what a push would send
 * and nothing it would turn away.
 *
 * ── Two rows that are one ──
 *
 * Rows that share a conflict key (two accounts called Cash) are one row to the
 * cloud, and the first of them is the one it has always been sent as. That is
 * decided among ALL the rows, before the unsent ones are picked out: picking
 * first would let a duplicate that happened to be the only unsent one go up in
 * place of the row the cloud holds.
 *
 * @param {string} tableName
 * @param {import("dexie").Table<any, any>} dexieTable
 * @param {(r: any, userId: string) => Record<string, any>} toRow
 * @param {string} userId
 * @param {string} conflictCols
 * @returns {Promise<{pending: Array<{record: Record<string, any>, row: Record<string, any>}>, unstamped: number}>}  `unstamped`: unsent rows left behind for having no stable id to resolve on
 */
async function unsentRows(tableName, dexieTable, toRow, userId, conflictCols) {
  const records = await dexieTable.toArray()
  // The usual answer, before a single row is mapped.
  if (!records.some(isUnsent)) return { pending: [], unstamped: 0 }

  let all = records.map(record => ({ record, row: toRow(record, userId) }))

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
  let unstamped = 0
  if (conflictCols.includes('sync_id')) {
    unstamped = all.filter(p => !p.row.sync_id && isUnsent(p.record)).length
    all = all.filter(p => p.row.sync_id)
  }

  // Deduplicate rows by conflict key so Postgres never sees two rows with the
  // same conflict target in one batch ("cannot affect row a second time").
  const keys = conflictCols.split(',').filter(k => k !== 'user_id')
  if (keys.length > 0) {
    const seen = new Set()
    all = all.filter(({ row }) => {
      const key = keys.map(k => row[k]).join('|')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  return { pending: all.filter(p => isUnsent(p.record)), unstamped }
}

/**
 * Note that rows went up: each one's syncedAt becomes the stamp it was sent
 * with, so it is not sent again until it is next changed.
 *
 * ── Only if it is still the row that was sent ──
 *
 * The push took its rows, then waited for the cloud. A row edited in that gap
 * has a newer updatedAt than the one that went, and marking it as sent would
 * make the edit look as though it had - for good, since nothing else would
 * ever move its stamp. So each row is read again, and marked only if its
 * version is still the one that was sent; an edited one keeps its old mark
 * and goes in the next push. The same rule pushNotes has for its `synced`.
 *
 * @param {string} tableName
 * @param {import("dexie").Table<any, any>} dexieTable
 * @param {Array<{record: Record<string, any>, row: Record<string, any>}>} sent
 */
async function markSent(tableName, dexieTable, sent) {
  // Badges are keyed by what they are; every other table by a number.
  const pk = tableName === 'badges' ? 'key' : 'id'
  await db.transaction('rw', dexieTable, async () => {
    for (const { record, row } of sent) {
      const at = record[pk]
      if (at == null) continue
      const now = await dexieTable.get(at)
      if (!now || versionOf(now) !== versionOf(record)) continue
      await dexieTable.update(at, { syncedAt: row.updated_at })
    }
  })
}

// conflictCols: the Supabase UNIQUE constraint columns to resolve on.
// Accounts and categories use their name-based constraints because the
// IndexedDB auto-increment counter does NOT reset on table.clear(), so
// local_ids can shift after a reset while names remain stable.
//
// And a rename is the price of that, which the retry below pays: the name on
// the row is then new to the cloud, and the stable id is what finds it.
/**
 * One of the small tables, up: the rows that have changed since they last
 * went (isUnsent), and for each that went, a note of it (markSent).
 *
 * @param {string} tableName
 * @param {import("dexie").Table<any, any>} dexieTable
 * @param {(r: any, userId: string) => Record<string, any>} toRow
 * @param {string} userId
 * @param {string} [conflictCols]
 */
async function pushTable(tableName, dexieTable, toRow, userId, conflictCols = 'user_id,local_id') {
  /* Only the rows that have changed since they last went - see isUnsent. A
     table nothing was written to is no request at all. */
  const { pending, unstamped } = await unsentRows(tableName, dexieTable, toRow, userId, conflictCols)
  if (unstamped) {
    console.warn('[sync] %s: %d row(s) have no syncId and were not pushed', tableName, unstamped)
  }
  if (!pending.length) return

  const rows = pending.map(p => p.row)
  const opts = { onConflict: conflictCols, ignoreDuplicates: false }
  const { error } = await supabase.from(tableName).upsert(rows, opts)
  if (!error) { await markSent(tableName, dexieTable, pending); return }

  /** What the next attempt sends, and why the last one failed. @type {Array<Record<string, any>>} */
  let sending = rows
  /** @type {any} */
  let failure = error

  /* Retry without local_id. It is a convenience, not an identity: the pull
     looks a row up by local_id first and falls straight back to its name, so
     a row that arrives with none still reconciles. Losing it costs a lookup;
     letting the push throw costs every table after this one. */
  if (isLocalIdConflict(failure.message) && !conflictCols.includes('local_id')) {
    const withoutLocalId = sending.map(({ local_id: _drop, ...rest }) => rest)
    const retry = await supabase.from(tableName).upsert(withoutLocalId, opts)
    if (!retry.error) {
      console.warn(
        '[sync] %s: a renamed row collided on local_id, so it was pushed without one.'
        + ' Run 008_rename_safe_sync.sql to stop this recurring: %s',
        tableName, failure.message,
      )
      await markSent(tableName, dexieTable, pending)
      return
    }
    // Whatever it ran into next - on a database that has not had 008, that is
    // the stable id's index, a rename having tripped both.
    sending = withoutLocalId
    failure = retry.error
  }

  /* A column the table does not have yet, left out and tried again. This runs
     before the stable-id retry below on purpose: Postgres checks the columns
     before it looks at a single row, so a row can only meet the id's index
     once the unknown columns are gone - the refusal that matters may be the
     second one. */
  const net = await upsertWithoutUnknown(tableName, sending, opts, failure)
  if (!net.error) { await markSent(tableName, dexieTable, pending); return }
  sending = net.rows
  failure = net.error

  /* A renamed account or category, or goal: resolve on the stable id instead.
     See isSyncIdConflict - the name the upsert resolves on matches nothing
     after a rename, so Postgres INSERTs a row carrying a sync_id that is
     already there, and no push on the name can succeed. On (user_id, sync_id)
     the same row is found and its name is what changes.

     Only the rows that have one: on this conflict target a row with none can
     never match, and would insert a copy of itself on every push. They stay
     marked as unsent and go with the next push, once the rename has landed
     and the name resolves again. */
  if (failure && isSyncIdConflict(failure.message) && !conflictCols.includes('sync_id')) {
    /** @type {Set<string>} */
    const seen = new Set()
    const unique = sending.filter(r => {
      if (!r.sync_id || seen.has(r.sync_id)) return false
      seen.add(r.sync_id)
      return true
    })
    if (unique.length) {
      const byId = await supabase.from(tableName).upsert(unique, { ...opts, onConflict: 'user_id,sync_id' })
      if (!byId.error) {
        console.warn('[sync] %s: a renamed row was pushed on its syncId, its name having matched nothing.', tableName)
        await markSent(tableName, dexieTable, pending.filter(p => p.row.sync_id))
        return
      }
      failure = byId.error
    }
  }

  throw new Error(`${tableName} push: ${failure.message}`)
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
 * The balances follow from what is left (db/balances.js reconcileBalances),
 * not from reversing each row here. Reversing is what used to happen, and it
 * took the row off a balance that, as often as not, had already had it taken
 * off - by the deleting device, whose account row had arrived first. Nothing
 * is cascaded here either - each row the other device removed produced a
 * tombstone of its own, so the same set arrives, and cascading would double
 * up.
 *
 * @param {string} userId
 */
async function pullDeletions(userId) {
  const marks = await getWatermarks()
  const rows = await fetchAllRows('deletions', userId, supabase,
    marks.deletions ? { column: 'deleted_at', after: marks.deletions } : null)
  if (!rows.length) return

  let ledger = false
  for (const t of rows) {
    const key = t.row_key
    if (!key) continue

    if (t.table_name === 'transactions') {
      const tx = await db.transactions.where('txId').equals(key).first()
      if (!tx) continue
      await db.transactions.delete(tx.id)
      ledger = true
      continue
    }

    if (!SYNCED_TABLES.includes(t.table_name)) continue
    const table = db.table(t.table_name)
    const row = await table.where('syncId').equals(key).first()
    if (row) await table.delete(row.id)
  }

  if (ledger) await reconcileBalances()
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
 * @param {string} [columns]  must include `id`, which the pages are ordered by
 */
export async function fetchAllRows(tableName, userId, client = supabase, since = null, columns = '*') {
  /** @type {any[]} */
  const out = []
  let from = 0

  /* A page counter, not a row counter: the exit is the empty page, and this
     only exists so a server that somehow always returns rows cannot spin
     forever. 1,000 pages is a million rows. */
  for (let guard = 0; guard < 1000; guard++) {
    let q = client
      .from(tableName)
      .select(columns)
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

/**
 * @param {string} userId
 * @param {{first?: boolean, onAdded?: (added: Transaction[]) => void, only?: Set<string>|null}} [opts]  `first`: see pullSimpleTable. `onAdded` is called the moment the ledger has come in, with what is new, rather than when the last table has: the rest takes seconds, and a transaction another device just added should not wait for the notes. `only`: the tables to read, by their names in the cloud (preferences are `user_preferences`); null reads them all
 */
export async function syncFromSupabase(userId, { onAdded, only = null, ...opts } = {}) {
  if (!userId) return { added: /** @type {Transaction[]} */ ([]) }
  /** @param {string} table */
  const wants = (table) => !only || only.has(table)

  // Rows we're still trying to delete must not be re-added by this pull.
  const pending = await getPendingDeletes()

  if (wants('user_preferences')) await pullPreferences(userId, opts)
  const added = wants('transactions') ? await pullTxs(userId, opts) : /** @type {Transaction[]} */ ([])
  if (added.length) onAdded?.(added)
  if (wants('accounts')) await pullSimpleTable('accounts',   db.accounts,   rowToAccount,   'name', userId, null, pending, opts)
  // Categories: match on name+type to avoid confusing same-named categories of different types
  if (wants('categories')) await pullSimpleTable('categories', db.categories, rowToCategory, null, userId,
    row => db.categories.where('name').equals(row.name).and(c => c.type === row.type).first(), pending, opts)
  if (wants('debts')) await pullSimpleTable('debts', db.debts, rowToDebt, null, userId,
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
    }, pending, opts)
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
  if (wants('recurring')) await pullSimpleTable('recurring', db.recurring, rowToRecurring, null, userId,
    row => (row.name ? db.recurring.where('name').equals(row.name).first() : null),
    pending, opts)
  if (wants('templates')) await pullSimpleTable('templates',  db.templates,  rowToTemplate,  'name', userId, null, pending, opts)
  if (wants('goals')) await optionalSync('goals pull', () =>
    pullSimpleTable('goals', db.goals, rowToGoal, 'name', userId, null, pending, opts))
  if (wants('badges')) await optionalSync('badges pull', () => pullBadges(userId))
  if (wants('challenges')) await optionalSync('challenges pull', () =>
    pullSimpleTable('challenges', db.challenges, rowToChallenge, null, userId, null, pending, opts))
  if (wants('trash')) await optionalSync('trash pull', () => pullTrash(userId, pending, opts))
  /* Found by name, ignoring case - the rule a folder's name is unique by
     (lib/noteFolders.js) - but not with `where('name')`: the table indexes
     only syncId, and asking for an index it has does not return nothing, it
     throws. That took the whole sync down on any device meeting a folder it
     had not got, which is the first thing a second device does. */
  if (wants('note_folders')) await optionalSync('note folders pull', () =>
    pullSimpleTable('note_folders', db.note_folders, rowToFolder, null, userId,
      async row => (row.name
        ? (await db.note_folders.toArray()).find(f => String(f.name).localeCompare(String(row.name), undefined, { sensitivity: 'accent' }) === 0)
        : null),
      pending, opts))
  if (wants('notes')) await optionalSync('notes pull', () => pullNotes(userId, pending, opts))

  // Guarantee system categories exist locally even if never pushed to Supabase
  if (wants('categories')) await ensureSystemCategories()
  /* Every balance, from its opening and the ledger as it now stands (see
     reconcileBalances). Not on a first sync: fullSync does it once the
     choice it was made with has been carried out, which can still move a
     balance. */
  if (!opts.first && (wants('transactions') || wants('accounts'))) await reconcileBalances()
  return { added }
}

/**
 * Everything the cloud has that this device does not, and nothing sent back.
 *
 * What the live stream (lib/realtime.js) calls when another device has
 * changed something. A pull and no push, on purpose: a full sync pushes every
 * row of the small tables, the cloud streams every one of those writes to every
 * device, and each device would answer with a sync of its own - two devices
 * passing the same rows back and forth for ever. A pull writes nothing to the
 * cloud, so it ends the chain.
 *
 * It does not merge in the other direction either. A pull compares each row's
 * stamp and keeps the newer, so this device's own unsent edits are left alone;
 * they go up with the next push, which they have already asked for
 * (localChanges.js) - or, for an edit made while the pull itself was writing,
 * which that cannot hear, which SyncManager asks for when the pull ends and
 * finds a row still unsent (unsentTables).
 *
 * For a device that has already had its first sync - the question a new
 * device is asked (lib/firstSync.js) is fullSync's to put.
 *
 * @param {string} userId
 * @param {{onAdded?: (added: Transaction[]) => void, only?: Set<string>|null}} [opts]  see syncFromSupabase; `deletions` among the tables is the tombstones
 * @returns {Promise<{added: Transaction[]}>}  the transactions it brought
 */
export async function pullChanges(userId, { onAdded, only = null } = {}) {
  if (!userId) throw new Error('Not authenticated')
  await dbReady
  return asRemoteWrites(async () => {
    if (!only || only.has('deletions')) await optionalSync('deletions pull', () => pullDeletions(userId))
    return syncFromSupabase(userId, { onAdded, only })
  })
}

/**
 * One transaction another device just saved, put in this ledger the moment
 * the stream announces it - from the announcement itself, with no round trip
 * back to the cloud to ask for what it already said.
 *
 * What pullTxs does for a row it meets, for the one row: new here, it is added
 * (and returned, for the toast); already here, it is replaced only by a newer
 * stamp; one this device deleted stays deleted. The watermark is left alone, so
 * the next pull reads the row again and finds nothing to do.
 *
 * `handled` is false when the event is not a whole row, which a pull then
 * has to settle.
 *
 * @param {Record<string, any>} row  the event's new row, as the table has it
 * @returns {Promise<{handled: boolean, added: Transaction|null}>}
 */
export async function applyRemoteTransaction(row) {
  if (!row?.tx_id || !row.type || !row.transaction_date) return { handled: false, added: null }
  await dbReady
  return asRemoteWrites(async () => {
    const deleted = new Set((await db.meta.get('deletedTxIds'))?.value ?? [])
    if (deleted.has(row.tx_id)) return { handled: true, added: null }
    let wrote = false
    const result = await db.transaction('rw', db.transactions, async () => {
      const existing = await db.transactions.where('txId').equals(row.tx_id).first()
      const record = toDexieRecord(row)
      if (!existing) {
        await db.transactions.add(record)
        wrote = true
        return { handled: true, added: record }
      }
      const remotets = row.updated_at ? new Date(row.updated_at).getTime() : 0
      const localts = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0
      if (remotets > localts) {
        await db.transactions.put({ ...existing, ...record })
        wrote = true
      }
      return { handled: true, added: null }
    })
    // The balances it moves, at once, rather than when the account's row comes: see reconcileBalances.
    if (wrote) await reconcileBalances()
    return result
  })
}

/**
 * The tables a change pushes have to be read first, to merge before they
 * overwrite: the cloud's names for them. The ledger is not among them - what
 * it sends is only what this device wrote.
 *
 * @param {Set<string>} only  the tables written to, by their names here (`meta` is the preferences)
 * @returns {Set<string>}
 */
export function pullScope(only) {
  const scope = new Set()
  for (const table of only) {
    if (table === 'transactions') continue
    scope.add(table === 'meta' ? 'user_preferences' : table)
  }
  return scope
}

/**
 * @param {string} userId
 * @param {{first?: boolean}} [opts]  see pullSimpleTable
 * @returns {Promise<Transaction[]>}  the transactions this pull put on the device that it did not have
 */
async function pullTxs(userId, { first = false } = {}) {
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
  if (!data.length) return /** @type {Transaction[]} */ ([])

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
    } else if (first || remotets > localts) {
      // Spread `existing` first to mirror Dexie's partial .update(): fields the
      // remote row doesn't carry (recurringId, recurringPrevDate, …) survive.
      toPut.push({ ...existing, ...toDexieRecord(row) })
    }
  }

  // Two bulk writes instead of N single writes. Besides the IndexedDB savings,
  // this collapses N liveQuery notifications into 2, so the UI stops re-running
  // every transactions query once per synced row.
  /* A transaction can reach this ledger by another road while the pull is in
     flight: the other device tells this one of it directly
     (applyRemoteTransaction), and does not wait for a sync to end. So what is
     to be added is checked again at the moment it is written, in the same
     transaction - one that is there by then is not added twice, and is not
     counted as new either, or it would be announced twice. */
  /** @type {Transaction[]} */
  let fresh = []
  if (toAdd.length) {
    await db.transaction('rw', db.transactions, async () => {
      const have = new Set((await db.transactions.where('txId').anyOf(toAdd.map(t => t.txId)).toArray()).map(t => t.txId))
      fresh = toAdd.filter(t => !have.has(t.txId))
      if (fresh.length) await db.transactions.bulkAdd(fresh)
    })
  }
  if (toPut.length) await db.transactions.bulkPut(toPut)

  /* After the write, never before. A watermark moved ahead of rows that were
     not stored is a gap nothing will ever go back for. */
  await advanceWatermark('transactions', newest(data, 'updated_at'))
  // What is new on this device, for whoever wants to say so (remoteToast.js).
  return fresh
}

/**
 * What a row written from the cloud's has to carry to be taken for the cloud's
 * own: its syncedAt, the stamp the cloud has for it (see isUnsent). Nothing
 * for the tables that keep their own marks, nor for a row the cloud has no
 * stamp for - that one is unsent until it goes up with one.
 *
 * @param {string} tableName
 * @param {Record<string, any>} row  a row as Supabase returned it
 * @returns {{syncedAt?: string}}
 */
function pulledMark(tableName, row) {
  return SMALL_TABLES[tableName] && row.updated_at ? { syncedAt: row.updated_at } : {}
}

/**
 * Write the cloud's copy of a row over this device's - unless this device's
 * has been written to since the pull looked at it.
 *
 * A pull reads a table, fetches, decides row by row, and writes; a person
 * saving is not made to wait for it. Without this the write lands over the
 * newer row with the older stamp, the save is gone, and nothing marks that it
 * ever happened. With it the newer row stays where it is, still unsent, and
 * the push that follows a pull (SyncManager, unsentTables) carries it up.
 *
 * Read and written in one transaction, so nothing can slip in between.
 *
 * @param {import("dexie").Table<any, any>} dexieTable
 * @param {{id?: any, updatedAt?: string|null, earnedAt?: string|null}} before  the row as the pull read it
 * @param {Record<string, any>} patch
 * @returns {Promise<boolean>} whether it was written
 */
async function updateIfUnchanged(dexieTable, before, patch) {
  return db.transaction('rw', dexieTable, async () => {
    const now = await dexieTable.get(before.id)
    if (!now || versionOf(now) !== versionOf(before)) return false
    await dexieTable.update(before.id, patch)
    return true
  })
}

/**
 * An account's row from the cloud, as it is written over this device's copy:
 * everything but the balance, which this device works out for itself from the
 * opening and its own ledger (db/balances.js reconcileBalances). The balance on
 * the row is the sending device's view, made before this one had heard of every
 * transaction it counts - or after it had heard of one this device has not.
 *
 * The opening comes from the cloud when it has one (033). When it has none:
 * on a first sync it is worked out again here, from the account's balance,
 * once the choice has been carried out; otherwise this device keeps its own.
 * The cloud's balance is taken only by a device that has no opening yet, as
 * the one figure it has to work one out from.
 *
 * @param {Record<string, any>} patch  rowToAccount, and the pull's mark
 * @param {Record<string, any>} local  this device's copy
 * @param {Record<string, any>} row    as the cloud has it
 * @param {boolean} [first]
 * @returns {Record<string, any>}
 */
export function accountPatch(patch, local, row, first = false) {
  const out = { ...patch }
  if (row.opening_balance != null && typeof out.opening === 'number') {
    delete out.balance
    return out
  }
  if (first) return { ...out, opening: null }
  if (typeof local?.opening === 'number') delete out.balance
  return out
}

/**
 * Accounts whose opening this device knows and the cloud does not - every one,
 * the first time a device meets the cloud after 033 has run - put down to be
 * sent, so each device works from the same one. Stamped as an edit, because it
 * is the newest word on the row: a push carrying an older stamp than the
 * cloud's would be turned away (032).
 *
 * A database without the column says nothing here, and nothing is sent.
 *
 * @param {Array<Record<string, any>>} rows  the cloud's accounts
 */
async function sendOpeningsTheCloudLacks(rows) {
  for (const row of rows) {
    if (!('opening_balance' in row) || row.opening_balance != null || !row.sync_id) continue
    const local = await db.accounts.where('syncId').equals(row.sync_id).first()
    if (!local || typeof local.opening !== 'number' || isUnsent(local)) continue
    await db.accounts.update(/** @type {number} */ (local.id), { updatedAt: new Date().toISOString() })
  }
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
 * @param {{first?: boolean}} [opts]  `first`: this device's first sync with
 *   an account that already has data. The remote copy wins every match,
 *   whatever the timestamps say, and local_id is not a match at all - it is
 *   this device's own numbering, and the server's local_ids were written by
 *   other devices. See lib/firstSync.js.
 */
async function pullSimpleTable(tableName, dexieTable, fromRow, nameKey, userId, findFn, pending = [], { first = false } = {}) {
  const data = await fetchAllRows(tableName, userId)
  if (!data.length) return

  // Every stable id the server knows about, for the collision test below.
  const remoteSyncIds = new Set(data.map(r => r.sync_id).filter(Boolean))

  /* Remote rows that have no stable id, paired with the local row that turns
     out to be them. See the note by the push below: this is what stops the
     first sync after an upgrade duplicating the entire table. */
  /** @type {Array<{id: any, sync_id: string}>} */
  const toStamp = []

  for (const row of data) {
    if (isPendingDelete(pending, tableName, row)) continue

    /* Identity first. A stamped row is found by its stamp and nothing else,
       because being findable is the entire job of having one. */
    const bySync = row.sync_id
      ? await dexieTable.where('syncId').equals(row.sync_id).first()
      : null

    const localId = first ? null : row.local_id
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
      /* New to this device. If the remote row carries no stable id, the row
         we are about to create mints one - and the server would then have no
         way to recognise its own copy, so the next push would insert a
         second. Hand our id straight back. */
      const newId = await dexieTable.add({ ...fromRow(row), ...pulledMark(tableName, row) })
      const stamp = needsStamping(row, await dexieTable.get(newId))
      if (stamp) toStamp.push(stamp)
    } else {
      /* Adopt the remote identity even when the remote CONTENT is older.
         Identity is not content. Both devices minted their own syncId in the
         v11 upgrade, so for any row that predates this they hold two ids for
         one thing and have to converge on one - and the one already on the
         server is the one every other device will meet. Gate this behind the
         timestamp and the device holding the newer copy never yields, so the
         two never agree and every sync re-inserts. */
      /* The other direction, and the one that matters on a first sync.
       *
       * The push resolves conflicts on sync_id for the tables that moved to
       * it. A remote row with NO sync_id cannot satisfy that target, so it
       * can never be updated - the push inserts instead, and every row in the
       * table duplicates itself.
       *
       * That is the state every device is in the first time it runs after
       * 011: its rows are stamped locally and the server's copies are not.
       * So when this pull recognises an unstamped remote row as one we
       * already hold, it writes our id onto it - and the push a moment later
       * finds its twin exactly where it expects.
       *
       * Cheap, because it only ever fires for rows that have not been
       * stamped yet, and after the first successful sync there are none. */
      const stamp = needsStamping(row, target)
      if (stamp) toStamp.push(stamp)

      if (row.sync_id && target.syncId !== row.sync_id) {
        /* syncId alone, and that matters: db/db.js treats a bookkeeping-only
           change as not an edit and leaves updatedAt where it is. Bumping it
           here would leave the row permanently newer than the copy it just
           synced from, so the real content could never arrive.

           And no syncedAt: taking the cloud's identity is not taking its
           content. Where the content is the cloud's too, the write below
           marks it; where this device's is newer it is still waiting to go,
           and marking it here would hide that. */
        await dexieTable.update(target.id, { syncId: row.sync_id })
      }
      if (first || remotets > localts) {
        /* Marked as the cloud's own on the way in (see isUnsent), so a row
           that arrives is not sent straight back. And only if the row is
           still as it was when it was read: a pull takes a while, and a
           person saving in the meantime has a newer row than the one decided
           about here. That edit stays, and stays unsent. */
        const patch = { ...fromRow(row), ...pulledMark(tableName, row) }
        await updateIfUnchanged(dexieTable, target, tableName === 'accounts' ? accountPatch(patch, target, row, first) : patch)
      }
    }
  }

  if (tableName === 'accounts') await sendOpeningsTheCloudLacks(data)

  await stampRemote(tableName, toStamp)
}

/**
 * Does this remote row need our stable id written onto it?
 *
 * One rule, reached from two directions - a remote row we recognised as one
 * we already hold, and one we had never seen and just added. Both come down
 * to the same three conditions, so it is one function rather than two
 * conditions that have to be kept in step:
 *
 *   the remote row has NO stable id, so a push resolving on sync_id can
 *   never address it and would insert a duplicate instead
 *
 *   the local row HAS one, so there is something to give
 *
 *   the remote row has a primary key to update by, which is how it is
 *   addressed - not by the id we are in the middle of giving it
 *
 * Exported for the test. It runs once per device per table and then never
 * again, which is exactly the kind of code nobody gets to observe twice.
 *
 * @param {Record<string, any>} remote  a row as Supabase returned it
 * @param {Record<string, any>} [local]  the local row it turned out to be
 */
export function needsStamping(remote, local) {
  if (!remote || remote.sync_id) return null
  if (!remote.id || !local?.syncId) return null
  return { id: remote.id, sync_id: local.syncId }
}

/**
 * Write our stable ids onto remote rows that have none.
 *
 * An UPDATE by primary key, one row at a time - not an upsert. An upsert here
 * would be circular: the whole reason these rows need stamping is that they
 * cannot be addressed by the id we are trying to give them.
 *
 * Failures are logged and swallowed. This is a repair, not the sync: if it
 * does not land, the push behaves exactly as it did before it existed, and
 * the next pull tries again.
 *
 * @param {string} tableName
 * @param {Array<{id: any, sync_id: string}>} rows
 */
async function stampRemote(tableName, rows) {
  if (!rows.length) return
  let done = 0
  for (const r of rows) {
    const { error } = await supabase
      .from(tableName)
      .update({ sync_id: r.sync_id })
      .eq('id', r.id)
      .is('sync_id', null)      // never overwrite an id somebody else set
    if (error) {
      console.warn('[sync] %s: could not stamp a row:', tableName, error.message)
      return
    }
    done++
  }
  console.info('[sync] %s: stamped %d row(s) that predated syncId', tableName, done)
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

    /* Quiet: it was celebrated, and announced, on the device that earned
       it. Here it is news only in the sense of arriving. */
    if (!local) {
      await db.badges.put({ key: row.key, earnedAt: remoteAt, synced: SYNCED, silent: true, ...pulledMark('badges', row) })
      continue
    }

    // Earlier wins. A missing date on either side loses to a real one.
    const localAt = local.earnedAt ?? null
    const earliest = !localAt ? remoteAt
      : !remoteAt ? localAt
      : (new Date(remoteAt) < new Date(localAt) ? remoteAt : localAt)

    if (earliest !== localAt) {
      await db.badges.put({ ...local, earnedAt: earliest, synced: SYNCED, ...pulledMark('badges', row) })
    } else if (localAt && remoteAt && new Date(localAt).getTime() < new Date(remoteAt).getTime()) {
      /* This device's date is the earlier, so the cloud's is the wrong one and
         has to be corrected - by sending this one. A badge is only ever sent
         while it is unsent (see isUnsent), so it is put back to that: the
         whole-table push this used to be did it without being asked.
         Compared as instants, not as text: the cloud writes the same moment
         in another format, and that must not read as a difference. */
      await db.badges.where('key').equals(row.key).modify((/** @type {Record<string, any>} */ b) => { delete b.syncedAt })
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

// ── A device's first sync with an account ────────────────────────────────────
//
// See lib/firstSync.js for the night that made this necessary.

/**
 * @typedef {{remote: {transactions: number, accounts: number}, local: {transactions: number}}} FirstSyncInfo
 * @typedef {'account'|'both'} FirstSyncChoice
 *   account  the account's data replaces this device's
 *   both     this device's entries are added to the account's; where the
 *            two share an account or a category, the account's copy stays
 */

/** Thrown by fullSync when it will not sync until the person has chosen. */
export class FirstSyncChoiceNeeded extends Error {
  /** @param {FirstSyncInfo} info */
  constructor(info) {
    super('This account already has data')
    this.name = 'FirstSyncChoiceNeeded'
    this.info = info
  }
}

/** @param {string} tableName @param {string} userId */
async function countRemote(tableName, userId) {
  const { count, error } = await supabase
    .from(tableName)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) throw new Error(`${tableName} count: ${error.message}`)
  return count ?? 0
}

/**
 * Whether this sync is a device meeting an account that already has data,
 * and if so, what each side holds. Null means sync as always.
 *
 * Marks the device as synced with an EMPTY account straight away, before
 * anything is pushed. If that first push stops part-way, the next sync must
 * finish it as an ordinary sync, not ask whether the half it managed to
 * upload should replace the device it came from.
 *
 * @param {string} userId
 * @returns {Promise<FirstSyncInfo|null>}
 */
export async function checkFirstSync(userId) {
  /* lastSync rather than the watermarks as the trace of an earlier sync:
     SyncManager writes it only once a whole sync has succeeded, while a
     watermark moves in the middle of one - including a first sync that then
     failed, which must ask again rather than pass for an old device. */
  const [mark, last] = await Promise.all([
    db.meta.get(SYNCED_WITH_KEY),
    db.meta.get('lastSync'),
  ])
  const standing = deviceStanding({
    userId,
    mark: mark?.value ?? null,
    syncedBefore: !!last?.value,
  })
  if (standing === 'known') return null
  if (standing === 'backfill') {
    await db.meta.put({ key: SYNCED_WITH_KEY, value: userId })
    return null
  }

  /* The device last synced with somebody else. Its stream positions are
     theirs, and a delta pull from them would step over most of this
     account's history. */
  if (mark?.value) await resetWatermarks()

  const [transactions, accounts] = await Promise.all([
    countRemote('transactions', userId),
    countRemote('accounts', userId),
  ])
  if (!accountHasData({ transactions, accounts })) {
    await db.meta.put({ key: SYNCED_WITH_KEY, value: userId })
    return null
  }
  return {
    remote: { transactions, accounts },
    local: { transactions: await db.transactions.count() },
  }
}

/**
 * Deletes this device queued before it ever met the account.
 *
 * They are queued by name, and on this device "Food" or "Cash" meant this
 * device's row. Flushed against the account, they would delete the account's
 * Food and Cash.
 */
async function forgetQueuedDeletes() {
  await db.meta.bulkDelete([PENDING_KEY, 'deletedTxIds'])
}

/** "Use my account's data": everything the account will replace, gone first. */
async function clearLocalLedger() {
  const tables = [
    db.transactions, db.balances, db.accounts, db.categories, db.debts,
    db.recurring, db.templates, db.goals, db.challenges, db.badges, db.trash,
  ]
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear()
  })
  await resetWatermarks()
}

/**
 * "Keep both", before the pull: which of this device's entries the server
 * lacks, and what they did to the accounts the server has. Read before the
 * pull, which replaces those accounts' balances with the account's.
 *
 * @param {string} userId
 */
async function planKeepBoth(userId) {
  const [txs, remoteTxs, remoteAccounts] = await Promise.all([
    db.transactions.toArray(),
    fetchAllRows('transactions', userId, supabase, null, 'id,tx_id'),
    fetchAllRows('accounts', userId, supabase, null, 'id,name'),
  ])
  const remoteTxIds = new Set(remoteTxs.map(r => r.tx_id).filter(Boolean))
  return {
    deltas: localOnlyDeltas(txs, remoteTxIds, new Set(remoteAccounts.map(r => r.name))),
    /* Marked as uploaded already when this device last synced with someone
       else. The push only sends what is not, so these would stay here. */
    upload: txs.filter(t => t.txId && !remoteTxIds.has(t.txId) && t.synced === SYNCED).map(t => t.id),
  }
}

/** @param {{deltas: Map<string, number>, upload: number[]}} plan */
async function applyKeepBoth({ deltas, upload }) {
  await db.transaction('rw', [db.accounts, db.balances, db.transactions], async () => {
    for (const [name, delta] of deltas) {
      const acct = await db.accounts.where('name').equals(name).first()
      if (!acct) continue
      const balance = roundMoney((acct.balance ?? 0) + delta, acct.currency)
      await db.accounts.update(acct.id, { balance })
      await db.balances.put({ account: name, balance })
    }
    if (upload.length) await db.transactions.where('id').anyOf(upload).modify({ synced: UNSYNCED })
  })
}

// ── Full sync ─────────────────────────────────────────────────────────────────

/**
 * @param {string} userId
 * @param {{choice?: FirstSyncChoice|null, quick?: boolean, only?: Set<string>|null}} [opts]  `choice`: the answer to
 *   FirstSyncChoiceNeeded; ignored when there is nothing to choose. `quick`:
 *   a push that a change asked for - the ledger goes up before the pull, so a
 *   transaction is in the cloud within a round trip rather than after every
 *   table has been read, and the pull is only of the tables in `only`, the
 *   ones about to be sent; `only`: see syncToSupabase
 * @returns {Promise<{added: Transaction[], first: boolean}>}  what came down, and whether this was the device's first sync
 */
export async function fullSync(userId, { choice = null, quick = false, only = null } = {}) {
  if (!userId) throw new Error('Not authenticated')
  // Wait for the initial seed to complete so the pull doesn't race with it
  // and create duplicate seeded records (e.g. two Cash accounts).
  await dbReady

  /* Before anything touches the server: a device meeting an account that
     already has data is not merged by timestamp. See lib/firstSync.js. */
  const first = await checkFirstSync(userId)
  if (first && choice !== 'account' && choice !== 'both') throw new FirstSyncChoiceNeeded(first)
  if (first) {
    await forgetQueuedDeletes()
    await resetWatermarks()
    if (choice === 'account') await clearLocalLedger()
    /* "Keep both": this device's rows go up beside the account's. Whatever
       note they carry of having been sent was made against another account,
       so it goes; the pull below then marks the rows it matches as the
       account's, and what is left unmarked is what only this device has. */
    else await forgetSent()
  }

  // Land queued deletions first, so the pull below can't resurrect them.
  await flushPendingDeletes(userId)
  /* And the ones somebody else made. Before the content pull rather than
     after: a row deleted remotely is not in the content pull anyway, and
     doing it first means a device coming back from a long absence sheds what
     is gone before it starts merging what is not. */
  await asRemoteWrites(() => optionalSync('deletions pull', () => pullDeletions(userId)))
  /* A change made here, on its way: the ledger first (see pushLedger). After
     the deletions, so a row removed elsewhere is gone before it is sent. */
  if (quick) await pushLedger(userId)

  const keepBoth = first && choice === 'both' ? await planKeepBoth(userId) : null

  // Pull so a fresh device gets correct remote state before pushing.
  const { added } = await asRemoteWrites(() => syncFromSupabase(userId, { first: !!first, only: quick && only ? pullScope(only) : null }))
  if (keepBoth) await applyKeepBoth(keepBoth)
  // The pull leaves this to the first sync, until the choice is carried out: see syncFromSupabase.
  if (first) await asRemoteWrites(() => reconcileBalances())
  // Clean up any duplicates that seed vs. pull races may have left behind.
  await deduplicateLocalAccounts()
  await syncToSupabase(userId, { only })

  /* Last, so a first sync that fails anywhere above asks again next time
     rather than carrying on as an ordinary merge. */
  if (first) await db.meta.put({ key: SYNCED_WITH_KEY, value: userId })
  return { added, first: !!first }
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
 * A bill, deleted remotely by the id that identifies it.
 *
 * ── The name is gone, and it cost a bill to learn why ──
 *
 * This used to queue a delete by NAME as well as by local_id, because
 * local_id shifts whenever the database is cleared and re-filled and a delete
 * aimed at a stale one matched nothing. The name always matched.
 *
 * It matched too much. A delete by name removes EVERY row with that name, and
 * the justification for that - "deleting one row too many is repaired by the
 * push that follows, which re-uploads every surviving local bill" - holds
 * only while a survivor exists locally. Delete the last local copy of a bill
 * that has duplicates on the server, and the name sweeps all of them: three
 * Spotify rows for one gesture, with nothing left to re-upload.
 *
 * sync_id is why the name is no longer needed. It is minted once, survives a
 * restore, and names exactly one row - which is the whole reason 011 exists.
 * local_id stays as a fallback for a row that predates stamping, and it can
 * only ever be wrong about ONE row.
 *
 * `queue` is injectable so this can be tested without a database - the calls
 * it makes ARE the behaviour, and they are what went wrong.
 *
 * @param {number|null} localId
 * @param {string} [_name]  no longer used; kept so call sites read unchanged
 * @param {string|null} [syncId]
 * @param {(table: string, match: Record<string, any>) => any} [queue]
 */
export async function deleteRecurringRemote(localId, _name, syncId = null, queue = queueRemoteDelete) {
  if (syncId) { await queue('recurring', { sync_id: syncId }); return }
  if (localId != null) await queue('recurring', { local_id: localId })
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
 * A template, by its own id. Same change and same reason as
 * deleteRecurringRemote above: a delete by name removes every row that shares
 * one, and "the push re-uploads the survivors" is only true while a survivor
 * is left to re-upload.
 *
 * @param {number} localId
 * @param {string} [_name]  no longer used; kept so call sites read unchanged
 * @param {string|null} [syncId]
 * @param {(table: string, match: Record<string, any>) => any} [queue]
 */
export async function deleteTemplateRemote(localId, _name, syncId = null, queue = queueRemoteDelete) {
  if (syncId) { await queue('templates', { sync_id: syncId }); return }
  if (localId != null) await queue('templates', { local_id: localId })
}
