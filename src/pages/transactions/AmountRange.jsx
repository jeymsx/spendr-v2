import { useMemo, useCallback } from 'react'
import * as RadixSlider from '@radix-ui/react-slider'

// ── Amount range histogram + slider ───────────────────────────────────────────

/* 48, not 28.
   At 28 buckets across a 350px sheet the bars came out ~9px wide - wide
   enough to read as a bar CHART, which invites you to compare individual
   bars, and there is nothing here to compare: this is a texture showing
   roughly where your amounts cluster, under a slider. Twice as many buckets
   at half the width reads as one shape instead of 28 objects. */
const BUCKETS = 48

export function AmountRangeFilter({ allTxs, amountMin, amountMax, onAmountMin, onAmountMax }) {
  // Compute p1 and p99 of transaction amounts — the slider spans this range
  const { scaleMin, scaleMax } = useMemo(() => {
    const amounts = (allTxs ?? []).map(t => t.amount ?? 0).filter(a => a > 0).sort((a, b) => a - b)
    if (!amounts.length) return { scaleMin: 1, scaleMax: 10000 }
    const p1  = amounts[Math.max(0, Math.floor(amounts.length * 0.01) - 1)]
    const p99 = amounts[Math.min(Math.floor(amounts.length * 0.99), amounts.length - 1)]
    return {
      scaleMin: Math.max(1, Math.floor(p1)),
      scaleMax: Math.ceil(p99 / 10) * 10,
    }
  }, [allTxs])

  // Log scale helpers: map amount ↔ slider position 0–100
  const toPos   = useCallback((amt) => {
    if (amt <= scaleMin) return 0
    if (amt >= scaleMax) return 100
    return Math.log(amt / scaleMin) / Math.log(scaleMax / scaleMin) * 100
  }, [scaleMin, scaleMax])

  const fromPos = useCallback((pos) => {
    if (pos <= 0)   return scaleMin
    if (pos >= 100) return scaleMax
    return Math.round(Math.exp(pos / 100 * Math.log(scaleMax / scaleMin)) * scaleMin)
  }, [scaleMin, scaleMax])

  // Histogram buckets on log scale — each bucket covers equal log-space
  const buckets = useMemo(() => {
    const counts = Array(BUCKETS).fill(0)
    ;(allTxs ?? []).forEach(tx => {
      const a = tx.amount ?? 0
      if (a <= 0) return
      const pos = toPos(a)
      const idx = Math.min(Math.floor(pos / 100 * BUCKETS), BUCKETS - 1)
      counts[idx]++
    })
    return counts
  }, [allTxs, toPos])

  const maxCount = Math.max(...buckets, 1)

  const loPos = amountMin != null ? toPos(amountMin) : 0
  const hiPos = amountMax != null ? toPos(amountMax) : 100

  const fmtAmt = (v) => {
    if (v >= 1_000_000) return '₱' + (v / 1_000_000).toFixed(1) + 'M'
    if (v >= 1_000)     return '₱' + (v / 1_000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k'
    return '₱' + Math.round(v)
  }

  return (
    <div>
      {/* Histogram */}
      <div className="flex items-end gap-[3px] h-12 mb-1 px-0.5">
        {buckets.map((count, i) => {
          const bucketLoPos = i / BUCKETS * 100
          const bucketHiPos = (i + 1) / BUCKETS * 100
          const inRange     = bucketHiPos > loPos && bucketLoPos < hiPos
          /* An empty bucket is a 2px dot on the baseline, not a bar. It is
             there so the comb reads as one continuous object across the
             whole range rather than as floating sticks. */
          const heightPct   = count === 0 ? 3.5 : Math.max(10, (count / maxCount) * 100)
          return (
            <div
              key={i}
              className="flex-1 rounded-full transition-colors duration-150"
              style={{
                height: `${heightPct}%`,
                backgroundColor: inRange
                  ? 'rgba(var(--color-primary-rgb), 0.8)'
                  : 'rgba(var(--color-primary-rgb), 0.16)',
              }}
            />
          )
        })}
      </div>

      {/* Dual slider — internal 0–100 log-scale position */}
      <RadixSlider.Root
        className="relative flex items-center select-none touch-none w-full h-5 mt-1"
        min={0}
        max={100}
        step={0.5}
        value={[loPos, hiPos]}
        onValueChange={([lo, hi]) => {
          onAmountMin(lo <= 0.5 ? null : fromPos(lo))
          onAmountMax(hi >= 99.5 ? null : fromPos(hi))
        }}
        minStepsBetweenThumbs={2}
      >
        <RadixSlider.Track className="relative grow rounded-full h-[3px] bg-slate-200 dark:bg-white/[0.12]">
          <RadixSlider.Range className="absolute rounded-full h-full" style={{ backgroundColor: 'rgb(var(--color-primary-rgb))' }} />
        </RadixSlider.Track>
        {[0, 1].map(i => (
          <RadixSlider.Thumb
            key={i}
            className="block w-5 h-5 rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.25)] border border-slate-200 dark:border-white/20 outline-none focus:ring-2 focus:ring-primary/40 cursor-grab active:cursor-grabbing transition-transform active:scale-110"
          />
        ))}
      </RadixSlider.Root>

      {/* The two ends, as text.

          They were bordered chips, which read as fields you could type into -
          and you cannot; the slider above is the control and these only ever
          report where its handles are. A box around a read-only value is a
          promise the UI does not keep. */}
      <div className="flex items-baseline justify-between mt-3">
        <p className="text-13 text-slate-500 dark:text-slate-400">
          Min{' '}
          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {amountMin == null ? 'Any' : fmtAmt(amountMin)}
          </span>
        </p>
        <p className="text-13 text-slate-500 dark:text-slate-400">
          Max{' '}
          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {amountMax == null ? 'Any' : fmtAmt(amountMax) + '+'}
          </span>
        </p>
      </div>
    </div>
  )
}
