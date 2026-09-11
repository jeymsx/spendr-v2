import { cx } from './cx'

/**
 * The words above a group of anything, and the line explaining it.
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
 * ── Spacing is named, not passed as classes ──
 *
 * The first version baked `mb-1.5 px-1` into the base and let callers adjust
 * through className. That does not work, and the migration proved it twice:
 * `cx` is deliberately not a tailwind-merge, and Tailwind emits spacing
 * utilities in ascending order, so a caller can only ever RAISE these
 * numbers. `mb-3` won as documented; `mb-0` and `px-0` silently lost. Six
 * captions on the accounts page were left hand-rolled for that reason alone,
 * and twelve more went through with `className="px-5 mb-3"`, which had
 * already drifted into a second spelling, `px-5 mb-2.5`.
 *
 * So the two things that genuinely vary are named options, the way Divider
 * named its three insets. Named options cannot conflict with each other, and
 * there is no fourth value without editing this file.
 *
 * ── hint ──
 *
 * A caption sometimes needs a sentence under it - not to restate the label,
 * which is the thing we spend our time deleting, but to say something the
 * screen does not otherwise show: that the top goal is funded first, that a
 * leftover belongs to no goal. Goals had this as a local component with a
 * `hint` prop; the migration dropped both hints on the floor rather than
 * lose the prop, which is how two real explanations nearly went missing.
 *
 * The hint wears the same type as Field's, so an explanation under a label
 * and an explanation under an input are one look.
 */

const BASE = 'block text-xs font-semibold text-slate-500 dark:text-slate-400'

/** Horizontal inset. A caption over a page section has to line up with the
 *  cards below it; one over a field wants the pill's 4px optical indent. */
const INSET = {
  none: '',
  field: 'px-1',
  gutter: 'px-5',
}

/** Space below. `loose` is for a page section, `normal` for a field. */
const GAP = {
  none: '',
  tight: 'mb-1',
  normal: 'mb-1.5',
  loose: 'mb-3',
}

export default function SectionLabel({
  children,
  /** One sentence under the label, for what the screen does not show. */
  hint = null,
  htmlFor = null,
  inset = 'field',
  gap = 'normal',
  /** Layout only - alignment, flex behaviour. Spacing goes through the
   *  named options above, which cannot be overridden into silence. */
  className = '',
}) {
  const Tag = htmlFor ? 'label' : 'p'
  const pad = INSET[inset] ?? INSET.field
  const below = GAP[gap] ?? GAP.normal

  if (!hint) {
    return (
      <Tag htmlFor={htmlFor ?? undefined} className={cx(BASE, pad, below, className)}>
        {children}
      </Tag>
    )
  }

  return (
    <div className={cx(below, className)}>
      <Tag htmlFor={htmlFor ?? undefined} className={cx(BASE, pad)}>
        {children}
      </Tag>
      <p className={cx('mt-1 text-[11.5px] leading-snug text-slate-400 dark:text-slate-500', pad)}>
        {hint}
      </p>
    </div>
  )
}
