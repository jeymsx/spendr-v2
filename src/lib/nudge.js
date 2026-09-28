import { isoToDateInput, toDateInput } from '../utils/txDate'

/**
 * The daily check-in: one push a day at a time you pick - "Anything to log
 * today?" - and not on a day something is already logged.
 *
 * ── It rides on the reminders ──
 *
 * Nothing new on the server. Each day's check-in is one more row in the list
 * the device already uploads (lib/reminders.js), tagged `nudge:<local date>`,
 * so the cron that sends bills sends these too and the server still never
 * reads a transaction. "Not on a day you have logged" is the device leaving
 * today's row out once there is a row dated today; the upload that follows
 * the entry withdraws it. From any device: the laptop logging lunch takes
 * the phone's 8 o'clock nudge back.
 *
 * ── Why the setting syncs ──
 *
 * The list is one per person and every signed-in device rebuilds and uploads
 * it, deleting whatever it did not build. A choice kept on the phone alone
 * would have the laptop's next upload quietly delete the phone's nudges. So
 * it is a preference like the currency - db.meta, stamped, and pushed through
 * user_preferences.daily_nudge (migration 024) - and every device builds the
 * same list. Reading and writing it is hooks/useNudge.js; this file is the
 * rules, with no database in it, so the reminder builder stays pure.
 *
 * ── Quarter hours only ──
 *
 * The sender runs every fifteen minutes. A nudge at 8:10 would wait until
 * 8:15 on the server, and an app opened in between rebuilds a list without
 * it - the time has passed - and the upload's clean-up withdraws it unsent.
 * On the quarter it is claimed at the moment it is due.
 *
 * ── The value ──
 *
 * 'HH:MM', or 'off'. Not null for off: user_preferences reads a null as
 * "never said" and would not carry a switch-off to the other devices.
 */

export const NUDGE_KEY = 'dailyNudge'
/** Eight in the evening: after the day's spending, before bed. */
export const DEFAULT_NUDGE = '20:00'
/** How far ahead check-ins are scheduled. A phone not opened for two weeks
 *  stops being nudged, which is also about when a nudge stops helping. */
export const NUDGE_DAYS = 14

const TIME = /^([01]\d|2[0-3]):(00|15|30|45)$/

/**
 * @param {unknown} value
 * @returns {{h: number, m: number} | null}  null when off or unreadable
 */
export function parseNudge(value) {
  const m = TIME.exec(typeof value === 'string' ? value : '')
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null
}

/** "8:00 PM". @param {string} value */
export function nudgeLabel(value) {
  const t = parseNudge(value) ?? parseNudge(DEFAULT_NUDGE)
  return new Date(2000, 0, 1, t?.h ?? 20, t?.m ?? 0)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** Every quarter hour of the day, as the picker offers them. */
export const NUDGE_TIMES = Array.from({ length: 96 }, (_, i) => {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0')
  return `${p(Math.floor(i / 4))}:${p((i % 4) * 15)}`
})

/* Plain, and different on different days, so the tenth one does not read
   like the ninth. Picked by the date, not at random, so a list rebuilt twice
   in a day says the same thing both times and is not uploaded again. */
const LINES = [
  { title: 'Anything to log today?', body: 'Tap to add what you spent.' },
  { title: 'Quick check-in', body: 'Spent anything today? It takes a few seconds.' },
  { title: 'Before the day ends', body: 'Log what you spent while you remember.' },
]

/**
 * The check-ins for the next NUDGE_DAYS days, as reminders.
 *
 * @param {{nudge?: unknown, transactions?: Array<Record<string, any>>, now?: Date, days?: number}} input
 * @returns {import('./reminders').Reminder[]}
 */
export function nudgeReminders({ nudge, transactions = [], now = new Date(), days = NUDGE_DAYS }) {
  const t = parseNudge(nudge)
  if (!t) return []
  const today = toDateInput(now)
  /* A row dated today is the day logged. Rows dated ahead - an
     installment's later months - are not, and do not match today anyway. */
  const loggedToday = transactions.some(tx => isoToDateInput(tx.date ?? '') === today)
  const out = []
  for (let i = 0; i < days; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, t.h, t.m, 0, 0)
    if (at.getTime() <= now.getTime()) continue
    const day = toDateInput(at)
    if (i === 0 && loggedToday) continue
    const line = LINES[(at.getDate() + at.getMonth()) % LINES.length]
    out.push({
      tag: `nudge:${day}`,
      fireAt: at.toISOString(),
      title: line.title,
      body: line.body,
      url: '/?log=quick',
    })
  }
  return out
}
