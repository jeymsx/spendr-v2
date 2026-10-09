import Papa from 'papaparse'
import { UNSYNCED } from '../../db/db'
import { SPENDR_REQUIRED_COLS, TABLE_REQUIRED_COLS, TRANSFER_RE, LIMITS, cleanText, cleanName, stripInvisible } from './shared'

/**
 * ── A row the importer cannot trust is not written ──
 *
 * The reading below used to be `parseFloat(row.amount) || 0` and a date passed
 * through as it came, so "1,234.50" became 1, "abc" became a row of nothing, a
 * type of "debit" became a transaction with no account, and 2026-02-30 moved
 * money on a day that does not exist. A value that cannot be read is now a
 * `problem` on its row - the reason, in words - and the row travels with the
 * rest so the preview can list it. runImport leaves those rows out and writes
 * the others; nothing is guessed to keep a row alive.
 *
 * @typedef {{value: any, guessed?: boolean} | {problem: string}} Reading
 */

/**
 * A value from the file, short enough to sit in a sentence.
 *
 * @param {string} s
 */
function quote(s) {
  return `"${s.length > 24 ? `${s.slice(0, 23)}…` : s}"`
}

// ── Dates ──────────────────────────────────────────────────────────────────────

/** The longest a date or an amount can be and still be one: past it, it is not read. */
const MAX_WRITTEN = 64

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** 1-12 for "Oct", "october" or "Sept", else 0. @param {string} word */
function monthOf(word) {
  const w = word.toLowerCase()
  return w.length >= 3 ? MONTH_NAMES.findIndex(n => n.startsWith(w)) + 1 : 0
}

/**
 * Whether the day exists. Date quietly turns 30 February into 2 March, and
 * keeps going for a 13th month, so the calendar is checked here. The years
 * are a sanity bound: nothing in a wallet is from before 1900 or after 2100,
 * and "0001-01-01" is a blank that someone's spreadsheet filled in.
 *
 * @param {number} y @param {number} m 1-12 @param {number} d
 */
function isRealDay(y, m, d) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 31/12/2026, 12-3-26, 3.10.2026: two numbers and a year, in some order. */
const NUMERIC_DAY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/
/** 2026-09-30, 2026/9/3: the order nobody can read two ways. */
const YEAR_FIRST = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/
/** 3 Oct 2026, 03-October-2026, 3rd Oct. 2026 */
const DAY_MONTH_WORD = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})$/
/** Oct 3, 2026, October 3rd 2026 */
const MONTH_WORD_DAY = /^([A-Za-z]{3,9})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{4})$/
/** A time of day at the end: "14:35", "2:35 pm", "14:35:10" */
const CLOCK = /[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp][Mm])?$/

/**
 * A date with its time of day taken off. A day with no time is noon, as it
 * always was: far enough from midnight that no timezone moves it to another day.
 * Null when the time is not a time.
 *
 * @param {string} s
 * @returns {{day: string, clock: [number, number, number]} | null}
 */
function splitClock(s) {
  const m = CLOCK.exec(s)
  if (!m) return { day: s, clock: [12, 0, 0] }
  let h = Number(m[1])
  const min = Number(m[2])
  const sec = m[3] ? Number(m[3]) : 0
  const half = m[4]?.toLowerCase()
  if (half) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (half === 'pm' ? 12 : 0)
  }
  if (h > 23 || min > 59 || sec > 59) return null
  return { day: s.slice(0, m.index).trim(), clock: [h, min, sec] }
}

/**
 * Which way round the numbers of a "12/03/2026" go, from the whole file.
 *
 * One date cannot say: 12/03 is 12 March or 3 December. A file can - the
 * first "31/12/2026" in it is day first, a "12/31/2026" is month first - so
 * every date is read before any is. A file that never says is read day first,
 * the way the Philippines and Australia write it (the preview tells the person
 * so), and one that says both ways cannot be read at all where it matters.
 *
 *   dmy      some first number is over 12
 *   mdy      some second number is over 12
 *   mixed    both are, so the file contradicts itself
 *   unknown  neither is
 *
 * @typedef {'dmy'|'mdy'|'mixed'|'unknown'} DateOrder
 * @param {Iterable<unknown>} raws
 * @returns {DateOrder}
 */
export function dateOrderOf(raws) {
  let dayFirst = false
  let monthFirst = false
  for (const raw of raws) {
    const written = stripInvisible(String(raw ?? '')).trim()
    const day = written.length > MAX_WRITTEN ? '' : splitClock(written)?.day ?? ''
    const m = NUMERIC_DAY.exec(day)
    if (!m) continue
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > 12 && b > 12) continue   // no order makes this a date; it is rejected on its own
    if (a > 12) dayFirst = true
    if (b > 12) monthFirst = true
  }
  if (dayFirst && monthFirst) return 'mixed'
  return dayFirst ? 'dmy' : monthFirst ? 'mdy' : 'unknown'
}

/**
 * A date from a file, as the app stores every date: a UTC ISO instant.
 *
 * This app's own export is that already. A file made by hand is often a
 * bare '2026-09-30', or an instant carrying its own offset - and every
 * screen compares stored dates as strings, so a date in another form lands
 * in the wrong day or the wrong month. A bare day is read as noon on that
 * LOCAL day: the day the person wrote, whichever side of Greenwich they are.
 *
 * Not a date, or a day that does not exist, is a problem and not a guess.
 * `guessed` says the day and month could be either way round and the file did
 * not settle it, so the row was read day first.
 *
 * @param {unknown} raw
 * @param {DateOrder} [order]  from dateOrderOf over the whole file
 * @returns {Reading}
 */
export function readDate(raw, order = 'unknown') {
  const s = stripInvisible(String(raw ?? '')).trim()
  if (!s) return { problem: 'No date' }
  const notReal = { problem: `${quote(s)} is not a real date` }
  const unreadable = { problem: `Can't read the date ${quote(s)}` }
  if (s.length > MAX_WRITTEN) return unreadable

  // An instant, which names its own day and may name its own offset. Date.parse
  // would take 2026-02-30T10:00:00Z as 2 March, so the day is checked first.
  const instant = /^(\d{4})-(\d{2})-(\d{2})[T ]\d/.exec(s)
  if (instant) {
    if (!isRealDay(Number(instant[1]), Number(instant[2]), Number(instant[3]))) return notReal
    let t = Date.parse(s)
    if (!Number.isFinite(t)) t = Date.parse(s.replace(' ', 'T'))
    return Number.isFinite(t) ? { value: new Date(t).toISOString() } : unreadable
  }

  const split = splitClock(s)
  if (!split) return unreadable
  const { day, clock } = split

  let y, month, d
  let guessed = false
  let m
  if ((m = YEAR_FIRST.exec(day))) {
    y = Number(m[1]); month = Number(m[2]); d = Number(m[3])
  } else if ((m = NUMERIC_DAY.exec(day))) {
    const a = Number(m[1])
    const b = Number(m[2])
    y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    let dayFirst
    if (a > 12) dayFirst = true
    else if (b > 12) dayFirst = false
    else if (a === b) dayFirst = true   // 5/5 is the same day either way
    else if (order === 'mixed') return { problem: `Can't tell the day from the month in ${quote(s)}` }
    else {
      dayFirst = order !== 'mdy'
      guessed = order === 'unknown'
    }
    month = dayFirst ? b : a
    d = dayFirst ? a : b
  } else if ((m = DAY_MONTH_WORD.exec(day))) {
    d = Number(m[1]); month = monthOf(m[2]); y = Number(m[3])
    if (!month) return unreadable
  } else if ((m = MONTH_WORD_DAY.exec(day))) {
    month = monthOf(m[1]); d = Number(m[2]); y = Number(m[3])
    if (!month) return unreadable
  } else {
    return unreadable
  }

  if (!isRealDay(y, month, d)) return notReal
  const value = new Date(y, month - 1, d, clock[0], clock[1], clock[2]).toISOString()
  return guessed ? { value, guessed } : { value }
}

/**
 * readDate for a caller that wants a string back: the ISO instant, or what was
 * written when it is not a date.
 *
 * @param {unknown} raw
 * @param {DateOrder} [order]
 */
export function normalizeDate(raw, order) {
  const r = readDate(raw, order)
  return 'value' in r ? r.value : String(raw ?? '').trim()
}

// ── Amounts ────────────────────────────────────────────────────────────────────

/**
 * A currency written beside a number: a symbol (₱ $ €), a code in capitals
 * (PHP USD), the peso as "P" or "Php", or a dollar with its country (A$ HK$).
 * A word is not one, which is how "abc" stays an error.
 *
 * @param {string} t
 */
const isCurrency = (t) =>
  /^\p{Sc}+$/u.test(t) || /^[A-Z]{3}$/.test(t) || /^(?:p|php)$/i.test(t) || /^[A-Z]{1,2}\$$/.test(t)

/** What may stand beside a number besides the number: a currency of up to four characters. */
const CURRENCY_CHARS = '[^\\d\\s.,()+\\-\\u2212]{1,4}'
const SIGN = '[-+\\u2212]'
/** [sign] [currency] [sign] number [currency], once parentheses are off. */
const AMOUNT_SHAPE = new RegExp(
  `^(${SIGN})?\\s*(${CURRENCY_CHARS})?\\s*(${SIGN})?\\s*([\\d.,\\s]+?)\\s*(${CURRENCY_CHARS})?$`, 'u',
)
/** 1,234.50  1234.5  .5  (commas group, the period is the decimal point) */
const POINT_DECIMAL = /^(?:([1-9]\d{0,2}(?:,\d{3})+)|(\d*))(?:\.(\d*))?$/
/** 1.234,50  1234,5  12,50  (periods group, the comma is the decimal point) */
const COMMA_DECIMAL = /^(?:([1-9]\d{0,2}(?:\.\d{3})+)|(\d+)),(\d+)$/
/** 1.234.567: periods that can only be grouping, because there are two of them */
const PERIOD_GROUPS = /^[1-9]\d{0,2}(?:\.\d{3}){2,}$/

/**
 * An amount the way a person writes one: "1,234.50", "₱500", "PHP 500",
 * " 12.5 ", "(250.00)" and "-250" for money out, "1.234,50" the European way.
 * Rounded to the cent, from the digits as written (not from a float, where
 * 1.005 would round down).
 *
 * Not a number is a problem, and so is a size no wallet has: more than twelve
 * digits before the point leaves a float unable to hold the cents, and every
 * balance it touched would drift. "1.234" alone is a 1.234 (rounded to 1.23)
 * because that is how it is written here; it is only a thousand-and-something
 * when it is plainly one - 1.234,50 or 1.234.567.
 *
 * @param {unknown} raw
 * @returns {Reading}
 */
export function readAmount(raw) {
  const s = stripInvisible(String(raw ?? '')).trim()
  if (!s) return { problem: 'No amount' }
  const notAmount = { problem: `${quote(s)} is not an amount` }
  // The longest real one is under 30 characters. The cap also keeps the pattern
  // below from being run on a field of ten thousand spaces.
  if (s.length > MAX_WRITTEN) return notAmount

  let body = s
  let negative = false
  const parens = /^\(([^()]*)\)$/.exec(body)
  if (parens) { negative = true; body = parens[1].trim() }

  const m = AMOUNT_SHAPE.exec(body)
  if (!m) return notAmount
  const [, signBefore, currencyBefore, signAfter, written, currencyAfter] = m
  if (signBefore && signAfter) return notAmount
  if (currencyBefore && currencyAfter) return notAmount
  if (currencyBefore && !isCurrency(currencyBefore)) return notAmount
  if (currencyAfter && !isCurrency(currencyAfter)) return notAmount
  const sign = signBefore || signAfter
  if (sign && negative) return notAmount
  if (sign === '-' || sign === '\u2212') negative = true

  // A space between groups of three digits is a thousands separator ("1 234,50"),
  // anywhere else it is not part of a number.
  const digits = written.trim().replace(/(\d)\s(?=\d{3}(?!\d))/g, '$1')
  if (/\s/.test(digits)) return notAmount

  let whole, fraction
  let g
  if ((g = POINT_DECIMAL.exec(digits))) {
    whole = (g[1] ?? g[2] ?? '').replace(/,/g, '')
    fraction = g[3] ?? ''
  } else if ((g = COMMA_DECIMAL.exec(digits))) {
    whole = (g[1] ?? g[2] ?? '').replace(/\./g, '')
    fraction = g[3]
  } else if (PERIOD_GROUPS.test(digits)) {
    whole = digits.replace(/\./g, '')
    fraction = ''
  } else {
    return notAmount
  }
  if (!whole && !fraction) return notAmount
  if (whole.replace(/^0+/, '').length > 12) return { problem: `${quote(s)} is too large` }

  let cents = Number(whole || '0') * 100 + Number(`${fraction}00`.slice(0, 2))
  if (fraction.length > 2 && fraction.charCodeAt(2) >= 53) cents += 1   // the third digit is 5 or more
  return { value: negative && cents ? -cents / 100 : cents / 100 }
}

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * The words a file uses for the three kinds of row. A bank's export says
 * "debit" and "credit"; Spendr's own says expense, inflow and transfer.
 */
const TYPE_WORDS = new Map([
  ['expense', 'expense'], ['debit', 'expense'], ['withdrawal', 'expense'],
  ['inflow', 'inflow'], ['income', 'inflow'], ['credit', 'inflow'], ['deposit', 'inflow'],
  ['transfer', 'transfer'],
])

/**
 * @param {unknown} raw
 * @returns {Reading}
 */
export function readType(raw) {
  const s = cleanText(raw, 40).toLowerCase()
  if (!s) return { problem: 'No type' }
  const type = TYPE_WORDS.get(s)
  return type ? { value: type } : { problem: `${quote(s)} is not a type Spendr knows` }
}

/**
 * The reasons a row cannot be imported, as one sentence; undefined when it can.
 *
 * @param {Reading[]} readings
 */
function problemOf(readings) {
  const reasons = readings.flatMap(r => ('problem' in r ? [r.problem] : []))
  return reasons.length ? reasons.join('; ') : undefined
}

// ── Text ───────────────────────────────────────────────────────────────────────

/**
 * Text as Spendr's own export wrote it: export.js csvCell puts an apostrophe
 * before a cell that starts with = + - @ so a spreadsheet will not run it as a
 * formula. It is taken off again here, so "-5 coupon" is the same description
 * after a round trip.
 *
 * @param {unknown} v
 */
const unprotect = (v) => String(v ?? '').replace(/^'(?=[=+\-@\t\r])/, '')
/** @param {unknown} v @param {number} limit */
const freeText = (v, limit) => cleanText(unprotect(v), limit)
/** @param {unknown} v @param {number} limit */
const nameText = (v, limit) => cleanName(unprotect(v), limit)

// ── CSV parser ─────────────────────────────────────────────────────────────────

/**
 * What the desktop Transactions page's "Export CSV" writes, which is a file
 * for a spreadsheet and not for this importer: the date and time split in two,
 * the amount signed, a currency and a base-currency figure, and no ids to tell
 * one row from another. Importing it would be guessing, so it is refused, and
 * the person is told what to use instead.
 */
export const SPREADSHEET_EXPORT_MESSAGE =
  'This file is for spreadsheets. To move your data, export Transactions as CSV from Reports, or use a backup.'

/**
 * True when the header is the desktop spreadsheet export's: its own
 * capitalised names, with the Time column or the base-currency amount that no
 * other layout has. Both are asked for beside Date, Type and Amount, so a
 * hand-made file that merely has a "Date" column still gets the ordinary
 * "Missing columns" answer.
 *
 * @param {Set<string>} cols
 */
export function isSpreadsheetExport(cols) {
  return cols.has('Date') && cols.has('Type') && cols.has('Amount')
    && (cols.has('Time') || cols.has('Amount (base)'))
}

/** The column each carried field is under, in Spendr's own layout. */
const SPENDR_NAMES = {
  refundOf: 'refundOf', splitId: 'splitId', installmentId: 'installmentId',
  toAmount: 'toAmount', toCurrency: 'toCurrency',
  currency: 'currency', baseAmount: 'baseAmount', baseCurrency: 'baseCurrency', adjust: 'adjust',
}
/** ... and in the table layout. */
const TABLE_NAMES = {
  refundOf: 'refund_of', splitId: 'split_id', installmentId: 'installment_id',
  toAmount: 'to_amount', toCurrency: 'to_currency',
  currency: 'currency', baseAmount: 'base_amount', baseCurrency: 'base_currency', adjust: 'adjust',
}

/**
 * The fields beyond the core columns. A row Spendr exported can carry them
 * and a hand-made one never does, so each is read only when it is present - a
 * file without them imports exactly as it always did.
 *
 *   refundOf, splitId, installmentId  the links that keep a refund beside its
 *                                     purchase, the legs of a split together
 *                                     and a plan's months one plan
 *   toAmount, toCurrency              what arrived at the far end of a
 *                                     transfer between two currencies
 *   currency, baseAmount, baseCurrency
 *                                     what the amount is in, and what it was
 *                                     worth in the ledger's currency that day
 *   adjust                            a row that moved a balance without being
 *                                     income or spending
 *
 * @param {Record<string, any>} row
 * @param {Record<string, string>} names  the column each field is under
 */
function carriedFields(row, names) {
  /** @param {string} key */
  const text = (key) => String(row[names[key]] ?? '').trim()
  /** @param {string} key */
  const number = (key) => {
    const raw = text(key)
    const n = raw === '' ? NaN : Number(raw)
    // Past a trillion a float cannot hold the cents, and a received amount
    // that size would be credited to a balance as it stands.
    return Number.isFinite(n) && Math.abs(n) < 1e12 ? n : null
  }
  /** @type {Record<string, any>} */
  const out = {}
  for (const key of ['refundOf', 'splitId', 'installmentId']) {
    if (text(key)) out[key] = text(key)
  }
  /* A received amount means nothing without its currency, and a currency
     with no amount is nothing received. Both, or neither. */
  const toAmount = number('toAmount')
  if (toAmount != null && toAmount > 0 && text('toCurrency')) {
    out.toAmount = toAmount
    out.toCurrency = text('toCurrency').toUpperCase()
  }
  if (text('currency')) out.currency = text('currency').toUpperCase()
  const baseAmount = number('baseAmount')
  if (baseAmount != null) out.baseAmount = baseAmount
  if (text('baseCurrency')) out.baseCurrency = text('baseCurrency').toUpperCase()
  if (text('adjust') === 'correction' || text('adjust') === 'value') out.adjust = text('adjust')
  return out
}

/**
 * @typedef {'spendr'|'table'} CsvFormat
 *   spendr  what Spendr's own export writes (txId, date, payment, account ...)
 *   table   the cloud table's naming (tx_id, transaction_date, from_account ...)
 */

/**
 * @param {string} rawText
 * @returns {{rows: Array<Record<string, any>>, format: CsvFormat}}
 */
export function parseCSV(rawText) {
  // Strip UTF-8 BOM (U+FEFF) if present
  const text = rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText

  const result = Papa.parse(text.trim(), { header: true, skipEmptyLines: true, dynamicTyping: false })
  if (result.errors?.length > 0 && !result.data?.length) {
    throw new Error('Malformed CSV: ' + result.errors[0]?.message)
  }

  const cols = new Set(result.meta?.fields ?? [])

  // Before the layouts below: its "Date" would otherwise fall through to the
  // table layout and be refused for columns it was never meant to have.
  if (isSpreadsheetExport(cols)) throw new Error(SPREADSHEET_EXPORT_MESSAGE)

  // Detect the layout by the column names Spendr writes against the table's.
  const isSpendr = cols.has('txId') || cols.has('payment') || (cols.has('date') && !cols.has('transaction_date'))

  if (isSpendr) {
    const missing = SPENDR_REQUIRED_COLS.filter(c => !cols.has(c))
    if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`)
    return { rows: mapSpendrRows(result.data), format: 'spendr' }
  }

  const missing = TABLE_REQUIRED_COLS.filter(c => !cols.has(c))
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`)
  return { rows: mapTableRows(result.data), format: 'table' }
}

/**
 * What a mapper adds to a row beyond its columns: why it cannot be imported,
 * if it cannot, and that its day and month were guessed, if they were.
 *
 * @param {Reading} type
 * @param {Reading} date
 * @param {Reading} amount
 */
function verdictOf(type, date, amount) {
  const problem = problemOf([type, date, amount])
  return {
    ...('guessed' in date && date.guessed ? { dateGuess: true } : {}),
    ...(problem ? { problem } : {}),
  }
}

/** @param {Reading} r @param {any} fallback  what a row that failed to read carries instead */
const valueOr = (r, fallback) => ('value' in r ? r.value : fallback)

/** @param {Array<Record<string, any>>} data */
export function mapTableRows(data) {
  const order = dateOrderOf(data.map(row => row.transaction_date))
  return data.map(row => {
    const typeRead    = readType(row.type)
    const dateRead    = readDate(row.transaction_date, order)
    const amountRead  = readAmount(row.amount)
    const type        = valueOr(typeRead, cleanText(row.type, 40).toLowerCase())
    const fromAcc     = nameText(row.from_account, LIMITS.account)
    const toAcc       = nameText(row.to_account, LIMITS.account)
    const description = freeText(row.description, LIMITS.description)

    let account = null, fromAccount = null, toAccount = null

    if (type === 'expense') {
      account = fromAcc || null
    } else if (type === 'inflow') {
      account = toAcc || null
    } else if (type === 'transfer') {
      fromAccount = fromAcc || null
      toAccount   = toAcc   || null
      // Fall back to description parsing when accounts are absent
      if (!fromAccount || !toAccount) {
        const m = TRANSFER_RE.exec(description)
        if (m) {
          fromAccount = fromAccount ?? (nameText(m[1], LIMITS.account) || null)
          toAccount   = toAccount   ?? (nameText(m[2], LIMITS.account) || null)
        }
      }
    }

    return {
      txId:        stripInvisible(String(row.tx_id ?? '')).trim() || null,
      type,
      date:        valueOr(dateRead, String(row.transaction_date ?? '').trim()),
      description,
      category:    nameText(row.category, LIMITS.category),
      account,
      fromAccount,
      toAccount,
      amount:      valueOr(amountRead, 0),
      ...carriedFields(row, TABLE_NAMES),
      ...verdictOf(typeRead, dateRead, amountRead),
      synced:      UNSYNCED,
    }
  })
}

/** @param {Array<Record<string, any>>} data */
export function mapSpendrRows(data) {
  const order = dateOrderOf(data.map(row => row.date))
  return data.map(row => {
    const typeRead   = readType(row.type)
    const dateRead   = readDate(row.date, order)
    const amountRead = readAmount(row.amount)
    return {
      txId:        stripInvisible(String(row.txId ?? '')).trim() || null,
      type:        valueOr(typeRead, cleanText(row.type, 40).toLowerCase()),
      date:        valueOr(dateRead, String(row.date ?? '').trim()),
      description: freeText(row.description, LIMITS.description),
      category:    nameText(row.category, LIMITS.category),
      payment:     nameText(row.payment, LIMITS.account) || null,
      account:     nameText(row.account, LIMITS.account) || null,
      fromAccount: nameText(row.fromAccount, LIMITS.account) || null,
      toAccount:   nameText(row.toAccount, LIMITS.account) || null,
      amount:      valueOr(amountRead, 0),
      ...carriedFields(row, SPENDR_NAMES),
      ...verdictOf(typeRead, dateRead, amountRead),
      synced:      UNSYNCED,
    }
  })
}
