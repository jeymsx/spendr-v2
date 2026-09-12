/**
 * Categories: the row, the presets, the editor, the manager, and its page.
 *
 * Lifted out of Settings.jsx unchanged - the largest of the six features that
 * were sharing that file, at nearly 900 lines on its own.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useNavigate } from 'react-router-dom'
import db, { UNSYNCED } from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../../utils/moneyInput'
import { EXPENSE_PRESETS, INFLOW_PRESETS } from '../../lib/phCategories'
import { deleteCategoryRemote } from '../../lib/sync'
import SubPage from '../../components/SubPage'
import SegTabs from '../../components/SegTabs'
import CategoryGlyph, { presetCategoryIcon as CATEGORY_ICON_BY_NAME } from '../../components/CategoryGlyph'
import {
  IconCheck, IconChevronRight, IconPlus, IconTick, IconWarning,
} from '../../components/icons'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import Divider from '../../components/ui/Divider'
import SectionLabel from '../../components/ui/SectionLabel'
import SwatchRail from '../../components/ui/SwatchRail'
import IconButton from '../../components/ui/IconButton'
import Field from '../../components/ui/Field'
import { CAT_COLORS, DEFAULT_CAT_NAMES, EMOJI_OPTIONS } from './shared'
import { fmt } from '../../lib/money'

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
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
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

// ── Sortable category row (for drag-to-reorder) ────────────────────────────────

export function SortableCategoryRow({ cat, onTap, onLongPressDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center',
        isDragging ? 'relative z-10 rounded-2xl bg-lifted shadow-2xl ring-1 ring-primary/30 opacity-95 scale-[1.02]' : '',
      ].join(' ')}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="pl-3 pr-0 py-4 text-slate-300 dark:text-slate-600 touch-none shrink-0 cursor-grab active:cursor-grabbing"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
        </svg>
      </button>
      {/* Row content fills remaining space */}
      <div className="flex-1 min-w-0">
        <CategoryRow cat={cat} onTap={onTap} onLongPressDelete={onLongPressDelete} />
      </div>
    </div>
  )
}

// ── Category manager sheet ─────────────────────────────────────────────────────

/**
 * Category management: one implementation, two presentations.
 *
 * `variant="page"` is the mobile route at /settings/categories, with the
 * app's standard sub-page header. `variant="sheet"` is the modal the DESKTOP
 * settings uses - src/web/pages/WebSettings.jsx imports CategoryManagerSheet
 * and presents it over a two-pane layout, where a route would be wrong.
 *
 * A variant rather than two components, because what matters here is the
 * drag-to-reorder state and the local ordering held per tab while a drag is in
 * flight - duplicating that to get two shells would duplicate the only part
 * with any behaviour in it.
 *
 * The form and the presets browser stay SHEETS in both. On the page that is
 * the point: editing is the only thing that should interrupt you, so a sheet
 * over a page rather than a sheet over a sheet.
 */
export function CategoryManager({ open, onClose, variant = 'sheet' }) {
  const asPage = variant === 'page'
  /* No `closing` flag and no scroll lock: the sheet variant is a <Sheet>,
     which owns the overlay, the panel, the grab handle, the scroll lock,
     Escape, the focus trap and the 240ms exit. The page never locked scroll
     anyway. */
  const [activeTab,      setActiveTab]      = useState('expense')
  const [formOpen,       setFormOpen]       = useState(false)
  const [editingCat,     setEditingCat]     = useState(null)
  const [formStartDelete, setFormStartDelete] = useState(false)
  const [browseOpen,     setBrowseOpen]     = useState(false)
  const isDraggingRef = useRef(false)
  // Local ordered list used during and after drag (separate per tab)
  const [localExpense,   setLocalExpense]   = useState([])
  const [localInflow,    setLocalInflow]    = useState([])

  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  /* No transactions query any more. This screen read EVERY transaction in the
     database - a live query that re-ran on each new expense - to draw the
     budget bar that used to sit at the top. The bar has gone to the pages
     that own it, and the read went with it. */

  const expenseCats = useMemo(() =>
    (categories ?? []).filter(c => c.type === 'expense')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories])
  const inflowCats = useMemo(() =>
    (categories ?? []).filter(c => c.type === 'inflow')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories])

  // Sync local lists from DB only when not dragging
  useEffect(() => { if (!isDraggingRef.current) setLocalExpense(expenseCats) }, [expenseCats])
  useEffect(() => { if (!isDraggingRef.current) setLocalInflow(inflowCats)   }, [inflowCats])

  const visibleCats    = activeTab === 'expense' ? localExpense   : localInflow
  const setVisibleCats = activeTab === 'expense' ? setLocalExpense : setLocalInflow

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  function handleDragStart() {
    isDraggingRef.current = true
  }

  async function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) {
      isDraggingRef.current = false
      return
    }
    const oldIdx = visibleCats.findIndex(c => c.id === active.id)
    const newIdx = visibleCats.findIndex(c => c.id === over.id)
    if (oldIdx === -1 || newIdx === -1) { isDraggingRef.current = false; return }
    const reordered = arrayMove(visibleCats, oldIdx, newIdx)
    setVisibleCats(reordered)
    const now = new Date().toISOString()
    await Promise.all(reordered.map((cat, i) =>
      db.categories.update(cat.id, { sort_order: i, updatedAt: now })
    ))
    isDraggingRef.current = false
  }

  /* No local close() any more. It existed to run the exit animation before
     telling the parent; the Done button and the scrim both call `onClose`
     directly now, and Sheet plays the exit off `open`. */

  function openAdd() { setEditingCat(null); setFormStartDelete(false); setTimeout(() => setFormOpen(true), 0) }
  function openEdit(cat) { setEditingCat(cat); setFormStartDelete(false); setTimeout(() => setFormOpen(true), 0) }
  function openDelete(cat) { setEditingCat(cat); setFormStartDelete(true); setTimeout(() => setFormOpen(true), 0) }


  /* Only the page may bail out on !open. The sheet has to keep rendering
     while it slides away, and Sheet stops itself once the exit is over -
     returning null here would unmount it mid-slide. */
  if (asPage && !open) return null

  /* The tab switcher and the list are shared; only the shell differs. The
     page lets the document scroll, the sheet scrolls inside its panel. */
  /* The app's segmented control, not a pair of filled pills.
 
     It was two buttons with the active one solid bg-primary, plus arrow
     glyphs - which is a third segmented-control idiom in one app, after the
     trackless pill on Insights/Bills/Debts and the slate trough this replaced
     elsewhere. Same control everywhere now.
 
     The counts move into SegTabs' own count slot, and the arrows go: "Expense"
     and "Inflow" already say which direction the money moves. */
  const tabBar = (
    <SegTabs
      tabs={[
        { value: 'expense', label: 'Expense', count: expenseCats.length },
        { value: 'inflow',  label: 'Inflow',  count: inflowCats.length  },
      ]}
      value={activeTab}
      onChange={setActiveTab}
    />
  )

  const listBody = (
    <>
              {/* No budget summary here. This screen is for naming, ordering
                  and colouring categories; the month's budget total belongs
                  to the Budget page and to Monthly budgets, which both show
                  it already. Three copies of one figure is two too many. */}

              <div className="mx-5 rounded-2xl overflow-hidden
                bg-white border border-slate-100
                dark:bg-white/[0.04] dark:border-white/[0.07]
                shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none mb-3">
                {visibleCats.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm text-slate-400 dark:text-slate-500">No {activeTab} categories</p>
                    <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Tap "Add" below to create one</p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={visibleCats.map(c => c.id)} strategy={verticalListSortingStrategy}>
                      {visibleCats.map((cat, i) => (
                        <div key={cat.id}>
                          <SortableCategoryRow
                            cat={cat}
                            onTap={openEdit}
                            onLongPressDelete={openDelete}
                          />
                          {i < visibleCats.length - 1 && <Divider inset="glyph" />}
                        </div>
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </div>

              <div className="px-5 flex flex-col gap-2 pb-6">
                {/* Solid, like the other ten primary buttons in the app.

                    This was a tinted outline - accent text on a 7% accent
                    wash inside an accent border - which existed nowhere else:
                    the count is ten solid to two tinted, and the other tinted
                    one is the template button below, fixed at the same time.
                    It also measured 2.85:1 in light mode, because accent text
                    on a near-white wash is the same problem .accent-ink
                    exists for.

                    "Add category", not "Add expense Category". The tab
                    directly above says Expense or Inflow, and a button that
                    repeats the thing sitting above it is the house style of
                    forms, not of iOS. */}
                <Button block onClick={openAdd}>
                  <IconPlus size={15} strokeWidth="2.5" />
                  Add category
                </Button>
                <button
                  onClick={() => setBrowseOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold
                    text-slate-500 dark:text-slate-400
                    bg-slate-100 dark:bg-white/[0.05]
                    border border-slate-200 dark:border-white/[0.07]
                    active:scale-[0.98] transition-transform duration-100"
                >
                  Browse Presets
                </button>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-1">
                  Hold a category to quickly delete it
                </p>
              </div>
    </>
  )

  const nestedSheets = (
    <>
        <CategoryFormSheet
          open={formOpen}
          onClose={() => setFormOpen(false)}
          category={editingCat}
          defaultType={activeTab}
          allCategories={categories ?? []}
          startAtDelete={formStartDelete}
          zIndex={110}
        />
        <CategoryPresetsSheet
          open={browseOpen}
          onClose={() => setBrowseOpen(false)}
          activeTab={activeTab}
          existingCategories={categories ?? []}
        />
    </>
  )

  if (asPage) {
    return (
      <>
        <SubPage
          title="Categories"
          action={(
            <IconButton label="New category" variant="primary" onClick={openAdd}>
              <IconPlus />
            </IconButton>
          )}
        >
          <div className="px-5 pb-1">{tabBar}</div>
          <div className="pt-4">{listBody}</div>
        </SubPage>
        {nestedSheets}
      </>
    )
  }

  return (
    <>
      {/* The same z and the same 45% scrim the hand-rolled overlay drew, and
          the recessed slate surface it had: the list is a white card, and on
          Sheet's default white panel it would be white on white.

          92vh through `maxHeight` rather than the old max-h utility - that
          prop is what sets --sheet-max, and an inline height would outrank
          `html.web .sheet-panel` and strand the desktop modal at the bottom
          of the window. It also docks the panel, which is where this one
          already sat. */}
      <Sheet
        open={open}
        onClose={onClose}
        z={100}
        scrim={45}
        maxHeight="92vh"
        surface="bg-page"
        title="Manage Categories"
        titleAction={(
          <button onClick={onClose} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
            Done
          </button>
        )}
      >
        {/* -mx-5 cancels Sheet's gutter, and has to: `listBody` is the page's
            body as well, SubPage draws no gutter of its own, and every block
            inside carries its own mx-5 or px-5. The tabs come with it and
            get the gutter back, since they sat at the panel's edges too.

            They scroll with the list now rather than sitting in a sticky
            header: the header belongs to Sheet, and the body is a
            FadeScroller whose mask would fade a sticky child as you scrolled
            past it. */}
        <div className="-mx-5">
          <div className="px-5 pb-7">{tabBar}</div>
          {listBody}
        </div>
      </Sheet>
      {nestedSheets}
    </>
  )
}

/** The desktop modal. Imported by src/web/pages/WebSettings.jsx. */
export function CategoryManagerSheet(props) {
  return <CategoryManager {...props} variant="sheet" />
}

/** The mobile route at /settings/categories. */
export function CategoriesPage() {
  const navigate = useNavigate()
  return <CategoryManager open onClose={() => navigate(-1)} variant="page" />
}

// ── Category form sheet ────────────────────────────────────────────────────────

export function CategoryFormSheet({ open, onClose, category, defaultType, allCategories, startAtDelete, zIndex = 100 }) {
  const { showToast } = useToast()
  const [saving,         setSaving]         = useState(false)
  const [mode,           setMode]           = useState('form')
  const [txCount,        setTxCount]        = useState(0)
  const [reassignTarget, setReassignTarget] = useState(null)

  const [name,      setName]      = useState('')
  const [type,      setType]      = useState('expense')
  const [icon,      setIcon]      = useState('📦')
  const [color,     setColor]     = useState(CAT_COLORS[0])
  const [budget,    setBudget]    = useState('0')
  const [nameError, setNameError] = useState(false)

  const isEdit    = !!category?.id
  const isDefault = isEdit && DEFAULT_CAT_NAMES.has(category?.name)

  const reassignOptions = useMemo(() =>
    allCategories.filter(c => c.type === (category?.type ?? type) && c.id !== category?.id),
    [allCategories, category, type])

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(false)
    setNameError(false)
    setReassignTarget(null)

    if (category?.id) {
      setName(category.name)
      setType(category.type ?? 'expense')
      setIcon(category.icon ?? '📦')
      setColor(category.color ?? CAT_COLORS[0])
      setBudget(numToMoneyStr(category.budget ?? 0))
      if (startAtDelete) runDeleteCheck()
      else setMode('form')
    } else {
      setName('')
      setType(defaultType ?? 'expense')
      setIcon('📦')
      setColor(CAT_COLORS[Math.floor(Math.random() * CAT_COLORS.length)])
      setBudget('0')
      setMode('form')
    }
    // Hydrates the form when the sheet opens. Listing every field would
    // re-run the effect that SETS them and clobber edits in progress;
    // `open` plus the record id is what actually means "something else is
    // being edited now".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id, startAtDelete])

  async function runDeleteCheck() {
    const count = await db.transactions.where('category').equals(category.name).count()
    setTxCount(count)
    setMode(count > 0 ? 'reassign' : 'confirm-delete')
  }

  async function handleSave() {
    if (!name.trim()) { setNameError(true); return }
    setSaving(true)
    try {
      const data = { name: name.trim(), type, icon, color, budget: parseMoney(budget) || 0 }
      if (isEdit) {
        const oldName = category.name
        const newName = data.name
        const renamedAt = new Date().toISOString()
        await db.transaction('rw', [db.categories, db.transactions], async () => {
          await db.categories.update(category.id, data)
          if (oldName !== newName) {
            await db.transactions.where('category').equals(oldName).modify({ category: newName, synced: UNSYNCED, updatedAt: renamedAt })
          }
        })
      } else {
        await db.categories.add(data)
      }
      close()
    } catch (e) {
      console.error('[CategoryForm] save failed:', e)
      showToast('Failed to save category', 'error')
      setSaving(false)
    }
  }

  async function handleDeleteDirect() {
    setSaving(true)
    try {
      await db.categories.delete(category.id)
      // Without this the next pull re-adds the category from Supabase.
      await deleteCategoryRemote(category.name, category.type)
      close()
    } catch (e) {
      console.error('[CategoryForm] delete failed:', e)
      showToast('Failed to delete category', 'error')
      setSaving(false)
    }
  }

  async function handleReassignAndDelete() {
    if (!reassignTarget) return
    setSaving(true)
    try {
      await db.transaction('rw', [db.categories, db.transactions], async () => {
        await db.transactions.where('category').equals(category.name).modify({ category: reassignTarget.name })
        await db.categories.delete(category.id)
      })
      await deleteCategoryRemote(category.name, category.type)
      close()
    } catch (e) {
      console.error('[CategoryForm] reassign+delete failed:', e)
      showToast('Failed to delete category', 'error')
      setSaving(false)
    }
  }

  const sheetTitle = {
    form:             isEdit ? 'Edit Category' : 'New Category',
    'confirm-delete': 'Delete Category',
    reassign:         'Reassign Transactions',
  }[mode]

  /* One action row per mode, pinned by Sheet under the scrolling body.

     They used to be the last thing inside each mode's block, so on a short
     screen you scrolled past the icon grid to reach Save. And the header was
     a sticky opaque bar with a border under it, which clipped the rows
     passing beneath it on a hard straight line - the thing FadeScroller
     exists to avoid, and which every sheet on the primitive now gets. */
  const footer = {
    form: (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button className="flex-[2]" onClick={handleSave} loading={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add category'}
        </Button>
      </div>
    ),
    'confirm-delete': (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => setMode('form')} disabled={saving}>
          Keep it
        </Button>
        <Button variant="danger" className="flex-[2]" onClick={handleDeleteDirect} loading={saving}>
          {saving ? 'Deleting…' : 'Delete category'}
        </Button>
      </div>
    ),
    reassign: (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => setMode('form')} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="danger"
          className="flex-[2]"
          onClick={handleReassignAndDelete}
          loading={saving}
          disabled={!reassignTarget || reassignOptions.length === 0}
        >
          {saving ? 'Moving…' : 'Reassign & delete'}
        </Button>
      </div>
    ),
  }[mode]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={zIndex}
      dismissible={!saving}
      title={sheetTitle}
      titleAction={mode === 'form' && isEdit ? (
        <Button variant="dangerTint" size="sm" className="px-4" onClick={runDeleteCheck}>
          Delete
        </Button>
      ) : null}
      footer={footer}
    >
      <div>

        {/* Form mode */}
        {mode === 'form' && (
          <div className="pt-5 pb-2 flex flex-col gap-5">
            <Field
              label="Category name"
              value={name}
              onChange={e => { setName(e.target.value); setNameError(false) }}
              placeholder="e.g. Groceries"
              maxLength={30}
              error={nameError ? 'Name is required' : null}
            />

            <div>
              <SectionLabel>Type</SectionLabel>
              {isEdit ? (
                <p className="h-[48px] flex items-center px-4 rounded-2xl text-sm font-medium text-slate-700 dark:text-slate-300
                  bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.09]">
                  {type === 'expense' ? '↑ Expense' : '↓ Inflow'}
                  <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 font-normal">(cannot change)</span>
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[{ value: 'expense', label: '↑ Expense' }, { value: 'inflow', label: '↓ Inflow' }].map(o => (
                    <button key={o.value} onClick={() => setType(o.value)}
                      className={[
                        'py-3 rounded-full text-sm font-semibold transition-all duration-75 active:scale-[0.97]',
                        type === o.value
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400',
                      ].join(' ')}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <SectionLabel>Icon</SectionLabel>
              {/* Worth saying out loud, because the preview below now shows
                  the real thing and the two will disagree: a preset name has
                  a drawn icon, and the emoji is what a custom name gets. */}
              {CATEGORY_ICON_BY_NAME({ name: name.trim() }) && (
                <p className="-mt-1 mb-2 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                  “{name.trim()}” has its own icon, so it keeps that whichever
                  you pick here.
                </p>
              )}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
                <div className="grid grid-cols-8 gap-1.5">
                  {EMOJI_OPTIONS.map(e => (
                    <button key={e} onClick={() => setIcon(e)}
                      className={[
                        'h-10 rounded-xl flex items-center justify-center text-[20px]',
                        'active:scale-90 transition-all duration-75',
                        icon === e
                          ? 'bg-primary/[0.12] ring-2 ring-primary/40'
                          : 'hover:bg-white dark:hover:bg-white/[0.06]',
                      ].join(' ')}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              {/* The same rail the card designer uses. This was eight rounded
                  rectangles stretched to fill the row and ticked with a white
                  check - the same job as the card's colour row, drawn as a
                  different object two screens away. */}
              <SectionLabel>Color</SectionLabel>
              <SwatchRail
                colors={CAT_COLORS}
                value={color}
                onChange={setColor}
                ariaLabel="Category colour"
              />
            </div>

            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl
              bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
              {/* The glyph this category will really have.

                  CategoryGlyph reads the NAME: a preset name resolves to an
                  SVG and anything else keeps the emoji. Printing the emoji
                  here made the preview disagree with every other screen -
                  type "Food" and the preview showed a box while the
                  transaction list showed a fork and knife. Passing the draft
                  as a category gets both cases right, including the one where
                  the emoji is the answer. */}
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: color + '22' }}>
                <CategoryGlyph cat={{ name: name.trim(), color, icon }} size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{name || 'Category Name'}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {type === 'expense' ? 'Expense' : 'Inflow'}
                  {parseMoney(budget) > 0 && ` · ${fmt(parseMoney(budget))} / mo`}
                </p>
              </div>
            </div>

            <Field
              label="Monthly budget"
              type="text"
              inputMode="decimal"
              value={budget === '0' ? '' : budget}
              onChange={moneyChangeHandler(setBudget)}
              left="₱"
              placeholder="0.00"
              /* "Optional — 0 means no budget" was the placeholder, which is
                 three jobs for one line: what goes in the box, that the box is
                 optional, and what zero does. A placeholder can only do the
                 first, and it vanishes the moment you type - which is when the
                 other two still matter. They are the hint now. */
              hint={parseMoney(budget) > 0
                ? `Spending alerts when you approach ${fmt(parseMoney(budget))} this month`
                : 'Optional. Leave empty for no budget.'}
            />

          </div>
        )}

        {/* Confirm delete */}
        {mode === 'confirm-delete' && (
          <div className="pt-6 pb-2">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: (category?.color ?? '#2D9DFF') + '22' }}>
                <CategoryGlyph cat={category} size={24} />
              </div>
              <p className="text-base font-semibold text-slate-800 dark:text-white">{category?.name}</p>
            </div>
            {isDefault && (
              <div className="mb-5 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Default category</p>
                <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
                  This is a built-in Spendr category. Deleting it is permanent.
                </p>
              </div>
            )}
            <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-1">Permanently delete this category?</p>
            <p className="text-xs text-center text-slate-400 dark:text-slate-500 mb-7">No transactions are using it. This cannot be undone.</p>
          </div>
        )}

        {/* Reassign mode */}
        {mode === 'reassign' && (
          <div className="pt-5 pb-2">
            <div className="flex items-start gap-3 px-4 py-3.5 mb-5 rounded-2xl
              bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
              <span className="shrink-0 mt-0.5 text-amber-500 dark:text-amber-400"><IconWarning size={20} /></span>
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {txCount} {txCount === 1 ? 'transaction uses' : 'transactions use'} this category
                </p>
                <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
                  Choose a replacement before deleting.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-5 px-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 flex-1 min-w-0">
                <span className="shrink-0"><CategoryGlyph cat={category} size={16} /></span>
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 truncate">{category?.name}</p>
              </div>
              <span className="text-slate-400 dark:text-slate-500 shrink-0 text-sm">→</span>
              <div className={[
                'flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 min-w-0',
                reassignTarget
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20'
                  : 'bg-slate-50 dark:bg-white/[0.04] border-slate-100 dark:border-white/[0.07]',
              ].join(' ')}>
                {reassignTarget ? (
                  <>
                    <span className="text-base shrink-0">{reassignTarget.icon}</span>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 truncate">{reassignTarget.name}</p>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Pick below</p>
                )}
              </div>
            </div>

            <SectionLabel>Reassign to</SectionLabel>
            {reassignOptions.length === 0 ? (
              <div className="py-6 text-center rounded-2xl bg-slate-50 dark:bg-white/[0.04] mb-5">
                <p className="text-sm text-slate-400 dark:text-slate-500">No other categories available</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-5">
                {reassignOptions.map(cat => (
                  <button key={cat.id} onClick={() => setReassignTarget(cat)}
                    className={[
                      'flex items-center gap-3 px-4 py-3 rounded-2xl text-left',
                      'active:scale-[0.98] transition-all duration-75',
                      reassignTarget?.id === cat.id
                        ? 'ring-2 ring-primary/40 bg-primary/[0.06] dark:bg-primary/[0.12]'
                        : 'bg-slate-50 dark:bg-white/[0.04] active:bg-slate-100 dark:active:bg-white/[0.08]',
                    ].join(' ')}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: (cat.color ?? '#2D9DFF') + '22' }}>
                      <CategoryGlyph cat={cat} size={18} />
                    </div>
                    <p className="flex-1 text-sm font-semibold text-slate-800 dark:text-white truncate">{cat.name}</p>
                    {reassignTarget?.id === cat.id && (
                      <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <IconCheck size={13} strokeWidth="3" stroke="white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

          </div>
        )}
      </div>
    </Sheet>
  )
}
