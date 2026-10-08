import { useState, useMemo, useEffect, useRef } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { ACCOUNT_TYPE_ICON, IconCashUI, IconCheck, IconInfo } from '../../components/icons'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import SectionLabel from '../../components/ui/SectionLabel'
import DetailRow from '../../components/ui/DetailRow'
import { fmt, baseSymbol, zeroAmount } from '../../lib/money'
import { isoToDateInput } from '../../utils/txDate'
import { fmtDateFull } from '../../utils/recurring'
import { IconArrowLeft, fmtBytes, VALID_TYPES, IconFile } from './shared'
import { WarnBanner, TypeBadge } from './bits'

// ── Step 2: Preview & validation ───────────────────────────────────────────────

/* "Sep 1, 2026", on the reader's own calendar. A Spendr file stores the moment
   in UTC ("2026-09-01T04:00:00.000Z"), which is what the preview used to print.
   A date the file wrote some other way is shown as it came. */
/** @param {string} [d] */
function readableDate(d) {
  if (!d) return '—'
  const day = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : isoToDateInput(d)
  return fmtDateFull(day) || d
}

/* "Sep 1 – Sep 3, 2026": the year once when both ends share it. */
/** @param {string} [a] @param {string} [b] */
function readableRange(a, b) {
  const from = readableDate(a)
  const to = readableDate(b)
  if (from === to) return from
  const year = /, (\d{4})$/
  const fy = from.match(year)?.[1]
  if (fy && fy === to.match(year)?.[1]) return `${from.replace(year, '')} – ${to}`
  return `${from} – ${to}`
}

/** @param {{rows: Array<Record<string, any>>, format: import('./csv').CsvFormat, fileName: string, fileSize: number, onBack: () => void, onNext: () => void}} props */
export function StepPreview({ rows, format, fileName, fileSize, onBack, onNext }) {
  /* Undefined until loaded - an empty default read every account as missing
     for the moment before they were. */
  const existingAccounts  = useLiveQuery(() => db.accounts.toArray(),  [])
  const existingCategories = useLiveQuery(() => db.categories.toArray(), [])

  const analysis = useMemo(() => {
    if (!rows) return null

    const dates = rows.map(r => r.date).filter(Boolean).sort()
    const earliest = dates[0]
    const latest   = dates[dates.length - 1]

    const byType = { expense: 0, inflow: 0, transfer: 0, other: 0 }
    rows.forEach(r => {
      if (r.type === 'expense')  byType.expense++
      else if (r.type === 'inflow')   byType.inflow++
      else if (r.type === 'transfer') byType.transfer++
      else byType.other++
    })

    const accountSet  = new Set()
    const categorySet = new Set()
    rows.forEach(r => {
      if (r.account)     accountSet.add(r.account)
      if (r.fromAccount) accountSet.add(r.fromAccount)
      if (r.toAccount)   accountSet.add(r.toAccount)
      if (r.category)    categorySet.add(r.category)
    })
    accountSet.delete('')
    categorySet.delete('')

    return { earliest, latest, byType, accountSet, categorySet }
  }, [rows])

  const missingAccounts = useMemo(() => {
    if (!analysis || !existingAccounts) return new Set()
    const existing = new Set((existingAccounts ?? []).map(a => a.name))
    return new Set([...analysis.accountSet].filter(a => !existing.has(a)))
  }, [analysis, existingAccounts])

  const missingCategories = useMemo(() => {
    if (!analysis || !existingCategories) return new Set()
    const existing = new Set((existingCategories ?? []).map(c => c.name))
    return new Set([...analysis.categorySet].filter(c => !existing.has(c)))
  }, [analysis, existingCategories])

  const preview = rows?.slice(0, 10) ?? []

  const previewCols = ['date', 'type', 'description', 'account', 'amount']

  if (!analysis) return null

  return (
    <div className="pb-6">
      {/* File badge */}
      <div className="px-5 pt-4 mb-5">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl
          bg-emerald-50 dark:bg-emerald-500/[0.08]
          border border-emerald-100 dark:border-emerald-500/20">
          <span className="text-emerald-600 dark:text-emerald-400 shrink-0"><IconFile /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 truncate">{fileName}</p>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-500 mt-0.5">
              {fmtBytes(fileSize)} · {rows.length} rows found
            </p>
          </div>
          <span className="text-emerald-500 dark:text-emerald-400 shrink-0"><IconCheck /></span>
        </div>
      </div>

      {/* Spendr's own export. Not a warning - there is nothing to fix - and not
          "from an older version": this is the file Spendr writes today, which
          is what it used to be called by mistake. */}
      {format === 'spendr' && (
        <div className="px-5 mb-5">
          <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl
            bg-blue-50 dark:bg-primary/[0.08] border border-blue-100 dark:border-primary/20">
            <span className="text-slate-500 dark:text-slate-400 shrink-0 mt-0.5"><IconInfo size={16} /></span>
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">A Spendr export</p>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5">
                This file is laid out the way Spendr exports it, so it imports as
                it is. There is nothing you need to change.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="px-5 mb-5">
        <SectionLabel>Summary</SectionLabel>
        <Card clip>
          <DetailRow label="Total transactions" value={String(rows.length)} />
          <DetailRow label="Date range" value={readableRange(analysis.earliest, analysis.latest)} />
          <DetailRow label="Expenses" value={String(analysis.byType.expense)} />
          <DetailRow label="Inflows" value={String(analysis.byType.inflow)} />
          <DetailRow
            label="Transfers"
            value={String(analysis.byType.transfer)}
            isLast={analysis.byType.other === 0}
          />
          {analysis.byType.other > 0 && (
            <DetailRow
              label="Unknown type"
              value={String(analysis.byType.other)}
              tone="text-amber-600 dark:text-amber-400"
              isLast
            />
          )}
        </Card>
      </div>

      {/* Accounts referenced */}
      <div className="px-5 mb-5">
        <SectionLabel>Accounts in file</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {[...analysis.accountSet].map(a => (
            <span
              key={a}
              className={[
                'text-xs font-medium px-3 py-1.5 rounded-full',
                missingAccounts.has(a)
                  ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/25'
                  : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-300',
              ].join(' ')}
            >
              {a}{missingAccounts.has(a) ? ' *' : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Categories referenced */}
      <div className="px-5 mb-5">
        <SectionLabel>Categories in file</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {[...analysis.categorySet].map(c => (
            <span
              key={c}
              className={[
                'text-xs font-medium px-3 py-1.5 rounded-full',
                missingCategories.has(c)
                  ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/25'
                  : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-300',
              ].join(' ')}
            >
              {c}{missingCategories.has(c) ? ' *' : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Warnings */}
      {(missingAccounts.size > 0 || missingCategories.size > 0) && (
        <div className="px-5 mb-5 space-y-2.5">
          {missingAccounts.size > 0 && (
            <WarnBanner
              title={`${missingAccounts.size} account${missingAccounts.size > 1 ? 's' : ''} not in your wallet`}
              body={`"${[...missingAccounts].join('", "')}" will be created as ${missingAccounts.size > 1 ? 'Cash accounts' : 'a Cash account'}. You can set what each one started with next.`}
            />
          )}
          {missingCategories.size > 0 && (
            <WarnBanner
              title={`${missingCategories.size} categor${missingCategories.size > 1 ? 'ies' : 'y'} not found`}
              body={`"${[...missingCategories].join('", "')}" will be auto-created as Expense categor${missingCategories.size > 1 ? 'ies' : 'y'}.`}
            />
          )}
        </div>
      )}

      {/* Preview table */}
      <div className="px-5 mb-6">
        <SectionLabel>Preview (first 10 rows)</SectionLabel>
        <Card clip>
          <div className="overflow-x-auto">
            <table className="w-full text-11">
              <thead>
                <tr className="border-b border-slate-50 dark:border-white/[0.05]">
                  {previewCols.map(col => (
                    <th key={col} className="text-left px-3 py-2.5 font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b last:border-0 border-slate-50 dark:border-white/[0.04] ${
                      !VALID_TYPES.has(row.type) ? 'bg-red-50/50 dark:bg-red-500/[0.05]' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">{readableDate(row.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <TypeBadge type={row.type} />
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[120px] truncate">{row.description || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.account || row.fromAccount || '—'}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap font-medium text-slate-800 dark:text-white">{fmt(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 10 && (
            <>
              <Divider />
              <div className="px-4 py-2.5 text-center text-11 text-slate-400 dark:text-slate-500">
                +{rows.length - 10} more rows not shown
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Actions */}
      <div className="px-5 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          <IconArrowLeft />
          Back
        </Button>
        <Button className="flex-[2]" onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  )
}

// ── Step 3: Opening balances ───────────────────────────────────────────────────
// Asked only for the accounts this import CREATES: an account already in the
// wallet has a balance, and the import leaves it alone except for the rows it
// adds (runImport.js). So a created account's opening balance is the one thing
// nothing else can say - what it held before the file's first row.
// Credit limits are the exception that is not a balance: a card that is
// already there can have its limit set here, as before.

// Account glyphs come from ACCOUNT_TYPE_ICON in components/icons.jsx, so
// the wizard and the rest of the app cannot drift apart.

/**
 * One account and the figure being asked for.
 *
 * @param {{name: string, acc?: Record<string, any>, caption: string, value: string, onChange: (v: string) => void}} props
 */
function AccountFigureRow({ name, acc, caption, value, onChange }) {
  const Icon = ACCOUNT_TYPE_ICON[acc?.type] ?? IconCashUI
  return (
    <Card className="flex items-center gap-3 px-4 py-3.5">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
        style={{
          backgroundColor: (acc?.color ?? '#6b7280') + '22',
          border: `1px solid ${acc?.color ?? '#6b7280'}44`,
        }}
      >
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-15 text-slate-800 dark:text-white truncate">{name}</p>
        <p className="text-11 text-slate-400 dark:text-slate-500 mt-0.5">{caption}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-slate-400 dark:text-slate-500 text-sm">{baseSymbol()}</span>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={`${baseSymbol()}${zeroAmount()}`}
          aria-label={`${name}, ${caption.toLowerCase()}`}
          className="w-28 text-right text-slate-800 dark:text-white
            placeholder:text-slate-300 dark:placeholder:text-slate-600
            bg-transparent focus:outline-none text-15 tabular-nums"
        />
      </div>
    </Card>
  )
}

/** @param {{rows: Array<Record<string, any>>, onBack: () => void, onNext: (r: {balances: Record<string, number>, creditLimits: Record<string, number>}) => void}} props */
export function StepOpeningBalances({ rows, onBack, onNext }) {
  // Undefined until loaded: an empty default would make every account new.
  const existingAccounts = useLiveQuery(() => db.accounts.toArray(), [])
  const initialized = useRef(false)

  // All unique account names referenced in the CSV
  const csvAccounts = useMemo(() => {
    const set = new Set()
    rows.forEach(r => {
      if (r.account)     set.add(r.account)
      if (r.fromAccount) set.add(r.fromAccount)
      if (r.toAccount)   set.add(r.toAccount)
    })
    set.delete('')
    return [...set].sort()
  }, [rows])

  // The accounts the import will create, and the cards it can set a limit on.
  const { created, cards } = useMemo(() => {
    if (!existingAccounts) return { created: [], cards: [] }
    const byName = new Map(existingAccounts.map(a => [a.name, a]))
    return {
      created: csvAccounts.filter(n => !byName.has(n)),
      cards: csvAccounts.filter(n => byName.get(n)?.type === 'credit'),
    }
  }, [csvAccounts, existingAccounts])

  const [balances,      setBalances]      = useState({})
  const [creditLimits,  setCreditLimits]  = useState({})

  // Pre-fill each card's limit from the one it has, once the accounts load.
  useEffect(() => {
    if (initialized.current || !existingAccounts) return
    initialized.current = true
    const initLim = {}
    csvAccounts.forEach(name => {
      const acc = existingAccounts.find(a => a.name === name)
      if (acc?.type === 'credit' && acc.creditLimit) initLim[name] = String(acc.creditLimit)
    })
    setCreditLimits(initLim)
  }, [existingAccounts, csvAccounts])

  function handleContinue() {
    const numericBal = {}, numericLim = {}
    created.forEach(name => { numericBal[name] = parseFloat(balances[name] ?? 0) || 0 })
    cards.forEach(name => { numericLim[name] = parseFloat(creditLimits[name] ?? 0) || 0 })
    onNext({ balances: numericBal, creditLimits: numericLim })
  }

  // Nothing to show until the accounts are known.
  if (!existingAccounts) return null

  return (
    <div className="px-5 pt-4 pb-6">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Opening balances</h2>
      {created.length > 0 ? (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
            How much was in each new account <span className="font-semibold text-slate-700 dark:text-slate-200">before your first transaction</span> in this file? Leave at 0 if you started from nothing.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
            Accounts you already have keep their balances. Only the transactions in this file are added to them.
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          Every account in this file is already in your wallet, so their balances stay as they are.
          Only the transactions in this file are added to them.
        </p>
      )}

      {created.length > 0 && (
        <div className="flex flex-col gap-2.5 mb-6">
          {created.map(name => (
            <AccountFigureRow
              key={name}
              name={name}
              caption="New account"
              value={balances[name] ?? ''}
              onChange={v => setBalances(prev => ({ ...prev, [name]: v }))}
            />
          ))}
        </div>
      )}

      {cards.length > 0 && (
        <div className="mb-6">
          <SectionLabel>Credit limits</SectionLabel>
          <div className="flex flex-col gap-2.5">
            {cards.map(name => (
              <AccountFigureRow
                key={name}
                name={name}
                acc={existingAccounts.find(a => a.name === name)}
                caption="Credit limit"
                value={creditLimits[name] ?? ''}
                onChange={v => setCreditLimits(prev => ({ ...prev, [name]: v }))}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          <IconArrowLeft />
          Back
        </Button>
        <Button className="flex-[2]" onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}
