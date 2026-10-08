import Papa from 'papaparse'
import { UNSYNCED } from '../../db/db'
import { SPENDR_REQUIRED_COLS, TABLE_REQUIRED_COLS, TRANSFER_RE } from './shared'

// ── Dates ──────────────────────────────────────────────────────────────────────

/**
 * A date from a file, as the app stores every date: a UTC ISO instant.
 *
 * This app's own export is that already. A file made by hand is often a
 * bare '2026-09-30', or an instant carrying its own offset - and every
 * screen compares stored dates as strings, so a date in another form lands
 * in the wrong day or the wrong month. A bare day is read as noon on that
 * LOCAL day: the day the person wrote, whichever side of Greenwich they are.
 *
 * Anything that is not a real date is left exactly as it came, for the
 * preview to show as it is.
 *
 * @param {unknown} raw
 */
export function normalizeDate(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return s
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (day) {
    const d = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12)
    // 2026-02-30 is not a day; Date would quietly make it 2 March.
    return d.getMonth() === Number(day[2]) - 1 ? d.toISOString() : s
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t).toISOString() : s
}

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
    return Number.isFinite(n) ? n : null
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

/** @param {Array<Record<string, any>>} data */
export function mapTableRows(data) {
  return data.map(row => {
    const type        = String(row.type ?? '').trim().toLowerCase()
    const fromAcc     = String(row.from_account ?? '').trim()
    const toAcc       = String(row.to_account   ?? '').trim()
    const description = String(row.description  ?? '').trim()

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
          fromAccount = fromAccount ?? m[1].trim()
          toAccount   = toAccount   ?? m[2].trim()
        }
      }
    }

    return {
      txId:        String(row.tx_id ?? '').trim() || null,
      type,
      date:        normalizeDate(row.transaction_date),
      description,
      category:    String(row.category ?? '').trim(),
      account,
      fromAccount,
      toAccount,
      amount:      parseFloat(row.amount) || 0,
      ...carriedFields(row, TABLE_NAMES),
      synced:      UNSYNCED,
    }
  })
}

/** @param {Array<Record<string, any>>} data */
export function mapSpendrRows(data) {
  return data.map(row => ({
    txId:        String(row.txId        ?? '').trim() || null,
    type:        String(row.type        ?? '').trim().toLowerCase(),
    date:        normalizeDate(row.date),
    description: String(row.description ?? '').trim(),
    category:    String(row.category    ?? '').trim(),
    payment:     String(row.payment     ?? '').trim() || null,
    account:     String(row.account     ?? '').trim() || null,
    fromAccount: String(row.fromAccount ?? '').trim() || null,
    toAccount:   String(row.toAccount   ?? '').trim() || null,
    amount:      parseFloat(row.amount) || 0,
    ...carriedFields(row, SPENDR_NAMES),
    synced:      UNSYNCED,
  }))
}
