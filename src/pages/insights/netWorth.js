import { useMemo } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useNetWorthNow from '../../hooks/useNetWorthNow'
import { txBase } from '../../lib/fxContext'
import { TREND_RANGES, buildNetWorthTrend, netWorthDelta } from '../../lib/trend'
import { monthKeyOf } from '../../lib/recap'

/**
 * Net worth over time, for the Net worth card on Insights and the page it
 * opens - one reading, so the card's figure and the page's are the same.
 *
 * It keeps its own range, and ignores the page's period. A net-worth line is
 * anchored to TODAY's figure and walks back from it, the way an account's
 * balance does, so it cannot follow the month arrows: flipping to August
 * would still draw a line that ends now. Longer ranges only - over a day it
 * moves when you buy lunch, and says nothing.
 *
 * The combined figure, in the ledger's currency, whatever the wallet on Home
 * is set to show: a line needs one unit to be drawn in.
 */

export const NET_RANGES = TREND_RANGES.filter(r => ['1m', '3m', '6m', '1y', 'all'].includes(r.key))

/** What a change over each range is "in": "+₱12K in 6 months". */
export const NET_RANGE_WORDS = {
  '1m': 'in a month', '3m': 'in 3 months', '6m': 'in 6 months', '1y': 'in a year', all: 'since you started',
}

/** @param {string} key one of NET_RANGES */
export function useNetWorthSeries(key) {
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  const txs = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const range = NET_RANGES.find(r => r.key === key) ?? NET_RANGES[2]
  /* Today's figure, read the way the wallet reads it - so the right-hand
     end of this line and the big number on Home are the same number. */
  const current = useNetWorthNow(accounts, txs)
  const data = useMemo(() => {
    if (current == null || !txs) return []
    return buildNetWorthTrend({ txs, current, range, priceOf: txBase })
  }, [txs, current, range])
  return { loading: !accounts || !txs, accounts: accounts ?? [], txs: txs ?? [], current, range, data }
}

/**
 * Net worth at the end of each recent month, newest first - this month's
 * "end" being now - and how each moved from the month before.
 *
 * Worked back from today's figure by undoing every movement after each
 * month's last moment, the same undoing the chart does, so the two agree.
 * Rows dated after today are in today's figure but have not happened, so
 * they come off first. Months before the ledger's first entry are left out:
 * they would be a flat run of the opening balances.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.txs
 * @param {number} input.current
 * @param {number} [input.months]
 * @param {Date} [input.now]
 * @param {(tx: Record<string, any>) => number} [input.priceOf]
 * @returns {Array<{key: string, value: number, change: number|null}>}
 */
export function monthEnds({ txs, current, months = 6, now = new Date(), priceOf = txBase }) {
  const moves = txs
    .map(t => ({ t: Date.parse(t.date), delta: netWorthDelta(t, priceOf) }))
    .filter(m => Number.isFinite(m.t) && m.delta)
    .sort((a, b) => b.t - a.t)
  if (!moves.length) return []
  const first = monthKeyOf(new Date(moves[moves.length - 1].t))
  let running = current
  let i = 0
  const nowMs = now.getTime()
  while (i < moves.length && moves[i].t > nowMs) { running -= moves[i].delta; i++ }
  /** @type {Array<{key: string, value: number}>} */
  const out = []
  for (let k = 0; k < months; k++) {
    const month = new Date(now.getFullYear(), now.getMonth() - k, 1)
    const key = monthKeyOf(month)
    if (key < first) break
    // The first moment of the month after, local time; for this month, now.
    const end = k === 0 ? nowMs : new Date(now.getFullYear(), now.getMonth() - k + 1, 1).getTime()
    while (i < moves.length && moves[i].t >= end) { running -= moves[i].delta; i++ }
    out.push({ key, value: running })
  }
  /* The change for the oldest row needs the month before it, which is the
     figure once that month's own movements are undone too. */
  return out.map((m, j) => {
    if (j + 1 < out.length) return { ...m, change: m.value - out[j + 1].value }
    const start = new Date(now.getFullYear(), now.getMonth() - j, 1).getTime()
    let before = m.value
    for (const mv of moves) if (mv.t >= start && mv.t < (j === 0 ? nowMs : new Date(now.getFullYear(), now.getMonth() - j + 1, 1).getTime())) before -= mv.delta
    return { ...m, change: m.value - before }
  })
}
