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
