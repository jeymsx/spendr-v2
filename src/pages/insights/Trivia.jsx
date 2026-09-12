import { useState, useEffect } from 'react'
import {
  IconCalendar, IconReceipt, IconTrophy, IconCheckCircle, IconAlert,
  IconTarget, IconCoins, IconTrendUp as IconTrendGlyph, IconBarChart, IconCalc,
} from '../../components/icons'
import { fmtCompact } from '../../lib/money'

// ── Trivia ─────────────────────────────────────────────────────────────────────

export function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}

export function generateTrivia({ expenses, inflows, totalSpent, totalEarned, categorySegments, topCategory, dailyData, topExpenses, budgetData, monthName }) {
  const items = []
  const push = (icon, text, valid = true) => { if (valid && text) items.push({ icon, text }) }
  const numExpenses = expenses.length
  const hasExpenses = numExpenses > 0

  const zeroDays = dailyData.filter(d => d.value === 0).length
  push('calendar', `You had ${zeroDays} spending-free day${zeroDays !== 1 ? 's' : ''} in ${monthName} — ${Math.round(zeroDays / dailyData.length * 100)}% of the period.`, zeroDays > 0 && hasExpenses && dailyData.length > 0)

  if (topExpenses.length > 0) {
    const top = topExpenses[0]
    push('receipt', `Your biggest single expense: ${fmtCompact(top.amount)} on "${top.description || top.category}".`)
  }

  push('calc', `${numExpenses} expense transaction${numExpenses !== 1 ? 's' : ''} in ${monthName} — averaging ${fmtCompact(totalSpent / numExpenses)} each.`, hasExpenses)

  if (topCategory && totalSpent > 0) {
    const pct = (topCategory.value / totalSpent * 100).toFixed(0)
    push('trophy', `${topCategory.icon} ${topCategory.name} took up ${pct}% of your spending.`)
  }

  if (categorySegments.length >= 2 && totalSpent > 0) {
    const top2 = categorySegments[0].value + categorySegments[1].value
    push('target', `${categorySegments[0].icon} ${categorySegments[0].name} and ${categorySegments[1].icon} ${categorySegments[1].name} together make up ${(top2 / totalSpent * 100).toFixed(0)}% of expenses.`)
  }

  if (totalEarned > 0) {
    const net = totalEarned - totalSpent
    const rate = Math.abs((net / totalEarned) * 100).toFixed(0)
    if (net >= 0) push('coins', `You saved ${fmtCompact(net)} in ${monthName} — a ${rate}% savings rate.`)
    else push('alert', `You overspent income by ${fmtCompact(Math.abs(net))} — a ${rate}% deficit.`)
  }

  if (hasExpenses) {
    const byDow = [0,0,0,0,0,0,0]
    for (const tx of expenses) byDow[new Date(tx.date).getDay()] += tx.amount ?? 0
    const maxDow = byDow.indexOf(Math.max(...byDow))
    const days = ['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays']
    push('calendar', `${days[maxDow]} are your heaviest spending day in ${monthName}.`, byDow[maxDow] > 0)
  }

  const peak = dailyData.reduce((b, d) => d.value > b.value ? d : b, { day: 0, value: 0 })
  push('trend', `Highest-spend day: the ${ordinal(peak.day)} — ${fmtCompact(peak.value)}.`, peak.value > 0)

  const activeDays = dailyData.filter(d => d.value > 0).length
  push('chart', `On days you actually spent, you averaged ${fmtCompact(totalSpent / activeDays)} per day.`, activeDays > 0)

  const overBudget = budgetData.filter(d => d.spent > d.budget)
  if (overBudget.length > 0) push('alert', `Over budget in ${overBudget.length} categor${overBudget.length !== 1 ? 'ies' : 'y'}: ${overBudget.map(d => d.name).join(', ')}.`)

  const underBudget = budgetData.filter(d => d.budget > 0 && d.spent < d.budget)
  if (underBudget.length > 0) {
    const saved = underBudget.reduce((s, d) => s + (d.budget - d.spent), 0)
    push('check', `Stayed under budget in ${underBudget.length} categor${underBudget.length !== 1 ? 'ies' : 'y'}, saving ${fmtCompact(saved)} vs your limits.`)
  }

  return items
}

/** Which watermark each kind of insight wears. See the note in icons.jsx. */
export const INSIGHT_GLYPH = {
  calendar: IconCalendar,
  receipt:  IconReceipt,
  trophy:   IconTrophy,
  check:    IconCheckCircle,
  alert:    IconAlert,
  target:   IconTarget,
  coins:    IconCoins,
  trend:    IconTrendGlyph,
  chart:    IconBarChart,
  calc:     IconCalc,
}

export function SpendingTrivia({ trivia, triviaKey }) {
  const [idx, setIdx]   = useState(() => Math.floor(Math.random() * Math.max(trivia.length, 1)))
  const [fade, setFade] = useState(true)

  useEffect(() => {
    // Math.random() cannot run during render - purity forbids it, and
    // a re-render would reshuffle the trivia mid-read. Picking once
    // per window, in an effect, is the only place left.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdx(Math.floor(Math.random() * Math.max(trivia.length, 1)))
    setFade(true)
  }, [triviaKey, trivia.length])

  if (!trivia.length) return null
  const item = trivia[idx % trivia.length]

  function next() {
    setFade(false)
    setTimeout(() => {
      setIdx(i => {
        let n = Math.floor(Math.random() * trivia.length)
        while (n === i && trivia.length > 1) n = Math.floor(Math.random() * trivia.length)
        return n
      })
      setFade(true)
    }, 150)
  }

  const Glyph = INSIGHT_GLYPH[item.icon] ?? INSIGHT_GLYPH.chart

  return (
    <div className="px-5">
      {/* A fixed height, not a minimum.

          These strings run from about forty characters to over a hundred - one
          carries a transaction's own description, so there is no upper bound at
          all - and the card is a BUTTON you tap to shuffle. A height that
          follows its contents means the page jumps under your thumb on every
          tap, and everything below it moves too.

          84px is two lines of 13px at this leading plus the padding. The text
          is clamped to two so a long description truncates rather than
          escaping, and left-aligned against the card's own edge rather than
          indented past a glyph - the glyph is behind it now. */}
      <button
        onClick={next}
        className="insight-aurora relative w-full h-[84px] rounded-2xl px-4 flex items-center
          text-left active:opacity-70 transition-opacity duration-75 overflow-hidden"
        style={{ outline: 'none' }}
      >
        {/* The watermark. Big, white, low, and clipped by the card's own
            corner - the same move an account card makes with its brand mark,
            which is where the idea came from. Sitting behind the text rather
            than beside it is what let the copy start at the card's edge.

            aria-hidden and pointer-events-none: it is texture. The sentence
            already says everything this could. */}
        <span
          className="pointer-events-none absolute -bottom-5 -right-4 text-white/[0.16] dark:text-white/[0.13]"
          aria-hidden="true"
        >
          <Glyph size={104} strokeWidth={1.4} />
        </span>

        <div
          className="relative flex items-baseline gap-3 w-full"
          style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.15s ease' }}
        >
          {/* Capped, not sized.

              The watermark is a fixed 104px box anchored to the card's right
              edge, so the room it wants back is a fixed number of pixels at
              any card width - a percentage would over-reserve on a wide one.
              72px clears its ink: the glyphs draw on a 24-grid with 2-3px of
              padding, which puts their leftmost stroke about 80px in from the
              right, and both lines were running straight through it.

              The cap costs no words. All twelve strings still wrap to two
              lines at this width - measured, not assumed - and the one
              carrying a transaction's own description was already clamped. */}
          <p className="flex-1 max-w-[calc(100%-72px)] text-[13px] font-medium text-slate-700 dark:text-slate-200 leading-relaxed line-clamp-2">
            {item.text}
          </p>
          {/* Uppercase and tracked, which is this app's small-label voice
              everywhere else. It was lowercase "tap" at 10px semibold - already
              Inter, checked - and at that size a soft lowercase word reads as a
              rounded typeface rather than as a label.

              ml-auto is what keeps it in the corner: capping the paragraph
              leaves free space on the line, and without an auto margin the
              label just follows the shorter text inward. */}
          <span className="ml-auto text-[9px] font-bold uppercase tracking-[0.16em] text-primary/60 shrink-0">
            Tap
          </span>
        </div>
      </button>
    </div>
  )
}
