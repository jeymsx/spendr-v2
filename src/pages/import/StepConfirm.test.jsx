// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'

/**
 * Step 4 says what is about to be written. A row the parser could not read is
 * not part of that: it is not counted, its accounts are not announced, and
 * what is sent to be written is only what can be.
 */

const runImport = vi.fn(async (/** @type {any} */ _args) => ({ imported: 2, skipped: 0 }))
vi.mock('./runImport', () => ({ runImport: (/** @type {any} */ a) => runImport(a) }))
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

const { StepConfirm } = await import('./StepConfirm')

afterEach(() => { cleanup(); runImport.mockClear() })

const good = { txId: 'a', type: 'expense', date: '2026-09-10T04:00:00.000Z', description: 'Lunch', category: 'Food', account: 'BPI', amount: 120 }
const good2 = { ...good, txId: 'b', description: 'Taxi' }
const bad = { ...good, txId: 'c', description: 'Dinner', account: 'Ghost', category: 'Phantom', amount: 0, problem: '"abc" is not an amount' }

/** @param {Array<Record<string, any>>} rows @param {(...a: any[]) => void} [onDone] */
async function open(rows, onDone = () => {}) {
  render(<StepConfirm rows={rows} openingBalances={{}} creditLimits={{}} onBack={() => {}} onDone={onDone} />)
  await act(async () => { await Promise.resolve() })
}

describe('Step 4, confirm', () => {
  it('counts only the rows that can be imported, and says how many are left out', async () => {
    await open([good, good2, bad])
    expect(screen.getByText('2 transactions will be processed')).toBeTruthy()
    expect(screen.getByText('1 row has a problem and will be left out')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import 2 transactions' })).toBeTruthy()
  })

  it('says nothing about problems when there are none', async () => {
    await open([good, good2])
    expect(screen.queryByText(/problem and will be left out/)).toBeNull()
    expect(screen.queryByText(/problems? and will be left out/)).toBeNull()
  })

  it('pluralises the rows left out', async () => {
    await open([good, bad, { ...bad, txId: 'd' }])
    expect(screen.getByText('2 rows have a problem and will be left out')).toBeTruthy()
  })

  it('does not announce an account or category that only a left-out row names', async () => {
    await open([good, bad])
    expect(screen.queryByText(/will be created/)).toBeNull()
    expect(screen.queryByText(/Ghost/)).toBeNull()
    expect(screen.queryByText(/Phantom/)).toBeNull()
  })

  it('does not announce an account the wallet has under another spelling', async () => {
    await open([{ ...good, account: 'bpi', category: 'food' }])
    expect(screen.queryByText(/will be created/)).toBeNull()
  })

  it('announces a new account once, however it is spelled', async () => {
    await open([{ ...good, account: 'Maya' }, { ...good2, account: 'MAYA ' }])
    expect(screen.getByText('1 account will be created')).toBeTruthy()
    expect(screen.getByText(/^Maya · as Cash$/)).toBeTruthy()
  })

  it('writes the rows, and the import itself leaves out the ones with a problem', async () => {
    const onDone = vi.fn()
    await open([good, good2, bad], onDone)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Import 2 transactions' })) })
    expect(runImport).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(2, 0)
  })

  it('cannot be started when every row has a problem', async () => {
    await open([bad, { ...bad, txId: 'd' }])
    const button = /** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Import 0 transactions' }))
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(runImport).not.toHaveBeenCalled()
  })
})
