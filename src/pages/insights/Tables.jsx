import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Card from '../../components/ui/Card'
import ProgressBar from '../../components/ui/ProgressBar'
import { AccountChip } from '../../components/AccountPickerSheet'
import { fmt } from '../../lib/money'

// ── Account Breakdown ──────────────────────────────────────────────────────────

/**
 * Each account's share of the period's spending, as bars - and each a way
 * to its own page, where the balance and the history are.
 *
 * @param {{data: Array<{name: string, value: number, color: string, acct: Record<string, any>|null}>,
 *          total: number, animKey: string}} props
 */
export function AccountBreakdown({ data, total, animKey }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    // A deliberate two-pass paint: the bars mount at zero, then a
    // frame later transition to their real width. Deriving `ready`
    // during render would skip the frame the animation needs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(false)
    let t = 0
    const raf = requestAnimationFrame(() => { t = window.setTimeout(() => setReady(true), 60) })
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [animKey])

  if (!data.length) return null
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div className="mx-5 flex flex-col gap-2">
      {data.map((d, i) => {
        const share = total > 0 ? Math.round((d.value / total) * 100) : 0
        const body = (
          <div className="flex items-center gap-3">
            {/* The account as its card, the way the picker and every
                transaction sheet draw it. */}
            {d.acct
              ? <AccountChip acct={d.acct} size="sm" />
              : (
                /* An account that has since been deleted still has spending
                   against it, and no card to draw. */
                <span
                  className="w-[40px] h-[28px] rounded-[8px] shrink-0 border border-dashed border-slate-300 dark:border-white/20"
                  aria-hidden="true"
                />
              )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-13 font-semibold text-slate-800 dark:text-white truncate">{d.name}</span>
                <span className="text-13 font-semibold text-slate-700 dark:text-slate-200 tabular-nums shrink-0">{fmt(d.value)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <ProgressBar className="flex-1" value={ready ? (d.value / max) * 100 : 0} color={d.color} />
                <span className="w-9 text-right text-11 font-semibold text-slate-500 dark:text-slate-400 tabular-nums shrink-0">{share}%</span>
              </div>
            </div>
          </div>
        )
        return d.acct?.id != null
          ? <Card key={i} as={Link} to={`/accounts/${d.acct.id}`} interactive padding="sm">{body}</Card>
          : <Card key={i} padding="sm">{body}</Card>
      })}
    </div>
  )
}
