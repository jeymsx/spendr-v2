import { useState, useMemo } from 'react'
import db, { UNSYNCED } from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { IconImport, IconBankUI, IconSparkle, IconBalance } from '../../components/icons'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { IconArrowLeft, IconWarning } from './shared'

// ── Step 4: Confirm import ─────────────────────────────────────────────────────

export function StepConfirm({ rows, openingBalances, creditLimits, onBack, onDone }) {
  const [importing, setImporting] = useState(false)
  const [error,     setError]     = useState(null)

  const existingAccounts   = useLiveQuery(() => db.accounts.toArray(),   [], [])
  const existingCategories = useLiveQuery(() => db.categories.toArray(), [], [])

  const missingAccounts = useMemo(() => {
    const existing = new Set((existingAccounts ?? []).map(a => a.name))
    const missing  = new Set()
    rows.forEach(r => {
      if (r.account && !existing.has(r.account))         missing.add(r.account)
      if (r.fromAccount && !existing.has(r.fromAccount)) missing.add(r.fromAccount)
      if (r.toAccount && !existing.has(r.toAccount))     missing.add(r.toAccount)
    })
    return missing
  }, [rows, existingAccounts])

  const missingCategories = useMemo(() => {
    const existing = new Set((existingCategories ?? []).map(c => c.name))
    return new Set(rows.map(r => r.category).filter(c => c && !existing.has(c)))
  }, [rows, existingCategories])

  async function handleImport() {
    setImporting(true)
    setError(null)
    try {
      // 1. Gather existing txIds to detect duplicates
      const existingTxIds = new Set(
        (await db.transactions.toArray()).map(t => t.txId).filter(Boolean)
      )

      // 2. Separate new vs duplicate rows
      const toInsert   = rows.filter(r => !r.txId || !existingTxIds.has(r.txId))
      const skipCount  = rows.length - toInsert.length

      // 3. Auto-create missing accounts
      for (const name of missingAccounts) {
        const alreadyExists = await db.accounts.where('name').equals(name).first()
        if (!alreadyExists) {
          await db.accounts.add({ name, type: 'cash', balance: 0, currency: 'PHP', color: '#6b7280' })
        }
      }

      // 4. Auto-create missing categories
      for (const name of missingCategories) {
        const alreadyExists = await db.categories.where('name').equals(name).first()
        if (!alreadyExists) {
          await db.categories.add({ name, type: 'expense', icon: '📦', color: '#6b7280', budget: 0 })
        }
      }

      // 5. Insert all new transactions
      if (toInsert.length > 0) {
        const records = toInsert.map(r => ({
          txId:        r.txId || null,
          type:        r.type,
          date:        r.date,
          description: r.description,
          category:    r.category,
          payment:     r.payment ?? null,   // present in legacy CSVs, null for new format
          account:     r.account ?? null,
          fromAccount: r.fromAccount ?? null,
          toAccount:   r.toAccount ?? null,
          amount:      r.amount,
          synced:      UNSYNCED,
          updatedAt:   new Date().toISOString(),
        }))
        await db.transactions.bulkAdd(records)
      }

      // 6. Apply credit limits to credit accounts
      if (creditLimits) {
        for (const [name, limit] of Object.entries(creditLimits)) {
          if (!limit) continue
          const acct = await db.accounts.where('name').equals(name).first()
          if (acct) await db.accounts.update(acct.id, { creditLimit: limit })
        }
      }

      // 7. Recalculate all account balances from scratch
      await recalcAllBalances()

      onDone(toInsert.length, skipCount)
    } catch (e) {
      console.error('[ImportWizard] import failed:', e)
      setError(e.message || 'Import failed. Please try again.')
      setImporting(false)
    }
  }

  async function recalcAllBalances() {
    const allTxs   = await db.transactions.orderBy('date').toArray()
    const allAccts = await db.accounts.toArray()

    // Start from opening balance; default 0 for accounts not in the map
    const balMap     = new Map(allAccts.map(a => [a.name, parseFloat(openingBalances?.[a.name] ?? 0) || 0]))
    const acctTypeMap = new Map(allAccts.map(a => [a.name, a.type]))

    for (const tx of allTxs) {
      const amt = tx.amount ?? 0
      if (tx.type === 'expense' && balMap.has(tx.account)) {
        balMap.set(tx.account, balMap.get(tx.account) - amt)
      } else if (tx.type === 'inflow' && balMap.has(tx.account)) {
        balMap.set(tx.account, balMap.get(tx.account) + amt)
      } else if (tx.type === 'transfer') {
        if (balMap.has(tx.fromAccount)) balMap.set(tx.fromAccount, balMap.get(tx.fromAccount) - amt)
        if (balMap.has(tx.toAccount)) {
          const toIsCredit = acctTypeMap.get(tx.toAccount) === 'credit'
          balMap.set(tx.toAccount, balMap.get(tx.toAccount) + (toIsCredit ? -amt : amt))
        }
      }
    }

    // Write final balances
    await db.transaction('rw', [db.accounts, db.balances], async () => {
      for (const acct of allAccts) {
        const newBal = balMap.get(acct.name) ?? 0
        await db.accounts.update(acct.id, { balance: newBal })
        await db.balances.put({ account: acct.name, balance: newBal })
      }
    })
  }

  return (
    <div className="px-5 pt-4 pb-6">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Ready to import</h2>

      <div className="space-y-3 mb-6">
        {/* What gets inserted */}
        <Card padding="md">
          <div className="flex items-center gap-3">
            <span className="text-slate-500 dark:text-slate-400"><IconImport size={24} /></span>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">
                {rows.length} transactions will be processed
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Duplicates (same txId) will be skipped automatically
              </p>
            </div>
          </div>
        </Card>

        {missingAccounts.size > 0 && (
          <div className="px-4 py-4 rounded-2xl bg-amber-50 dark:bg-amber-500/[0.08]
            border border-amber-100 dark:border-amber-500/20">
            <div className="flex items-start gap-3">
              <span className="shrink-0 text-slate-500 dark:text-slate-400"><IconBankUI size={20} /></span>
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {missingAccounts.size} account{missingAccounts.size > 1 ? 's' : ''} will be created
                </p>
                <p className="text-xs text-amber-600/80 dark:text-amber-500 mt-0.5">
                  {[...missingAccounts].join(', ')} — as Cash, ₱0 balance
                </p>
              </div>
            </div>
          </div>
        )}

        {missingCategories.size > 0 && (
          <div className="px-4 py-4 rounded-2xl bg-amber-50 dark:bg-amber-500/[0.08]
            border border-amber-100 dark:border-amber-500/20">
            <div className="flex items-start gap-3">
              <span className="shrink-0 text-slate-500 dark:text-slate-400"><IconSparkle size={20} /></span>
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {missingCategories.size} categor{missingCategories.size > 1 ? 'ies' : 'y'} will be created
                </p>
                <p className="text-xs text-amber-600/80 dark:text-amber-500 mt-0.5">
                  {[...missingCategories].join(', ')} — as Expense, 📦
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 py-4 rounded-2xl bg-blue-50 dark:bg-primary/[0.08]
          border border-blue-100 dark:border-primary/20">
          <div className="flex items-start gap-3">
            <span className="shrink-0 text-slate-500 dark:text-slate-400"><IconBalance size={20} /></span>
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                Balances recalculated from opening balances
              </p>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5">
                Transactions replayed on top of the opening balances you set.
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 px-4 py-3.5 rounded-2xl
          bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
          <span className="text-red-500 shrink-0 mt-0.5"><IconWarning /></span>
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onBack} disabled={importing}>
          <IconArrowLeft />
          Back
        </Button>
        <Button className="flex-[2]" onClick={handleImport} disabled={importing}>
          {importing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Importing…
            </span>
          ) : (
            `Import ${rows.length} transactions`
          )}
        </Button>
      </div>
    </div>
  )
}
