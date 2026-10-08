import { describe, it, expect, vi } from 'vitest'

// csv.js reaches Dexie for one constant; there is no IndexedDB in a node test.
vi.mock('../../db/db', () => ({ default: {}, UNSYNCED: 0 }))

const { parseCSV, isSpreadsheetExport, SPREADSHEET_EXPORT_MESSAGE } = await import('./csv')
const { transactionsToCsv, CSV_HEADERS } = await import('./export')

/**
 * Which file this is.
 *
 * Spendr's own Transactions as CSV was detected as the "legacy" layout and the
 * preview told people it was "from an older version"; the desktop
 * Transactions page's Export CSV, which is for spreadsheets, was refused with
 * a list of columns it was never meant to have.
 */
describe('which layout a file is', () => {
  it('knows the file Spendr itself writes, and says so', () => {
    const csv = transactionsToCsv([
      { txId: 't1', type: 'expense', date: '2026-09-10T04:00:00.000Z', description: 'Lunch', category: 'Food', account: 'Cash', amount: 120 },
    ])
    const { rows, format } = parseCSV(csv)
    expect(format).toBe('spendr')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ txId: 't1', type: 'expense', account: 'Cash', amount: 120 })
  })

  it('still reads an export from before the link columns existed', () => {
    const old = [
      'txId,type,date,description,category,payment,account,fromAccount,toAccount,amount',
      '"a","expense","2026-09-10T04:00:00.000Z","Lunch","Food","","Cash","","",120',
    ].join('\r\n')
    const { rows, format } = parseCSV(old)
    expect(format).toBe('spendr')
    expect(rows[0]).not.toHaveProperty('refundOf')
    expect(rows[0].amount).toBe(120)
  })

  it('reads the table layout as its own, by tx_id and transaction_date', () => {
    const csv = [
      'tx_id,type,transaction_date,description,category,from_account,to_account,amount',
      't1,expense,2026-09-10,Lunch,Food,Cash,,120',
      't2,inflow,2026-09-11,Pay,Salary,,BPI,5000',
    ].join('\n')
    const { rows, format } = parseCSV(csv)
    expect(format).toBe('table')
    expect(rows[0]).toMatchObject({ txId: 't1', account: 'Cash' })
    expect(rows[1]).toMatchObject({ txId: 't2', account: 'BPI' })
  })

  it('strips a byte-order mark', () => {
    const csv = '﻿' + transactionsToCsv([
      { txId: 't', type: 'inflow', date: '2026-09-10T04:00:00.000Z', description: '', category: 'Salary', account: 'BPI', amount: 1 },
    ])
    expect(parseCSV(csv).format).toBe('spendr')
  })

  it('names the missing columns of a file that is neither', () => {
    expect(() => parseCSV('Date,Type,Amount\n2026-09-10,expense,5')).toThrow(/Missing columns/)
    expect(() => parseCSV('a,b\n1,2')).toThrow(/Missing columns/)
  })
})

describe('the desktop Transactions Export CSV', () => {
  const desktop = [
    'Date,Time,Type,Description,Category,Account,From,To,Amount,Currency,Amount (base)',
    '2026-09-10,12:30 PM,expense,Lunch,Food,Cash,,,-120.00,PHP,-120.00',
  ].join('\r\n')

  it('is recognised, and refused with what to use instead', () => {
    expect(() => parseCSV(desktop)).toThrow(SPREADSHEET_EXPORT_MESSAGE)
    expect(SPREADSHEET_EXPORT_MESSAGE).toBe(
      'This file is for spreadsheets. To move your data, export Transactions as CSV from Reports, or use a backup.',
    )
  })

  it('is recognised with a byte-order mark, which that export writes', () => {
    expect(() => parseCSV('﻿' + desktop)).toThrow(SPREADSHEET_EXPORT_MESSAGE)
  })

  it('is recognised by its header and by nothing a hand-made file has', () => {
    const cols = (/** @type {string[]} */ names) => new Set(names)
    expect(isSpreadsheetExport(cols(['Date', 'Time', 'Type', 'Description', 'Amount', 'Amount (base)']))).toBe(true)
    // Either marker alone is enough beside Date, Type and Amount.
    expect(isSpreadsheetExport(cols(['Date', 'Type', 'Amount', 'Time']))).toBe(true)
    expect(isSpreadsheetExport(cols(['Date', 'Type', 'Amount', 'Amount (base)']))).toBe(true)
    // A plain capitalised sheet is the ordinary "Missing columns", not this.
    expect(isSpreadsheetExport(cols(['Date', 'Type', 'Amount']))).toBe(false)
    expect(isSpreadsheetExport(cols(['txId', 'type', 'date', 'amount']))).toBe(false)
    expect(isSpreadsheetExport(cols(['tx_id', 'type', 'transaction_date', 'amount']))).toBe(false)
  })

  it('says it in plain words: no em dash, and no column list', () => {
    expect(SPREADSHEET_EXPORT_MESSAGE).not.toContain('—')
    expect(SPREADSHEET_EXPORT_MESSAGE).not.toMatch(/Missing columns/)
  })
})

/**
 * A row keeps what Spendr wrote on it. The importer used to read none of the
 * links and drop the received amount it had parsed, so a refund came back as
 * an unrelated negative expense, a split as separate purchases, a plan as
 * loose charges and a dollar transfer as a peso one.
 */
describe('what a row carries through', () => {
  /** @type {string[]} */
  const CARRIED = ['refundOf', 'splitId', 'installmentId', 'toAmount', 'toCurrency', 'currency', 'baseAmount', 'baseCurrency', 'adjust']

  it('reads every field the export writes, under its own name', () => {
    const full = {
      txId: 'x', type: 'expense', date: '2026-09-10T04:00:00.000Z', description: 'd', category: 'c',
      payment: 'Card', account: 'A', fromAccount: '', toAccount: '', amount: -50,
      refundOf: 'orig', splitId: 'sp', installmentId: 'pl', toAmount: 5800, toCurrency: 'php',
      currency: 'usd', baseAmount: -2900, baseCurrency: 'php', adjust: 'value',
    }
    const { rows } = parseCSV(transactionsToCsv([full]))
    expect(rows[0]).toMatchObject({
      refundOf: 'orig', splitId: 'sp', installmentId: 'pl',
      toAmount: 5800, toCurrency: 'PHP', currency: 'USD', baseAmount: -2900, baseCurrency: 'PHP', adjust: 'value',
      payment: 'Card', amount: -50,
    })
  })

  it('writes a column for every carried field, so none can be lost on the way out', () => {
    for (const col of CARRIED) expect(CSV_HEADERS).toContain(col)
  })

  it('adds nothing to an ordinary row', () => {
    const { rows } = parseCSV(transactionsToCsv([
      { txId: 'p', type: 'expense', date: '2026-09-10T04:00:00.000Z', description: '', category: 'Food', account: 'Cash', amount: 5 },
    ]))
    for (const k of CARRIED) expect(rows[0]).not.toHaveProperty(k)
  })

  it('takes a received amount only with its currency, and only above zero', () => {
    const base = { txId: 'x', type: 'transfer', date: '2026-09-10T04:00:00.000Z', description: '', category: '', fromAccount: 'A', toAccount: 'B', amount: 10 }
    expect(parseCSV(transactionsToCsv([{ ...base, toAmount: 580 }])).rows[0]).not.toHaveProperty('toAmount')
    expect(parseCSV(transactionsToCsv([{ ...base, toCurrency: 'PHP' }])).rows[0]).not.toHaveProperty('toCurrency')
    expect(parseCSV(transactionsToCsv([{ ...base, toAmount: 0, toCurrency: 'PHP' }])).rows[0]).not.toHaveProperty('toAmount')
  })

  it('ignores an adjust value it does not know', () => {
    const base = { txId: 'x', type: 'inflow', date: '2026-09-10T04:00:00.000Z', description: '', category: 'c', account: 'A', amount: 1 }
    expect(parseCSV(transactionsToCsv([{ ...base, adjust: 'bogus' }])).rows[0]).not.toHaveProperty('adjust')
  })

  it('reads the same links from the table layout', () => {
    const csv = [
      'tx_id,type,transaction_date,description,category,from_account,to_account,amount,refund_of,split_id,to_amount,to_currency,currency,base_amount,base_currency',
      't3,expense,2026-09-10,Back,Food,Cash,,-50,t1,s1,,,USD,-2900,PHP',
    ].join('\n')
    expect(parseCSV(csv).rows[0]).toMatchObject({
      refundOf: 't1', splitId: 's1', currency: 'USD', baseAmount: -2900, baseCurrency: 'PHP', amount: -50,
    })
  })
})
