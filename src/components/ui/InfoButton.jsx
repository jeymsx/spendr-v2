import { useState } from 'react'
import { IconInfo } from '../icons'
import Sheet from './Sheet'

/**
 * A small (i) beside a heading, and the explanation it opens.
 *
 * ── Why the paragraph could not just stay on the page ──
 *
 * Goals ended with four lines explaining that it reads real balances and
 * allocates them top-down. Every word of that is true and worth knowing
 * ONCE - the first time a number surprises you - and it is dead weight on
 * every visit after. A page that explains itself in prose below the content
 * reads as documentation, which is the thing that makes an app feel like
 * something you are reading rather than something you are using.
 *
 * So the text does not go away, it goes one tap in. The heading keeps its
 * one-line hint, which is the part you need at a glance; the (i) holds the
 * model, for the visit where you want it.
 *
 * ── Why a Sheet and not a tooltip ──
 *
 * There is no hover on a phone, and a popover anchored to a 28px target in a
 * scrolling list has to solve placement, clipping and dismissal - three
 * problems Sheet has already solved everywhere else in this app. It is also
 * the same gesture as every other "more about this" in the product, so the
 * dismissal is already learned.
 */
export default function InfoButton({
  /**
   * The sheet's heading, and the button's name. Write it as what the reader
   * gets - "How goals are funded" - rather than repeating the section it
   * sits beside, since a button announced "In funding order" beside a
   * heading that says In funding order tells nobody what it does.
   */
  title,
  /** The explanation. A string, or nodes when it needs more than a sentence. */
  children,
  /**
   * Override the button's accessible name. Rarely needed: it defaults to the
   * title, which already names the explanation. The first draft prefixed
   * "About", which announced "About How goals are funded".
   */
  label,
  className = '',
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Not IconButton: that draws a 36px chip with a border and a shadow,
          which beside a 12px caption is a toolbar control sitting in a
          heading. This is the glyph alone, at the caption's own colour, with
          a 28px box around it so the TARGET is still finger-sized even
          though the mark is 15px. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label ?? title}
        className={[
          'shrink-0 -my-1.5 -mr-1 w-7 h-7 inline-flex items-center justify-center rounded-full',
          'text-slate-400 dark:text-slate-500',
          'active:bg-slate-100 dark:active:bg-white/[0.08]',
          'transition-colors',
          className,
        ].join(' ')}
      >
        <IconInfo size={15} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        {/* No padding here: Sheet's body already carries px-5 and the bottom
            inset. Adding it again indents the text past the title. */}
        <div className="text-13 leading-relaxed text-slate-600 dark:text-slate-300">
          {children}
        </div>
      </Sheet>
    </>
  )
}
