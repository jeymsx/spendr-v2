import { useEffect, useRef, useState } from 'react'
import Sheet from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import Switch from '../../components/ui/Switch'
import { useToast } from '../../context/ToastContext'
import { canSendFiles, saveFile, sendFile } from '../../lib/share'
import { isIos } from '../../utils/platform'
import { pictureName, renderPicture } from './pictures'

/** Remembered on this device: someone who hides amounts once will want to again. */
const HIDE_KEY = 'wrappedHideAmounts'

function readHide() {
  try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false }
}

/** @param {boolean} on */
function writeHide(on) {
  try { localStorage.setItem(HIDE_KEY, on ? '1' : '0') } catch { /* a private window: fine, just not remembered */ }
}

/**
 * Sharing a slide of the story - or the whole of it - as a picture.
 *
 * Opens on a preview of exactly the picture that will be sent, and a switch
 * that takes every amount out of it (pictures.js) for posting somewhere
 * public. The picture is drawn when the sheet opens and again when the
 * switch changes; the buttons wait for it.
 *
 * ── Why it waits ──
 *
 * An iPhone opens the share sheet only from inside the tap that asked for
 * it, and drawing and encoding a 1080x1920 picture takes longer than a tap
 * lasts. So the picture is always ready before Share can be pressed, and the
 * share sheet is the first thing the tap does.
 *
 * ── Keep it, or send it ──
 *
 * On an iPhone one button, Share: its sheet has Save Image as well as every
 * app. On Android a Save beside it, since that sheet can send a file but not
 * keep one. Without a share sheet for files - a desktop browser - Save only.
 *
 * @param {{open: boolean, onClose: () => void, id: string,
 *          recap: import('../../lib/recap').Recap|null, currency: string,
 *          pal: import('./theme').RecapPalette, tone?: import('./theme').CardTone,
 *          name?: string, z?: number}} props
 *        recap: null while it is still being read - the sheet waits with it.
 */
export default function ShareSheet({ open, onClose, id, recap, currency, pal, tone, name, z = 100 }) {
  const { showToast } = useToast()
  const [hide, setHide] = useState(readHide)
  const [sends] = useState(canSendFiles)
  const [busy, setBusy] = useState(false)
  const [picture, setPicture] = useState(/** @type {{key: string, blob: Blob, url: string}|null} */ (null))
  // Which drawing failed, rather than whether one did: a new key starts clean.
  const [failedKey, setFailedKey] = useState('')
  const key = recap ? [recap.month, id, hide ? 'hidden' : 'shown', pal.accent, currency].join('|') : ''
  const failed = !!key && failedKey === key

  useEffect(() => {
    if (!open || !recap) return
    let live = true
    renderPicture({ id, recap, currency, pal, tone, name, hideAmounts: hide }).then(
      blob => { if (live) setPicture({ key, blob, url: URL.createObjectURL(blob) }) },
      () => { if (live) setFailedKey(key) },
    )
    return () => { live = false }
  }, [open, key, id, recap, currency, pal, tone, name, hide])

  /* Each preview is a blob URL: let the last one go when the next arrives,
     and the final one when the sheet goes. */
  const shown = useRef(/** @type {string|null} */ (null))
  useEffect(() => {
    const previous = shown.current
    shown.current = picture?.url ?? null
    if (previous && previous !== shown.current) URL.revokeObjectURL(previous)
  }, [picture])
  useEffect(() => () => { if (shown.current) URL.revokeObjectURL(shown.current) }, [])

  const ready = picture && picture.key === key ? picture : null

  /** @param {'send'|'save'} how */
  async function hand(how) {
    if (!ready || busy || !recap) return
    setBusy(true)
    try {
      const file = pictureName(recap.month, id)
      const done = how === 'send' ? await sendFile(ready.blob, file) : await saveFile(ready.blob, file)
      if (done === 'downloaded') {
        showToast('Saved to your downloads')
        onClose()
      } else if (done === 'shared') {
        onClose()
      } else if (done === 'blocked') {
        // Only if the tap ran out anyway; the picture is ready now.
        showToast('Tap Share again to send it.', 'warning')
      }
    } catch {
      showToast('Could not share the picture. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const footer = (
    <div className="flex gap-3">
      {sends && !isIos() && (
        <Button variant="secondary" size="lg" className="flex-1" disabled={!ready} loading={busy} onClick={() => hand('save')}>
          Save
        </Button>
      )}
      <Button size="lg" className="flex-[1.6]" disabled={!ready} loading={busy} onClick={() => hand(sends ? 'send' : 'save')}>
        {sends ? 'Share' : 'Save image'}
      </Button>
    </div>
  )

  return (
    <Sheet open={open} onClose={onClose} title={id === 'summary' ? 'Share your Wrapped' : 'Share this slide'} footer={footer} z={z}>
      <div className="flex flex-col items-center gap-5 pb-1">
        <div className="relative w-40 aspect-[9/16] rounded-2xl overflow-hidden bg-slate-100 dark:bg-white/[0.06] shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
          {picture && (
            <img
              src={picture.url}
              alt={hide ? 'The picture, with the amounts hidden' : 'The picture that will be shared'}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${ready ? '' : 'opacity-50'}`}
            />
          )}
          {!ready && !failed && (
            <span className="absolute inset-0 flex items-center justify-center" aria-label="Drawing the picture" role="status">
              <span className="w-6 h-6 rounded-full border-2 border-slate-300 border-t-primary animate-spin" aria-hidden="true" />
            </span>
          )}
          {failed && (
            <p className="absolute inset-0 flex items-center justify-center p-3 text-center text-13 text-slate-500 dark:text-slate-400">
              Could not draw the picture.
            </p>
          )}
        </div>
        <div className="w-full flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-15 font-semibold text-slate-900 dark:text-white">Hide amounts</p>
            <p className="text-13 text-slate-500 dark:text-slate-400">Keeps the story, leaves out every amount</p>
          </div>
          <Switch on={hide} onChange={(/** @type {boolean} */ v) => { setHide(v); writeHide(v) }} label="Hide amounts" />
        </div>
      </div>
    </Sheet>
  )
}
