import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera01, Check } from '@untitledui/icons'
import IconButton from '../ui/IconButton'
import { quietTaps } from '../ui/tapGuard'
import { useBackGuard } from '../../hooks/useBackGuard'
import { composeNote } from '../../lib/standing/compose'
import { isoOf } from '../../lib/standing/format'
import { saveFile } from '../../lib/share'
import NoteView from './NoteView'
import useStandingFacts from './useStandingFacts'

/**
 * Where you stand, in a few sentences: tap the greeting on Home.
 *
 * Not in any menu and not in What's New - a thing to find. The screen dims to
 * the note the way quick log dims to its question, because it is the same
 * kind of surface: one thing to read, and then you leave. Tapping anywhere
 * off the text closes it, and so do Escape and system Back.
 *
 * What it says is lib/standing's to decide, from the ledger as it is right
 * now (useStandingFacts); this only draws it and offers the picture. The
 * camera button saves the note as it stands - figures and all, it is for you
 * - as a PNG, through the share sheet on an iPhone and as a download
 * elsewhere (lib/share.js). The picture is drawn as soon as the note is
 * ready, not when the button is pressed: iOS only opens its share sheet from
 * inside the tap that asked for it, and drawing first can use that tap up.
 *
 * @param {{onClose: () => void}} props
 */

const EXIT_MS = 200
const exitDelay = () => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_MS)

export default function StandingNote({ onClose }) {
  const { facts, lookups } = useStandingFacts()
  const note = useMemo(() => (facts ? composeNote(facts) : null), [facts])

  // Wide enough to want the bigger type: a computer, or a tablet held wide.
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768)
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Leaving takes 200ms and the component has to stay mounted for it (QuickLogOverlay says why).
  const [closing, setClosing] = useState(false)
  const exitTimer = useRef(/** @type {ReturnType<typeof setTimeout>|null} */ (null))
  useEffect(() => () => { if (exitTimer.current) clearTimeout(exitTimer.current) }, [])
  const dismiss = useCallback(() => {
    if (exitTimer.current) return
    quietTaps()
    setClosing(true)
    exitTimer.current = setTimeout(onClose, exitDelay())
  }, [onClose])
  useBackGuard(true, () => { dismiss() })
  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') dismiss() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dismiss])

  /* The picture, drawn ahead of the tap that wants it - a moment after the
     note settles, so a ledger still arriving does not draw it again and again. */
  const picture = useRef(/** @type {Promise<Blob>|null} */ (null))
  const draw = useCallback(() => {
    if (!note) return null
    const made = import('./noteImage').then(m => m.renderNoteImage(note, lookups))
    made.catch(() => { /* reported when it is asked for */ })
    picture.current = made
    return made
  }, [note, lookups])
  useEffect(() => {
    picture.current = null
    const t = setTimeout(draw, 350)
    return () => clearTimeout(t)
  }, [draw])

  const [saved, setSaved] = useState(/** @type {'idle'|'busy'|'done'|'failed'} */ ('idle'))
  const settle = useRef(/** @type {ReturnType<typeof setTimeout>|null} */ (null))
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current) }, [])
  const save = async () => {
    const made = picture.current ?? draw()
    if (!made || saved === 'busy') return
    setSaved('busy')
    try {
      const blob = await made
      const result = await saveFile(blob, `spendr-note-${isoOf(facts?.now ?? new Date())}.png`)
      setSaved(result === 'cancelled' ? 'idle' : 'done')
    } catch (e) {
      console.error('[StandingNote] could not save the picture:', e)
      setSaved('failed')
    }
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => setSaved('idle'), 2200)
  }

  return (
    /* design-ok: not a sheet. A full-screen reading surface that dims the
       app the way the quick-log overlay does and leaves the same way
       (QuickLogOverlay.jsx); Sheet docks to the bottom and keeps the page
       beside it legible, which is the opposite of what this wants. */
    <div
      role="dialog" aria-modal="true" aria-label="Where you stand"
      className={`fixed inset-0 z-[200] transition-opacity duration-200 ease-out ${closing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <div className="sheet-overlay absolute inset-0 bg-white/88 dark:bg-black/[0.88] backdrop-blur-[10px]" />
      {/* The scroll surface is the close button: a tap off the text closes. When the note is
          taller than the screen it scrolls, and `m-auto` keeps it centred when it is not. */}
      <div
        className="absolute inset-0 overflow-y-auto overscroll-contain flex px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]"
        onClick={dismiss}
      >
        {note && (
          <div className="quick-in m-auto w-full max-w-[560px]" onClick={e => e.stopPropagation()}>
            <NoteView note={note} lookups={lookups} px={wide ? 25 : 20} />
            <div className="mt-7 -ml-2 flex items-center gap-2">
              <IconButton
                label={saved === 'done' ? 'Saved' : 'Save as a picture'}
                variant="plain" size="lg"
                disabled={saved === 'busy'}
                onClick={save}
              >
                {saved === 'done'
                  ? <Check size={20} strokeWidth={2} aria-hidden="true" />
                  : <Camera01 size={20} strokeWidth={1.8} aria-hidden="true" />}
              </IconButton>
              <span aria-live="polite" className="text-12 text-slate-500 dark:text-white/50">
                {saved === 'failed' ? "Couldn't save that" : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
