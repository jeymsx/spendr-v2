/* ─────────────────────────────────────────────────────────────────────────────
   Five demo debts, so the rebuilt /debts page and the Home badge have
   something to show.

   Already applied to your local DB. This file is the record of what was
   written and, more importantly, the UNDO.

   Every row carries `demoSeed: 'debts-demo'`, so removal is exact rather than
   a guess at which rows were seeded.

   ── NOTHING ELSE WAS TOUCHED ──────────────────────────────────────────────
   Creating a debt writes one row in `debts` and nothing else - see
   handleSave in src/pages/Debts.jsx. Only RECORDING A PAYMENT moves money
   (PaymentSheet calls applyBalanceEffect), and this seed sets `amountPaid`
   directly rather than going through that path. So every account balance is
   exactly where it was, and the undo below is a pure delete with no
   reconciliation to do.

   ── REMOVE THEM BEFORE SIGNING IN TO SUPABASE ON LOCALHOST ────────────────
   This matters more than it did for the goals seed. Goals sync is currently
   stepped over because the remote table does not exist yet, so a sync would
   leave those alone today. Debts are NOT: `debts` exists in Supabase and
   pushTable('debts', …) pushes every local row unconditionally
   (src/lib/sync.js:431). Signing in on localhost with these present would
   merge five fictional people into your real cloud ledger.

   Note also that `demoSeed` is not part of debtToRow, so the tag does not
   travel. If these ever were pushed, the cloud copies would carry no marker
   and you would be matching them up by name.

   ── TO REMOVE ────────────────────────────────────────────────────────────
   Paste the removeDebtsDemo() block below into the DevTools console on
   http://localhost:5180 and reload.
   ───────────────────────────────────────────────────────────────────────── */

// ── UNDO ─────────────────────────────────────────────────────────────────────
async function removeDebtsDemo() {
  const TAG = 'debts-demo'
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('SpendrDB')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const all = await new Promise((res, rej) => {
    const req = db.transaction('debts', 'readonly').objectStore('debts').getAll()
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  const mine = all.filter(d => d.demoSeed === TAG)
  if (!mine.length) { db.close(); console.log('nothing tagged', TAG); return }

  await new Promise((res, rej) => {
    const tx = db.transaction('debts', 'readwrite')
    const store = tx.objectStore('debts')
    for (const d of mine) store.delete(d.id)
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
  })
  db.close()
  console.log('removed', mine.length, 'demo debts:', mine.map(d => d.contact).join(', '))
}

// ── WHAT WAS WRITTEN ─────────────────────────────────────────────────────────
//
// Dates are absolute rather than relative to "now", so this file keeps saying
// what it actually did however long from now you read it. Seeded 2026-09-10.
//
// The five between them cover every state the page can render, which is the
// only reason there are five:
//
//   Kuya Ramon   i_owe       partial, 8 days overdue   -> red bar, overdue count
//   Nica         i_owe       unpaid, due in 4 days     -> amber date, this-week count
//   Ate Lyn      owed_to_me  partial, 5 days overdue   -> overdue on the other side
//   Jem          owed_to_me  unpaid, no date           -> the "No date set" path
//   Marco        owed_to_me  settled                   -> the folded Settled section
//
// Net position lands at +₱800 (owed ₱5,000, owe ₱4,200), so the All view opens
// on the emerald path; switching to "I owe" shows the red one.

const DEMO_DEBTS = [
  {
    contact: 'Kuya Ramon',
    amount: 5000,
    amountPaid: 2000,
    dueDate: '2026-09-02',
    type: 'i_owe',
    notes: 'Split of the aircon repair. Paying it back in three parts.',
    createdAt: '2026-07-18T09:20:00.000Z',
    synced: 0,
    demoSeed: 'debts-demo',
  },
  {
    contact: 'Nica',
    amount: 1200,
    amountPaid: 0,
    dueDate: '2026-09-14',
    type: 'i_owe',
    notes: 'Covered my share of the Baguio trip van.',
    createdAt: '2026-08-30T12:05:00.000Z',
    synced: 0,
    demoSeed: 'debts-demo',
  },
  {
    contact: 'Ate Lyn',
    amount: 2400,
    amountPaid: 900,
    dueDate: '2026-09-05',
    type: 'owed_to_me',
    notes: 'Lent for her tuition balance.',
    createdAt: '2026-07-02T03:40:00.000Z',
    synced: 0,
    demoSeed: 'debts-demo',
  },
  {
    contact: 'Jem',
    amount: 3500,
    amountPaid: 0,
    dueDate: null,
    type: 'owed_to_me',
    notes: 'No deadline agreed — he will settle when the commission lands.',
    createdAt: '2026-08-11T07:15:00.000Z',
    synced: 0,
    demoSeed: 'debts-demo',
  },
  {
    contact: 'Marco',
    amount: 800,
    amountPaid: 800,
    dueDate: '2026-08-20',
    type: 'owed_to_me',
    notes: 'Paid back in full, same week.',
    createdAt: '2026-08-14T10:00:00.000Z',
    synced: 0,
    demoSeed: 'debts-demo',
  },
]

// ── APPLY (already run once) ─────────────────────────────────────────────────
async function seedDebtsDemo() {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('SpendrDB')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  // Idempotent: re-running must not double the list.
  const all = await new Promise((res, rej) => {
    const req = db.transaction('debts', 'readonly').objectStore('debts').getAll()
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  if (all.some(d => d.demoSeed === 'debts-demo')) {
    db.close()
    console.log('already seeded — run removeDebtsDemo() first')
    return
  }
  await new Promise((res, rej) => {
    const tx = db.transaction('debts', 'readwrite')
    const store = tx.objectStore('debts')
    for (const d of DEMO_DEBTS) store.add(d)
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
  })
  db.close()
  console.log('seeded', DEMO_DEBTS.length, 'demo debts')
}
