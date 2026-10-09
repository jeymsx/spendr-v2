import { describe, it, expect } from 'vitest'
import {
  DELAYS, LOCK_KEY, RELOAD_GRACE, arrivalKind, awayTooLong, clearAway, clearLock, clearTries, locksOnLaunch,
  noteAway, noteReload, noteWrongPin, pauseAfter, pinWait, readAway, readLock, readTries,
  recoveryOutcome, recoveryPending, saveLock, spendReload, startRecovery, validPin,
} from './appLock'
import { hashPin, pinMatches, tryLockPin } from './unlock'

/**
 * The rules the app lock runs on: when it locks, how a PIN is kept and
 * checked, how wrong PINs slow down, and when signing in again may turn it
 * off. Storage is a Map standing in for localStorage, and time is passed in.
 */

/** @returns {Pick<Storage, 'getItem'|'setItem'|'removeItem'> & {map: Map<string, string>}} */
function memory() {
  const map = new Map()
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
}

/** @param {Partial<import('./appLock').LockConfig>} [o] @returns {import('./appLock').LockConfig} */
const lock = (o = {}) => ({
  credentialId: 'cred', publicKey: 'spki', delay: 0, pin: null, accountId: null, since: '2026-09-27T00:00:00Z', ...o,
})

// Cheap rounds in tests: the count is stored with the hash, so checking follows it.
const FAST = 1000

describe('the lock as stored', () => {
  it('reads back what was saved', () => {
    const s = memory()
    saveLock(lock({ delay: 60_000, accountId: 'u1' }), s)
    expect(readLock(s)).toEqual(lock({ delay: 60_000, accountId: 'u1' }))
  })

  it('is off when nothing, or nothing like a lock, is stored', () => {
    const s = memory()
    expect(readLock(s)).toBeNull()
    s.setItem(LOCK_KEY, 'not json')
    expect(readLock(s)).toBeNull()
    s.setItem(LOCK_KEY, JSON.stringify({ credentialId: 'cred' }))
    expect(readLock(s)).toBeNull()
  })

  it('falls back to "immediately" for a delay it does not offer, and drops a broken PIN', () => {
    const s = memory()
    s.setItem(LOCK_KEY, JSON.stringify({ ...lock(), delay: 1234, pin: { salt: 'x' } }))
    expect(readLock(s)).toMatchObject({ delay: 0, pin: null })
    expect(DELAYS).toEqual([0, 60_000, 300_000])
  })

  it('turning it off forgets the lock and everything counted for it', () => {
    const s = memory()
    saveLock(lock(), s)
    noteAway(5, s)
    noteWrongPin(10, s)
    startRecovery('u1', null, 10, s)
    clearLock(s, s)
    expect(readLock(s)).toBeNull()
    expect(readAway(s)).toBeNull()
    expect(readTries(s).fails).toBe(0)
    expect(recoveryPending(s)).toBe(false)
  })
})

describe('when it locks', () => {
  const T = 1_000_000_000

  it('locks on opening when there is a lock, and never when there is not', () => {
    expect(locksOnLaunch(null, T, memory())).toBe(false)
    expect(locksOnLaunch(lock(), T, memory())).toBe(true)
  })

  it('stays open on opening within the delay of last being on screen', () => {
    const s = memory()
    noteAway(T - 30_000, s)
    expect(locksOnLaunch(lock({ delay: 60_000 }), T, s)).toBe(false)
    expect(locksOnLaunch(lock({ delay: 60_000 }), T + 31_000, s)).toBe(true)
    expect(locksOnLaunch(lock({ delay: 0 }), T, s)).toBe(true)
  })

  it('stays open for a reload while it was open, once and briefly', () => {
    const s = memory()
    const tabNow = memory()
    noteReload(T, tabNow)
    expect(locksOnLaunch(lock(), T + 2_000, s, tabNow)).toBe(false)
    expect(locksOnLaunch(lock(), T + RELOAD_GRACE, s, tabNow)).toBe(true)
    spendReload(tabNow)
    expect(locksOnLaunch(lock(), T + 2_000, s, tabNow)).toBe(true)
  })

  it('keeps that note in the tab, so a new launch never counts as a reload', () => {
    const s = memory()
    noteReload(T, memory())
    expect(locksOnLaunch(lock(), T + 2_000, s, memory())).toBe(true)
  })

  it('gives the grace to a reload and to a sign-in coming back, never to Back from another site', () => {
    const tabNow = memory()
    noteReload(T, tabNow)
    expect(locksOnLaunch(lock(), T + 2_000, memory(), tabNow, 'reload')).toBe(false)
    expect(locksOnLaunch(lock(), T + 2_000, memory(), tabNow, 'sign-in')).toBe(false)
    expect(locksOnLaunch(lock(), T + 2_000, memory(), tabNow, 'away')).toBe(true)
  })

  it('reads how the page was arrived at from the browser', () => {
    expect(arrivalKind({ type: 'reload' }, {})).toBe('reload')
    expect(arrivalKind({ type: 'navigate' }, { hash: '#access_token=abc&expires_in=3600' })).toBe('sign-in')
    expect(arrivalKind({ type: 'navigate' }, { search: '?code=xyz' })).toBe('sign-in')
    expect(arrivalKind({ type: 'navigate' }, { hash: '', search: '' })).toBe('away')
    expect(arrivalKind({ type: 'back_forward' }, {})).toBe('away')
    expect(arrivalKind(undefined, {})).toBe('unknown')
  })

  it('counts time away against the delay, and a clock set back as long away', () => {
    expect(awayTooLong(60_000, T, T + 59_999)).toBe(false)
    expect(awayTooLong(60_000, T, T + 60_000)).toBe(true)
    expect(awayTooLong(0, T, T)).toBe(true)
    expect(awayTooLong(300_000, T, T - 1)).toBe(true)
    expect(awayTooLong(300_000, null, T)).toBe(true)
  })

  it('forgets the time away once it has locked', () => {
    const s = memory()
    noteAway(T, s)
    clearAway(s)
    expect(readAway(s)).toBeNull()
  })
})

describe('the PIN', () => {
  it('is six digits and nothing else', () => {
    expect(validPin('123456')).toBe(true)
    for (const bad of ['12345', '1234567', '12345a', '', ' 23456']) expect(validPin(bad)).toBe(false)
  })

  it('is kept as a salted hash, never as the digits', async () => {
    const kept = await hashPin('482915', FAST)
    expect(JSON.stringify(kept)).not.toContain('482915')
    expect(kept.iterations).toBe(FAST)
    const again = await hashPin('482915', FAST)
    expect(again.salt).not.toBe(kept.salt)
    expect(again.hash).not.toBe(kept.hash)
  })

  it('matches only itself', async () => {
    const kept = await hashPin('482915', FAST)
    expect(await pinMatches('482915', kept)).toBe(true)
    expect(await pinMatches('482916', kept)).toBe(false)
    expect(await pinMatches('48291', kept)).toBe(false)
    expect(await pinMatches('482915', null)).toBe(false)
    expect(await pinMatches('482915', { ...kept, salt: '***' })).toBe(false)
  })

  it('is hashed with enough rounds to be slow to guess by default', async () => {
    const { PIN_ITERATIONS } = await import('./unlock')
    expect(PIN_ITERATIONS).toBeGreaterThanOrEqual(600_000)
  })
})

describe('wrong PINs slow down', () => {
  it('lets four slip, then pauses longer each time', () => {
    expect([1, 2, 3, 4].map(pauseAfter)).toEqual([0, 0, 0, 0])
    expect([5, 6, 7, 8, 9, 20].map(pauseAfter)).toEqual([30_000, 60_000, 300_000, 900_000, 3_600_000, 3_600_000])
  })

  it('remembers the pause, so reopening the app does not start it over', () => {
    const s = memory()
    for (let i = 0; i < 5; i++) noteWrongPin(1000, s)
    // Reopened: the same storage, a new page with nothing counted in memory.
    const reopened = { ...s }
    expect(readTries(reopened).fails).toBe(5)
    expect(pinWait(1000, reopened)).toBe(30_000)
    expect(pinWait(1000 + 29_000, reopened)).toBe(1_000)
    expect(pinWait(1000 + 30_000, reopened)).toBe(0)
  })

  it('never waits longer than the pause, whatever the clock says', () => {
    const s = memory()
    for (let i = 0; i < 5; i++) noteWrongPin(10_000_000, s)
    expect(pinWait(0, { ...s })).toBe(30_000)
  })

  it('does not end a pause begun on this page when the clock is moved on', () => {
    const s = memory()
    for (let i = 0; i < 5; i++) noteWrongPin(1000, s)
    expect(pinWait(1000 + 3_600_000, s)).toBeGreaterThan(25_000)
  })

  it('keeps counting on this page when storage will not take a write', () => {
    const full = { ...memory(), setItem: () => { throw new Error('QuotaExceededError') } }
    for (let i = 0; i < 5; i++) noteWrongPin(1000, full)
    expect(readTries(full).fails).toBe(5)
    expect(pinWait(1000, full)).toBeGreaterThan(25_000)
  })

  it('refuses a PIN unheard during a pause, even the right one', async () => {
    const s = memory()
    const config = lock({ pin: await hashPin('482915', FAST) })
    for (let i = 0; i < 4; i++) expect(await tryLockPin('000000', config, s)).toMatchObject({ ok: false, wait: 0 })
    const fifth = await tryLockPin('000000', config, s)
    expect(fifth).toMatchObject({ ok: false, fails: 5 })
    expect(fifth.ok === false && fifth.wait).toBeGreaterThan(29_000)
    expect(await tryLockPin('482915', config, s)).toMatchObject({ ok: false, fails: 5 })
    clearTries(s)
    expect(await tryLockPin('482915', config, s)).toEqual({ ok: true })
    expect(readTries(s).fails).toBe(0)
  })

  it('starts over after the right one', () => {
    const s = memory()
    noteWrongPin(1, s)
    clearTries(s)
    expect(readTries(s)).toEqual({ fails: 0, until: 0 })
  })
})

describe('signing in again', () => {
  const T = Date.parse('2026-09-27T10:00:00Z')
  const DAYS_AGO = new Date(T - 3 * 86_400_000).toISOString()
  const session = (/** @type {string} */ id, /** @type {number|string} */ at) =>
    ({ user: { id, last_sign_in_at: typeof at === 'string' ? at : new Date(at).toISOString() } })

  it('turns the lock off for its own account, signed in again since the tap', () => {
    const s = memory()
    startRecovery('u1', DAYS_AGO, T, s)
    expect(recoveryOutcome(session('u1', T + 20_000), T + 30_000, s)).toBe('reset')
    expect(recoveryPending(s)).toBe(false)
  })

  it('counts any sign-in by the account when the phone was signed out at the tap', () => {
    const s = memory()
    startRecovery('u1', null, T, s)
    expect(recoveryOutcome(session('u1', T + 20_000), T + 30_000, s)).toBe('reset')
  })

  it('refuses another account', () => {
    const s = memory()
    startRecovery('u1', DAYS_AGO, T, s)
    expect(recoveryOutcome(session('u2', T + 20_000), T + 30_000, s)).toBe('wrong-account')
  })

  it('does not take the session already on the phone for a new sign-in', () => {
    const s = memory()
    startRecovery('u1', DAYS_AGO, T, s)
    expect(recoveryOutcome(session('u1', DAYS_AGO), T + 30_000, s)).toBe('stale')
  })

  it('cannot be fooled by setting the phone clock back', () => {
    const s = memory()
    const aWeekBehind = T - 7 * 86_400_000
    startRecovery('u1', DAYS_AGO, aWeekBehind, s)
    expect(recoveryOutcome(session('u1', DAYS_AGO), aWeekBehind + 30_000, s)).toBe('stale')
  })

  it('is nothing when there is no session, no request, or one long abandoned', () => {
    const s = memory()
    startRecovery('u1', DAYS_AGO, T, s)
    expect(recoveryOutcome(null, T + 30_000, s)).toBe('stale')
    expect(recoveryOutcome(session('u1', T), T, s)).toBe('none')
    startRecovery('u1', DAYS_AGO, T, s)
    expect(recoveryOutcome(session('u1', T + 3_600_000), T + 3_600_000, s)).toBe('none')
  })
})

describe('keeping the lock', () => {
  it('says so when the lock could not be saved, rather than claiming it is on', () => {
    const full = { ...memory(), setItem: () => { throw new Error('QuotaExceededError') } }
    expect(() => saveLock(lock(), full)).toThrow(/Couldn't save/)
  })
})
