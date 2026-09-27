import Card from '../../components/ui/Card'
import ProgressBar from '../../components/ui/ProgressBar'
import Rail from '../../components/ui/Rail'
import { GlassBadge } from '../../components/glass/GlassArt'
import { glassPalette } from '../../components/glass/glass'
import { trackAmount } from './format'

/**
 * Milestones: one card per track, each showing where it stands and every
 * level on it.
 *
 * The medallion is the highest level reached, or the first one ahead in grey
 * when none is yet. Under the numbers, the levels in a row - reached ones in
 * the track's colour - so a track reads as a path you are partway along
 * rather than a single score. Every medallion and every level opens the full
 * view, where a reached one can be shared.
 *
 * @param {{tracks: any[], achievements: any[], onOpen: (def: any, track: any) => void}} props
 */
export function Milestones({ tracks, achievements, onOpen }) {
  const byKey = new Map(achievements.map(a => [a.key, a]))
  return (
    <div className="px-5 flex flex-col gap-3">
      {tracks.map(track => {
        const view = track.view
        const top = view.prev ?? view.next ?? view.tiers[0]
        const topDef = byKey.get(top.key)
        const shown = view.shown
        return (
          <Card key={track.key} padding="md">
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onClick={() => topDef && onOpen(topDef, track)}
                aria-label={`${topDef?.name ?? track.name}${top.earned ? '' : ', not yet reached'}`}
                className="shrink-0 -m-1 rounded-full active:scale-95 transition-transform"
              >
                <GlassBadge glyph={track.glyph} hue={track.hue} shape="circle" level={top.label} locked={!top.earned} size={68} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-15 font-semibold text-slate-900 dark:text-white leading-snug">{track.name}</p>
                <p className="text-12 text-slate-500 dark:text-slate-400 leading-snug">{track.about}</p>
                <p className="mt-1 text-13 font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                  {trackAmount(track, shown)}
                  {track.streak && track.progress.value > shown && (
                    <span className="font-normal text-slate-500 dark:text-slate-400"> · best {track.progress.value}</span>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="text-12 text-slate-500 dark:text-slate-400 truncate">
                  {view.next ? `Next: ${byKey.get(view.next.key)?.name ?? view.next.label}` : 'Every level reached'}
                </span>
                <span className="text-12 font-semibold text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                  {view.earnedCount}/{view.tiers.length}
                </span>
              </div>
              <ProgressBar value={view.share * 100} color={track.hue} />
            </div>

            <Rail className="mt-3 -mx-4 px-4 gap-2" aria-label={`${track.name} levels`}>
              {view.tiers.map(/** @param {any} t */ t => {
                const def = byKey.get(t.key)
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => def && onOpen(def, track)}
                    aria-label={`${def?.name ?? t.label}${t.earned ? ', reached' : ''}`}
                    className={`shrink-0 h-8 min-w-[44px] px-2.5 rounded-full text-12 font-bold tabular-nums active:scale-95 transition-transform ${
                      t.earned ? 'text-white' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.07]'
                    }`}
                    /* The palette's ink ground, not the hue: white on a clear
                       gold or lime is under 3:1, and these are words. `ink`
                       is darkened until white on it passes 4.5:1. */
                    style={t.earned ? { backgroundColor: glassPalette(track.hue).ink } : undefined}
                  >
                    {t.label}
                  </button>
                )
              })}
            </Rail>
          </Card>
        )
      })}
    </div>
  )
}

/**
 * Badges: the one-offs, three across, earned first.
 *
 * Locked ones show their real medallion in grey rather than a question mark:
 * nothing here is a secret, and a silhouette is something to work toward.
 *
 * @param {{badges: any[], onOpen: (def: any) => void}} props
 */
export function Badges({ badges, onOpen }) {
  const sorted = [...badges].sort((a, b) => Number(b.earned) - Number(a.earned))
  return (
    <div className="px-4 grid grid-cols-3 gap-2 items-stretch">
      {sorted.map(b => (
        <Card
          key={b.key}
          as="button"
          interactive
          onClick={() => onOpen(b)}
          className="flex flex-col items-center gap-1.5 px-1.5 pt-3 pb-3"
          aria-label={`${b.name}${b.earned ? '' : ', not yet earned'}`}
        >
          <GlassBadge glyph={b.glyph} hue={b.hue} shape="hex" locked={!b.earned} size={76} />
          <span className={`text-11 font-semibold leading-[1.25] text-center ${b.earned ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
            {b.name}
          </span>
        </Card>
      ))}
    </div>
  )
}
