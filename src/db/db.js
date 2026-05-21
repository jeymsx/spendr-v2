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

seed().catch(err => console.error('[SpendrDB] seed failed:', err))

export default db
