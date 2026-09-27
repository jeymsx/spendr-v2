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
})
