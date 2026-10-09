// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

/**
 * The file Spendr itself exports was labelled "From an older version" in the
 * preview, as if it were something to be forgiven. It is now named for what it
 * is, and the table layout, which needs no remark, gets none.
 */

vi.mock('../../db/db', () => ({
  default: {
    accounts: { toArray: async () => [{ id: 1, name: 'BPI', type: 'bank' }] },
    categories: { toArray: async () => [{ id: 1, name: 'Food' }] },
  },
  dbReady: Promise.resolve(),
}))
vi.mock('../../hooks/useLiveQuery', async () => {
  const { useState, useEffect } = await import('react')
  return {
    useLiveQuery: (/** @type {() => Promise<any>} */ q, /** @type {any} */ _deps, /** @type {any} */ initial) => {
      const [v, setV] = useState(initial)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => { let on = true; q().then(r => { if (on) setV(r) }); return () => { on = false } }, [])
      return v
    },
  }
})

const { StepPreview } = await import('./StepPreview')

afterEach(cleanup)

const rows = [
  { txId: 'a', type: 'expense', date: '2026-09-10T04:00:00.000Z', description: 'Lunch', category: 'Food', account: 'BPI', amount: 120 },
  { txId: 'b', type: 'expense', date: '2026-09-11T04:00:00.000Z', description: 'Taxi', category: 'Food', account: 'Maya', amount: 80 },
]

/** @param {import('./csv').CsvFormat} format */
async function open(format) {
  render(<StepPreview rows={rows} format={format} fileName="spendr-export.csv" fileSize={900} onBack={() => {}} onNext={() => {}} />)
  await act(async () => { await Promise.resolve() })
}

describe('the preview of a file', () => {
  it('says a Spendr export is one, and not that it is from an older version', async () => {
    await open('spendr')
    expect(screen.getByText('A Spendr export')).toBeTruthy()
    expect(screen.queryByText(/older version/i)).toBeNull()
  })

  it('has no remark about the table layout', async () => {
    await open('table')
    expect(screen.queryByText('A Spendr export')).toBeNull()
    expect(screen.queryByText(/older version/i)).toBeNull()
  })

  it('does not promise a zero balance for an account it will create', async () => {
    await open('spendr')
    expect(screen.getByText(/"Maya" will be created as a Cash account/)).toBeTruthy()
    expect(screen.queryByText(/0\.00 balance|0 balance/)).toBeNull()
  })
})

/**
 * A row the parser could not read is shown with its reason and is not
 * imported; the rest of the file is previewed and imported as normal.
 */
describe('the preview of a file with rows that cannot be read', () => {
  const good = { txId: 'a', type: 'expense', date: '2026-09-10T04:00:00.000Z', description: 'Lunch', category: 'Food', account: 'BPI', amount: 120 }
  const badAmount = { txId: 'b', type: 'expense', date: '2026-09-11T04:00:00.000Z', description: 'Taxi ride', category: 'Ghost category', account: 'Ghost', amount: 0, problem: '"abc" is not an amount' }
  const badDate = { txId: 'c', type: 'expense', date: '2026-02-30', description: 'Dinner', category: 'Food', account: 'BPI', amount: 5, problem: '"2026-02-30" is not a real date' }

  /** @param {Array<Record<string, any>>} fileRows @param {() => void} [onNext] */
  async function openWith(fileRows, onNext = () => {}) {
    render(<StepPreview rows={fileRows} format="table" fileName="bank.csv" fileSize={900} onBack={() => {}} onNext={onNext} />)
    await act(async () => { await Promise.resolve() })
  }

  /** The value shown beside a summary label. @param {string} label */
  const summary = (label) => screen.getByText(label).parentElement?.textContent

  it('lists each one with the reason, and counts them apart from the rest', async () => {
    await openWith([good, badAmount, badDate])
    expect(screen.getByText('Rows left out')).toBeTruthy()
    expect(screen.getByText('"abc" is not an amount')).toBeTruthy()
    expect(screen.getByText('"2026-02-30" is not a real date')).toBeTruthy()
    expect(screen.getByText('Row 2 · Taxi ride')).toBeTruthy()
    expect(screen.getByText('Row 3 · Dinner')).toBeTruthy()
    expect(summary('Left out')).toBe('Left out2')
    // Only the readable row is a transaction to import.
    expect(summary('Total transactions')).toBe('Total transactions1')
    expect(summary('Expenses')).toBe('Expenses1')
  })

  it('previews only the rows that will be imported', async () => {
    await openWith([good, badAmount, badDate])
    // A header row and the one good row.
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getAllByText('Lunch')).toHaveLength(1)
  })

  it('does not ask for the accounts and categories only a left-out row names', async () => {
    await openWith([good, badAmount])
    expect(screen.queryByText('Ghost')).toBeNull()
    expect(screen.queryByText(/Ghost category/)).toBeNull()
    expect(screen.queryByText(/not in your wallet/)).toBeNull()
  })

  it('says nothing about left-out rows when there are none', async () => {
    await openWith([good])
    expect(screen.queryByText('Rows left out')).toBeNull()
    expect(screen.queryByText('Left out')).toBeNull()
  })

  it('goes on with the rest', async () => {
    const onNext = vi.fn()
    await openWith([good, badAmount], onNext)
    const go = /** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Continue' }))
    expect(go.disabled).toBe(false)
    act(() => go.click())
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('cannot go on when nothing in the file can be imported', async () => {
    await openWith([badAmount, badDate])
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Continue' })).disabled).toBe(true)
    expect(summary('Total transactions')).toBe('Total transactions0')
  })

  it('shows only the first few reasons, and how many more there are', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ ...badAmount, txId: `m-${i}`, description: `Row ${i}` }))
    await openWith([good, ...many])
    expect(screen.getAllByText('"abc" is not an amount')).toHaveLength(8)
    expect(screen.getByText('+3 more left out')).toBeTruthy()
    expect(summary('Left out')).toBe('Left out11')
  })

  it('says the dates were read day first when the file never said, and only then', async () => {
    await openWith([{ ...good, dateGuess: true }])
    expect(screen.getByText('Dates read day first')).toBeTruthy()
    expect(screen.getByText(/that is 12 March/)).toBeTruthy()
    cleanup()
    await openWith([good])
    expect(screen.queryByText('Dates read day first')).toBeNull()
  })

  it('does not count a left-out row as a guess', async () => {
    await openWith([good, { ...badAmount, dateGuess: true }])
    expect(screen.queryByText('Dates read day first')).toBeNull()
  })

  it('shows an account the wallet has under the wallet s own spelling, and does not call it new', async () => {
    await openWith([{ ...good, account: 'bpi', category: 'FOOD ' }, { ...good, txId: 'a2', account: ' BPI', category: 'food' }])
    // One chip each, under the names the wallet has.
    expect(screen.getByText('Accounts in file').parentElement?.textContent).toBe('Accounts in fileBPI')
    expect(screen.getByText('Categories in file').parentElement?.textContent).toBe('Categories in fileFood')
    expect(screen.queryByText(/not in your wallet/)).toBeNull()
    expect(screen.queryByText(/not found/)).toBeNull()
  })

  it('still says an account the wallet lacks is new, once, in the first spelling', async () => {
    await openWith([{ ...good, account: 'Maya' }, { ...good, txId: 'a2', account: 'maya' }])
    expect(screen.getByText('1 account not in your wallet')).toBeTruthy()
    expect(screen.getByText(/"Maya" will be created as a Cash account/)).toBeTruthy()
  })
})
