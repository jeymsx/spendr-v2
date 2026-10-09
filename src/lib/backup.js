import db, { SYNCED, UNSYNCED } from '../db/db'
import { queueRemoteDelete, resetLedgerWatermark } from './sync'
import { toDateInput } from '../utils/txDate'
import { PRIMED_META } from './achievements'
import { ledgerMoves, settleAccount } from '../db/balances'

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
/**
 * What this app writes, and the highest it will read.
 *
 * 1 was the eight tables. 2 adds `meta` (a whitelist of settings) and
 * `prefs` (theme and accent, which live in localStorage). Both are optional
 * on the way in, so a version 1 file still restores - it just leaves the
 * current settings alone instead of blanking them.
 *
 * The guard reads `> BACKUP_VERSION` rather than `> 1`, which it used to:
 * bumping the writer without bumping the reader would have made this app
 * refuse its own backups.
 */
export const BACKUP_VERSION = 2

const BACKUP_TABLES = [
  'transactions', 'accounts', 'categories', 'templates', 'recurring', 'debts',
  'goals', 'badges', 'challenges', 'trash', 'notes', 'note_folders',
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
    throw new Error('Not valid JSON. Is this a Spendr backup file?')
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
  if (data.version != null && Number(data.version) > BACKUP_VERSION) {
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
 * A row as a restore writes it: without the note of what the cloud last had.
 *
 * @template {Record<string, any>} T
 * @param {T} row
 * @returns {T}
 */
function withoutSyncedAt(row) {
  const { syncedAt: _noted, ...rest } = row
  return /** @type {T} */ (rest)
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
 *  - `syncedAt` is dropped. It is the device's note of which version of a row
 *    the cloud last agreed on (lib/sync.js isUnsent), and a backup carries the
 *    note of the device that made it: restored, it would read as "already
 *    sent" for rows the cloud has never seen in this form, and the small
 *    tables only send rows that are not. Without it every restored row goes
 *    up once.
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
  const stamp = (rows) => (rows ?? []).map(r => withoutSyncedAt({
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
  const stampBadge = (rows) => (rows ?? []).map(r => withoutSyncedAt({ ...r, synced: UNSYNCED }))

  // Captured before the wipe so we know what the backup drops.
  const [oldTxs, oldAccounts, oldCategories, oldTemplates, oldGoals, oldChallenges, oldTrash, oldNotes, oldFolders, oldRecurring, oldDebts] = await Promise.all([
    db.transactions.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.templates.toArray(),
    db.goals.toArray(),
    db.challenges.toArray(),
    db.trash.toArray(),
    db.notes.toArray(),
    db.note_folders.toArray(),
    db.recurring.toArray(),
    db.debts.toArray(),
  ])

  /* Each call names the table it is restoring. A backup file is parsed JSON,
     so its sections arrive untyped and the generic has nothing better to
     infer - and naming them here is exactly the assertion the restore makes
     anyway: that a section called "accounts" holds accounts. */
  const categories = /** @type {Category[]}    */ (stamp(data.categories))
  const templates  = /** @type {Template[]}    */ (stamp(data.templates))
  const recurring  = /** @type {Recurring[]}   */ (stamp(data.recurring))
  const debts      = /** @type {Debt[]}        */ (stamp(data.debts))
  const transactions = /** @type {Transaction[]} */ (stamp(data.transactions))
  /* Each account's opening, worked out from the balance it had in the file and
     the ledger it will sit beside - a file from before openings has none, and
     one from after has the same figure this gives. Balances are then worked
     out from it, so they must add up from the start (db/balances.js). */
  const restoredMoves = ledgerMoves(Array.isArray(data.transactions) ? transactions : oldTxs)
  const accounts   = /** @type {Account[]}     */ (stamp(data.accounts)).map(a => {
    const { opening } = settleAccount({ ...a, opening: null }, restoredMoves.get(a.name) ?? 0)
    /* A QR photo is a picture this app made (accounts/QrSheets.jsx), never an
       address: one pointing at another site would be fetched every time the
       account opened, saying so to whoever runs it. */
    const qr = typeof a.qrImage === 'string' && a.qrImage.startsWith('data:image/') ? a.qrImage : null
    return { ...a, opening, qrImage: qr }
  })
  const goals      = /** @type {Goal[]}         */ (stamp(data.goals))
  const badges     = /** @type {BadgeRow[]}     */ (stampBadge(data.badges))
  const challenges = /** @type {ChallengeRow[]} */ (stamp(data.challenges))
  // Recently deleted, as it was when the backup was made (db/trash.js).
  const trash      = stamp(data.trash)
  /* Notes (lib/notes.js). Marked as having been on the server when they have
     an id it could know them by: deleting one for good then deletes the
     server's copy too, and a delete aimed at a copy that is not there costs
     nothing. */
  const notes      = /** @type {NoteRow[]} */ (stamp(data.notes)).map(n => ({ ...n, pushed: !!n.syncId }))
  // The folders they are filed in, and the same reason to name them.
  const folders    = /** @type {NoteFolderRow[]} */ (stamp(data.note_folders))

  const keptTxIds  = new Set(transactions.map(t => t.txId).filter(Boolean))
  const droppedTxIds = oldTxs.map(t => t.txId).filter(id => id && !keptTxIds.has(id))

  const keptAccountNames  = new Set(accounts.map(a => a.name))
  const keptTemplateNames = new Set(templates.map(t => t.name))
  const keptCategoryKeys  = new Set(categories.map(c => `${c.name}|${c.type}`))
  const keptGoalNames     = new Set(goals.map(g => g.name))
  const keptChallengeIds  = new Set(challenges.map(c => c.syncId).filter(Boolean))
  const keptTrashIds      = new Set(trash.map(e => e.syncId).filter(Boolean))
  const keptNoteIds       = new Set(notes.map(n => n.syncId).filter(Boolean))
  const keptFolderIds     = new Set(folders.map(f => f.syncId).filter(Boolean))
  const keptRecurringIds  = new Set(recurring.map(r => r.syncId).filter(Boolean))
  const keptDebtIds       = new Set(debts.map(d => d.syncId).filter(Boolean))

  await db.transaction('rw', [
    db.transactions, db.accounts, db.categories, db.templates,
    db.recurring, db.debts, db.goals, db.badges, db.balances, db.meta, db.notifications,
    db.challenges, db.trash, db.notes, db.note_folders,
  ], async () => {
    /* The notifications list is about the ledger it was worked out from. A
       restored ledger gets its own, worked out afresh - and arriving all at
       once, it arrives read (db/notifications.js), apart from the last day. */
    await db.notifications.clear()
    if (Array.isArray(data.transactions)) { await db.transactions.clear(); await db.transactions.bulkAdd(transactions) }
    if (Array.isArray(data.accounts))     { await db.accounts.clear();     await db.accounts.bulkAdd(accounts) }
    if (Array.isArray(data.categories))   { await db.categories.clear();   await db.categories.bulkAdd(categories) }
    if (Array.isArray(data.templates))    { await db.templates.clear();    await db.templates.bulkAdd(templates) }
    if (Array.isArray(data.recurring))    { await db.recurring.clear();    await db.recurring.bulkAdd(recurring) }
    if (Array.isArray(data.debts))        { await db.debts.clear();        await db.debts.bulkAdd(debts) }
    if (Array.isArray(data.goals))        { await db.goals.clear();        await db.goals.bulkAdd(goals) }
    if (Array.isArray(data.challenges))   { await db.challenges.clear();   await db.challenges.bulkAdd(challenges) }
    if (Array.isArray(data.trash))        { await db.trash.clear();        await db.trash.bulkAdd(trash) }
    if (Array.isArray(data.notes))        { await db.notes.clear();        await db.notes.bulkAdd(notes) }
    if (Array.isArray(data.note_folders)) { await db.note_folders.clear(); await db.note_folders.bulkAdd(folders) }
    // Merged, not replaced - see the note by BACKUP_TABLES. bulkPut so a badge already held
    // locally keeps its row rather than colliding on the `key` primary key.
    if (Array.isArray(data.badges) && badges.length) await db.badges.bulkPut(badges)

    /* The settings, from version 2 on. Written one key at a time rather than
       by clearing meta, because meta also holds this device's sync
       bookkeeping and a restore has no business touching that.

       `onboarded` is forced rather than copied: whatever the file says, a
       database with your accounts in it is not a first run, and landing on
       the setup wizard after a restore would offer to seed over the top of
       what was just restored. */
    if (Array.isArray(data.meta)) {
      for (const row of data.meta) {
        if (!row?.key || !BACKUP_META_KEYS.includes(row.key)) continue
        await db.meta.put({ key: row.key, value: row.value, updatedAt: nowISO })
      }
    }
    if (accounts.length) await db.meta.put({ key: 'onboarded', value: true })
    /* A restored ledger is history arriving: the next look at achievements
       writes what it earns without celebrating each - see PRIMED_META. */
    await db.meta.delete(PRIMED_META)

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
  /* The same for challenges, by their syncId. Left on the server, an attempt
     started after the backup would come straight back on the next pull - and
     one it had finished would sit beside the backup's copy still running. */
  if (Array.isArray(data.challenges)) {
    for (const c of oldChallenges) {
      if (c.syncId && !keptChallengeIds.has(c.syncId)) await queueRemoteDelete('challenges', { sync_id: c.syncId })
    }
  }
  /* And Recently deleted, from a file that carries it: a deletion made after
     the backup belongs to a ledger the restore just replaced. Only the ones
     that ever went up - the rest were never on the server to delete. */
  if (Array.isArray(data.trash)) {
    for (const e of oldTrash) {
      if (e.syncId && e.synced === SYNCED && !keptTrashIds.has(e.syncId)) await queueRemoteDelete('trash', { sync_id: e.syncId })
    }
  }

  /* And notes, from a file that has them: one written after the backup would
     otherwise come back from the server on the next pull. */
  if (Array.isArray(data.notes)) {
    for (const n of oldNotes) {
      if (n.syncId && n.pushed && !keptNoteIds.has(n.syncId)) await queueRemoteDelete('notes', { sync_id: n.syncId })
    }
  }
  if (Array.isArray(data.note_folders)) {
    for (const f of oldFolders) {
      if (f.syncId && !keptFolderIds.has(f.syncId)) await queueRemoteDelete('note_folders', { sync_id: f.syncId })
    }
  }
  /* Bills and debts too, which were missing here: a bill added after the
     backup was made was left in the cloud, and the next pull brought it back
     onto the restored phone. By the stable id, never the name (see
     deleteRecurringRemote in lib/sync.js). */
  if (Array.isArray(data.recurring)) {
    for (const r of oldRecurring) {
      if (r.syncId && !keptRecurringIds.has(r.syncId)) await queueRemoteDelete('recurring', { sync_id: r.syncId })
    }
  }
  if (Array.isArray(data.debts)) {
    for (const d of oldDebts) {
      if (d.syncId && !keptDebtIds.has(d.syncId)) await queueRemoteDelete('debts', { sync_id: d.syncId })
    }
  }

  /* Outside the Dexie transaction, because localStorage is not part of it
     and a throw here must not roll back a restore that has already landed. */
  writeLocalPrefs(data.prefs)

  /* Back to a full pull on the next sync.
   *
   * The delta pull asks for rows changed since a high-water mark, and a
   * restore has just replaced the local database with an older copy that
   * knows nothing about that mark. Left in place it would step straight over
   * every row between the backup and now - a restore would silently lose
   * exactly the recent history it was meant to protect.
   *
   * The ledger only, not the deletions: see resetLedgerWatermark. */
  await resetLedgerWatermark()

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
/**
 * The settings a backup carries, and deliberately not the rest of `meta`.
 *
 * A whitelist rather than the whole table, because meta is two things wearing
 * one hat: what you CHOSE, and what this device happens to know. Restoring
 * the second kind would be actively harmful - deletedTxIds and pendingDeletes
 * are queued deletions belonging to another device, and replaying them here
 * would delete rows you still have. lastSync, seeded and syncedNormalized are
 * this install's own bookkeeping; onboarded is set true by the restore itself,
 * since a database full of your money is not a first run.
 */
const BACKUP_META_KEYS = [
  'displayName', 'userName', 'currency', 'skipConfirm', 'budgetRollover',
  'netWorthMode', 'netWorthDebts', 'forecastFloor', 'forecastSettings', 'trendSettings', 'dismissedBills',
]

/**
 * Preferences that never reached Dexie.
 *
 * Theme and accent are localStorage, because they have to be readable before
 * the database opens or the first paint is the wrong colour. That put them
 * outside every backup ever taken - so restoring onto a new phone gave you
 * your money back in somebody else's colours.
 */
function readLocalPrefs() {
  try {
    /* 'spendr-theme', not 'theme'. ThemeContext namespaces its key and the
       first version of this did not, so it read a slot nothing ever writes
       and every backup carried a null theme. */
    return {
      theme: localStorage.getItem('spendr-theme'),
      accentColor: localStorage.getItem('accentColor'),
      style: localStorage.getItem('spendr-style'),
    }
  } catch {
    return {}   // private mode, blocked storage: a backup without them is fine
  }
}

/** @param {Record<string, any>} [prefs] */
function writeLocalPrefs(prefs) {
  if (!prefs) return
  try {
    if (prefs.theme === 'light' || prefs.theme === 'dark') localStorage.setItem('spendr-theme', prefs.theme)
    // A colour, and only a colour: it goes straight into a CSS variable, and a file can say anything.
    if (typeof prefs.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(prefs.accentColor)) localStorage.setItem('accentColor', prefs.accentColor)
    if (prefs.style === 'flat' || prefs.style === 'vivid') localStorage.setItem('spendr-style', prefs.style)
  } catch { /* nothing to do about it, and not worth failing a restore over */ }
}

export async function buildBackupPayload() {
  const [transactions, accounts, categories, templates, recurring, debts, goals, badges, challenges, trash, notes, note_folders] =
    await Promise.all([
      db.transactions.toArray(),
      db.accounts.toArray(),
      db.categories.toArray(),
      db.templates.toArray(),
      db.recurring.toArray(),
      db.debts.toArray(),
      db.goals.toArray(),
      db.badges.toArray(),
      db.challenges.toArray(),
      db.trash.toArray(),
      db.notes.toArray(),
      db.note_folders.toArray(),
    ])

  const meta = (await db.meta.toArray())
    .filter(m => BACKUP_META_KEYS.includes(m.key))
    .map(m => ({ key: m.key, value: m.value }))

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    transactions, accounts, categories, templates, recurring, debts, goals, badges, challenges,
    // Recently deleted, so a restore brings back what could still be put back.
    trash,
    notes,
    note_folders,
    /* Added in version 2. A version 1 file simply has neither, and the
       restore leaves the current settings alone rather than blanking them. */
    meta,
    prefs: readLocalPrefs(),
  }
}

/** meta: when a backup file was last saved on this device - for the reminder
 *  in the bell when it is two weeks old (lib/notifications.js). */
export const LAST_BACKUP_KEY = 'lastBackup'

/** Trigger a browser download of the JSON backup. Returns the row counts. */
export async function downloadBackupJson() {
  const payload = await buildBackupPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spendr-backup-${toDateInput()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  await db.meta.put({ key: LAST_BACKUP_KEY, value: payload.exportedAt })
  /* And the bell's "Time for a backup" goes: it is done. The list keeps
     what happened, but this one was a request, and left there it went on
     saying "You have not saved one yet" about a backup just saved. */
  await db.notifications.filter(n => n.kind === 'backup-stale').delete()
  return { transactions: payload.transactions.length, accounts: payload.accounts.length }
}
