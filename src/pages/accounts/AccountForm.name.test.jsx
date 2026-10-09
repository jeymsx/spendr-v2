// @vitest-environment jsdom
/**
 * The account form's name: one name, one account, however it is dressed.
 *
 * "Ca" + a zero-width space + "sh" prints as Cash. It was accepted beside the
 * real one - two accounts that look identical and are two different keys, and
 * every transaction, bill and balance finds its account BY NAME. The check
 * compares names the way lib/nameKey.js does, and what is saved has the
 * invisible characters taken out.
 *
 * Shallow, like AccountForm.card.test.jsx: the database is a stand-in, and the
 * rename's follow-on writes are not run - the account's own update is the
 * first thing the save does, and what it is handed is what is pinned here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useEffect, useState } from 'react'

/** @type {{ accounts: any[] }} */
const store = { accounts: [] }
const update = vi.fn(async () => 1)

vi.mock('../../db/db', () => ({
  default: {
    accounts: { toArray: async () => store.accounts, update: (/** @type {any[]} */ ...a) => update(...a) },
    meta: { get: async () => undefined, put: async () => {} },
    transactions: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    transaction: async (/** @type {any} */ _m, /** @type {any} */ _t, /** @type {() => any} */ fn) => fn(),
  },
  UNSYNCED: 0,
}))
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

const TAKEN = 'You already have an account with this name'
const cash = { id: 1, name: 'Cash', type: 'cash', role: 'spending', balance: 0, currency: 'PHP' }
const piggy = { id: 2, name: 'Piggy Bank', type: 'cash', role: 'spending', balance: 0, currency: 'PHP' }

beforeEach(() => { update.mockClear() })
afterEach(() => { cleanup(); store.accounts = [] })

/** Opens `account` for editing, with the others in the ledger. @param {Record<string, any>} account @param {Record<string, any>[]} all */
function open(account, all) {
  store.accounts = all
  return render(
    <MemoryRouter>
      <AccountFormSheet open variant="page" account={account} onClose={() => {}} />
    </MemoryRouter>,
  )
}

/** Types a name and presses save. @param {string} value */
function rename(value) {
  fireEvent.change(screen.getByPlaceholderText('e.g. BDO Savings'), { target: { value } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])
}

describe('the account name', () => {
  /** The bug: both were accepted. */
  it('refuses a name that only differs from another account by an invisible character', async () => {
    open(piggy, [cash, piggy])
    rename('Ca\u200Bsh')
    expect(await screen.findByText(TAKEN)).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses every kind of invisible character, and case and spaces on top', async () => {
    open(piggy, [cash, piggy])
    rename('  \uFEFFcA\u2060SH\u202E ')
    expect(await screen.findByText(TAKEN)).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('saves the name without the invisible characters it was typed with', async () => {
    open(piggy, [cash, piggy])
    rename('Sa\u200Bvings')
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0]).toEqual([2, expect.objectContaining({ name: 'Savings' })])
    expect(screen.queryByText(TAKEN)).toBeNull()
  })

  it('still asks for a name when all that was typed cannot be seen', async () => {
    open(piggy, [cash, piggy])
    rename('\u200B\u200C')
    expect(await screen.findByText('Name is required')).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  /** A twin made before this check must not make the account unsaveable. */
  it('saves an account whose name did not change, even beside a twin', async () => {
    const twin = { ...cash, id: 3 }
    open(cash, [cash, twin])
    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(screen.queryByText(TAKEN)).toBeNull()
  })
})
