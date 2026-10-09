import { describe, it, expect, vi } from 'vitest'

// csv.js reaches Dexie for one constant; there is no IndexedDB in a node test.
vi.mock('../../db/db', () => ({ default: {}, UNSYNCED: 0 }))

const { parseCSV, readAmount, readDate, readType, dateOrderOf, normalizeDate } = await import('./csv')

/**
 * Reading what a person wrote. A tester fed the importer files with real
 * mistakes in them and every one went through: "1,234.50" became 1.00,
 * "abc" a row of nothing, 31/12/2026 and 2026-02-30 were stored as written and
 * moved money on days no screen shows. A value that cannot be read is now a
 * `problem` on its row, and a value that can is read the way it was meant.
 */

const ZWSP = String.fromCodePoint(0x200B)
const ZWJ = String.fromCodePoint(0x200D)
const BOM = String.fromCodePoint(0xFEFF)
const RLO = String.fromCodePoint(0x202E)
const NBSP = String.fromCodePoint(0x00A0)
const MINUS = String.fromCodePoint(0x2212)

/** @param {unknown} raw */
const amount = (raw) => {
  const r = readAmount(raw)
  return 'value' in r ? r.value : `problem: ${r.problem}`
}

describe('amounts as a person writes them', () => {
  it.each([
    ['1,234.50', 1234.5],
    ['1,234,567.89', 1234567.89],
    ['1234.5', 1234.5],
    ['120', 120],
    ['0', 0],
    ['.5', 0.5],
    ['5.', 5],
    ['  12.5  ', 12.5],
    ['₱500', 500],
    ['₱ 1,234.50', 1234.5],
    ['PHP 500', 500],
    ['PHP500', 500],
    ['500 PHP', 500],
    ['Php 500', 500],
    ['P500', 500],
    ['$1,000', 1000],
    ['US$20', 20],
    ['A$ 5.25', 5.25],
    ['€12,50', 12.5],
  ])('reads %j as %d', (raw, expected) => {
    expect(amount(raw)).toBe(expected)
  })

  it('reads money out as negative, written with a minus or in brackets', () => {
    expect(amount('-250')).toBe(-250)
    expect(amount(`${MINUS}250`)).toBe(-250)
    expect(amount('(250.00)')).toBe(-250)
    expect(amount('-₱500')).toBe(-500)
    expect(amount('₱-500')).toBe(-500)
    expect(amount('($1,234.50)')).toBe(-1234.5)
    expect(amount('+75')).toBe(75)
    // A minus on nothing is not a negative zero.
    expect(Object.is(amount('-0'), 0)).toBe(true)
  })

  it('reads the European 1.234,50 when nothing else it could be', () => {
    expect(amount('1.234,50')).toBe(1234.5)
    expect(amount('1.234.567')).toBe(1234567)
    expect(amount('1.234.567,89')).toBe(1234567.89)
    expect(amount('12,50')).toBe(12.5)
    expect(amount('1234,5')).toBe(1234.5)
    expect(amount('0,005')).toBe(0.01)
  })

  it('keeps 1.234 and 1,234 the way they are written here', () => {
    // A lone period is the decimal point, and a lone comma before three digits
    // is a thousands separator: the readings that are not a surprise at home.
    expect(amount('1.234')).toBe(1.23)
    expect(amount('1,234')).toBe(1234)
  })

  it('takes a space between groups of three as a thousands separator', () => {
    expect(amount('1 234,50')).toBe(1234.5)
    expect(amount(`1${NBSP}234.50`)).toBe(1234.5)
    expect(amount('1 234 567')).toBe(1234567)
    expect(amount('1 2')).toMatch(/^problem/)
  })

  it('rounds to the cent from the digits written, half up', () => {
    expect(amount('0.005')).toBe(0.01)
    expect(amount('12.345678')).toBe(12.35)
    expect(amount('0.004')).toBe(0)
    // 1.005 is 1.00499999999999989... as a float, which rounds down; the digits say 1.01.
    expect(amount('1.005')).toBe(1.01)
    expect(amount('2.675')).toBe(2.68)
    expect(amount('99.999')).toBe(100)
  })

  it('gives the same number as the old reading for a plain figure', () => {
    for (const plain of ['120', '2400', '-50', '0.1', '5800', '1234.5', '-2900', '45000.75']) {
      expect(amount(plain)).toBe(parseFloat(plain))
    }
  })

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['abc500'],
    ['1e15'],
    ['1E3'],
    ['12abc'],
    ['--5'],
    ['-(5)'],
    ['(5'],
    ['1,2,3'],
    ['1,23,456'],
    ['1.2.3'],
    ['1,234.56.7'],
    ['NaN'],
    ['Infinity'],
    ['0x10'],
    ['5-'],
    ['₱500 PHP'],
    ['1 2'],
  ])('rejects %j', (raw) => {
    expect(amount(raw)).toMatch(/^problem/)
  })

  it('says why: nothing, not a number, or too big', () => {
    expect(readAmount('')).toEqual({ problem: 'No amount' })
    expect(readAmount('abc')).toEqual({ problem: '"abc" is not an amount' })
    expect(readAmount('1e15')).toEqual({ problem: '"1e15" is not an amount' })
    expect(readAmount('1234567890123')).toEqual({ problem: '"1234567890123" is too large' })
  })

  it('stops at twelve digits before the point, where a float still holds the cents', () => {
    expect(amount('999,999,999,999.99')).toBe(999999999999.99)
    expect(amount('1000000000000')).toMatch(/too large/)
    expect(amount('1,000,000,000,000.00')).toMatch(/too large/)
    // Leading zeros are not digits of size.
    expect(amount('0000000000000001')).toBe(1)
  })

  it('gives up at once on a field far longer than any amount', () => {
    const started = Date.now()
    expect(amount('1' + ' '.repeat(200000) + 'x')).toMatch(/^problem/)
    expect(amount('9'.repeat(65))).toMatch(/^problem/)
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('does not take an invisible character for part of the number', () => {
    expect(amount(`${BOM}${ZWSP}1,234.50${ZWJ}`)).toBe(1234.5)
  })
})

describe('types', () => {
  it.each([
    ['expense', 'expense'], ['Expense', 'expense'], ['debit', 'expense'], ['DEBIT', 'expense'], ['withdrawal', 'expense'],
    ['inflow', 'inflow'], ['income', 'inflow'], ['credit', 'inflow'], ['Deposit', 'inflow'],
    ['transfer', 'transfer'], [' Transfer ', 'transfer'],
  ])('reads %j as %s', (raw, expected) => {
    expect(readType(raw)).toEqual({ value: expected })
  })

  it('rejects a word it does not know, a blank, and a name from the prototype', () => {
    expect(readType('payment')).toEqual({ problem: '"payment" is not a type Spendr knows' })
    expect(readType('')).toEqual({ problem: 'No type' })
    expect(readType('constructor')).toMatchObject({ problem: expect.any(String) })
    expect(readType('__proto__')).toMatchObject({ problem: expect.any(String) })
  })
})

/** The calendar day a stored instant falls on, in the reader's own timezone. @param {string} iso */
const localDay = (iso) => {
  const d = new Date(iso)
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
}
/** @param {unknown} raw @param {import('./csv').DateOrder} [order] */
const day = (raw, order) => {
  const r = readDate(raw, order)
  return 'value' in r ? localDay(r.value) : `problem: ${r.problem}`
}

describe('dates', () => {
  it('reads a bare day as that local day, as it always did', () => {
    expect(day('2026-09-30')).toEqual([2026, 9, 30])
    expect(day('2026-9-3')).toEqual([2026, 9, 3])
    expect(day('2026/09/30')).toEqual([2026, 9, 30])
    // Noon, so no timezone moves it to the day before or after.
    expect(new Date(/** @type {any} */ (readDate('2026-09-30')).value).getHours()).toBe(12)
    expect(readDate('2026-09-30')).toEqual({ value: new Date(2026, 8, 30, 12).toISOString() })
  })

  it('leaves an instant, and an instant with an offset, as the app keeps them', () => {
    expect(readDate('2026-09-30T04:12:00.000Z')).toEqual({ value: '2026-09-30T04:12:00.000Z' })
    expect(readDate('2026-09-30T20:00:00+08:00')).toEqual({ value: '2026-09-30T12:00:00.000Z' })
    expect(readDate('2026-10-03T23:30:00+08:00')).toEqual({ value: '2026-10-03T15:30:00.000Z' })
  })

  it('reads a day written in words', () => {
    expect(day('03 Oct 2026')).toEqual([2026, 10, 3])
    expect(day('3 October 2026')).toEqual([2026, 10, 3])
    expect(day('Oct 3, 2026')).toEqual([2026, 10, 3])
    expect(day('October 3rd, 2026')).toEqual([2026, 10, 3])
    expect(day('3-Sep-2026')).toEqual([2026, 9, 3])
    expect(day('Sept 3 2026')).toEqual([2026, 9, 3])
    expect(day('Mar. 31, 2026')).toEqual([2026, 3, 31])
  })

  it('keeps a time of day written after a date', () => {
    const afternoon = /** @type {any} */ (readDate('3 Oct 2026 2:35 pm')).value
    const d = new Date(afternoon)
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([3, 14, 35])
    expect(new Date(/** @type {any} */ (readDate('31/12/2026 09:05')).value).getHours()).toBe(9)
    expect(readDate('31/12/2026 25:00')).toMatchObject({ problem: expect.stringContaining("Can't read") })
    expect(readDate('31/12/2026 13:00 pm')).toMatchObject({ problem: expect.stringContaining("Can't read") })
  })

  it('rejects a day that does not exist, rather than moving it to one that does', () => {
    expect(readDate('2026-02-30')).toEqual({ problem: '"2026-02-30" is not a real date' })
    expect(readDate('2026-13-01')).toEqual({ problem: '"2026-13-01" is not a real date' })
    expect(readDate('2026-00-10')).toMatchObject({ problem: expect.stringContaining('not a real date') })
    expect(readDate('31/02/2026')).toMatchObject({ problem: expect.stringContaining('not a real date') })
    expect(readDate('31/04/2026')).toMatchObject({ problem: expect.stringContaining('not a real date') })
    expect(readDate('13/13/2026')).toMatchObject({ problem: expect.stringContaining('not a real date') })
    expect(readDate('30 Feb 2026')).toMatchObject({ problem: expect.stringContaining('not a real date') })
    // Date.parse takes this for 2 March; the day is checked before it is asked.
    expect(readDate('2026-02-30T10:00:00Z')).toMatchObject({ problem: expect.stringContaining('not a real date') })
    // 2028 has a 29 February and 2026 does not.
    expect(day('2028-02-29')).toEqual([2028, 2, 29])
    expect(readDate('2026-02-29')).toMatchObject({ problem: expect.any(String) })
  })

  it('rejects a missing date, a year no wallet has, and words that are not a date', () => {
    expect(readDate('')).toEqual({ problem: 'No date' })
    expect(readDate('  ')).toEqual({ problem: 'No date' })
    expect(readDate(undefined)).toEqual({ problem: 'No date' })
    expect(readDate('0001-01-01')).toMatchObject({ problem: expect.stringContaining('not a real date') })
    expect(readDate('9999-12-31')).toMatchObject({ problem: expect.stringContaining('not a real date') })
    expect(readDate('next friday')).toEqual({ problem: `Can't read the date "next friday"` })
    expect(readDate('1/2/3')).toMatchObject({ problem: expect.stringContaining("Can't read") })
    expect(readDate('46300')).toMatchObject({ problem: expect.stringContaining("Can't read") })
    expect(readDate('3 Octember 2026')).toMatchObject({ problem: expect.stringContaining("Can't read") })
  })

  it('gives up at once on a field far longer than any date', () => {
    const started = Date.now()
    expect(readDate('31/12/2026' + ' '.repeat(200000) + 'x')).toMatchObject({ problem: expect.any(String) })
    expect(dateOrderOf(['31/12/2026' + ' '.repeat(200000) + 'x'])).toBe('unknown')
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('quotes a long value short enough to sit in a sentence', () => {
    const r = readDate('x'.repeat(500))
    expect('problem' in r && r.problem.length).toBeLessThan(60)
  })

  it('reads the slash order the file settles, and day first when it never does', () => {
    expect(day('31/12/2026')).toEqual([2026, 12, 31])
    expect(day('12/31/2026')).toEqual([2026, 12, 31])
    // The same text, three ways round.
    expect(day('12/03/2026', 'dmy')).toEqual([2026, 3, 12])
    expect(day('12/03/2026', 'mdy')).toEqual([2026, 12, 3])
    expect(day('12/03/2026', 'unknown')).toEqual([2026, 3, 12])
    expect(day('12/03/2026')).toEqual([2026, 3, 12])
    // A two-digit year, dots and dashes all work the same way.
    expect(day('31.12.26')).toEqual([2026, 12, 31])
    expect(day('12-03-2026', 'mdy')).toEqual([2026, 12, 3])
  })

  it('says when the order was a guess, and only then', () => {
    expect(readDate('12/03/2026', 'unknown')).toMatchObject({ guessed: true })
    expect(readDate('12/03/2026', 'dmy')).not.toHaveProperty('guessed')
    expect(readDate('12/03/2026', 'mdy')).not.toHaveProperty('guessed')
    // 5/5 is the same day whichever way: nothing to say.
    expect(readDate('05/05/2026', 'unknown')).not.toHaveProperty('guessed')
    // A first number over 12 settles it for that date.
    expect(readDate('31/12/2026', 'unknown')).not.toHaveProperty('guessed')
  })

  it('refuses an unclear date in a file that contradicts itself', () => {
    expect(readDate('12/03/2026', 'mixed')).toMatchObject({ problem: expect.stringContaining("Can't tell the day from the month") })
    // The ones that are clear are still read.
    expect(day('31/12/2026', 'mixed')).toEqual([2026, 12, 31])
    expect(day('12/31/2026', 'mixed')).toEqual([2026, 12, 31])
    expect(day('05/05/2026', 'mixed')).toEqual([2026, 5, 5])
  })

  it('works out the order from the whole file', () => {
    expect(dateOrderOf([])).toBe('unknown')
    expect(dateOrderOf(['12/03/2026', '2026-09-30'])).toBe('unknown')
    expect(dateOrderOf(['12/03/2026', '31/12/2026'])).toBe('dmy')
    expect(dateOrderOf(['12/03/2026', '12/31/2026'])).toBe('mdy')
    expect(dateOrderOf(['31/12/2026', '12/31/2026'])).toBe('mixed')
    // A date that is no date either way tells nothing.
    expect(dateOrderOf(['13/13/2026', '12/03/2026'])).toBe('unknown')
    // A time on the end does not hide the numbers.
    expect(dateOrderOf(['12/03/2026 10:00', '31/12/2026 9:15 am'])).toBe('dmy')
  })

  it('keeps normalizeDate as it was for anything that is not a date', () => {
    expect(normalizeDate('2026-09-30T04:12:00.000Z')).toBe('2026-09-30T04:12:00.000Z')
    expect(normalizeDate('last tuesday')).toBe('last tuesday')
    expect(normalizeDate('2026-13-01')).toBe('2026-13-01')
    expect(normalizeDate('')).toBe('')
  })
})

/** The tester's files, row for row. */
const TABLE_HEAD = 'tx_id,type,transaction_date,description,category,from_account,to_account,amount'

describe('rows in a file with mistakes in it', () => {
  const amounts = parseCSV([
    TABLE_HEAD,
    ',expense,2026-10-01,"AMT thousands, quoted",Food,Cash,,"1,234.50"',
    ',expense,2026-10-01,AMT peso sign,Food,Cash,,₱500',
    ',expense,2026-10-01,AMT negative expense,Food,Cash,,-250',
    ',expense,2026-10-01,AMT tiny,Food,Cash,,0.005',
    ',expense,2026-10-01,AMT huge,Food,Cash,,1e15',
    ',expense,2026-10-01,AMT words,Food,Cash,,abc',
    ',Expense,2026-10-01,AMT capital type,Food,Cash,,100',
    ',debit,2026-10-01,AMT unknown type,Food,Cash,,100',
    ',expense,2026-10-01,AMT many decimals,Food,Cash,,12.345678',
  ].join('\r\n')).rows
  /** @param {string} d */
  const byDesc = (d) => amounts.find(r => r.description === d)

  it('reads the amounts that are amounts', () => {
    expect(byDesc('AMT thousands, quoted')?.amount).toBe(1234.5)
    expect(byDesc('AMT peso sign')?.amount).toBe(500)
    expect(byDesc('AMT negative expense')?.amount).toBe(-250)
    expect(byDesc('AMT tiny')?.amount).toBe(0.01)
    expect(byDesc('AMT many decimals')?.amount).toBe(12.35)
    expect(byDesc('AMT capital type')).toMatchObject({ type: 'expense', amount: 100, account: 'Cash' })
  })

  it('marks the ones that are not, with the reason, and keeps them in the list', () => {
    expect(amounts).toHaveLength(9)
    expect(byDesc('AMT huge')?.problem).toBe('"1e15" is not an amount')
    expect(byDesc('AMT words')?.problem).toBe('"abc" is not an amount')
    // 'debit' is a word a bank uses and is read as an expense, with its account.
    expect(byDesc('AMT unknown type')).toMatchObject({ type: 'expense', account: 'Cash', amount: 100 })
    for (const good of ['AMT thousands, quoted', 'AMT peso sign', 'AMT tiny', 'AMT capital type', 'AMT many decimals', 'AMT unknown type']) {
      expect(byDesc(good)).not.toHaveProperty('problem')
    }
  })

  it('marks a type it does not know, and says so with the amount reason too', () => {
    const { rows } = parseCSV([TABLE_HEAD, ',payment,2026-10-01,Odd,Food,Cash,,abc'].join('\n'))
    expect(rows[0].problem).toBe('"payment" is not a type Spendr knows; "abc" is not an amount')
    expect(rows[0].amount).toBe(0)
  })

  it('reads a bank file: debit and credit, with the account on the right side', () => {
    const { rows } = parseCSV([
      TABLE_HEAD,
      ',debit,2026-10-01,Coffee,Food,Cash,,120',
      ',Credit,2026-10-02,Pay,Salary,,BPI,5000',
      ',Withdrawal,2026-10-03,ATM,Cash out,BPI,,1000',
      ',Deposit,2026-10-04,Top up,Salary,,GCash,300',
      ',income,2026-10-05,Gift,Salary,,GCash,200',
    ].join('\n'))
    expect(rows.map(r => [r.type, r.account])).toEqual([
      ['expense', 'Cash'], ['inflow', 'BPI'], ['expense', 'BPI'], ['inflow', 'GCash'], ['inflow', 'GCash'],
    ])
    expect(rows.some(r => r.problem)).toBe(false)
  })

  const dates = parseCSV([
    TABLE_HEAD,
    ',expense,31/12/2026,DATE day first,Food,Cash,,111',
    ',expense,2026-02-30,DATE feb 30,Food,Cash,,222',
    ',expense,12/03/2026,DATE ambiguous,Food,Cash,,333',
    ',expense,,DATE none,Food,Cash,,444',
    ',expense,2026-13-01,DATE month 13,Food,Cash,,555',
    ',expense,2026-10-03T23:30:00+08:00,DATE with offset,Food,Cash,,666',
    ',expense,03 Oct 2026,DATE words,Food,Cash,,777',
  ].join('\r\n')).rows
  /** @param {string} d */
  const dateOf = (d) => dates.find(r => r.description === d)

  it('reads the dates that are dates, the slash ones the way the file shows', () => {
    expect(localDay(dateOf('DATE day first')?.date)).toEqual([2026, 12, 31])
    // 31/12 in the same file says the file is day first, so 12/03 is 12 March.
    expect(localDay(dateOf('DATE ambiguous')?.date)).toEqual([2026, 3, 12])
    expect(dateOf('DATE with offset')?.date).toBe('2026-10-03T15:30:00.000Z')
    expect(localDay(dateOf('DATE words')?.date)).toEqual([2026, 10, 3])
    // The file settled the order, so nothing was a guess.
    expect(dates.some(r => r.dateGuess)).toBe(false)
  })

  it('marks the impossible and the missing, and leaves what was written for the list to show', () => {
    expect(dateOf('DATE feb 30')).toMatchObject({ problem: '"2026-02-30" is not a real date', date: '2026-02-30' })
    expect(dateOf('DATE month 13')?.problem).toBe('"2026-13-01" is not a real date')
    expect(dateOf('DATE none')).toMatchObject({ problem: 'No date', date: '' })
    expect(dates.filter(r => r.problem)).toHaveLength(3)
  })

  it('reads day first when the whole file is unclear, and flags those rows', () => {
    const { rows } = parseCSV([
      TABLE_HEAD,
      ',expense,12/03/2026,Unclear,Food,Cash,,1',
      ',expense,05/05/2026,Same either way,Food,Cash,,2',
      ',expense,2026-09-30,Plain,Food,Cash,,3',
    ].join('\n'))
    expect(localDay(rows[0].date)).toEqual([2026, 3, 12])
    expect(rows[0].dateGuess).toBe(true)
    expect(rows[1]).not.toHaveProperty('dateGuess')
    expect(rows[2]).not.toHaveProperty('dateGuess')
  })

  it('reads month first when the file shows it', () => {
    const { rows } = parseCSV([
      TABLE_HEAD,
      ',expense,12/03/2026,Unclear,Food,Cash,,1',
      ',expense,12/31/2026,Month first,Food,Cash,,2',
    ].join('\n'))
    expect(localDay(rows[0].date)).toEqual([2026, 12, 3])
    expect(rows[0]).not.toHaveProperty('dateGuess')
  })

  it('refuses the unclear rows of a file that says both', () => {
    const { rows } = parseCSV([
      TABLE_HEAD,
      ',expense,31/12/2026,Day first,Food,Cash,,1',
      ',expense,12/31/2026,Month first,Food,Cash,,2',
      ',expense,12/03/2026,Unclear,Food,Cash,,3',
    ].join('\n'))
    expect(rows[0]).not.toHaveProperty('problem')
    expect(rows[1]).not.toHaveProperty('problem')
    expect(rows[2].problem).toContain("Can't tell the day from the month")
  })

  it('reads the same in Spendr s own layout', () => {
    const { rows, format } = parseCSV([
      'txId,type,date,description,category,payment,account,fromAccount,toAccount,amount',
      '"a","Debit","31/12/2026","x","Food","","Cash","","","1,234.50"',
      '"b","expense","2026-02-30","y","Food","","Cash","","","abc"',
    ].join('\r\n'))
    expect(format).toBe('spendr')
    expect(rows[0]).toMatchObject({ type: 'expense', amount: 1234.5 })
    expect(localDay(rows[0].date)).toEqual([2026, 12, 31])
    expect(rows[1].problem).toBe('"2026-02-30" is not a real date; "abc" is not an amount')
  })

  it('reads a file with a byte-order mark and semicolons, and its 1.234,50', () => {
    const { rows } = parseCSV(BOM + [
      TABLE_HEAD.replace(/,/g, ';'),
      ';expense;2026-10-02;SEMI one;Food;Cash;;150',
      ';expense;2026-10-02;"SEMI; quoted";Food;Cash;;"1.234,50"',
    ].join('\r\n'))
    expect(rows.map(r => r.amount)).toEqual([150, 1234.5])
    expect(rows.some(r => r.problem)).toBe(false)
  })

  it('does not take a received or base amount of a size no wallet has', () => {
    const { rows } = parseCSV([
      `${TABLE_HEAD},to_amount,to_currency,base_amount,base_currency`,
      ',transfer,2026-10-01,Big,,Cash,BPI,10,1e15,PHP,5000000000000,PHP',
      ',transfer,2026-10-01,Fine,,Cash,BPI,10,580,PHP,-580,PHP',
    ].join('\n'))
    expect(rows[0]).not.toHaveProperty('toAmount')
    expect(rows[0]).not.toHaveProperty('baseAmount')
    expect(rows[1]).toMatchObject({ toAmount: 580, baseAmount: -580 })
  })
})

describe('text from a file', () => {
  /** @param {string} cells  the description, category, account columns */
  const one = (cells) => parseCSV([TABLE_HEAD, `,expense,2026-10-04,${cells},,10`].join('\n')).rows[0]

  it('cuts a description to 100, an account to 40 and a category to 30', () => {
    const row = one(`"${'D'.repeat(6000)}","${'C'.repeat(500)}",${'L'.repeat(5000)}`)
    expect(row.description).toBe('D'.repeat(100))
    expect(row.category).toBe('C'.repeat(30))
    expect(row.account).toBe('L'.repeat(40))
  })

  it('cuts the far end of a transfer too, and the account read from its description', () => {
    const { rows } = parseCSV([
      TABLE_HEAD,
      `,transfer,2026-10-04,Move,,${'A'.repeat(90)},${'B'.repeat(90)},10`,
      `,transfer,2026-10-04,Transfer: ${'X'.repeat(80)} → ${'Y'.repeat(80)},,,,10`,
    ].join('\n'))
    expect([rows[0].fromAccount.length, rows[0].toAccount.length]).toEqual([40, 40])
    expect(rows[1].fromAccount.length).toBe(40)
  })

  it('does not cut an emoji in half, and does not leave a space at the cut', () => {
    const emoji = String.fromCodePoint(0x1F45B)
    const row = one(`x,y,${'a'.repeat(39)}${emoji}`)
    expect(row.account).toBe('a'.repeat(39))
    expect(one(`x,y,${'a'.repeat(39)} bbb`).account).toBe('a'.repeat(39))
    // An emoji that fits is kept whole.
    expect(one(`x,y,Wallet ${emoji}`).account).toBe(`Wallet ${emoji}`)
  })

  it('takes out the characters that draw nothing', () => {
    const row = one(`"Lunch${ZWSP}${ZWJ} ${BOM}out","Fo${ZWSP}od","${RLO}Cash${ZWSP}"`)
    expect(row.description).toBe('Lunch out')
    expect(row.category).toBe('Food')
    expect(row.account).toBe('Cash')
  })

  it('takes every invisible character from the list out of a name', () => {
    const codes = [0x200B, 0x200C, 0x200D, 0xFEFF, 0x2060, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069]
    for (const code of codes) {
      expect(one(`x,y,Ca${String.fromCodePoint(code)}sh`).account).toBe('Cash')
    }
  })

  it('makes a run of spaces in a name one, and leaves a description as written', () => {
    const row = one('"a  b   c","Eating   out","  Wallet    two  "')
    expect(row.account).toBe('Wallet two')
    expect(row.category).toBe('Eating out')
    expect(row.description).toBe('a  b   c')
  })

  it('keeps a category named with HTML as plain text, within its limit', () => {
    expect(one('x,"<img src=x onerror=alert(1)>",Cash').category).toBe('<img src=x onerror=alert(1)>')
    expect(one(`x,"<script>${'s'.repeat(100)}</script>",Cash`).category).toHaveLength(30)
  })

  it('takes off the apostrophe Spendr put before a formula, so a description survives a round trip', () => {
    expect(one(`"'=SUM(1,1)",y,Cash`).description).toBe('=SUM(1,1)')
    expect(one(`"'-5 coupon",y,Cash`).description).toBe('-5 coupon')
    expect(one(`"'+top up",y,Cash`).description).toBe('+top up')
    expect(one(`"'@Starbucks",y,Cash`).description).toBe('@Starbucks')
    // An apostrophe that protected nothing is the person's own.
    expect(one(`"'tis the season",y,Cash`).description).toBe("'tis the season")
    expect(one(`"rock 'n' roll",y,Cash`).description).toBe("rock 'n' roll")
  })
})
