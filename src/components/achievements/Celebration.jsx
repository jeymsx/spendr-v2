import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GlassBadge } from '../glass/GlassArt'
import { glassPalette } from '../glass/glass'
import { ConfettiBurst } from '../Confetti'
import { keepTabInside } from '../ui/focus'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useTheme } from '../../context/ThemeContext'
import { canSendFiles, saveFile, sendFile } from '../../lib/share'
import { isIos } from '../../utils/platform'
import { EYEBROW, achievementFileName, earnedDate, renderAchievementPicture, titleOf } from './achievementPicture'

/**
 * The moment an achievement lands, full screen.
 *
 * The achievement's colour washes down from the top into the page, rays turn
 * slowly behind its medallion, paper drifts down, and the medallion arrives
 * turning over to face you before it settles into a slow bob with light
 * crossing its glass. Its name in two big lines, what it means, and two ways
 * out: share it, or go home.
 *
 * ── The same screen to look at one again ──
 *
 * Tapping an achievement in the collection opens this too, `mode="view"` -
 * one that looked like one thing when you earned it and another when you went
 * back to it would be two things. A locked one shows how it is earned and
 * how far along you are instead of a share button.
 *
 * ── The picture is ready before the tap ──
 *
 * An iPhone opens the share sheet only from inside the tap that asked for it,
 * and drawing a 1080x1920 picture takes longer than a tap lasts. So it is
 * drawn the moment the screen opens, and the button waits for it. If drawing
 * fails - a phone short of memory for a canvas that size - the button says so
 * and offers to try again, rather than waiting forever.
 *
 * ── A dialog's manners ──
 *
 * Focus moves in on arrival and back to where it was on the way out. Tab
 * stays inside, and Escape closes - both taken on the capture phase and
 * stopped there, so a sheet left open underneath neither closes on the same
 * Escape nor pulls the Tab into itself. What the share did is said here, in
 * the screen, because the toasts sit under it.
 *
 * @param {{item: import('../../context/AchievementContext').Celebration, mode?: 'earned'|'view',
 *          locked?: boolean, how?: string, progress?: string|null, remaining?: number,
 *          onClose: () => void, onHome?: () => void}} props
 */
export default function Celebration({ item, mode = 'earned', locked = false, how, progress, remaining = 0, onClose, onHome }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const pal = glassPalette(item.hue)
  const titleId = useId()
  const [picture, setPicture] = useState(/** @type {Blob|null} */ (null))
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(/** @type {{text: string, tone: 'ok'|'warn'}|null} */ (null))
  const [sends] = useState(canSendFiles)
  const [burst, setBurst] = useState(false)
  const dialogRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  // The latest, for the key handler bound once on arrival.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useScrollLock(true)

  // The picture, drawn now so the share can be the first thing the tap does.
  useEffect(() => {
    if (locked) return
    let live = true
    renderAchievementPicture(item).then(
      b => { if (live) setPicture(b) },
      e => { if (live) { console.warn('[celebration] picture failed:', e); setFailed(true) } },
    )
    return () => { live = false }
  }, [item, locked, attempt])

  // The burst lands with the medallion, not before it.
  useEffect(() => {
    if (locked || mode !== 'earned') return
    const t = setTimeout(() => setBurst(true), 620)
    return () => clearTimeout(t)
  }, [locked, mode])

  // Focus in on arrival and back on the way out; its keys are its own while it is up.
  useEffect(() => {
    const before = /** @type {HTMLElement|null} */ (document.activeElement)
    dialogRef.current?.focus({ preventScroll: true })
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      // Under the app lock the keys are the lock's.
      if (document.documentElement.classList.contains('app-locked')) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current() }
      else if (e.key === 'Tab') { keepTabInside(e, dialogRef.current); e.stopPropagation() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      before?.focus?.({ preventScroll: true })
    }
  }, [])

  function retry() {
    setFailed(false)
    setPicture(null)
    setAttempt(n => n + 1)
  }

  /** @param {'send'|'save'} how */
  async function share(how) {
    if (!picture || busy) return
    setBusy(true)
    setNote(null)
    try {
      const name = achievementFileName(item)
      const done = how === 'send' ? await sendFile(picture, name) : await saveFile(picture, name)
      if (done === 'downloaded') setNote({ text: 'Saved to your downloads.', tone: 'ok' })
      else if (done === 'blocked') setNote({ text: 'Tap Share again to send it.', tone: 'warn' })
    } catch {
      setNote({ text: 'Could not share the picture. Try again.', tone: 'warn' })
    } finally {
      setBusy(false)
    }
  }

  const when = earnedDate(item.earnedAt)
  const ink = dark ? 'text-white' : 'text-slate-900'
  const soft = dark ? 'text-slate-300' : 'text-slate-600'
  const wash = dark
    ? `linear-gradient(180deg, ${pal.deep} 0%, ${pal.deeper} 30%, var(--surface-page) 64%)`
    : `linear-gradient(180deg, ${pal.mid} 0%, ${pal.light} 30%, ${pal.pale} 52%, var(--surface-panel) 72%)`
  const primary = dark ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'
  const eyebrow = locked ? 'Not yet earned' : EYEBROW[item.kind]
  const title = titleOf(item)
  const shareLabel = failed ? 'Try again' : !picture ? 'Getting it ready…' : sends ? `Share ${item.kind}` : 'Save image'

  /* It scrolls when it must: a short phone, or one on its side, has less
     height than a two-line name, its medallion and its buttons need, and
     overlapping them would be worse than a scroll. */
  return createPortal(
    /* design-ok: not a sheet. The celebration IS the screen - full bleed, its
       own colour, its own way out - which is what the moment is for. It keeps
       a dialog's manners: aria-modal, a label, focus in and back, Tab, Escape. */
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="celebrate fixed inset-0 z-[600] overflow-y-auto overflow-x-hidden overscroll-contain outline-none"
      style={{ background: wash }}
    >
      {!locked && <Drift colors={[pal.deep, pal.mid, pal.light, '#FBBF24', '#F472B6', '#34D399']} />}

      <div className="relative min-h-full flex flex-col">
        <div className="relative flex-1 flex flex-col items-center px-6 pt-[max(18px,env(safe-area-inset-top))]">
          {/* Above the rays: they are a 640px square centred on the medallion,
              so they reach up over this row, and coming later they took its
              taps - the X could not be pressed. */}
          <div className="relative z-10 w-full flex justify-end h-11">
            {mode === 'view' && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={`w-11 h-11 -mr-2 rounded-full flex items-center justify-center ${dark ? 'text-white/85 active:bg-white/10' : 'text-slate-800 active:bg-black/5'}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            )}
          </div>

          {/* The medallion, on its rays. */}
          <div className="relative flex-1 min-h-[min(220px,32dvh)] w-full flex items-center justify-center">
            {/* Two elements, because one cannot run both animations: the fade
                and the turn each set `animation`, and whichever class came
                later in the stylesheet won - the rays faded in and then sat
                still. The dimming for a locked one is on the inner element
                too, where the fade's end state cannot override it. */}
            <span className="absolute pointer-events-none w-[min(150vw,640px)] aspect-square celebrate-fade" aria-hidden="true">
              <span className="block w-full h-full recap-rays celebrate-spin" style={{ opacity: locked ? 0.4 : 1 }} />
            </span>
            <span
              className="absolute pointer-events-none w-[min(70vw,300px)] aspect-square rounded-full celebrate-fade"
              aria-hidden="true"
              style={{ background: `radial-gradient(closest-side, rgba(255,255,255,${dark ? 0.22 : 0.7}), rgba(255,255,255,0))` }}
            />
            <div className={`relative ${mode === 'earned' ? 'celebrate-in' : 'celebrate-fade'}`} style={{ perspective: 900 }}>
              <GlassBadge
                glyph={item.glyph}
                hue={item.hue}
                shape={item.shape}
                level={item.level}
                locked={locked}
                size={Math.round(Math.min(232, typeof window !== 'undefined' ? window.innerHeight * 0.28 : 232))}
                float
              />
              {burst && <ConfettiBurst count={54} colors={[pal.mid, pal.light, '#FBBF24', '#F472B6', '#34D399', '#FFFFFF']} />}
            </div>
          </div>

          {/* What it is. */}
          <div className="relative w-full max-w-[360px] flex flex-col items-center text-center pb-2">
            <span className={`celebrate-rise inline-flex items-center h-7 px-3 rounded-full text-12 font-semibold ${dark ? 'bg-white/10 text-white/85' : 'bg-white/80 text-slate-700'}`} style={{ animationDelay: '420ms' }}>
              {eyebrow}
            </span>
            <h1 id={titleId} className={`celebrate-rise mt-3 text-34 leading-[1.08] font-bold tracking-tight text-balance ${ink}`} style={{ animationDelay: '500ms' }}>
              {locked ? item.name : title.name}
              {!locked && title.closer && <><br />{title.closer}</>}
            </h1>
            <p className={`celebrate-rise mt-3 text-15 leading-snug ${soft}`} style={{ animationDelay: '580ms' }}>
              {locked ? how : item.blurb}
            </p>
            {locked && progress && (
              <p className={`celebrate-rise mt-2 text-13 font-semibold ${ink}`} style={{ animationDelay: '640ms' }}>
                {progress}{remaining > 0 ? ` · ${remaining} to go` : ''}
              </p>
            )}
            {!locked && when && (
              <p className={`celebrate-rise mt-2 text-12 ${soft}`} style={{ animationDelay: '640ms' }}>{when}</p>
            )}
          </div>
        </div>

        {/* The ways out. */}
        <div className="relative w-full max-w-[400px] mx-auto px-6 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] flex flex-col items-center gap-1.5 celebrate-rise" style={{ animationDelay: '700ms' }}>
          {!locked && (
            <div className="w-full flex gap-2.5">
              {sends && !isIos() && !failed && (
                <button
                  type="button"
                  onClick={() => share('save')}
                  disabled={!picture || busy}
                  className={`h-14 px-5 rounded-full text-15 font-semibold disabled:opacity-60 active:scale-[0.98] transition-transform ${dark ? 'bg-white/12 text-white' : 'bg-white/90 text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.08)]'}`}
                >
                  Save
                </button>
              )}
              <button
                type="button"
                onClick={failed ? retry : () => share(sends ? 'send' : 'save')}
                disabled={!failed && (!picture || busy)}
                className={`flex-1 h-14 rounded-full inline-flex items-center justify-center gap-2 text-15 font-semibold disabled:opacity-60 active:scale-[0.98] transition-transform ${primary}`}
              >
                {!failed && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {sends
                      ? <path d="M12 15V4M8 8l4-4 4 4M6 12H5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-1" />
                      : <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />}
                  </svg>
                )}
                {shareLabel}
              </button>
            </div>
          )}
          <p
            aria-live="polite"
            className={`min-h-[18px] text-12 font-medium text-center ${
              failed || note?.tone === 'warn' ? (dark ? 'text-amber-300' : 'text-amber-700') : soft
            }`}
          >
            {failed ? 'The picture could not be made on this device just now.' : note?.text ?? ''}
          </p>
          <button
            type="button"
            onClick={mode === 'earned' ? (onHome ?? onClose) : onClose}
            className={`h-12 px-6 rounded-full text-15 font-semibold ${dark ? 'text-white/85 active:bg-white/10' : 'text-slate-700 active:bg-black/5'}`}
          >
            {mode === 'earned' ? 'Back to Home' : locked ? 'Close' : 'Done'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Paper drifting down the whole screen, slowly and forever, behind everything.
 * Each piece carries its own column, speed, sway and spin as CSS variables on
 * one shared keyframe, and starts part-way through its fall so the screen is
 * already full when it opens. Fixed, so it stays the screen's while the
 * content scrolls over it. Nothing moves for reduced motion.
 *
 * @param {{colors: string[]}} props
 */
function Drift({ colors }) {
  const [pieces] = useState(() => Array.from({ length: 30 }, (_, i) => {
    const duration = 7 + Math.random() * 6
    return {
      id: i,
      x: Math.random() * 100,
      dx: `${Math.round(Math.random() * 80 - 40)}px`,
      rot: `${Math.round(Math.random() * 720 - 360)}deg`,
      duration,
      delay: -Math.random() * duration,
      color: colors[i % colors.length],
      w: 6 + Math.random() * 6,
      h: 3 + Math.random() * 4,
      round: i % 4 === 0,
    }
  }))
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {pieces.map(p => (
        <span
          key={p.id}
          className="celebrate-fall absolute top-0"
          style={/** @type {import('react').CSSProperties} */ ({
            left: `${p.x}%`,
            width: p.round ? p.h + 3 : p.w,
            height: p.round ? p.h + 3 : p.h,
            borderRadius: p.round ? 99 : 2,
            backgroundColor: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            '--dx': p.dx,
            '--rot': p.rot,
          })}
        />
      ))}
    </div>
  )
}
