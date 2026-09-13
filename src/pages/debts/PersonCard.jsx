import Card from '../../components/ui/Card'
import { IconChevronRight } from '../../components/icons'
import { getInitials, getAvatarColor } from './shared'
import { fmt } from '../../lib/money'

/**
 * One person, and what they come to.
 *
 * ── One number, not one row per loan ──
 *
 * The card this replaces showed a single debt. That is right for "I lent Gelo
 * 5,000 in March" and wrong the moment somebody recurs: a subscription shared
 * with two friends made twenty-four cards a year, each chased on its own.
 *
 * So a person is the unit now, and their balance is one signed figure. The
 * sign does the work the two sections used to - positive is owed to you,
 * negative is owed by you - which also means an early payment has somewhere to
 * live. Nothing needed a new state; see lib/people.js.
 *
 * ── Square is not the same as empty ──
 *
 * Somebody at zero still gets a row, greyed, saying so. They are a person you
 * have history with, and a list that drops them the moment the last peso lands
 * makes "did I record that?" unanswerable without going to look.
 */
export default function PersonCard({ person, onOpen }) {
  const owed = person.net > 0.005
  const ahead = person.net < -0.005
  const square = !owed && !ahead

  return (
    <Card padding="none" interactive className="overflow-hidden">
      <button
        type="button"
        onClick={() => onOpen(person)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center
            text-12 font-bold text-white ${square ? 'opacity-45' : ''}`}
          style={{ background: getAvatarColor(person.label) }}
          aria-hidden="true"
        >
          {getInitials(person.label)}
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-14 font-semibold text-slate-800 dark:text-white truncate">
            {person.label}
          </span>
          <span className="block text-11 text-slate-400 dark:text-slate-500 truncate">
            {square
              ? `Square · ${person.rows.length} ${person.rows.length === 1 ? 'entry' : 'entries'}`
              : owed ? 'Owes you'
              : 'Paid ahead'}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className={`block text-15 font-bold tabular-nums ${
            owed  ? 'text-emerald-600 dark:text-emerald-400'
          : ahead ? 'text-amber-600 dark:text-amber-400'
          : 'text-slate-400 dark:text-slate-500'
          }`}>
            {square ? '—' : fmt(Math.abs(person.net))}
          </span>
        </span>

        <span className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true">
          <IconChevronRight />
        </span>
      </button>
    </Card>
  )
}
