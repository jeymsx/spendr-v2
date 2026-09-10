/* ─────────────────────────────────────────────────────────────────────────────
   Demo expenses for September 2026, to see the budget surfaces populated.

   Already applied to your local DB. This file is the record of what was
   written and, more importantly, the UNDO.

   Every row carries `demoSeed: 'sept-2026'`, so removal is exact rather than
   a guess at which rows were seeded. Account balances were deliberately NOT
   touched: the budget surfaces read transactions and categories only, so
   leaving balances alone keeps the undo a clean delete with nothing to
   restore. The trade-off is that until these are removed, an account's
   ledger and its balance disagree — which shows up on the account detail
   pages, not on the budget ones.

   REMOVE THEM before signing in to Supabase on localhost. They are written
   with synced: 0, so a sync would push them to your real cloud data.

   ── TO REMOVE ────────────────────────────────────────────────────────────
   Paste the removeDemoSeed() block below into the DevTools console on
   http://localhost:5180 and reload.
   ───────────────────────────────────────────────────────────────────────── */

// ── UNDO ─────────────────────────────────────────────────────────────────────
async function removeDemoSeed() {
  const TAG = 'sept-2026'
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('SpendrDB')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const tx = db.transaction('transactions', 'readwrite')
  const store = tx.objectStore('transactions')
  const rows = await new Promise(res => { const q = store.getAll(); q.onsuccess = () => res(q.result) })
  let removed = 0
  for (const row of rows) if (row.demoSeed === TAG) { store.delete(row.id); removed++ }
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
  console.log(`removed ${removed} demo transactions. Reload the page.`)
}
removeDemoSeed()

/* ── WHAT WAS SEEDED ──────────────────────────────────────────────────────────

   15 expenses dated 1–9 September 2026, ₱11,600 total, chosen so every state
   the UI can show is actually on screen:

     Food      ₱6,450 of ₱6,000   108%  over   (red, drives the callout)
     Shopping  ₱2,400 of ₱3,000    80%  near   (amber)
     Transpo     ₱500 of ₱2,000    25%  fine   (green)
     Bills       ₱400 of ₱4,000    10%  fine   (green)
     ───────────────────────────────────────
     Budgeted  ₱9,750 of ₱15,000   65%         (the headline figure)

     Others    ₱1,850              no limit    (the Unbudgeted section)

   65% is deliberate: it is the figure in the reference design, so the meter
   lights 17 of its 26 pills and can be compared against it directly.
   ───────────────────────────────────────────────────────────────────────── */
