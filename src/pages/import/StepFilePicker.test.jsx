// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

/**
 * A file called STATEMENT.CSV is a CSV file. Windows and a good many banks
 * write the extension in capitals, and the picker refused it as "not .csv".
 */

// csv.js reaches Dexie for one constant; there is no IndexedDB in a jsdom test.
vi.mock('../../db/db', () => ({ default: {}, UNSYNCED: 0 }))

const { StepFilePicker } = await import('./StepFilePicker')

afterEach(cleanup)

const CSV = [
  'tx_id,type,transaction_date,description,category,from_account,to_account,amount',
  ',expense,2026-10-02,Lunch,Food,Cash,,150',
].join('\n')

/** @param {string} name @param {string} [body] */
function pick(name, body = CSV) {
  const onParsed = vi.fn()
  const { container } = render(<StepFilePicker onParsed={onParsed} />)
  const input = /** @type {HTMLInputElement} */ (container.querySelector('input[type=file]'))
  fireEvent.change(input, { target: { files: [new File([body], name, { type: 'text/csv' })] } })
  return onParsed
}

describe('the file picker', () => {
  it.each(['statement.csv', 'STATEMENT.CSV', 'Statement.Csv', 'my bank.cSv'])('accepts %s', async (name) => {
    const onParsed = pick(name)
    await waitFor(() => expect(onParsed).toHaveBeenCalledTimes(1))
    const [rows, format, fileName] = onParsed.mock.calls[0]
    expect(rows).toHaveLength(1)
    expect(format).toBe('table')
    expect(fileName).toBe(name)
    expect(screen.queryByText(/Invalid file type/)).toBeNull()
  })

  it('still refuses a file that is not a CSV, in either case', async () => {
    for (const name of ['statement.txt', 'STATEMENT.XLSX', 'csv', 'data.csv.exe']) {
      cleanup()
      const onParsed = pick(name)
      await waitFor(() => expect(screen.getByText('Invalid file type. Only .csv files are accepted.')).toBeTruthy())
      expect(onParsed).not.toHaveBeenCalled()
    }
  })

  it('hands on the rows with their problems marked, for the preview to show', async () => {
    const onParsed = pick('BANK.CSV', CSV + '\n,expense,2026-02-30,Odd,Food,Cash,,abc')
    await waitFor(() => expect(onParsed).toHaveBeenCalledTimes(1))
    const [rows] = onParsed.mock.calls[0]
    expect(rows).toHaveLength(2)
    expect(rows[0]).not.toHaveProperty('problem')
    expect(rows[1].problem).toBe('"2026-02-30" is not a real date; "abc" is not an amount')
  })
})
