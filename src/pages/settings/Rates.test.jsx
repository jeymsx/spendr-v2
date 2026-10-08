// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The page's empty state, which used to tell a ledger with no foreign account
 * to "tap Update" when there is no such button - the one that is there says
 * Retry, and only when the rates are stale, failed or loading.
 */

/** @type {{current: Record<string, any>}} */
const rates = { current: {} }
vi.mock('../../hooks/useRates', () => ({ default: () => rates.current, useRates: () => rates.current }))
vi.mock('../../context/CurrencyContext', () => ({ useBaseCurrency: () => 'PHP' }))
vi.mock('../../hooks/useScrollLock', () => ({ useScrollLock: () => {} }))

const { default: RatesPage } = await import('./Rates')
const { ThemeProvider } = await import('../../context/ThemeContext')

afterEach(cleanup)

/** @param {Record<string, any>} over */
function show(over) {
  rates.current = { table: null, needed: false, foreign: [], missing: [], stale: false, busy: false, error: null, refresh: vi.fn(), ...over }
  render(<ThemeProvider><MemoryRouter><RatesPage /></MemoryRouter></ThemeProvider>)
}

describe('Exchange rates, with none downloaded', () => {
  it('says what to tap only when there is a button to tap', () => {
    show({ needed: true, foreign: ['USD'], stale: true })
    expect(screen.getByText('Connect to the internet, then tap Retry.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('says why there is nothing, on a ledger that needs no rate', () => {
    show({})
    expect(screen.getByText('Rates download once an account holds another currency.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByText(/tap Retry|tap Update/)).toBeNull()
  })
})
