import { supabase, isSupabaseConfigured } from './supabase'
import { APP_VERSION } from './release'

/**
 * Reports and ideas, sent from the app to the person who makes it.
 *
 * ── Why not email ──
 *
 * "Report a problem" used to put a report together and hand it to the share
 * sheet, to be pasted into a message to somebody - so a bug found on someone
 * else's phone reached the developer only if they also knew where to send it,
 * and an idea had nowhere to go at all. Now it goes to the cloud's `feedback`
 * table (034_feedback.sql), and the developer reads every one in Settings on
 * their own account (pages/settings/Feedback.jsx).
 *
 * ── What goes with it ──
 *
 * What the person wrote, the version, and a line on the device - phone or
 * computer, Home Screen app or browser - because "it does not work" is half a
 * report without them. The errors Spendr noticed on the device go too, but
 * only with a bug, and only when the person leaves that switched on. Who sent
 * it is filled in by the database from the account, so it can be answered.
 * None of the money - no transaction, account or balance - is ever included.
 *
 * @typedef {'bug'|'idea'|'other'} FeedbackKind
 * @typedef {'new'|'done'} FeedbackStatus
 * @typedef {{
 *   id: number, kind: FeedbackKind, message: string, app_version: string|null,
 *   device: Record<string, any>|null, error_log: Array<Record<string, any>>|null,
 *   sender_email: string|null, sender_name: string|null, status: FeedbackStatus,
 *   created_at: string, done_at: string|null,
 * }} FeedbackRow
 */

/** The table's limit on what one report may say (034). */
export const MAX_MESSAGE = 5000

/** The three kinds, in the order the form offers them. */
export const FEEDBACK_KINDS = /** @type {const} */ ([
  { value: 'bug', label: 'Bug', placeholder: 'What happened, and what did you expect?' },
  { value: 'idea', label: 'Idea', placeholder: 'What would you like Spendr to do?' },
  { value: 'other', label: 'Other', placeholder: 'What’s on your mind?' },
])

/** @param {string} kind */
export const kindLabel = (kind) => FEEDBACK_KINDS.find(k => k.value === kind)?.label ?? 'Other'

/** What the form is called, by what is being sent. @param {string} kind */
export const feedbackTitle = (kind) => (kind === 'idea' ? 'Suggest an idea' : kind === 'other' ? 'Send a message' : 'Report a bug')

/**
 * What the device is, for the report: enough to reproduce a layout bug, and
 * nothing that identifies the person (the account does that).
 *
 * @param {{doc?: any, nav?: any, win?: any}} [env]  the browser, injectable for tests
 * @returns {Record<string, any>}
 */
export function deviceInfo(env = {}) {
  const doc = env.doc ?? (typeof document === 'undefined' ? null : document)
  const nav = env.nav ?? (typeof navigator === 'undefined' ? null : navigator)
  const win = env.win ?? (typeof window === 'undefined' ? null : window)
  let standalone = false
  try {
    standalone = !!(win?.matchMedia?.('(display-mode: standalone)')?.matches || nav?.standalone)
  } catch { /* no matchMedia */ }
  return {
    layout: doc?.documentElement?.classList?.contains('web') ? 'computer' : 'phone',
    installed: standalone,
    screen: win?.screen ? `${win.screen.width}×${win.screen.height}` : null,
    language: nav?.language ?? null,
    ua: String(nav?.userAgent ?? '').slice(0, 400),
  }
}

/**
 * The device in a few words, for the inbox: "iPhone · Home Screen app",
 * "Windows · Chrome · computer layout".
 *
 * @param {Record<string, any>|null|undefined} device
 */
export function describeDevice(device) {
  if (!device) return ''
  const ua = String(device.ua ?? '')
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
        : /Macintosh/.test(ua) ? 'Mac'
          : /Windows/.test(ua) ? 'Windows'
            : /Linux/.test(ua) ? 'Linux' : ''
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
      : /Firefox|FxiOS/.test(ua) ? 'Firefox'
        : /Chrome|CriOS/.test(ua) ? 'Chrome'
          : /Safari/.test(ua) ? 'Safari' : ''
  return [
    os,
    device.installed ? 'Home Screen app' : browser,
    device.layout === 'computer' ? 'computer layout' : '',
  ].filter(Boolean).join(' · ')
}

/**
 * The errors Spendr noticed, as they go with a report: the first frames of
 * each stack, not the whole of it. The table caps the log at 60 KB.
 *
 * @param {Array<import('./crashLog').CrashEntry>} crashes
 */
export function logForReport(crashes) {
  return (crashes ?? []).slice(0, 20).map(c => ({
    message: String(c.message ?? '').slice(0, 500),
    where: c.where,
    route: c.route,
    version: c.version,
    at: c.at,
    last: c.last,
    count: c.count,
    stack: String(c.stack ?? '').split('\n').slice(0, 8).join('\n').slice(0, 1200),
  }))
}

/**
 * The row a report is sent as - or why it cannot be.
 *
 * @param {{kind: string, message: string, crashes?: Array<import('./crashLog').CrashEntry>, attachLog?: boolean, device?: Record<string, any>, version?: string}} input
 * @returns {{row: Record<string, any>} | {error: string}}
 */
export function feedbackRow({ kind, message, crashes = [], attachLog = false, device = deviceInfo(), version = APP_VERSION }) {
  const text = String(message ?? '').trim()
  if (!text) return { error: 'Write something first.' }
  if (text.length > MAX_MESSAGE) return { error: `That is over ${MAX_MESSAGE.toLocaleString('en-US')} characters. Try a shorter one.` }
  const k = FEEDBACK_KINDS.some(x => x.value === kind) ? kind : 'other'
  const log = k === 'bug' && attachLog && crashes.length ? logForReport(crashes) : null
  return { row: { kind: k, message: text, app_version: version, device, error_log: log } }
}

/** Whether this device can send a report from the app: the cloud is set up. */
export const canSendFeedback = () => isSupabaseConfigured

/**
 * Send one. Throws with words a person can read when it does not go.
 *
 * @param {Parameters<typeof feedbackRow>[0]} input
 */
export async function sendFeedback(input) {
  const built = feedbackRow(input)
  if ('error' in built) throw new Error(built.error)
  const { error } = await supabase.from('feedback').insert(built.row)
  if (!error) return
  if (/rate limit/i.test(error.message ?? '')) throw new Error('That’s a lot of reports in an hour. Try again later.')
  if (/relation .*feedback|could not find the table|schema cache/i.test(error.message ?? '')) {
    throw new Error('Reports aren’t set up on the server yet.')
  }
  throw new Error('Could not send it. Check your connection and try again.')
}

/**
 * Every report the signed-in account can read - all of them, for the
 * developer - newest first.
 *
 * @returns {Promise<FeedbackRow[]>}
 */
export async function listFeedback() {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return /** @type {FeedbackRow[]} */ (data ?? [])
}

/** How many are waiting to be read. @returns {Promise<number>} */
export async function countNewFeedback() {
  const { count, error } = await supabase
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new')
  if (error) throw new Error(error.message)
  return count ?? 0
}

/**
 * File one as done, or back as new.
 *
 * @param {number} id
 * @param {boolean} done
 */
export async function markFeedback(id, done) {
  const { error } = await supabase
    .from('feedback')
    .update({ status: done ? 'done' : 'new', done_at: done ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** @param {number} id */
export async function deleteFeedback(id) {
  const { error } = await supabase.from('feedback').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * The reply, as an email to whoever sent it.
 *
 * @param {FeedbackRow} row
 */
export function replyLink(row) {
  if (!row.sender_email) return null
  const subject = `Your Spendr ${row.kind === 'bug' ? 'bug report' : row.kind === 'idea' ? 'idea' : 'message'}`
  const quoted = row.message.split('\n').map(l => `> ${l}`).join('\n')
  return `mailto:${row.sender_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`\n\n${quoted}`)}`
}

/**
 * The same report as an email, for a device that cannot send it from the app:
 * signed out, or with no cloud set up.
 *
 * @param {{kind: string, message: string}} input
 * @param {string} to
 */
export function emailLink({ kind, message }, to) {
  const subject = `Spendr ${kind === 'bug' ? 'bug report' : kind === 'idea' ? 'idea' : 'message'} · v${APP_VERSION}`
  const body = `${String(message ?? '').trim()}\n\n${describeDevice(deviceInfo())}`
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
