import { isIncome } from './flows'
import { txBase } from './fxContext'

/**
 * Pay the ledger already shows.
 *
 * The forecast used to see income only on the Recurring list, so anyone who
 * logs their salary as it arrives, and never set it up as a recurring item,
 * got a forecast of nothing but money going out: every payday missing, and a
 * line that only ever fell. Their history already says when the money comes.
 * This reads it.
 *
 * ── What counts as a stream ──
 *
 * Money that keeps arriving on a rhythm: weekly, every two weeks, twice a
 * month (the Philippine payroll cut-offs, usually the 15th and the last day)
 * or monthly. Rows are grouped by category first, since that is how a salary
 * is filed; a category that mixes several things ("Income" holding pay AND
 * the odd side job) is split by what the rows are called.
 *
 * A rhythm is only believed when most of its payments keep to it, and only
 * while it is still going: pay that stopped two cycles ago is a job that
 * ended, not a payday to count on.
 *
 * ── What does not ──
 *
 * Balance corrections and value updates (flows.js isIncome), money someone
 * paid back (a debt collection settles a debt; it is not pay), rows dated in
 * the future, and whatever the caller asks to skip - the forecast skips pay
 * posted from a Recurring item when that item is already projected, so the
 * same salary is not counted twice.
 *
 * Everything else that arrived but kept no rhythm is "occasional": a gift, a
 * one-off sale. It is returned as an average per day, for a forecast that
 * wants to count it, and left out of the streams.
 */

const DAY_MS = 864e5

/** How far back "from your history" reads, by the setting's key. */
export const INCOME_LOOKBACKS = [
  { key: '3m', label: '3M', days: 92 },
  { key: '6m', label: '6M', days: 183 },
  { key: '12m', label: '12M', days: 365 },
]

/** Days in one cycle, by frequency - for staleness and tolerances. */
export const STREAM_CYCLE_DAYS = { weekly: 7, fortnightly: 14, semimonthly: 15.2, monthly: 30.4 }
/** Fewest payments before a rhythm is believed. */
const MIN_PAYMENTS = { weekly: 4, fortnightly: 3, semimonthly: 3, monthly: 2 }
/** Share of payments that must keep to the rhythm. */
const KEEP = 0.7
/** Days a payment may land off its day and still count as on it (a 15th that fell on a Sunday). */
const SLACK = 3

/** A day of the month standing for "the last day", whatever the month's length. */
export const MONTH_END = 31

/**
 * @typedef {'weekly'|'fortnightly'|'semimonthly'|'monthly'} StreamFrequency
 *
 * @typedef {object} IncomeStream
 * @property {string} key
 * @property {string} name          what to call it - the category, or what the rows are called
 * @property {string|null} category
 * @property {string|null} account  where it usually lands
 * @property {StreamFrequency} frequency
 * @property {number} amount        a typical payment, in the ledger's currency
 * @property {number[]} anchors     the days of the month it lands on, for monthly
 *   and twice-monthly pay (MONTH_END is the last day); empty otherwise
 * @property {number[]} amounts     a typical payment on each anchor, same order
 * @property {Date} last            the most recent payment
 * @property {number} count         how many payments it was read from
 *
 * @typedef {{date: Date, amount: number, account: string|null, name: string}} Payment
 */

/** @param {Date} d */
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** @param {Date} d */
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** @param {number} y @param {number} m */
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate()
const round2 = (/** @type {number} */ n) => Math.round(n * 100) / 100
/** @param {number[]} xs */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  if (!s.length) return 0
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
/** @param {Array<string|null>} xs */
function mostCommon(xs) {
  /** @type {Map<string|null, number>} */
  const n = new Map()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  let best = null, count = 0
  for (const [x, c] of n) if (c > count) { best = x; count = c }
  return best
}

/** Money someone paid back: it settles a debt, it is not income that repeats. @param {Record<string, any>} t */
const isSettlement = (t) => Array.isArray(t?.settles) || t?.category === 'Debt Collection'

/**
 * What a row is called, with the parts that change every time taken out -
 * "Salary Sep 15" and "Salary (Sept 30)" are the same pay.
 * @param {string|null|undefined} s
 */
export function payName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/g, ' ')
    .replace(/[0-9]+(st|nd|rd|th)?/g, ' ')
    .replace(/[^a-zÀ-ɏ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * The day of the month a payment stands for: its own, or MONTH_END when it
 * landed within two days of the month's end - so pay on the 30th of a
 * 31-day month and the 28th of February are the same payday.
 * @param {Date} d
 */
function dayOf(d) {
  const last = daysIn(d.getFullYear(), d.getMonth())
  return d.getDate() >= last - 2 ? MONTH_END : d.getDate()
}

/** How far a day of the month is from an anchor, the month-end wrapping round to the 1st. @param {number} day @param {number} anchor */
function offBy(day, anchor) {
  const d = Math.abs(day - anchor)
  return Math.min(d, 31 - d)
}

/**
 * The date an anchor falls on in a month.
 * @param {number} y @param {number} m @param {number} anchor
 */
function onAnchor(y, m, anchor) {
  return new Date(y, m, Math.min(anchor, daysIn(y, m)))
}

/**
 * The day, or pair of days, of the month that the most payments land on.
 *
 * Tried from the days themselves rather than averaged, because the month
 * wraps: pay due on the 31st that slips to the 1st is a day late, not half a
 * month early, and the median of [31, 1, 2, 31] is the 16th. Each candidate
 * is scored by how many payments land within SLACK of it, then by how close
 * they land. Null when the best keeps fewer than KEEP of the payments.
 *
 * @param {number[]} days
 * @param {1|2} count  one day for monthly pay, two for twice a month
 * @returns {number[]|null}
 */
function anchorsOf(days, count) {
  const unique = [...new Set(days)].sort((a, b) => a - b)
  /** @type {number[][]} */
  const tries = []
  if (count === 1) for (const a of unique) tries.push([a])
  else {
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        // Two paydays at least ten days apart, however the month wraps.
        if (offBy(unique[i], unique[j]) >= 10) tries.push([unique[i], unique[j]])
      }
    }
  }
  let best = /** @type {number[]|null} */ (null), bestKept = -1, bestCost = Infinity
  for (const anchors of tries) {
    let kept = 0, cost = 0
    for (const d of days) {
      const off = Math.min(...anchors.map(a => offBy(d, a)))
      if (off <= SLACK) { kept++; cost += off }
    }
    if (kept > bestKept || (kept === bestKept && cost < bestCost)) {
      best = anchors; bestKept = kept; bestCost = cost
    }
  }
  if (!best || bestKept < Math.ceil(days.length * KEEP)) return null
  // Twice a month needs both days actually used, not one day and a stray.
  const need = days.length >= 4 ? 2 : 1
  if (count === 2 && best.some(a => days.filter(d => offBy(d, a) <= SLACK).length < need)) return null
  return best
}

/** Whether most payments land on the same weekday - pay every other Friday, not on dates. @param {Payment[]} payments */
function sameWeekday(payments) {
  const n = new Array(7).fill(0)
  for (const p of payments) n[p.date.getDay()]++
  return Math.max(...n) >= Math.ceil(payments.length * 0.8)
}

/**
 * Whether a run of gaps keeps to a cycle, allowing one missed payment in a
 * row (a gap of about two cycles) - a payday someone forgot to log should not
 * make a steady salary look irregular.
 * @param {number[]} gaps @param {number} cycle @param {number} tol
 */
function keepsTo(gaps, cycle, tol) {
  if (!gaps.length) return false
  const ok = gaps.filter(g => Math.abs(g - cycle) <= tol || Math.abs(g - 2 * cycle) <= tol).length
  return ok >= Math.ceil(gaps.length * KEEP)
}

/**
 * @typedef {object} Rhythm
 * @property {StreamFrequency} frequency
 * @property {number[]} anchors
 * @property {number[]} amounts
 * @property {number} amount
 * @property {boolean[]} fit   which of the payments keep to it, same order
 * @property {Date} last       the latest payment that keeps to it
 * @property {number} count    how many keep to it
 */

/**
 * The rhythm of one group of payments, or null when it keeps none.
 *
 * Also which payments keep to it. A category that holds a salary and the odd
 * sale can still read as a salary, but the sale must not become part of it -
 * not in its typical amount, not as the "last payday" the next one is
 * counted from - so only the payments on the rhythm make the stream, and the
 * rest are left for the caller.
 *
 * @param {Payment[]} payments  oldest first, at most one per day
 * @param {Date} today
 * @returns {Rhythm|null}
 */
export function rhythmOf(payments, today) {
  if (payments.length < 2) return null
  /** @type {number[]} */
  const gaps = []
  for (let i = 1; i < payments.length; i++) {
    gaps.push(Math.round((payments[i].date.getTime() - payments[i - 1].date.getTime()) / DAY_MS))
  }
  const m = median(gaps)
  const days = payments.map(p => dayOf(p.date))

  /** @type {StreamFrequency|null} */
  let frequency = null
  /** @type {number[]} */
  let anchors = []
  if (m >= 12 && m <= 18) {
    /* Every two weeks and twice a month have the same gap, about 15 days,
       and a few months of either can even fit two days of the month. What
       tells them apart is the weekday: pay every other Friday is always a
       Friday, while the 15th and the 30th move through the week. */
    const two = sameWeekday(payments) ? null : anchorsOf(days, 2)
    if (two && payments.length >= MIN_PAYMENTS.semimonthly) { frequency = 'semimonthly'; anchors = two }
    else if (keepsTo(gaps, 14, 1) && payments.length >= MIN_PAYMENTS.fortnightly) frequency = 'fortnightly'
  } else if (m >= 26 && m <= 35) {
    const one = anchorsOf(days, 1)
    const enough = payments.length >= 3
      || (payments.length >= MIN_PAYMENTS.monthly && gaps.every(g => g >= 26 && g <= 35))
    if (one && enough) { frequency = 'monthly'; anchors = one }
  } else if (m >= 6 && m <= 8) {
    if (keepsTo(gaps, 7, 1) && payments.length >= MIN_PAYMENTS.weekly) frequency = 'weekly'
  }
  if (!frequency) return null

  // Which payments keep to it: on one of its days, or a cycle (or two) from a neighbour.
  const step = frequency === 'weekly' ? 7 : 14
  const onCycle = (/** @type {number} */ g) => Math.abs(g - step) <= 1 || Math.abs(g - 2 * step) <= 1
  const fit = payments.map((p, i) => (anchors.length
    ? Math.min(...anchors.map(a => offBy(dayOf(p.date), a))) <= SLACK
    : (i > 0 && onCycle(gaps[i - 1])) || (i < gaps.length && onCycle(gaps[i]))))
  /* One payday per slot. A gift on the 17th is near the 15th, but the 15th
     already has its salary: of the payments claiming one day of one month,
     the closest keeps it (the larger, if they tie) and the rest are left
     over. Month-end pay that slipped into the 1st belongs to the month before. */
  if (anchors.length) {
    /** @type {Map<string, number>} */
    const holder = new Map()
    payments.forEach((p, i) => {
      if (!fit[i]) return
      const day = dayOf(p.date)
      const offs = anchors.map(a => offBy(day, a))
      const k = offs.indexOf(Math.min(...offs))
      const wrapped = anchors[k] === MONTH_END && day <= SLACK
      const month = new Date(p.date.getFullYear(), p.date.getMonth() - (wrapped ? 1 : 0), 1)
      const slot = `${month.getFullYear()}-${month.getMonth()}-${k}`
      const held = holder.get(slot)
      if (held == null) { holder.set(slot, i); return }
      const heldOff = Math.min(...anchors.map(a => offBy(dayOf(payments[held].date), a)))
      const better = offs[k] < heldOff || (offs[k] === heldOff && p.amount > payments[held].amount)
      if (better) { fit[held] = false; holder.set(slot, i) } else fit[i] = false
    })
  }
  const kept = payments.filter((_, i) => fit[i])
  if (kept.length < MIN_PAYMENTS[frequency]) return null
  const last = kept[kept.length - 1]

  // Still going? Two cycles and a few days of silence is a job that ended.
  const quiet = (startOfDay(today).getTime() - startOfDay(last.date).getTime()) / DAY_MS
  if (quiet > STREAM_CYCLE_DAYS[frequency] * 2 + 5) return null

  const amount = median(kept.slice(-6).map(p => p.amount))
  if (!(amount > 0)) return null
  /* A typical payment on each of its days - on twice-monthly pay the 15th's
     is often the smaller one, after the deductions. */
  const nearest = (/** @type {Payment} */ p) => {
    const offs = anchors.map(a => offBy(dayOf(p.date), a))
    return offs.indexOf(Math.min(...offs))
  }
  const amounts = anchors.map((_, k) => {
    const on = kept.filter(p => nearest(p) === k).slice(-3).map(p => p.amount)
    return round2(on.length ? median(on) : amount)
  })
  return { frequency, anchors, amounts, amount: round2(amount), fit, last: last.date, count: kept.length }
}

/**
 * Income streams in the ledger's history, and what arrived outside them.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.transactions
 * @param {Date} [input.now]
 * @param {number} [input.lookbackDays]
 * @param {(tx: any) => number} [input.priceOf]  a row's amount in the ledger's currency
 * @param {(tx: Record<string, any>) => boolean} [input.skip]  rows to leave out
 * @returns {{streams: IncomeStream[], occasionalPerDay: number}}
 */
export function findIncomeStreams({ transactions, now = new Date(), lookbackDays = 183, priceOf = txBase, skip }) {
  const today = startOfDay(now)
  const from = today.getTime() - lookbackDays * DAY_MS
  const nowMs = now.getTime()

  /** @type {Array<{t: Record<string, any>, at: number, amount: number}>} */
  const rows = []
  let first = Infinity
  for (const t of transactions ?? []) {
    const at = t?.date ? Date.parse(t.date) : NaN
    if (!Number.isFinite(at)) continue
    if (at < first) first = at
    if (at < from || at > nowMs) continue
    if (!isIncome(t) || isSettlement(t) || skip?.(t)) continue
    const amount = priceOf(t)
    if (!(amount > 0)) continue
    rows.push({ t, at, amount })
  }

  /** @type {Map<string, typeof rows>} */
  const byCategory = new Map()
  for (const r of rows) {
    const k = r.t.category || 'Income'
    if (!byCategory.has(k)) byCategory.set(k, [])
    byCategory.get(k)?.push(r)
  }

  /** @type {IncomeStream[]} */
  const streams = []
  const used = new Set()

  /** @param {typeof rows} group @param {string} category @param {string|null} label */
  const tryGroup = (group, category, label) => {
    // One payment per day: pay split across two accounts is still one payday.
    /** @type {Map<string, Payment>} */
    const perDay = new Map()
    for (const r of [...group].sort((a, b) => a.at - b.at)) {
      const d = startOfDay(new Date(r.at))
      const k = isoDay(d)
      const p = perDay.get(k)
      if (p) p.amount += r.amount
      else perDay.set(k, { date: d, amount: r.amount, account: r.t.account ?? null, name: r.t.description ?? '' })
    }
    const payments = [...perDay.values()]
    const rhythm = rhythmOf(payments, today)
    if (!rhythm) return false
    // Only the rows on the rhythm are this stream; the rest stay for the next try.
    const onDays = new Set(payments.filter((_, i) => rhythm.fit[i]).map(p => isoDay(p.date)))
    const mine = group.filter(r => onDays.has(isoDay(startOfDay(new Date(r.at)))))
    const names = mine.map(r => payName(r.t.description))
    const common = mostCommon(names)
    const share = names.filter(n => n === common).length / Math.max(1, names.length)
    // What the rows are called, when nearly all of them agree and it says more than the category.
    const called = label ?? (common && share >= 0.6 && common !== category.toLowerCase()
      ? mine.find(r => payName(r.t.description) === common)?.t.description?.trim()
      : null)
    const { fit: _fit, ...shape } = rhythm
    streams.push({
      key: `pay:${category}:${label ?? ''}`,
      name: called && called.length <= 28 ? called : category,
      category,
      account: mostCommon(mine.map(r => r.t.account ?? null)),
      ...shape,
    })
    for (const r of mine) used.add(r)
    return true
  }

  for (const [category, group] of byCategory) {
    tryGroup(group, category, null)
    /* What is left of the category - all of it, when it keeps no rhythm as a
       whole - may still hold something regular under a name of its own: a
       monthly commission filed under Income beside the salary. A name needs
       at least two rows to be a rhythm at all. */
    /** @type {Map<string, typeof rows>} */
    const byName = new Map()
    for (const r of group.filter(x => !used.has(x))) {
      const n = payName(r.t.description)
      if (!n) continue
      if (!byName.has(n)) byName.set(n, [])
      byName.get(n)?.push(r)
    }
    for (const [, sub] of byName) {
      if (sub.length < 2) continue
      tryGroup(sub, category, sub[0].t.description?.trim() || null)
    }
  }

  /* The rest, as a daily average over the days the ledger actually covers -
     a ledger started six weeks ago is not averaged over six months. */
  const span = Math.max(28, Math.min(lookbackDays, (today.getTime() - (Number.isFinite(first) ? first : today.getTime())) / DAY_MS))
  const occasional = rows.filter(r => !used.has(r)).reduce((s, r) => s + r.amount, 0)

  streams.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
  return { streams, occasionalPerDay: round2(occasional / span) }
}

/**
 * The dates a stream is expected on after its last payment, up to `until`,
 * each with its amount - oldest first. Dates before today are included: the
 * forecast decides what a payday that has not come in yet means.
 *
 * @param {IncomeStream} s
 * @param {Date} until
 * @returns {Array<{date: Date, amount: number}>}
 */
export function streamDates(s, until) {
  /** @type {Array<{date: Date, amount: number}>} */
  const out = []
  const last = startOfDay(s.last)
  if (s.frequency === 'weekly' || s.frequency === 'fortnightly') {
    const step = s.frequency === 'weekly' ? 7 : 14
    for (let i = 1; i < 400; i++) {
      const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() + step * i)
      if (d > until) break
      out.push({ date: d, amount: s.amount })
    }
    return out
  }
  // Monthly and twice monthly: each anchor, month by month, after the last payment.
  for (let i = 0; i < 40; i++) {
    const y = last.getFullYear(), m = last.getMonth() + i
    let past = false
    s.anchors.forEach((a, k) => {
      const d = onAnchor(y, m, a)
      /* A payment that landed early - pay on the 13th for a 15th that fell
         on a Sunday - is that anchor's, not a reason to expect it again. */
      if (d.getTime() <= last.getTime() + SLACK * DAY_MS) return
      if (d > until) { past = true; return }
      out.push({ date: d, amount: s.amounts[k] ?? s.amount })
    })
    if (past) break
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime())
}

/**
 * "Twice a month", for the settings page and the forecast's rows.
 * @param {IncomeStream} s
 */
export function rhythmLabel(s) {
  const suffix = (/** @type {number} */ d) => (d >= 11 && d <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[d % 10] ?? 'th')
  const ord = (/** @type {number} */ d) => (d === MONTH_END ? 'month end' : `the ${d}${suffix(d)}`)
  switch (s.frequency) {
    case 'weekly': return 'Every week'
    case 'fortnightly': return 'Every two weeks'
    case 'semimonthly': return `Twice a month, ${ord(s.anchors[0])} and ${ord(s.anchors[1])}`
    default: return `Monthly, around ${ord(s.anchors[0])}`
  }
}
