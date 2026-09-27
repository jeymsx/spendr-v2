import { cardStatements, cardUrl, CARD_LEAD_DAYS, REMINDER_HOUR, stableKey } from './reminders'
import { effectiveLimit } from './rollover'
import { currencyOfAccountName, txBase } from './fxContext'
import { fmt } from './money'
import { achievementDef } from './achievements'
import { challengeDef } from './challenges'
import { addMonths, monthKeyOf, monthName } from './recap'
import { parseDateLocal } from '../utils/recurring'
import { txMonthKey } from '../utils/txDate'
import { isFlowRow, isSpend } from './flows'

/**
 * What belongs in the notifications list, worked out from the ledger.
 *
 * ── Derived, then kept ──
 *
 * Nothing here is a log the app has to remember to write to. Every event is
 * recomputed from data the app already has - a card's statement, a bill's
 * date, a category's spending - and given an id that names it for good:
 * "budget:<category>:2026-09:80" happens once, whatever recomputes it. The
 * store (db/notifications.js) records each id the first time it appears and
 * never again, so the list keeps its history - a card paid off does not make
 * last week's "due in 3 days" vanish - without any of the thirty places that
 * write a transaction having to know notifications exist.
 *
 * ── The latest word on each thing ──
 *
 * A card has three moments - three days before, the day, the day after - and
 * a budget two. Only the one that is current is offered. Opened daily, the
 * list gets each in turn, because the store keeps what it has already been
 * given; opened for the first time in a week, it gets "is overdue" and not
 * the three-line history of how it got there.
 *
 * ── The same words and dates as the push reminders ──
 *
 * Card and bill wording matches lib/reminders.js, and the dates come from the
 * same cardStatements over the same rows, scheduled ones included - a
 * payment set for tomorrow silences both - so the lock screen and this list
 * never disagree.
 *
 * ── Only what has happened ──
 *
 * An event is offered once its time has come and for FEED_WINDOW_DAYS after.
 * "Due in 3 days" appears three days before, not the moment the statement
 * closes; an old month's budget alert is not dug up on a new phone.
 */

export const FEED_WINDOW_DAYS = 35
/** Share of a budget that earns the early warning. */
export const BUDGET_WARN_AT = 0.8

const DAY_MS = 864e5

/**
 * @typedef {'card-due'|'card-overdue'|'bill-due'|'bill-overdue'|'budget-warn'|'budget-over'|'badge'|'milestone'|'challenge'|'recap'|'whats-new'} NotificationKind
 *
 * @typedef {object} FeedItem
 * @property {string} id
 * @property {NotificationKind} kind
 * @property {string} at     ISO instant the event happened
 * @property {string} title
 * @property {string} body
 * @property {string|null} url   where tapping it goes; null for an in-place action
 * @property {boolean} [quiet]   true for news that is not news to this person -
 *   a badge written silently because it was already true - so it is kept as
 *   read rather than lighting the bell
 */

/** @param {Date} d @param {number} [days] */
const at9 = (d, days = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, REMINDER_HOUR)

/** @param {Date} d */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "Sep 24". @param {Date} d */
const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/**
 * Of a thing's moments, the last one whose time has come.
 *
 * @param {FeedItem[]} stages  in order
 * @param {number} nowMs
 * @returns {FeedItem|null}
 */
function latest(stages, nowMs) {
  let pick = null
  for (const s of stages) if (Date.parse(s.at) <= nowMs) pick = s
  return pick
}

/**
 * @param {object} input
 * @param {Array<Record<string, any>>} [input.accounts]
 * @param {Array<Record<string, any>>} [input.transactions]  every row, scheduled ones too
 * @param {Array<Record<string, any>>} [input.recurring]
 * @param {Array<Record<string, any>>} [input.categories]
 * @param {Array<{key: string, earnedAt?: string, silent?: boolean}>} [input.badges]
 * @param {Array<Record<string, any>>} [input.challenges]  stored challenge attempts
 * @param {boolean} [input.globalRollover]
 * @param {{version: string, headline: string, at: string}|null} [input.whatsNew]
 *   this release, dated when this device first had it - null when there is
 *   nothing to announce (see releaseSeenAt)
 * @param {Date} [input.now]
 * @returns {FeedItem[]}  newest first
 */
export function collectNotifications({
  accounts = [], transactions = [], recurring = [], categories = [], badges = [], challenges = [],
  globalRollover = false, whatsNew = null, now = new Date(),
} = {}) {
  const nowMs = now.getTime()
  const floor = nowMs - FEED_WINDOW_DAYS * DAY_MS
  /** @type {FeedItem[]} */
  const out = []
  /** @param {FeedItem|null} item */
  const offer = (item) => {
    const t = item ? Date.parse(item.at) : NaN
    if (item && Number.isFinite(t) && t <= nowMs && t >= floor) out.push(item)
  }

  const nowIso = now.toISOString()
  const posted = transactions.filter(t => t && (t.date ?? '') <= nowIso)

  // ── Cards ──
  for (const acct of accounts) {
    if (acct?.type !== 'credit' || !acct.dueDate) continue
    const key = stableKey(acct)
    const cur = acct.currency || currencyOfAccountName(acct.name)
    const url = cardUrl(acct)
    for (const { due, amount } of cardStatements(acct, transactions, now)) {
      const body = amount != null ? `${fmt(amount, cur)} to pay` : 'Check your statement for the amount'
      const id = `card:${key}:${ymd(due)}`
      offer(latest([
        { id: `${id}:early`, kind: 'card-due', at: at9(due, -CARD_LEAD_DAYS).toISOString(), title: `${acct.name} due in ${CARD_LEAD_DAYS} days`, body, url },
        { id: `${id}:due`, kind: 'card-due', at: at9(due).toISOString(), title: `${acct.name} due today`, body, url },
        // Only a statement with a known figure can be late; the running one has not closed.
        ...(amount != null
          ? [{ id: `${id}:overdue`, kind: /** @type {const} */ ('card-overdue'), at: at9(due, 1).toISOString(), title: `${acct.name} is overdue`, body: `${fmt(amount, cur)} left to pay`, url }]
          : []),
      ], nowMs))
    }
  }

  // ── Bills ──
  for (const bill of recurring) {
    if (!bill || bill.active === false || !bill.nextDate) continue
    const date = String(bill.nextDate).slice(0, 10)
    const d = parseDateLocal(date)
    if (!d) continue
    const key = stableKey(bill)
    const amountLine = [
      bill.amount > 0 ? fmt(bill.amount, currencyOfAccountName(bill.account)) : null,
      bill.account ? `from ${bill.account}` : null,
    ].filter(Boolean).join(' ')
    offer(latest([
      { id: `bill:${key}:${date}:due`, kind: 'bill-due', at: at9(d).toISOString(), title: `${bill.name} due today`, body: amountLine, url: '/recurring' },
      // Still not posted the day after: nextDate only moves once it is.
      { id: `bill:${key}:${date}:overdue`, kind: 'bill-overdue', at: at9(d, 1).toISOString(), title: `${bill.name} is overdue`, body: `Due ${shortDate(d)}. Post it once it's paid.`, url: '/recurring' },
    ], nowMs))
  }

  // ── Budgets: this month and last, so a crossing late on the 31st survives the 1st ──
  const thisMonth = monthKeyOf(now)
  const months = [addMonths(thisMonth, -1), thisMonth]
  for (const e of budgetCrossings({ categories, transactions: posted, months, globalRollover })) offer(e)

  // ── Badges and milestones: both stored in `badges`, told apart by their definition ──
  /* A first pass awards every level a ledger already qualifies for, at once
     and silently: a fourteen-day streak brings the three- and seven-day
     levels with it. As old news they would bury the feed in read entries, so
     of the quiet ones only each track's highest is listed. A level that was
     celebrated is news in its own right, and always is. */
  const topQuiet = new Map()
  for (const b of badges) {
    const def = achievementDef(b?.key)
    if (!b?.silent || def?.kind !== 'milestone' || !def.track) continue
    if ((def.n ?? 0) > (topQuiet.get(def.track)?.n ?? -Infinity)) topQuiet.set(def.track, def)
  }
  for (const b of badges) {
    const def = achievementDef(b?.key)
    if (!def || !b.earnedAt) continue
    const milestone = def.kind === 'milestone'
    if (b.silent && milestone && topQuiet.get(def.track)?.key !== def.key) continue
    offer({
      /* `badge:` for both, as the ids already recorded are: a key earned
         before milestones existed must not come back as a new event. */
      id: `badge:${b.key}`,
      kind: milestone ? 'milestone' : 'badge',
      at: b.earnedAt,
      title: milestone ? `Milestone: ${def.name}` : `New badge: ${def.name}`,
      body: def.blurb ?? '',
      url: `/achievements?tab=${milestone ? 'milestones' : 'badges'}`,
      ...(b.silent ? { quiet: true } : {}),
    })
  }

  // ── Challenges won ──
  for (const c of challenges) {
    const def = challengeDef(c?.key)
    if (!def || c.status !== 'won' || !c.finishedAt) continue
    offer({
      id: `challenge:${c.syncId ?? c.id}`, kind: 'challenge', at: c.finishedAt,
      title: `Challenge won: ${def.name}`, body: def.win, url: '/achievements?tab=challenges',
    })
  }

  // ── The monthly recap, from 9 on the 1st ──
  const lastMonth = months[0]
  const lastHadActivity = posted.some(t => isFlowRow(t) && txMonthKey(t.date) === lastMonth)
  if (lastHadActivity) {
    offer({
      id: `recap:${lastMonth}`, kind: 'recap',
      at: new Date(now.getFullYear(), now.getMonth(), 1, REMINDER_HOUR).toISOString(),
      // The month alone, as the push says it: the year is the one that just ended.
      title: `Your ${monthName(lastMonth)} recap is ready`,
      body: 'See how your month went',
      url: `/recap/${lastMonth}`,
    })
  }

  // ── This release ──
  if (whatsNew?.version && whatsNew.at) {
    offer({ id: `whats-new:${whatsNew.version}`, kind: 'whats-new', at: whatsNew.at, title: `What's new in Spendr ${whatsNew.version}`, body: whatsNew.headline ?? '', url: null })
  }

  return out.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
}

/**
 * The moment each budgeted category reached 80% of its limit, or went over
 * it, in each of `months` - the latest of the two, for each.
 *
 * The limit is the EFFECTIVE one, rollover included, exactly as the Budget
 * page shows it - and one that rollover has taken to nothing is over at the
 * first peso, as the Budget page shows it. The moment is the transaction
 * that crossed the line, so the alert is dated when it happened, not when the
 * app next looked. Refunds walk the running total back down, and a category
 * brought back under does not un-cross: it did reach 80%, and saying so later
 * is still true.
 *
 * One pass over the ledger, whatever the number of categories: the rows are
 * bucketed by category first, and rollover is given only its own category's
 * rows. A ledger of twenty thousand rows is walked once, not once a category.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.categories
 * @param {Array<Record<string, any>>} input.transactions  posted rows
 * @param {string[]} input.months
 * @param {boolean} [input.globalRollover]
 * @param {(tx: any) => number} [input.priceOf]
 * @returns {FeedItem[]}
 */
export function budgetCrossings({ categories, transactions, months, globalRollover = false, priceOf = txBase }) {
  const budgeted = (categories ?? []).filter(c => c && c.type !== 'inflow' && (c.budget ?? 0) > 0)
  if (!budgeted.length) return []
  const names = new Set(budgeted.map(c => c.name))

  /** @type {Map<string, Array<Record<string, any>>>} every expense, by category */
  const byCategory = new Map()
  for (const t of transactions) {
    if (!isSpend(t) || !names.has(t.category)) continue
    const list = byCategory.get(t.category) ?? []
    list.push(t)
    byCategory.set(t.category, list)
  }

  /** @type {FeedItem[]} */
  const out = []
  for (const cat of budgeted) {
    const rows = byCategory.get(cat.name) ?? []
    const key = stableKey(cat)
    for (const month of months) {
      const { effective: limit } = effectiveLimit({ cat, txs: rows, month, globalDefault: globalRollover })
      const inMonth = rows
        .filter(t => txMonthKey(t.date) === month)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))

      /** @type {FeedItem|null} */
      let warn = null
      /** @type {FeedItem|null} */
      let over = null
      let running = 0
      for (const t of inMonth) {
        running += priceOf(t)
        if (!over && running > limit + 0.004) {
          over = {
            id: `budget:${key}:${month}:over`, kind: 'budget-over', at: t.date,
            title: `Over your ${cat.name} budget`,
            body: limit > 0
              ? `${fmt(running - limit)} over ${fmt(limit)}`
              : 'Nothing left after last month\'s overspend',
            url: '/budget',
          }
          break
        }
        // One purchase that goes straight past 100% is one alert, not two.
        if (!warn && !over && limit > 0 && running >= limit * BUDGET_WARN_AT - 0.004) {
          warn = {
            id: `budget:${key}:${month}:80`, kind: 'budget-warn', at: t.date,
            title: `${cat.name} budget ${Math.round(BUDGET_WARN_AT * 100)}% used`,
            body: `${fmt(Math.max(0, limit - running))} left of ${fmt(limit)}`,
            url: '/budget',
          }
        }
      }
      const pick = over ?? warn
      if (pick) out.push(pick)
    }
  }
  return out
}

/**
 * The heading a day's notifications sit under: Today, Yesterday, a weekday
 * for the last week, then a date.
 *
 * @param {Date} d
 * @param {Date} [now]
 */
export function dayHeading(d, now = new Date()) {
  const start = (/** @type {Date} */ x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(now) - start(d)) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/**
 * Notifications in day groups, newest first, for the list.
 *
 * @template {{at: string}} T
 * @param {T[]} items
 * @param {Date} [now]
 * @returns {Array<{heading: string, items: T[]}>}
 */
export function groupByDay(items, now = new Date()) {
  /** @type {Array<{heading: string, items: T[]}>} */
  const groups = []
  const sorted = [...items].sort((a, b) => b.at.localeCompare(a.at))
  for (const item of sorted) {
    const heading = dayHeading(new Date(item.at), now)
    const last = groups[groups.length - 1]
    if (last && last.heading === heading) last.items.push(item)
    else groups.push({ heading, items: [item] })
  }
  return groups
}

/** "9:00 AM". @param {string} iso */
export const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
