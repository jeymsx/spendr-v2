import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { accountBrand, GRADIENT_PRESETS } from '../lib/accountBrands'
import { CARD_DESIGNS, designMeta, normalizeDesign } from '../lib/cardDesigns'
import { PALETTE, TYPE_LABEL } from '../lib/accountMeta'
import { fmt } from '../lib/money'
import { parseMoney } from '../utils/moneyInput'
import BrandMark from './BrandMark'
import BrandWatermark from './BrandWatermark'
import FadeScroller from './FadeScroller'
import SchemeMark, { SCHEME_OPTIONS } from './SchemeMark'

/**
 * The pieces that make an account look like a card.
 *
 * All of this began life inside pages/AccountNew.jsx, where it was the third
 * step of the create flow. The edit screen needed the same gallery, the same
 * colour row and the same network logos, and a second copy of a coverflow
 * rail with hand-tuned angles in it would have drifted from the original
 * within a release. So it lives here and both screens render the same code.
 *
 * Everything takes a `draft` - any object with name/type/color/customColor/
 * design/scheme/creditLimit on it - and a `set` that merges a patch into it.
 * That is the shape AccountNew's reducer already used, and the edit form
 * adapts its own useState fields to it.
 */

export const CARD_RATIO = 1.586
export const PORTRAIT_W = 224
export const PORTRAIT_H = Math.round(PORTRAIT_W * CARD_RATIO)   // 355

/** The card face, lying flat. The real one, not a diagram of it. */
export function PreviewCard({ draft, large = false }) {
  // customColor has to travel with the colour, or accountBrand's override
  // branch never fires and the preview keeps showing the house gradient while
  // the swatch row says otherwise. Every other card renderer passes the whole
  // account object and gets this for free; this one builds the argument by
  // hand from a draft, which is exactly how the field went missing.
  const brand = accountBrand({
    name: draft.name,
    type: draft.type,
    color: draft.color,
    customColor: draft.customColor,
  })
  const isCredit = draft.type === 'credit'
  const typeLabel = TYPE_LABEL[draft.type]
  const named = (draft.name ?? '').trim()
  // An account named after its own type would otherwise label itself twice.
  const subtitle = typeLabel && typeLabel.toLowerCase() !== named.toLowerCase()
    ? typeLabel
    : null

  return (
    <div
      className={`acct-card mx-auto w-full rounded-2xl flex flex-col text-left text-white ${
        large ? 'max-w-[350px] px-6 pt-5 pb-5' : 'max-w-[300px] px-5 pt-4 pb-4'
      }`}
      style={{
        // Custom properties, not `background` - the shorthand would beat the
        // design patterns in index.css. Same as every other card renderer.
        '--card-from': brand.from,
        '--card-to': brand.to,
        aspectRatio: String(CARD_RATIO),
      }}
      data-brand={brand.key}
      data-design={normalizeDesign(draft.design)}
    >
      <BrandWatermark brand={brand} />

      <div className="flex items-center gap-2.5">
        <BrandMark mark={brand.mark} size={large ? 26 : 22} className="shrink-0" />
        <div className="min-w-0">
          <p className={`font-semibold leading-tight truncate ${large ? 'text-15' : 'text-13'}`}>
            {named || 'New account'}
          </p>
          {subtitle && <p className="text-10 text-white/65 truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-10 font-semibold uppercase tracking-wider text-white/50">
            PHP
          </p>
          {isCredit && parseMoney(draft.creditLimit) > 0 && (
            <p className="text-11 font-semibold tabular-nums text-white/80 mt-0.5">
              {fmt(parseMoney(draft.creditLimit))} limit
            </p>
          )}
        </div>
        <SchemeMark scheme={draft.scheme} className={large ? 'h-[32px]' : 'h-[27px]'} />
      </div>
    </div>
  )
}

/** The same face, stood on its end. */
export function PortraitCard({ draft, turned }) {
  return (
    <div
      className="relative mx-auto"
      style={{ width: PORTRAIT_W, height: PORTRAIT_H }}
    >
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: PORTRAIT_H,
          height: PORTRAIT_W,
          // The card turns from flat to upright once, on entering the step.
          // 520ms with an overshoot: a card being stood on its end has
          // weight, and easing it linearly reads as a diagram rather than an
          // object.
          transform: `translate(-50%, -50%) rotate(${turned ? 90 : 0}deg) scale(${turned ? 1 : 0.92})`,
          transition: 'transform 520ms cubic-bezier(0.34, 1.28, 0.64, 1)',
        }}
      >
        <PreviewCard draft={draft} large />
      </div>
    </div>
  )
}

/**
 * Every design, as a coverflow rail of real card faces, with dots under it.
 *
 * The choice is made by looking rather than by reading a name, which is why
 * this renders six full cards instead of six swatches.
 */
export function CardDesignGallery({ draft, set }) {
  const railRef = useRef(null)
  const [turned, setTurned] = useState(false)
  const activeIdx = Math.max(0, CARD_DESIGNS.findIndex(d => d.key === normalizeDesign(draft.design)))
  const meta = designMeta(draft.design)

  // The turn happens after the first paint, so the transition has a `from`
  // state to run out of. Setting it during render would land on 90deg with
  // nothing to animate.
  useEffect(() => {
    const id = requestAnimationFrame(() => setTurned(true))
    return () => cancelAnimationFrame(id)
  }, [])

  /**
   * Turn each card by how far it is from the centre.
   *
   * Coverflow: the centred card faces you and its neighbours are rotated away
   * on their own vertical axis, so swiping reads as turning through a wallet
   * rather than sliding a strip sideways. Distance is measured in card widths,
   * so it is continuous - the cards turn WITH the finger rather than snapping
   * between two states when the index changes.
   *
   * Written straight to the nodes, deliberately. Routing this through React
   * would re-render a list of six card faces on every scroll frame, and a CSS
   * transition would fight a value that is already changing continuously.
   *
   * perspective sits inside each card's own transform rather than on the rail:
   * on a scrolling ancestor it interacts with the scrollport, and a per-node
   * perspective is also what keeps each card's vanishing point its own.
   *
   * Transforms never change the layout box, so offsetLeft and every snap
   * position stay exactly where they were - which is the only reason this can
   * be layered onto a snap rail at all.
   */
  const paintRail = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const mid = rail.scrollLeft + rail.clientWidth / 2
    let best = 0, bestDist = Infinity
    for (const node of rail.querySelectorAll('[data-design-idx]')) {
      const centre = node.offsetLeft + node.offsetWidth / 2
      const away = (centre - mid) / node.offsetWidth        // in card widths
      // Clamped to one card width, so `clamped * -62` tops out at exactly 62
      // degrees. At the 1.2 this first used it reached 74.4 - past the point
      // the comment below says is too far, which is the kind of thing a
      // measured check catches and reading the code does not.
      const clamped = Math.max(-1, Math.min(1, away))
      const fade = Math.min(Math.abs(clamped), 1)
      // 46 degrees on a 620px perspective, up from 30 on 900. Both numbers
      // pull the same way: the angle is how far the card turns, the shorter
      // perspective is how hard that turn foreshortens. 30 on 900 read as a
      // card lying back; this reads as one being turned.
      //
      // 46 is a measured ceiling, not a taste call, and the constraint is
      // worth writing down because it is not obvious: a resting neighbour is
      // always at full turn, so the maximum angle IS how the row looks
      // standing still - there is no separate "at rest" value to tune. The
      // peek left at the screen edge is therefore W*cos(angle), and for a
      // 224px card sitting 240px off centre in a 390px viewport that is
      //
      //     30deg -> 52px    42deg -> 38px    54deg -> 21px
      //     38deg -> 43px    46deg -> 33px    62deg ->  8px
      //
      // 62 was tried and the neighbours vanished outright. Past about 50 there
      // is not enough card left to see the next design coming, which is the
      // only reason to render it at all.
      //
      // translateZ pushes the turning cards back as well as around, so they
      // pass behind the centred one rather than beside it.
      node.style.transform =
        `perspective(620px) rotateY(${clamped * -46}deg)`
        + ` translateZ(${-fade * 30}px) scale(${1 - fade * 0.06})`
      node.style.opacity = String(1 - fade * 0.6)
      // The turned-away cards must not sit on top of the centred one.
      node.style.zIndex = String(10 - Math.round(fade * 10))

      const dist = Math.abs(centre - mid)
      if (dist < bestDist) { bestDist = dist; best = Number(node.dataset.designIdx) }
    }
    return best
  }, [])

  /**
   * One rAF per scroll burst.
   *
   * A snap rail fires scroll dozens of times per gesture; painting on each
   * would do the same work several times inside one frame.
   */
  const frame = useRef(0)
  const onRailScroll = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const best = paintRail()
      const key = CARD_DESIGNS[best]?.key
      if (key && key !== draft.design) set({ design: key })
    })
  }, [draft.design, set, paintRail])

  // Paint once before the first gesture, or the neighbours start flat and
  // only turn after the rail is touched.
  useEffect(() => {
    paintRail()
    return () => { if (frame.current) cancelAnimationFrame(frame.current) }
  }, [paintRail])

  /**
   * Open on the design already in use.
   *
   * Only matters when editing: a card set to the fifth design would otherwise
   * open on the first one and the rail's own onScroll would then write that
   * first design back over it. Instant, not smooth - this is where the rail
   * starts, not somewhere it travels to.
   */
  useEffect(() => {
    const rail = railRef.current
    const node = rail?.querySelector(`[data-design-idx="${activeIdx}"]`)
    if (!rail || !node || activeIdx === 0) return
    rail.scrollLeft = node.offsetLeft - (rail.clientWidth - node.offsetWidth) / 2
    paintRail()
    // Entry position only. Re-running it when activeIdx changes would yank
    // the rail out from under the finger that just scrolled it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Centre card `i` in the rail.
   *
   * An explicit scrollTo rather than node.scrollIntoView({inline:'center'}),
   * which measured wrong here: tapping the third dot landed on the fifth
   * card. scrollIntoView walks every scrollable ancestor and negotiates with
   * scroll-snap while it does it, and on a snap-mandatory rail the two
   * disagree. Computing the offset directly asks one element to go to one
   * place, and snapping then has nothing left to argue with.
   */
  function scrollTo(i) {
    const rail = railRef.current
    const node = rail?.querySelector(`[data-design-idx="${i}"]`)
    if (!rail || !node) return
    rail.scrollTo({
      left: node.offsetLeft - (rail.clientWidth - node.offsetWidth) / 2,
      behavior: 'smooth',
    })
  }

  return (
    <>
      {/* The gallery. Every card is the real face with a different design on
          it, so the choice is made by looking rather than by reading a name.
          snap-mandatory means it always settles on one. */}
      <div
        ref={railRef}
        onScroll={onRailScroll}
        className="flex items-center gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar"
        style={{ touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain' }}
      >
        {/* Spacers, so the first and last card can reach the centre - a
            scrollport cannot scroll past its own start. */}
        <div className="shrink-0" style={{ width: `calc(50% - ${PORTRAIT_W / 2}px)` }} />
        {CARD_DESIGNS.map((d, i) => (
          <div
            key={d.key}
            data-design-idx={i}
            /* No transition and no React-driven style. Both transform and
               opacity are written straight to the node by paintRail on every
               scroll frame - a CSS transition would fight a value that is
               already changing continuously, and going through React would
               mean a re-render per frame of a list holding six card faces. */
            className="shrink-0 snap-center will-change-transform"
          >
            <PortraitCard draft={{ ...draft, design: d.key }} turned={turned} />
          </div>
        ))}
        <div className="shrink-0" style={{ width: `calc(50% - ${PORTRAIT_W / 2}px)` }} />
      </div>

      {/* The name, and nothing else. A sentence explaining what "Bloom" looks
          like sits directly under a picture of what Bloom looks like - the
          picture is the better argument, and two lines of prose that change
          on every swipe are noise between the card and the dots.

          The height is still pinned, at one line now instead of three, so
          swiping between a short name and a long one does not shift the dots
          and the CTA under it. */}
      <div className="px-6 mt-4 text-center min-h-[42px]">
        <p className="text-15 font-semibold text-slate-900 dark:text-white">{meta.name}</p>
        <p className="text-12 text-slate-500 dark:text-slate-400 mt-0.5">{meta.hint}</p>
      </div>

      {/* Design dots. Tapping one scrolls the rail, so the gallery stays the
          single source of which design is on - no second piece of state that
          could disagree with the scroll position. */}
      <div className="flex items-center justify-center gap-2 mt-3">
        {CARD_DESIGNS.map((d, i) => (
          <button
            key={d.key}
            type="button"
            onClick={() => scrollTo(i)}
            aria-label={d.name}
            aria-pressed={i === activeIdx}
            className={`rounded-full transition-all duration-200 ${
              i === activeIdx
                ? 'w-5 h-1.5 bg-primary'
                : 'w-1.5 h-1.5 bg-slate-300 dark:bg-white/25'
            }`}
          />
        ))}
      </div>
    </>
  )
}

/**
 * The colour row: the institution's own colours, then gradients, then solids.
 *
 * ── Colour, for every account ──
 *
 * Branded ones included. Banks issue the same account in several finishes, so
 * the card in your hand may not be the one on the brand sheet - locking the
 * colour to the house palette made the app more certain about someone's card
 * than they are.
 *
 * What a chosen colour does NOT take with it is the logo. accountBrand
 * overrides the gradient only, so a purple BPI card still carries the BPI
 * mark; see its customColor branch.
 *
 * A branded account leads with its own colours as the first swatch, selected
 * until something else is picked - which makes the house colour a visible
 * default rather than an invisible one, and gives you somewhere to tap to put
 * it back.
 */
export function ColorRail({ draft, set }) {
  /**
   * The institution's own stops, if it has any.
   *
   * Asked for with customColor forced off, so it returns the house colours
   * whatever the draft currently overrides them with - this is the swatch that
   * puts them back, so it has to know what they were.
   *
   * Null for an unbranded account: `custom` and `fallback` have no house
   * colour to offer, so their row starts with the gradients instead.
   */
  const brandColor = useMemo(() => {
    const b = accountBrand({ name: draft.name, type: draft.type, customColor: false })
    if (b.key !== 'custom' && b.key !== 'fallback') return { from: b.from, to: b.to }
    // No hard-coded gradient, but the grid may still have handed over a house
    // colour - solve it the same way the card will.
    const own = draft.presetColor ? accountBrand({
      name: draft.name, type: draft.type, color: draft.presetColor,
    }) : null
    return own ? { from: own.from, to: own.to } : null
  }, [draft.name, draft.type, draft.presetColor])

  /**
   * Reveal the selected colour, but only if it is out of sight.
   *
   * The row starts at its left margin like every other row on the page. It
   * used to centre the selection, which needed spacers at both ends and left
   * the first swatch floating in the middle of an otherwise empty line - a
   * default presented as though it had been chosen.
   *
   * The scroll survives for the case that needs it: reopening a card set to
   * the last solid, twenty-odd swatches along, would otherwise show a row
   * with nothing selected in it.
   *
   * Once, on entry: re-scrolling on every pick would yank the row out from
   * under the finger that just tapped it.
   */
  const swatchRef = useRef(null)
  useEffect(() => {
    const row = swatchRef.current
    const on = row?.querySelector('[aria-pressed="true"]')
    if (!row || !on) return
    const left = on.offsetLeft - row.scrollLeft
    if (left >= 0 && left + on.offsetWidth <= row.clientWidth) return
    row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2 })
  }, [])

  return (
    /* Feathered at both ends, like every other rail: a swatch cut in half by
       the panel edge looks broken, and the mask is zero at whichever end you
       have already reached. */
    <FadeScroller
      ref={swatchRef}
      axis="x"
      className="flex items-center gap-3 snap-x px-5 scroll-px-5 py-2.5 -mx-5"
      style={{ touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain' }}
    >
      {brandColor && (
        <button
          type="button"
          onClick={() => set({
            customColor: false,
            // Put the house colour back on the draft as well as clearing
            // the flag: for a brand with no BRAND_GRADIENTS entry the card
            // reads `color` even with the flag off, so clearing alone
            // would leave the last override showing.
            ...(draft.presetColor ? { color: draft.presetColor } : {}),
          })}
          aria-label={`${(draft.name ?? '').trim() || 'Brand'} colours`}
          aria-pressed={!draft.customColor}
          className={`w-9 h-9 shrink-0 snap-center rounded-full
            transition-transform duration-150 active:scale-90 ${
              !draft.customColor ? 'swatch-on' : ''
            }`}
          style={{
            background: `linear-gradient(135deg, ${brandColor.from} 0%, ${brandColor.to} 100%)`,
            '--swatch-color': brandColor.from,
          }}
        />
      )}

      {/* Gradients before solids: they are the ones worth scrolling to,
          and a row that opens on solids buries them. Stored in the same
          `color` field as a comma-separated pair - "#a855f7,#ec4899" -
          which aaSafeStops splits and darkens end-by-end. */}
      {GRADIENT_PRESETS.map(([a, b]) => {
        const spec = `${a},${b}`
        const on = draft.color === spec && (!!draft.customColor || !brandColor)
        return (
          <button
            key={spec}
            type="button"
            onClick={() => set({ color: spec, customColor: true })}
            aria-label={`Gradient ${a} to ${b}`}
            aria-pressed={on}
            className={`w-9 h-9 shrink-0 snap-center rounded-full
              transition-transform duration-150 active:scale-90 ${on ? 'swatch-on' : ''}`}
            style={{
              background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
              // The ring takes the first stop; ringing a two-colour swatch
              // in two colours is a worse problem than picking one.
              '--swatch-color': a,
            }}
          />
        )
      })}

      <span
        className="shrink-0 w-px h-6 bg-slate-200 dark:bg-white/[0.12]"
        aria-hidden="true"
      />

      {PALETTE.map(c => {
        // (!draft.customColor || !brandColor): with no brand to override,
        // accountBrand's custom path reads `color` regardless of the flag,
        // so the colour IS in effect and the row has to say so. Testing
        // the flag alone left an unbranded account showing no selection
        // while its card plainly wore the colour.
        const on = draft.color === c && (!!draft.customColor || !brandColor)
        return (
          <button
            key={c}
            type="button"
            onClick={() => set({ color: c, customColor: true })}
            aria-label={`Colour ${c}`}
            aria-pressed={on}
            className={`w-9 h-9 shrink-0 snap-center rounded-full
              transition-transform duration-150 active:scale-90 ${on ? 'swatch-on' : ''}`}
            style={{ background: c, '--swatch-color': c }}
          />
        )
      })}
    </FadeScroller>
  )
}

/**
 * The card network, as the marks themselves.
 *
 * Reading "Mastercard" off a chip and recognising the two circles are not the
 * same act, and the thing being chosen is a logo - so the row shows logos.
 *
 * scheme-ink is what makes them legible here: the on-card treatment hardcodes
 * white, which is invisible against a light-mode background.
 *
 * px-5 -mx-5 and no centring spacers, unlike the colour row. "None" is the
 * default and it belongs at the left margin with everything else on the page -
 * a default floated to the middle of the screen reads as a choice already made.
 */
export function SchemeRail({ value, onChange }) {
  const railRef = useRef(null)

  // Same reveal-if-hidden rule as the colour row, for a card set to JCB.
  useEffect(() => {
    const row = railRef.current
    const on = row?.querySelector('[aria-checked="true"]')
    if (!row || !on) return
    const left = on.offsetLeft - row.scrollLeft
    if (left >= 0 && left + on.offsetWidth <= row.clientWidth) return
    row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2 })
  }, [])

  return (
    <div
      ref={railRef}
      role="radiogroup"
      aria-label="Card network"
      className="flex items-center gap-1 overflow-x-auto no-scrollbar snap-x px-5 -mx-5"
      style={{ touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain' }}
    >
      {SCHEME_OPTIONS.map(o => {
        const on = (value ?? '') === o.value
        return (
          <button
            key={o.value || 'none'}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            onClick={() => onChange(o.value)}
            className={`shrink-0 snap-center w-20 h-12 rounded-xl flex flex-col items-center
              justify-center gap-1.5 transition-opacity duration-200 active:scale-95 ${
                on ? 'opacity-100' : 'opacity-40'
              }`}
          >
            {o.value ? (
              <SchemeMark scheme={o.value} className="scheme-ink h-[17px]
                text-slate-800 dark:text-white" />
            ) : (
              <span className="text-12 font-semibold text-slate-700 dark:text-slate-200">
                None
              </span>
            )}
            {/* Always rendered, so selecting one does not change the
                height of the row and shift the fields below it. */}
            <span className={`block w-6 h-[2px] rounded-full transition-colors duration-200 ${
              on ? 'bg-primary' : 'bg-transparent'
            }`} />
          </button>
        )
      })}
    </div>
  )
}
