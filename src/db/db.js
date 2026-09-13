import Dexie from 'dexie'

/**
 * Dexie builds its table properties at runtime from the schema strings below,
 * so a bare `new Dexie()` has none of them as far as a checker is concerned -
 * `db.transactions` reads as a typo for `db.transaction`. This declares what
 * `.stores()` is about to attach.
 *
 * It is a JSDoc cast and nothing more: no wrapper, no subclass, no runtime
 * cost. The record shapes come from src/types.d.ts.
 *
 * @typedef {Dexie & {
 *   transactions: import('dexie').Table<Transaction, number>,
 *   balances:     import('dexie').Table<BalanceRow, string>,
 *   accounts:     import('dexie').Table<Account, number>,
 *   categories:   import('dexie').Table<Category, number>,
 *   debts:        import('dexie').Table<Debt, number>,
 *   recurring:    import('dexie').Table<Recurring, number>,
 *   templates:    import('dexie').Table<Template, number>,
 *   goals:        import('dexie').Table<Goal, number>,
 *   badges:       import('dexie').Table<BadgeRow, string>,
 *   meta:         import('dexie').Table<MetaRow, string>,
 * }} SpendrDB
 */

/** @type {SpendrDB} */
const db = /** @type {SpendrDB} */ (new Dexie('SpendrDB'))

db.version(1).stores({
  transactions: '++id, txId, type, date, description, category, payment, account, fromAccount, toAccount, amount, synced, updatedAt',
  balances:     'account',
  accounts:     '++id, name, type, role, balance, currency, creditLimit, statementDate, dueDate, cutoffDate, minimumPayment, color',
  categories:   '++id, name, icon, color, type, budget',
  debts:        '++id, name, contact, amount, amountPaid, dueDate, type, notes, createdAt',
  recurring:    '++id, name, amount, category, account, frequency, nextDate, active',
  meta:         'key',
})

db.version(2).stores({
  templates: '++id, name, type, amount, description, category, account, fromAccount, toAccount, createdAt',
})

db.version(3).stores({
  accounts: '++id, name, type, role, balance, currency, creditLimit, statementDate, dueDate, cutoffDate, minimumPayment, color',
})

db.version(4).stores({
  categories: '++id, name, icon, color, type, budget, sort_order',
})

db.version(5).stores({
  accounts: '++id, name, type, role, balance, currency, creditLimit, statementDate, dueDate, cutoffDate, minimumPayment, color',
})

db.version(6).stores({
  accounts: '++id, name, type, role, balance, currency, creditLimit, statementDate, dueDate, cutoffDate, minimumPayment, color, parentName',
})

db.version(7).stores({
  accounts: '++id, name, type, role, balance, currency, creditLimit, statementDate, dueDate, cutoffDate, minimumPayment, color, parentName, sort_order',
})

// v8 — drop transaction indexes nothing queries. `description`, `payment`,
// `amount` and `updatedAt` never appear in a where() or orderBy(), so every
// write was maintaining four extra B-trees for nothing, and `description` is
// the worst of them: a long free-text string indexed on every insert.
//
// Removing an index does not touch stored data — the properties stay on every
// record, only the ability to query by them goes, and nothing does. `type` is
// kept despite also being unqueried: it's the one plausible future filter
// (the Transactions page filters by it in JS today).
//
// Only `transactions` is listed, so every other table carries its v7 schema
// forward unchanged.
db.version(8).stores({
  transactions: '++id, txId, type, date, category, account, fromAccount, toAccount, synced',
})

// v9 — savings goals.
//
// A goal names its funding accounts inline, as `accounts: ['Maya Savings']`,
// rather than through a join table. The relational shape would buy nothing
// here: no query needs a link on its own, there are a handful of goals rather
// than thousands, and a join table brings orphan rows, a second table to sync,
// and two cascades to keep in step on every rename and delete instead of one
// array to map over.
//
// `*accounts` is a MULTI-ENTRY index: Dexie indexes each name in the array
// separately, so `where('accounts').equals('Maya Savings')` answers "which
// goals does this account fund?" straight from the index. That is what the
// account detail page asks, and it is the reason the array is indexed at all.
//
// Accounts are referenced by NAME because the rest of the schema already does
// — transactions, balances and parentName all key on it, and Accounts.jsx has
// a rename cascade that goals join. Referencing by id here would make goals
// the only table with a different convention.
//
// `target` is the only figure stored. There is no `saved` column on purpose:
// progress is derived from real balances (see lib/goals.js), so there is
// nothing to top up and nothing that can drift.
db.version(9).stores({
  goals: '++id, name, priority, *accounts, archivedAt',
})

// v10 - badges.
//
// One row per EARNED badge, keyed by the definition's own string key
// ('first-peso', 'green-month'). Not '++id': there is no such thing as two
// First Pesos, and a natural primary key makes awarding an idempotent put
// rather than a read-then-insert that two tabs can race.
//
// Nothing about the badge itself is stored - no name, no description, no
// artwork path. Those live in lib/badges.js, which means copy can be reworded
// and art replaced without a migration, and a key that no longer exists in
// the table of definitions simply stops rendering instead of becoming a row
// nobody can explain. What IS stored is the one fact the code cannot
// recompute: WHEN it was earned. Re-deriving that from the ledger is not
// possible for most of them, and for the rest it would move every time the
// data behind it changed.
db.version(10).stores({
  badges: 'key, earnedAt',
})

/**
 * v11 - a stable identity for every row that syncs.
 *
 * ── The bug this closes, twice over ──
 *
 * Five tables identified themselves to Supabase by something that moves.
 *
 *   accounts, categories, goals   by NAME
 *   debts, recurring, templates   by local_id
 *
 * A name changes when you rename. A local_id changes whenever the database is
 * cleared and re-filled, because Dexie's auto-increment does not reset - and a
 * JSON restore does exactly that. Both have already bitten:
 *
 *   renaming an account made the push an INSERT carrying a local_id the
 *   remote row already had, which the unique constraint rejected, and every
 *   table after it stopped syncing. Patched by 008 dropping the constraint.
 *
 *   editing a bill's amount made the pull stop recognising it, so the remote
 *   copy came back as a second bill - and it could not be deleted, because
 *   the delete was aimed at a local_id the remote row no longer had. Patched
 *   by matching on name and deleting by both.
 *
 * Two patches, one cause, and a third instance waiting. `transactions` has
 * never had either problem, and the reason is that it carries `txId`: a UUID
 * minted once at creation that survives a rename, a restore and a round trip.
 * This gives every other synced table the same thing.
 *
 * ── Why the index ──
 *
 * v8's note is right that an index nothing queries is a B-tree maintained for
 * nothing. This one IS queried: the pull looks a row up by syncId before it
 * falls back to the old heuristics, and that lookup runs per remote row on
 * every sync.
 *
 * `badges` is left out. Its key IS its identity and always was.
 */
db.version(11).stores({
  accounts:   '++id, name, type, role, balance, currency, creditLimit, statementDate, dueDate, cutoffDate, minimumPayment, color, parentName, sort_order, syncId',
  categories: '++id, name, icon, color, type, budget, sort_order, syncId',
  debts:      '++id, name, contact, amount, amountPaid, dueDate, type, notes, createdAt, syncId',
  recurring:  '++id, name, amount, category, account, frequency, nextDate, active, syncId',
  templates:  '++id, name, type, amount, description, category, account, fromAccount, toAccount, createdAt, syncId',
  goals:      '++id, name, priority, *accounts, archivedAt, syncId',
}).upgrade(async (tx) => {
  /* Backfill, once. Every row that already exists gets an identity now rather
     than the first time it happens to be written - a row that is never edited
     again would otherwise never get one, and those are exactly the rows that
     have been syncing the longest. */
  for (const name of SYNCED_TABLES) {
    await tx.table(name).toCollection().modify(row => {
      if (!row.syncId) row.syncId = crypto.randomUUID()
    })
  }
})

/** The tables that carry a syncId. Exported so sync and backup agree. */
export const SYNCED_TABLES = [
  'accounts', 'categories', 'debts', 'recurring', 'templates', 'goals',
]

/** How a row is FILED, as opposed to what it says. Changing only these is not
 *  an edit, so it must not move updatedAt. See the updating hook below. */
const BOOKKEEPING = new Set(['syncId', 'synced'])

/* Stamped on the way IN, for every writer at once.
 *
 * A hook rather than a line in each of the dozen places that insert a row:
 * the whole point is that nothing can be created without one, and a
 * convention every writer has to remember is how five tables ended up
 * identified by a name in the first place. */
for (const name of SYNCED_TABLES) {
  db.table(name).hook('creating', (_key, row) => {
    if (row && !row.syncId) row.syncId = crypto.randomUUID()
  })

  /* And stamped on the way OUT, for the same reason and a worse bug.
   *
   * A pull only takes the remote row when it is strictly NEWER than the local
   * one, so an edit that changes the data without moving updatedAt is an edit
   * that can never travel. It pushes fine - the server stores the new value -
   * and then every other device compares two equal timestamps, declines, and
   * keeps the old number forever. Nothing errors. The two devices simply
   * disagree, and the one you are not looking at is wrong.
   *
   * That is not hypothetical either: 18 of the 31 write sites across these
   * tables did not stamp, including the budget editor and the recurring
   * editor - which is exactly why a bill edited from 599 to 699 on the phone
   * still reads 2026-05-21 on the server and never reached the laptop.
   *
   * Two things are deliberately NOT edits:
   *
   *   an explicit updatedAt - the caller means it, and the sync pull passes
   *   the REMOTE timestamp; stamping now() over that would make every pulled
   *   row instantly look newer than the source it just came from.
   *
   *   a change to nothing but bookkeeping - syncId and synced are how the row
   *   is filed, not what it says. The v11 backfill and the pull's id adoption
   *   both write syncId across rows they are not otherwise touching, and
   *   stamping those would silently mark the entire table as newer than the
   *   server and block real data from ever arriving again. */
  db.table(name).hook('updating', (mods) => {
    if (!mods || typeof mods !== 'object') return
    if ('updatedAt' in mods) return
    const keys = Object.keys(mods)
    if (!keys.length || keys.every(k => BOOKKEEPING.has(k))) return
    return { updatedAt: new Date().toISOString() }
  })
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const DEFAULT_ACCOUNTS = [
  { name: 'Cash', type: 'cash', balance: 0, currency: 'PHP', color: '#10b981' },
]

async function seed() {
  const already = await db.meta.get('seeded')
  if (already) {
    // Migration: users who existed before onboarding was added should skip it
    const onboarded = await db.meta.get('onboarded')
    if (!onboarded) await db.meta.put({ key: 'onboarded', value: true })
    return
  }

  await db.transaction('rw', [db.accounts, db.balances, db.meta], async () => {
    await db.accounts.bulkAdd(DEFAULT_ACCOUNTS)

    await db.balances.bulkPut(
      DEFAULT_ACCOUNTS.map(a => ({ account: a.name, balance: 0 })),
    )

    await db.meta.put({ key: 'seeded', value: true, seededAt: new Date().toISOString() })
  })
}

// ── Sync flag ─────────────────────────────────────────────────────────────────
// IndexedDB rejects booleans as keys, so records written with `synced: false`
// were absent from the `synced` index entirely and every push had to full-scan
// the table. Storing 0/1 makes the existing index usable — no schema change,
// since `synced` is already declared above.

export const UNSYNCED = 0
export const SYNCED   = 1

// Rewrites pre-existing boolean flags. Guarded by a meta key and only marked
// done once it completes, so a failure part-way through is simply retried on
// the next launch. Until it succeeds, getUnsyncedTxs() keeps using the scan.
async function normalizeSyncedFlags() {
  const done = await db.meta.get('syncedNormalized')
  if (done?.value) return

  const stale = await db.transactions
    .filter(t => typeof t.synced !== 'number')
    .toArray()

  if (stale.length) {
    // `synced ? 1 : 0` preserves the old `!t.synced` semantics exactly,
    // including records predating the field, which counted as unsynced.
    // updatedAt is left alone so this doesn't look like a real edit.
    await db.transactions.bulkPut(stale.map(t => ({ ...t, synced: t.synced ? SYNCED : UNSYNCED })))
  }

  await db.meta.put({ key: 'syncedNormalized', value: true })
}

/** Transactions still needing a push. Uses the index once normalised. */
export async function getUnsyncedTxs() {
  const done = await db.meta.get('syncedNormalized')
  if (done?.value) {
    return db.transactions.where('synced').equals(UNSYNCED).toArray()
  }
  // Booleans aren't in the index, so an indexed query would silently miss them.
  return db.transactions.filter(t => !t.synced).toArray()
}

export const dbReady = seed()
  .then(normalizeSyncedFlags)
  .catch(err => console.error('[SpendrDB] init failed:', err))

export default db
