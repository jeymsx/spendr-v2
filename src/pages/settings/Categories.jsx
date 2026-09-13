/**
 * Categories: the row, the presets, the editor, the manager, and its page.
 *
 * Lifted out of Settings.jsx unchanged - the largest of the six features that
 * were sharing that file, at nearly 900 lines on its own.
 */
import { useState, useRef, useCallback } from 'react'
import db from '../../db/db'
import { useToast } from '../../context/ToastContext'
import { EXPENSE_PRESETS, INFLOW_PRESETS } from '../../lib/phCategories'
import CategoryGlyph from '../../components/CategoryGlyph'
import {
  IconChevronRight,
  IconTick,
} from '../../components/icons'
import Sheet from '../../components/ui/Sheet'
import { fmt } from '../../lib/money'
export {
  SortableCategoryRow, CategoryManager, CategoryManagerSheet, CategoriesPage,
} from './CategoryManager'
export { CategoryFormSheet } from './CategoryForm'

// ── Category row ───────────────────────────────────────────────────────────────

export function CategoryRow({ cat, onTap, onLongPressDelete }) {
  const timerRef     = useRef(null)
  const longFiredRef = useRef(false)
  const [pressed, setPressed] = useState(false)

  const startPress = useCallback(() => {
    longFiredRef.current = false
    setPressed(true)
    timerRef.current = setTimeout(() => {
      longFiredRef.current = true
      setPressed(false)
      onLongPressDelete(cat)
    }, 550)
  }, [cat, onLongPressDelete])

  const endPress = useCallback(() => {
    clearTimeout(timerRef.current)
    setPressed(false)
    if (!longFiredRef.current) onTap(cat)
    longFiredRef.current = false
  }, [cat, onTap])

  const cancelPress = useCallback(() => {
    clearTimeout(timerRef.current)
    setPressed(false)
    longFiredRef.current = false
  }, [])

  return (
    <div
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      className={[
        'flex items-center gap-3 px-4 py-3.5 select-none cursor-pointer transition-colors duration-75',
        pressed ? 'bg-slate-50 dark:bg-white/[0.06]' : 'active:bg-slate-50 dark:active:bg-white/[0.04]',
      ].join(' ')}
    >
      <div
        /* The mapped icon, not the stored emoji. This list is for scanning,
           and every other list in the app shows the icon; the emoji is still
           what you EDIT, in the form sheet, which is where it belongs. */
        className="cat-tile w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{ '--cat-color': cat.color ?? '#64748b' }}
      >
        <CategoryGlyph cat={cat} size={20} emoji="🏷️" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{cat.name}</p>
        {(cat.budget ?? 0) > 0 && (
          <p className="text-11 text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
            {fmt(cat.budget)} / mo
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color ?? '#2D9DFF' }} />
        <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
      </div>
    </div>
  )
}

// ── Category presets sheet ─────────────────────────────────────────────────────

export function CategoryPresetsSheet({ open, onClose, activeTab, existingCategories }) {
  const { showToast } = useToast()
  /* No `closing` flag, no scroll lock and no local close(): Sheet owns the
     overlay, the panel, the grab handle, the scroll lock, Escape, the focus
     trap and the exit animation, and `open` is the only thing that decides
     any of it. */
  const [adding,  setAdding]  = useState(null)

  const presets      = activeTab === 'expense' ? EXPENSE_PRESETS : INFLOW_PRESETS
  const existingNames = new Set(
    (existingCategories ?? []).filter(c => c.type === activeTab).map(c => c.name)
  )

  async function addPreset(preset) {
    if (existingNames.has(preset.name)) return
    setAdding(preset.name)
    try {
      await db.categories.add({ ...preset, budget: 0 })
    } catch (e) {
      console.error('[CategoryPresets] add failed:', e)
      showToast('Failed to add categories', 'error')
    } finally {
      setAdding(null)
    }
  }

  return (
    /* z 120, because this opens from the category manager at 100 and has to
       sit above it, and the same 45% scrim it drew by hand. Sheet's default
       `bg-panel` surface is exactly the one it already had, so no
       `surface` here.

       75vh through `maxHeight` rather than a max-h utility or a style
       object: that prop is what sets --sheet-max, and it docks the panel the
       way this one was docked. The subtitle moves into the body, since
       Sheet's title slot holds text only. */
    <Sheet
      open={open}
      onClose={onClose}
      z={120}
      scrim={45}
      maxHeight="75vh"
      title="Add from Presets"
      titleAction={(
        <button onClick={onClose} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
          Done
        </button>
      )}
    >
      <div className="pt-0.5">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {activeTab === 'expense' ? 'Expense' : 'Inflow'} suggestions — tap to add
        </p>

        <div className="flex flex-wrap gap-2 pt-4">
          {presets.map(preset => {
            const exists    = existingNames.has(preset.name)
            const isAdding  = adding === preset.name
            return (
              <button
                key={preset.name}
                onClick={() => !exists && !isAdding && addPreset(preset)}
                disabled={exists || !!adding}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium',
                  'transition-all duration-100',
                  exists
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 cursor-default'
                    : 'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 active:scale-95',
                ].join(' ')}
              >
                <span>{preset.icon}</span>
                {preset.name}
                {exists && <span className="ml-0.5"><IconTick size={11} /></span>}
                {isAdding && (
                  <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin ml-0.5" />
                )}
              </button>
            )
          })}
        </div>
        <div className="h-8" />
      </div>
    </Sheet>
  )
}

