import { useState, useMemo, useEffect, useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import SubPage from '../../components/SubPage'
import SegTabs from '../../components/SegTabs'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import Divider from '../../components/ui/Divider'
import IconButton from '../../components/ui/IconButton'
import { IconPlus } from '../../components/icons'
import { CategoryRow, CategoryPresetsSheet } from './Categories'
import { CategoryFormSheet } from './CategoryForm'

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
