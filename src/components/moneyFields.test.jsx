// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

/**
 * The amount fields that used to strip their own input to [0-9.].
 *
 * Each one turned "-500" into 500 and "1e5" into 15, took any number of
 * places whatever the currency, and let a stuck key grow the figure without
 * end. They now go through utils/moneyInput.js (typedAmount, typedMoneyDigits)
 * and these pin it at the field: what the input SHOWS after a keystroke or a
 * paste, which is the thing a person sees.
 *
 * The contexts and the database are mocked, as in smoke.test.jsx: none of
 * them says anything about what a field does with a keystroke.
 */

vi.mock('../db/db', () => ({ default: {}, UNSYNCED: 0, SYNCED: 1, SYNCED_TABLES: [] }))
vi.mock('../db/txHelpers', () => ({
  postRefund: vi.fn(), reverseBalanceEffect: vi.fn(), applyBalanceEffect: vi.fn(),
}))
vi.mock('../db/trash', () => ({ moveToTrash: vi.fn(), restoreFromTrash: vi.fn() }))
vi.mock('../hooks/useLiveQuery', () => ({
  useLiveQuery: (/** @type {any} */ _q, /** @type {any} */ _d, /** @type {any} */ fallback) => fallback,
}))
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: () => {}, accentColor: '#2D9DFF' }),
  useIsDark: () => false,
}))
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: () => {}, dismiss: () => {} }),
}))

const { default: RefundSheet } = await import('./RefundSheet')
const { default: PeopleSplit } = await import('./PeopleSplit')
const { default: TxDetailSheet } = await import('./TxDetailSheet')
const { default: TemplateConfirmSheet } = await import('./TemplateConfirmSheet')

afterEach(cleanup)

/** Puts `value` in the field as a keystroke or paste would, and returns what it shows after. */
function enter(/** @type {HTMLElement} */ el, /** @type {string} */ value) {
  fireEvent.change(el, { target: { value } })
  return /** @type {HTMLInputElement} */ (el).value
}

describe('RefundSheet', () => {
  const cash = { id: 1, name: 'Cash', type: 'cash', balance: 0 }
  const open = (/** @type {Record<string, any>} */ tx) => render(
    <RefundSheet open onClose={() => {}} tx={tx} allTxs={[tx]} accounts={[cash]} onRefund={() => {}} />)
  const field = () => screen.getByLabelText('Refund amount')

  it('opens on what is left, ungrouped once you type', () => {
    open({ id: 1, txId: 't1', type: 'expense', amount: 1000, account: 'Cash' })
    expect(field().value).toBe('₱1,000')
    expect(enter(field(), '₱1,0005')).toBe('₱10005')
  })

  it('refuses a minus or an exponent rather than stripping it', () => {
    open({ id: 1, txId: 't1', type: 'expense', amount: 1000, account: 'Cash' })
    expect(enter(field(), '-500')).toBe('₱1,000')
    expect(enter(field(), '₱1e5')).toBe('₱1,000')
  })

  it('caps the places at the purchase currency and the digits at ten', () => {
    open({ id: 1, txId: 't1', type: 'expense', amount: 1000, account: 'Cash' })
    expect(enter(field(), '₱12.345')).toBe('₱12.34')
    expect(enter(field(), '₱12345678901')).toBe('₱12.34')
    cleanup()
    open({ id: 2, txId: 't2', type: 'expense', amount: 1000, account: 'Cash', currency: 'JPY' })
    expect(enter(field(), '¥1500.75')).toBe('¥1500.')
  })
})

describe('PeopleSplit', () => {
  /** The editor is controlled; this holds its value the way a form does. */
  function Harness({ mode, currency }) {
    const [split, setSplit] = useState({
      mode, you: { included: true, value: '' }, people: [{ name: 'Gelo', value: '', included: true }],
    })
    return <PeopleSplit total={1000} value={split} onChange={setSplit} currency={currency} />
  }

  it('Exact: refuses a minus or exponent, keeps the places, never groups', () => {
    render(<Harness mode="exact" />)
    const f = () => screen.getByLabelText('Amount for Gelo')
    expect(enter(f(), '₱1e5')).toBe('')
    expect(enter(f(), '-250')).toBe('')
    expect(enter(f(), '₱1234.567')).toBe('₱1234.56')
    expect(enter(f(), '₱12345678901')).toBe('₱1234.56')
  })

  it('+/−: a leading minus is a discount, any other dash is refused', () => {
    render(<Harness mode="adjust" />)
    const f = () => screen.getByLabelText('adjust value for Gelo')
    expect(enter(f(), '-')).toBe('-')
    expect(enter(f(), '-50.125')).toBe('-50.12')
    expect(enter(f(), '5-0')).toBe('-50.12')
    expect(enter(f(), '--50')).toBe('-50.12')
    expect(enter(f(), '1e3')).toBe('-50.12')
    expect(enter(f(), '75')).toBe('75')
  })

  it('+/−: takes no places in a currency quoted whole', () => {
    render(<Harness mode="adjust" currency="JPY" />)
    expect(enter(screen.getByLabelText('adjust value for Gelo'), '12.5')).toBe('12.')
  })

  it('%: digits and one point, a sign or exponent refused, never grouped', () => {
    render(<Harness mode="percent" />)
    const f = () => screen.getByLabelText('percent value for Gelo')
    expect(enter(f(), '-30')).toBe('')
    expect(enter(f(), '33.3')).toBe('33.3')
    expect(enter(f(), '1e2')).toBe('33.3')
    expect(enter(f(), '12.5.5')).toBe('12.55')
    expect(enter(f(), '1500')).toBe('1500')
  })

  it('Shares: stays a whole count', () => {
    render(<Harness mode="shares" />)
    const f = () => screen.getByLabelText('shares value for Gelo')
    expect(enter(f(), '2')).toBe('2')
    expect(enter(f(), '-1')).toBe('2')
    expect(enter(f(), '1e2')).toBe('2')
    expect(enter(f(), '3x')).toBe('3')
  })
})

describe('TxDetailSheet, editing the amount in place', () => {
  const edit = (/** @type {Record<string, any>} */ tx) => {
    render(
      <TxDetailSheet
        open
        onClose={() => {}}
        transaction={tx}
        accounts={[{ id: 1, name: 'Cash', type: 'cash', balance: 0, currency: tx.currency }]}
        categories={[{ id: 1, name: 'Food', type: 'expense' }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  }
  const expense = { id: 1, type: 'expense', amount: 1200, account: 'Cash', category: 'Food', date: '2026-10-01T04:00:00.000Z' }

  it('keeps the mark and the raw figure as you type', () => {
    edit(expense)
    const f = screen.getByDisplayValue('₱1200')
    expect(enter(f, '₱12005')).toBe('₱12005')
    expect(enter(f, '')).toBe('')
  })

  it('refuses a minus or an exponent rather than stripping it', () => {
    edit(expense)
    const f = screen.getByDisplayValue('₱1200')
    expect(enter(f, '-₱1200')).toBe('₱1200')
    expect(enter(f, '₱1e5')).toBe('₱1200')
  })

  it("caps the places at the transaction's currency and the digits at ten", () => {
    edit(expense)
    const f = screen.getByDisplayValue('₱1200')
    expect(enter(f, '₱1200.999')).toBe('₱1200.99')
    expect(enter(f, '₱1.2.3')).toBe('₱1.23')
    expect(enter(f, '₱12345678901')).toBe('₱1.23')
    cleanup()
    edit({ ...expense, id: 2, currency: 'JPY' })
    expect(enter(screen.getByDisplayValue('¥1200'), '¥1200.5')).toBe('¥1200.')
  })
})

describe('TemplateConfirmSheet', () => {
  const template = { id: 1, name: 'Lunch', type: 'expense', amount: 500, account: 'Cash', category: 'Food' }

  /**
   * The bug: the expense hero reads "−₱500", and that minus is U+2212, which
   * the shared handler refuses as a negative - so every key typed into an
   * expense template's amount snapped back to what was there.
   */
  it("takes typing on an expense, whose value starts with the type's minus", () => {
    render(<TemplateConfirmSheet open onClose={() => {}} template={template} />)
    const f = screen.getByLabelText('Amount')
    expect(f.value).toBe('−₱500')
    expect(enter(f, '−₱5005')).toBe('−₱5,005')
  })

  it('still refuses a second minus or an exponent', () => {
    render(<TemplateConfirmSheet open onClose={() => {}} template={template} />)
    const f = screen.getByLabelText('Amount')
    expect(enter(f, '−₱-500')).toBe('−₱500')
    expect(enter(f, '−₱1e5')).toBe('−₱500')
  })

  it('takes typing on income, whose sign is a plus', () => {
    render(<TemplateConfirmSheet open onClose={() => {}} template={{ ...template, type: 'inflow' }} />)
    expect(enter(screen.getByLabelText('Amount'), '+₱5005')).toBe('+₱5,005')
  })
})
