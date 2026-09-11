import Dexie from 'dexie'

const db = new Dexie('SpendrDB')

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
