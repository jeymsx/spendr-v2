import { useEffect, useRef, useState } from 'react'
import BadgeMark, { badgeArtUrl } from './BadgeMark'
import { ConfettiBurst } from './Confetti'

const BADGE_PX = 148
/* When the burst goes off. The flip is 900ms and peaks at 70% - the badge is
   face-on and at its largest around 630ms - so the confetti lands on the
   arrival rather than after the whole thing has settled, which read as two
   separate events. */
const CONFETTI_AT = 620
/* Must match badgeFlip's duration in index.css: it is when the entrance hands
   over to the idle sway. */
const FLIP_MS = 900

/**
 * The moving highlight across a badge.
 *
 * The band is a plain rotated gradient, and the badge's own PNG is the CSS
 * mask - so the light is clipped to the hexagon and its glyph instead of to
 * the square box the image sits in. Without the mask this is a white bar
 * sliding across a card; with it, it is the badge catching the light.
 *
 * Nothing renders when there is no artwork: the drawn SVG fallback has its own
 * baked-in gloss, and there is no alpha channel to mask against.
 */
function BadgeShine({ badgeKey, size }) {
  const url = badgeArtUrl(badgeKey)
  if (!url) return null

  const mask = {
    WebkitMaskImage: `url(${url})`,
    maskImage: `url(${url})`,
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
  }

  return (
    <span
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ ...mask, width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="badge-shine absolute top-[-25%] left-0 h-[150%] w-[42%]"
        style={{
          background:
            'linear-gradient(100deg, transparent 0%, rgba(255,255,255,.10) 30%, rgba(255,255,255,.72) 50%, rgba(255,255,255,.10) 70%, transparent 100%)',
        }}
      />
    </span>
  )
}

/**
 * One badge, big, on a centred card.
 *
 * ── One component, two callers ──
 *
 * This is what you get when a badge is earned AND what you get when you tap one
 * on the badges page. They were briefly two different things - a centred
 * celebration and a bottom sheet - which meant the same badge looked like two
 * different objects depending on how you arrived at it, and only one of them
 * was any good.
 *
 * What differs between the two is only words and buttons, so those are slots.
 * Everything that makes it feel like a badge - the size, the flip, the sway,
 * the shine, the burst, the press - is here and is the same either way.
 *
 * ── A centred card, not a sheet ──
 *
 * Every other overlay in this app is a bottom sheet, and that is right for
 * them: they are things you DO - pick an account, confirm an amount - and a
 * sheet puts the controls under your thumb. This is not a task. It is a thing
 * to look at, so it sits in the middle of the screen where your eye already is.
 *
 * It is deliberately not built on Sheet, which docks to the bottom, owns a drag
 * handle and a swipe-to-dismiss gesture, and is restyled again by the desktop
 * `html.web .sheet-panel` rules - three behaviours this would have to fight. It
 * keeps Sheet's manners instead: a real dialog role, a scrim that dismisses,
 * and Escape.
 *
 * ── The order things happen in ──
 *
 * The card scales in, the badge flips face-up over 900ms, and - when there is
 * something to celebrate - confetti bursts OUT OF the badge at 620ms, as it
 * lands rather than after it. Then the badge settles into a slow tilt and
 * catches the light every few seconds. The sequence is the point: all at once
 * is a flash, and strictly one-after-another is slow.
 */
export default function BadgeCard({
  badge,
  /** The small line above the name: "Badge unlocked", or when it was earned. */
  eyebrow,
  /** One sentence under the name. */
  body,
  /** The buttons. A slot, because this is the only thing the two callers
   *  genuinely disagree about. */
  actions,
  /**
   * Confetti, the shine, and a badge you can press for more. Off for a locked
   * badge: there is nothing to celebrate about one you have not earned, and
   * throwing paper at it would say the opposite of what the card says.
   */
  celebrate = false,
  onClose,
}) {
  /* Not a boolean: remounting ConfettiBurst is what re-rolls its particles, so
     the burst needs an identity that changes. 0 is "not yet". */
  const [burstKey, setBurstKey] = useState(0)
  /* Whether the entrance flip has finished. The idle sway cannot simply run
     alongside it - both animate `transform` on the same element, and the one
     declared later wins the whole time rather than taking over at the end. So
     the class is swapped when the first is done and there is only ever one
     animation on the element. */
  const [settled, setSettled] = useState(false)
  const actionsRef = useRef(null)

  useEffect(() => {
    const settleAt = setTimeout(() => setSettled(true), FLIP_MS)
    if (!celebrate) return () => clearTimeout(settleAt)
    const burstAt = setTimeout(() => setBurstKey(1), CONFETTI_AT)
    return () => { clearTimeout(settleAt); clearTimeout(burstAt) }
  }, [celebrate])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    /* Focus the first button rather than the panel: there is very little to do
       here, and a keyboard user should not have to hunt for it. Reached
       through the wrapper because Button does not forward a ref. */
    const t = setTimeout(() => actionsRef.current?.querySelector('button')?.focus(), 340)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t) }
  }, [onClose])

  const Badge = (
    <span
      className={`relative block ${settled ? 'badge-sway' : 'badge-flip'}`}
      style={{ width: BADGE_PX, height: BADGE_PX }}
    >
      <BadgeMark badge={badge} earned={badge.earned ?? celebrate} size={BADGE_PX} />
      {celebrate && <BadgeShine badgeKey={badge.key} size={BADGE_PX} />}
    </span>
  )

  return (
    /* design-ok: Sheet docks to the bottom, owns a drag handle and a
       swipe-to-dismiss gesture, and is restyled again by the desktop
       `html.web .sheet-panel` rules - three behaviours a centred, look-at-me
       card would have to fight. See the component note. */
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="badge-card-title"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/75 dark:bg-black/80 backdrop-blur-[7px]"
      />

      {/* Its own surface - see .badge-card in index.css. `.card` was too
          transparent over a scrim and `.card-solid` was a flat slab; this is
          opaque in light, where there is nothing to be translucent against,
          and a gradient that lets the scrim through in dark. */}
      <div className="badge-card-in badge-card relative z-[2] w-full max-w-[19rem] rounded-3xl px-6 pt-7 pb-6
        text-center">
        {/* When there is something to celebrate the badge is a button, and
            pressing it throws the confetti again. Nothing depends on it - the
            card works untouched - but a reward you can poke is a better
            reward, and the badge is the one thing here anybody wants to touch.

            The burst lives INSIDE the badge's box and is centred on it, so the
            paper comes off the badge rather than raining down past it. It
            overflows freely - nothing here clips - and sits under the badge,
            so the badge is never covered by its own celebration.

            Two nested elements, two transforms: the press scale is on the
            button and the flip/sway on the span inside it. Put both on one
            element and the animation's transform overwrites the press every
            frame, so the tap does nothing at all. */}
        {celebrate ? (
          <button
            type="button"
            onClick={() => setBurstKey(k => k + 1)}
            aria-label="Celebrate again"
            className="relative mx-auto block active:scale-90 transition-transform duration-100"
            style={{ width: BADGE_PX, height: BADGE_PX }}
          >
            {burstKey > 0 && <ConfettiBurst key={burstKey} count={46} />}
            {Badge}
          </button>
        ) : (
          <div className="relative mx-auto" style={{ width: BADGE_PX, height: BADGE_PX }}>
            {Badge}
          </div>
        )}

        {eyebrow && (
          <p className="mt-4 text-11 font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>
        )}
        <h2
          id="badge-card-title"
          className="mt-1.5 text-22 font-semibold tracking-tight text-slate-900 dark:text-white"
        >
          {badge.name}
        </h2>
        <p className="mt-2 text-13 leading-relaxed text-slate-500 dark:text-slate-400">
          {body}
        </p>

        <div className="mt-6 flex flex-col gap-2" ref={actionsRef}>
          {actions}
        </div>
      </div>
    </div>
  )
}
