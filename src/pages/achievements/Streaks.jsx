import Card from '../../components/ui/Card'
import ProgressBar from '../../components/ui/ProgressBar'
import { GlassArt } from '../../components/glass/GlassArt'

/**
 * The two runs going now: days logged, and days without spending.
 *
 * Streaks lead the page because they are the part you can do something about
 * today - every other track moves in months, or in money. Each card says how
 * long the run is, the next milestone it is heading for and how close it is,
 * and, for the no-spend run, the honest thing about today: it does not count
 * until it is over, and one purchase ends it.
 *
 * @param {{tracks: any[], onOpen: (track: any) => void}} props
 */
export default function Streaks({ tracks, onOpen }) {
  const logging = tracks.find(t => t.key === 'logging')
  const nospend = tracks.find(t => t.key === 'nospend')
  if (!logging || !nospend) return null
  return (
    <div className="px-5 grid grid-cols-2 gap-3">
      <StreakCard track={logging} art="flame" onOpen={onOpen} />
      <StreakCard track={nospend} art="leaf" onOpen={onOpen} />
    </div>
  )
}

/** @param {{track: any, art: string, onOpen: (track: any) => void}} props */
function StreakCard({ track, art, onOpen }) {
  const current = track.progress.current ?? 0
  const best = track.progress.value ?? 0
  const next = track.view.next
  const note = track.key === 'nospend'
    ? (track.progress.spentToday ? 'Spent today. Starts again tomorrow.' : current === 0 ? 'Today counts once it’s over.' : null)
    : (current === 0 ? 'Log something today to start one.' : null)
  return (
    <Card
      as="button"
      interactive
      padding="md"
      onClick={() => onOpen(track)}
      className="flex flex-col items-start gap-1 min-w-0"
      aria-label={`${track.name}: ${current} ${current === 1 ? 'day' : 'days'}`}
    >
      <div className="w-full flex items-start justify-between gap-2">
        <GlassArt name={art} hue={track.hue} size={44} className="-ml-1 -mt-1" />
        {best > current && (
          <span className="text-11 font-semibold text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">Best {best}</span>
        )}
      </div>
      <p className="mt-1 flex items-baseline gap-1 text-slate-900 dark:text-white">
        <span className="text-28 leading-none font-bold tabular-nums tracking-tight">{current}</span>
        <span className="text-13 font-semibold text-slate-500 dark:text-slate-400">{current === 1 ? 'day' : 'days'}</span>
      </p>
      <p className="text-13 font-semibold text-slate-700 dark:text-slate-200 leading-snug">{track.name}</p>
      <div className="w-full mt-2">
        <ProgressBar value={next ? (current / next.n) * 100 : 100} color={track.hue} />
      </div>
      <p className="text-11 text-slate-500 dark:text-slate-400 leading-snug min-h-[15px]">
        {note ?? (!next ? 'Every level reached'
          // The run already reaches it; the level waits for yesterday to settle.
          : current >= next.n ? `${next.n} is yours once today is over`
            : `${next.n - current} more for ${next.n}`)}
      </p>
    </Card>
  )
}
