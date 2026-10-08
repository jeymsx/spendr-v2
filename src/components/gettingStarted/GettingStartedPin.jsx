import { useState } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import { GoalRing } from '../../pages/goals/shared'
import { GlyphTile } from '../help/HelpGlyph'
import { IconChevronRight } from '../icons'
import GettingStartedSheet from './GettingStartedSheet'

/**
 * The Getting started list (lib/gettingStarted.js), pinned at the top of the
 * notifications - the one place it lives, because the notifications are where
 * someone looks for "what should I do next", and Home is for their money.
 *
 * One row: how far along you are and the next step. Pressing it opens the
 * whole list in a sheet. Done, it says so and waits to be put away, so a list
 * whose last box was ticked does not simply vanish.
 *
 * Not a notification - nothing happened, and it is never "new" - so it does
 * not count towards the bell's dot. Draws nothing when there is no list.
 *
 * @param {{gs: ReturnType<typeof import('../../hooks/useGettingStarted').default>, className?: string}} props
 */
export default function GettingStartedPin({ gs, className = '' }) {
  const [open, setOpen] = useState(false)
  if (!gs.on) return null

  if (gs.complete) {
    return (
      <section className={className} aria-label="Getting started">
        <Card radius="3xl" className="flex items-center gap-3 px-4 py-3.5">
          <GlyphTile name="check" color="#10B981" on />
          <span className="flex-1 min-w-0">
            <span className="block text-15 font-semibold text-slate-900 dark:text-white">You’re all set</span>
            <span className="block text-13 text-slate-500 dark:text-slate-400">Every first step is done.</span>
          </span>
          <Button size="sm" variant="tint" className="px-4" onClick={gs.hide}>Done</Button>
        </Card>
      </section>
    )
  }

  return (
    <section className={className} aria-label="Getting started">
      <Card as="button" type="button" radius="3xl" interactive onClick={() => setOpen(true)} className="flex items-center gap-3 px-4 py-3.5">
        <GoalRing pct={(gs.doneCount / gs.total) * 100} size={40} stroke={4}>
          <span className="text-11 font-bold tabular-nums text-slate-900 dark:text-white">{gs.doneCount}/{gs.total}</span>
        </GoalRing>
        <span className="flex-1 min-w-0">
          <span className="block text-15 font-semibold text-slate-900 dark:text-white">Getting started</span>
          <span className="block text-13 text-slate-500 dark:text-slate-400 truncate">
            {gs.next ? `Next: ${gs.next.title}` : `${gs.doneCount} of ${gs.total} done`}
          </span>
        </span>
        <span className="text-slate-300 dark:text-slate-600 shrink-0"><IconChevronRight size={18} /></span>
      </Card>
      <GettingStartedSheet open={open} onClose={() => setOpen(false)} gs={gs} />
    </section>
  )
}
