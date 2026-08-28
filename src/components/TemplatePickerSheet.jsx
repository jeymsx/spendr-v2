import { useState, useCallback, useRef } from 'react'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useScrollLock } from '../hooks/useScrollLock'
import { deleteTemplateRemote } from '../lib/sync'

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

const TYPE_COLOR = {
  expense:  { bg: 'bg-red-50 dark:bg-red-500/10',     text: 'text-red-500 dark:text-red-400'     },
  inflow:   { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400' },
  transfer: { bg: 'bg-blue-50 dark:bg-blue-500/10',   text: 'text-blue-600 dark:text-blue-400'   },
}

function TemplateRow({ tpl, onTap, onLongPressDelete }) {
  const timerRef     = useRef(null)
  const firedRef     = useRef(false)
  const [pressed, setPressed] = useState(false)

  const start = useCallback(() => {
    firedRef.current = false
    setPressed(true)
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      setPressed(false)
      onLongPressDelete(tpl)
    }, 550)
  }, [tpl, onLongPressDelete])

  const end = useCallback(() => {
    clearTimeout(timerRef.current)
    setPressed(false)
    if (!firedRef.current) onTap(tpl)
    firedRef.current = false
  }, [tpl, onTap])

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current)
    setPressed(false)
    firedRef.current = false
  }, [])

  const tc = TYPE_COLOR[tpl.type] ?? TYPE_COLOR.expense

  return (
    <div
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      className={`flex items-center gap-3 px-4 py-3.5 select-none cursor-pointer transition-colors duration-75
        ${pressed ? 'bg-slate-50 dark:bg-white/[0.06]' : 'active:bg-slate-50 dark:active:bg-white/[0.04]'}`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[18px] shrink-0 ${tc.bg}`}>
        {tpl.type === 'transfer' ? '🔄' : (tpl.categoryIcon ?? '⚡')}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{tpl.name}</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
          {tpl.type === 'transfer'
            ? `${tpl.fromAccount} → ${tpl.toAccount}`
            : (tpl.account ?? '')}
        </p>
      </div>
      <p className={`text-sm font-bold tabular-nums shrink-0 ${tc.text}`}>{fmt(tpl.amount)}</p>
    </div>
  )
}

export default function TemplatePickerSheet({ open, onClose, type, onSelect }) {
  const [closing, setClosing] = useState(false)
  useScrollLock(open)
  const [deleting, setDeleting] = useState(null)

  const rawTemplates = useLiveQuery(() => db.templates.toArray(), [], [])
  const categories   = useLiveQuery(() => db.categories.toArray(), [], [])

  const templates = (rawTemplates ?? [])
    .filter(t => !type || t.type === type)
    .map(t => {
      const cat = (categories ?? []).find(c => c.name === t.category)
      return { ...t, categoryIcon: cat?.icon ?? '⚡' }
    })
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  async function confirmDelete(tpl) {
    setDeleting(tpl.id)
    await db.templates.delete(tpl.id)
    await deleteTemplateRemote(tpl.id, tpl.name)
    setDeleting(null)
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[130]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={`${closing ? 'sheet-panel-exit' : 'sheet-panel'} absolute bottom-0 inset-x-0 rounded-t-[28px]
          bg-slate-50 dark:bg-[#0d1117]
          border-t border-slate-100 dark:border-white/[0.07]
          max-h-[80vh] flex flex-col`}
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="pt-5 px-5 pb-3 border-b border-slate-100 dark:border-white/[0.04] shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">Quick Templates</h3>
            <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
              Close
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          {templates.length === 0 ? (
            <div className="py-14 text-center px-8">
              <p className="text-3xl mb-3">⚡</p>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No templates yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Save a transaction as a template to use it here
              </p>
            </div>
          ) : (
            <div className="mx-5 mt-4 rounded-2xl overflow-hidden
              bg-white border border-slate-100
              dark:bg-white/[0.04] dark:border-white/[0.07]">
              {templates.map((tpl, i) => (
                <div key={tpl.id}>
                  {deleting === tpl.id ? (
                    <div className="flex items-center justify-center px-4 py-3.5">
                      <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    </div>
                  ) : (
                    <TemplateRow
                      tpl={tpl}
                      onTap={t => { close(); setTimeout(() => onSelect(t), 260) }}
                      onLongPressDelete={confirmDelete}
                    />
                  )}
                  {i < templates.length - 1 && (
                    <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-3">
            Hold a template to delete it
          </p>
          <div className="h-8 shrink-0" />
        </div>
      </div>
    </div>
  )
}
