import { useBack } from '../hooks/useBack'
import { IconChevronLeft } from './icons'
import IconButton from './ui/IconButton'
import PinnedTop from './ui/PinnedTop'

/**
 * A page's header: back disc, centred title, one action, pinned to the top
 * while the page scrolls (ui/PinnedTop.jsx).
 *
 * SubPage's header, lifted out so the pages that lay themselves out - an
 * account, a bill, a person, Budget, Debts, Recurring - use the same one
 * rather than a copy each. The copies had kept SubPage's old flex row, which
 * centres the title in the space LEFT between the buttons: "September 2026"
 * sat 28px left of centre beside "Edit limits".
 *
 * Three columns, the outer two equal while what is in them fits, so the
 * title sits in the true centre whatever is on its right - a round icon, an
 * "Edit" pill - and only gives way when something is too wide to share.
 *
 * @param {{
 *   title?: import('react').ReactNode,
 *   action?: import('react').ReactNode,
 *   onBack?: () => void,
 *   backLabel?: string,
 * }} props
 */
export default function PageHeader({ title = null, action = null, onBack, backLabel = 'Back' }) {
  const back = useBack()
  return (
    <PinnedTop>
      <header className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-5 pt-safe-header pb-3">
        {/* subpage-back: an inert hook for the desktop, which hides it where
            the page is the right half of a split view with nothing behind. */}
        <IconButton label={backLabel} className="subpage-back justify-self-start" onClick={onBack ?? back}>
          <IconChevronLeft />
        </IconButton>

        <h1 className="min-w-0 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          {title}
        </h1>

        {/* w-max: the column is never narrower than what is in it. At 320
            "Edit limits" was squeezed to a column 65px wide and ran 7px off
            the screen; now the title gives way instead. */}
        <div className="justify-self-end flex items-center gap-1.5 w-max">
          {action ?? <span className="w-9 shrink-0" aria-hidden="true" />}
        </div>
      </header>
    </PinnedTop>
  )
}
