import { useState, useEffect } from 'react'
import CategoryGlyph from '../../components/CategoryGlyph'
import Card from '../../components/ui/Card'
import ProgressBar from '../../components/ui/ProgressBar'
import { AccountChip } from '../../components/AccountPickerSheet'
import { fmt } from '../../lib/money'
import { SectionHeading } from './shared'

// ── Top expenses ───────────────────────────────────────────────────────────────

export function TopTransactions({ txs, catMap }) {
  if (!txs.length) return null
  return (
    <div>
      <SectionHeading>Top expenses</SectionHeading>
      <div className="flex flex-col gap-2 mx-5">
        {txs.map((tx, i) => {
          const cat  = catMap[tx.category]
          const date = new Date(tx.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
          return (
            <Card key={tx.id ?? i} padding="sm" className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-2xl flex items-center justify-center text-17 shrink-0"
                style={{ backgroundColor: (cat?.color ?? '#2D9DFF') + '22' }}
              >
                <CategoryGlyph cat={cat} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-13 font-medium text-slate-800 dark:text-white truncate leading-snug">
                  {tx.description || tx.category || '—'}
                </p>
                <p className="text-11 text-slate-400 dark:text-slate-500 mt-0.5">{tx.category} · {date}</p>
              </div>
              <p className="text-13 font-semibold text-red-500 dark:text-red-400 tabular-nums shrink-0">{fmt(tx.amount)}</p>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Account Breakdown ──────────────────────────────────────────────────────────

export function AccountBreakdown({ data, animKey }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    // A deliberate two-pass paint: the bars mount at zero, then a
    // frame later transition to their real width. Deriving `ready`
    // during render would skip the frame the animation needs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(false)
    const raf = requestAnimationFrame(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t) })
    return () => cancelAnimationFrame(raf)
  }, [animKey])

  if (!data.length) return null
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div>
      <SectionHeading>By account</SectionHeading>
      {/* The account as its card, on the left, the way the picker, the sort
          sheet and every transaction sheet draw it. It was an 8px colour
          dot - the account reduced to the one thing about it you never
          learned, on the one screen that compares them. */}
      <div className="mx-5 flex flex-col gap-2">
        {data.map((d, i) => (
          <Card key={i} padding="sm">
            <div className="flex items-center gap-3">
              {d.acct
                ? <AccountChip acct={d.acct} size="sm" />
                : (
                  /* An account that has since been deleted still has spending
                     against it, and no card to draw. */
                  <span
                    className="w-[40px] h-[28px] rounded-[8px] shrink-0 border border-dashed
                      border-slate-300 dark:border-white/20"
                    aria-hidden="true"
                  />
                )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-13 font-semibold text-slate-800 dark:text-white truncate">{d.name}</span>
                  <span className="text-13 font-semibold text-slate-700 dark:text-slate-200 tabular-nums shrink-0">{fmt(d.value)}</span>
                </div>
                <ProgressBar className="mt-2" value={ready ? (d.value / max) * 100 : 0} color={d.color} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
