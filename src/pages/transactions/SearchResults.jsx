import { Link } from 'react-router-dom'
import SectionLabel from '../../components/ui/SectionLabel'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import { IconChevronRight } from '../../components/icons'

/**
 * Everything that is not a transaction, answering the same query.
 *
 * ── Above the ledger, and small ──
 *
 * The transactions the query matches are already listed below, filtered by
 * the same words. This is the other half: the account, the bill, the goal, the
 * person. It sits above them and is capped at three per group, because a
 * query that happens to name an account must not push the ledger off screen.
 *
 * Nothing renders at all when there is nothing to say. A block of headings
 * over an empty list is worse than no block, and the query is usually a
 * transaction anyway.
 *
 * @param {{groups: Array<{group: string, items: any[]}>}} props
 */
export default function SearchResults({ groups }) {
  if (!groups?.length) return null

  return (
    <div className="px-5 mb-4">
      <Card padding="none" className="overflow-hidden">
        {groups.map((g, gi) => (
          <div key={g.group}>
            {gi > 0 && <Divider />}
            <div className="px-4 pt-3">
              <SectionLabel inset="none" gap="tight">{g.group}</SectionLabel>
            </div>
            {g.items.map(item => (
              <Link
                key={`${g.group}-${item.id}`}
                to={item.to}
                className="flex items-center gap-3 px-4 py-2.5
                  active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-14 font-semibold text-slate-800 dark:text-white truncate">
                    {item.label}
                  </span>
                  {item.meta && (
                    <span className="block text-11 text-slate-400 dark:text-slate-500 truncate capitalize">
                      {item.meta}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true">
                  <IconChevronRight />
                </span>
              </Link>
            ))}
          </div>
        ))}
      </Card>
    </div>
  )
}
