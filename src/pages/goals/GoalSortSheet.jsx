import { useState, useEffect, useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import db from '../../db/db'
import { reRank } from '../../lib/goals'
import { useToast } from '../../context/ToastContext'
import Sheet from '../../components/ui/Sheet'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import { GoalRing, IconGrip } from './shared'
import { fmtCompact } from '../../lib/money'

/**
 * Drag the goals into the order they are funded in.
 *
 * ── Why the drag moved off the page ──
 *
 * The order is not decoration: it IS the waterfall. The goal at the top fills
 * from a shared balance first and the rest take what is left, so dragging
 * genuinely changes the numbers - which is why the drag used to live on the
 * list itself, right next to the figures it moves.
 *
 * That argument was for a LIST. The page is a grid of rings now, and a grid
 * cannot carry the same gesture honestly: a grip small enough not to spoil a
 * 116px tile is smaller than a thumb, dragging the tile itself fights the
 * page's own scroll on the one axis a grid needs both of, and a two-
 * dimensional drop target has to answer "before or after?" from a position
 * that means neither.
 *
 * So reordering is a sheet, which is what the accounts page settled on for
 * the same reason. The list inside is one row per goal, in order, numbered -
 * and it is a better answer than the grid was anyway, because the ranking is
 * the entire subject of the screen instead of an implication of the layout.
 */

function SortableGoalRow({ goal, rank }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: goal.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'flex items-center',
        isDragging
          ? 'relative z-10 rounded-2xl bg-lifted shadow-2xl ring-1 ring-primary/30 opacity-95 scale-[1.02]'
          : '',
      ].join(' ')}
    >
      <button
        {...attributes}
        {...listeners}
        className="pl-3 pr-1 py-4 text-slate-300 dark:text-slate-600 touch-none shrink-0
          cursor-grab active:cursor-grabbing"
        tabIndex={-1}
        aria-label={`Drag to reorder ${goal.name}`}
      >
        <IconGrip />
      </button>

      <div className="flex-1 flex items-center gap-3 pl-1 pr-4 py-2.5 min-w-0">
        {/* The rank, spelled out. In a list the position is the rank, but
            this list is the one place the number is the point - and it is
            what the goal is called in the sentence "BPI is claimed by goals
            1 and 2". */}
        <span className="w-5 shrink-0 text-13 font-bold tabular-nums text-slate-300 dark:text-slate-600">
          {rank}
        </span>

        {/* Small, but the same ring the grid draws - so the list you reorder
            looks like the list the ordering is for. */}
        <GoalRing pct={goal.pct} complete={goal.complete} size={34} stroke={3}>
          <span className="text-13 leading-none" aria-hidden="true">{goal.icon ?? '🎯'}</span>
        </GoalRing>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
            {goal.name}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate tabular-nums">
            {fmtCompact(goal.saved)} of {fmtCompact(goal.target)}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function GoalSortSheet({ open, goals, onClose }) {
  const { showToast } = useToast()
  const [localList, setLocalList] = useState([])
  /* Without this, the live query that fires as the reorder is written re-runs
     the effect below and resets the list mid-gesture - the row snaps back
     under your finger and then jumps forward again. */
  const isDraggingRef = useRef(false)

  useEffect(() => {
    if (open && !isDraggingRef.current) setLocalList(goals)
  }, [open, goals])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  async function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) { isDraggingRef.current = false; return }
    const oldIdx = localList.findIndex(g => g.id === active.id)
    const newIdx = localList.findIndex(g => g.id === over.id)
    if (oldIdx === -1 || newIdx === -1) { isDraggingRef.current = false; return }

    const moved = arrayMove(localList, oldIdx, newIdx)
    setLocalList(moved)
    try {
      const now = new Date().toISOString()
      // reRank returns only the goals whose rank actually changed, so a drag
      // near the bottom writes two rows rather than the whole table.
      const changes = reRank(moved.map(g => g.id), moved)
      await Promise.all(changes.map(c =>
        db.goals.update(c.id, { priority: c.priority, updatedAt: now, synced: 0 })))
    } catch (e) {
      console.error('[Goals] reorder failed:', e)
      showToast('Could not save the new order', 'error')
      setLocalList(goals)
    } finally {
      isDraggingRef.current = false
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Funding order" maxHeight="80dvh">
      <p className="text-xs text-slate-400 dark:text-slate-500">
        The top goal fills first. The rest take what is left.
      </p>

      <div className="pt-4">
        {/* Recessed, not raised: this group sits inside a sheet, which is
            already a raised surface. */}
        <Card surface="recessed" clip>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => { isDraggingRef.current = true }}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={localList.map(g => g.id)} strategy={verticalListSortingStrategy}>
              {localList.map((goal, i) => (
                <div key={goal.id}>
                  <SortableGoalRow goal={goal} rank={i + 1} />
                  {i < localList.length - 1 && <Divider inset="glyph" />}
                </div>
              ))}
            </SortableContext>
          </DndContext>
        </Card>
      </div>
    </Sheet>
  )
}
