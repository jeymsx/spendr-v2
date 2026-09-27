import { useCallback, useEffect, useRef, useState } from 'react'
import Sheet from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import Switch from '../../components/ui/Switch'
import { RAIL_TOUCH } from '../../components/ui/Rail'
import { prefersReducedMotion } from '../../components/ui/motion'
import { useSwap } from '../../components/ui/useSwap'
import { useToast } from '../../context/ToastContext'
import { canSendFiles, saveFile, sendFile } from '../../lib/share'
import { isIos } from '../../utils/platform'
import { SUMMARY_LOOKS, pictureName, renderPicture } from './pictures'

/** Remembered on this device: someone who hides amounts once will want to again. */
const HIDE_KEY = 'wrappedHideAmounts'
/** And the look the summary was last shared in, for the same reason. */
const LOOK_KEY = 'wrappedLook'

const SUMMARY_IDS = SUMMARY_LOOKS.map(l => l.id)
/** Every other slide has one look: its own card. */
const ONE_LOOK = ['colour']

/**
 * A preview on the rail: 160px wide, the single preview's size, from a
 * 667px-tall screen up, and narrower on a shorter one - 148px at 640px,
 * 118px at 568px - so the sheet still fits its Hide amounts switch, words
 * and all, without scrolling. The rail measures what it got (stepOf)
 * rather than assuming.
 */
const LOOK_W = 'clamp(112px, calc(42.4dvh - 122.8px), 160px)'
/** Between two previews, in px: gap-4. */
const GAP = 16

/** From one preview's middle to the next. @param {HTMLElement} rail */
function stepOf(rail) {
  const card = /** @type {HTMLElement|null} */ (rail.querySelector('[data-look]'))
  return (card?.offsetWidth ?? 160) + GAP
}

function readHide() {
  try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false }
}

/** @param {boolean} on */
function writeHide(on) {
  try { localStorage.setItem(HIDE_KEY, on ? '1' : '0') } catch { /* a private window: fine, just not remembered */ }
}

function readLook() {
  try {
    const v = localStorage.getItem(LOOK_KEY)
    return v && SUMMARY_IDS.includes(v) ? v : SUMMARY_IDS[0]
  } catch { return SUMMARY_IDS[0] }
}

/** @param {string} look */
function writeLook(look) {
  try { localStorage.setItem(LOOK_KEY, look) } catch { /* as above */ }
}

/** @typedef {{key: string, blob: Blob, url: string}} Drawn */

/**
 * Sharing a slide of the story - or the whole of it - as a picture.
 *
 * Opens on a preview of exactly the picture that will be sent, and a switch
 * that takes every amount out of it (pictures.js) for posting somewhere
 * public. The picture is drawn when the sheet opens and again when the
 * switch changes; the buttons wait for it.
 *
 * ── The summary, four ways ──
 *
 * The whole month comes in four looks (SUMMARY_LOOKS), side by side on a
 * rail to swipe or tap through, the chosen one in the middle and its
 * neighbours showing at the edges so the rail says it moves. The one in the
 * middle is the one that is sent, and it is remembered for next time.
 *
 * The look on show is drawn first, so Share is ready as soon as it would be
 * with one picture, then the other three one at a time, so four pictures
 * never fight over the phone at once. Each is kept until what it shows
 * changes: swiping back to a look is instant.
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
  const summary = id === 'summary'
  const looks = summary ? SUMMARY_IDS : ONE_LOOK
  const [chosen, setChosen] = useState(readLook)
  const look = summary ? chosen : ONE_LOOK[0]
  const [pictures, setPictures] = useState(/** @type {Record<string, Drawn>} */ ({}))
  // Which drawing failed, rather than whether one did: a new key starts clean.
  const [failures, setFailures] = useState(/** @type {Record<string, string>} */ ({}))
  const base = recap ? [recap.month, id, hide ? 'hidden' : 'shown', pal.accent, currency, name ?? ''].join('|') : ''
  const keyOf = (/** @type {string} */ l) => `${base}|${l}`
  const readyOf = (/** @type {string} */ l) => (base && pictures[l]?.key === keyOf(l) ? pictures[l] : null)
  const failedOf = (/** @type {string} */ l) => !!base && failures[l] === keyOf(l)
  const ready = readyOf(look)

  /* The look on show when the drawing starts is drawn first. Read from a
     ref, not a dependency: swiping must not restart the drawing, only the
     sheet opening or what the pictures show changing should. */
  const lookNow = useRef(look)
  useEffect(() => { lookNow.current = look })

  /* Each preview is a blob URL: let one go when its look is drawn again,
     and the rest when the sheet goes. Also what the drawing checks to skip
     a look that is already drawn. */
  const drawn = useRef(/** @type {Record<string, Drawn>} */ ({}))
  useEffect(() => {
    const before = drawn.current
    drawn.current = pictures
    for (const [l, p] of Object.entries(before)) {
      if (pictures[l]?.url !== p.url) URL.revokeObjectURL(p.url)
    }
  }, [pictures])
  useEffect(() => () => {
    for (const p of Object.values(drawn.current)) URL.revokeObjectURL(p.url)
  }, [])

  useEffect(() => {
    if (!open || !recap) return
    let live = true
    const first = lookNow.current
    const order = [first, ...looks.filter(l => l !== first)]
    ;(async () => {
      for (const l of order) {
        const key = `${base}|${l}`
        if (drawn.current[l]?.key === key) continue
        try {
          const blob = await renderPicture({ id, recap, currency, pal, tone, name, hideAmounts: hide, look: l })
          if (!live) return
          const url = URL.createObjectURL(blob)
          setPictures(p => ({ ...p, [l]: { key, blob, url } }))
        } catch {
          if (!live) return
          setFailures(f => ({ ...f, [l]: key }))
        }
      }
    })()
    return () => { live = false }
  }, [open, base, looks, id, recap, currency, pal, tone, name, hide])

  // ── The rail ──────────────────────────────────────────────────────────

  const rail = useRef(/** @type {HTMLDivElement|null} */ (null))
  /** A look being scrolled to by a tap or a key: the looks it passes on the way are not chosen. */
  const heading = useRef(-1)
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  /* The one in the middle full size, its neighbours a little smaller and
     dimmer, by how far each is from the middle - so they follow the finger
     rather than changing when it lets go. */
  const paint = useCallback((/** @type {HTMLDivElement} */ el) => {
    const mid = el.scrollLeft + el.clientWidth / 2
    const step = stepOf(el)
    for (const card of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('[data-look]'))) {
      const off = Math.min(1, Math.abs(card.offsetLeft + card.offsetWidth / 2 - mid) / step)
      card.style.scale = String(1 - 0.08 * off)
      card.style.opacity = String(1 - 0.25 * off)
    }
  }, [])

  /* Mounted each time the sheet opens: start on the chosen look, already in
     the middle rather than scrolling there. */
  const placeRail = useCallback((/** @type {HTMLDivElement|null} */ el) => {
    rail.current = el
    if (!el) return
    el.scrollLeft = Math.max(0, SUMMARY_IDS.indexOf(lookNow.current)) * stepOf(el)
    paint(el)
  }, [paint])

  function onScroll() {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const el = rail.current
      if (!el) return
      paint(el)
      const at = Math.max(0, Math.min(looks.length - 1, Math.round(el.scrollLeft / stepOf(el))))
      if (heading.current >= 0) {
        if (at !== heading.current) return
        heading.current = -1
      }
      if (looks[at] !== look) {
        setChosen(looks[at])
        writeLook(looks[at])
      }
    })
  }

  /** @param {number} i @param {boolean} [focus] */
  function choose(i, focus = false) {
    const l = looks[i]
    const el = rail.current
    if (!l || !el) return
    setChosen(l)
    writeLook(l)
    const left = i * stepOf(el)
    if (Math.abs(el.scrollLeft - left) > 1) {
      heading.current = i
      el.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    }
    if (focus) /** @type {HTMLElement|null} */ (el.querySelector(`[data-look="${l}"]`))?.focus({ preventScroll: true })
  }

  /** Arrow keys move between the looks, as they do in any radio group. @param {React.KeyboardEvent} e */
  function onKey(e) {
    const i = looks.indexOf(look)
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: looks.length - 1 }[e.key]
    if (to === undefined) return
    e.preventDefault()
    choose(Math.max(0, Math.min(looks.length - 1, to)), true)
  }

  const swap = useSwap(look)

  // ── Sharing ───────────────────────────────────────────────────────────

  /** @param {'send'|'save'} how */
  async function hand(how) {
    if (!ready || busy || !recap) return
    setBusy(true)
    try {
      const file = pictureName(recap.month, id, look)
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

  const lookName = SUMMARY_LOOKS.find(l => l.id === look)?.name ?? ''

  return (
    <Sheet open={open} onClose={onClose} title={summary ? 'Share your Wrapped' : 'Share this slide'} footer={footer} z={z}>
      <div className="flex flex-col items-center gap-5 pb-1">
        {summary ? (
          <div className="w-full flex flex-col items-center">
            <div
              ref={placeRail}
              role="radiogroup"
              aria-label="Design"
              onScroll={onScroll}
              onPointerDown={() => { heading.current = -1 }}
              onWheel={() => { heading.current = -1 }}
              className="-mx-5 self-stretch flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pt-2 pb-6"
              style={RAIL_TOUCH}
            >
              <span aria-hidden="true" className="shrink-0" style={{ width: `calc(50% - ${LOOK_W} / 2 - ${GAP}px)` }} />
              {SUMMARY_LOOKS.map((l, i) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={l.id === look}
                  aria-label={l.name}
                  tabIndex={l.id === look ? 0 : -1}
                  data-look={l.id}
                  onClick={() => choose(i)}
                  onKeyDown={onKey}
                  className="look-card snap-center shrink-0 relative aspect-[9/16] rounded-2xl overflow-hidden bg-slate-100 dark:bg-white/[0.06] shadow-[0_8px_20px_rgba(0,0,0,0.18)] select-none"
                  style={{ width: LOOK_W }}
                >
                  <Preview picture={pictures[l.id] ?? null} ready={!!readyOf(l.id)} failed={failedOf(l.id)} />
                </button>
              ))}
              <span aria-hidden="true" className="shrink-0" style={{ width: `calc(50% - ${LOOK_W} / 2 - ${GAP}px)` }} />
            </div>
            <p key={look} aria-hidden="true" className={`-mt-2 text-15 font-semibold text-slate-900 dark:text-white ${swap}`}>
              {lookName}
            </p>
            <div aria-hidden="true" className="mt-2 flex gap-1.5">
              {looks.map(l => (
                <span
                  key={l}
                  className={`look-dot h-1.5 rounded-full ${l === look ? 'w-4 bg-slate-900 dark:bg-white' : 'w-1.5 bg-slate-300 dark:bg-white/25'}`}
                />
              ))}
            </div>
            <p className="sr-only" role="status">{ready || failedOf(look) ? '' : 'Drawing the picture'}</p>
          </div>
        ) : (
          <div className="relative w-40 aspect-[9/16] rounded-2xl overflow-hidden bg-slate-100 dark:bg-white/[0.06] shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
            <Preview
              picture={pictures[look] ?? null}
              ready={!!ready}
              failed={failedOf(look)}
              alt={hide ? 'The picture, with the amounts hidden' : 'The picture that will be shared'}
              status
            />
          </div>
        )}
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

/**
 * One picture as it will be sent: the last one drawn, dimmed while the next
 * is drawn over it, a spinner until there is one, or why there is none.
 *
 * @param {{picture: Drawn|null, ready: boolean, failed: boolean, alt?: string, status?: boolean}} props
 *        status: announce the drawing here - the rail announces it once for all four
 */
function Preview({ picture, ready, failed, alt = '', status = false }) {
  return (
    <>
      {picture && (
        <img
          src={picture.url}
          alt={alt}
          draggable={false}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${ready ? '' : 'opacity-50'}`}
        />
      )}
      {!ready && !failed && (
        <span
          className="absolute inset-0 flex items-center justify-center"
          {...(status ? { role: 'status', 'aria-label': 'Drawing the picture' } : { 'aria-hidden': true })}
        >
          <span className="w-6 h-6 rounded-full border-2 border-slate-300 border-t-primary animate-spin" aria-hidden="true" />
        </span>
      )}
      {failed && (
        <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-13 text-slate-500 dark:text-slate-400">
          Could not draw the picture.
        </span>
      )}
    </>
  )
}
