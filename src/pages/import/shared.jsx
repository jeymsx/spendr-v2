import { INVISIBLE } from '../../lib/nameKey'
// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * The two layouts a file can have.
 *
 * SPENDR is what Spendr itself writes - Settings > Reports & exports >
 * Transactions as CSV (settings/shared.jsx buildAndDownloadCSV). It was
 * called "legacy" and shown to people as "from an older version", which is
 * what a file Spendr made this morning looked like to the person importing it.
 *
 * TABLE is the column naming of the cloud table (tx_id, transaction_date,
 * from_account, to_account): a file taken from there, or written by hand to
 * match.
 */
// No 'synced' here on purpose. The app's own CSV export never writes that
// column, and mapSpendrRows sets synced: UNSYNCED itself rather than reading
// it - so requiring it made Spendr reject its own export file.
export const SPENDR_REQUIRED_COLS = ['txId', 'type', 'date', 'description', 'category', 'payment', 'account', 'fromAccount', 'toAccount', 'amount']
export const TABLE_REQUIRED_COLS = ['tx_id', 'type', 'transaction_date', 'description', 'category', 'from_account', 'to_account', 'amount']
/** What Spendr's export also writes, each optional: a file without them imports as before. */
export const SPENDR_OPTIONAL_COLS = [
  'refundOf', 'splitId', 'installmentId', 'toAmount', 'toCurrency',
  'currency', 'baseAmount', 'baseCurrency', 'adjust',
]
export const VALID_TYPES = new Set(['expense', 'inflow', 'transfer'])

export const TRANSFER_RE = /Transfer:\s*(.+?)\s*→\s*(.+)/

// ── Text from a file ───────────────────────────────────────────────────────────

/**
 * The longest each kind of text may be - the maxLength of the form that makes
 * it (TxDetailSheet and AddExpense for a description, AccountForm for an
 * account, CategoryForm for a category). A file is not held to less than a
 * form, and must not get more: a 5,000-character account name broke every list
 * that showed it.
 */
export const LIMITS = { description: 100, account: 40, category: 30 }

/**
 * Characters that draw nothing: the zero-width ones, the byte-order mark, the
 * word joiner and the bidi controls. A name carrying one looks the same as
 * another and is not equal to it - "Cash" and "Cash" with a zero-width space
 * were two accounts - and a bidi override can make a name read backwards.
 */
// One list of them for the whole app (lib/nameKey.js), so the forms and the importer agree on what is invisible.

/** @param {string} s */
export function stripInvisible(s) {
  return s.replace(INVISIBLE, '')
}

/**
 * At most `limit` UTF-16 units - what an input's maxLength counts - and never
 * half of an emoji.
 *
 * @param {string} s
 * @param {number} limit
 */
function cutTo(s, limit) {
  if (s.length <= limit) return s
  let cut = s.slice(0, limit)
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xD800 && last <= 0xDBFF) cut = cut.slice(0, -1)
  return cut.trimEnd()
}

/**
 * Free text as it is stored: no invisible characters, no spaces round the
 * edges, and no longer than the form allows. Inner spacing is left as written.
 *
 * @param {unknown} raw
 * @param {number} limit
 */
export function cleanText(raw, limit) {
  return cutTo(stripInvisible(String(raw ?? '')).trim(), limit)
}

/**
 * A name - an account or a category - as it is stored: cleanText, with every
 * run of spaces made one and the accents in one fixed form, so the same name
 * typed two ways is one string.
 *
 * @param {unknown} raw
 * @param {number} limit
 */
export function cleanName(raw, limit) {
  const spaced = stripInvisible(String(raw ?? '')).normalize('NFC').replace(/\s+/g, ' ').trim()
  return cutTo(spaced, limit)
}

/**
 * What two spellings of a name share when they are the same name: cleaned, and
 * in lower case.
 *
 * @param {unknown} name
 * @param {number} limit
 */
export function nameKey(name, limit) {
  return cleanName(name, limit).toLowerCase()
}

/**
 * The names a wallet already has, and the way a file's names are matched to
 * them: ignoring case, spacing and invisible characters, so "cash", "CASH " and
 * "Cash" are one account. A name the wallet lacks is spelled the way it first
 * appears in the file, and every later spelling of it follows that one.
 *
 * @param {Iterable<string>} existing
 * @param {number} limit  the longest a new name may be
 */
export function nameIndex(existing, limit) {
  /** @param {unknown} name */
  const keyOf = (name) => nameKey(name, limit)
  /** @type {Map<string, string>} */
  const old = new Map()
  /** @type {Map<string, string>} */
  const spelled = new Map()
  /** @type {Set<unknown>} */
  const exact = new Set()
  for (const name of existing) {
    const key = keyOf(name)
    exact.add(name)
    if (key && !old.has(key)) { old.set(key, name); spelled.set(key, name) }
  }
  return {
    /**
     * The spelling to store for this name: the wallet's own when it has one,
     * otherwise the first spelling the file used. Blank stays blank. A name the
     * wallet has exactly as written is that one, even in a wallet that holds
     * "Cash" and "cash" side by side.
     *
     * @param {unknown} name
     */
    pick(name) {
      if (exact.has(name)) return /** @type {string} */ (name)
      const key = keyOf(name)
      if (!key) return ''
      if (!spelled.has(key)) spelled.set(key, cleanName(name, limit))
      return /** @type {string} */ (spelled.get(key))
    },
    /**
     * The wallet's spelling of this name, or undefined when it has none.
     *
     * @param {unknown} name
     */
    known(name) {
      return old.get(keyOf(name))
    },
  }
}

/**
 * A row the importer can write. csv.js marks the ones it cannot with a
 * `problem`, and they travel with the rest so the preview can say which and why.
 *
 * @param {{problem?: string}} row
 */
export function canImport(row) {
  return !row.problem
}

export function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Icons ──────────────────────────────────────────────────────────────────────


export function IconFile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}


export function IconWarning() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export function IconArrowLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

export function IconSuccess() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

// ── Step indicator ─────────────────────────────────────────────────────────────

export function StepDots({ step }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {[1, 2, 3, 4, 5].map(s => (
        <div
          key={s}
          className={[
            'rounded-full transition-all duration-300',
            s === step
              ? 'w-6 h-2 bg-primary'
              : s < step
                ? 'w-2 h-2 bg-primary/40'
                : 'w-2 h-2 bg-slate-200 dark:bg-white/10',
          ].join(' ')}
        />
      ))}
    </div>
  )
}
