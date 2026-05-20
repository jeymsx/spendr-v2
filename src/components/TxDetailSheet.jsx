import { useEffect, useState, useMemo } from 'react'
import { useScrollLock } from '../hooks/useScrollLock'
import db from '../db/db'
import { reverseBalanceEffect, applyBalanceEffect } from '../db/txHelpers'
import CategoryPickerSheet from './CategoryPickerSheet'
import AccountPickerSheet from './AccountPickerSheet'

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

const TYPE_CFG = {
  expense:  { label: 'Expense',  color: '#ef4444', badge: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',      sign: '−' },
  inflow:   { label: 'Inflow',   color: '#22c55e', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400', sign: '+' },
  transfer: { label: 'Transfer', color: '#2D9DFF', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',   sign: '' },
}

function toLocalDateStr(isoStr) {
  if (!isoStr) return ''
  return isoStr.slice(0, 10)
}

function fmtDisplayDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Detail row ─────────────────────────────────────────────────────────────────

function DetailRow({ label, value, dot, sub }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04]">
      <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
      <div className="flex items-center gap-2 max-w-[65%]">
        {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
        <div className="text-right">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{value}</p>
          {sub && <p className="text-[10px] text-slate-400 dark:text-slate-500">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Edit field ─────────────────────────────────────────────────────────────────

function EditField({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 px-1">
        {label}
      </p>
      {children}
    </div>
  )
}

function EditInput({ value, onChange, placeholder, inputMode = 'text', ...rest }) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      inputMode={inputMode}
      className="w-full h-[48px] px-4 rounded-2xl text-sm font-medium
        text-slate-800 dark:text-white
        bg-white dark:bg-white/[0.06]
        border border-slate-200/80 dark:border-white/[0.09]
        placeholder-slate-400 dark:placeholder-slate-500
        outline-none focus:ring-2 focus:ring-primary/30
        shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-none"
      {...rest}
    />
  )
}

function EditPickerBtn({ label, dot, placeholder, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full h-[48px] px-4 rounded-2xl text-sm font-medium text-left flex items-center gap-3
        bg-white dark:bg-white/[0.06]
        border border-slate-200/80 dark:border-white/[0.09]
        active:bg-slate-50 dark:active:bg-white/[0.10] transition-colors
        shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-none"
    >
      {dot
        ? <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dot }} />
        : <span className="text-base leading-none">{label?.icon ?? '🏷️'}</span>
      }
      <span className={label ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}>
        {label?.name ?? placeholder}
      </span>
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TxDetailSheet({ open, onClose, transaction: tx, accounts = [], categories = [] }) {
  const [closing,         setClosing]         = useState(false)
  useScrollLock(open)
  const [mode,            setMode]            = useState('detail')   // 'detail' | 'edit' | 'confirm-delete'
  const [saving,          setSaving]          = useState(false)

  // edit state
  const [editAmount,      setEditAmount]      = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDate,        setEditDate]        = useState('')
  const [editCategory,    setEditCategory]    = useState(null)
  const [editAccount,     setEditAccount]     = useState(null)
  const [editFrom,        setEditFrom]        = useState(null)
  const [editTo,          setEditTo]          = useState(null)

  // nested pickers
  const [showCatPicker,  setShowCatPicker]  = useState(false)
  const [showAcctPicker, setShowAcctPicker] = useState(false)
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker,   setShowToPicker]   = useState(false)

  const acctMap = useMemo(() => Object.fromEntries(accounts.map(a => [a.name, a])), [accounts])
  const catMap  = useMemo(() => Object.fromEntries(categories.map(c => [c.name, c])), [categories])

  // reset mode when a different transaction is opened
  useEffect(() => {
    if (tx) setMode('detail')
    setSaving(false)
  }, [tx?.id])

  function enterEdit() {
    if (!tx) return
    setEditAmount(String(tx.amount ?? ''))
    setEditDescription(tx.description ?? '')
    setEditDate(toLocalDateStr(tx.date))
    setEditCategory(catMap[tx.category] ?? null)
    setEditAccount(acctMap[tx.account] ?? null)
    setEditFrom(acctMap[tx.fromAccount] ?? null)
    setEditTo(acctMap[tx.toAccount] ?? null)
    setMode('edit')
  }

  const close = () => {
    if (saving) return
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const newAmount = parseFloat(editAmount) || 0
      const now = new Date().toISOString()
      const newDateISO = editDate
        ? editDate + (tx.date?.slice(10) ?? 'T00:00:00.000Z')
        : tx.date

      const patch = { amount: newAmount, description: editDescription.trim(), date: newDateISO, updatedAt: now, synced: false }

      if (tx.type !== 'transfer') {
        patch.category = editCategory?.name ?? tx.category
        patch.account  = editAccount?.name  ?? tx.account
      } else {
        patch.fromAccount = editFrom?.name ?? tx.fromAccount
        patch.toAccount   = editTo?.name   ?? tx.toAccount
      }

      await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
        await reverseBalanceEffect(tx)
        await applyBalanceEffect({ ...tx, ...patch })
        await db.transactions.update(tx.id, patch)
      })
      close()
    } catch (e) {
      console.error('[TxDetailSheet] save failed:', e)
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      // Add to tombstone so sync doesn't resurrect it
      if (tx.txId) {
        const existing = await db.meta.get('deletedTxIds')
        const list = existing?.value ?? []
        await db.meta.put({ key: 'deletedTxIds', value: [...list, tx.txId] })
      }
      await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
        await reverseBalanceEffect(tx)
        await db.transactions.delete(tx.id)
      })
      close()
    } catch (e) {
      console.error('[TxDetailSheet] delete failed:', e)
      setSaving(false)
    }
  }

  if (!open && !closing) return null
  if (!tx) return null

  const cfg         = TYPE_CFG[tx.type] ?? TYPE_CFG.expense
  const cat         = catMap[tx.category]
  const acct        = acctMap[tx.account]
  const fromAcct    = acctMap[tx.fromAccount]
  const toAcct      = acctMap[tx.toAccount]
  const editCatList = categories.filter(c => c.type === tx.type)

  return (
    <div className="fixed inset-0 z-[100]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />

      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[88vh] overflow-y-auto',
        ].join(' ')}
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))', touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      >
        <div className="sticky top-0 pt-5 px-5 pb-3 bg-white dark:bg-[#111820] z-10">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />

          {/* mode-aware header */}
          {mode === 'detail' && (
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badge}`}>
                {cfg.label}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {fmtDisplayDate(tx.date)} · {fmtTime(tx.date)}
              </span>
            </div>
          )}
          {mode === 'edit' && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMode('detail')}
                className="w-8 h-8 rounded-xl flex items-center justify-center
                  bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400
                  active:scale-90 transition-transform duration-75"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Edit {cfg.label}</h3>
            </div>
          )}
          {mode === 'confirm-delete' && (
            <div className="text-center pb-1">
              <span className="text-2xl">🗑️</span>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white mt-2">Delete Transaction?</h3>
            </div>
          )}
        </div>

        <div className="px-5 pb-2">

          {/* ── DETAIL MODE ── */}
          {mode === 'detail' && (
            <>
              {/* large amount */}
              <div className="text-center py-4 mb-2">
                <p className="text-[42px] font-bold tabular-nums leading-none" style={{ color: cfg.color }}>
                  {cfg.sign}{fmt(tx.amount)}
                </p>
                {tx.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{tx.description}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5 mb-6">
                {cat && <DetailRow label="Category" value={`${cat.icon}  ${cat.name}`} />}
                {acct && <DetailRow label="Account" value={acct.name} dot={acct.color} />}
                {fromAcct && <DetailRow label="From" value={fromAcct.name} dot={fromAcct.color} />}
                {toAcct   && <DetailRow label="To"   value={toAcct.name}   dot={toAcct.color} />}
                <DetailRow label="Date" value={fmtDisplayDate(tx.date)} sub={fmtTime(tx.date)} />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setMode('confirm-delete')}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
                    text-red-500 dark:text-red-400
                    bg-red-50 dark:bg-red-500/10
                    active:bg-red-100 dark:active:bg-red-500/20 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={enterEdit}
                  className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                    bg-primary shadow-[0_4px_16px_rgba(45,157,255,0.35)]
                    active:scale-[0.98] transition-transform duration-100"
                >
                  Edit
                </button>
              </div>
            </>
          )}

          {/* ── EDIT MODE ── */}
          {mode === 'edit' && (
            <div className="flex flex-col gap-3 mt-1">
              <EditField label="Amount">
                <EditInput
                  value={editAmount}
                  onChange={e => setEditAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </EditField>

              <EditField label="Description">
                <EditInput
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  placeholder="Optional note"
                  maxLength={100}
                />
              </EditField>

              <EditField label="Date">
                <input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  className="w-full h-[48px] px-4 rounded-2xl text-sm font-medium
                    text-slate-800 dark:text-white
                    bg-white dark:bg-white/[0.06]
                    border border-slate-200/80 dark:border-white/[0.09]
                    outline-none focus:ring-2 focus:ring-primary/30
                    shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-none
                    [color-scheme:light] dark:[color-scheme:dark]"
                />
              </EditField>

              {tx.type !== 'transfer' ? (
                <>
                  <EditField label="Category">
                    <EditPickerBtn
                      label={editCategory}
                      placeholder="Select category"
                      onClick={() => setShowCatPicker(true)}
                    />
                  </EditField>
                  <EditField label="Account">
                    <EditPickerBtn
                      label={editAccount ? { name: editAccount.name } : null}
                      dot={editAccount?.color}
                      placeholder="Select account"
                      onClick={() => setShowAcctPicker(true)}
                    />
                  </EditField>
                </>
              ) : (
                <>
                  <EditField label="From Account">
                    <EditPickerBtn
                      label={editFrom ? { name: editFrom.name } : null}
                      dot={editFrom?.color}
                      placeholder="Select account"
                      onClick={() => setShowFromPicker(true)}
                    />
                  </EditField>
                  <EditField label="To Account">
                    <EditPickerBtn
                      label={editTo ? { name: editTo.name } : null}
                      dot={editTo?.color}
                      placeholder="Select account"
                      onClick={() => setShowToPicker(true)}
                    />
                  </EditField>
                </>
              )}

              <div className="flex gap-3 mt-1">
                <button
                  onClick={() => setMode('detail')}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
                    text-slate-600 dark:text-slate-300
                    bg-slate-100 dark:bg-white/[0.06]
                    disabled:opacity-40 active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !parseFloat(editAmount)}
                  className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                    bg-primary shadow-[0_4px_16px_rgba(45,157,255,0.35)]
                    disabled:opacity-40 disabled:shadow-none
                    active:scale-[0.98] transition-all duration-100"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* ── CONFIRM DELETE MODE ── */}
          {mode === 'confirm-delete' && (
            <div className="mt-2 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                This will permanently remove:
              </p>
              <p className="text-base font-semibold text-slate-800 dark:text-white mb-0.5">
                {cfg.sign}{fmt(tx.amount)}
              </p>
              {tx.description && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">{tx.description}</p>
              )}
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">
                Account balances will be reversed automatically.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setMode('detail')}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
                    text-slate-600 dark:text-slate-300
                    bg-slate-100 dark:bg-white/[0.06]
                    disabled:opacity-40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                    bg-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.35)]
                    disabled:opacity-40 disabled:shadow-none
                    active:scale-[0.98] transition-all duration-100"
                >
                  {saving ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* nested pickers — z-[110] renders above this sheet at z-[100] */}
      <CategoryPickerSheet
        open={showCatPicker}
        onClose={() => setShowCatPicker(false)}
        categories={editCatList}
        selected={editCategory}
        onSelect={c => { setEditCategory(c); setShowCatPicker(false) }}
      />
      <AccountPickerSheet
        open={showAcctPicker}
        onClose={() => setShowAcctPicker(false)}
        accounts={accounts}
        selected={editAccount}
        onSelect={a => { setEditAccount(a); setShowAcctPicker(false) }}
      />
      <AccountPickerSheet
        open={showFromPicker}
        onClose={() => setShowFromPicker(false)}
        accounts={accounts}
        selected={editFrom}
        onSelect={a => { setEditFrom(a); setShowFromPicker(false) }}
        exclude={editTo ? [editTo.id] : []}
      />
      <AccountPickerSheet
        open={showToPicker}
        onClose={() => setShowToPicker(false)}
        accounts={accounts}
        selected={editTo}
        onSelect={a => { setEditTo(a); setShowToPicker(false) }}
        exclude={editFrom ? [editFrom.id] : []}
      />
    </div>
  )
}
