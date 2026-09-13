import { useRef, useEffect, useCallback, useState, memo } from 'react'
import { useTheme } from '../context/ThemeContext'
import { cardGradient } from '../lib/accentTheme'
import { ACCENT_COLORS } from './Settings'
import SubPage from '../components/SubPage'
import Rail from '../components/ui/Rail'

/**
 * One accent, shown as a slice of the app rather than a swatch.
 *
 * A colour chip cannot answer the question you are actually asking, which is
 * "what will my app look like". The accent lands on the net-worth card's
 * gradient, a transaction amount, the budget bar, the primary button and the
 * active tab - so the preview shows all five, in that accent, in the theme you
 * are currently in. Swiping then compares whole screens instead of dots.
 *
 * Everything inside is aria-hidden and inert: it is a picture of a screen, and
 * the only control is the enclosing button. A miniature button that looked
 * tappable would invite a tap that did nothing.
 *
 * ── Why this is memo'd, and takes no callback ──
 *
 * The rail must not re-render while it is being swiped. The browser re-snaps
 * when a snap container's children change layout mid-gesture: measured,
 * scrolling to card 3 while React re-rendered all eight previews landed on
 * card 8 instead. So the props are hex, name and theme - all stable for the
 * life of the screen - and nothing that changes per selection.
 *
 * Which means no onPick either: an inline arrow is a new function every render
 * and defeats memo entirely. The rail handles clicks by delegation.
 */
const AccentPreview = memo(function AccentPreview({ hex, name, theme }) {
  const isDark = theme === 'dark'
  const panel = {
    background: isDark ? 'rgba(40,60,95,0.22)' : '#ffffff',
    border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
  }
  const dim  = isDark ? 'rgba(255,255,255,0.13)' : '#e2e8f0'
  const ink  = isDark ? '#ffffff' : '#0f172a'
  const mute = isDark ? 'rgba(255,255,255,0.42)' : '#94a3b8'

  return (
    <button
      type="button"
      data-accent={hex}
      aria-label={`Use ${name}`}
      className="shrink-0 snap-center w-[228px]"
    >
      {/* The tilt goes on THIS layer, not on the snap child above it.
 
          Chrome computes a scroll-snap area from the element's TRANSFORMED
          box, not its layout box. Since the transform here is a function of
          scroll position, putting it on the snap child made the snap points
          move as you scrolled: a feedback loop, measured as a scrollTo asking
          for card 3, settling on card 1, and resting 58px off any centre.
          That is what "fighting in positioning" was.
 
          The precise rule is narrower than "never transform a snap child",
          and worth stating because the card style step in AccountNew does
          exactly that and is fine: with snap-center, only a transform that
          moves the element's CENTRE can move its snap point. rotateY, scale
          and translateZ are all symmetric about the centre, so AccountNew's
          `rotateY + translateZ + scale` leaves its snap points alone -
          measured, offBy 0 on every card. translateX is the one that moves
          the centre, and it is the one this deck needs.
 
          One layer down, the snap child's box is untouched and its snap point
          is fixed, while the visual can be moved as freely as it likes.
 
          will-change-transform because paintRail writes a transform every
          scroll frame; no transition, because a transition fights a value
          that is already changing continuously. */}
      <div data-tilt className="will-change-transform">
      <div
        className="accent-frame rounded-[26px] overflow-hidden p-3 flex flex-col gap-2"
        style={{ background: isDark ? '#0b0f14' : '#f8fafc' }}
        aria-hidden="true"
      >
        {/* The net-worth card: the largest accent surface in the app. */}
        <div className="rounded-2xl px-3 pt-2.5 pb-3" style={{ background: cardGradient(hex, theme) }}>
          <p className="text-[6.5px] font-semibold text-white/60">Net worth</p>
          <p className="text-17 font-semibold tracking-tight text-white mt-0.5">₱33,571</p>
          <div className="flex gap-2.5 mt-1.5">
            <span className="text-[6px] text-white/50">Spending</span>
            <span className="text-[6px] text-white/50">Savings</span>
            <span className="text-[6px] text-white/50">Credit</span>
          </div>
        </div>

        {/* Budget, with an accent bar and an accent link. */}
        <div className="rounded-xl px-2.5 py-2" style={panel}>
          <div className="flex items-baseline justify-between">
            <span className="text-[7px] font-semibold" style={{ color: ink }}>Budget</span>
            <span className="text-[6.5px] font-semibold" style={{ color: hex }}>See all</span>
          </div>
          <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: dim }}>
            <div className="h-full rounded-full" style={{ width: '65%', background: hex }} />
          </div>
        </div>

        {/* Two transaction rows, so the card is tall enough to read as a
            screen rather than a swatch with decorations - and the second one
            is an inflow, which is where the accent shows on an amount. */}
        <div className="rounded-xl overflow-hidden" style={panel}>
          {[
            { n: 'Breakfast', s: 'Cash',  a: '−₱300', accent: false },
            { n: 'Salary',    s: 'BPI',   a: '+₱42,000', accent: true },
          ].map((t, i) => (
            <div
              key={t.n}
              className="flex items-center gap-2 px-2 py-1.5"
              style={i === 0 ? { borderBottom: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.05)' } : undefined}
            >
              <span className="w-4 h-4 rounded-md shrink-0" style={{ background: dim }} />
              <span className="flex-1 min-w-0">
                <span className="block text-[7px] font-semibold truncate" style={{ color: ink }}>{t.n}</span>
                <span className="block text-[6px]" style={{ color: mute }}>{t.s}</span>
              </span>
              <span
                className="text-[7px] font-semibold shrink-0"
                style={{ color: t.accent ? hex : mute }}
              >
                {t.a}
              </span>
            </div>
          ))}
        </div>

        {/* The primary button. */}
        <div
          className="rounded-xl py-1.5 text-center text-[7.5px] font-semibold text-white"
          style={{ background: hex }}
        >
          Add expense
        </div>

        {/* The navbar, one tab active. */}
        <div className="rounded-xl px-2 py-1.5 flex items-center justify-around" style={panel}>
          {[0, 1, 2, 3].map(i => (
            <span
              key={i}
              className="w-3.5 h-3.5 rounded-md"
              style={{ background: i === 0 ? hex : dim }}
            />
          ))}
        </div>
      </div>
      </div>
    </button>
  )
})

export default function SettingsAccent() {
  const { accentColor, setAccentColor, theme } = useTheme()
  const railRef = useRef(null)
  const frame = useRef(0)
  const settle = useRef(0)

  // Drives the name, the hint and the dots - all OUTSIDE the rail. Nothing
  // inside the rail reads it, which is what keeps a swipe from re-rendering
  // the previews mid-snap.
  const [centred, setCentred] = useState(accentColor)
  /* The dots are written to directly, on the same frame as the cards. */
  const dotsRef = useRef(null)

  /**
   * Turn each preview by how far it is from the middle.
   *
   * There is no ring and no tick: the centred card IS the selection, which is
   * how a coverflow says it and how the card style step already works. A
   * stroke around the active card was the first attempt and it competed with
   * the miniature inside it - two rectangles of emphasis on one object.
   *
   * Distance is measured in card widths, so the turn is continuous - the
   * cards move WITH the finger rather than snapping between two states when
   * the index changes.
   *
   * Written straight to the nodes, deliberately. Routing this through React
   * would re-render eight preview cards per scroll frame, and worse, the
   * browser re-snaps when a snap container's children change mid-gesture:
   * measured, a prop-driven version sent a swipe to card 3 to card 8 instead.
   *
   * perspective sits inside each card's own transform rather than on the rail,
   * because on a scrolling ancestor it interacts with the scrollport.
   *
   * And the transform goes on an inner layer, never on the snap child. A
   * transform does not change the LAYOUT box, but Chrome computes a snap area
   * from the transformed box - so a scroll-driven transform on a snap child
   * moves its own snap point, which is a feedback loop. See the comment in
   * AccentPreview.
   */
  const paintRail = useCallback(() => {
    const rail = railRef.current
    if (!rail) return null
    const mid = rail.scrollLeft + rail.clientWidth / 2
    const first = rail.querySelector('[data-accent]')
    const stride = first ? first.offsetWidth + 8 : 236   // card + gap-2
    let best = null, bestDist = Infinity, bestIdx = 0, i = 0
    const dist = []
    for (const node of rail.querySelectorAll('[data-accent]')) {
      const centre = node.offsetLeft + node.offsetWidth / 2
      const natural = centre - mid                       // px the layout gives
      const dir = Math.sign(natural)
      const mag = Math.abs(natural) / stride             // distance, in cards
      dist.push(mag)

      /* The deck.
       *
       * A neighbour's own slot puts it a full stride away, which reads as a
       * row of separate cards. What a fanned deck needs is for it to sit
       * mostly BEHIND the front card with a sliver showing - so the wanted
       * offset is computed first and the layout's offset subtracted from it.
       *
       * sqrt rather than linear, which is the part that makes it a deck: at
       * 58px per unit the first neighbour lands 58px out, the second 82, the
       * third 100. Linear would put the third 174px out and the fan would
       * come apart at the edges. Compressed, every card past the first tucks
       * in behind the one before it, exactly as a real stack does.
       *
       * All of this works only because a transform never changes the layout
       * box: the slots, offsetLeft and every snap position are untouched, so
       * the cards pile up visually while the scroll still moves one card at a
       * time.
       */
      /* 0.7, not 0.5. sqrt compressed too hard: at 58px per unit it put the
         first three neighbours at 58, 82 and 100px - 24px apart, then 18 -
         so cards two and three sat almost exactly on top of each other and
         visibly traded places as the stack reordered. That was the
         "fighting in positioning".
         66 x mag^0.7 gives 66, 107 and 141: still compressed, so the fan
         tucks in, but each card clears the one before it by ~40px. */
      const wanted = dir * 66 * Math.pow(Math.min(mag, 3), 0.7)
      const fade = Math.min(mag, 1)

      const tilt = node.querySelector('[data-tilt]') ?? node

      /* Quantised, and only written when it actually changed.
       *
       * Two things were making this jitter on a phone. The first is that
       * every frame wrote five properties on all eight cards whether or not
       * any of them differed - forty style mutations a frame, each one a
       * style recalculation, and `filter` repaints its whole layer.
       *
       * The second is subtler and is the actual jiggle. iOS scrolls on the
       * compositor and delivers `scroll` asynchronously, so `scrollLeft` read
       * during momentum trails the position already on screen. Feeding that
       * lagging number into an unrounded transform means the card is drawn a
       * fraction of a pixel off from where the scroll has put it, and the
       * error changes sign frame to frame - which is exactly what a wobble
       * is. Rounding to half a pixel and half a degree puts the value on a
       * grid coarser than the lag, so it simply stops moving between frames
       * where the difference is noise.
       *
       * Half a pixel and half a degree are both well under what an eye
       * resolves at this size, so the deck looks the same. */
      const q = (v, step) => Math.round(v / step) * step
      const tx = q(wanted - natural, 0.5)
      const ry = q(Math.max(-1, Math.min(1, natural / stride)) * -30, 0.5)
      const tz = q(-fade * 90, 0.5)
      const sc = q(1 - fade * 0.16, 0.005)
      const br = q(1 - fade * 0.42, 0.02)
      const op = q(mag <= 1.6 ? 1 : Math.max(0, 1 - (mag - 1.6) / 0.8), 0.02)
      const z = 40 - Math.round(mag * 10)
      const front = mag < 0.5

      const prev = tilt._paint
      if (!prev || prev.tx !== tx || prev.ry !== ry || prev.tz !== tz || prev.sc !== sc) {
        tilt.style.transform =
          `perspective(1000px) translateX(${tx}px) rotateY(${ry}deg)`
          + ` translateZ(${tz}px) scale(${sc})`
      }

      /* Opaque, and recessed with brightness instead.
       *
       * Translucency was the bug. Eight compressed cards piled near the
       * middle, each at 40-60% opacity, meant every card behind showed
       * THROUGH the ones in front - four Net worth headings and four budget
       * bars visible at once, shuffling as the stack reordered. That is what
       * "two low opacity cards on both sides interchanging" was.
       *
       * A real deck hides what is behind it. Fully opaque, the front card
       * covers the stack completely and depth comes from scale, rotation and
       * a dimmer face - which is what depth looks like anyway.
       *
       * Past two cards out there is nothing left to see, so those fade to
       * nothing rather than piling up invisibly behind the fan. The ramp runs
       * 1.6 to 2.4, entirely behind the front card, so it never reads as a
       * pop - and it keeps the deck to about two cards a side, which is what
       * a hand of cards looks like. */
      if (!prev || prev.br !== br) tilt.style.filter = `brightness(${br})`
      if (!prev || prev.op !== op) tilt.style.opacity = String(op)
      tilt._paint = { tx, ry, tz, sc, br, op }

      /* The front card's own shadow, which is what lifts it off the deck.
 
         A first attempt put a radial vignette over the whole rail instead. It
         worked, and it was the wrong object: a shadow belongs to the card
         casting it, not to a veil laid over the container, and the vignette
         also dimmed the top and bottom of the front card because a gradient
         cannot know which pixels are the card.
 
         data-front rather than an inline shadow, so the two themes can differ
         in CSS - a dark page needs a far heavier shadow than a light one to
         read at all. */
      /* Both of these change an attribute or a computed style, which costs
         a selector rematch - so they are written on the frame they change and
         not on the two hundred frames they do not. */
      if (front !== (node.dataset.front === '1')) {
        if (front) node.dataset.front = '1'
        else delete node.dataset.front
      }

      // Strictly decreasing with distance, or a card behind draws over the
      // front one - which at this much overlap is the whole illusion.
      if (node._z !== z) { node.style.zIndex = String(z); node._z = z }

      const d = Math.abs(centre - mid)
      if (d < bestDist) { bestDist = d; best = node; bestIdx = i }
      i++
    }

    /* The dots, painted here rather than rendered from state.
     *
     * They had `transition-all duration-200` and a width that flipped between
     * 6 and 16 whenever the centred accent changed. A flick passes six
     * accents in about a third of a second, so six dots were part-way through
     * a 200ms expansion at the same moment - which is what "they all go
     * active" was. Nothing was choosing six accents; six animations were
     * simply still running.
     *
     * Driven from the scroll position there is no animation to overlap: a
     * dot's width IS its distance from the middle, so exactly one is wide,
     * it grows as you swipe toward it, and it cannot lag behind the card it
     * belongs to. */
    const dots = dotsRef.current
    if (dots) {
      const kids = dots.children
      for (let k = 0; k < kids.length; k++) {
        const near = Math.max(0, 1 - dist[k])
        const w = Math.round(6 + 10 * near)
        const o = Math.round((0.3 + 0.7 * near) * 50) / 50
        const dot = kids[k]
        if (dot._w !== w) { dot.style.width = `${w}px`; dot._w = w }
        if (dot._o !== o) { dot.style.opacity = String(o); dot._o = o }
        const bg = k === bestIdx ? ACCENT_COLORS[k].hex : 'currentColor'
        if (dot._bg !== bg) { dot.style.background = bg; dot._bg = bg }
      }
    }

    return best
  }, [])

  /**
   * Track the swipe, and apply on settle.
   *
   * The turn follows immediately, once per animation frame, because it is the
   * feedback that the gesture is working. Applying the accent waits 140ms for
   * the scroll to stop: swiping from Azure to Honey passes six accents on the
   * way, and applying each would be six theme writes and six localStorage
   * writes for a decision you had not made yet.
   */
  const onScroll = useCallback(() => {
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        const node = paintRail()
        if (node) setCentred(node.dataset.accent)
      })
    }
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const rail = railRef.current
      if (!rail) return
      const mid = rail.scrollLeft + rail.clientWidth / 2
      let best = null, bestDist = Infinity
      for (const n of rail.querySelectorAll('[data-accent]')) {
        const d = Math.abs(n.offsetLeft + n.offsetWidth / 2 - mid)
        if (d < bestDist) { bestDist = d; best = n }
      }
      if (best && best.dataset.accent !== accentColor) setAccentColor(best.dataset.accent)
    }, 140)
  }, [paintRail, accentColor, setAccentColor])

  /** Tapping a side preview brings it to the middle, by delegation. */
  const onRailClick = useCallback((e) => {
    const node = e.target.closest?.('[data-accent]')
    const rail = railRef.current
    if (!node || !rail) return
    setCentred(node.dataset.accent)
    setAccentColor(node.dataset.accent)
    rail.scrollTo({
      left: node.offsetLeft - (rail.clientWidth - node.offsetWidth) / 2,
      behavior: 'smooth',
    })
  }, [setAccentColor])

  /**
   * Open on the accent in use, and paint once before the first gesture -
   * otherwise the neighbours start flat and only turn after a touch.
   *
   * Explicit scrollTo rather than scrollIntoView: on a snap rail
   * scrollIntoView negotiates with the snap points and lands on a neighbour.
   */
  useEffect(() => {
    const rail = railRef.current
    const on = rail?.querySelector(`[data-accent="${accentColor}"]`)
    if (rail && on) {
      rail.scrollTo({ left: on.offsetLeft - (rail.clientWidth - on.offsetWidth) / 2 })
    }
    paintRail()
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      clearTimeout(settle.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = ACCENT_COLORS.find(c => c.hex === centred)

  return (
    /* The group sits in the middle of the screen rather than under the header.
       min-h in dvh minus the navbar, because a percentage min-height against a
       flex-grown parent does not reliably resolve - that cost three attempts
       on the card style step. mt-auto/mb-auto then centres what is inside. */
    <SubPage title="Accent Colour" className="flex flex-col min-h-[calc(100dvh-5rem)]">
      <div className="mt-auto mb-auto">
        {/* calc(50% - 114px) of padding, so the first and last previews can
            reach the middle. With snap-center and a 228px card, an end card
            can only centre if the padding makes up the difference - otherwise
            Azure and Honey are unselectable by swiping. scroll-padding
            matches, or snapping fights the padding the way it did on the
            category rail. */}
        <Rail
          ref={railRef}
          onScroll={onScroll}
          onClick={onRailClick}
          /* pb-12 -mb-10, not py-2, and the pair has to stay together.

             overflow-x: auto does not leave the other axis alone - the spec
             computes a non-visible overflow on one axis to `auto` on the
             other, so this scroller clips VERTICALLY too. The front card's
             shadow is 0 26px 52px -12px, which reaches 40px below the card,
             and there were 8px of room: it came off square along the bottom
             edge of the rail.

             So the bottom padding is 48px, enough for the shadow to finish
             inside the clip box, and the negative margin takes 40 of them
             back out of the layout. Net 8px, exactly what py-2 gave, with
             nothing below it moving. The name block underneath has no
             background and paints later, so it sits over the shadow's tail
             rather than being hidden by it. */
          className="gap-2 snap-x snap-mandatory pt-2 pb-12 -mb-10"
          style={{
            paddingInline: 'calc(50% - 114px)',
            scrollPaddingInline: 'calc(50% - 114px)',
            touchAction: 'pan-x pan-y',
            overscrollBehaviorX: 'contain',
          }}
        >
          {ACCENT_COLORS.map(({ hex, name }) => (
            <AccentPreview key={hex} hex={hex} name={name} theme={theme} />
          ))}
        </Rail>


        {/* One name, for whichever preview is in the middle. min-h holds the
            block steady so the dots below do not jump when a two-line hint
            follows a one-line one. */}
        <div className="mt-5 px-8 text-center min-h-[46px]">
          <p className="text-17 font-semibold text-slate-900 dark:text-white">
            {active?.name ?? 'Custom'}
          </p>
          {active?.hint && (
            <p className="text-12 text-slate-500 dark:text-slate-400 mt-1">{active.hint}</p>
          )}
        </div>

        {/* No transition and no state: paintRail sets each dot's width from
            how far its card is from the middle, on the same frame it places
            the cards. See the note there for why a transition was the bug. */}
        <div
          ref={dotsRef}
          className="mt-4 flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500"
        >
          {ACCENT_COLORS.map(({ hex }) => (
            <span
              key={hex}
              className="h-1.5 rounded-full shrink-0"
              style={{ width: 6, opacity: 0.3 }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </SubPage>
  )
}
