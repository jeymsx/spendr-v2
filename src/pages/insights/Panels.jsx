import { useState } from 'react'
import EmptyState from '../../components/ui/EmptyState'
import { fmt } from '../../lib/money'
import { DonutChart } from './Charts'

// ── By Category ────────────────────────────────────────────────────────────────

/* `animKey` is also this component's React key at the call site, so a new
   window remounts it and the selection clears itself. That replaces an effect
   which cleared `selected` a render AFTER the new segments had already been
   handed to the chart - long enough to highlight a slice belonging to a
   window that was no longer on screen. */
export function SpendingByCategory({ segments, total, animKey, rangeLabel }) {
  const [selected, setSelected] = useState(null)

  if (!segments.length) {
    return (
      <EmptyState size="sm" title={`No expenses ${rangeLabel}`} />
    )
  }

  return (
    <div>
      <DonutChart segments={segments} total={total} animKey={animKey} selected={selected} onSelect={setSelected} />
      <div className={`px-5 pt-4 grid gap-x-4 gap-y-3 ${segments.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {segments.map((seg, i) => (
          <button
            key={i}
            onClick={() => setSelected(selected === i ? null : i)}
            className={`flex items-center gap-2 text-left transition-opacity duration-150 min-w-0 ${selected != null && selected !== i ? 'opacity-30' : ''}`}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">{seg.name}</span>
            <span className="text-xs font-semibold text-slate-800 dark:text-white tabular-nums shrink-0 ml-auto">{fmt(seg.value)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
