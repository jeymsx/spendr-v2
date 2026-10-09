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
  applyRemoteTransaction: vi.fn(async () => ({ handled: true, added: null })),
  /** @type {any} */ stream: null,
  /** @type {((table?: string) => void)|null} */ local: null,
  /** @type {((key: any) => void)|null} */ localTx: null,
  /** What the ledger holds, by key. @type {Record<string, any>} */ ledger: {},
  share: vi.fn(() => true),
  /** @type {((row: Record<string, any>) => void)|null} */ toldOfTransaction: null,
  unsynced: /** @type {any[]} */ ([]),
  /** The small tables with a row still unsent, as lib/sync.js unsentTables would say. @type {Set<string>} */
  unsent: new Set(),
  unsentTables: vi.fn(async () => new Set()),
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: h.user, signOut: async () => {} }) }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: h.getSession, refreshSession: h.refreshSession } }, isSupabaseConfigured: true }))
vi.mock('../lib/sync', () => ({
  fullSync: h.fullSync, pullChanges: h.pullChanges, applyRemoteTransaction: h.applyRemoteTransaction, settleBalances: async () => 0, balancesToSend: async () => false,
  unsentTables: h.unsentTables,
  toShareRow: (/** @type {any} */ tx, /** @type {string} */ userId) => ({ tx_id: tx.txId, user_id: userId, amount: tx.amount }),
  FirstSyncChoiceNeeded: class extends Error { constructor(/** @type {any} */ info) { super('first'); this.info = info } },
}))
vi.mock('../lib/realtime', () => ({ startRealtime: (/** @type {string} */ _id, /** @type {any} */ handlers) => { h.stream = handlers; return () => { h.stream = null } } }))
vi.mock('../lib/localChanges', () => ({ watchLocalChanges: (/** @type {(table?: string) => void} */ cb, /** @type {(key: any) => void} */ onTransaction) => { h.local = cb; h.localTx = onTransaction; return () => { h.local = null; h.localTx = null } } }))
vi.mock('../lib/liveShare', () => ({ startShare: (/** @type {string} */ _id, /** @type {any} */ handlers) => { h.toldOfTransaction = handlers.onTransaction; return { share: h.share, stop: () => { h.toldOfTransaction = null } } } }))
vi.mock('../db/db', () => ({ default: { meta: { put: async () => {} }, transactions: { get: async (/** @type {any} */ key) => h.ledger[key] } }, getUnsyncedTxs: async () => h.unsynced }))
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
  h.stream = null; h.local = null; h.localTx = null; h.toldOfTransaction = null; h.ledger = {}; h.unsynced = []
  h.unsent = new Set()
  h.unsentTables.mockImplementation(async () => new Set(h.unsent))
  h.fullSync.mockImplementation(async () => ({ added: [], first: false }))
  h.pullChanges.mockImplementation(async () => ({ added: [] }))
  h.applyRemoteTransaction.mockImplementation(async () => ({ handled: true, added: null }))
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
    await tick(200)
    expect(h.pullChanges).not.toHaveBeenCalled()
    await tick(100)
    expect(h.pullChanges).toHaveBeenCalledTimes(1)
    expect(h.pullChanges).toHaveBeenCalledWith('u1', { onAdded: expect.any(Function), only: new Set(['accounts']) })
  })

  it('reads the tables that changed, and no others: a budget is one request, not the whole account', async () => {
    await ready()
    h.stream.onChange('categories', { eventType: 'UPDATE', new: { name: 'Food' } })
    h.stream.onChange('accounts', { eventType: 'UPDATE', new: {} })
    await tick(300)
    expect(h.pullChanges).toHaveBeenCalledTimes(1)
    expect(h.pullChanges).toHaveBeenCalledWith('u1', { onAdded: expect.any(Function), only: new Set(['categories', 'accounts']) })
  })

  it('reads everything when told to catch up - the stream was away, so any table may have changed', async () => {
    await ready()
    h.stream.onChange('accounts')
    h.stream.onChange('*')
    await tick(300)
    expect(h.pullChanges).toHaveBeenCalledWith('u1', { onAdded: expect.any(Function), only: null })
  })

  it('hands the tables back when a pull does not finish, so the next one reads them', async () => {
    await ready()
    h.pullChanges.mockRejectedValueOnce(new Error('offline'))
    h.stream.onChange('goals')
    await tick(300)
    h.stream.onChange('categories')
    await tick(300)
    expect(h.pullChanges).toHaveBeenLastCalledWith('u1', { onAdded: expect.any(Function), only: new Set(['goals', 'categories']) })
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

  it('puts a transaction from the other device in the ledger the moment it is heard, with no pull', async () => {
    await ready()
    h.applyRemoteTransaction.mockResolvedValueOnce({ handled: true, added: tx })
    const row = { tx_id: 't1', type: 'expense', amount: 150, transaction_date: '2026-10-08T04:00:00.000Z' }
    h.stream.onChange('transactions', { eventType: 'INSERT', new: row })
    await tick(20)
    expect(h.applyRemoteTransaction).toHaveBeenCalledWith(row, { reconcile: false })
    expect(h.showToast).toHaveBeenCalledWith('From your other device: Lunch, ₱150.00', 'success', { ifIdle: true })
    await tick(1000)
    expect(h.pullChanges).not.toHaveBeenCalled()
  })

  it('says nothing for a transaction it already had', async () => {
    await ready()
    h.stream.onChange('transactions', { eventType: 'UPDATE', new: { tx_id: 't1' } })
    await tick(50)
    expect(h.applyRemoteTransaction).toHaveBeenCalledTimes(1)
    expect(h.showToast).not.toHaveBeenCalled()
  })

  it('puts a transaction in even while a sync is running: the two cannot both add one, so neither waits', async () => {
    /** @type {() => void} */ let finish = () => {}
    await ready()
    h.fullSync.mockImplementationOnce(() => new Promise(res => { finish = () => res({ added: [], first: false }) }))
    act(() => { h.local?.('goals') })
    await tick(350)
    h.applyRemoteTransaction.mockResolvedValueOnce({ handled: true, added: tx })
    h.stream.onChange('transactions', { eventType: 'INSERT', new: { tx_id: 't1' } })
    await tick(20)
    expect(h.applyRemoteTransaction).toHaveBeenCalledTimes(1)
    expect(h.showToast).toHaveBeenCalledTimes(1)
    await act(async () => { finish() })
    await tick(2000)
    expect(h.pullChanges).not.toHaveBeenCalled()
  })

  it('goes in together, with one toast, what is heard while another is being applied', async () => {
    await ready()
    /** @type {() => void} */ let release = () => {}
    h.applyRemoteTransaction
      .mockImplementationOnce(() => new Promise(res => { release = () => res({ handled: true, added: tx }) }))
      .mockResolvedValueOnce({ handled: true, added: { ...tx, description: 'Dinner' } })
      .mockResolvedValueOnce({ handled: true, added: { ...tx, description: 'Coffee' } })
    h.stream.onChange('transactions', { eventType: 'INSERT', new: { tx_id: 't1' } })
    await tick(5)
    h.stream.onChange('transactions', { eventType: 'INSERT', new: { tx_id: 't2' } })
    h.stream.onChange('transactions', { eventType: 'INSERT', new: { tx_id: 't3' } })
    // The same one told twice - by the other device directly, then by the database - is one.
    h.stream.onChange('transactions', { eventType: 'UPDATE', new: { tx_id: 't3' } })
    await act(async () => { release() })
    await tick(20)
    expect(h.applyRemoteTransaction).toHaveBeenCalledTimes(3)
    // The first on its own as it came, the other two together.
    expect(h.showToast).toHaveBeenCalledTimes(2)
  })

  it('keeps what it hears before this session has had its first sync, and puts it in when that ends', async () => {
    /** @type {() => void} */ let finish = () => {}
    h.fullSync.mockImplementationOnce(() => new Promise(res => { finish = () => res({ added: [], first: false }) }))
    mount()
    await tick(50)
    h.applyRemoteTransaction.mockResolvedValueOnce({ handled: true, added: tx })
    h.stream.onChange('transactions', { eventType: 'INSERT', new: { tx_id: 't1' } })
    await tick(50)
    expect(h.applyRemoteTransaction).not.toHaveBeenCalled()
    await act(async () => { finish() })
    await tick(20)
    expect(h.applyRemoteTransaction).toHaveBeenCalledTimes(1)
  })

  it('leaves it to a pull when the message is not a whole transaction, or the change was a delete', async () => {
    await ready()
    h.applyRemoteTransaction.mockResolvedValueOnce({ handled: false, added: null })
    h.stream.onChange('transactions', { eventType: 'UPDATE', new: { tx_id: 't1' } })
    await tick(300)
    expect(h.pullChanges).toHaveBeenCalledTimes(1)
    h.stream.onChange('transactions', { eventType: 'DELETE', new: {} })
    await tick(300)
    expect(h.applyRemoteTransaction).toHaveBeenCalledTimes(1)
    expect(h.pullChanges).toHaveBeenCalledTimes(2)
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
  it('goes up within a moment of a change, once for a burst', async () => {
    await ready()
    h.refreshSession.mockClear()
    for (let i = 0; i < 5; i++) { act(() => { h.local?.() }); await tick(200) }
    expect(h.fullSync).toHaveBeenCalledTimes(1)
    await tick(150)
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
    await tick(500) // the first sync's own look for anything it left behind
    // Written after the push had looked, so still marked unsent when it ends.
    h.fullSync.mockImplementationOnce(async () => { h.unsynced = [{ txId: 't9' }]; return { added: [], first: false } })
    // ...and the go after it sends it.
    h.fullSync.mockImplementation(async () => { h.unsynced = []; return { added: [], first: false } })
    act(() => { h.local?.() })
    await tick(350)
    expect(h.fullSync).toHaveBeenCalledTimes(2)
    await tick(500)
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

/**
 * A pull writes into the tables a person is using, and the watcher of local
 * changes is silent while it does - so a save made in that moment is marked
 * unsent on its row and nobody has asked for it to be sent. What rescues it is
 * the look at the end of a sync or a pull.
 */
describe('a save made while the cloud was writing', () => {
  it('goes up when a pull ends and finds a row still unsent', async () => {
    await ready()
    await tick(500) // the first sync's own look for anything it left behind
    // The push that follows clears what it sent.
    h.fullSync.mockImplementation(async () => { h.unsent = new Set(); return { added: [], first: false } })
    h.unsent = new Set(['accounts', 'goals'])
    h.stream.onChange('categories')
    await tick(300)
    expect(h.pullChanges).toHaveBeenCalledTimes(1)
    expect(h.fullSync).toHaveBeenCalledTimes(1)
    await tick(500)
    expect(h.fullSync).toHaveBeenCalledTimes(2)
    // Only those tables, ledger first: the same push a change of their own would have made.
    expect(h.fullSync).toHaveBeenLastCalledWith('u1', { choice: null, quick: true, only: new Set(['accounts', 'goals']) })
    await tick(5000)
    expect(h.fullSync).toHaveBeenCalledTimes(2)
  })

  it('goes up when a sync ends and finds one that was written while it ran', async () => {
    await ready()
    await tick(500)
    h.fullSync.mockImplementationOnce(async () => { h.unsent = new Set(['recurring']); return { added: [], first: false } })
    h.fullSync.mockImplementation(async () => { h.unsent = new Set(); return { added: [], first: false } })
    act(() => { h.local?.('goals') })
    await tick(350)
    expect(h.fullSync).toHaveBeenCalledTimes(2)
    expect(h.fullSync).toHaveBeenLastCalledWith('u1', { choice: null, quick: true, only: new Set(['goals']) })
    await tick(500)
    expect(h.fullSync).toHaveBeenCalledTimes(3)
    expect(h.fullSync).toHaveBeenLastCalledWith('u1', { choice: null, quick: true, only: new Set(['recurring']) })
  })

  it('does not push when nothing is unsent, however many pulls there are', async () => {
    await ready()
    await tick(500)
    for (let i = 0; i < 3; i++) { h.stream.onChange('accounts'); await tick(800) }
    expect(h.pullChanges).toHaveBeenCalledTimes(3)
    expect(h.fullSync).toHaveBeenCalledTimes(1)
  })

  it('does not loop for ever on a row that cannot be sent', async () => {
    await ready()
    await tick(500)
    h.unsent = new Set(['accounts'])
    h.stream.onChange('accounts')
    await tick(30_000)
    // The first sync, and no more than two goes at what it left behind.
    expect(h.fullSync.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('is not an error when the look cannot be made', async () => {
    await ready()
    await tick(500)
    h.unsentTables.mockRejectedValue(new Error('the database is closed'))
    h.stream.onChange('accounts')
    await tick(1500)
    expect(h.pullChanges).toHaveBeenCalledTimes(1)
    expect(h.fullSync).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Sync failed')).toBeNull()
  })
})

describe('telling the other devices directly', () => {
  it('tells them of a transaction the moment it is saved, without waiting for the push', async () => {
    await ready()
    h.ledger = { 7: { id: 7, txId: 't7', amount: 150 } }
    h.localTx?.(7)
    await tick(5)
    expect(h.share).toHaveBeenCalledTimes(1)
    expect(h.share).toHaveBeenCalledWith({ tx_id: 't7', user_id: 'u1', amount: 150 })
    // Still before the push, which waits a moment for a burst of saves.
    expect(h.fullSync).toHaveBeenCalledTimes(1)
  })

  it('tells once for a transaction written several times in one save', async () => {
    await ready()
    h.ledger = { 7: { id: 7, txId: 't7', amount: 150 } }
    h.localTx?.(7); h.localTx?.(7); h.localTx?.(7)
    await tick(5)
    expect(h.share).toHaveBeenCalledTimes(1)
  })

  it('says nothing of a row that has no stable id yet, or has gone', async () => {
    await ready()
    h.ledger = { 8: { id: 8, amount: 5 } }
    h.localTx?.(8); h.localTx?.(9)
    await tick(5)
    expect(h.share).not.toHaveBeenCalled()
  })

  it('puts a transaction it is told of straight into the ledger, and says so', async () => {
    await ready()
    h.applyRemoteTransaction.mockResolvedValueOnce({ handled: true, added: tx })
    const row = { tx_id: 't1', type: 'expense', amount: 150, transaction_date: '2026-10-08T04:00:00.000Z' }
    h.toldOfTransaction?.(row)
    await tick(20)
    expect(h.applyRemoteTransaction).toHaveBeenCalledWith(row, { reconcile: false })
    expect(h.showToast).toHaveBeenCalledWith('From your other device: Lunch, ₱150.00', 'success', { ifIdle: true })
    expect(h.pullChanges).not.toHaveBeenCalled()
  })

  it('does not say it twice when the database announces the same transaction a moment later', async () => {
    await ready()
    h.applyRemoteTransaction.mockResolvedValueOnce({ handled: true, added: tx })
    h.toldOfTransaction?.({ tx_id: 't1' })
    await tick(20)
    // The ledger has it now, so the second time nothing is new.
    h.stream.onChange('transactions', { eventType: 'INSERT', new: { tx_id: 't1' } })
    await tick(20)
    expect(h.applyRemoteTransaction).toHaveBeenCalledTimes(2)
    expect(h.showToast).toHaveBeenCalledTimes(1)
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
