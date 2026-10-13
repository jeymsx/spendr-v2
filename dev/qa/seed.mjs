// A believable six-month ledger, written straight into the app's IndexedDB
// ('SpendrDB') from page JS - for the production build, where the app's own
// modules cannot be imported. Open the app once first (so the database
// exists at its current version), evaluate SEED_IDB, then reload.
//
//   import { seedIdb } from './seed.mjs'
//   await evaluate(seedIdb())   // returns a summary string
//   await reload
//
// Options: evaluate(seedIdb({ empty: true })) gives an onboarded app with
// NO data (for empty states); seedIdb({ version }) sets whatsNewSeen, which
// is this checkout's version unless a check wants What's New to show.
import { readFileSync } from 'node:fs'

const CURRENT = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
export function seedIdb({ empty = false, version = CURRENT } = {}) {
  return `(async () => {
  const EMPTY = ${JSON.stringify(empty)}
  const VERSION = ${JSON.stringify(version)}
  // On a cold dev server the app may not have made its database yet: wait for
  // its tables, closing between looks so its upgrade isn't blocked.
  let db = null
  for (let i = 0; i < 40 && !db; i++) {
    const open = await new Promise((res, rej) => { const r = indexedDB.open('SpendrDB'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    if (open.objectStoreNames.contains('meta')) db = open
    else { open.close(); await new Promise(r => setTimeout(r, 500)) }
  }
  if (!db) throw new Error('the app has not made its database yet')
  const stores = [...db.objectStoreNames]
  const want = ['meta', 'accounts', 'balances', 'transactions', 'categories', 'recurring', 'debts', 'goals', 'templates']
  const tx = db.transaction(want.filter(s => stores.includes(s)), 'readwrite')
  const st = (n) => tx.objectStore(n)
  for (const n of ['accounts', 'balances', 'transactions', 'categories', 'recurring', 'debts', 'goals', 'templates']) if (stores.includes(n)) st(n).clear()
  const now = new Date()
  const stamp = now.toISOString()
  const day = (offset, h = 12) => { const d = new Date(now); d.setDate(d.getDate() + offset); d.setHours(h, 0, 0, 0); return d.toISOString() }
  const uuid = () => crypto.randomUUID()
  st('meta').put({ key: 'onboarded', value: true })
  st('meta').put({ key: 'seeded', value: true })
  st('meta').put({ key: 'whatsNewSeen', value: VERSION })
  st('meta').put({ key: 'displayName', value: 'James', updatedAt: stamp })
  st('meta').put({ key: 'userName', value: 'James', updatedAt: stamp })
  const cats = [
    ['Food', 'expense', '#FFB347', 6000, 0], ['Transpo', 'expense', '#2D9DFF', 2000, 1], ['Bills', 'expense', '#FF6B6B', 16000, 2],
    ['Shopping', 'expense', '#FF8CC8', 3000, 3], ['Personal', 'expense', '#20C997', 1500, 4], ['Others', 'expense', '#6b7280', 0, 5],
    ['Income', 'inflow', '#22c55e', 0, 0], ['Gift Money', 'inflow', '#FF8CC8', 0, 1], ['Others', 'inflow', '#f59e0b', 0, 2],
    ['Transfer', 'transfer', '#2D9DFF', 0, 0], ['Transfer Fee', 'expense', '#f59e0b', 0, 6],
  ]
  cats.forEach(([name, type, color, budget, sort_order], i) => st('categories').put({ id: i + 1, name, type, color, budget, sort_order, icon: '', syncId: uuid(), updatedAt: stamp }))
  if (EMPTY) {
    st('accounts').put({ id: 1, name: 'Cash', type: 'cash', balance: 0, currency: 'PHP', color: '#10b981', sort_order: 0, syncId: uuid(), updatedAt: stamp })
    st('balances').put({ account: 'Cash', balance: 0 })
    await new Promise(r => { tx.oncomplete = r })
    return 'empty ledger'
  }
  const accounts = [
    { id: 1, name: 'Cash', type: 'cash', balance: 1850, color: '#10b981' },
    { id: 2, name: 'GCash', type: 'ewallet', role: 'spending', balance: 4200, color: '#2D9DFF' },
    { id: 3, name: 'BPI', type: 'bank', balance: 18400, color: '#ef4444' },
    { id: 4, name: 'Maya Savings', type: 'ewallet', role: 'savings', balance: 25000, color: '#10b981' },
    { id: 5, name: 'BPI Credit', type: 'credit', balance: -5600, creditLimit: 30000, statementDate: 25, dueDate: 15, cutoffDate: 25, minimumPayment: 850, color: '#7c3aed' },
  ]
  accounts.forEach((a, i) => { st('accounts').put({ currency: 'PHP', sort_order: i, syncId: uuid(), updatedAt: stamp, ...a }); st('balances').put({ account: a.name, balance: a.balance }) })
  let id = 1
  const txs = []
  const workday = (d) => { const x = new Date(d); while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() - 1); return x }
  for (let m = -6; m <= 0; m++) {
    const y = now.getFullYear(), mo = now.getMonth() + m
    for (const dd of [15, new Date(y, mo + 1, 0).getDate()]) {
      const d = workday(new Date(y, mo, dd, 9))
      if (d > now) continue
      txs.push({ type: 'inflow', category: 'Income', description: 'Salary', account: 'BPI', amount: dd === 15 ? 18500 : 21000, date: d.toISOString() })
    }
    const rent = new Date(y, mo, 5, 10)
    if (rent < now) txs.push({ type: 'expense', category: 'Bills', description: 'Rent', account: 'BPI', amount: 12000, date: rent.toISOString() })
  }
  const shops = ['Jollibee', 'Mang Inasal', '7-Eleven', 'SM Supermarket', 'Starbucks', 'Grab', 'Angkas', 'Shopee', 'Lazada', 'Mercury Drug']
  for (let i = 1; i <= 180; i++) {
    if (i % 7 === 3) continue
    const shop = shops[i % shops.length]
    const cat = /Grab|Angkas/.test(shop) ? 'Transpo' : /Shopee|Lazada/.test(shop) ? 'Shopping' : /Mercury/.test(shop) ? 'Personal' : 'Food'
    const acct = cat === 'Shopping' ? 'BPI Credit' : i % 2 ? 'Cash' : 'GCash'
    txs.push({ type: 'expense', category: cat, description: shop, account: acct, amount: 120 + (i * 37) % 480, date: day(-i) })
  }
  txs.push({ type: 'transfer', category: 'Transfer', description: 'To savings', fromAccount: 'BPI', toAccount: 'Maya Savings', amount: 5000, date: day(-20) })
  txs.push({ type: 'transfer', category: 'Transfer', description: 'Cash out', fromAccount: 'GCash', toAccount: 'Cash', amount: 1000, date: day(-9) })
  txs.push({ type: 'inflow', category: 'Gift Money', description: 'Birthday', account: 'GCash', amount: 3000, date: day(-40) })
  for (const t of txs) st('transactions').put({ id: id++, txId: uuid(), synced: 0, updatedAt: stamp, ...t })
  const next = (dom) => { const d = new Date(now.getFullYear(), now.getMonth(), dom); if (d <= now) d.setMonth(d.getMonth() + 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
  const rec = [
    { name: 'Rent', type: 'expense', category: 'Bills', amount: 12000, frequency: 'monthly', nextDate: next(5), active: true, account: 'BPI' },
    { name: 'Netflix', type: 'expense', category: 'Bills', amount: 549, frequency: 'monthly', nextDate: next(20), active: true, account: 'GCash' },
    { name: 'Meralco', type: 'expense', category: 'Bills', amount: 2400, frequency: 'monthly', nextDate: next(24), active: true, account: 'BPI' },
    { name: 'Globe Postpaid', type: 'expense', category: 'Bills', amount: 999, frequency: 'monthly', nextDate: next(12), active: true, account: 'GCash' },
  ]
  rec.forEach((r, i) => st('recurring').put({ id: i + 1, syncId: uuid(), updatedAt: stamp, ...r }))
  if (stores.includes('debts')) {
    st('debts').put({ id: 1, name: 'Lunch money', contact: 'Ana', amount: 1500, amountPaid: 500, type: 'owed_to_me', createdAt: day(-12), syncId: uuid(), updatedAt: stamp })
    st('debts').put({ id: 2, name: 'Concert ticket', contact: 'Ben', amount: 4200, amountPaid: 0, type: 'i_owe', dueDate: next(28), createdAt: day(-5), syncId: uuid(), updatedAt: stamp })
  }
  if (stores.includes('goals')) st('goals').put({ id: 1, name: 'Japan trip', icon: '', target: 80000, accounts: ['Maya Savings'], targetDate: next(1).replace(/^\\d{4}/, String(now.getFullYear() + 1)), priority: 1, syncId: uuid(), updatedAt: stamp })
  if (stores.includes('templates')) {
    st('templates').put({ id: 1, name: 'Lunch', type: 'expense', amount: 180, category: 'Food', account: 'Cash', syncId: uuid(), updatedAt: stamp })
    st('templates').put({ id: 2, name: 'Grab', type: 'expense', amount: 240, category: 'Transpo', account: 'GCash', syncId: uuid(), updatedAt: stamp })
  }
  await new Promise(r => { tx.oncomplete = r })
  return txs.length + ' transactions'
})()`
}
export const SEED_IDB = seedIdb()
