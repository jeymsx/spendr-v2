import { isIos } from '../utils/platform'

/**
 * Put a file where the person can keep it: a PDF report, a recap picture.
 *
 * ── The share sheet on an iPhone, a download everywhere else ──
 *
 * iOS gives a web app's `download` attribute no useful meaning, and inside an
 * installed PWA there is no browser chrome to fall back to - the anchor is
 * clicked, no file appears, and nothing throws. The share sheet is the one
 * reliable way to keep a file there, and it is where Photos and Files are.
 *
 * Everywhere else a download is what people expect. Chrome on Android and on
 * desktop has a share sheet for files too now - canShare({files}) says yes on
 * both - but it offers apps to SEND the file to and, on most Android phones
 * and every desktop, nowhere to simply keep it. So this asks what the device
 * is, not only what it can do.
 *
 * Dismissing the share sheet is a decision, not a failure, and must not fall
 * through to a download of the file they just declined: 'cancelled'.
 *
 * ── A tap only lasts so long ──
 *
 * iOS opens the sheet only from inside the tap that asked for it, and slow
 * work awaited first - rendering a PDF - can use that tap up. share() then
 * refuses with NotAllowedError, and that comes back as 'blocked': the file is
 * made, and one more tap will open the sheet for it. Not the anchor, which on
 * an iPhone would quietly do nothing and look like a save. Callers that can
 * should have the blob made before the tap, so this is the first thing the
 * tap awaits and 'blocked' never happens.
 *
 * Any other refusal - a type the sheet will not take - is worth trying the
 * anchor for.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<'shared'|'downloaded'|'cancelled'|'blocked'>}
 */
export async function saveFile(blob, filename) {
  const file = typeof File === 'function' ? new File([blob], filename, { type: blob.type }) : null
  if (file && isIos() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      const why = /** @type {any} */ (e)?.name
      if (why === 'AbortError') return 'cancelled'
      if (why === 'NotAllowedError') return 'blocked'
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  /* Long after the click, not on the next line: Safari tears the blob down
     before the navigation it was created for has begun. */
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}

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
