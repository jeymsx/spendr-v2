/* ─────────────────────────────────────────────────────────────────────────────
   Seeds the ten accounts from your real setup, so every card face, brand
   watermark and network mark can be checked side by side on localhost.

   HOW TO RUN
     1. Open http://localhost:5180 (the LOCAL one, not the Vercel deploy).
     2. DevTools -> Console.
     3. Paste this whole file, press Enter.
     4. Reload the page.

   Safe to run twice: it matches on name and updates rather than duplicating.
   Balances are made up - only the names, types, roles and card networks
   matter for looking at the cards.

   This is a throwaway dev file and is NOT committed. Delete it when done.

   It writes straight to IndexedDB rather than through Dexie, because the app
   does not expose `db` on window. `scheme` is an unindexed property, so no
   db.version() bump is involved.
   ───────────────────────────────────────────────────────────────────────────── */
(async () => {
  // `role` is what the account COUNTS AS, and it drives the grouping on the
  // Accounts page (Spending / Savings / Credit). Spread across all three here
  // so every stack has something in it - change any of them in the app's edit
  // form under "Counts As".
  const ACCOUNTS = [
    // name           type       role        balance    limit  cutoff due  network       colour
    ['Cash',         'cash',    'spending',    2400,        0,  null, null, null,         '#12B981'],
    ['GCash',        'ewallet', 'spending',    5700,        0,  null, null, 'mastercard', '#2D9DFF'],
    ['Maya',         'ewallet', 'spending',    3180,        0,  null, null, 'visa',       '#06b6d4'],
    ['BPI',          'bank',    'spending',   64906,        0,  null, null, 'visa',       '#ef4444'],
    ['Metrobank',    'bank',    'spending',   21050,        0,  null, null, 'mastercard', '#f59e0b'],
    ['Maya Savings', 'savings', 'savings',    18760,        0,  null, null, null,         '#0E8F8F'],
    ['GoTyme',       'bank',    'savings',    48454.5,      0,  null, null, 'visa',       '#14b8a6'],
    ['MariBank',     'bank',    'savings',    38623.81,     0,  null, null, null,         '#FF6B00'],
    ['Maya Credit',  'credit',  'credit',         0,    50000,    15,    5, 'mastercard', '#1A1A1A'],
    ['SPayLater',    'credit',  'credit',         0,    16500,    26,    5, null,         '#EE4D2D'],
  ]

  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('SpendrDB')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })

  const tx = db.transaction(['accounts', 'balances'], 'readwrite')
  const accts = tx.objectStore('accounts')
  const bals = tx.objectStore('balances')

  const existing = await new Promise(res => {
    const q = accts.getAll(); q.onsuccess = () => res(q.result)
  })
  const byName = Object.fromEntries(existing.map(a => [a.name, a]))

  let added = 0, updated = 0
  for (let i = 0; i < ACCOUNTS.length; i++) {
    const [name, type, role, balance, creditLimit, cutoffDate, dueDate, scheme, color] = ACCOUNTS[i]
    const row = {
      ...(byName[name] ?? {}),
      name, type, role, balance, color, scheme,
      currency: 'PHP',
      creditLimit: type === 'credit' ? creditLimit : null,
      cutoffDate, dueDate,
      statementDate: null,
      minimumPayment: type === 'credit' ? 500 : null,
      parentName: null,
      sort_order: i,
    }
    if (byName[name]?.id) { row.id = byName[name].id; updated++ } else { delete row.id; added++ }
    accts.put(row)

    // A credit card's balance is derived from its transactions, so it does not
    // get a row here.
    if (type !== 'credit') bals.put({ account: name, balance })
  }

  await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })

  const after = await new Promise(res => {
    const q = db.transaction('accounts', 'readonly').objectStore('accounts').getAll()
    q.onsuccess = () => res(q.result)
  })
  db.close()

  console.table(after.map(a => ({
    name: a.name, type: a.type, 'counts as': a.role,
    balance: a.balance, limit: a.creditLimit, network: a.scheme ?? '—',
  })))
  console.log(`added ${added}, updated ${updated}, total ${after.length}. Now reload the page.`)
})()
