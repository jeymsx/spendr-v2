/**
 * What went wrong, kept on the device until somebody chooses to send it.
 *
 * ── Why not an error-monitoring service ──
 *
 * The usual answer is Sentry or similar, and here it would be the wrong one.
 * The privacy policy promises no analytics and no telemetry, and a crash
 * reporter is telemetry: it sends a stack trace, a URL and a device profile to
 * a third party every time something breaks, without asking. Adding one would
 * quietly make that promise untrue.
 *
 * So errors are recorded HERE, on the phone that had them, and they leave it
 * only when somebody taps Share or Copy in Settings. When my brother says "it
 * broke on my Android", there is now something to ask him for.
 *
 * ── Why localStorage and not Dexie ──
 *
 * Because some of what this must record is Dexie failing. A quota error, a
 * corrupted store, a version upgrade that throws - the log that is supposed to
 * describe those cannot live inside the thing that just broke. localStorage is
 * synchronous, separate, and still works when IndexedDB does not.
 *
 * ── It must never throw ──
 *
 * It runs inside error handlers. An exception from here would be raised while
 * handling another one and replace the report of the real problem with a
 * report of this. Every storage access is wrapped, and a failure to record is
 * silently a failure to record.
 */

const KEY = 'spendr-crash-log'

/** Enough to see a pattern, few enough that the log cannot grow without bound. */
export const MAX_ENTRIES = 20

/** A stack is useful for its first frames; the tail is framework plumbing. */
const MAX_STACK = 2000

/**
 * Browser noise that is not a crash and would bury the ones that are.
 *
 * ResizeObserver's loop warning fires on ordinary layout and breaks nothing.
 * "Script error." is what the browser reports for an error in a cross-origin
 * script it will not describe, so it carries no information at all.
 */
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
]

/**
 * @typedef {object} CrashEntry
 * @property {string} at        ISO, the first time this was seen
 * @property {string} last      ISO, the most recent time
 * @property {number} count     consecutive repeats, collapsed into one entry
 * @property {string} where     'render' | 'error' | 'promise'
 * @property {string} message
 * @property {string} stack
 * @property {string} route     the path the app was on
 * @property {string} version   the app version that crashed
 * @property {string} device    the user agent, which is what an Android bug needs
 */

/** @returns {CrashEntry[]} */
function load() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** @param {CrashEntry[]} entries */
function save(entries) {
  try { localStorage.setItem(KEY, JSON.stringify(entries)) } catch { /* full, or private mode */ }
}

/** @param {unknown} err */
function describe(err) {
  if (err instanceof Error) return { message: err.message || err.name, stack: err.stack ?? '' }
  if (typeof err === 'string') return { message: err, stack: '' }
  try { return { message: JSON.stringify(err), stack: '' } } catch { return { message: String(err), stack: '' } }
}

/**
 * Record one error.
 *
 * The same error repeating back to back - a render loop, a timer that keeps
 * failing - is folded into a single entry with a count, so one runaway fault
 * cannot push every other report out of a twenty-row log.
 *
 * @param {unknown} err
 * @param {'render'|'error'|'promise'} where
 * @param {{version?: string, extra?: string}} [opts]
 * @returns {CrashEntry|null}  what was written, or null if it was ignored
 */
export function recordCrash(err, where, opts = {}) {
  try {
    const { message, stack } = describe(err)
    if (!message || IGNORE.some(re => re.test(message))) return null

    const now = new Date().toISOString()
    const fullStack = [stack, opts.extra].filter(Boolean).join('\n').slice(0, MAX_STACK)
    const entries = load()
    const head = entries[0]

    if (head && head.message === message && head.where === where) {
      head.count = (head.count ?? 1) + 1
      head.last = now
      save(entries)
      return head
    }

    /** @type {CrashEntry} */
    const entry = {
      at: now,
      last: now,
      count: 1,
      where,
      message: message.slice(0, 500),
      stack: fullStack,
      route: typeof location !== 'undefined' ? location.pathname : '',
      version: opts.version ?? '',
      device: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    }
    save([entry, ...entries].slice(0, MAX_ENTRIES))
    return entry
  } catch {
    return null
  }
}

/** Newest first. @returns {CrashEntry[]} */
export function readCrashes() {
  return load()
}

export function clearCrashes() {
  try { localStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}

/**
 * The log as plain text, for pasting into a message.
 *
 * Plain text rather than JSON because the person reading it is a human first
 * - it goes into a chat - and a developer second.
 *
 * @param {CrashEntry[]} entries
 */
export function crashReport(entries) {
  if (!entries.length) return 'No errors recorded.'
  const lines = [`Spendr error report - ${entries.length} error${entries.length === 1 ? '' : 's'}`, '']
  for (const e of entries) {
    lines.push(`• ${e.message}`)
    lines.push(`  ${e.where} on ${e.route || '/'} · v${e.version || '?'} · ${e.at}${e.count > 1 ? ` · ×${e.count}` : ''}`)
    if (e.stack) lines.push(e.stack.split('\n').slice(0, 6).map(l => `    ${l.trim()}`).join('\n'))
    lines.push('')
  }
  lines.push(entries[0]?.device ?? '')
  return lines.join('\n').trim()
}
