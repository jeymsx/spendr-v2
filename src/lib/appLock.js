/**
 * The app lock: Face ID in front of Spendr, kept on this device alone.
 *
 * ── A lock on the screen, not on the data ──
 *
 * Nothing here encrypts anything. The ledger sits in IndexedDB exactly as it
 * always did, and whoever can read this phone's storage can read it. What
 * the lock does is keep Spendr's screens closed until Face ID says it is you,
 * which is what handing the phone to someone needs - and Settings says so in
 * as many words.
 *
 * ── On this device, never synced ──
 *
 * The lock lives in localStorage. That is read synchronously, so the very
 * first render already knows whether to draw the app or the lock - a Dexie
 * read would leave the app on screen for a frame first - and it is outside
 * everything that syncs or goes into a backup, so a backup restored onto
 * another phone arrives unlocked rather than locked to a passkey that phone
 * does not have.
 *
 * ── When it locks ──
 *
 * Opening Spendr locks it, unless it was last on screen, unlocked, within
 * the delay you chose ("Lock after"). Leaving it does not lock it on the
 * spot - it covers it, so the app switcher shows no money - and coming back
 * locks it once the time away reaches the delay. One more exception: a
 * reload while Spendr is open and on screen (an update, a sign-in coming
 * back) keeps it open for a few seconds, since nobody left. That note is in
 * sessionStorage, which a reload and a same-tab redirect keep and a fresh
 * launch or a new tab does not - so closing Spendr and opening it again is
 * never mistaken for a reload.
 *
 * ── Getting back in ──
 *
 * Face ID, checked properly, or a 6-digit PIN, kept only as a salted PBKDF2
 * hash, with a pause that grows after repeated wrong tries - both in
 * lib/unlock.js, which comes with the lock screen rather than the first
 * screen. Or, for someone with an account, signing in again with it, which
 * turns the lock off.
 */

export const LOCK_KEY = 'spendr-lock'
const AWAY_KEY = 'spendr-lock-away'
const RELOAD_KEY = 'spendr-lock-reload'
const TRIES_KEY = 'spendr-lock-tries'
const RECOVERY_KEY = 'spendr-lock-recovery'
/* This device's passkey user handle. Kept when the lock is turned off, so
   turning it on again replaces the same passkey in Passwords rather than
   adding another beside it. */
const USER_KEY = 'spendr-lock-user'

/** "Lock after": immediately, after a minute, after five. */
export const DELAYS = [0, 60_000, 300_000]

/** How long a reload while Spendr is open and on screen keeps it open. */
export const RELOAD_GRACE = 15_000

export const PIN_LENGTH = 6

/* A "Sign in again" left unfinished stops counting after half an hour. */
const RECOVERY_TTL = 30 * 60_000

/**
 * @typedef {object} PinHash
 * @property {string} salt        base64url, 16 bytes
 * @property {string} hash        base64url, 32 bytes of PBKDF2-SHA256
 * @property {number} iterations
 */

/**
 * @typedef {object} LockConfig
 * @property {string} credentialId    the passkey, base64url
 * @property {string} publicKey       its public key, SPKI, base64url
 * @property {number} delay           one of DELAYS
 * @property {PinHash | null} pin
 * @property {string | null} accountId  whose sign-in can turn the lock off
 * @property {string} since           when it was turned on, ISO
 */

/** @typedef {Pick<Storage, 'getItem'|'setItem'|'removeItem'>} Store */

/** localStorage where it can be reached, null where it cannot. @returns {Store|null} */
function local() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** sessionStorage: this tab, this launch. @returns {Store|null} */
function tab() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/** @param {string} key @param {Store|null} store @returns {any} */
function get(key, store) {
  try { return JSON.parse(store?.getItem(key) ?? 'null') } catch { return null }
}

/** Whether it was written. @param {string} key @param {unknown} value @param {Store|null} store */
function put(key, value, store) {
  try {
    if (!store) return false
    store.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** @param {string} key @param {Store|null} store */
function drop(key, store) {
  try { store?.removeItem(key) } catch { /* nothing to drop */ }
}

// ── The lock itself ──────────────────────────────────────────────────────────

/**
 * The lock, or null when it is off - or when what is stored is not one,
 * which is treated as off rather than as a lock nobody can open.
 *
 * @param {Store|null} [store]
 * @returns {LockConfig | null}
 */
export function readLock(store = local()) {
  const c = get(LOCK_KEY, store)
  if (!c || typeof c !== 'object') return null
  if (typeof c.credentialId !== 'string' || !c.credentialId || typeof c.publicKey !== 'string' || !c.publicKey) return null
  const p = c.pin
  const pin = p && typeof p === 'object' && typeof p.salt === 'string' && typeof p.hash === 'string'
    && Number.isFinite(p.iterations) && p.iterations > 0
    ? { salt: p.salt, hash: p.hash, iterations: p.iterations }
    : null
  return {
    credentialId: c.credentialId,
    publicKey: c.publicKey,
    delay: DELAYS.includes(c.delay) ? c.delay : 0,
    pin,
    accountId: typeof c.accountId === 'string' && c.accountId ? c.accountId : null,
    since: typeof c.since === 'string' ? c.since : '',
  }
}

/**
 * Keep the lock - and make sure it was kept. Storage that is full or shut
 * would otherwise let Settings say "on" while the next launch opens straight
 * to the money.
 *
 * @param {LockConfig} config
 * @param {Store|null} [store]
 */
export function saveLock(config, store = local()) {
  const kept = put(LOCK_KEY, config, store) ? readLock(store) : null
  if (!kept || kept.credentialId !== config.credentialId || kept.delay !== config.delay
    || JSON.stringify(kept.pin) !== JSON.stringify(config.pin ?? null)) {
    throw new Error("Couldn't save the lock on this device.")
  }
}

/**
 * Turn the lock off: the passkey, the PIN, and everything counted on the
 * way. The passkey itself is in the phone's keychain, where Spendr cannot
 * delete it - but a browser that can pass the word on tells its keeper that
 * Spendr no longer knows it, so it can be tidied away.
 *
 * @param {Store|null} [store]
 */
export function clearLock(store = local(), tabStore = tab()) {
  const config = readLock(store)
  for (const key of [LOCK_KEY, AWAY_KEY, TRIES_KEY, RECOVERY_KEY]) drop(key, store)
  drop(RELOAD_KEY, tabStore)
  mirrors.delete(store ?? MEMORY)
  if (config) forgetPasskey(config.credentialId)
}

/**
 * The WebAuthn signal API: "this credential is not one of mine any more".
 * Only where the browser has it; nothing depends on it.
 *
 * @param {string} credentialId
 */
function forgetPasskey(credentialId) {
  try {
    const PKC = /** @type {any} */ (globalThis).PublicKeyCredential
    if (typeof PKC?.signalUnknownCredential !== 'function') return
    Promise.resolve(PKC.signalUnknownCredential({ rpId: location.hostname, credentialId })).catch(() => {})
  } catch { /* nothing to tidy */ }
}

/**
 * The Face ID test page's leftovers - phase 1 of this lock, now gone: its
 * passkey, and its notes in storage.
 *
 * @param {Store|null} [store]
 */
export function forgetFaceIdTest(store = local()) {
  const test = get('spendr-faceid-test', store)
  if (!test) return
  if (typeof test.id === 'string') forgetPasskey(test.id)
  drop('spendr-faceid-test', store)
  try {
    sessionStorage.removeItem('spendr-faceid-test-results')
    sessionStorage.removeItem('spendr-faceid-test-on-load')
  } catch { /* nothing kept */ }
}

/**
 * The lock in a few words, for its row in Settings.
 *
 * @param {LockConfig | null} config
 */
export function lockSummary(config) {
  if (!config) return 'Off'
  return config.delay === 0 ? 'Locks immediately' : `Locks after ${Math.round(config.delay / 60_000)} min`
}

// ── When it locks ────────────────────────────────────────────────────────────

/**
 * Whether time away is enough to lock: always for "immediately", always when
 * there is no record of leaving, and always when the clock has gone
 * backwards - a phone set back an hour must not read as a minute away.
 *
 * @param {number} delay
 * @param {number | null | undefined} leftAt
 * @param {number} now
 */
export function awayTooLong(delay, leftAt, now) {
  if (typeof leftAt !== 'number' || !Number.isFinite(leftAt)) return true
  const away = now - leftAt
  return away < 0 || away >= delay
}

/**
 * Whether Spendr opens locked. It does, unless it was on screen and
 * unlocked within the delay - or it has just reloaded itself while open.
 * Reads only: the reload note is spent by spendReload once the app is up,
 * and a launch that locks spends the time away (clearAway), so the same
 * departure cannot be tried against the clock launch after launch.
 *
 * @param {LockConfig | null} config
 * @param {number} now
 * @param {Store|null} [store]
 * @param {Store|null} [tabStore]
 */
export function locksOnLaunch(config, now, store = local(), tabStore = tab()) {
  if (!config) return false
  const reloadAt = get(RELOAD_KEY, tabStore)
  if (typeof reloadAt === 'number' && now - reloadAt >= 0 && now - reloadAt < RELOAD_GRACE) return false
  if (config.delay === 0) return true
  return awayTooLong(config.delay, get(AWAY_KEY, store), now)
}

/** Spendr went off screen while unlocked. @param {number} now @param {Store|null} [store] */
export function noteAway(now, store = local()) { put(AWAY_KEY, now, store) }

/** When it went off screen, if it did. @param {Store|null} [store] @returns {number|null} */
export function readAway(store = local()) {
  const at = get(AWAY_KEY, store)
  return typeof at === 'number' ? at : null
}

/** It locked: the time away is spent. @param {Store|null} [store] */
export function clearAway(store = local()) { drop(AWAY_KEY, store) }

/** Spendr is reloading while unlocked and on screen. @param {number} now @param {Store|null} [tabStore] */
export function noteReload(now, tabStore = tab()) { put(RELOAD_KEY, now, tabStore) }

/** A reload's grace is for the launch right after it, once. @param {Store|null} [tabStore] */
export function spendReload(tabStore = tab()) { drop(RELOAD_KEY, tabStore) }

// ── The PIN ──────────────────────────────────────────────────────────────────

/** @param {string} pin */
export function validPin(pin) {
  return typeof pin === 'string' && pin.length === PIN_LENGTH && /^\d+$/.test(pin)
}

/**
 * The pause a run of wrong PINs earns. The first four are free - a thumb
 * slips - then half a minute, a minute, five, fifteen, and an hour from the
 * ninth on: the shape of the iPhone's own passcode.
 *
 * @param {number} fails wrong PINs in a row
 */
export function pauseAfter(fails) {
  if (fails < 5) return 0
  return [30_000, 60_000, 300_000, 900_000][fails - 5] ?? 3_600_000
}

/** @typedef {{fails: number, until: number}} Tries */

/* The tries as this page last counted them, beside what is stored: a store
   that will not take a write must not switch the pause off, and a pause
   begun on this page is counted down by a clock nobody can set - so moving
   the phone's clock on does not end it early while the lock is up. */
const mirrors = new WeakMap()
const MEMORY = {}
const monotonic = () => (typeof performance === 'undefined' ? Date.now() : performance.now())

/** @param {Store|null} [store] @returns {Tries} */
export function readTries(store = local()) {
  const t = get(TRIES_KEY, store)
  const saved = {
    fails: Number.isFinite(t?.fails) ? t.fails : 0,
    until: Number.isFinite(t?.until) ? t.until : 0,
  }
  const mine = mirrors.get(store ?? MEMORY)
  return mine && mine.fails > saved.fails ? { fails: mine.fails, until: mine.until } : saved
}

/** A wrong PIN: counted, and the pause it earns begun. @param {number} now @param {Store|null} [store] @returns {Tries} */
export function noteWrongPin(now, store = local()) {
  const fails = readTries(store).fails + 1
  const pause = pauseAfter(fails)
  const next = { fails, until: now + pause }
  put(TRIES_KEY, next, store)
  mirrors.set(store ?? MEMORY, { ...next, endsAt: monotonic() + pause })
  return next
}

/** @param {Store|null} [store] */
export function clearTries(store = local()) {
  drop(TRIES_KEY, store)
  mirrors.delete(store ?? MEMORY)
}

/**
 * How long until another PIN may be tried; 0 for now. Never more than the
 * pause itself by the wall clock, so a clock set back cannot turn thirty
 * seconds into a year; and never less than what is left of a pause begun
 * on this page, so a clock moved on cannot cut it short.
 *
 * @param {number} now
 * @param {Store|null} [store]
 */
export function pinWait(now, store = local()) {
  const { fails, until } = readTries(store)
  const byClock = Math.max(0, Math.min(until - now, pauseAfter(fails)))
  const mine = mirrors.get(store ?? MEMORY)
  const byPage = mine ? Math.max(0, mine.endsAt - monotonic()) : 0
  return Math.max(byClock, byPage)
}

// ── Face ID ──────────────────────────────────────────────────────────────────

/** What unlocks this device, in words. An iPhone is Face ID; the prompt itself says Touch ID where that is what it is. */
export function unlockName() {
  if (typeof navigator === 'undefined') return 'Face ID'
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'Face ID'
  if (/Macintosh/.test(ua)) return 'Touch ID'
  if (/Windows/.test(ua)) return 'Windows Hello'
  if (/Android/.test(ua)) return 'your fingerprint'
  return 'your screen lock'
}

/** This device's passkey user handle, if it has made one. @param {Store|null} [store] @returns {string | null} */
export function readLockUser(store = local()) {
  const user = get(USER_KEY, store)
  return typeof user === 'string' && user ? user : null
}

/** @param {string} user @param {Store|null} [store] */
export function saveLockUser(user, store = local()) { put(USER_KEY, user, store) }

// ── Signing in again ─────────────────────────────────────────────────────────

/**
 * "Forgot? Sign in again" was tapped: note whose account, and when that
 * account last signed in on this phone - the server's timestamp, from the
 * session already here, or null when there is none. Only a sign-in later
 * than that one counts, which no setting of the phone's clock can fake.
 *
 * @param {string} accountId
 * @param {string | null} lastSignIn  the current session's user.last_sign_in_at, if it is this account's
 * @param {number} now
 * @param {Store|null} [store]
 */
export function startRecovery(accountId, lastSignIn, now, store = local()) {
  put(RECOVERY_KEY, { accountId, before: lastSignIn ?? null, at: now }, store)
}

/**
 * What a sign-in means for the lock, once the session is known after
 * "Forgot? Sign in again" came back:
 *
 *   reset          the lock's own account, signed in again since the tap:
 *                  turn the lock off. last_sign_in_at is what proves it, set
 *                  by the server and compared with its own value from before
 *                  the tap - a token refresh does not move it, so the session
 *                  already on the phone cannot pass for a new sign-in
 *   wrong-account  somebody else's account: it must not stay signed in here
 *   stale          no new sign-in - cancelled at Google, or failed
 *   none           no "Sign in again" under way (or one long abandoned)
 *
 * Anything but 'none' spends the note.
 *
 * @param {{user?: {id?: string, last_sign_in_at?: string}} | null | undefined} session
 * @param {number} now
 * @param {Store|null} [store]
 * @returns {'reset' | 'wrong-account' | 'stale' | 'none'}
 */
export function recoveryOutcome(session, now, store = local()) {
  const r = get(RECOVERY_KEY, store)
  if (!r) return 'none'
  drop(RECOVERY_KEY, store)
  if (typeof r.accountId !== 'string' || !Number.isFinite(r.at) || Math.abs(now - r.at) > RECOVERY_TTL) return 'none'
  const user = session?.user
  if (!user?.id) return 'stale'
  if (user.id !== r.accountId) return 'wrong-account'
  const signedIn = Date.parse(user.last_sign_in_at ?? '')
  if (!Number.isFinite(signedIn)) return 'stale'
  const before = typeof r.before === 'string' ? Date.parse(r.before) : Number.NEGATIVE_INFINITY
  return Number.isFinite(before) || before === Number.NEGATIVE_INFINITY
    ? (signedIn > before ? 'reset' : 'stale')
    : 'stale'
}

/**
 * Not signing in again after all - it could not start, or Spendr was
 * unlocked another way. Left behind, the note would let a later ordinary
 * sign-in turn the lock off.
 *
 * @param {Store|null} [store]
 */
export function cancelRecovery(store = local()) { drop(RECOVERY_KEY, store) }

/** Whether a "Sign in again" is under way, without spending it. @param {Store|null} [store] */
export function recoveryPending(store = local()) {
  return !!get(RECOVERY_KEY, store)
}
