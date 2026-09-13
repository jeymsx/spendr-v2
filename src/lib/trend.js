/**
 * The arithmetic behind the two trend charts.
 *
 * These were defined in pages/accounts/Trend.jsx, beside the components that
 * draw them. They are pure - no React, no recharts, no DOM - and a second
 * chart needed them: the category page draws the same line from a different
 * number, so `buildSpendTrend` belongs beside `buildTrend` rather than in a
 * page importing one out of another page.
 *
 * STMT_TONE did NOT come along: it is a table of Tailwind classes, which is a
 * look rather than a fact, and lib/ is where the facts live.
 *
 * pages/accounts/Trend.jsx re-exports all of it, so `from './accounts/Trend'`
 * keeps working where it already did.
 */

// ── 30-day trend ───────────────────────────────────────────────────────────────

/**
 * How one transaction moves the number this page displays.
 *
 * For a credit card the displayed number is what you OWE, so the signs invert
 * against a deposit account: a charge raises it, a payment lowers it. Getting
 * this backwards would draw a chart that trends the wrong way, which is worse
 * than no chart, so the two cases are written out rather than negated.
 *
 * @param {Record<string, any>} tx
 * @param {string} name
 * @param {boolean} isCredit
 * @returns {number}
 */
export function forwardDelta(tx, name, isCredit) {
  const amt = tx.amount ?? 0
  if (isCredit) {
    if (tx.type === 'expense'  && tx.account === name)     return  amt  // charge
    if (tx.type === 'inflow'   && tx.account === name)     return -amt  // refund
    if (tx.type === 'transfer' && tx.toAccount === name)   return -amt  // payment
    if (tx.type === 'transfer' && tx.fromAccount === name) return  amt  // cash advance
    return 0
  }
  if (tx.type === 'expense'  && tx.account === name)     return -amt
  if (tx.type === 'inflow'   && tx.account === name)     return  amt
  if (tx.type === 'transfer' && tx.fromAccount === name) return -amt
  if (tx.type === 'transfer' && tx.toAccount === name)   return  amt
  return 0
}

export const DAY_MS = 864e5
export const HOUR_MS = 36e5

/**
 * The ranges the chart can show.
 *
 * `points` is the number of samples, not a bucket size, so each range gets a
 * resolution that suits its span rather than a fixed one: five-minute steps
 * across an hour, hourly across a day, daily across a month, weekly across a
 * year. A fixed daily bucket would draw 1H as a single point and 1Y as 365
 * of them.
 *
 * Be warned that 1H and 1D will usually be flat lines for a bank account -
 * most people do not transact twice in an hour. They are here because the
 * ranges are a familiar set and a missing one reads as broken, and because
 * they are genuinely useful on the day you are watching a transfer land.
 */
export const TREND_RANGES = [
  { key: '1h',  label: '1H',  span: HOUR_MS,          points: 13 },
  { key: '1d',  label: '1D',  span: 24 * HOUR_MS,     points: 25 },
  { key: '7d',  label: '7D',  span: 7 * DAY_MS,       points: 29 },
  { key: '1m',  label: '1M',  span: 30 * DAY_MS,      points: 31 },
  { key: '3m',  label: '3M',  span: 90 * DAY_MS,      points: 46 },
  { key: '6m',  label: '6M',  span: 180 * DAY_MS,     points: 61 },
  { key: '1y',  label: '1Y',  span: 365 * DAY_MS,     points: 53 },
  // Span is worked out from the oldest transaction on the account.
  { key: 'all', label: 'ALL', span: null,             points: 60 },
]

export const RANGE_TITLE = {
  '1h': 'Last hour', '1d': 'Last 24 hours', '7d': 'Last 7 days',
  '1m': 'Last 30 days', '3m': 'Last 3 months', '6m': 'Last 6 months',
  '1y': 'Last year', all: 'All time',
}

/**
 * A point's label, at a resolution the span justifies.
 *
 * An hour of five-minute samples all labelled "Sep 10" tells you nothing; a
 * year of weekly ones labelled "3:20 PM" tells you less.
 *
 * @param {number} span  milliseconds the chart covers
 * @returns {Intl.DateTimeFormat}
 */
export function trendLabeller(span) {
  if (span <= 2 * DAY_MS) {
    return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' })
  }
  if (span <= 400 * DAY_MS) {
    return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
  }
  return new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric' })
}

/**
 * The balance over time, as `points` samples ending now.
 *
 * Built by walking BACKWARDS from the figure the page already shows, undoing
 * activity as it goes. Anchoring to the displayed number rather than
 * recomputing from some historic zero means the right-hand end of the line
 * always agrees with the big number above it - a chart that disagrees with the
 * balance beside it destroys trust in both.
 *
 * This used to bucket by calendar day, which capped the resolution at one
 * point per day and made 1H impossible. Now it sorts the movements once and
 * sweeps a single pointer back through them, so the sample interval is just
 * span/(points-1) and any range works the same way. A transaction's full
 * timestamp is used rather than its date, which is what makes an hourly
 * line meaningful.
 *
 * Future-dated rows are excluded, so an installment plan booked months ahead
 * does not draw a cliff at today's edge.
 *
 * @param {Array<Record<string, any>>} txs
 * @param {string} name
 * @param {boolean} isCredit
 * @param {number} current  the figure the page is already showing
 * @param {{span: number|null, points: number}} range
 * @param {number} [now]
 * @returns {Array<{t: number, value: number, day: string}>}
 */
export function buildTrend(txs, name, isCredit, current, range, now = Date.now()) {
  const moves = []
  let oldest = Infinity
  for (const tx of txs) {
    const t = new Date(tx.date ?? 0).getTime()
    if (Number.isNaN(t)) continue
    const delta = forwardDelta(tx, name, isCredit)
    if (!delta) continue
    moves.push({ t, delta })
    if (t < oldest) oldest = t
  }
  moves.sort((a, b) => b.t - a.t)   // newest first

  // ALL spans back to the oldest movement - plus exactly one sample step, so
  // the first point sits BEFORE that movement rather than on it.
  //
  // Without the padding, "all time" starts at the instant of the first
  // transaction, which means that transaction is already inside the first data
  // point and you never see it arrive. Measured on a real account: ALL read
  // −₱7.2K while 1Y read +₱32.8K on the same history, because 1Y's window
  // began before the ₱40,000 payroll and ALL's began at it. Both figures were
  // arithmetically right and one of them was useless - "all time" hiding the
  // largest event in the account's life.
  //
  // Padding by one step is solved rather than fudged with a 1.02 multiplier:
  // we want span = raw + span/(points-1), so span = raw·(points-1)/(points-2).
  //
  // The floor stops a day-old account rendering "all time" as a few hours.
  const rawSpan = Number.isFinite(oldest) ? now - oldest : 30 * DAY_MS
  const padded = rawSpan * (range.points - 1) / (range.points - 2)
  const span = range.span ?? Math.max(7 * DAY_MS, padded)
  const step = span / (range.points - 1)

  // `current` is the live figure and already includes any future-dated rows,
  // so take those back off before the sweep starts.
  let running = current
  let i = 0
  while (i < moves.length && moves[i].t > now) { running -= moves[i].delta; i++ }

  const out = []
  for (let k = 0; k < range.points; k++) {
    const t = now - k * step
    // Everything more recent than this sample has to come back off.
    while (i < moves.length && moves[i].t > t) { running -= moves[i].delta; i++ }
    out.push({ t, value: running })
  }
  out.reverse()

  const label = trendLabeller(span)
  return out.map(pt => ({ ...pt, day: label.format(new Date(pt.t)) }))
}

/**
 * A category's spending over time, as `points` samples across the window.
 *
 * Cumulative FROM ZERO at the window's left edge, not a running total of all
 * time: "how much have I spent on Food in the last 30 days" is the question a
 * category page answers, and it is the one a budget is set against. So each
 * range re-answers it over its own span - 3M shows a larger figure than 1M
 * because it covers more, which is the honest reading rather than a bug.
 *
 * Built forwards, where buildTrend is built backwards, and for the same
 * reason in reverse. A balance chart has to END at the figure the page shows,
 * so it anchors on the right and undoes its way left. A spend chart has to
 * START at zero, because that is what "in this window" means, so it anchors
 * on the left and accumulates.
 *
 * Future-dated rows are excluded, the way every other spend surface excludes
 * them - an installment plan books months of charges the day you buy, and
 * counting next December's in this month's total would report money spent
 * that has not been.
 *
 * The dashed reference line comes from `usualPerDay` - spendBaseline works
 * out what that rate should be. It is stamped as `usual` on every point so
 * recharts can draw it as a second series against the same axis, and it is a
 * straight line from zero, because a constant daily rate IS a straight line
 * on a cumulative chart. That is the whole trick: your real line sitting
 * above the dashed one means you are spending faster than you usually do,
 * and the gap between them is by how much.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} [input.txs]
 * @param {{span: number|null, points: number}} input.range
 * @param {number} [input.now]
 * @param {number|null} [input.usualPerDay]  omit for no reference line
 * @returns {Array<{t: number, value: number, day: string, usual?: number}>}
 */
export function buildSpendTrend({ txs = [], range, now = Date.now(), usualPerDay = null }) {
  const moves = collectSpend(txs, now)
  const span = spendSpan({ txs, range, now })
  const step = span / (range.points - 1)
  const start = now - span

  let running = 0
  let i = 0
  // Anything older than the window is not part of the window's total.
  while (i < moves.length && moves[i].t < start) i++

  const out = []
  for (let k = 0; k < range.points; k++) {
    const t = start + k * step
    while (i < moves.length && moves[i].t <= t) { running += moves[i].amt; i++ }
    const pt = usualPerDay == null
      ? { t, value: running }
      : { t, value: running, usual: usualPerDay * ((t - start) / DAY_MS) }
    out.push(pt)
  }

  const label = trendLabeller(span)
  return out.map(pt => ({ ...pt, day: label.format(new Date(pt.t)) }))
}

/**
 * The spend rows worth plotting, oldest first.
 *
 * @param {Array<Record<string, any>>} txs
 * @param {number} now
 * @returns {Array<{t: number, amt: number}>}
 */
function collectSpend(txs, now) {
  const moves = []
  for (const tx of txs) {
    const t = new Date(tx.date ?? 0).getTime()
    if (Number.isNaN(t) || t > now) continue
    const amt = tx.amount ?? 0
    if (!amt) continue
    moves.push({ t, amt })
  }
  return moves.sort((a, b) => a.t - b.t)
}

/**
 * How long a window the chart actually covers.
 *
 * A fixed range answers itself. ALL spans back to the first charge, padded by
 * one sample step for the same reason buildTrend pads: without it the first
 * point sits ON the oldest movement, so the largest thing in the history is
 * already inside the first sample and you never see it arrive.
 *
 * Its own function because the baseline needs the same number. The history a
 * reference line is built from is precisely the history OUTSIDE this window,
 * so two spans that drift apart would compare a month against a slightly
 * different month.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} [input.txs]
 * @param {{span: number|null, points: number}} input.range
 * @param {number} [input.now]
 * @returns {number}
 */
export function spendSpan({ txs = [], range, now = Date.now() }) {
  if (range.span) return range.span
  let oldest = Infinity
  for (const tx of txs) {
    const t = new Date(tx.date ?? 0).getTime()
    if (Number.isNaN(t) || t > now) continue
    if (!(tx.amount ?? 0)) continue
    if (t < oldest) oldest = t
  }
  const rawSpan = Number.isFinite(oldest) ? now - oldest : 30 * DAY_MS
  return Math.max(7 * DAY_MS, rawSpan * (range.points - 1) / (range.points - 2))
}

/** A baseline needs this many days of history behind it to mean anything. */
export const BASELINE_MIN_DAYS = 14
/** ...and this many rows. Two purchases do not make a habit either. */
export const BASELINE_MIN_ROWS = 3

/**
 * What this category usually costs, as a daily rate.
 *
 * ── Measured BEFORE the window, never across it ──
 *
 * The reference exists to answer "is this window unusual", and a baseline
 * that includes the window is a baseline the window has already moved: a bad
 * month would raise its own bar and then look normal against it. So the
 * history considered is strictly everything older than the window's left
 * edge.
 *
 * Which also means ALL never gets one. When the window is your whole history
 * there is nothing left over to compare it against, and drawing no line says
 * that better than drawing the same line twice.
 *
 * ── An average, not last week ──
 *
 * "How did last week look" is the obvious reading and it is the noisier one:
 * one big grocery run in the comparison week moves the whole reference, and
 * you end up measuring against an accident. An average over all prior history
 * is what "usually" means - and it degrades into last week on its own when
 * last week is all the history there is.
 *
 * ── Null rather than a number ──
 *
 * A rate off three days and two rows is noise wearing a dashed line. A
 * reference the reader trusts and should not is worse than no reference.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} [input.txs]
 * @param {number} input.span  the charted window, from spendSpan
 * @param {number} [input.now]
 * @returns {{dailyRate: number, days: number, total: number}|null}
 */
export function spendBaseline({ txs = [], span, now = Date.now() }) {
  const start = now - span
  const prior = collectSpend(txs, now).filter(m => m.t < start)
  if (prior.length < BASELINE_MIN_ROWS) return null

  // Measured from the first row, not from the beginning of time: a category
  // you started using in June should not be averaged over a January the app
  // never saw.
  const days = (start - prior[0].t) / DAY_MS
  if (days < BASELINE_MIN_DAYS) return null

  const total = prior.reduce((sum, m) => sum + m.amt, 0)
  return { dailyRate: total / days, days, total }
}

/**
 * The ranges a spend chart offers: the balance chart's, without the hour and
 * the day.
 *
 * Those two are defensible on an account - the day you are watching a
 * transfer land, an hourly line is the only one that shows it. Spending is
 * not like that. Nobody asks what they spent on groceries in the last hour,
 * and a chip that is always a flat zero teaches you to distrust the rest.
 *
 * Derived rather than retyped, so a range that gains a point here gains it
 * there too.
 */
export const SPEND_TREND_RANGES = TREND_RANGES.filter(r => r.key !== '1h' && r.key !== '1d')
