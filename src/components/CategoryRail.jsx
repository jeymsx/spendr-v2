import { useRef, useEffect } from 'react'
import CategoryGlyph from './CategoryGlyph'

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
export default function CategoryRail({ categories = [], selected, onSelect, className = '' }) {
  const railRef = useRef(null)

  /**
   * Open on the selected category.
   *
   * Matters when the form arrives pre-filled - from a template, or a repeated
   * transaction - where the pick can be off-screen to the right and the rail
   * would otherwise look untouched.
   *
   * Explicit scrollTo rather than scrollIntoView: on a scroll-snap rail
   * scrollIntoView negotiates with the snap points and lands on a neighbour.
   * Once, on mount only - re-centring on every pick would yank the row out
   * from under the finger that just tapped it.
   */
  useEffect(() => {
    const rail = railRef.current
    const on = rail?.querySelector('[data-on="true"]')
    if (!rail || !on) return
    rail.scrollTo({ left: Math.max(0, on.offsetLeft - (rail.clientWidth - on.offsetWidth) / 2) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      /* -mx-4 px-4 against the form's own px-4, so a tile can sit flush with
         the screen edge and be visibly cut off.

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
      className={`flex gap-1.5 overflow-x-auto no-scrollbar snap-x -mx-4 px-4 py-1 ${className}`}
      style={{ touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain' }}
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
            onClick={() => onSelect(cat)}
            role="radio"
            aria-checked={on}
            className="shrink-0 snap-start w-[54px] flex flex-col items-center gap-1.5
              active:scale-95 transition-transform duration-75"
          >
            {/* The wash, the rim and the selected ring all live in .cat-tile
                in index.css - only the colour comes from here, because both
                themes have to derive from it and an inline style cannot
                answer a theme. */}
            <span
              data-on={on}
              className="cat-tile w-[50px] h-[50px] rounded-[15px] flex items-center
                justify-center text-[23px] leading-none transition-shadow duration-150"
              style={{ '--cat-color': cat.color ?? '#64748b' }}
            >
              <CategoryGlyph cat={cat} size={23} emoji="🏷️" />
            </span>
            <span className={[
              'text-[10.5px] leading-tight text-center w-full',
              // line-clamp-2 rather than truncate: "Transfer Fee" is two words
              // and reads fine on two lines, where truncated it becomes
              // "Transfer…" and loses the half that distinguishes it.
              'line-clamp-2',
              on
                ? 'font-semibold text-slate-900 dark:text-white'
                : 'font-medium text-slate-500 dark:text-slate-400',
            ].join(' ')}>
              {cat.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
