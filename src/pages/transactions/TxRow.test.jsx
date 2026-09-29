// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

/**
 * A row in the ledger: its category tile opens the category picker, the
 * rest of it opens the transaction - and a row whose category cannot be
 * changed from here stays one button.
 */

vi.mock('../../db/db', () => ({ default: {}, dbReady: Promise.resolve() }))
const { TxRow } = await import('./FilterSheet')

afterEach(cleanup)

const catMap = { Food: { name: 'Food', color: '#f59e0b', icon: '🍔' } }
const lunch = { id: 1, type: 'expense', amount: 250, category: 'Food', description: 'Lunch', account: 'GCash', date: '2026-09-27T04:00:00.000Z' }

describe('TxRow', () => {
  it('gives the tile a button of its own, named for what it does', () => {
    const onCategory = vi.fn()
    const onClick = vi.fn()
    render(<TxRow tx={lunch} catMap={catMap} onClick={onClick} onCategory={onCategory} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change category, now Food' }))
    expect(onCategory).toHaveBeenCalledWith(lunch)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('the rest of the row still opens the transaction', () => {
    const onClick = vi.fn()
    render(<TxRow tx={lunch} catMap={catMap} onClick={onClick} onCategory={() => {}} />)
    fireEvent.click(screen.getByText('Lunch'))
    expect(onClick).toHaveBeenCalledWith(lunch)
  })

  it('a transfer is one button: it has no category to change', () => {
    render(<TxRow tx={{ id: 2, type: 'transfer', amount: 500, fromAccount: 'BPI', toAccount: 'GCash', date: lunch.date }}
      catMap={catMap} onClick={() => {}} onCategory={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('without onCategory, every row is one button, as on Home', () => {
    render(<TxRow tx={lunch} catMap={catMap} onClick={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('a loan payment is one row: the loan, the whole payment, and the transfer it stands for', () => {
    const principal = { id: 3, type: 'transfer', amount: 9150, fromAccount: 'BPI', toAccount: 'Car Loan', description: 'Loan payment · Car Loan', date: lunch.date }
    const interest = { id: 4, type: 'expense', amount: 3700, account: 'BPI', category: 'Loan interest', description: 'Interest · Car Loan', date: lunch.date }
    const onClick = vi.fn()
    render(<TxRow tx={{ ...principal, loanInterest: interest }} catMap={catMap} onClick={onClick} onCategory={() => {}} />)
    expect(screen.getByText('Car Loan')).toBeTruthy()
    // One caption, a space either side of the dot: "BPI · Loan payment".
    expect(screen.getByText(/^\S.* · Loan payment$/)).toBeTruthy()
    expect(screen.getByText(/12,850\.00/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledWith(principal)
  })

  it('says what the app own rows are, where their category would mislead', () => {
    render(<TxRow tx={{ id: 5, type: 'inflow', amount: 500, category: 'Income', adjust: 'correction', description: 'Balance adjustment', account: 'GCash', date: lunch.date }}
      catMap={catMap} onClick={() => {}} />)
    expect(screen.getByText(/^\S.* · Adjustment$/)).toBeTruthy()
    cleanup()
    render(<TxRow tx={{ id: 6, type: 'expense', amount: 1000, category: 'Debt Payment', description: 'Paid Ana back', account: 'GCash', date: lunch.date }}
      catMap={catMap} onClick={() => {}} />)
    expect(screen.getByText(/^\S.* · Debt$/)).toBeTruthy()
  })
})
