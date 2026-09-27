import { createPasskey, fromB64url, getAssertion, readRegistration, toB64url, verifyAssertion } from './passkey'
import { clearTries, noteWrongPin, pinWait, readLockUser, readTries, saveLockUser, validPin } from './appLock'

/**
 * The ways into a lock: Face ID, checked, and the PIN.
 *
 * Apart from lib/appLock.js on purpose. The gate that decides whether to
 * lock is in the first bundle, so it has to stay small; this - WebAuthn, the
 * signature check, PBKDF2 - is only ever needed by the lock screen and the
 * lock's own settings, and arrives with them.
 */

/** @typedef {import('./appLock').LockConfig} LockConfig */
/** @typedef {import('./appLock').PinHash} PinHash */
/** @typedef {import('./appLock').Store} Store */

/**
 * PBKDF2 rounds for the PIN. OWASP's figure for PBKDF2-HMAC-SHA256, and
 * about half a second on a recent iPhone - once per PIN typed.
 */
export const PIN_ITERATIONS = 600_000

/** @param {string} pin @param {Uint8Array} salt @param {number} iterations */
async function derive(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
}

/**
 * A PIN as it is kept: a random salt and a PBKDF2-SHA256 hash. Never the
 * digits.
 *
 * @param {string} pin
 * @param {number} [iterations]
 * @returns {Promise<PinHash>}
 */
export async function hashPin(pin, iterations = PIN_ITERATIONS) {
  if (!validPin(pin)) throw new Error('A PIN is six digits.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { salt: toB64url(salt), hash: toB64url(await derive(pin, salt, iterations)), iterations }
}

/**
 * Whether `pin` is the one behind `kept`, compared in constant time. False,
 * never a throw, for anything malformed.
 *
 * @param {string} pin
 * @param {PinHash | null | undefined} kept
 */
export async function pinMatches(pin, kept) {
  if (!kept || !validPin(pin)) return false
  try {
    const got = await derive(pin, fromB64url(kept.salt), kept.iterations)
    const want = fromB64url(kept.hash)
    if (got.length !== want.length) return false
    let diff = 0
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i]
    return diff === 0
  } catch {
    return false
  }
}

/**
 * A PIN typed at a lock: refused unheard during a pause, checked otherwise,
 * and counted when wrong. What to say comes back with it - how many wrong in
 * a row, and how long the pause now is.
 *
 * @param {string} pin
 * @param {LockConfig | null} config
 * @param {Store|null} [store]
 * @returns {Promise<{ok: true} | {ok: false, fails: number, wait: number}>}
 */
export async function tryLockPin(pin, config, store) {
  const waiting = pinWait(Date.now(), store)
  if (waiting > 0) return { ok: false, fails: readTries(store).fails, wait: waiting }
  if (await pinMatches(pin, config?.pin)) {
    clearTries(store)
    return { ok: true }
  }
  const { fails } = noteWrongPin(Date.now(), store)
  return { ok: false, fails, wait: pinWait(Date.now(), store) }
}

/** The device, for the passkey's name in Passwords: "Spendr app lock on this iPhone". */
function deviceWord() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
  return /iPad/.test(ua) ? 'iPad' : /iPhone|iPod/.test(ua) ? 'iPhone' : /Macintosh/.test(ua) ? 'Mac'
    : /Android/.test(ua) ? 'phone' : 'device'
}

/** A new passkey that failed a check, with PASSKEY_PROBLEMS' key as its reason. */
export class PasskeyCheckError extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(reason)
    this.name = 'PasskeyCheckError'
    this.reason = reason
  }
}

/**
 * Make this device's lock passkey, verified with Face ID. Call it straight
 * from the tap: the browser is asked before anything is awaited. Resolves
 * with the passkey once it has been checked (lib/passkey.js readRegistration);
 * rejects with the browser's own error, or a PasskeyCheckError.
 *
 * The same user handle every time on this device, so turning the lock on
 * again replaces its passkey in Passwords rather than adding another.
 *
 * @param {Store|null} [store]
 * @returns {Promise<{credentialId: string, publicKey: string}>}
 */
export async function makeLockPasskey(store) {
  let user = readLockUser(store)
  if (!user) {
    user = toB64url(crypto.getRandomValues(new Uint8Array(16)))
    saveLockUser(user, store)
  }
  const made = await createPasskey({
    userId: fromB64url(user), name: 'Spendr app lock', displayName: `Spendr app lock on this ${deviceWord()}`,
  })
  const reg = await readRegistration(made)
  if (!reg.ok || !reg.publicKey) throw new PasskeyCheckError(reg.reason ?? 'key')
  return { credentialId: reg.id, publicKey: reg.publicKey }
}

/**
 * Ask Face ID for the lock's passkey and check what comes back. True only
 * for a signature that verifies against the saved key, over this page's
 * challenge, from this origin, with Face ID used; false for an answer that
 * does not. A prompt that was dismissed, failed or never shown rejects with
 * the browser's own error - AbortError when `signal` called it off.
 *
 * The browser is asked before anything is awaited, so a tap can call this.
 *
 * @param {LockConfig} config
 * @param {AbortSignal} [signal]
 */
export async function unlockWithPasskey(config, signal) {
  const answer = await getAssertion({ credentialId: config.credentialId, signal })
  const check = await verifyAssertion(answer, { credentialId: config.credentialId, publicKey: config.publicKey })
  return check.ok
}
