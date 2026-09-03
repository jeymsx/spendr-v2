import db, { UNSYNCED } from '../db/db'
import { queueRemoteDelete } from './sync'

// Tables the JSON export writes. `balances` and `meta` are deliberately absent
// from a backup file: balances is derived from accounts, and meta holds
// device-local state (onboarded, displayName, the migration flags) that must
// survive a restore rather than be overwritten by another device's values.
const BACKUP_TABLES = ['transactions', 'accounts', 'categories', 'templates', 'recurring', 'debts']

/**
 * Validate a parsed backup file and report what it holds.
 * Throws with a readable message rather than returning a partial result.
 */
export function inspectBackup(raw) {
  let data
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    throw new Error('Not valid JSON — is this a Spendr backup file?')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Not a Spendr backup file.')
  }

  const present = BACKUP_TABLES.filter(t => Array.isArray(data[t]))
  if (present.length === 0) {
    throw new Error('No Spendr data found in this file.')
  }
  for (const t of present) {
    if (data[t].some(r => !r || typeof r !== 'object')) {
      throw new Error(`The "${t}" section is malformed.`)
    }
  }
  if (data.version != null && Number(data.version) > 1) {
    throw new Error(`This backup is version ${data.version}, newer than this app understands.`)
  }

  return {
    data,
    exportedAt: data.exportedAt ?? null,
    counts: Object.fromEntries(BACKUP_TABLES.map(t => [t, (data[t] ?? []).length])),
    missing: BACKUP_TABLES.filter(t => !Array.isArray(data[t])),
  }
}

/**
 * Replace local data with the contents of a backup.
 *
 * Restore means restore: the six backed-up tables are cleared and rewritten, so
 * anything absent from the file goes away locally. Three things make that
 * actually hold rather than being quietly reverted by the next sync:
 *
 *  - `synced` is coerced to 0. A file exported before the numeric-flag change
 *    carries booleans, which IndexedDB cannot index — restored verbatim they
 *    would be invisible to the indexed unsynced query and would never push.
 *  - `updatedAt` is set to now, so the restored rows win last-write-wins
 *    against whatever is currently in Supabase. Keeping the file's original
 *    timestamps would let the cloud overwrite the restore on the next pull.
 *  - Rows that existed locally but are absent from the backup are queued for
 *    remote deletion, otherwise the next pull would simply bring them back.
 *
 * Row ids are preserved, because transactions reference recurring.id.
 * `meta` is left untouched, and `balances` is rebuilt from the restored accounts.
 */
export async function restoreBackup(raw) {
  const { data, counts } = inspectBackup(raw)
  const nowISO = new Date().toISOString()

  const stamp = (rows) => (rows ?? []).map(r => ({
    ...r,
    synced:    UNSYNCED,
    updatedAt: nowISO,
  }))

  // Captured before the wipe so we know what the backup drops.
  const [oldTxs, oldAccounts, oldCategories, oldTemplates] = await Promise.all([
    db.transactions.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.templates.toArray(),
  ])

  const accounts   = stamp(data.accounts)
  const categories = stamp(data.categories)
  const templates  = stamp(data.templates)
  const recurring  = stamp(data.recurring)
  const debts      = stamp(data.debts)
  const transactions = stamp(data.transactions)

  const keptTxIds  = new Set(transactions.map(t => t.txId).filter(Boolean))
  const droppedTxIds = oldTxs.map(t => t.txId).filter(id => id && !keptTxIds.has(id))

  const keptAccountNames  = new Set(accounts.map(a => a.name))
  const keptTemplateNames = new Set(templates.map(t => t.name))
  const keptCategoryKeys  = new Set(categories.map(c => `${c.name}|${c.type}`))

  await db.transaction('rw', [
    db.transactions, db.accounts, db.categories,
    db.templates, db.recurring, db.debts, db.balances, db.meta,
  ], async () => {
    if (Array.isArray(data.transactions)) { await db.transactions.clear(); await db.transactions.bulkAdd(transactions) }
    if (Array.isArray(data.accounts))     { await db.accounts.clear();     await db.accounts.bulkAdd(accounts) }
    if (Array.isArray(data.categories))   { await db.categories.clear();   await db.categories.bulkAdd(categories) }
    if (Array.isArray(data.templates))    { await db.templates.clear();    await db.templates.bulkAdd(templates) }
    if (Array.isArray(data.recurring))    { await db.recurring.clear();    await db.recurring.bulkAdd(recurring) }
    if (Array.isArray(data.debts))        { await db.debts.clear();        await db.debts.bulkAdd(debts) }

    // balances mirrors accounts; rebuild rather than trust a stale copy.
    await db.balances.clear()
    if (accounts.length) {
      await db.balances.bulkPut(accounts.map(a => ({ account: a.name, balance: a.balance ?? 0 })))
    }

    // Tombstone the transactions this backup drops, so the next sync removes
    // them remotely instead of pulling them straight back.
    if (droppedTxIds.length) {
      const existing = await db.meta.get('deletedTxIds')
      const merged = [...new Set([...(existing?.value ?? []), ...droppedTxIds])]
      await db.meta.put({ key: 'deletedTxIds', value: merged })
    }
  })

  // Queued outside the Dexie transaction: these write to meta through their own
  // helper, and a failure here must not roll the restore back.
  for (const a of oldAccounts) {
    if (a.name && !keptAccountNames.has(a.name)) await queueRemoteDelete('accounts', { name: a.name })
  }
  for (const c of oldCategories) {
    if (c.name && !keptCategoryKeys.has(`${c.name}|${c.type}`)) {
      await queueRemoteDelete('categories', { name: c.name, type: c.type })
    }
  }
  for (const t of oldTemplates) {
    if (t.name && !keptTemplateNames.has(t.name)) await queueRemoteDelete('templates', { name: t.name })
  }

  return {
    counts,
    droppedTransactions: droppedTxIds.length,
    removedAccounts:   oldAccounts.filter(a => a.name && !keptAccountNames.has(a.name)).length,
    removedCategories: oldCategories.filter(c => c.name && !keptCategoryKeys.has(`${c.name}|${c.type}`)).length,
  }
}

/**
 * Build the JSON backup payload. Same shape the mobile Settings page writes
 * inline — kept here so the desktop page doesn't grow a second copy of the
 * table list, which is the part that would drift if a table were added.
 */
export async function buildBackupPayload() {
  const [transactions, accounts, categories, templates, recurring, debts] = await Promise.all([
    db.transactions.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.templates.toArray(),
    db.recurring.toArray(),
    db.debts.toArray(),
  ])
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions, accounts, categories, templates, recurring, debts,
  }
}

/** Trigger a browser download of the JSON backup. Returns the row counts. */
export async function downloadBackupJson() {
  const payload = await buildBackupPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spendr-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { transactions: payload.transactions.length, accounts: payload.accounts.length }
}
