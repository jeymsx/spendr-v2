/**
 * Where you stand, in one word - the thing the rest of the note leans on.
 *
 * It picks the tone (a tight week is not given a joke), which sentence leads
 * and what the last line is for. Read from the metrics in a fixed order, most
 * serious first, so a month that is both warm and about to run short is
 * "short": the first thing true is the thing to say.
 *
 *   fresh    too little logged to read anything yet
 *   short    the money runs out before the next pay
 *   tight    bills crowd the money left, or the budget is spent early
 *   hot      spending is running ahead of the month
 *   ahead    spending is well behind the month
 *   steady   neither, which is most days
 *
 * @typedef {import('./facts').StandingFacts} StandingFacts
 * @typedef {import('./metrics').Metrics} Metrics
 * @typedef {'fresh'|'short'|'tight'|'hot'|'steady'|'ahead'} LevelId
 * @typedef {{id: LevelId, label: string, tone: 'good'|'bad'|'warn'|null}} Level
 */

/** @type {Record<LevelId, Level>} */
export const LEVELS = {
  fresh: { id: 'fresh', label: 'Just getting started', tone: null },
  short: { id: 'short', label: 'Running short', tone: 'bad' },
  tight: { id: 'tight', label: 'Tight', tone: 'warn' },
  hot: { id: 'hot', label: 'Running warm', tone: 'warn' },
  steady: { id: 'steady', label: 'On track', tone: null },
  ahead: { id: 'ahead', label: 'Ahead', tone: 'good' },
}

/** Fewer rows than this and there is nothing to read. */
export const FRESH_BELOW = 5

/**
 * @param {StandingFacts} f
 * @param {Metrics} m
 * @returns {Level}
 */
export function standingOf(f, m) {
  if ((f.txCount ?? 0) < FRESH_BELOW) return LEVELS.fresh

  const plan = f.plan
  if (plan?.shortOn || (plan && plan.safe != null && plan.safe <= 0)) return LEVELS.short

  const crowded = plan?.liquid != null && plan.liquid > 0 && m.billsTotal >= plan.liquid * 0.6
  const spentEarly = m.hasBudget && m.remaining <= 0 && m.daysLeft > 3
  if (plan?.belowFloorOn || crowded || spentEarly || (m.paceGap != null && m.paceGap >= 30)) return LEVELS.tight

  // Nothing spent yet is not a month well managed; it is a month not begun.
  if (m.spent === 0) return LEVELS.steady

  if ((m.paceGap != null && m.paceGap >= 12) || (m.vsPrev != null && m.vsPrev >= 25)) return LEVELS.hot

  const behind = m.paceGap != null ? m.paceGap <= -10 : m.vsPrev != null && m.vsPrev <= -15
  if (behind) return LEVELS.ahead

  return LEVELS.steady
}
