import { useRef, useEffect } from 'react'
import CategoryTile from './CategoryTile'

/**
 * Pick a category by swiping a row of them.
 *
 * This replaced a field that opened a bottom sheet holding a four-column grid.
 * The sheet was three interactions for one choice - tap the field, tap the
 * category, watch it dismiss - and it covered the amount you had just typed
 * while you made it. The categories are also the shortest list in the form:
 * six of them here, two on the inflow page. A modal is what you reach for when
 * the options cannot fit on the screen, and these always could.
 *
 * Same idiom as the colour row on the card style step and the account
 * carousel on the home screen: a full-bleed horizontal scroller that runs off
 * the right edge, which is what says "there is more this way" without a
 * control saying it.
 *
 * ── The selected state ──
 *
 * The ring is the accent, not the category's own colour. A ring in the
 * category colour would have been prettier and would fail: the palette
 * includes pale yellows and greens that do not clear 3:1 against either
 * background, so "which one is picked" would depend on which one you picked.
 * The accent ring is one value, always legible, and it matches how the
 * transaction filter marks a selected account.
 *
 * The label carries no colour at all, only weight - accent-coloured 10px text
 * would need the .seg-active correction to clear 4.5:1, and there is nothing
 * for the colour to say that the ring above it has not already said.
 */
export default function CategoryRail({ categories = [], selected, onSelect, className = '', gutter = 16 }) {
  const railRef = useRef(null)
  /* Whether the rail has already centred itself, and whether the person has
     taken over. Refs, not state: neither should cause a render. */
  const centred = useRef(false)
  const touched = useRef(false)

  /**
   * Open on the selected category.
   *
   * Matters when the form arrives pre-filled - from a template, or a repeated
   * transaction - where the pick can be off-screen to the right and the rail
   * would otherwise look untouched.
   *
   * Explicit scrollTo rather than scrollIntoView: on a scroll-snap rail
   * scrollIntoView negotiates with the snap points and lands on a neighbour.
   * Once, and never in response to a tap - re-centring on every pick would
   * yank the row out from under the finger that just made it.
   *
   * "On mount" was not enough. The edit form resolves its category from the
   * categories table, which loads after the page renders, so at mount there
   * is no selected tile to scroll to and the rail sat at the left showing
   * Bills while the bill was Subscriptions, four tiles off-screen. It looked
   * for all the world like nothing was selected.
   *
   * So it waits for a selection to EXIST rather than for the component to
   * mount, and `touched` is what keeps the original promise: once you have
   * tapped a tile, this never moves the rail again.
   */
  useEffect(() => {
    if (centred.current || touched.current) return
    const rail = railRef.current
    const on = rail?.querySelector('[data-on="true"]')
    if (!rail || !on) return
    centred.current = true
    rail.scrollTo({ left: Math.max(0, on.offsetLeft - (rail.clientWidth - on.offsetWidth) / 2) })
  }, [selected])

  if (!categories.length) {
    return (
      <p className={`text-[13px] text-slate-400 dark:text-slate-500 px-1 ${className}`}>
        No categories yet — add one in Settings.
      </p>
    )
  }

  return (
    <div
      ref={railRef}
      /* `gutter` is the container's own horizontal padding, in px. The rail
         cancels it with a negative margin and re-adds it inside the scroller,
         so a tile can sit flush with the screen edge and be visibly cut off.
         A number rather than a class string because the third value below has
         to match it exactly, and two hand-written Tailwind classes that must
         agree is a bug waiting to happen - the callers already disagree, the
         form being px-4 and the filter sheet px-5.

         scrollPaddingInline is the load-bearing one, and it is not optional.
         `snap-start` aligns an item's start edge to the SNAPPORT's start
         edge, and the snapport defaults to the padding box - so the browser
         snapped the first tile flush to the container edge and ate the 20px
         of padding, putting it 20px left of the section label and the button.
         Measured: scrollLeft settled at exactly 20, the padding's own value.
         scroll-padding moves the snapport inward by the same amount, so the
         resting position becomes 0 and the padding survives.

         Invisible on the add-expense form, incidentally, because six
         categories fit without scrolling and a rail with nothing to scroll
         never snaps.

         gap-1.5, and the tile below is only 4px wider than its icon. The
         first version had 68px tiles around 52px icons, so every visible gap
         was 10px of gap plus 16px of slack INSIDE the tiles either side - 26px
         of air that read as the row being spread out, when it was really the
         tiles being padded. Hugging the icon puts the measured gap and the
         perceived gap back in agreement: 10px now.

         It also fits. Six tiles at 54 plus five gaps at 6 is 354, inside the
         358 a 390px screen leaves after the form's padding - so the whole set
         is visible without a swipe, and the row only scrolls for someone who
         has added more. */
      className={`flex gap-1.5 overflow-x-auto no-scrollbar snap-x py-1 ${className}`}
      style={{
        marginInline: -gutter,
        paddingInline: gutter,
        scrollPaddingInline: gutter,
        touchAction: 'pan-x pan-y',
        overscrollBehaviorX: 'contain',
      }}
      role="radiogroup"
      aria-label="Category"
    >
      {categories.map(cat => {
        const on = selected?.id === cat.id
        return (
          <button
            key={cat.id}
            type="button"
            data-on={on}
            onClick={() => { touched.current = true; onSelect(cat) }}
            role="radio"
            aria-checked={on}
            className="shrink-0 snap-start w-[54px] flex flex-col items-center gap-1.5
              active:scale-95 transition-transform duration-75"
          >
            {/* The tile itself is components/CategoryTile.jsx - the sheet
                that edits a transaction's category picks from the same one,
                and it used to pick from a smaller tile with different label
                colours. What is left here is the row: the width, the snap and
                the press. */}
            <CategoryTile cat={cat} on={on} />
          </button>
        )
      })}
    </div>
  )
}
