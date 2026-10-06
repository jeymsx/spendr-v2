import { getCreditStatus } from '../utils/creditCycle'
import { statementDueDate } from './creditBills'
import { advanceNextDate, parseDateLocal } from '../utils/recurring'
import { currencyOfAccountName } from './fxContext'
import { fmt } from './money'
import { txMonthKey } from '../utils/txDate'
import { addMonths, monthKeyOf, monthName, parseMonth } from './recap'
import { isFlowRow } from './flows'
import { loanStatus } from './loans'
import { nudgeReminders } from './nudge'
import { spendingRows } from '../utils/installments'

/**
 * The reminders a ledger is owed, worked out on the device.
 *
 * ── Why the phone decides and the server only delivers ──
 *
 * A reminder that fires while the app is closed has to be sent by a server -
 * an iPhone will not let a web app schedule a notification of its own. The
 * obvious design has that server read the ledger and decide what is due. It
 * would mean a second copy of the card-cycle rules, in another language, on
 * another machine, drifting from this one - the due-date bug that was just
 * fixed would have had two places to be fixed in.
 *
 * So the rules stay here. The device turns the ledger into a short list -
 * when, and what to say - and uploads only that. The server's whole job is
 * "send the ones whose time has come", and it never reads a transaction.
 *
 * ── What is reminded ──
 *
 *   A card payment, three days before its due date and on the day, while the
 *   statement still has something owing. Both the statement that has closed
 *   and the one now running, so a phone that is not opened for a month still
 *   hears about next month's.
 *
 *   A bill, on the day it is due, for every occurrence inside the horizon.
 *   Income that arrives on a schedule is not reminded - there is nothing to do.
 *
 *   A loan's payment, three days before and on the day, until it is paid.
 *
 *   The month's recap, on the 1st - once there is anything in the month to
 *   look back on.
 *
 *   The daily check-in, if it is on: at the time chosen, on each day nothing
 *   has been logged by then (lib/nudge.js).
 *
 * All at 9 in the morning, local time, except the check-in - stored as an
 * absolute instant, so the server needs no idea what time zone anybody is in.
 *
 * ── Tags ──
 *
 * Each reminder has a tag that names it for good: the card or bill, the due
 * date, and which of the reminders for it this is. Re-uploading the same list
 * changes nothing; a card paid off drops its tags and the server forgets them.
 * The tag is also the notification's own tag, so a reminder delivered twice
 * replaces itself instead of stacking.
 */

/** The hour a reminder goes off, local time. */
export const REMINDER_HOUR = 9
/** How far ahead to schedule. Longer than a month, so every monthly bill and
 *  the next card statement are always in it. */
export const HORIZON_DAYS = 40
/** A ledger with a daily bill would otherwise schedule forty of them. */
export const MAX_REMINDERS = 60
/** Days before a card's due date for the early warning. */
export const CARD_LEAD_DAYS = 3

const DAY_MS = 864e5

/** @param {Date} d @param {number} [days] */
function at9(d, days = 0) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, REMINDER_HOUR, 0, 0, 0)
}

/** @param {Date} d */
function ymd(d) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * A short id that is safe in a URL and a PostgREST filter: the stable sync id
 * when the record has one, else a hash of its name. Names are free text -
 * commas, quotes, brackets - and a tag goes into an `in (...)` list.
 *
 * @param {{syncId?: string|null, name?: string, id?: number}} rec
 */
export function stableKey(rec) {
  if (rec?.syncId && /^[0-9a-z-]+$/i.test(rec.syncId)) return rec.syncId.toLowerCase()
  let h = 0x811c9dc5
  for (const ch of String(rec?.name ?? rec?.id ?? '')) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `n${h.toString(16)}`
}

/** Where a card's reminder or notification opens. @param {Record<string, any>} acct */
export const cardUrl = (acct) => `/accounts?open=${encodeURIComponent(acct.name)}`

/**
 * The statements a card still has to be paid for, and when.
 *
 * The closed statement, with the figure it still wants - and the one running
 * now, as it stands. The running one's amount is not known until it closes,
 * so it is null; by then the app has usually been opened and the figure is
 * the real one.
 *
 * Shared by push reminders and the in-app notifications, so the two can
 * never disagree about when a card is due.
 *
 * @param {Record<string, any>} acct   a credit account with a due day
 * @param {Array<Record<string, any>>} transactions
 * @param {Date} now
 * @returns {Array<{due: Date, amount: number|null}>}
 */
export function cardStatements(acct, transactions, now) {
  const s = getCreditStatus(/** @type {any} */ (acct), transactions, now)
  const out = []
  if (s.stmtOutstanding > 0) {
    const due = statementDueDate(s.cycleEnd, acct.dueDate)
    if (due) out.push({ due, amount: s.stmtOutstanding })
  }
  /* `carried` is signed on purpose: paying ahead of the cutoff leaves it
     negative, and that credit comes off the next statement - so a card paid
     in full before the statement closes has nothing to remind about. */
  if (s.carried + s.nextStatementTotal > 0) {
    const due = statementDueDate(s.nextCycleEnd, acct.dueDate)
    if (due) out.push({ due, amount: null })
  }
  return out
}

/**
 * @typedef {object} Reminder
 * @property {string} tag
 * @property {string} fireAt  ISO instant
 * @property {string} title
 * @property {string} body
 * @property {string} url     where tapping it opens the app
 */

/** Soonest first, and a fixed order within the same minute. @param {Reminder} a @param {Reminder} b */
const byTime = (a, b) => a.fireAt.localeCompare(b.fireAt) || a.tag.localeCompare(b.tag)

/**
 * @param {object} input
 * @param {Array<Record<string, any>>} [input.accounts]
 * @param {Array<Record<string, any>>} [input.transactions]
 * @param {Array<Record<string, any>>} [input.recurring]
 * @param {unknown} [input.nudge]  the daily check-in's time, 'HH:MM', or off
 * @param {Date} [input.now]
 * @returns {Reminder[]}
 */
export function buildReminders({ accounts = [], transactions = [], recurring = [], nudge = null, now = new Date() } = {}) {
  const until = now.getTime() + HORIZON_DAYS * DAY_MS
  /** @type {Reminder[]} */
  const out = []
  /** @param {Reminder} r */
  const push = (r) => {
    const t = new Date(r.fireAt).getTime()
    if (t > now.getTime() && t <= until) out.push(r)
  }

  for (const acct of accounts) {
    if (acct?.type !== 'credit' || !acct.dueDate) continue
    const key = stableKey(acct)
    const url = cardUrl(acct)

    /* Short on purpose. A lock screen shows two lines, and the phone already
       labels it Spendr - so the title is the card and when, and the line
       under it is the one figure that matters. */
    for (const { due, amount } of cardStatements(acct, transactions, now)) {
      const body = amount != null
        ? `${fmt(amount, acct.currency || currencyOfAccountName(acct.name))} to pay`
        : 'Check your statement for the amount'
      push({
        tag: `card:${key}:${ymd(due)}:early`,
        fireAt: at9(due, -CARD_LEAD_DAYS).toISOString(),
        title: `${acct.name} due in ${CARD_LEAD_DAYS} days`,
        body,
        url,
      })
      push({
        tag: `card:${key}:${ymd(due)}:due`,
        fireAt: at9(due).toISOString(),
        title: `${acct.name} due today`,
        body,
        url,
      })
    }
  }

  /* A loan's payment, three days before and on the day - the same two a card
     gets, worded the same way, until this month's is paid. */
  for (const acct of accounts) {
    if (acct?.type !== 'loan' || !acct.dueDate || !(acct.minimumPayment > 0)) continue
    const s = loanStatus(acct, transactions, now)
    if (!s.nextDue || !(s.owed > 0.005) || !s.next) continue
    const key = stableKey(acct)
    const body = `${fmt(s.next.amount, acct.currency || currencyOfAccountName(acct.name))} to pay`
    const url = acct.id != null ? `/accounts/${acct.id}` : '/accounts'
    push({ tag: `loan:${key}:${ymd(s.nextDue)}:early`, fireAt: at9(s.nextDue, -CARD_LEAD_DAYS).toISOString(), title: `${acct.name} due in ${CARD_LEAD_DAYS} days`, body, url })
    push({ tag: `loan:${key}:${ymd(s.nextDue)}:due`, fireAt: at9(s.nextDue).toISOString(), title: `${acct.name} due today`, body, url })
  }

  for (const bill of recurring) {
    // Bills only - income that arrives on a schedule has nothing to remind.
    if (!bill || bill.active === false || !bill.nextDate || bill.type === 'inflow') continue
    const key = stableKey(bill)
    const cur = currencyOfAccountName(bill.account)
    const body = [
      bill.amount > 0 ? fmt(bill.amount, cur) : null,
      bill.account ? `from ${bill.account}` : null,
    ].filter(Boolean).join(' ')

    let date = String(bill.nextDate).slice(0, 10)
    // Bounded: a daily bill across the horizon is the most there can be.
    for (let i = 0; i < HORIZON_DAYS + 1; i++) {
      const d = parseDateLocal(date)
      if (!d || d.getTime() > until) break
      push({
        tag: `bill:${key}:${date}`,
        fireAt: at9(d).toISOString(),
        title: `${bill.name} due today`,
        body,
        url: '/recurring',
      })
      const next = advanceNextDate(date, bill.frequency)
      if (!next || next <= date) break
      date = next
    }
  }

  /* This month's recap, due on the 1st of the next - and last month's too,
     until 9 on the 1st has passed. Without it, opening the app at 7 on the
     1st rebuilt a list that no longer had the recap about to go out, and the
     upload's clean-up withdrew it from the server two hours before it fired.
     push() drops it once its time is past. */
  const nowIso = now.toISOString()
  /** @type {Reminder[]} */
  const recaps = []
  for (const month of [addMonths(monthKeyOf(now), -1), monthKeyOf(now)]) {
    const logged = spendingRows(transactions).some(t =>
      isFlowRow(t) && (t.date ?? '') <= nowIso && txMonthKey(t.date) === month)
    if (!logged) continue
    const { year, month: m } = parseMonth(month)
    const fireAt = new Date(year, m + 1, 1, REMINDER_HOUR)
    if (fireAt.getTime() <= now.getTime() || fireAt.getTime() > until) continue
    recaps.push({
      tag: `recap:${month}`,
      fireAt: fireAt.toISOString(),
      title: `Your ${monthName(month)} recap is ready`,
      body: 'See how your month went',
      url: `/recap/${month}`,
    })
  }

  /* The daily check-in, when it is on (lib/nudge.js): two weeks of them,
     today's left out once today has something logged. */
  const nudges = nudgeReminders({ nudge, transactions, now })

  /* The cap is for a ledger of daily bills. It must not cost the one
     reminder a month that is not a bill, so the recaps are kept outside it -
     and the check-ins, which were asked for by name and must neither be
     crowded out by bills nor crowd a bill out. */
  return [
    ...out.sort(byTime).slice(0, MAX_REMINDERS - recaps.length),
    ...recaps,
    ...nudges,
  ].sort(byTime)
}

/**
 * A fingerprint of a reminder list, so an unchanged one is not uploaded
 * again. Order-independent because buildReminders sorts.
 *
 * @param {Reminder[]} list
 */
export function reminderDigest(list) {
  let h = 0x811c9dc5
  for (const ch of JSON.stringify(list)) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${list.length}:${h.toString(16)}`
}
