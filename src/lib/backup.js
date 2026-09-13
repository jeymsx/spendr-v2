import db, { UNSYNCED } from '../db/db'
import { queueRemoteDelete } from './sync'

/* Tables the JSON export writes.
 *
 * `balances` and `meta` are deliberately absent: balances is derived from
 * accounts, and meta holds device-local state (onboarded, displayName, the
 * migration flags) that must survive a restore rather than be overwritten by
 * another device's values.
 *
 * `goals` and `badges` were absent for a worse reason - they arrived in schema
 * v9 and v10 and nobody added them here. Both sync to Supabase, so both are
 * real user data, and the omission cost twice: a backup silently did not
 * contain your goals, and a RESTORE did not clear them, so goals from a seed
 * or an old device survived a wipe-and-replace. That is the bug this list is
 * the fix for. A table that syncs belongs in this array; there is no third
 * category. */
const BACKUP_TABLES = [
  'transactions', 'accounts', 'categories', 'templates', 'recurring', 'debts',
  'goals', 'badges',
]

/* Badges are the one table a restore MERGES rather than replaces - look for
 * the bulkPut with no clear() beside it in restoreBackup.
 *
 * Everywhere else "restore means restore" and an absent row goes away. A badge
 * is not a row of data, it is a thing that happened - and sync already treats
 * it that way: pullBadges keeps the EARLIEST earnedAt and has no delete path
 * at all. Clearing badges here would un-earn achievements that the very next
 * sync puts straight back, which is a worse outcome than not clearing them. */

/**
 * Validate a parsed backup file and report what it holds.
 * Throws with a readable message rather than returning a partial result.
 *
 * @param {string|object} raw
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
    if (data[t].some((/** @type {unknown} */ r) => !r || typeof r !== 'object')) {
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
 *
 * @param {string|object} raw
 */
export async function restoreBackup(raw) {
  const { data, counts } = inspectBackup(raw)
  const nowISO = new Date().toISOString()

  /**
   * Re-stamp rows of any table. Generic on purpose: this is handed six
   * different record types and its job is to preserve every field it did not
   * touch, which a concrete parameter type would erase.
   *
   * @template {Record<string, any>} T
   * @param {T[]} [rows]
   * @returns {T[]}
   */
  const stamp = (rows) => (rows ?? []).map(r => ({
    ...r,
    synced:    UNSYNCED,
    updatedAt: nowISO,
  }))

  /* Badges carry `key` and `earnedAt` and nothing else - no updatedAt, because
     there is no last-write-wins for them. Stamping one would add a column the
     table does not have and the mapper does not send. */
  /**
   * @template {Record<string, any>} T
   * @param {T[]} [rows]
   * @returns {T[]}
   */
  const stampBadge = (rows) => (rows ?? []).map(r => ({ ...r, synced: UNSYNCED }))

  // Captured before the wipe so we know what the backup drops.
  const [oldTxs, oldAccounts, oldCategories, oldTemplates, oldGoals] = await Promise.all([
    db.transactions.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.templates.toArray(),
    db.goals.toArray(),
  ])

  /* Each call names the table it is restoring. A backup file is parsed JSON,
     so its sections arrive untyped and the generic has nothing better to
     infer - and naming them here is exactly the assertion the restore makes
     anyway: that a section called "accounts" holds accounts. */
  const accounts   = /** @type {Account[]}     */ (stamp(data.accounts))
  const categories = /** @type {Category[]}    */ (stamp(data.categories))
  const templates  = /** @type {Template[]}    */ (stamp(data.templates))
  const recurring  = /** @type {Recurring[]}   */ (stamp(data.recurring))
  const debts      = /** @type {Debt[]}        */ (stamp(data.debts))
  const transactions = /** @type {Transaction[]} */ (stamp(data.transactions))
  const goals      = /** @type {Goal[]}         */ (stamp(data.goals))
  const badges     = /** @type {BadgeRow[]}     */ (stampBadge(data.badges))

  const keptTxIds  = new Set(transactions.map(t => t.txId).filter(Boolean))
  const droppedTxIds = oldTxs.map(t => t.txId).filter(id => id && !keptTxIds.has(id))

  const keptAccountNames  = new Set(accounts.map(a => a.name))
  const keptTemplateNames = new Set(templates.map(t => t.name))
  const keptCategoryKeys  = new Set(categories.map(c => `${c.name}|${c.type}`))
  const keptGoalNames     = new Set(goals.map(g => g.name))

  await db.transaction('rw', [
    db.transactions, db.accounts, db.categories, db.templates,
    db.recurring, db.debts, db.goals, db.badges, db.balances, db.meta,
  ], async () => {
    if (Array.isArray(data.transactions)) { await db.transactions.clear(); await db.transactions.bulkAdd(transactions) }
    if (Array.isArray(data.accounts))     { await db.accounts.clear();     await db.accounts.bulkAdd(accounts) }
    if (Array.isArray(data.categories))   { await db.categories.clear();   await db.categories.bulkAdd(categories) }
    if (Array.isArray(data.templates))    { await db.templates.clear();    await db.templates.bulkAdd(templates) }
    if (Array.isArray(data.recurring))    { await db.recurring.clear();    await db.recurring.bulkAdd(recurring) }
    if (Array.isArray(data.debts))        { await db.debts.clear();        await db.debts.bulkAdd(debts) }
    if (Array.isArray(data.goals))        { await db.goals.clear();        await db.goals.bulkAdd(goals) }
    // Merged, not replaced - see the note by BACKUP_TABLES. bulkPut so a badge already held
    // locally keeps its row rather than colliding on the `key` primary key.
    if (Array.isArray(data.badges) && badges.length) await db.badges.bulkPut(badges)

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
  /* Only when the file actually carried goals. Restoring a backup written
     before goals existed must not read "no goals in the file" as "delete every
     goal" - it has nothing to say about them, and the clear above is guarded
     the same way. */
  if (Array.isArray(data.goals)) {
    for (const g of oldGoals) {
      if (g.name && !keptGoalNames.has(g.name)) await queueRemoteDelete('goals', { name: g.name })
    }
  }

  return {
    counts,
    droppedTransactions: droppedTxIds.length,
    removedAccounts:   oldAccounts.filter(a => a.name && !keptAccountNames.has(a.name)).length,
    removedCategories: oldCategories.filter(c => c.name && !keptCategoryKeys.has(`${c.name}|${c.type}`)).length,
    removedGoals: Array.isArray(data.goals)
      ? oldGoals.filter(g => g.name && !keptGoalNames.has(g.name)).length
      : 0,
  }
}

/**
 * Build the JSON backup payload. Same shape the mobile Settings page writes
 * inline — kept here so the desktop page doesn't grow a second copy of the
 * table list, which is the part that would drift if a table were added.
 */
export async function buildBackupPayload() {
  const [transactions, accounts, categories, templates, recurring, debts, goals, badges] =
    await Promise.all([
      db.transactions.toArray(),
      db.accounts.toArray(),
      db.categories.toArray(),
      db.templates.toArray(),
      db.recurring.toArray(),
      db.debts.toArray(),
      db.goals.toArray(),
      db.badges.toArray(),
    ])
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions, accounts, categories, templates, recurring, debts, goals, badges,
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
