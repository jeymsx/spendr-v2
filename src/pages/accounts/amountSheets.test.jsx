// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

/**
 * The three heroes on an account's page that you type a figure into: paying
 * a card, paying a loan, updating an investment's value.
 *
 * Each stripped its own input to [0-9.], so "-500" became 500, "1e5" became
 * 15, a yen took centavos and the figure could grow without end. They now use
 * typedAmount (utils/moneyInput.js) - still ungrouped as you type, so the
 * caret stays put - and these pin what the field shows after a keystroke.
 */

vi.mock('../../db/db', () => ({ default: {}, UNSYNCED: 0, SYNCED: 1, SYNCED_TABLES: [] }))
vi.mock('../../hooks/useLiveQuery', () => ({
  useLiveQuery: (/** @type {any} */ _q, /** @type {any} */ _d, /** @type {any} */ fallback) => fallback,
}))

const { default: CardPaymentSheet } = await import('./CardPaymentSheet')
const { default: LoanPaySheet } = await import('./LoanPaySheet')
const { default: UpdateValueSheet } = await import('./UpdateValueSheet')
const { setFxContext, resetFxContext } = await import('../../lib/fxContext')

afterEach(() => { cleanup(); resetFxContext() })

/** Puts `value` in the field as a keystroke or paste would, and returns what it shows after. */
function enter(/** @type {HTMLElement} */ el, /** @type {string} */ value) {
  fireEvent.change(el, { target: { value } })
  return /** @type {HTMLInputElement} */ (el).value
}

const cash = { id: 1, name: 'Cash', type: 'cash', balance: 50000 }

describe('CardPaymentSheet', () => {
  const card = { id: 2, name: 'BPI Card', type: 'credit', balance: 0 }
  const pay = (/** @type {Record<string, any>} */ c = card) => render(
    <CardPaymentSheet open onClose={() => {}} card={c} accounts={[cash, c]}
      status={{ stmtOutstanding: 1000, minimumDue: 0, currentBalance: 1000 }} onPay={() => {}} />)
  const field = () => screen.getByLabelText('Payment amount')

  it('opens on the statement and stays ungrouped as you type', () => {
    pay()
    expect(field().value).toBe('₱1,000')
    expect(enter(field(), '₱1,0005')).toBe('₱10005')
  })

  it('refuses a minus or an exponent rather than stripping it', () => {
    pay()
    expect(enter(field(), '-500')).toBe('₱1,000')
    expect(enter(field(), '₱1e5')).toBe('₱1,000')
  })

  it("caps the places at the card's currency and the digits at ten", () => {
    pay()
    expect(enter(field(), '₱99.999')).toBe('₱99.99')
    expect(enter(field(), '₱12345678901')).toBe('₱99.99')
    cleanup()
    const yen = { ...card, name: 'Yen Card', currency: 'JPY' }
    setFxContext({ accounts: [cash, yen] })
    pay(yen)
    expect(enter(field(), '¥1500.75')).toBe('¥1500.')
  })
})

describe('LoanPaySheet', () => {
  const loan = { id: 3, name: 'Car loan', type: 'loan', currency: 'PHP', interestRate: 0 }
  const pay = () => render(
    <LoanPaySheet open onClose={() => {}} loan={loan} accounts={[{ ...cash, currency: 'PHP' }]}
      status={{ owed: 100000, next: { amount: 5000, interest: 0 } }} onPay={() => {}} />)
  const field = () => screen.getByLabelText('Payment amount')

  it('opens on the monthly figure and takes typing ungrouped', () => {
    pay()
    expect(field().value).toBe('₱5,000')
    expect(enter(field(), '₱5,0001')).toBe('₱50001')
  })

  it('refuses a minus or an exponent, and a third place', () => {
    pay()
    expect(enter(field(), '-5000')).toBe('₱5,000')
    expect(enter(field(), '₱5e3')).toBe('₱5,000')
    expect(enter(field(), '₱5000.505')).toBe('₱5000.50')
  })
})

describe('UpdateValueSheet', () => {
  const show = (/** @type {Record<string, any>} */ account) => render(
    <UpdateValueSheet open onClose={() => {}} account={account} status={{ valuedAt: null }} onSave={() => {}} />)
  const field = () => screen.getByLabelText('Value today')

  it("takes the investment's own currency and refuses a sign", () => {
    show({ id: 4, name: 'Stocks', type: 'investment', balance: 10000, currency: 'USD' })
    expect(field().value).toBe('$10,000')
    expect(enter(field(), '-$10000')).toBe('$10,000')
    expect(enter(field(), '$1e4')).toBe('$10,000')
    expect(enter(field(), '$12000.555')).toBe('$12000.55')
  })

  it('takes no places for a currency quoted whole', () => {
    show({ id: 5, name: 'Nikkei', type: 'investment', balance: 10000, currency: 'JPY' })
    expect(enter(field(), '¥12000.5')).toBe('¥12000.')
  })
})
