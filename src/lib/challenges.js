import { addDays, dayKey, daysBetween } from './achievements'
import { isoToDateInput } from '../utils/txDate'
import { getFxContext, txBase } from './fxContext'
import { effectiveLimit } from './rollover'
import { fmt } from './money'
import { isIncome, isSpend } from './flows'

/**
 * Challenges: something you choose to take on, for a set time.
 *
 * ── What makes one fair ──
 *
 * Every challenge has a window you can see before you start - a day, a
 * weekend, a week, the rest of the month - and a rule the ledger can check on
 * its own. Two more rules keep the ledger honest about what it cannot see:
 *
 *   A day SETTLES once the day after it is over. The day after is when
 *   yesterday's spending gets logged; until it ends, a quiet day is only quiet
 *   so far. So nothing is won on a day that could still turn out otherwise,
 *   and nothing is missed for a day you could still fill in.
 *
 *   A day has to be VOUCHED FOR, as in the no-spend streak: Spendr open that
 *   day or the next, or anything logged on it. A day with no expenses is
 *   exactly what a day you never opened the app looks like, and a challenge
 *   must not be won by walking away from it.
 *
 * ── Won as soon as it is certain, missed as soon as it is certain ──
 *
 * A "reach" challenge (seven days logged, five quiet days) is won the moment
 * it gets there - on settled days. A "stay under" one (a cap, a budget) can
 * only be won once its window has settled, because until then it can still be
 * lost - but it is missed the moment it goes over, rather than letting you
 * hope for four more days.
 *
 * ── Stored ──
 *
 * One row per attempt, in `challenges` (see db/db.js v13 and 021). A missed
 * challenge can be taken on again; that is a new row, so the history of both
 * attempts is kept.
 */

/**
 * @typedef {object} ChallengeCtx
 * @property {any[]} transactions
 * @property {any[]} [categories]
 * @property {boolean} [globalRollover]
 * @property {string[]} [activeDays]   days the app was open - see lib/achievements.js
 * @property {Date} today
 */

/**
 * @typedef {object} Judged
 * @property {'active'|'won'|'lost'} status
 * @property {number} value
 * @property {number} target
 * @property {string} progress   "3 of 7 days", "₱420 of ₱1,000"
 * @property {boolean} [money]   value and target are amounts
 * @property {boolean} [settling]  there, provisionally: it is won once today is over
 * @property {string} [subject]  what a challenge with a setting is about: a cap's category
 */

/**
 * @typedef {object} ChallengeDef
 * @property {string} key
 * @property {string} name
 * @property {string} blurb     what it asks, in a sentence
 * @property {string} win       what winning it says about you
 * @property {string} length    "1 day", "7 days", "This month"
 * @property {string} glyph
 * @property {string} tone
 * @property {(ctx: ChallengeCtx) => {ok: boolean, why?: string}} available
 * @property {(ctx: ChallengeCtx) => Record<string, any>} defaults
 * @property {(ctx: ChallengeCtx, params: Record<string, any>) => {startDay: string, endDay: string, params: Record<string, any>}} plan
 * @property {(ctx: ChallengeCtx, row: ChallengeRow) => Judged} judge
 */

/**
 * @typedef {object} ChallengeRow
 * @property {number} [id]
 * @property {string} [syncId]
 * @property {string} key
 * @property {Record<string, any>} [params]
 * @property {string} startDay
 * @property {string} endDay
 * @property {'active'|'won'|'lost'|'quit'} status
 * @property {string} [startedAt]
 * @property {string|null} [finishedAt]
 */

// ── The ledger, by day ──────────────────────────────────────────────────────

/** @typedef {{spend: Map<string, {total: number, byCat: Map<string, number>}>, logged: Set<string>, months: Map<string, {inflow: number, expense: number}>}} Ledger */

/**
 * One pass over the ledger per version of it. Every challenge ever attempted
 * is judged on every change, and the catalogue asks the same questions again
 * for what it offers - without this, each of them walked every transaction.
 * Keyed on the array, which a live query replaces whenever anything changes,
 * and on the currency snapshot the amounts were converted with.
 *
 * @type {WeakMap<object, {fx: object, ledger: Ledger}>}
 */
const LEDGERS = new WeakMap()

/**
 * What was spent each day, and on what; and which days had anything logged.
 * Refunds are not spending - a day with only a refund on it is quiet - and
 * each expense counts at its value in the ledger's own currency.
 *
 * Rows dated ahead are in it too: an installment's later payments are spending
 * already committed to, and a no-spend day planned on one is lost before it
 * starts.
 *
 * @param {any[]} transactions
 * @returns {Ledger}
 */
export function ledgerByDay(transactions) {
  const list = transactions ?? []
  const fx = getFxContext()
  const hit = LEDGERS.get(list)
  if (hit && hit.fx === fx) return hit.ledger

  /** @type {Ledger['spend']} */
  const spend = new Map()
  const logged = new Set()
  /** @type {Ledger['months']} */
  const months = new Map()
  for (const t of list) {
    const d = isoToDateInput(t?.date ?? '')
    if (!d) continue
    logged.add(d)
    const m = months.get(d.slice(0, 7)) ?? { inflow: 0, expense: 0 }
    const amt = txBase(t)
    // A balance correction or an investment's value moving is neither (lib/flows.js).
    if (isIncome(t)) m.inflow += amt
    else if (isSpend(t)) m.expense += amt
    months.set(d.slice(0, 7), m)
    if (!isSpend(t) || !(amt > 0)) continue
    const day = spend.get(d) ?? { total: 0, byCat: new Map() }
    day.total += amt
    day.byCat.set(t.category, (day.byCat.get(t.category) ?? 0) + amt)
    spend.set(d, day)
  }
  const ledger = { spend, logged, months }
  LEDGERS.set(list, { fx, ledger })
  return ledger
}

/** @param {Ledger} L @param {string} from @param {string} to inclusive @param {string} [category] */
function spentBetween(L, from, to, category) {
  let sum = 0
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = L.spend.get(d)
    if (!day) continue
    sum += category ? (day.byCat.get(category) ?? 0) : day.total
  }
  return Math.round(sum * 100) / 100
}

/** Whether `day` has settled: the day after it is over. @param {string} day @param {string} now */
const settled = (day, now) => addDays(day, 1) < now

/**
 * Whether a day is vouched for: the app open that day or the next, or
 * anything logged on it. Today counts as open - it is, or nothing would be
 * judging.
 *
 * @param {ChallengeCtx} ctx
 * @returns {(day: string) => boolean}
 */
function voucher(ctx) {
  const open = new Set(ctx.activeDays ?? [])
  open.add(dayKey(ctx.today))
  const L = ledgerByDay(ctx.transactions)
  return (d) => open.has(d) || open.has(addDays(d, 1)) || L.logged.has(d)
}

/** Every day from `from` to `to` passes. @param {string} from @param {string} to @param {(d: string) => boolean} test */
function everyDay(from, to, test) {
  for (let d = from; d <= to; d = addDays(d, 1)) if (!test(d)) return false
  return true
}

/** The last day of the month `day` is in. @param {string} day */
function monthEnd(day) {
  const [y, m] = day.split('-').map(Number)
  return dayKey(new Date(y, m, 0))
}

/** A figure people would pick themselves: 50s, 100s, 500s. @param {number} x */
export function niceAmount(x) {
  const step = x >= 10000 ? 500 : x >= 1000 ? 100 : 50
  return Math.max(step, Math.round(x / step) * step)
}

/** @param {number} n @param {string} one @param {string} [many] */
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Saturday". @param {string} day */
const weekday = (day) => new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })

/** A challenge that runs for a month starts this month only with a week of it left. @param {string} now */
function monthWindow(now) {
  const end = monthEnd(now)
  if (daysBetween(now, end) >= 6) return { startDay: now, endDay: end }
  const next = addDays(end, 1)
  return { startDay: next, endDay: monthEnd(next) }
}

/**
 * The verdict on a "stay under" challenge from the one thing that can be
 * certain early - it has gone over - and, once the window has settled, from
 * whether every day of it was kept track of.
 *
 * @param {ChallengeCtx} ctx @param {ChallengeRow} row @param {boolean} over
 * @returns {{status: 'active'|'won'|'lost', settling: boolean, untracked: boolean}}
 */
function stayUnder(ctx, row, over) {
  const now = dayKey(ctx.today)
  if (over) return { status: 'lost', settling: false, untracked: false }
  if (!settled(row.endDay, now)) return { status: 'active', settling: now > row.endDay, untracked: false }
  const tracked = everyDay(row.startDay, row.endDay, voucher(ctx))
  return { status: tracked ? 'won' : 'lost', settling: false, untracked: !tracked }
}

/**
 * The category a cap is on, by its syncId when it has one: renaming a
 * category rewrites its transactions to the new name, and a cap still looking
 * for the old one would find nothing spent and call the week won.
 *
 * @param {any[]|undefined} categories @param {Record<string, any>|undefined} params
 */
function capCategory(categories, params) {
  const id = params?.categoryId
  const found = id ? (categories ?? []).find(c => c?.syncId === id) : null
  return String(found?.name ?? params?.category ?? '')
}

// ── The challenges ──────────────────────────────────────────────────────────

/** @type {ChallengeDef[]} */
export const CHALLENGES = [
  {
    key: 'no-spend-day',
    name: 'No-Spend Day',
    blurb: 'Get through one whole day without spending anything.',
    win: 'A full day without spending a peso.',
    length: '1 day',
    glyph: 'nospend',
    tone: 'lime',
    available: () => ({ ok: true }),
    defaults: () => ({}),
    /* Today, unless today already has spending in it - then the first day
       after it with none scheduled either. */
    plan: ({ transactions, today }) => {
      const L = ledgerByDay(transactions)
      let day = dayKey(today)
      for (let i = 0; i < 31 && L.spend.has(day); i++) day = addDays(day, 1)
      return { startDay: day, endDay: day, params: {} }
    },
    judge: (ctx, row) => {
      const now = dayKey(ctx.today)
      const spent = ledgerByDay(ctx.transactions).spend.has(row.startDay)
      const v = stayUnder(ctx, row, spent)
      const progress = v.status === 'won' ? 'Nothing spent'
        : v.status === 'lost' ? (spent ? 'Spent that day' : 'Went untracked')
          : now < row.startDay ? 'Not started' : now > row.endDay ? 'Nothing spent' : 'Nothing spent yet'
      return { status: v.status, settling: v.settling, value: v.status === 'won' || v.settling ? 1 : 0, target: 1, progress }
    },
  },
  {
    key: 'no-spend-weekend',
    name: 'No-Spend Weekend',
    blurb: 'Keep Saturday and Sunday completely free of spending.',
    win: 'A whole weekend without spending a peso.',
    length: 'A weekend',
    glyph: 'calendar',
    tone: 'teal',
    available: () => ({ ok: true }),
    defaults: () => ({}),
    /* This weekend if it is Saturday and nothing is spent yet; otherwise the
       next one - skipping any with spending already scheduled on it. Starting
       on a Sunday would be half a weekend. */
    plan: ({ transactions, today }) => {
      const now = dayKey(today)
      const dow = today.getDay()
      const L = ledgerByDay(transactions)
      let start = dow === 6 && !L.spend.has(now) ? now : addDays(now, (6 - dow + 7) % 7 || 7)
      for (let i = 0; i < 8 && (L.spend.has(start) || L.spend.has(addDays(start, 1))); i++) start = addDays(start, 7)
      return { startDay: start, endDay: addDays(start, 1), params: {} }
    },
    judge: (ctx, row) => {
      const now = dayKey(ctx.today)
      const L = ledgerByDay(ctx.transactions)
      const days = [row.startDay, row.endDay]
      const spent = days.some(d => L.spend.has(d))
      const vouched = voucher(ctx)
      const quiet = days.filter(d => d < now && !L.spend.has(d) && vouched(d)).length
      const v = stayUnder(ctx, row, spent)
      return {
        status: v.status, settling: v.settling, value: v.status === 'won' ? 2 : quiet, target: 2,
        progress: now < row.startDay ? `Starts ${weekday(row.startDay)}` : v.untracked ? 'Went untracked' : `${v.status === 'won' ? 2 : quiet} of 2 days`,
      }
    },
  },
  {
    key: 'quiet-five',
    name: 'Five Quiet Days',
    blurb: 'Rack up five days without spending in the next two weeks.',
    win: 'Five days without spending, inside two weeks.',
    length: '14 days',
    glyph: 'nospend',
    tone: 'emerald',
    available: () => ({ ok: true }),
    defaults: () => ({}),
    plan: ({ today }) => {
      const now = dayKey(today)
      return { startDay: now, endDay: addDays(now, 13), params: {} }
    },
    /* Won on its fifth SETTLED quiet day; missed once too few days are left
       that could still be quiet - a day already spent on cannot be. */
    judge: (ctx, row) => {
      const now = dayKey(ctx.today)
      const L = ledgerByDay(ctx.transactions)
      const vouched = voucher(ctx)
      let won = 0, sofar = 0, open = 0
      for (let d = row.startDay; d <= row.endDay; d = addDays(d, 1)) {
        const quiet = !L.spend.has(d)
        if (settled(d, now)) { if (quiet && vouched(d)) { won++; sofar++ } }
        else if (quiet) { open++; if (d < now && vouched(d)) sofar++ }
      }
      const status = won >= 5 ? 'won' : won + open < 5 ? 'lost' : 'active'
      const shown = Math.min(status === 'won' ? won : sofar, 5)
      return { status, settling: status === 'active' && sofar >= 5, value: shown, target: 5, progress: `${shown} of 5 days` }
    },
  },
  {
    key: 'log-seven',
    name: 'Seven Straight',
    blurb: 'Log something every day for the next seven days.',
    win: 'Seven days in a row, every one of them on the books.',
    length: '7 days',
    glyph: 'flame',
    tone: 'orange',
    available: () => ({ ok: true }),
    defaults: () => ({}),
    plan: ({ today }) => {
      const now = dayKey(today)
      return { startDay: now, endDay: addDays(now, 6), params: {} }
    },
    /* Logging can only be added to, so seven days on the books is won the
       moment it happens. A day is missed only once the day after it is over:
       Tuesday's lunch logged on Wednesday morning still counts for Tuesday. */
    judge: ({ transactions, today }, row) => {
      const now = dayKey(today)
      const L = ledgerByDay(transactions)
      let done = 0
      let missed = false
      for (let d = row.startDay; d <= row.endDay && d <= now; d = addDays(d, 1)) {
        if (L.logged.has(d)) done++
        else if (settled(d, now)) missed = true
      }
      const status = done >= 7 ? 'won' : missed ? 'lost' : 'active'
      return { status, value: done, target: 7, progress: `${done} of 7 days` }
    },
  },
  {
    key: 'category-cap',
    name: 'Category Cap',
    blurb: 'Keep one category under a limit you pick, for a week.',
    win: 'A week under the cap you set yourself.',
    length: '7 days',
    glyph: 'gauge',
    tone: 'blue',
    available: (ctx) => (topCategory(ctx) ? { ok: true } : { ok: false, why: 'Log a few weeks of spending first.' }),
    /* The category you spend most on lately, capped at four-fifths of a
       normal week of it - a stretch, not a fantasy. */
    defaults: (ctx) => {
      const top = topCategory(ctx)
      return top ? { category: top.name, cap: niceAmount((top.total / 4) * 0.8) } : { category: '', cap: 0 }
    },
    plan: ({ today, categories }, params) => {
      const now = dayKey(today)
      const cat = (categories ?? []).find(c => c?.name === params.category && c?.type !== 'inflow')
      return {
        startDay: now, endDay: addDays(now, 6),
        params: { category: params.category, categoryId: cat?.syncId ?? null, cap: Math.max(1, Number(params.cap) || 0) },
      }
    },
    judge: (ctx, row) => {
      const now = dayKey(ctx.today)
      const L = ledgerByDay(ctx.transactions)
      const cap = Number(row.params?.cap) || 0
      const category = capCategory(ctx.categories, row.params)
      const spent = spentBetween(L, row.startDay, now < row.endDay ? now : row.endDay, category)
      // Anything already scheduled inside the window counts against it too.
      const committed = spentBetween(L, row.startDay, row.endDay, category)
      const v = stayUnder(ctx, row, committed > cap)
      return {
        status: v.status, settling: v.settling, value: spent, target: cap, money: true, subject: category,
        progress: v.untracked ? 'Went untracked' : `${fmt(spent)} of ${fmt(cap)}`,
      }
    },
  },
  {
    key: 'spend-less',
    name: 'Less Than Last Week',
    blurb: 'Spend less over the next seven days than you did in the last seven.',
    win: 'A week that cost less than the one before it.',
    length: '7 days',
    glyph: 'trendDown',
    tone: 'cyan',
    /* Not when there is nothing to beat, and not when today has already spent
       more than the whole of last week - that one is lost before it starts. */
    available: (ctx) => {
      const now = dayKey(ctx.today)
      const L = ledgerByDay(ctx.transactions)
      const last = spentBetween(L, addDays(now, -7), addDays(now, -1))
      if (!(last > 0)) return { ok: false, why: 'Nothing was spent last week to beat.' }
      if (spentBetween(L, now, addDays(now, 6)) >= last) return { ok: false, why: 'This week has already spent more than all of the last one.' }
      return { ok: true }
    },
    defaults: () => ({}),
    plan: ({ transactions, today }) => {
      const now = dayKey(today)
      const target = spentBetween(ledgerByDay(transactions), addDays(now, -7), addDays(now, -1))
      return { startDay: now, endDay: addDays(now, 6), params: { target } }
    },
    judge: (ctx, row) => {
      const now = dayKey(ctx.today)
      const L = ledgerByDay(ctx.transactions)
      const target = Number(row.params?.target) || 0
      const spent = spentBetween(L, row.startDay, now < row.endDay ? now : row.endDay)
      const committed = spentBetween(L, row.startDay, row.endDay)
      const v = stayUnder(ctx, row, committed >= target)
      return {
        status: v.status, settling: v.settling, value: spent, target, money: true,
        progress: v.untracked ? 'Went untracked' : `${fmt(spent)} of ${fmt(target)}`,
      }
    },
  },
  {
    key: 'keep-month',
    name: 'Keep Some Back',
    blurb: 'End the month with an amount you pick left over from what came in.',
    win: 'A month that ended with money kept.',
    length: 'This month',
    glyph: 'coins',
    tone: 'gold',
    available: () => ({ ok: true }),
    /* A tenth of a usual month's income, from the last three that had any. */
    defaults: ({ transactions, today }) => {
      const L = ledgerByDay(transactions)
      const now = dayKey(today).slice(0, 7)
      const incomes = [...L.months.entries()].filter(([k, v]) => k < now && v.inflow > 0).sort().slice(-3).map(([, v]) => v.inflow)
      const avg = incomes.length ? incomes.reduce((a, b) => a + b, 0) / incomes.length : 10000
      return { amount: niceAmount(avg * 0.1) }
    },
    plan: ({ today }, params) => ({ ...monthWindow(dayKey(today)), params: { amount: Math.max(1, Number(params.amount) || 0) } }),
    /* Income can still arrive on the 30th, so nothing is certain before the
       month has settled; then it is kept or it is not. */
    judge: (ctx, row) => {
      const L = ledgerByDay(ctx.transactions)
      const m = L.months.get(row.startDay.slice(0, 7)) ?? { inflow: 0, expense: 0 }
      const kept = Math.round((m.inflow - m.expense) * 100) / 100
      const amount = Number(row.params?.amount) || 0
      const v = stayUnder(ctx, row, false)
      const status = v.status === 'won' && kept < amount ? 'lost' : v.status
      return {
        status, settling: v.settling && kept >= amount, value: Math.max(0, kept), target: amount, money: true,
        progress: v.untracked ? 'Went untracked' : `${fmt(Math.max(0, kept))} of ${fmt(amount)}`,
      }
    },
  },
  {
    key: 'budget-month',
    name: 'Inside Every Limit',
    blurb: 'Keep every category with a limit under it until the month ends.',
    win: 'A month inside every limit you set.',
    length: 'This month',
    glyph: 'target',
    tone: 'indigo',
    available: (ctx) => {
      if (limited(ctx.categories).length < 2) return { ok: false, why: 'Set limits on two categories first.' }
      /* Already over this month, a month-long attempt starting today is lost
         before it begins. */
      const win = monthWindow(dayKey(ctx.today))
      if (win.startDay === dayKey(ctx.today) && judgeBudgetMonth(ctx, { key: 'budget-month', status: 'active', ...win }).status === 'lost') {
        return { ok: false, why: 'A limit is already passed this month.' }
      }
      return { ok: true }
    },
    defaults: () => ({}),
    plan: ({ today }) => ({ ...monthWindow(dayKey(today)), params: {} }),
    judge: (ctx, row) => judgeBudgetMonth(ctx, row),
  },
]

/** @param {ChallengeCtx} ctx @param {ChallengeRow} row @returns {Judged} */
function judgeBudgetMonth(ctx, row) {
  const { transactions, categories, globalRollover = false, today } = ctx
  const now = dayKey(today)
  const month = row.startDay.slice(0, 7)
  const cats = limited(categories)
  let inside = 0
  for (const cat of cats) {
    const rows = transactions.filter(t => isSpend(t) && t.category === cat.name)
    const { effective } = effectiveLimit({ cat, txs: rows, month, globalDefault: globalRollover })
    const spent = rows
      .filter(t => (isoToDateInput(t.date ?? '') || '').slice(0, 7) === month && isoToDateInput(t.date ?? '') <= now)
      .reduce((s, t) => s + txBase(t), 0)
    if (spent <= effective + 0.004) inside++
  }
  const v = stayUnder(ctx, row, now >= row.startDay && inside < cats.length)
  return {
    status: v.status, settling: v.settling, value: inside, target: cats.length,
    progress: v.untracked ? 'Went untracked' : `${inside} of ${plural(cats.length, 'limit')} kept`,
  }
}

/** @param {any[]} [categories] */
function limited(categories) {
  return (categories ?? []).filter(c => c && c.type !== 'inflow' && (c.budget ?? 0) > 0)
}

/** Days in four weeks a category must be bought from to count as everyday spending: more than once a week. */
const EVERYDAY_DAYS = 5

/**
 * The category most spent on over the last four weeks, and how much.
 *
 * Among the ones bought from on more than one day a week, when there are
 * any: a cap is a challenge on everyday spending. The electricity bill is
 * often the biggest category of the month, and it is paid once - a week
 * under a cap on it is a week it was never going to be paid in.
 *
 * @param {ChallengeCtx} ctx
 */
export function topCategory({ transactions, categories, today }) {
  const now = dayKey(today)
  const L = ledgerByDay(transactions)
  /** @type {Map<string, number>} */
  const totals = new Map()
  /** @type {Map<string, number>} */
  const days = new Map()
  for (let d = addDays(now, -28); d < now; d = addDays(d, 1)) {
    for (const [cat, amt] of L.spend.get(d)?.byCat ?? []) {
      totals.set(cat, (totals.get(cat) ?? 0) + amt)
      days.set(cat, (days.get(cat) ?? 0) + 1)
    }
  }
  const known = new Set((categories ?? []).filter(c => c?.type !== 'inflow').map(c => c.name))
  const ranked = [...totals.entries()]
    .filter(([name, total]) => total > 0 && (!known.size || known.has(name)))
    .sort((a, b) => b[1] - a[1])
  const everyday = ranked.filter(([name]) => (days.get(name) ?? 0) >= EVERYDAY_DAYS)
  const best = (everyday.length ? everyday : ranked)[0]
  return best ? { name: best[0], total: best[1] } : null
}

const BY_KEY = new Map(CHALLENGES.map(c => [c.key, c]))

/** @param {string} key */
export function challengeDef(key) {
  return BY_KEY.get(key) ?? null
}

/** At most this many running at once: three is a stretch, six is a to-do list. */
export const MAX_ACTIVE = 3

/**
 * Where a stored attempt stands. An active one is judged on today; a finished
 * one keeps the verdict it was given, and is judged as it stood the day it
 * finished - so a given-up week does not go on counting the days logged after
 * it was given up, and a missed day is not described in today's words.
 *
 * @param {ChallengeRow} row
 * @param {ChallengeCtx} ctx
 * @returns {Judged | null}  null for a challenge this version does not know
 */
export function judgeChallenge(row, ctx) {
  const def = challengeDef(row.key)
  if (!def) return null
  try {
    if (row.status === 'active') return def.judge(ctx, row)
    const ended = row.finishedAt ? new Date(row.finishedAt) : null
    const asOf = ended && !Number.isNaN(ended.getTime()) && ended < ctx.today ? ended : ctx.today
    const judged = def.judge({ ...ctx, today: asOf }, row)
    return { ...judged, settling: false, status: row.status === 'quit' ? 'lost' : row.status }
  } catch (e) {
    console.warn('[challenges] %s could not be judged:', row.key, e)
    return null
  }
}

/**
 * How long is left, in words: "Starts Saturday", "Ends today", "3 days left",
 * and for the day after a window closes, while it settles, "Settles tonight".
 *
 * @param {ChallengeRow} row
 * @param {Date} today
 */
export function timeLeft(row, today) {
  const now = dayKey(today)
  if (now < row.startDay) {
    const n = daysBetween(now, row.startDay)
    return n === 1 ? 'Starts tomorrow' : `Starts ${weekday(row.startDay)}`
  }
  if (now > row.endDay) return 'Settles tonight'
  const n = daysBetween(now, row.endDay)
  return n <= 0 ? 'Ends today' : n === 1 ? '1 day left' : `${n} days left`
}
