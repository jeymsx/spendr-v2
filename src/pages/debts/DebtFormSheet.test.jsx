// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

/**
 * The debt form's "Already paid" row.
 *
 * It ran its value through a [0-9.] strip BEFORE handing it to
 * moneyChangeHandler, so the handler never saw the minus it exists to refuse:
 * "-500" went in as a positive 500. The handler drops the peso mark itself,
 * so the strip was doing nothing else.
 */

vi.mock('../../db/db', () => ({ default: {}, UNSYNCED: 0, SYNCED: 1, SYNCED_TABLES: [] }))
vi.mock('../../lib/sync', () => ({ deleteDebtRemote: vi.fn() }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: () => {}, dismiss: () => {} }),
}))

const { DebtFormSheet } = await import('./DebtFormSheet')

afterEach(cleanup)

/** Puts `value` in the field as a keystroke or paste would, and returns what it shows after. */
function enter(/** @type {HTMLElement} */ el, /** @type {string} */ value) {
  fireEvent.change(el, { target: { value } })
  return /** @type {HTMLInputElement} */ (el).value
}

const debt = { id: 1, contact: 'Gelo', type: 'i_owe', amount: 1000, amountPaid: 200 }

describe('Already paid', () => {
  const open = () => render(<DebtFormSheet open onClose={() => {}} editDebt={debt} />)

  it('refuses a minus instead of reading it as a positive', () => {
    open()
    const f = screen.getByDisplayValue('₱200')
    expect(enter(f, '-₱200')).toBe('₱200')
    expect(enter(f, '-500')).toBe('₱200')
    expect(enter(f, '₱2e3')).toBe('₱200')
  })

  it('still takes the figure through the mark, grouped', () => {
    open()
    expect(enter(screen.getByDisplayValue('₱200'), '₱2001')).toBe('₱2,001')
  })
})
