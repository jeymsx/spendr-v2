import { cx } from './cx'

/**
 * One hairline.
 *
 * ── What it settles ──
 *
 * 46 of these, in 16 recipes. Half were `h-px` divs and half were
 * `border-t` on the row below; the light end ranged over slate-50, slate-100,
 * slate-200 and slate-200/70, and the dark end over white/[0.04] through
 * white/[0.08]. Stacked down one screen that is visible - a list whose
 * separators get fainter as you scroll looks like a rendering fault.
 *
 * slate-100 / white/[0.07] wins: the most common of the sixteen, and the
 * middle of both ranges, so nothing moves far.
 *
 * ── Why the inset is a prop and not a class ──
 *
 * A separator between rows should start where the row's CONTENT starts, not
 * where its box starts - otherwise it cuts the card in half rather than
 * separating two things inside it. That means the inset depends on what the
 * row contains, and there were three answers in the wild: `mx-4` for a plain
 * row, `ml-14 mr-4` for a row with a leading 40px tile, and nothing at all
 * for a full-bleed rule between sections. All three are right; naming them
 * is what stops a fourth appearing.
 *
 * ── aria-hidden ──
 *
 * It is a picture of a boundary. The boundary itself is the list structure,
 * which a screen reader already has.
 */

const INSET = {
  /** Full bleed: between sections, or edge to edge inside a card. */
  none: '',
  /** Between rows that start at the card's own padding. */
  row: 'mx-4',
  /** Between sections at the page gutter. */
  gutter: 'mx-5',
  /** Between rows led by a 40px glyph tile - starts under the text. */
  glyph: 'ml-14 mr-4',
}

export default function Divider({ inset = 'none', className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        'h-px shrink-0 bg-slate-100 dark:bg-white/[0.07]',
        INSET[inset] ?? INSET.none,
        className,
      )}
    />
  )
}
