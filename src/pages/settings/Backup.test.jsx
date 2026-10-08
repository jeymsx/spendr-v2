// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

/**
 * Starting over, and what a restore says it will do.
 *
 * Reset app is "Erase everything on this device", and it was not: challenges
 * and the notes tables were left behind, and so was the look. So it clears by
 * what the database HAS, and these pin that a table nobody listed is cleared
 * too. The restore sheet's line about settings has two truths - a version 2
 * file brings them, a version 1 file leaves them - and says whichever applies.
 */

/** Every table the fake database has, with a clear() that says it was called. */
const tables = ['transactions', 'balances', 'accounts', 'categories', 'debts', 'recurring', 'meta', 'templates',
  'goals', 'badges', 'notifications', 'challenges', 'trash', 'notes', 'note_folders', 'a_table_added_later']
  .map(name => ({ name, clear: vi.fn(async () => {}) }))

vi.mock('../../db/db', () => ({
  default: {
    get tables() { return tables },
    transaction: async (/** @type {any} */ _mode, /** @type {any} */ _tables, /** @type {() => Promise<void>} */ fn) => fn(),
  },
}))
const signOut = vi.fn(async () => {})
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ signOut }) }))
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: () => {}, dismiss: () => {} }) }))
vi.mock('../../hooks/useScrollLock', () => ({ useScrollLock: () => {} }))
const clearLock = vi.fn()
vi.mock('../../lib/appLock', () => ({ clearLock: () => clearLock() }))
/** @type {{current: any}} */
const inspected = { current: null }
vi.mock('../../lib/backup', () => ({
  inspectBackup: () => inspected.current,
  restoreBackup: vi.fn(),
}))

const { ResetConfirmModal, RestoreBackupSheet } = await import('./Backup')

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})   // jsdom cannot navigate, and says so
  localStorage.setItem('spendr-theme', 'light')
  localStorage.setItem('accentColor', '#ff0000')
  localStorage.setItem('spendr-style', 'flat')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  for (const t of tables) t.clear.mockClear()
  signOut.mockClear()
  clearLock.mockClear()
  localStorage.clear()
})

describe('Reset app', () => {
  it('says what it does: everything on this device, the lock, the sign-in, and what the cloud keeps', () => {
    render(<ResetConfirmModal open onClose={() => {}} />)
    const text = screen.getByText(/Everything on this device is deleted/).textContent ?? ''
    expect(text).toMatch(/settings/)
    expect(text).toMatch(/App lock turns off and you.re signed out/)
    expect(text).toMatch(/your cloud copy stays/)
    expect(text).not.toMatch(/permanently/)
    // Notes are a secret feature: a list of what is erased does not announce it.
    expect(text).not.toMatch(/notes/i)
  })

  it('clears every table the database has, turns the lock off, signs out and puts the look back', async () => {
    render(<ResetConfirmModal open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(screen.getByPlaceholderText('RESET'), { target: { value: 'RESET' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset app' }))

    await waitFor(() => expect(signOut).toHaveBeenCalled())
    for (const t of tables) expect(t.clear, t.name).toHaveBeenCalledTimes(1)
    expect(clearLock).toHaveBeenCalled()
    // Dropped, so the reload falls back to ThemeContext's own defaults.
    expect(localStorage.getItem('spendr-theme')).toBeNull()
    expect(localStorage.getItem('accentColor')).toBeNull()
    expect(localStorage.getItem('spendr-style')).toBeNull()
  })
})

describe('Restore backup', () => {
  /** Pick a file and land on the confirm step. @param {Record<string, any>} data */
  async function pick(data) {
    inspected.current = { data, exportedAt: null, counts: {}, missing: [] }
    const { container } = render(<RestoreBackupSheet open onClose={() => {}} />)
    const input = /** @type {HTMLInputElement} */ (container.ownerDocument.querySelector('input[type="file"]'))
    fireEvent.change(input, { target: { files: [new File(['{}'], 'spendr-backup.json', { type: 'application/json' })] } })
    await screen.findByText('Replace all data?')
  }

  it('says a version 2 file brings its settings with it', async () => {
    await pick({ version: 2, meta: [{ key: 'currency', value: 'USD' }], prefs: { theme: 'light' } })
    expect(screen.getByText(/Your name, currency, theme and other settings come from the backup too\./)).toBeTruthy()
    expect(screen.queryByText(/stay as they are/)).toBeNull()
  })

  it('says a version 1 file leaves them as they are', async () => {
    await pick({ version: 1, transactions: [] })
    expect(screen.getByText(/Your name, currency and theme stay as they are\./)).toBeTruthy()
    expect(screen.queryByText(/come from the backup too/)).toBeNull()
  })
})
