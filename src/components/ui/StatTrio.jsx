import { cx } from './cx'

/**
 * The three readings under a page's headline figure.
 *
 * Four pages had one of these and no two were the same. Budget: bare columns,
 * figure first at 17px, label under it, centred. Goals: bare columns, label
 * first, figure at 15px, left-aligned. Bills: three bordered tiles, label at
 * 9.5px, figure at 19px. Debts: three bordered tiles through a local StatTile
 * component. Same row, same job, four answers.
 *
 * This is Budget's, because it is the one that reads right: the labels are the
 * same words every time you open the page and the figures are the only part
 * that changes, so leading with the label makes the eye cross three headings
 * before reaching anything worth knowing.
 *
 * No tile, either. Bills argued for them - three small labels floating in open
 * space read as unfinished - but the answer to that is the figure being large
 * and first, which is what gives the row something to hang on.
 */
export default function StatTrio({ items, className = '' }) {
  return (
    <div className={cx('grid grid-cols-3 gap-3 text-center', className)}>
      {items.map(({ label, value, tone }) => (
        <div key={label}>
          <p className={cx(
            'text-17 font-bold tabular-nums leading-none',
            /* A tone is for a figure that means something on its own - money
               owed, a count of overdue bills. Everything else is ink. */
            tone || 'text-slate-800 dark:text-slate-100',
          )}>
            {value}
          </p>
          <p className="text-xs font-semibold mt-1.5 text-slate-500 dark:text-slate-400">
            {label}
          </p>
        </div>
      ))}
    </div>
  )
}
