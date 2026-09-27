import { GlassBadge } from '../../components/glass/GlassArt'
import { IconTrophy } from '../../components/icons'
import { toneHue } from '../../lib/achievements'
import { useTheme } from '../../context/ThemeContext'
import { ProfileAvatar, RowIcon } from './shared'

/**
 * The top of Settings: who you are, and the one thing on the page that is
 * not a setting.
 *
 * ── The profile, centred ──
 *
 * It was a card like every other row, with your initial in a tinted square -
 * the same weight as "Export transactions". Who the page belongs to is its
 * heading, so it is drawn as one: your initial on a disc of the accent, your
 * name large under it, and your email and currency under that. The whole of
 * it opens the profile, with a small pencil to say so.
 *
 * @param {{name: string, email?: string|null, currency: string, onOpen: () => void}} props
 */
export function ProfileHero({ name, email, currency, onOpen }) {
  const letter = (name || 'S').trim().charAt(0).toUpperCase() || 'S'
  return (
    <div className="px-5 pt-3 pb-7 flex justify-center">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Edit profile, ${name}`}
        className="max-w-full flex flex-col items-center text-center gap-2 rounded-3xl px-4 py-2 active:scale-[0.98] transition-transform"
      >
        <span className="relative mb-1">
          <ProfileAvatar letter={letter} size={84} />
          <span
            className="absolute -bottom-0.5 -right-1 w-7 h-7 rounded-full flex items-center justify-center
              bg-white text-slate-600 border border-slate-200 shadow-sm
              dark:bg-lifted dark:text-slate-200 dark:border-white/[0.12]"
            aria-hidden="true"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </span>
        </span>
        <span className="max-w-full text-28 leading-tight font-bold tracking-tight text-slate-900 dark:text-white line-clamp-2 break-words text-balance">
          {name}
        </span>
        <span className="max-w-full flex items-center justify-center gap-2 min-w-0">
          <span className="shrink-0 text-11 font-semibold px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 accent-ink">
            {currency}
          </span>
          {email && <span className="min-w-0 truncate text-13 text-slate-500 dark:text-slate-400">{email}</span>}
        </span>
      </button>
    </div>
  )
}

/**
 * Achievements, as the page's featured card rather than a row in Manage: it
 * is somewhere to go, not a setting, and the one place on this page with
 * something to look forward to. Two of your own medallions lean in from the
 * right over a wash of your accent - your top logging level, and your latest
 * badge - and the line under the name says where you stand.
 *
 * @param {{state: any, onOpen: () => void}} props
 */
export function AchievementsCard({ state, onOpen }) {
  const { accentColor } = useTheme()
  const logging = (state?.tracks ?? []).find((/** @type {any} */ t) => t.key === 'logging')
  const level = logging?.view?.prev ?? null
  const badge = (state?.badges ?? []).find((/** @type {any} */ b) => b.earned) ?? null
  const counted = state && !state.loading
  const sub = counted ? `${state.earnedCount} of ${state.total} earned` : 'Challenges, milestones and badges'
  return (
    <div className="px-5 mb-8">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Achievements. ${sub}`}
        className="card relative w-full overflow-hidden rounded-2xl text-left active:scale-[0.99] transition-transform"
      >
        <span
          className="absolute inset-y-0 right-0 w-3/4 pointer-events-none"
          aria-hidden="true"
          style={{ background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${accentColor} 16%, transparent) 50%, color-mix(in srgb, ${accentColor} 32%, transparent))` }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none" aria-hidden="true">
          <span className="-mr-3 mt-6 -rotate-12">
            <GlassBadge
              glyph={badge?.glyph ?? 'target'}
              hue={badge?.hue ?? toneHue('indigo')}
              shape="hex"
              locked={!badge}
              size={56}
            />
          </span>
          <GlassBadge glyph="flame" hue={toneHue('orange')} shape="circle" level={level?.label ?? '3'} locked={!level} size={80} animate float />
        </span>
        <span className="relative flex items-center gap-4 px-4 py-6 pr-36">
          <RowIcon color="violet"><IconTrophy /></RowIcon>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800 dark:text-white">Achievements</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{sub}</span>
          </span>
        </span>
      </button>
    </div>
  )
}
