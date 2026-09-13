import CategoryGlyph from './CategoryGlyph'
import { readableInk } from '../lib/color'

/**
 * A category as a tile: its glyph on its own colour, its name underneath.
 *
 * Two screens choose a category and they were choosing it from two different
 * objects - a 50px tile in a row you swipe on the add form, a 44px tile in a
 * four-column grid in the sheet that edits a transaction. Same question, same
 * list, two sizes, two label colours, two ideas of what "selected" looks
 * like. This is the tile; the caller owns only the box it sits in.
 *
 * ── The selected state lives in CSS ──
 *
 * `.cat-tile[data-on]` in index.css fills the tile with the category's own
 * colour and inks the glyph against it. --cat-ink has to be solved per colour
 * in JS - white clears 4.26:1 on the violet and 1.78:1 on the light orange -
 * which is why the style attribute carries two custom properties rather than
 * one. See lib/color.js.
 *
 * Transaction ROWS use `.cat-tile` too, without data-on, and so keep the 14%
 * wash they have always had.
 *
 * @param {object} props
 * @param {Record<string, any>} props.cat
 * @param {boolean} [props.on]
 */
export default function CategoryTile({ cat, on = false }) {
  return (
    <>
      {/* aria-hidden: the name is the line underneath, and a screen reader
          reading the emoji as well announces the category twice. */}
      <span
        aria-hidden="true"
        data-on={on}
        className="cat-tile w-[50px] h-[50px] rounded-[15px] flex items-center
          justify-center text-[23px] leading-none"
        style={{
          '--cat-color': cat?.color ?? '#64748b',
          '--cat-ink': readableInk(cat?.color ?? '#64748b'),
        }}
      >
        <CategoryGlyph cat={cat} size={23} emoji="🏷️" />
      </span>

      {/* One line, clipped.

          This was line-clamp-2, on the reasoning that "Transfer Fee" reads
          better over two lines than as "Transfer…". True of the label on its
          own, and wrong for the row: every tile reserves the height of the
          tallest, so ONE two-word category made the whole rail taller and
          left an awkward gap under it on any screen that puts something
          directly below.

          A rail of tiles is scanned by glyph and colour - the word is
          confirmation, not identification - so a clipped tail costs less than
          a row that changes height depending on which categories exist. */}
      <span className={[
        'text-10 leading-tight text-center w-full truncate',
        on
          ? 'font-semibold text-slate-900 dark:text-white'
          : 'font-medium text-slate-500 dark:text-slate-400',
      ].join(' ')}>
        {cat?.name}
      </span>
    </>
  )
}
