// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

/**
 * Step 3 asks for an opening balance only where there is nothing to build on:
 * an account the import CREATES. An account already in the wallet has a
 * balance, and the import leaves it alone except for the rows it adds - the
 * step used to list every account in the file, pre-filled with its current
 * balance as if that were what it held before the file began.
 */

const accounts = [
  { id: 1, name: 'BPI', type: 'bank', balance: 45000 },
  { id: 2, name: 'Visa', type: 'credit', balance: 0, creditLimit: 50000 },
]

vi.mock('../../db/db', () => ({
  default: { accounts: { toArray: async () => accounts } },
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

const { StepOpeningBalances } = await import('./StepPreview')

afterEach(cleanup)

/** @param {Array<Record<string, any>>} rows */
async function open(rows) {
  const onNext = vi.fn()
  render(<StepOpeningBalances rows={rows} onBack={() => {}} onNext={onNext} />)
  await act(async () => { await Promise.resolve() })
  return onNext
}

describe('Step 3, opening balances', () => {
  it('asks for the accounts the import creates, and not for the ones it already has', async () => {
    await open([
      { type: 'expense', account: 'BPI', amount: 10 },
      { type: 'expense', account: 'Maya', amount: 10 },
    ])
    expect(screen.getByLabelText('Maya, new account')).toBeTruthy()
    expect(screen.queryByLabelText(/^BPI/)).toBeNull()
    expect(screen.queryByText('Accounts you already have keep their balances. Only the transactions in this file are added to them.')).toBeTruthy()
  })

  it('does not pre-fill an opening balance from an existing account', async () => {
    await open([{ type: 'expense', account: 'Maya', amount: 10 }])
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText('Maya, new account')).value).toBe('')
  })

  it('hands on the typed balances for new accounts only, and the limits of cards it has', async () => {
    const onNext = await open([
      { type: 'expense', account: 'BPI', amount: 10 },
      { type: 'expense', account: 'Maya', amount: 10 },
      { type: 'transfer', fromAccount: 'BPI', toAccount: 'Visa', amount: 5 },
    ])
    fireEvent.change(screen.getByLabelText('Maya, new account'), { target: { value: '1250.5' } })
    // The card's own limit comes pre-filled, from the card.
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText('Visa, credit limit')).value).toBe('50000')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onNext).toHaveBeenCalledWith({ balances: { Maya: 1250.5 }, creditLimits: { Visa: 50000 } })
  })

  it('has nothing to ask when every account is already in the wallet, and says so', async () => {
    const onNext = await open([{ type: 'expense', account: 'BPI', amount: 10 }])
    expect(screen.getByText(/Every account in this file is already in your wallet/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onNext).toHaveBeenCalledWith({ balances: {}, creditLimits: {} })
  })

  it('does not ask for an account the wallet has under another spelling, or for one twice', async () => {
    await open([
      { type: 'expense', account: 'bpi', amount: 10 },
      { type: 'expense', account: ' BPI ', amount: 10 },
      { type: 'expense', account: 'Maya', amount: 10 },
      { type: 'expense', account: 'MAYA', amount: 10 },
    ])
    expect(screen.queryByLabelText(/^bpi/i)).toBeNull()
    expect(screen.getAllByLabelText(/maya, new account/i)).toHaveLength(1)
    expect(screen.getByLabelText('Maya, new account')).toBeTruthy()
  })

  it('finds the limit of a card typed in another case', async () => {
    const onNext = await open([{ type: 'expense', account: 'visa', amount: 10 }])
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText('Visa, credit limit')).value).toBe('50000')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onNext).toHaveBeenCalledWith({ balances: {}, creditLimits: { Visa: 50000 } })
  })

  it('does not ask for an account only a left-out row names', async () => {
    await open([
      { type: 'expense', account: 'BPI', amount: 10 },
      { type: 'expense', account: 'Ghost', amount: 0, problem: '"abc" is not an amount' },
    ])
    expect(screen.queryByLabelText(/ghost/i)).toBeNull()
    expect(screen.getByText(/Every account in this file is already in your wallet/)).toBeTruthy()
  })

  it('treats a blank field as nothing, so the new account starts from zero', async () => {
    const onNext = await open([{ type: 'expense', account: 'Maya', amount: 10 }])
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onNext).toHaveBeenCalledWith({ balances: { Maya: 0 }, creditLimits: {} })
  })
})
