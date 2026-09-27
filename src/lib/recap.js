import { isoToDateInput, txMonthKey } from '../utils/txDate'
import { txBase } from './fxContext'
import { roundMoney } from './currency'
import { effectiveLimit } from './rollover'
import { netWorthMoves } from './trend'
import { achievementDef } from './achievements'
import { isAdjustment, isFlowRow, isIncome, isSpend } from './flows'
import { LOAN_INTEREST } from './loans'

/**
 * A month, looked back on: every figure the monthly recap shows.
 *
 * ── One pure function, and the screen only draws it ──
 *
 * The recap is the most-read screen this app will have and the one where a
 * wrong number would be noticed - it is literally "what did I spend". So
 * none of the arithmetic lives in a component. It is here, in one function
 * with no clock, no database and no DOM, and the tests exercise it against
 * the months people actually have: a first month started on the 20th, one
 * with no income logged, one where refunds outweighed spending, one in two
 * currencies.
 *
 * ── The same rules as the rest of the app ──
 *
 *   A month is the LOCAL calendar month (txMonthKey) - the same one Budget,
 *   the dashboard and Insights use.
 *
 *   Spent is every expense, refunds included as the negative amounts they
 *   are stored as - the Budget page's figure for the same month. Income is
 *   every inflow. Transfers are neither: moving money between your own
 *   accounts, card payments included, is not spending it.
 *
 *   Every amount is in the ledger's currency, through `priceOf` - txBase, the
 *   figure priced on the day the row was written.
 *
 *   Rows dated after `now` are scheduled, not spent, and are left out.
 *
 * ── What was bought is not the same as what was spent ──
 *
 * Totals count every expense row. "Purchases" - the count, the biggest one,
 * the place you kept going back to - count only things someone bought: a
 * split purchase is one purchase, a refund is not one, and the rows the app
 * writes by itself (a transfer's fee, a debt settled, a balance corrected)
 * are spending without being anywhere you went.
 */

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0')

/** "2026-09" for a local date. @param {Date} d */
export function monthKeyOf(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** @param {string} key "2026-09" */
export function parseMonth(key) {
  const [y, m] = String(key).split('-').map(Number)
  return { year: y, month: m - 1 }
}

/** The key `n` months on (negative for back). @param {string} key @param {number} n */
export function addMonths(key, n) {
  const { year, month } = parseMonth(key)
  return monthKeyOf(new Date(year, month + n, 1))
}

/** @param {string} key */
export function daysInMonth(key) {
  const { year, month } = parseMonth(key)
  return new Date(year, month + 1, 0).getDate()
}

/** "September". @param {string} key */
export function monthName(key) {
  return MONTH_NAMES[parseMonth(key).month] ?? ''
}

/** How many days into a month last month's Wrapped leads on Home, before it moves to Insights. */
export const WRAPPED_HOME_DAYS = 3

/**
 * Whether this is still the start of a month, when last month's Wrapped leads
 * on Home. Here rather than with the recap's copy because Home asks it on
 * every load, and this module is already in the first bundle - the copy is
 * not, and should not be for one comparison.
 *
 * @param {Date} [now]
 */
export function wrappedOnHome(now = new Date()) {
  return now.getDate() <= WRAPPED_HOME_DAYS
}

/** "September", or "September 2025" when it is not this year. @param {string} key @param {Date} [now] */
export function monthLabel(key, now = new Date()) {
  const { year } = parseMonth(key)
  return year === now.getFullYear() ? monthName(key) : `${monthName(key)} ${year}`
}

/** Money that actually came or went - not a balance correction or an
 *  investment's value moving (lib/flows.js). @param {Record<string, any>} tx */
const isFlow = (tx) => isFlowRow(tx)

/** The local day of the month a row falls on; 0 for a row with no usable date. @param {Record<string, any>} tx */
const dayOf = (tx) => Number(isoToDateInput(tx.date).slice(8, 10)) || 0

/** A label people typed, folded so "Jollibee" and "jollibee " are one place. @param {string} s */
const foldLabel = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Categories the app files its own rows under. */
const MACHINE_CATEGORIES = new Set(['Transfer Fee', 'Debt Payment', 'Debt Collection', LOAN_INTEREST])

/**
 * Something someone bought: an expense with a price, that is not a refund
 * and not a row the app wrote by itself - a transfer's fee, a debt paid or
 * collected (those carry `settles`), a balance corrected by hand.
 *
 * @param {Record<string, any>} t
 */
function isPurchase(t) {
  return t.type === 'expense' && (t.amount ?? 0) > 0 && !t.refundOf && !t.settles
    && !MACHINE_CATEGORIES.has(t.category) && !isAdjustment(t)
}

/**
 * Every month the recap can be shown for: complete, and with something in
 * it. Newest first.
 *
 * @param {Array<Record<string, any>>} transactions
 * @param {Date} [now]
 */
export function recapMonths(transactions, now = new Date()) {
  const current = monthKeyOf(now)
  const nowIso = now.toISOString()
  const keys = new Set()
  for (const t of transactions ?? []) {
    if (!isFlow(t) || (t.date ?? '') > nowIso) continue
    const k = txMonthKey(t.date)
    if (k && k < current) keys.add(k)
  }
  return [...keys].sort().reverse()
}

/**
 * @typedef {object} Recap
 * @property {string} month          "2026-09"
 * @property {string} label          "September"
 * @property {number} days           days in the month
 * @property {boolean} hasActivity   anything spent or received at all
 * @property {boolean} firstMonth    nothing was logged before this month
 * @property {number} spent          net of refunds - below zero when refunds outweighed it
 * @property {number} purchases      what was bought, before refunds
 * @property {number} refunded       what came back in refunds, as a positive figure
 * @property {number} purchaseCount  things bought - a split purchase once
 * @property {number} income
 * @property {number} net            income - spent
 * @property {number|null} savingsRate  net / income, when there was income
 * @property {{month: string, label: string, spent: number, income: number, hasActivity: boolean, partial: boolean}} prev
 * @property {{pct: number, ratio: number, direction: 'less'|'more'|'same'}|null} spentChange
 * @property {Array<{name: string, amount: number, share: number, color: string|null, icon: string|null}>} categories
 * @property {Array<{name: string, amount: number, share: number}>} incomeSources
 * @property {Array<{day: number, amount: number}>} daily
 * @property {number} trackedDays    days counted - from the first purchase, in a first month
 * @property {{day: number, amount: number}|null} busiestDay
 * @property {number} noSpendDays
 * @property {number} avgPerDay
 * @property {{description: string, category: string, icon: string|null, amount: number, day: number}|null} biggest
 * @property {{label: string, count: number, amount: number, icon: string|null}|null} goTo
 * @property {{tracked: number, under: number, rows: Array<{name: string, icon: string|null, limit: number, spent: number, over: boolean}>}|null} budgets
 * @property {{start: number, end: number, change: number, series: Array<{day: number, value: number}>}|null} netWorth
 * @property {Array<{key: string, name: string}>} badges
 */

/**
 * @param {object} input
 * @param {string} input.month
 * @param {Array<Record<string, any>>} [input.transactions]  every row, not just the month's
 * @param {Array<Record<string, any>>} [input.categories]
 * @param {Array<{key: string, earnedAt?: string}>} [input.badges]
 * @param {number|null} [input.netWorthNow]  today's net worth, in the ledger's currency
 * @param {string} [input.currency]          the ledger's currency, for rounding
 * @param {(tx: any) => number} [input.priceOf]  a row's value in the ledger's currency
 * @param {boolean} [input.globalRollover]
 * @param {Date} [input.now]
 * @param {Array<Record<string, any>>} [input.debts]  counted when includeDebts
 * @param {boolean} [input.includeDebts]
 * @returns {Recap}
 */
export function buildRecap({
  month, transactions = [], categories = [], badges = [], netWorthNow = null,
  currency = 'PHP', priceOf = txBase, globalRollover = false, now = new Date(),
  debts = [], includeDebts = false,
}) {
  /* `priceOf`, not `valueOf`: destructuring a key named valueOf finds
     Object.prototype.valueOf on every object, so its default never applied. */
  const money = (/** @type {number} */ v) => roundMoney(v, currency)
  const nowIso = now.toISOString()
  const posted = transactions.filter(t => t && (t.date ?? '') <= nowIso)
  const inMonth = (/** @type {string} */ key) => posted.filter(t => isFlow(t) && txMonthKey(t.date) === key)
  const total = (/** @type {any[]} */ list) => money(list.reduce((s, t) => s + priceOf(t), 0))
  /* Anything logged before `key` began. A row with no usable date is not
     "before" anything - '' sorts ahead of every month key. */
  const startedBefore = (/** @type {string} */ key) =>
    posted.some(t => { const k = isFlow(t) ? txMonthKey(t.date) : ''; return !!k && k < key })

  const rows = inMonth(month)
  const expenses = rows.filter(isSpend)
  const inflows = rows.filter(isIncome)

  const spent = total(expenses)
  const income = total(inflows)
  const net = money(income - spent)
  const purchases = total(expenses.filter(t => priceOf(t) > 0))
  const refunded = money(-total(expenses.filter(t => priceOf(t) < 0)))
  const firstMonth = !startedBefore(month)

  /* Last month was the first, and began after its 1st: a week of it is not
     a month to measure this one against. */
  const prevKey = addMonths(month, -1)
  const prevRows = inMonth(prevKey)
  const prev = {
    month: prevKey,
    label: monthLabel(prevKey, now),
    spent: total(prevRows.filter(isSpend)),
    income: total(prevRows.filter(isIncome)),
    hasActivity: prevRows.length > 0,
    partial: prevRows.length > 0 && !startedBefore(prevKey) && firstPurchaseDay(prevRows) > 1,
  }

  // ── Where it went ──
  /** @type {Map<string, number>} */
  const byCat = new Map()
  for (const t of expenses) {
    const name = t.category || 'Uncategorized'
    byCat.set(name, (byCat.get(name) ?? 0) + priceOf(t))
  }
  const catMeta = new Map(categories.map(c => [c.name, c]))
  /** The emoji the category was given, for the slides to draw it by. @param {string} name */
  const iconOf = (name) => catMeta.get(name)?.icon ?? null
  const spending = shares([...byCat].map(([name, amount]) => ({ name, amount: money(amount) })))
    .map(c => ({ ...c, color: catMeta.get(c.name)?.color ?? null, icon: iconOf(c.name) }))

  /** @type {Map<string, number>} */
  const bySource = new Map()
  for (const t of inflows) {
    const name = t.category || 'Other income'
    bySource.set(name, (bySource.get(name) ?? 0) + priceOf(t))
  }
  const incomeSources = shares([...bySource].map(([name, amount]) => ({ name, amount: money(amount) })))

  // ── Day by day ──
  const days = daysInMonth(month)
  const perDay = new Array(days).fill(0)
  for (const t of expenses) {
    const d = dayOf(t)
    if (d >= 1 && d <= days) perDay[d - 1] += priceOf(t)
  }
  const daily = perDay.map((v, i) => ({ day: i + 1, amount: money(v) }))
  /* A no-spend day is one whose spending came to nothing - so a purchase
     returned the same day leaves it one, and the chart saying "Nothing spent"
     and the count agree.

     In a first month, the days before the first purchase are days before the
     app, not days nothing was bought, so they are not counted as no-spend
     days and not in the average either. The first PURCHASE, not the first
     row: a salary back-dated to the 1st by someone who started on the 20th
     does not make the 1st to the 19th days they were keeping track. */
  const firstBuy = firstPurchaseDay(expenses)
  const startDay = firstMonth && firstBuy <= days ? firstBuy : 1
  const trackedDays = rows.length ? days - startDay + 1 : 0
  const busiestDay = daily.reduce(
    (best, d) => (d.amount > 0 && (!best || d.amount > best.amount) ? d : best),
    /** @type {{day: number, amount: number}|null} */ (null))
  const noSpendDays = rows.length ? daily.slice(startDay - 1).filter(d => !(d.amount > 0)).length : 0

  const bought = purchasesIn(expenses, priceOf)

  return {
    month,
    label: monthLabel(month, now),
    days,
    hasActivity: rows.length > 0,
    firstMonth,
    spent,
    purchases,
    refunded,
    purchaseCount: bought.length,
    income,
    net,
    savingsRate: income > 0 ? net / income : null,
    prev,
    spentChange: prev.partial ? null : change(spent, prev.spent, prev.hasActivity),
    categories: spending,
    incomeSources,
    daily,
    trackedDays,
    busiestDay,
    noSpendDays,
    avgPerDay: trackedDays > 0 ? money(Math.max(0, spent) / trackedDays) : 0,
    biggest: biggestPurchase(bought, money, iconOf),
    goTo: goToPlace(bought, money, iconOf),
    budgets: budgetSummary({ categories, posted, month, byCat, globalRollover, money }),
    // Every row, scheduled ones too: see netWorthOver.
    netWorth: netWorthOver({ month, transactions, netWorthNow, priceOf, money, debts, includeDebts }),
    badges: badgesIn(badges, month),
  }
}

/**
 * The day of the month of the first purchase among `rows`, or 32 - past the
 * end of any month - when there is none.
 *
 * @param {any[]} rows
 */
function firstPurchaseDay(rows) {
  let first = 32
  for (const t of rows) if (isPurchase(t) && dayOf(t) > 0) first = Math.min(first, dayOf(t))
  return first
}

/**
 * Positive amounts only, largest first, each with its share of their total.
 * A category that came out net NEGATIVE - refunds exceeding purchases - is
 * money back, not spending, and has no place in "where it went".
 *
 * @template {{name: string, amount: number}} T
 * @param {T[]} list
 * @returns {Array<T & {share: number}>}
 */
function shares(list) {
  const kept = list.filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
  const sum = kept.reduce((s, c) => s + c.amount, 0)
  return kept.map(c => ({ ...c, share: sum > 0 ? c.amount / sum : 0 }))
}

/**
 * This month's spending against last month's. Null when there is nothing
 * fair to compare with: no activity last month, nothing spent in it, or
 * refunds that left this month below nothing.
 *
 * Within 3% either way is "about the same" - a 1% swing is noise, and
 * calling it "1% less" invites a reading it cannot bear. "Less" stops at 99%
 * while anything at all was spent: 100% less means nothing.
 *
 * @param {number} now
 * @param {number} before
 * @param {boolean} hadActivity
 */
function change(now, before, hadActivity) {
  if (!hadActivity || !(before > 0) || now < 0) return null
  const ratio = now / before
  const pct = (ratio - 1) * 100
  /** @type {'same'|'less'|'more'} */
  const direction = Math.abs(pct) < 3 ? 'same' : pct < 0 ? 'less' : 'more'
  const rounded = Math.round(Math.abs(pct))
  return { pct: direction === 'less' && now > 0 ? Math.min(99, rounded) : rounded, ratio, direction }
}

/**
 * The month's purchases, one entry per thing bought, at what each really
 * cost once the month's refunds of it are taken off.
 *
 * A split purchase is ONE purchase stored as several rows - one per category
 * - so its legs are added back together. A refund comes off what it
 * refunds, which is how a ₱6,000 order returned in full stops being the
 * headline. Only refunds within the month: this is the month's story, and a
 * return in the next one must not quietly redraw it after it was saved.
 *
 * @param {any[]} expenses   the month's
 * @param {(tx: any) => number} priceOf
 * @returns {Array<{place: string, description: string, category: string, amount: number, day: number}>}
 */
function purchasesIn(expenses, priceOf) {
  /** @type {Map<string, number>} refunded, by the purchase's txId */
  const refunded = new Map()
  for (const r of expenses) {
    if (r.refundOf) refunded.set(r.refundOf, (refunded.get(r.refundOf) ?? 0) - priceOf(r))
  }

  /** @type {Map<string, {labels: Set<string>, typed: string, categories: string[], amount: number, day: number}>} */
  const bought = new Map()
  for (const t of expenses) {
    if (!isPurchase(t)) continue
    const key = t.splitId ? `split:${t.splitId}` : `tx:${t.txId ?? t.id}`
    const typed = String(t.description ?? '').trim()
    const p = bought.get(key) ?? { labels: new Set(), typed, categories: [], amount: 0, day: dayOf(t) }
    p.amount += priceOf(t) - (t.txId ? (refunded.get(t.txId) ?? 0) : 0)
    p.labels.add(foldLabel(typed))
    if (t.category && !p.categories.includes(t.category)) p.categories.push(t.category)
    bought.set(key, p)
  }

  return [...bought.values()].map(p => {
    /* A split whose legs all carry one description was described; one whose
       legs each carry their own category's name was not (postSplitExpense
       fills an empty description in per leg), and is named by what it was
       split into instead. */
    const described = p.labels.size === 1 && !!p.typed
    return {
      place: described ? foldLabel(p.typed) : '',
      description: described ? p.typed : (p.categories.slice(0, 3).join(' + ') || 'A purchase'),
      category: p.categories[0] || 'Uncategorized',
      amount: p.amount,
      day: p.day,
    }
  })
}

/**
 * The single largest thing bought, after the month's refunds of it.
 *
 * @param {ReturnType<typeof purchasesIn>} bought
 * @param {(v: number) => number} money
 * @param {(category: string) => string|null} iconOf
 */
function biggestPurchase(bought, money, iconOf) {
  let best = null
  for (const p of bought) {
    if (p.amount > 0.004 && (!best || p.amount > best.amount)) best = p
  }
  return best
    ? { description: best.description, category: best.category, icon: iconOf(best.category), amount: money(best.amount), day: best.day }
    : null
}

/**
 * The place you kept going back to: the description that turns up most,
 * three times or more. A split purchase counts once; a visit refunded in
 * full was not really one, and one partly refunded counts at what it cost.
 * It wears the emoji of the category it was filed under most often.
 *
 * @param {ReturnType<typeof purchasesIn>} bought
 * @param {(v: number) => number} money
 * @param {(category: string) => string|null} iconOf
 */
function goToPlace(bought, money, iconOf) {
  /** @type {Map<string, {count: number, amount: number, spellings: Map<string, number>, categories: Map<string, number>}>} */
  const seen = new Map()
  for (const p of bought) {
    if (!p.place || !(p.amount > 0.004)) continue
    const e = seen.get(p.place) ?? { count: 0, amount: 0, spellings: new Map(), categories: new Map() }
    e.count += 1
    e.amount += p.amount
    e.spellings.set(p.description, (e.spellings.get(p.description) ?? 0) + 1)
    e.categories.set(p.category, (e.categories.get(p.category) ?? 0) + 1)
    seen.set(p.place, e)
  }

  let best = null
  for (const e of seen.values()) {
    if (e.count < 3) continue
    if (!best || e.count > best.count || (e.count === best.count && e.amount > best.amount)) best = e
  }
  if (!best) return null
  /** The most frequent key of a tally, ties by name. @param {Map<string, number>} tally */
  const mostOf = (tally) => [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
  // Shown the way it was typed most often.
  return { label: mostOf(best.spellings), count: best.count, amount: money(best.amount), icon: iconOf(mostOf(best.categories)) }
}

/**
 * Each budgeted category against its limit for the month - the EFFECTIVE
 * limit, with anything rolled over from earlier months, exactly as the
 * Budget page would have shown it on the last day of that month.
 *
 * Budgets are not kept per month, so this uses the limits as they are now.
 * For most people they are the ones they had.
 *
 * A category whose refunds outweighed its spending shows as nothing spent:
 * "−₱1,000 of ₱3,000" is true, and reads as broken.
 *
 * @param {object} input
 * @param {any[]} input.categories
 * @param {any[]} input.posted
 * @param {string} input.month
 * @param {Map<string, number>} input.byCat
 * @param {boolean} input.globalRollover
 * @param {(v: number) => number} input.money
 */
function budgetSummary({ categories, posted, month, byCat, globalRollover, money }) {
  const budgeted = categories.filter(c => c && c.type !== 'inflow' && (c.budget ?? 0) > 0)
  if (!budgeted.length) return null
  const rows = budgeted.map(c => {
    const { effective } = effectiveLimit({ cat: c, txs: posted, month, globalDefault: globalRollover })
    const spent = money(Math.max(0, byCat.get(c.name) ?? 0))
    return { name: c.name, icon: c.icon ?? null, limit: effective, spent, over: spent > effective }
  }).sort((a, b) => Number(b.over) - Number(a.over) || (b.spent - b.limit) - (a.spent - a.limit))
  return { tracked: rows.length, under: rows.filter(r => !r.over).length, rows }
}

/**
 * Net worth at the end of every day of the month, walked back from today's
 * figure the same way the Insights chart walks it: take off everything that
 * happened after each point. Null without a figure for today to start from.
 *
 * Every row, scheduled ones included. Today's figure already counts them -
 * a card's balance includes the installments written ahead for it - so they
 * come off first, exactly as the Insights sweep takes them off, or every
 * point of the month would sit lower by their sum.
 *
 * With "Count debts" on, the same debt movements the Insights chart uses:
 * see netWorthMoves in lib/trend.js.
 *
 * @param {object} input
 * @param {string} input.month
 * @param {any[]} input.transactions
 * @param {number|null} input.netWorthNow
 * @param {(tx: any) => number} input.priceOf
 * @param {(v: number) => number} input.money
 * @param {any[]} [input.debts]
 * @param {boolean} [input.includeDebts]
 */
function netWorthOver({ month, transactions, netWorthNow, priceOf, money, debts = [], includeDebts = false }) {
  if (netWorthNow == null || !Number.isFinite(netWorthNow)) return null
  const { year, month: m } = parseMonth(month)
  const days = daysInMonth(month)

  const moves = netWorthMoves({ txs: transactions.filter(Boolean), debts, includeDebts, priceOf })
    .map(x => ({ t: x.t, d: x.delta }))
    .sort((a, b) => b.t - a.t)

  // Instants to read the figure at, latest first: the end of each day, then
  // the moment before the month began.
  const endOf = (/** @type {number} */ d) => new Date(year, m, d + 1).getTime() - 1
  const instants = [...Array.from({ length: days }, (_, i) => endOf(days - i)), new Date(year, m, 1).getTime() - 1]

  let running = netWorthNow
  let i = 0
  const values = instants.map(at => {
    while (i < moves.length && moves[i].t > at) { running -= moves[i].d; i++ }
    return running
  })
  const start = money(values[values.length - 1])
  const series = values.slice(0, days).reverse().map((v, idx) => ({ day: idx + 1, value: money(v) }))
  const end = series[series.length - 1].value
  return { start, end, change: money(end - start), series }
}

/**
 * The badges that belong to this month.
 *
 * Most are earned the moment they happen. The ones that judge a whole month
 * - a green month, a month inside every limit - can only be awarded once that
 * month is over, so they are stamped in the month after it and belong to the
 * month they judged.
 *
 * @param {Array<{key: string, earnedAt?: string}>} badges
 * @param {string} month
 */
function badgesIn(badges, month) {
  /** @type {Array<{key: string, name: string}>} */
  const out = []
  for (const b of badges ?? []) {
    const def = achievementDef(b?.key)
    const earned = b?.earnedAt ? txMonthKey(b.earnedAt) : ''
    if (!def || !earned) continue
    if ((def.judgesMonth ? addMonths(earned, -1) : earned) === month) out.push({ key: b.key, name: def.name })
  }
  return out
}
