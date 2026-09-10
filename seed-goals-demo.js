/* ─────────────────────────────────────────────────────────────────────────────
   Three demo goals, so the new /goals page and the Home tile have something
   to show.

   Already applied to your local DB. This file is the record of what was
   written and, more importantly, the UNDO.

   Every row carries `demoSeed: 'goals-demo'`, so removal is exact rather than
   a guess at which rows were seeded. Nothing else was touched: a goal never
   moves money, it only describes a balance, so deleting these three leaves
   every account exactly as it was. That is the whole design - see
   src/lib/goals.js.

   REMOVE THEM before signing in to Supabase on localhost. They are written
   with synced: 0. Goals sync is currently stepped over because the Supabase
   table does not exist yet (see optionalSync in src/lib/sync.js), so today a
   sync would leave them alone - but the moment you apply
   src/supabase/migrations/004_goals.sql, a sync WOULD push them into your real
   cloud data.

   ── TO REMOVE ────────────────────────────────────────────────────────────
   Paste the removeGoalsDemo() block below into the DevTools console on
   http://localhost:5180 and reload.
   ───────────────────────────────────────────────────────────────────────── */

// ── UNDO ─────────────────────────────────────────────────────────────────────
async function removeGoalsDemo() {
  const TAG = 'goals-demo'
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('SpendrDB')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const all = await new Promise((res, rej) => {
    const req = db.transaction('goals', 'readonly').objectStore('goals').getAll()
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  const mine = all.filter(g => g.demoSeed === TAG)
  if (!mine.length) { db.close(); console.log('nothing tagged', TAG); return }
  await new Promise((res, rej) => {
    const tx = db.transaction('goals', 'readwrite')
    const st = tx.objectStore('goals')
    mine.forEach(g => st.delete(g.id))
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
  })
  db.close()
  console.log('removed', mine.length, 'demo goals:', mine.map(g => g.name).join(', '))
}
removeGoalsDemo()

/* ── WHAT WAS SEEDED ──────────────────────────────────────────────────────────

   Three goals, chosen so all three states the waterfall can produce are on
   screen at once. Against your local balances (GCash ₱4,771, BPI ₱42,000):

     1. 🛟 Emergency Fund  ₱30,000   GCash + BPI   ₱30,000  100%  funded
     2. 💻 New Laptop      ₱60,000   BPI           ₱16,771   28%  partial
     3. ✈️ Japan Trip      ₱80,000   GCash         ₱0         0%  starved
        ─────────────────────────────────────────────────────────────────
        Total                                      ₱46,771

   ₱46,771 is exactly GCash + BPI. That is the invariant the whole model rests
   on: the goals never claim more money than exists, because each peso is
   assigned once and the leftovers show as Unassigned.

   Read down the list to see why the order matters. Emergency Fund is first,
   so it empties GCash (₱4,771) and takes ₱25,229 from BPI. New Laptop is
   next and gets whatever BPI has left (₱16,771). Japan Trip only draws on
   GCash, which the first goal already emptied - so it sits at ₱0 until either
   GCash grows or you drag Japan Trip above Emergency Fund.

   Dragging it to the top really does move the money: Japan Trip ₱4,771,
   Emergency Fund still ₱30,000 (now entirely from BPI), New Laptop ₱12,000.
   Same ₱46,771 total. Try it - the list order IS the funding order.

   New Laptop and Japan Trip carry target dates (Jan and Mar 2027) so the
   per-month figure appears; Emergency Fund has none, so it shows no pace line.
   ───────────────────────────────────────────────────────────────────────── */
