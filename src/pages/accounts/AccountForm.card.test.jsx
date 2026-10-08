// @vitest-environment jsdom
/**
 * The credit card parts of the account form: "Amount owed now" and the
 * cutoff and statement days.
 *
 * Shallow on purpose, like the onboarding render tests: what is worth pinning
 * is that the field shows what the card owes, that changing it says what will
 * be written, and that the statement day is only asked for while there is no
 * cutoff - not the exact markup.
 *
 * The database is a stand-in with the one read this screen makes of a card's
 * ledger, and useLiveQuery runs its querier once, which is all these need.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useEffect, useState } from 'react'

/** @type {{ accounts: any[], transactions: any[] }} */
const store = { accounts: [], transactions: [] }

vi.mock('../../db/db', () => ({
  default: {
    accounts: { toArray: async () => store.accounts },
    // Read by the card preview's exchange rates, and nothing here cares.
    meta: { get: async () => undefined, put: async () => {} },
    transactions: {
      where: (/** @type {string} */ f) => ({
        equals: (/** @type {any} */ v) => ({ toArray: async () => store.transactions.filter(t => t[f] === v) }),
      }),
    },
    transaction: async (/** @type {any} */ _m, /** @type {any} */ _t, /** @type {() => any} */ fn) => fn(),
  },
  UNSYNCED: 0,
}))
// The real arithmetic, and a stand-in for each write: only what the form
// asks for is under test here, and db/accountWrites.test.js has the rest.
vi.mock('../../db/accountWrites', async (importActual) => ({
  ...(await importActual()),
  createInvestment: vi.fn(),
  createCard: vi.fn(),
  recordCardOwed: vi.fn(),
  renameAccountInTransactions: vi.fn(),
}))
vi.mock('../../hooks/useLiveQuery', () => ({
  useLiveQuery: (/** @type {() => Promise<any>} */ fn, /** @type {any[]} */ deps, /** @type {any} */ initial) => {
    const [v, setV] = useState(initial)
    useEffect(() => { Promise.resolve(fn()).then(setV) }, deps) // eslint-disable-line react-hooks/exhaustive-deps
    return v
  },
}))
vi.mock('../../lib/sync', () => ({ deleteAccountRemote: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

const { AccountFormSheet } = await import('./AccountForm')

afterEach(() => { cleanup(); store.accounts = []; store.transactions = [] })

const visa = { id: 1, name: 'Visa', type: 'credit', cutoffDate: 15, dueDate: 5, creditLimit: 30000, balance: 0, currency: 'PHP' }
const day = (/** @type {number} */ d) => new Date(2026, 8, d, 10).toISOString()

/** @param {Record<string, any>} account */
function open(account) {
  store.accounts = [account]
  return render(
    <MemoryRouter>
      <AccountFormSheet open variant="page" account={account} onClose={() => {}} />
    </MemoryRouter>,
  )
}

/** The text field showing `value`, once the card's ledger has loaded and the figure is in. @param {string} value */
const fieldShowing = (value) => waitFor(() => {
  const f = screen.getAllByRole('textbox').find(i => /** @type {HTMLInputElement} */ (i).value === value)
  if (!f) throw new Error(`no field showing ${value} yet`)
  return f
}, { timeout: 4000 })

describe('editing a credit card', () => {
  it('shows what the card owes now, from its ledger', async () => {
    store.transactions = [
      { id: 1, type: 'expense', account: 'Visa', amount: 12000, date: day(3) },
      { id: 2, type: 'transfer', fromAccount: 'BPI', toAccount: 'Visa', amount: 2000, date: day(20) },
    ]
    open(visa)
    expect(screen.getByText('Amount owed now')).toBeTruthy()
    await fieldShowing('10,000')
    // Nothing is changing until it is typed over.
    expect(screen.queryByText(/correction to what you owe/)).toBeNull()
  })

  it('says what will be recorded once the amount is changed', async () => {
    store.transactions = [{ id: 1, type: 'expense', account: 'Visa', amount: 12000, date: day(3) }]
    open(visa)
    const field = await fieldShowing('12,000')
    fireEvent.change(field, { target: { value: '15000' } })
    expect(screen.getByText(/Records a .*3,000.* correction to what you owe\. It won't count as spending\./)).toBeTruthy()
    fireEvent.change(field, { target: { value: '9000' } })
    expect(screen.getByText(/Records a .*3,000.* correction to what you owe\. It won't count as income\./)).toBeTruthy()
  })

  it('has no balance field of the ordinary kind', async () => {
    open(visa)
    expect(screen.queryByText('Balance')).toBeNull()
    expect(screen.queryByText('Starting balance')).toBeNull()
  })
})

describe('the cutoff and statement days', () => {
  it('say what the cutoff does', () => {
    open(visa)
    expect(screen.getByText(/Cutoff is the day a new statement starts\. Spending from this day goes on the next bill\./)).toBeTruthy()
  })

  it('ask for the statement day only while there is no cutoff to say it', () => {
    open({ ...visa, cutoffDate: null, statementDate: 14 })
    expect(screen.getByText('Statement')).toBeTruthy()
    expect(screen.getByText('Used only when there is no cutoff.')).toBeTruthy()
    cleanup()
    open(visa)
    expect(screen.queryByText('Statement')).toBeNull()
  })

  it('brings the statement day back when the cutoff is cleared', () => {
    open({ ...visa, statementDate: 14 })
    expect(screen.queryByText('Statement')).toBeNull()
    const cutoff = /** @type {HTMLInputElement} */ (screen.getAllByRole('spinbutton').find(i => /** @type {HTMLInputElement} */ (i).value === '15'))
    fireEvent.change(cutoff, { target: { value: '' } })
    expect(screen.getByText('Statement')).toBeTruthy()
  })
})
