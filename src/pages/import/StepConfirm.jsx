import { useState, useMemo } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { IconImport, IconBankUI, IconSparkle, IconBalance } from '../../components/icons'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { IconArrowLeft, IconWarning } from './shared'
import { fmt } from '../../lib/money'
import { runImport } from './runImport'

// ── Step 4: Confirm import ─────────────────────────────────────────────────────

export function StepConfirm({ rows, openingBalances, creditLimits, onBack, onDone }) {
  const [importing, setImporting] = useState(false)
  const [error,     setError]     = useState(null)

  /* Undefined until they have loaded: an empty default made every account in
     the file read as missing for the moment before they did. */
  const existingAccounts   = useLiveQuery(() => db.accounts.toArray(),   [])
  const existingCategories = useLiveQuery(() => db.categories.toArray(), [])

  const missingAccounts = useMemo(() => {
    if (!existingAccounts) return new Set()
    const existing = new Set(existingAccounts.map(a => a.name))
    const missing  = new Set()
    rows.forEach(r => {
      if (r.account && !existing.has(r.account))         missing.add(r.account)
      if (r.fromAccount && !existing.has(r.fromAccount)) missing.add(r.fromAccount)
      if (r.toAccount && !existing.has(r.toAccount))     missing.add(r.toAccount)
    })
    return missing
  }, [rows, existingAccounts])

  const missingCategories = useMemo(() => {
    if (!existingCategories) return new Set()
    const existing = new Set(existingCategories.map(c => c.name))
    return new Set(rows.map(r => r.category).filter(c => c && !existing.has(c)))
  }, [rows, existingCategories])

  async function handleImport() {
    setImporting(true)
    setError(null)
    try {
      /* Everything - the rows, the accounts and categories they need, and what
         they do to the balances - is written in one transaction (runImport),
         which has the rules and the reasons. */
      const { imported, skipped } = await runImport({ rows, openingBalances, creditLimits })
      onDone(imported, skipped)
    } catch (e) {
      console.error('[ImportWizard] import failed:', e)
      setError(e.message || 'Import failed. Please try again.')
      setImporting(false)
    }
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
                  {[...missingAccounts].map(name => (
                    openingBalances?.[name] ? `${name} (${fmt(openingBalances[name])})` : name
                  )).join(', ')} · as Cash
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
                  {[...missingCategories].join(', ')} · as Expense, 📦
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
                Your balances are worked out for you
              </p>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5">
                Each new transaction moves the accounts it names. Accounts you
                already have keep what they hold now.
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
