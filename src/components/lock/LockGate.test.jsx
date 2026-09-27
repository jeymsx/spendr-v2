// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'

/**
 * The gate: what renders at launch with a lock on, and when it locks again.
 *
 * The lock screen itself is stood in for - a button that unlocks - since
 * what is under test is the gate's promise: with a lock on, nothing of the
 * app renders until it is unlocked; off screen it is covered at once; and
 * coming back locks it only once the time away reaches "Lock after".
 */

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ loading: false, session: null, user: null, signInWithGoogle: () => Promise.resolve({}) }),
}))
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: () => {} }) }))
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { signOut: () => Promise.resolve({}) } },
  isSupabaseConfigured: false,
}))
vi.mock('./LockScreen', () => ({
  default: (/** @type {{onUnlock: () => void}} */ { onUnlock }) => (
    <div data-testid="lock"><button type="button" onClick={onUnlock}>Unlock</button></div>
  ),
}))

const { default: LockGate } = await import('./LockGate')
const { noteReload, saveLock } = await import('../../lib/appLock')

/** @param {number} delay */
const lockWith = (delay) => saveLock({
  credentialId: 'cred', publicKey: 'spki', delay, pin: null, accountId: null, since: '2026-09-27T00:00:00Z',
})

let visibility = 'visible'
let now = Date.parse('2026-09-27T10:00:00Z')

/** @param {'hidden'|'visible'} state */
function turn(state) {
  visibility = state
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
}

const app = () => render(<LockGate><p>Balance ₱12,345.00</p></LockGate>)
const html = () => document.documentElement.classList

beforeEach(() => {
  localStorage.clear()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  // Reduced motion, so an unlock takes the lock away at once rather than after its fade.
  window.matchMedia = /** @type {any} */ ((/** @type {string} */ q) => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {} }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  html().remove('app-locked', 'app-covered')
})

describe('opening Spendr', () => {
  it('shows the app when there is no lock', () => {
    app()
    expect(screen.getByText(/Balance/)).toBeTruthy()
    expect(screen.queryByTestId('lock')).toBeNull()
    expect(html().contains('app-locked')).toBe(false)
  })

  it('with a lock, renders the lock and nothing of the app', async () => {
    lockWith(0)
    app()
    expect(await screen.findByTestId('lock')).toBeTruthy()
    expect(screen.queryByText(/Balance/)).toBeNull()
    expect(html().contains('app-locked')).toBe(true)
  })

  it('renders the app once unlocked', async () => {
    lockWith(0)
    app()
    fireEvent.click(await screen.findByText('Unlock'))
    expect(screen.getByText(/Balance/)).toBeTruthy()
    expect(screen.queryByTestId('lock')).toBeNull()
    expect(html().contains('app-locked')).toBe(false)
  })

  it('stays open across a reload it made while open', () => {
    lockWith(0)
    noteReload(now - 2_000)
    app()
    expect(screen.getByText(/Balance/)).toBeTruthy()
  })
})

describe('leaving and coming back', () => {
  it('covers the app the moment it goes off screen', () => {
    lockWith(60_000)
    noteReload(now)
    app()
    turn('hidden')
    expect(html().contains('app-covered')).toBe(true)
    expect(screen.getByText(/Balance/)).toBeTruthy()
  })

  it('uncovers it inside the delay, and locks it once the delay has passed', async () => {
    lockWith(60_000)
    noteReload(now)
    app()
    turn('hidden')
    now += 30_000
    turn('visible')
    expect(html().contains('app-covered')).toBe(false)
    expect(screen.queryByTestId('lock')).toBeNull()

    turn('hidden')
    now += 61_000
    turn('visible')
    expect(await screen.findByTestId('lock')).toBeTruthy()
    expect(html().contains('app-locked')).toBe(true)
    // Laid over the app rather than taking it away: what was on screen is still there.
    expect(screen.getByText(/Balance/)).toBeTruthy()
  })

  it('locks on any return when it is set to lock immediately', async () => {
    lockWith(0)
    noteReload(now)
    app()
    turn('hidden')
    now += 1_000
    turn('visible')
    expect(await screen.findByTestId('lock')).toBeTruthy()
  })

  it('does not take a "visible" with no "hidden" before it for a return', () => {
    lockWith(0)
    noteReload(now)
    app()
    turn('visible')
    expect(screen.queryByTestId('lock')).toBeNull()
    expect(screen.getByText(/Balance/)).toBeTruthy()
  })

  it('forgets wrong PINs once it is open again', async () => {
    const { noteWrongPin, readTries } = await import('../../lib/appLock')
    lockWith(0)
    for (let i = 0; i < 3; i++) noteWrongPin(now)
    app()
    fireEvent.click(await screen.findByText('Unlock'))
    expect(readTries().fails).toBe(0)
  })

  it('counts time off screen by a clock nobody can set, as well as the wall clock', async () => {
    let tick = 1_000
    vi.spyOn(performance, 'now').mockImplementation(() => tick)
    lockWith(60_000)
    noteReload(now)
    app()
    turn('hidden')
    tick += 120_000        // two minutes really passed...
    now += 5_000           // ...though the phone's clock says five seconds
    turn('visible')
    expect(await screen.findByTestId('lock')).toBeTruthy()
  })

  it('covers a page that starts off screen, and locks it on its first return once the delay has passed', async () => {
    lockWith(60_000)
    const { noteAway } = await import('../../lib/appLock')
    noteAway(now - 30_000)
    visibility = 'hidden'
    app()
    expect(html().contains('app-covered')).toBe(true)
    expect(screen.queryByTestId('lock')).toBeNull()
    now += 600_000
    turn('visible')
    expect(await screen.findByTestId('lock')).toBeTruthy()
  })

  it('spends the time away when it opens locked, so it cannot be tried again', async () => {
    const { noteAway, readAway } = await import('../../lib/appLock')
    lockWith(60_000)
    noteAway(now - 120_000)
    app()
    expect(await screen.findByTestId('lock')).toBeTruthy()
    expect(readAway()).toBeNull()
  })

  it('keeps the cover on when an unlock lands while Spendr is off screen', async () => {
    lockWith(0)
    app()
    const unlockButton = await screen.findByText('Unlock')
    turn('hidden')
    fireEvent.click(unlockButton)
    expect(html().contains('app-covered')).toBe(true)
  })

  it('treats a clock set back as long away', async () => {
    lockWith(300_000)
    noteReload(now)
    app()
    turn('hidden')
    now -= 3_600_000
    turn('visible')
    expect(await screen.findByTestId('lock')).toBeTruthy()
  })
})
