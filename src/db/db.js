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
