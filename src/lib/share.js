/**
 * Hand some text to the person, the best way the device offers.
 *
 * The share sheet where there is one - Android Chrome and iOS Safari both have
 * it, and it puts the text straight into Messenger or Viber, which is where an
 * error report from a family member actually goes. The clipboard where there
 * is not, which is most desktop browsers.
 *
 * A dismissed share sheet is NOT a failure and must not fall through to the
 * clipboard: the person chose not to send it, and silently copying it anyway
 * would be doing something they just declined.
 *
 * @param {string} title
 * @param {string} text
 * @returns {Promise<'shared'|'copied'|'cancelled'|'failed'>}
 */
export async function shareOrCopy(title, text) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
      // Anything else - a browser that has share but refuses text - falls
      // through to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
