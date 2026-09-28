/**
 * Asking the browser to keep Spendr's data.
 *
 * Everything lives in IndexedDB on the device, and by default that storage is
 * "best effort": a phone short of space may clear it, and iPhones clear a
 * website's storage after weeks without a visit. For anyone not signed in to
 * sync, that is the whole ledger gone without a word.
 *
 * `navigator.storage.persist()` asks for the other kind, which is only
 * cleared when the person clears it. Chrome decides silently (an installed
 * app, or one used often, is granted); Safari decides silently too; Firefox
 * may ask once. It is asked after setup rather than on the very first
 * screen, so a prompt, where there is one, comes from an app you have
 * started using.
 *
 * Never throws: a browser without the API, or one that refuses, is simply
 * where things were before.
 */

/** @returns {Promise<boolean|null>}  true kept, false not kept, null unknown */
export async function keepStorage() {
  try {
    const s = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!s?.persist || !s.persisted) return null
    if (await s.persisted()) return true
    return await s.persist()
  } catch {
    return null
  }
}

/** Whether it is kept, without asking. @returns {Promise<boolean|null>} */
export async function storageKept() {
  try {
    const s = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!s?.persisted) return null
    return await s.persisted()
  } catch {
    return null
  }
}
