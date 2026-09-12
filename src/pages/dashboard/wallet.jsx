import { useRef, useState, useMemo, useCallback, useEffect } from 'react'

/* ── The wallet silhouette ────────────────────────────────────────────────────
   Builds the clip path for the net-worth wallet: a rounded body with a tab
   hanging off the bottom edge, joined by concave fillets.

   This measures the element, which is a deliberate reversal. The first
   version used a percentage-sized SVG mask and needed no JS at all - but a
   percentage-sized mask STRETCHES, and this card's height comes from its
   content (~300px, near constant) while its width follows the viewport. Its
   aspect ratio therefore swings from about 1.14 on a phone to 1.8 on a wide
   screen, against the artwork's fixed 1.6, so the corner radii rendered up to
   40% taller than they were wide and the tab changed shape with the window.

   Real pixels fix that outright: every radius is exactly its stated radius at
   every width, and the tab is the same size on a phone as on a desktop. The
   cost is one ResizeObserver.

   `clip-path` clips box decorations too, so the lift lives on a drop-shadow
   on the .wallet wrapper - which follows the tab rather than squaring it off. */
export const TAB_W = 96      // tab width, capped below for very narrow cards
export const TAB_H = 22      // how far the tab hangs below the body
export const TAB_R = 10      // the tab's own bottom corners
export const FILLET = 8      // the concave curve where tab meets body
export const R_TOP = 28
const R_BOT = 20

export function walletPath(w, h) {
  const tabW = Math.min(TAB_W, w * 0.34)
  const base = h - TAB_H                 // the body's bottom edge
  const left = (w - tabW) / 2
  const right = left + tabW
  const n = (v) => Math.round(v * 100) / 100

  // Clockwise from the top-left corner. Fillets use sweep-flag 0 so they
  // curve INTO the corner; every other arc is a convex corner at sweep 1.
  return [
    `M${n(R_TOP)} 0`,
    `H${n(w - R_TOP)}`,
    `A${R_TOP} ${R_TOP} 0 0 1 ${n(w)} ${R_TOP}`,
    `V${n(base - R_BOT)}`,
    `A${R_BOT} ${R_BOT} 0 0 1 ${n(w - R_BOT)} ${n(base)}`,
    `H${n(right + FILLET)}`,
    `A${FILLET} ${FILLET} 0 0 0 ${n(right)} ${n(base + FILLET)}`,
    `V${n(h - TAB_R)}`,
    `A${TAB_R} ${TAB_R} 0 0 1 ${n(right - TAB_R)} ${n(h)}`,
    `H${n(left + TAB_R)}`,
    `A${TAB_R} ${TAB_R} 0 0 1 ${n(left)} ${n(h - TAB_R)}`,
    `V${n(base + FILLET)}`,
    `A${FILLET} ${FILLET} 0 0 0 ${n(left - FILLET)} ${n(base)}`,
    `H${R_BOT}`,
    `A${R_BOT} ${R_BOT} 0 0 1 0 ${n(base - R_BOT)}`,
    `V${R_TOP}`,
    `A${R_TOP} ${R_TOP} 0 0 1 ${R_TOP} 0`,
    'Z',
  ].join('')
}

/** Where the last measured card height is kept, so the skeleton can reserve
 *  the right space before there is anything to measure. */
export const WALLET_H_KEY = 'walletCardHeight'
/** Only used on a device that has never rendered the card. */
export const WALLET_H_FALLBACK = 234

export function rememberedWalletHeight() {
  try {
    const v = Number(localStorage.getItem(WALLET_H_KEY))
    if (v > 80 && v < 800) return v
  } catch { /* private mode */ }
  return WALLET_H_FALLBACK
}

/**
 * The clip path for the wallet, kept in step with its rendered size.
 *
 * ── Measured in the ref callback, not only in the observer ──
 *
 * It used to set the box only from the ResizeObserver, and returned undefined
 * until that fired - so the first painted frame was the plain rounded
 * rectangle border-radius gives, and the tab popped in a frame later. That is
 * visible on every reload and it is what this fixes.
 *
 * A ResizeObserver callback runs before paint, so in principle the pop should
 * not happen; in practice the setState it schedules is React's to time, and
 * React lands it on the next frame. A callback ref, on the other hand, runs
 * during the commit phase like a layout effect, so a setState there is flushed
 * before the browser paints. Measuring in both means the first frame is
 * already the right shape and the observer only handles later resizes.
 *
 * ── Why a callback ref rather than an effect ──
 *
 * That distinction was the whole bug this had first time round. This page
 * returns <DashboardSkeleton/> until its queries resolve, so on the first
 * render the card is not in the tree at all: a mount effect ran against a null
 * ref, attached nothing, and - with empty deps - never ran again once the real
 * card appeared. A callback ref fires on every attach and detach, so it cannot
 * miss a node that arrives late.
 */
export function useWalletClip() {
  const [box, setBox] = useState(null)
  const roRef = useRef(null)

  const ref = useCallback((el) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return

    const apply = (w, h) => {
      // The tab needs somewhere to hang; below that, skip the clip entirely
      // and let border-radius stand in.
      if (w <= 80 || h <= TAB_H + R_TOP + R_BOT) return
      setBox(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
      try { localStorage.setItem(WALLET_H_KEY, String(Math.round(h))) }
      catch { /* private mode */ }
    }

    // Synchronously, in the commit phase - see the note above. offsetWidth and
    // offsetHeight are border-box measurements, which is what clip-path
    // coordinates are relative to and what borderBoxSize reports below, so the
    // two paths agree and this never has to be corrected a frame later.
    apply(el.offsetWidth, el.offsetHeight)

    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      // borderBoxSize, not contentRect: contentRect excludes this card's 24px
      // of side padding and 30px of tab reserve, which would put the tab 30px
      // too high and slice 48px off the width.
      const b = entry.borderBoxSize?.[0]
      apply(b ? b.inlineSize : el.offsetWidth, b ? b.blockSize : el.offsetHeight)
    })
    ro.observe(el)
    roRef.current = ro
  }, [])

  useEffect(() => () => roRef.current?.disconnect(), [])

  const clipPath = useMemo(
    () => (box ? `path("${walletPath(box.w, box.h)}")` : undefined),
    [box],
  )
  return [ref, clipPath]
}
