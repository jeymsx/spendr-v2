import SubPage from '../../components/SubPage'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import { CHANGELOG } from '../../lib/changelog'

/** "Sep 27, 2026". @param {string} day 'YYYY-MM-DD' */
function fmtDay(day) {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Every release, newest first: the version and its date over a hairline, and
 * what changed in it in one card - the way Transactions lays out a day and
 * Notifications lays out its list, so it reads as the same app.
 *
 * The words are lib/changelog.js's, written for someone using Spendr rather
 * than someone building it.
 */
export default function ChangelogPage() {
  return (
    <SubPage title="Changelog">
      <p className="mx-5 mt-1 mb-4 text-13 leading-relaxed text-slate-500 dark:text-slate-400 text-center text-balance">
        What changed in each version of Spendr, newest first.
      </p>
      {CHANGELOG.map((release, i) => (
        <section key={release.version} aria-label={`Version ${release.version}`} className="mb-3">
          <div className="flex items-center gap-3 px-5 py-2">
            <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
              Version {release.version}
            </h2>
            {i === 0 && (
              <span className="text-11 font-semibold px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 accent-ink">
                Latest
              </span>
            )}
            <Divider className="flex-1" />
            <span className="text-11 text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">{fmtDay(release.date)}</span>
          </div>
          <Card clip className="mx-5">
            <ul>
              {release.items.map((item, j) => (
                <li key={item.title} className={`px-4 py-3 ${j ? 'border-t border-slate-100 dark:border-white/[0.07]' : ''}`}>
                  <p className="text-13 font-semibold leading-snug text-slate-800 dark:text-slate-100">{item.title}</p>
                  <p className="mt-0.5 text-12 leading-relaxed text-slate-500 dark:text-slate-400">{item.desc}</p>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
      <div className="h-6" />
    </SubPage>
  )
}
