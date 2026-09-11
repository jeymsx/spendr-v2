import { cx } from './cx'

/**
 * The words above a group of anything.
 *
 * ── One name, because it is one thing ──
 *
 * There were 65 of these across the pages, in 19 distinct recipes. Two of
 * them accounted for 53: `text-slate-500 dark:text-slate-400` and
 * `text-slate-400 dark:text-slate-500` - the same caption with the two ends
 * of the ramp swapped. Nobody decided that. It is what happens when the
 * twentieth caption is written by copying the nineteenth and the copy is
 * taken from the wrong screen.
 *
 * The brighter pair wins. A caption you have to work to read is not quieter,
 * it is broken, and slate-400 on white is already at the edge of legible.
 *
 * The rest were louder still - 13px and 14px semibolds in slate-700 and
 * slate-800, which is the size and weight of CONTENT. A label that competes
 * with the thing it labels is the reason a screen reads as busy.
 *
 * ── It is a <p>, unless it is really a label ──
 *
 * A heading over a list is not a <label> and must not claim to be one; a
 * screen reader that is told "label" goes looking for the control it names.
 * Pass `htmlFor` only when there is a real control to point at, and the tag
 * changes to match.
 *
 * ── className is layout only ──
 *
 * Same rule as Button: this owns size, weight and colour, and callers own
 * where it sits. A caption above a page section usually wants more air than
 * the 6px a field wants, so it passes `mb-3` - that is spacing, not style.
 */
export default function SectionLabel({ children, htmlFor = null, className = '' }) {
  const Tag = htmlFor ? 'label' : 'p'
  return (
    <Tag
      htmlFor={htmlFor ?? undefined}
      className={cx(
        'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
