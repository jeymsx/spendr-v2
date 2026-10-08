// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The limit editor's save: what it writes for the carry button.
 *
 * The button used to be unable to do anything while the global "Carry budgets
 * over" switch was on - its save skipped whenever the state it showed equalled
 * the switch's - and never wrote the month a carry starts from for a category
 * that was only rolling by default. lib/rollover.test.js pins the rules; this
 * pins that the page hands its taps to them, and writes what comes back.
 */

const month = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()

/** @type {{ categories: Array<Record<string, any>>, meta: Array<Record<string, any>> }} */
const store = { categories: [], meta: [] }
const update = vi.fn(async () => 1)

vi.mock('../../db/db', () => ({
  default: {
    categories: {
      toArray: async () => store.categories,
      update: (/** @type {any[]} */ ...a) => update(...a),
    },
    meta: { toArray: async () => store.meta },
    transaction: async (/** @type {any} */ _mode, /** @type {any} */ _tables, /** @type {() => Promise<any>} */ fn) => fn(),
  },
  UNSYNCED: 0,
  SYNCED: 1,
  SYNCED_TABLES: [],
}))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: () => {}, dismiss: () => {} }),
}))
vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', accentColor: '#2D9DFF' }),
  useIsDark: () => false,
}))
vi.mock('../../hooks/useLiveQuery', async () => {
  const { useEffect, useState } = await import('react')
  return {
    /** @param {() => Promise<any>} querier */
    useLiveQuery: (querier, _deps, initial) => {
      const [value, setValue] = useState(initial)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => { querier().then(setValue) }, [])
      return value
    },
  }
})

const { BudgetsPage } = await import('./Budgets')

const GROCERIES = { id: 1, name: 'Groceries', type: 'expense', budget: 5000, color: '#10b981' }
const FUN = { id: 2, name: 'Fun', type: 'expense', budget: 0, color: '#f59e0b' }
const renderPage = () => render(<MemoryRouter><BudgetsPage /></MemoryRouter>)
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

beforeEach(() => {
  store.categories = [GROCERIES, FUN]
  store.meta = []
  update.mockClear()
})
afterEach(cleanup)

describe('the carry button', () => {
  it('opts a category in explicitly, and starts its carry this month', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Carry Groceries over' }))
    save()
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls).toEqual([[1, { rollover: true, rolloverFrom: month }]])
  })

  /** With the switch on it shows as on already; tapping it is an opt-out, and that has to save. */
  it('opts a category out against a global switch that is on', async () => {
    store.meta = [{ key: 'budgetRollover', value: true }]
    renderPage()
    const button = await screen.findByRole('button', { name: 'Carry Groceries over' })
    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(button)
    save()
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls).toEqual([[1, { rollover: false }]])
  })

  it('writes nothing for a tap and a tap back', async () => {
    store.meta = [{ key: 'budgetRollover', value: true }]
    store.categories = [{ ...GROCERIES, rolloverFrom: month }, FUN]
    renderPage()
    const button = await screen.findByRole('button', { name: 'Carry Groceries over' })
    fireEvent.click(button)
    fireEvent.click(button)
    // Nothing is pending, so there is nothing to save: the button stays off.
    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })
})

describe('a new limit', () => {
  /** The switch is on and Fun has no start: its first limit is when its carry begins. */
  it('starts the carry of a rolling category given its first limit', async () => {
    store.meta = [{ key: 'budgetRollover', value: true }]
    renderPage()
    fireEvent.change(await screen.findByLabelText('Fun monthly limit'), { target: { value: '2000' } })
    save()
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls).toEqual([[2, { budget: 2000, rolloverFrom: month }]])
  })

  it('writes just the limit when the category does not roll', async () => {
    renderPage()
    fireEvent.change(await screen.findByLabelText('Fun monthly limit'), { target: { value: '2000' } })
    save()
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls).toEqual([[2, { budget: 2000 }]])
  })
})
