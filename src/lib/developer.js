/**
 * Whether this is the developer's own device, for the few things that are for
 * the person who builds Spendr and of no use to anyone using it: the error
 * log and the way to send it, and the technical words on the crash screen.
 *
 * A person using the app has no log to read and nobody to send it to, and
 * "Report a problem" opening a message full of stack frames is not help, it
 * is homework. So those are the developer's alone.
 *
 * ── How the app knows ──
 *
 * By the account: signing in with the developer's Google address. And
 * because a crash can happen where there is no account to ask - signed out,
 * or before the session has loaded - the device remembers it has seen that
 * address (localStorage), and that memory is what the crash screen reads. A
 * device never signed in as the developer never shows any of it.
 *
 * Not a secret and not security: it is who the screen is for, nothing more.
 */

export const DEVELOPER_EMAIL = 'sablayjames@gmail.com'

const KEY = 'spendr-developer'

/** @param {string|null|undefined} email */
const isDeveloperEmail = (email) => !!email && email.trim().toLowerCase() === DEVELOPER_EMAIL

/** This device has been signed in as the developer. */
export function deviceIsDeveloper() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

/**
 * Called with the signed-in address: the device remembers it has seen the
 * developer's. Any other address leaves what is remembered as it was.
 *
 * @param {string|null|undefined} email
 */
export function rememberDeveloper(email) {
  if (!isDeveloperEmail(email)) return
  try { localStorage.setItem(KEY, '1') } catch { /* storage off: it is the account that says so then */ }
}

/**
 * Whether what is for the developer is shown: by the account when there is
 * one, by the device when there is not.
 *
 * @param {string|null|undefined} email  the signed-in address, if any
 */
export function isDeveloper(email) {
  return email ? isDeveloperEmail(email) : deviceIsDeveloper()
}
