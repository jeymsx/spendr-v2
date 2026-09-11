import { useNavigate } from 'react-router-dom'
import { IconChevronLeft } from './icons'

/**
 * The app's sub-page shell: back disc, centred title, optional right action.
 *
 * This is the header Goals, Bills, Debts, AccountDetail and AccountNew all
 * hand-rolled, extracted the fifth time it was needed rather than the sixth.
 * Every page that is reached from somewhere else rather than from the navbar
 * wants exactly this, and wants it identical - a back button that moves by a
 * pixel between screens is the kind of thing you feel without being able to
 * name.
 *
 * The spacer on the right is not decoration. The title is `flex-1
 * text-center`, so it centres within the space left over - and with a 36px
 * button on the left and nothing on the right, "centred" lands 18px left of
 * the actual centre. The spacer restores the symmetry.
 *
 * pb-nav rather than pb-10: the navbar is a fixed 80px overlay, so a page
 * short enough not to scroll has no way to get its last element out from
 * under it.
 */
export default function SubPage({ title, action = null, onBack, children, className = '' }) {
  const navigate = useNavigate()
  return (
    <div className={`pb-nav ${className}`}>
      <header className="flex items-center gap-2 px-4 pt-safe-header pb-3">
        <button
          onClick={onBack ?? (() => navigate(-1))}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0
            bg-white dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/[0.09]
            text-slate-600 dark:text-slate-300 shadow-sm
            active:scale-90 transition-transform duration-75"
          aria-label="Back"
        >
          <IconChevronLeft />
        </button>

        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          {title}
        </h1>

        {action ?? <span className="w-9 shrink-0" aria-hidden="true" />}
      </header>

      {children}
    </div>
  )
}
