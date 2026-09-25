import { getCreditStatus } from '../utils/creditCycle'
import { statementDueDate } from './creditBills'
import { advanceNextDate, parseDateLocal } from '../utils/recurring'
import { currencyOfAccountName } from './fxContext'
import { fmt } from './money'

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
 *
 * All at 9 in the morning, local time, which is stored as an absolute instant
 * so the server needs no idea what time zone anybody is in.
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

/** @param {Date} d */
const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

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

/**
 * @typedef {object} Reminder
 * @property {string} tag
 * @property {string} fireAt  ISO instant
 * @property {string} title
 * @property {string} body
 * @property {string} url     where tapping it opens the app
 */

/**
 * @param {object} input
 * @param {Array<Record<string, any>>} [input.accounts]
 * @param {Array<Record<string, any>>} [input.transactions]
 * @param {Array<Record<string, any>>} [input.recurring]
 * @param {Date} [input.now]
 * @returns {Reminder[]}
 */
export function buildReminders({ accounts = [], transactions = [], recurring = [], now = new Date() } = {}) {
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
    const s = getCreditStatus(/** @type {any} */ (acct), transactions, now)
    const key = stableKey(acct)
    const url = `/accounts?open=${encodeURIComponent(acct.name)}`

    /* The closed statement, with the figure it still wants - and the one
       running now, as it stands. Its amount is not known until it closes,
       so it is not stated; by then the app has usually been opened and this
       list rebuilt with the real one. */
    const statements = []
    if (s.stmtOutstanding > 0) {
      statements.push({ due: statementDueDate(s.cycleEnd, acct.dueDate), amount: s.stmtOutstanding })
    }
    /* `carried` is signed on purpose: paying ahead of the cutoff leaves it
       negative, and that credit comes off the next statement - so a card
       paid in full before the statement closes has nothing to remind about. */
    if (s.carried + s.nextStatementTotal > 0) {
      statements.push({ due: statementDueDate(s.nextCycleEnd, acct.dueDate), amount: null })
    }

    for (const { due, amount } of statements) {
      if (!due) continue
      const body = amount != null
        ? `${fmt(amount, acct.currency || currencyOfAccountName(acct.name))} left to pay on this statement.`
        : `Your statement is due ${shortDate(due)}. Check it for the amount.`
      push({
        tag: `card:${key}:${ymd(due)}:early`,
        fireAt: at9(due, -CARD_LEAD_DAYS).toISOString(),
        title: `${acct.name} payment due in ${CARD_LEAD_DAYS} days`,
        body,
        url,
      })
      push({
        tag: `card:${key}:${ymd(due)}:due`,
        fireAt: at9(due).toISOString(),
        title: `${acct.name} payment due today`,
        body,
        url,
      })
    }
  }

  for (const bill of recurring) {
    if (!bill || bill.active === false || !bill.nextDate) continue
    const key = stableKey(bill)
    const cur = currencyOfAccountName(bill.account)
    const body = [
      bill.amount > 0 ? fmt(bill.amount, cur) : null,
      bill.account ? `from ${bill.account}` : null,
    ].filter(Boolean).join(' ') || 'Due today.'

    let date = String(bill.nextDate).slice(0, 10)
    // Bounded: a daily bill across the horizon is the most there can be.
    for (let i = 0; i < HORIZON_DAYS + 1; i++) {
      const d = parseDateLocal(date)
      if (!d || d.getTime() > until) break
      push({
        tag: `bill:${key}:${date}`,
        fireAt: at9(d).toISOString(),
        title: `${bill.name} is due today`,
        body,
        url: '/recurring',
      })
      const next = advanceNextDate(date, bill.frequency)
      if (!next || next <= date) break
      date = next
    }
  }

  return out
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.tag.localeCompare(b.tag))
    .slice(0, MAX_REMINDERS)
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
