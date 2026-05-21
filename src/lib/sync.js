import db from '../db/db'
import { supabase } from './supabase'

// ── Row mapping: Dexie → Supabase ─────────────────────────────────────────────

function toSupabaseRow(r, userId) {
  const type = r.type
  return {
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
  }
}

function accountToRow(r, userId) {
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
    updated_at:      r.updatedAt ?? new Date().toISOString(),
  }
}

function categoryToRow(r, userId) {
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

function debtToRow(r, userId) {
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

function recurringToRow(r, userId) {
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

function templateToRow(r, userId) {
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

function toDexieRecord(row) {
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
    synced:      true,
    updatedAt:   row.updated_at,
  }
}

function rowToAccount(row) {
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
    updatedAt:      row.updated_at,
  }
}

function rowToCategory(row) {
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

function rowToDebt(row) {
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

function rowToRecurring(row) {
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

function rowToTemplate(row) {
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

// ── Push to Supabase ──────────────────────────────────────────────────────────

export async function syncToSupabase(userId) {
  if (!userId) return

  // Transactions: only push unsynced (falsy synced field = unsynced)
  const unsyncedTxs = await db.transactions.filter(t => !t.synced).toArray()

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
      await db.transactions.where('id').anyOf(ids).modify({ synced: true })
    }
  }

  // Other tables: always push all (small datasets, no per-record tracking needed)
  await pushTable('accounts',   db.accounts,   accountToRow,  userId, 'user_id,name')
  await pushTable('categories', db.categories, categoryToRow, userId, 'user_id,name,type')
  await pushTable('debts',      db.debts,      debtToRow,     userId)
  await pushTable('recurring',  db.recurring,  recurringToRow, userId)
  await pushTable('templates',  db.templates,  templateToRow,  userId)
}

// conflictCols: the Supabase UNIQUE constraint columns to resolve on.
// Accounts and categories use their name-based constraints because the
// IndexedDB auto-increment counter does NOT reset on table.clear(), so
// local_ids can shift after a reset while names remain stable.
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

  const { error } = await supabase
    .from(tableName)
    .upsert(rows, { onConflict: conflictCols, ignoreDuplicates: false })
  if (error) throw new Error(`${tableName} push: ${error.message}`)
}

// ── Pull from Supabase ────────────────────────────────────────────────────────

const SYSTEM_CATS = [
  { name: 'Others',       icon: '📦', color: '#6b7280', type: 'expense',  budget: 0 },
  { name: 'Income',       icon: '💰', color: '#22c55e', type: 'inflow',   budget: 0 },
  { name: 'Transfer',     icon: '🔄', color: '#2D9DFF', type: 'transfer', budget: 0 },
  { name: 'Transfer Fee', icon: '💸', color: '#f59e0b', type: 'expense',  budget: 0 },
]

async function ensureSystemCategories() {
  for (const cat of SYSTEM_CATS) {
    const exists = await db.categories
      .where('name').equals(cat.name)
      .and(c => c.type === cat.type)
      .first()
    if (!exists) await db.categories.add(cat)
  }
}

export async function syncFromSupabase(userId) {
  if (!userId) return

  await pullTxs(userId)
  await pullSimpleTable('accounts',   db.accounts,   rowToAccount,   'name', userId)
  // Categories: match on name+type to avoid confusing same-named categories of different types
  await pullSimpleTable('categories', db.categories, rowToCategory, null, userId,
    row => db.categories.where('name').equals(row.name).and(c => c.type === row.type).first())
  await pullSimpleTable('debts',      db.debts,      rowToDebt,      null,   userId)
  await pullSimpleTable('recurring',  db.recurring,  rowToRecurring, null,   userId)
  await pullSimpleTable('templates',  db.templates,  rowToTemplate,  'name', userId)

  // Guarantee system categories exist locally even if never pushed to Supabase
  await ensureSystemCategories()
}

async function pullTxs(userId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
  if (error) throw new Error(`transactions pull: ${error.message}`)
  if (!data?.length) return

  const deletedMeta = await db.meta.get('deletedTxIds')
  const deletedSet = new Set(deletedMeta?.value ?? [])

  for (const row of data) {
    if (!row.tx_id) continue // skip rows without a stable key
    if (deletedSet.has(row.tx_id)) continue // skip locally-deleted transactions

    const existing = await db.transactions.where('txId').equals(row.tx_id).first()
    const remotets = row.updated_at ? new Date(row.updated_at).getTime() : 0
    const localts  = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0

    if (!existing) {
      await db.transactions.add({ ...toDexieRecord(row) })
    } else if (remotets > localts) {
      await db.transactions.update(existing.id, { ...toDexieRecord(row) })
    }
  }
}

// findFn: optional async (row) => existing local record | null
// Used when a simple single-key lookup isn't enough (e.g. categories: name+type).
async function pullSimpleTable(tableName, dexieTable, fromRow, nameKey, userId, findFn) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('user_id', userId)
  if (error) throw new Error(`${tableName} pull: ${error.message}`)
  if (!data?.length) return

  for (const row of data) {
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
    } else if (remotets > localts) {
      await dexieTable.update(target.id, fromRow(row))
    }
  }
}

// ── Full sync ─────────────────────────────────────────────────────────────────

export async function fullSync(userId) {
  if (!userId) throw new Error('Not authenticated')
  await syncFromSupabase(userId)
  await syncToSupabase(userId)
}
