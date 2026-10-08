// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

/**
 * Two devices, one account: what this one does when the other changes
 * something, and when it changes something itself.
 *
 * The cloud, the stream and Dexie are stood in for, and the clock is faked,
 * so what is pinned is SyncManager's own behaviour - when it pulls, when it
 * pushes, what it says, and what it keeps quiet about.
 */

const h = vi.hoisted(() => ({
  user: { id: 'u1' },
  showToast: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: {} }, error: null })),
  refreshSession: vi.fn(async () => ({ error: null })),
  fullSync: vi.fn(async () => ({ added: [], first: false })),
  pullChanges: vi.fn(async () => ({ added: [] })),
  /** @type {any} */ stream: null,
  /** @type {((table?: string) => void)|null} */ local: null,
  unsynced: /** @type {any[]} */ ([]),
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: h.user, signOut: async () => {} }) }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: h.getSession, refreshSession: h.refreshSession } }, isSupabaseConfigured: true }))
vi.mock('../lib/sync', () => ({
  fullSync: h.fullSync, pullChanges: h.pullChanges,
  FirstSyncChoiceNeeded: class extends Error { constructor(/** @type {any} */ info) { super('first'); this.info = info } },
}))
vi.mock('../lib/realtime', () => ({ startRealtime: (/** @type {string} */ _id, /** @type {any} */ handlers) => { h.stream = handlers; return () => { h.stream = null } } }))
vi.mock('../lib/localChanges', () => ({ watchLocalChanges: (/** @type {(table?: string) => void} */ cb) => { h.local = cb; return () => { h.local = null } } }))
vi.mock('../db/db', () => ({ default: { meta: { put: async () => {} } }, getUnsyncedTxs: async () => h.unsynced }))
vi.mock('./ReminderSync', () => ({ default: () => null }))
vi.mock('./NotificationSync', () => ({ default: () => null }))
vi.mock('./FirstSyncSheet', () => ({ default: () => null }))

const { default: SyncManager, useSyncManager } = await import('./SyncManager')

function Probe() {
  const { live } = useSyncManager()
  return <p data-testid="live">{live}</p>
}

function mount() {
  return render(
    <MemoryRouter>
      <Routes><Route element={<SyncManager />}><Route path="/" element={<Probe />} /></Route></Routes>
    </MemoryRouter>,
  )
}

const tx = { type: 'expense', amount: 150, description: 'Lunch', currency: 'PHP' }

/** Let the timers and the promises they start run for a while. @param {number} ms */
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  h.stream = null; h.local = null; h.unsynced = []
  h.fullSync.mockImplementation(async () => ({ added: [], first: false }))
  h.pullChanges.mockImplementation(async () => ({ added: [] }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

/** A mounted manager whose first sync has finished. */
async function ready() {
  mount()
  await tick(50)
  expect(h.fullSync).toHaveBeenCalledTimes(1)
  return h
}

describe('what the other device does', () => {
  it('is pulled soon after it is heard - and a burst of changes is one pull', async () => {
    await ready()
    for (let i = 0; i < 12; i++) h.stream.onChange('accounts')
    await tick(300)
    expect(h.pullChanges).not.toHaveBeenCalled()
    await tick(400)
    expect(h.pullChanges).toHaveBeenCalledTimes(1)
    expect(h.pullChanges).toHaveBeenCalledWith('u1', { onAdded: expect.any(Function) })
  })

  it('pulls and pushes nothing back: it asks no more of the auth server than a look at the session', async () => {
    await ready()
    h.refreshSession.mockClear()
    h.stream.onChange('transactions')
    await tick(700)
    expect(h.pullChanges).toHaveBeenCalledTimes(1)
    expect(h.refreshSession).not.toHaveBeenCalled()
    expect(h.fullSync).toHaveBeenCalledTimes(1)
  })

  it('says what came, once, without covering a toast that has a button', async () => {
    await ready()
    // Said when the ledger is in, which is before the pull has finished: it is the pull that calls back.
    h.pullChanges.mockImplementationOnce(async (_id, o) => { o.onAdded([tx]); return { added: [tx] } })
    h.stream.onChange('transactions')
    await tick(700)
    expect(h.showToast).toHaveBeenCalledTimes(1)
    expect(h.showToast).toHaveBeenCalledWith('From your other device: Lunch, ₱150.00', 'success', { ifIdle: true })
  })

  it('says nothing when nothing new came', async () => {
    await ready()
    h.stream.onChange('user_preferences')
    await tick(700)
    expect(h.pullChanges).toHaveBeenCalledTimes(1)
    expect(h.showToast).not.toHaveBeenCalled()
  })

  it('does not pull while a sync is running, and does once it has finished', async () => {
    await ready()
    /** @type {() => void} */ let finish = () => {}
    h.fullSync.mockImplementationOnce(() => new Promise(res => { finish = () => res({ added: [], first: false }) }))
    act(() => { h.local?.() })
    await tick(1600)
    expect(h.fullSync).toHaveBeenCalledTimes(2)
    h.stream.onChange('transactions')
    await tick(700)
    expect(h.pullChanges).not.toHaveBeenCalled()
    await act(async () => { finish() })
    await tick(1000)
    expect(h.pullChanges).toHaveBeenCalledTimes(1)
  })

  it('waits for the first sync of the session before pulling anything', async () => {
    /** @type {() => void} */ let finish = () => {}
    h.fullSync.mockImplementationOnce(() => new Promise(res => { finish = () => res({ added: [], first: false }) }))
    mount()
    await tick(50)
    h.stream.onChange('transactions')
    await tick(700)
    expect(h.pullChanges).not.toHaveBeenCalled()
    await act(async () => { finish() })
    await tick(1000)
    expect(h.pullChanges).toHaveBeenCalledTimes(1)
  })

  it('a device meeting the account for the first time is not told its whole ledger arrived', async () => {
    h.fullSync.mockResolvedValueOnce({ added: [tx, tx, tx], first: true })
    mount()
    await tick(100)
    expect(h.showToast).not.toHaveBeenCalled()
  })

  it('a pull that fails is not an error to be shown', async () => {
    await ready()
    h.pullChanges.mockRejectedValueOnce(new Error('offline'))
    h.stream.onChange('transactions')
    await tick(700)
    expect(screen.queryByText('Sync failed')).toBeNull()
    expect(h.showToast).not.toHaveBeenCalled()
  })
})

describe('what this device does', () => {
  it('goes up shortly after a change, once for a burst', async () => {
    await ready()
    h.refreshSession.mockClear()
    for (let i = 0; i < 5; i++) { act(() => { h.local?.() }); await tick(200) }
    expect(h.fullSync).toHaveBeenCalledTimes(1)
    await tick(1500)
    expect(h.fullSync).toHaveBeenCalledTimes(2)
  })

  it('sends the ledger first, and only the tables that were written to', async () => {
    await ready()
    // Adding a transaction also moves the account it came out of.
    act(() => { h.local?.('transactions'); h.local?.('accounts'); h.local?.('transactions') })
    await tick(1700)
    expect(h.fullSync).toHaveBeenCalledTimes(2)
    expect(h.fullSync).toHaveBeenLastCalledWith('u1', { choice: null, quick: true, only: new Set(['transactions', 'accounts']) })
  })

  it('does not send a table again that was sent and not written to since', async () => {
    await ready()
    act(() => { h.local?.('accounts') })
    await tick(1700)
    act(() => { h.local?.('transactions') })
    await tick(1700)
    expect(h.fullSync).toHaveBeenCalledTimes(3)
    expect(h.fullSync).toHaveBeenLastCalledWith('u1', { choice: null, quick: true, only: new Set(['transactions']) })
  })

  it('sends everything on a sync that is not a change: it cannot know what was written while the app was closed', async () => {
    await ready()
    expect(h.fullSync).toHaveBeenLastCalledWith('u1', { choice: null, quick: false, only: null })
  })

  it('hands the tables back when the push does not finish, so the next one sends them', async () => {
    await ready()
    h.fullSync.mockRejectedValueOnce(new Error('Failed to fetch'))
    act(() => { h.local?.('goals') })
    await tick(1700)
    act(() => { h.local?.('transactions') })
    await tick(1700)
    expect(h.fullSync).toHaveBeenLastCalledWith('u1', { choice: null, quick: true, only: new Set(['goals', 'transactions']) })
  })

  it('does not ask the auth server to refresh the session for each save', async () => {
    await ready()
    h.refreshSession.mockClear()
    act(() => { h.local?.() })
    await tick(1700)
    expect(h.fullSync).toHaveBeenCalledTimes(2)
    expect(h.refreshSession).not.toHaveBeenCalled()
    expect(h.getSession).toHaveBeenCalled()
  })

  it('does not push before this session has had its first sync', async () => {
    /** @type {() => void} */ let finish = () => {}
    h.fullSync.mockImplementationOnce(() => new Promise(res => { finish = () => res({ added: [], first: false }) }))
    mount()
    await tick(50)
    act(() => { h.local?.() })
    await tick(2000)
    expect(h.fullSync).toHaveBeenCalledTimes(1)
    await act(async () => { finish() })
  })

  it('stays quiet when the push cannot go - offline, or the cloud having a moment', async () => {
    await ready()
    h.fullSync.mockRejectedValueOnce(new Error('Failed to fetch'))
    act(() => { h.local?.() })
    await tick(1700)
    expect(screen.queryByText('Sync failed')).toBeNull()
    expect(screen.queryByText('Syncing…')).toBeNull()
  })

  it('goes again for a transaction saved while the last push was on its way', async () => {
    await ready()
    // Written after the push had looked, so still marked unsent when it ends.
    h.fullSync.mockImplementationOnce(async () => { h.unsynced = [{ txId: 't9' }]; return { added: [], first: false } })
    // ...and the go after it sends it.
    h.fullSync.mockImplementation(async () => { h.unsynced = []; return { added: [], first: false } })
    act(() => { h.local?.() })
    await tick(1700)
    expect(h.fullSync).toHaveBeenCalledTimes(2)
    await tick(600)
    expect(h.fullSync).toHaveBeenCalledTimes(3)
    await tick(5000)
    expect(h.fullSync).toHaveBeenCalledTimes(3)
  })

  it('does not loop for ever on a row that cannot be sent', async () => {
    await ready()
    h.unsynced = [{ txId: 'stuck' }]
    act(() => { h.local?.() })
    await tick(30_000)
    // The first sync, the push, and no more than two goes at what it left behind.
    expect(h.fullSync.mock.calls.length).toBeLessThanOrEqual(4)
  })
})

describe('the stream itself', () => {
  it('is reported, so Settings can say whether changes arrive live', async () => {
    await ready()
    expect(screen.getByTestId('live').textContent).toBe('off')
    act(() => { h.stream.onState('connecting') })
    expect(screen.getByTestId('live').textContent).toBe('connecting')
    act(() => { h.stream.onState('on') })
    expect(screen.getByTestId('live').textContent).toBe('on')
  })

  it('asks every so often instead when it is not live', async () => {
    await ready()
    await tick(46_000)
    expect(h.pullChanges).toHaveBeenCalledTimes(1)
    act(() => { h.stream.onState('on') })
    h.pullChanges.mockClear()
    await tick(100_000)
    expect(h.pullChanges).not.toHaveBeenCalled()
  })
})
