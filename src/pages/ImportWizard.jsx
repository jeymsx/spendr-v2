import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Papa from 'papaparse'
import db, { UNSYNCED } from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { IconCheck, IconUpload } from '../components/icons'

// ── Constants ──────────────────────────────────────────────────────────────────

const NEW_REQUIRED_COLS    = ['tx_id', 'type', 'transaction_date', 'description', 'category', 'from_account', 'to_account', 'amount']
// No 'synced' here on purpose. The app's own CSV export never writes that
// column, and mapLegacyRows sets synced: UNSYNCED itself rather than reading
// it — so requiring it made Spendr reject its own export file.
const LEGACY_REQUIRED_COLS = ['txId', 'type', 'date', 'description', 'category', 'payment', 'account', 'fromAccount', 'toAccount', 'amount']
const VALID_TYPES = new Set(['expense', 'inflow', 'transfer'])

const TRANSFER_RE = /Transfer:\s*(.+?)\s*→\s*(.+)/

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Icons ──────────────────────────────────────────────────────────────────────


function IconFile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}


function IconWarning() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function IconArrowLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function IconSuccess() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepDots({ step }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {[1, 2, 3, 4, 5].map(s => (
        <div
          key={s}
          className={[
            'rounded-full transition-all duration-300',
            s === step
              ? 'w-6 h-2 bg-primary'
              : s < step
                ? 'w-2 h-2 bg-primary/40'
                : 'w-2 h-2 bg-slate-200 dark:bg-white/10',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

// ── CSV parser ─────────────────────────────────────────────────────────────────

function parseCSV(rawText) {
  // Strip UTF-8 BOM (U+FEFF) if present
  const text = rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText

  const result = Papa.parse(text.trim(), { header: true, skipEmptyLines: true, dynamicTyping: false })
  if (result.errors?.length > 0 && !result.data?.length) {
    throw new Error('Malformed CSV: ' + result.errors[0]?.message)
  }

  const cols = new Set(result.meta?.fields ?? [])

  // Detect format by the presence of new vs legacy column names
  const isLegacy = cols.has('txId') || cols.has('payment') || (cols.has('date') && !cols.has('transaction_date'))

  if (isLegacy) {
    const missing = LEGACY_REQUIRED_COLS.filter(c => !cols.has(c))
    if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`)
    return { rows: mapLegacyRows(result.data), isLegacy: true }
  }

  const missing = NEW_REQUIRED_COLS.filter(c => !cols.has(c))
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`)
  return { rows: mapNewRows(result.data), isLegacy: false }
}

function mapNewRows(data) {
  return data.map(row => {
    const type        = String(row.type ?? '').trim().toLowerCase()
    const fromAcc     = String(row.from_account ?? '').trim()
    const toAcc       = String(row.to_account   ?? '').trim()
    const description = String(row.description  ?? '').trim()

    let account = null, fromAccount = null, toAccount = null

    if (type === 'expense') {
      account = fromAcc || null
    } else if (type === 'inflow') {
      account = toAcc || null
    } else if (type === 'transfer') {
      fromAccount = fromAcc || null
      toAccount   = toAcc   || null
      // Fall back to description parsing when accounts are absent
      if (!fromAccount || !toAccount) {
        const m = TRANSFER_RE.exec(description)
        if (m) {
          fromAccount = fromAccount ?? m[1].trim()
          toAccount   = toAccount   ?? m[2].trim()
        }
      }
    }

    return {
      txId:        String(row.tx_id ?? '').trim() || null,
      type,
      date:        String(row.transaction_date ?? '').trim(),
      description,
      category:    String(row.category ?? '').trim(),
      account,
      fromAccount,
      toAccount,
      amount:      parseFloat(row.amount) || 0,
      synced:      UNSYNCED,
    }
  })
}

function mapLegacyRows(data) {
  return data.map(row => ({
    txId:        String(row.txId        ?? '').trim() || null,
    type:        String(row.type        ?? '').trim().toLowerCase(),
    date:        String(row.date        ?? '').trim(),
    description: String(row.description ?? '').trim(),
    category:    String(row.category    ?? '').trim(),
    payment:     String(row.payment     ?? '').trim() || null,
    account:     String(row.account     ?? '').trim() || null,
    fromAccount: String(row.fromAccount ?? '').trim() || null,
    toAccount:   String(row.toAccount   ?? '').trim() || null,
    amount:      parseFloat(row.amount) || 0,
    synced:      UNSYNCED,
  }))
}

// ── Step 1: File picker ────────────────────────────────────────────────────────

function StepFilePicker({ onParsed }) {
  const inputRef    = useRef(null)
  const [dragging, setDragging]   = useState(false)
  const [error,    setError]      = useState(null)
  const [loading,  setLoading]    = useState(false)

  const processFile = useCallback((file) => {
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      setError('Invalid file type — only .csv files are accepted.')
      return
    }
    setError(null)
    setLoading(true)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const { rows, isLegacy } = parseCSV(e.target.result)
        if (rows.length === 0) {
          setError('The CSV file is empty — no data rows found.')
          setLoading(false)
          return
        }
        onParsed(rows, isLegacy, file.name, file.size)
      } catch (err) {
        setError(err.message)
        setLoading(false)
      }
    }
    reader.onerror = () => {
      setError('Failed to read file.')
      setLoading(false)
    }
    reader.readAsText(file)
  }, [onParsed])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    processFile(e.dataTransfer.files[0])
  }, [processFile])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback(() => setDragging(false), [])

  const onFileChange = useCallback((e) => {
    processFile(e.target.files[0])
    e.target.value = ''
  }, [processFile])

  return (
    <div className="px-5 pt-4 pb-6">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Import Data</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Import transactions from a Spendr CSV export.
      </p>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !loading && inputRef.current?.click()}
        className={[
          'relative flex flex-col items-center justify-center gap-3',
          'min-h-[220px] rounded-3xl border-2 border-dashed cursor-pointer',
          'transition-all duration-200 select-none',
          dragging
            ? 'border-primary bg-primary/[0.06] scale-[1.01]'
            : 'border-slate-200 dark:border-white/[0.12] bg-slate-50 dark:bg-white/[0.03]',
          'active:scale-[0.99]',
        ].join(' ')}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Parsing…</p>
          </div>
        ) : (
          <>
            <div className={`${dragging ? 'text-primary' : 'text-slate-300 dark:text-slate-600'} transition-colors duration-200`}>
              <IconUpload size={32} strokeWidth="1.5" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {dragging ? 'Drop it here' : 'Drag & drop your CSV'}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                or tap to browse
              </p>
            </div>
            <span className="text-[11px] font-medium px-3 py-1 rounded-full
              bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500">
              .csv only
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={onFileChange}
          className="absolute inset-0 opacity-0 pointer-events-none"
          tabIndex={-1}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-start gap-3 px-4 py-3.5 rounded-2xl
          bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
          <span className="text-red-500 dark:text-red-400 shrink-0 mt-0.5"><IconWarning /></span>
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Format reference */}
      <div className="mt-5 px-4 py-4 rounded-2xl
        bg-white dark:bg-white/[0.04]
        border border-slate-100 dark:border-white/[0.07]
        shadow-[0_1px_4px_rgba(0,0,0,0.04)] dark:shadow-none">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">
          Expected columns
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono leading-relaxed break-all">
          {NEW_REQUIRED_COLS.join(', ')}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
          Legacy format (txId, date, payment, account…) is also accepted.
        </p>
      </div>
    </div>
  )
}

// ── Step 2: Preview & validation ───────────────────────────────────────────────

function StepPreview({ rows, isLegacy, fileName, fileSize, onBack, onNext }) {
  const existingAccounts  = useLiveQuery(() => db.accounts.toArray(),  [], [])
  const existingCategories = useLiveQuery(() => db.categories.toArray(), [], [])

  const analysis = useMemo(() => {
    if (!rows) return null

    const dates = rows.map(r => r.date).filter(Boolean).sort()
    const earliest = dates[0] ?? '—'
    const latest   = dates[dates.length - 1] ?? '—'

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

      {/* Legacy format notice */}
      {isLegacy && (
        <div className="px-5 mb-5">
          <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl
            bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
            <span className="text-amber-500 dark:text-amber-400 shrink-0 mt-0.5"><IconWarning /></span>
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Legacy format detected</p>
              <p className="text-xs text-amber-600/80 dark:text-amber-500 mt-0.5">
                This file uses the old column names (txId, date, payment, account). It will import correctly — consider exporting a fresh CSV from the new app format in future.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="px-5 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
          Summary
        </p>
        <div className="rounded-2xl overflow-hidden bg-white dark:bg-white/[0.04]
          border border-slate-100 dark:border-white/[0.07]
          shadow-[0_1px_4px_rgba(0,0,0,0.04)] dark:shadow-none">

          <StatRow label="Total transactions" value={String(rows.length)} />
          <Divider />
          <StatRow label="Date range" value={`${analysis.earliest} → ${analysis.latest}`} mono />
          <Divider />
          <StatRow label="Expenses" value={String(analysis.byType.expense)} />
          <Divider />
          <StatRow label="Inflows" value={String(analysis.byType.inflow)} />
          <Divider />
          <StatRow label="Transfers" value={String(analysis.byType.transfer)} />
          {analysis.byType.other > 0 && (
            <>
              <Divider />
              <StatRow label="Unknown type" value={String(analysis.byType.other)} warn />
            </>
          )}
        </div>
      </div>

      {/* Accounts referenced */}
      <div className="px-5 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
          Accounts in file
        </p>
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
              {a}{missingAccounts.has(a) ? ' ✦' : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Categories referenced */}
      <div className="px-5 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
          Categories in file
        </p>
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
              {c}{missingCategories.has(c) ? ' ✦' : ''}
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
              body={`"${[...missingAccounts].join('", "')}" will be auto-created as Cash account${missingAccounts.size > 1 ? 's' : ''} with ₱0 balance.`}
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
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
          Preview (first 10 rows)
        </p>
        <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/[0.07]
          bg-white dark:bg-white/[0.04] shadow-[0_1px_4px_rgba(0,0,0,0.04)] dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-50 dark:border-white/[0.05]">
                  {previewCols.map(col => (
                    <th key={col} className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
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
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono">{row.date}</td>
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
            <div className="px-4 py-2.5 text-center text-[11px] text-slate-400 dark:text-slate-500
              border-t border-slate-50 dark:border-white/[0.04]">
              +{rows.length - 10} more rows not shown
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 flex gap-3">
        <button
          onClick={onBack}
          className="flex items-center justify-center gap-1.5 flex-1 py-3.5 rounded-2xl text-sm font-semibold
            text-slate-600 dark:text-slate-300
            bg-slate-100 dark:bg-white/[0.06]
            active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
        >
          <IconArrowLeft />
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
            bg-primary
            active:scale-[0.98] transition-all duration-100"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Opening balances ───────────────────────────────────────────────────
// Users set the balance each account had BEFORE the first transaction in the file.
// recalcAllBalances() uses these as starting points instead of ₱0.

const ACCT_EMOJI = { cash: '💵', savings: '🏦', credit: '💳', ewallet: '📱' }

function StepOpeningBalances({ rows, onBack, onNext }) {
  const existingAccounts = useLiveQuery(() => db.accounts.toArray(), [], [])
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

  const [balances,      setBalances]      = useState({})
  const [creditLimits,  setCreditLimits]  = useState({})

  // Pre-fill from existing DB accounts once they load
  useEffect(() => {
    if (initialized.current || !existingAccounts?.length) return
    initialized.current = true
    const initBal = {}, initLim = {}
    csvAccounts.forEach(name => {
      const acc = existingAccounts.find(a => a.name === name)
      if (acc?.type === 'credit') {
        if (acc.creditLimit) initLim[name] = String(acc.creditLimit)
      } else {
        if (acc?.balance) initBal[name] = String(acc.balance)
      }
    })
    setBalances(initBal)
    setCreditLimits(initLim)
  }, [existingAccounts, csvAccounts])

  function handleContinue() {
    const numericBal = {}, numericLim = {}
    csvAccounts.forEach(name => {
      const acc = existingAccounts?.find(a => a.name === name)
      if (acc?.type === 'credit') {
        numericLim[name] = parseFloat(creditLimits[name] ?? 0) || 0
      } else {
        numericBal[name] = parseFloat(balances[name] ?? 0) || 0
      }
    })
    onNext({ balances: numericBal, creditLimits: numericLim })
  }

  return (
    <div className="px-5 pt-4 pb-6">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Opening Balances</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
        How much was in each account <span className="font-semibold text-slate-700 dark:text-slate-200">before your first transaction</span> in this file? Leave at 0 if you started from nothing.
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
        Pre-filled from your current account balances — adjust as needed.
      </p>

      <div className="flex flex-col gap-2.5 mb-6">
        {csvAccounts.map(name => {
          const acc = existingAccounts?.find(a => a.name === name)
          const isCredit = acc?.type === 'credit'
          return (
            <div
              key={name}
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl
                bg-white border border-slate-100 shadow-sm
                dark:bg-white/[0.04] dark:border-white/[0.07]"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                style={{
                  backgroundColor: (acc?.color ?? '#6b7280') + '22',
                  border: `1px solid ${acc?.color ?? '#6b7280'}44`,
                }}
              >
                {ACCT_EMOJI[acc?.type] ?? '💰'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[15px] text-slate-800 dark:text-white truncate">{name}</p>
                {isCredit && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Credit limit</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-slate-400 dark:text-slate-500 text-sm">₱</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={isCredit ? (creditLimits[name] ?? '') : (balances[name] ?? '')}
                  onChange={e => isCredit
                    ? setCreditLimits(prev => ({ ...prev, [name]: e.target.value }))
                    : setBalances(prev => ({ ...prev, [name]: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-28 text-right text-slate-800 dark:text-white
                    placeholder:text-slate-300 dark:placeholder:text-slate-600
                    bg-transparent focus:outline-none text-[15px] tabular-nums"
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex items-center justify-center gap-1.5 flex-1 py-3.5 rounded-2xl text-sm font-semibold
            text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]
            active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
        >
          <IconArrowLeft />
          Back
        </button>
        <button
          onClick={handleContinue}
          className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
            bg-primary
            active:scale-[0.98] transition-all duration-100"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Confirm import ─────────────────────────────────────────────────────

function StepConfirm({ rows, openingBalances, creditLimits, onBack, onDone }) {
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
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Ready to Import</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Review what will happen, then confirm.
      </p>

      <div className="space-y-3 mb-6">
        {/* What gets inserted */}
        <div className="px-4 py-4 rounded-2xl bg-white dark:bg-white/[0.04]
          border border-slate-100 dark:border-white/[0.07]
          shadow-[0_1px_4px_rgba(0,0,0,0.04)] dark:shadow-none">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📥</span>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">
                {rows.length} transactions will be processed
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Duplicates (same txId) will be skipped automatically
              </p>
            </div>
          </div>
        </div>

        {missingAccounts.size > 0 && (
          <div className="px-4 py-4 rounded-2xl bg-amber-50 dark:bg-amber-500/[0.08]
            border border-amber-100 dark:border-amber-500/20">
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">🏦</span>
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
              <span className="text-xl shrink-0">🏷️</span>
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
            <span className="text-xl shrink-0">⚖️</span>
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
        <button
          onClick={onBack}
          disabled={importing}
          className="flex items-center justify-center gap-1.5 flex-1 py-3.5 rounded-2xl text-sm font-semibold
            text-slate-600 dark:text-slate-300
            bg-slate-100 dark:bg-white/[0.06]
            disabled:opacity-40 active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
        >
          <IconArrowLeft />
          Back
        </button>
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
            bg-primary
            disabled:opacity-50 disabled:shadow-none
            active:scale-[0.98] transition-all duration-100"
        >
          {importing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Importing…
            </span>
          ) : (
            `Import ${rows.length} Transactions`
          )}
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Success ────────────────────────────────────────────────────────────

function StepSuccess({ imported, skipped, onImportAnother }) {
  const navigate = useNavigate()

  return (
    <div className="px-5 pt-8 pb-6 flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-500/15
        flex items-center justify-center text-emerald-500 dark:text-emerald-400 mb-5">
        <IconSuccess />
      </div>

      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1.5">Import Complete</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-8">
        Your transactions have been imported and account balances recalculated.
      </p>

      {/* Result cards */}
      <div className="w-full grid grid-cols-2 gap-3 mb-8">
        <div className="px-4 py-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/[0.08]
          border border-emerald-100 dark:border-emerald-500/20">
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{imported}</p>
          <p className="text-xs text-emerald-600/70 dark:text-emerald-500 mt-0.5 font-medium">Imported</p>
        </div>
        <div className="px-4 py-4 rounded-2xl bg-slate-50 dark:bg-white/[0.04]
          border border-slate-100 dark:border-white/[0.07]">
          <p className="text-2xl font-semibold text-slate-500 dark:text-slate-400 tabular-nums">{skipped}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">Skipped (dupes)</p>
        </div>
      </div>

      <div className="w-full space-y-3">
        <button
          onClick={() => navigate('/')}
          className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white
            bg-primary
            active:scale-[0.98] transition-all duration-100"
        >
          Go to Dashboard
        </button>
        <button
          onClick={onImportAnother}
          className="w-full py-3.5 rounded-2xl text-sm font-semibold
            text-slate-600 dark:text-slate-300
            bg-slate-100 dark:bg-white/[0.06]
            active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
        >
          Import Another File
        </button>
      </div>
    </div>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function StatRow({ label, value, mono = false, warn = false }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className={[
        'text-sm font-semibold',
        warn
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-slate-800 dark:text-white',
        mono ? 'font-mono text-xs' : '',
      ].join(' ')}>
        {value}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
}

function WarnBanner({ title, body }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl
      bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
      <span className="text-amber-500 dark:text-amber-400 shrink-0 mt-0.5"><IconWarning /></span>
      <div>
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{title}</p>
        <p className="text-xs text-amber-600/80 dark:text-amber-500 mt-0.5">{body}</p>
      </div>
    </div>
  )
}

const TYPE_STYLES = {
  expense:  'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400',
  inflow:   'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  transfer: 'bg-blue-100 dark:bg-primary/15 text-blue-600 dark:text-primary',
}

function TypeBadge({ type }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_STYLES[type] ?? 'bg-slate-100 dark:bg-white/10 text-slate-500'}`}>
      {type || '?'}
    </span>
  )
}

// ── Main wizard ────────────────────────────────────────────────────────────────

export default function ImportWizard() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromOnboarding = location.state?.from === 'onboarding'
  const [step,            setStep]            = useState(1)
  const [rows,            setRows]            = useState(null)
  const [isLegacy,        setIsLegacy]        = useState(false)
  const [fileName,        setFileName]        = useState('')
  const [fileSize,        setFileSize]        = useState(0)
  const [openingBalances, setOpeningBalances] = useState({})
  const [creditLimits,    setCreditLimits]    = useState({})
  const [imported,        setImported]        = useState(0)
  const [skipped,         setSkipped]         = useState(0)

  function handleParsed(parsedRows, legacy, name, size) {
    setRows(parsedRows)
    setIsLegacy(legacy)
    setFileName(name)
    setFileSize(size)
    setStep(2)
  }

  function handleOpeningBalances({ balances, creditLimits: limits }) {
    setOpeningBalances(balances)
    setCreditLimits(limits)
    setStep(4)
  }

  function handleDone(importedCount, skippedCount) {
    setImported(importedCount)
    setSkipped(skippedCount)
    setStep(5)
  }

  function reset() {
    setRows(null)
    setIsLegacy(false)
    setFileName('')
    setFileSize(0)
    setOpeningBalances({})
    setCreditLimits({})
    setStep(1)
  }

  const STEP_LABELS = {
    1: 'Select File',
    2: 'Preview & Validate',
    3: 'Opening Balances',
    4: 'Confirm Import',
    5: 'Done',
  }

  return (
    <div className="page-enter min-h-screen pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-[#0d1117]
        border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-center gap-3 px-4 pt-safe-header pb-3">
          <button
            onClick={() => {
              if (step === 1 || step === 5) navigate(fromOnboarding ? '/' : '/settings')
              else setStep(s => s - 1)
            }}
            aria-label={step === 1 || step === 5 ? 'Leave the importer' : 'Back to the previous step'}
            className="w-9 h-9 rounded-xl flex items-center justify-center
              text-slate-500 dark:text-slate-400
              bg-slate-100 dark:bg-white/[0.06]
              active:bg-slate-200 dark:active:bg-white/[0.12] transition-colors"
          >
            <IconArrowLeft />
          </button>
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {step < 5 ? `Step ${step} of 4` : 'Complete'}
            </p>
            <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {STEP_LABELS[step]}
            </h1>
          </div>
        </div>
        <div className="px-4 pb-3">
          <StepDots step={step} />
        </div>
      </div>

      {/* Steps */}
      {step === 1 && (
        <StepFilePicker onParsed={handleParsed} />
      )}
      {step === 2 && rows && (
        <StepPreview
          rows={rows}
          isLegacy={isLegacy}
          fileName={fileName}
          fileSize={fileSize}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && rows && (
        <StepOpeningBalances
          rows={rows}
          onBack={() => setStep(2)}
          onNext={handleOpeningBalances}
        />
      )}
      {step === 4 && rows && (
        <StepConfirm
          rows={rows}
          openingBalances={openingBalances}
          creditLimits={creditLimits}
          onBack={() => setStep(3)}
          onDone={handleDone}
        />
      )}
      {step === 5 && (
        <StepSuccess
          imported={imported}
          skipped={skipped}
          onImportAnother={reset}
        />
      )}
    </div>
  )
}
