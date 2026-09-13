/**
 * Drag accounts into the order they appear in.
 *
 * Lifted out of Accounts.jsx unchanged.
 */
import { useState, useMemo, useEffect, useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import db from '../../db/db'
import { useCreditAvailMap } from '../../hooks/useCreditAvailMap'
import { AccountChip as AccountCardFace } from '../../components/AccountPickerSheet'
import { TYPE_LABEL } from '../../lib/accountMeta'
import { fmt } from '../../lib/money'
import Sheet from '../../components/ui/Sheet'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'

// ── Account Sort Sheet ─────────────────────────────────────────────────────────

/**
 * A row in the sort sheet, which is a row in the account picker with a drag
 * handle where the picker's tick would be.
 *
 * It was a 12px colour dot inside a tinted square - the same "24px colour
 * swatch" the forms carried until AccountSelectRow replaced it with the card
 * itself. So the list you reorder looked nothing like the list the ordering
 * is FOR, and a card you recognise by its colour was reduced, on the one
 * screen about arranging them, to a dot.
 */
export function SortableAccountItem({ acct, childCount, creditAvailMap }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: acct.id })
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
      <button
        {...attributes}
        {...listeners}
        className="pl-3 pr-1 py-4 text-slate-300 dark:text-slate-600 touch-none shrink-0 cursor-grab active:cursor-grabbing"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
        </svg>
      </button>
      <div className="flex-1 flex items-center gap-3 pl-1 pr-4 py-3 min-w-0">
        <AccountCardFace acct={acct} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{acct.name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
            {TYPE_LABEL[acct.type] ?? acct.type}
            {childCount > 0 && ` · ${childCount} sub-account${childCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
            {acct.type === 'credit'
              ? fmt(creditAvailMap?.[acct.name] ?? 0)
              : fmt(acct.balance)}
          </p>
          <p className="text-10 text-slate-400 dark:text-slate-500">
            {acct.type === 'credit' ? 'available' : 'balance'}
          </p>
        </div>
      </div>
    </div>
  )
}

export function AccountSortSheet({ open, onClose, accounts }) {
  const [localList, setLocalList] = useState([])
  /* A credit card's row shows headroom rather than what you owe, the same way
     the picker's does - derived from the ledger, so it comes from the hook
     rather than off the row. */
  const creditAvailMap = useCreditAvailMap(accounts)
  const isDraggingRef = useRef(false)

  const parentNames = useMemo(() =>
    new Set(accounts.filter(a => a.parentName).map(a => a.parentName)),
    [accounts],
  )

  const topLevel = useMemo(() =>
    accounts
      .filter(a => parentNames.has(a.name) || !a.parentName)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [accounts, parentNames],
  )

  const childCountMap = useMemo(() => {
    const map = {}
    accounts.filter(a => a.parentName).forEach(a => {
      map[a.parentName] = (map[a.parentName] ?? 0) + 1
    })
    return map
  }, [accounts])

  useEffect(() => {
    if (open && !isDraggingRef.current) setLocalList(topLevel)
  }, [open, topLevel])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  function handleDragStart() {
    isDraggingRef.current = true
  }

  async function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) { isDraggingRef.current = false; return }
    const oldIdx = localList.findIndex(a => a.id === active.id)
    const newIdx = localList.findIndex(a => a.id === over.id)
    if (oldIdx === -1 || newIdx === -1) { isDraggingRef.current = false; return }
    const reordered = arrayMove(localList, oldIdx, newIdx)
    setLocalList(reordered)
    const now = new Date().toISOString()
    await Promise.all(reordered.map((acct, i) =>
      db.accounts.update(acct.id, { sort_order: i, updatedAt: now })
    ))
    isDraggingRef.current = false
  }

  /* The panel-level touch-action this used to set is gone with the hand-rolled
     chrome, and dnd-kit does not miss it: the grab handle carries `touch-none`
     itself, which is what makes the drag work on a phone. */
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Sort Accounts"
      maxHeight="80dvh"
    >
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Drag to reorder — affects picker order
      </p>

      <div className="pt-4">
        {/* Recessed, not raised: this group sits inside a sheet, which is
            already a raised surface. */}
        <Card surface="recessed" clip>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={localList.map(a => a.id)} strategy={verticalListSortingStrategy}>
              {localList.map((acct, i) => (
                <div key={acct.id}>
                  <SortableAccountItem
                    acct={acct}
                    childCount={childCountMap[acct.name] ?? 0}
                    creditAvailMap={creditAvailMap}
                  />
                  {i < localList.length - 1 && (
                    <Divider inset="glyph" />
                  )}
                </div>
              ))}
            </SortableContext>
          </DndContext>
        </Card>
      </div>
    </Sheet>
  )
}
