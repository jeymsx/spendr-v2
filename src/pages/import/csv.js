import Papa from 'papaparse'
import { UNSYNCED } from '../../db/db'
import { NEW_REQUIRED_COLS, LEGACY_REQUIRED_COLS, TRANSFER_RE } from './shared'

// ── CSV parser ─────────────────────────────────────────────────────────────────

export function parseCSV(rawText) {
  // Strip UTF-8 BOM (U+FEFF) if present
  const text = rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText

  const result = Papa.parse(text.trim(), { header: true, skipEmptyLines: true, dynamicTyping: false })
  if (result.errors?.length > 0 && !result.data?.length) {
    throw new Error('Malformed CSV: ' + result.errors[0]?.message)
  }

  const cols = new Set(result.meta?.fields ?? [])

  // Detect format by the presence of new vs legacy column names
  const isLegacy = cols.has('txId') || cols.has('payment') || (cols.has('date') && !cols.has('transaction_date'))

  if (isLegacy) {
    const missing = LEGACY_REQUIRED_COLS.filter(c => !cols.has(c))
    if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`)
    return { rows: mapLegacyRows(result.data), isLegacy: true }
  }

  const missing = NEW_REQUIRED_COLS.filter(c => !cols.has(c))
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`)
  return { rows: mapNewRows(result.data), isLegacy: false }
}

export function mapNewRows(data) {
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
      date:        String(row.transaction_date ?? '').trim(),
      description,
      category:    String(row.category ?? '').trim(),
      account,
      fromAccount,
      toAccount,
      amount:      parseFloat(row.amount) || 0,
      synced:      UNSYNCED,
    }
  })
}

export function mapLegacyRows(data) {
  return data.map(row => ({
    txId:        String(row.txId        ?? '').trim() || null,
    type:        String(row.type        ?? '').trim().toLowerCase(),
    date:        String(row.date        ?? '').trim(),
    description: String(row.description ?? '').trim(),
    category:    String(row.category    ?? '').trim(),
    payment:     String(row.payment     ?? '').trim() || null,
    account:     String(row.account     ?? '').trim() || null,
    fromAccount: String(row.fromAccount ?? '').trim() || null,
    toAccount:   String(row.toAccount   ?? '').trim() || null,
    amount:      parseFloat(row.amount) || 0,
    synced:      UNSYNCED,
  }))
}
