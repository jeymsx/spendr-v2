import { useState, useCallback, useRef } from 'react'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { deleteTemplateRemote } from '../lib/sync'
import { IconTemplate, IconTransferUI } from './icons'
import CategoryGlyph from './CategoryGlyph'
import Card from './ui/Card'
import Divider from './ui/Divider'
import EmptyState from './ui/EmptyState'
import Sheet from './ui/Sheet'
import { fmt } from '../lib/money'

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
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tc.bg}`}>
        {/* The glyph, like every other category chip in the app. This row
            printed the raw emoji, so a template on Food showed a burger
            where the transaction list shows a fork and knife. */}
        {tpl.type === 'transfer'
          ? <IconTransferUI size={18} />
          : <CategoryGlyph cat={tpl.category_} size={18} emoji="⚡" />}
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
  const [deleting, setDeleting] = useState(null)

  const rawTemplates = useLiveQuery(() => db.templates.toArray(), [], [])
  const categories   = useLiveQuery(() => db.categories.toArray(), [], [])

  const templates = (rawTemplates ?? [])
    .filter(t => !type || t.type === type)
    .map(t => {
      const cat = (categories ?? []).find(c => c.name === t.category)
      // The whole category, not just its emoji: CategoryGlyph reads the
      // name first and falls back to the emoji, and it needs both.
      return { ...t, category_: cat ?? { name: t.category, icon: '⚡' } }
    })
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))


  async function confirmDelete(tpl) {
    setDeleting(tpl.id)
    await db.templates.delete(tpl.id)
    await deleteTemplateRemote(tpl.id, tpl.name)
    setDeleting(null)
  }

  return (
    /* 80vh, because a template list is long and browsing it is the task. The
       "Close" text button in the old header is gone: the scrim, Escape and
       the handle all close a sheet, and Sheet provides all three. */
    <Sheet
      open={open}
      onClose={onClose}
      z={130}
      maxHeight="80dvh"
      title="Quick Templates"
    >
      <div className="-mx-5">
          {templates.length === 0 ? (
            <EmptyState
              icon={<IconTemplate size={26} />}
              title="No templates yet"
              body="Save a transaction as a template to use it here."
            />
          ) : (
            <Card surface="recessed" clip className="mx-5 mt-4">
              {templates.map((tpl, i) => (
                <div key={tpl.id}>
                  {deleting === tpl.id ? (
                    <div className="flex items-center justify-center px-4 py-3.5">
                      <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    </div>
                  ) : (
                    <TemplateRow
                      tpl={tpl}
                      /* Close, then hand over - the 260ms clears Sheet's
                         240ms exit, so the confirmation does not cross this
                         panel on its way up. */
                      onTap={t => { onClose(); setTimeout(() => onSelect(t), 260) }}
                      onLongPressDelete={confirmDelete}
                    />
                  )}
                  {i < templates.length - 1 && <Divider inset="row" />}
                </div>
              ))}
            </Card>
          )}
        <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-3">
          Hold a template to delete it
        </p>
      </div>
    </Sheet>
  )
}
