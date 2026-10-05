import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import InfoButton from '../../components/ui/InfoButton'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import ProgressBar from '../../components/ui/ProgressBar'
import { SkeletonBadge } from '../../components/ui/Skeleton'
import { GlassBadge } from '../../components/glass/GlassArt'
import { IconChevronRight } from '../../components/icons'
import { useTheme } from '../../context/ThemeContext'
import { useAchievements, challengeCelebration } from '../../context/AchievementContext'
import Streaks from '../../pages/achievements/Streaks'
import Challenges from '../../pages/achievements/Challenges'
import { Badges, Milestones } from '../../pages/achievements/Collection'
import { viewerFor } from '../../pages/achievements/format'
import Guide from '../../pages/achievements/Guide'
import { LIST_WIDTH, DETAIL_WIDTH } from '../components/WebPane'

const Celebration = lazy(() => import('../../components/achievements/Celebration'))

const SECTIONS = [
  { value: 'challenges', label: 'Challenges', about: 'Beat one, keep the medal.', glyph: 'trophy', shape: 'shield' },
  { value: 'milestones', label: 'Milestones', about: 'Every track has a next level.', glyph: 'star', shape: 'circle' },
  { value: 'badges', label: 'Badges', about: 'One-offs, each earned once.', glyph: 'medal', shape: 'hex' },
]

/** @param {string|null} v */
const sectionOf = (v) => (SECTIONS.some(t => t.value === v) ? /** @type {string} */ (v) : 'challenges')

/**
 * Achievements on a computer, laid out as a split view like the sections
 * beside it: where you stand on the left - the count, the two streaks, and
 * the three collections to pick from - and the picked collection on the
 * right, with the room to show it.
 *
 * On the phone the collections are tabs under the streaks, one column; here
 * that column was a phone's width down a wide window. The pieces are the
 * phone's own (pages/achievements/*), so a challenge or a badge added there
 * is here too; what this page owns is where they sit. The collection is in
 * the address (`?tab=`), as on the phone, so a notification's link opens the
 * right one.
 */
export default function WebAchievements() {
  const state = useAchievements()
  const { accentColor } = useTheme()
  const [params] = useSearchParams()
  const urlTab = params.get('tab')
  const [section, setSectionState] = useState(() => sectionOf(urlTab))
  // A link landing while the page is open moves the section (see Achievements.jsx).
  const [seenTab, setSeenTab] = useState(urlTab)
  if (urlTab !== seenTab) {
    setSeenTab(urlTab)
    setSectionState(sectionOf(urlTab))
  }
  const [viewing, setViewing] = useState(/** @type {any} */ (null))
  const [guide, setGuide] = useState(false)

  // replaceState, as the phone's tabs do: a router navigation would scroll both panes to the top.
  const setSection = (/** @type {string} */ v) => {
    setSectionState(v)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', v)
      window.history.replaceState(window.history.state, '', url)
    } catch { /* the section still changes; the address just does not follow */ }
  }

  const openDef = (/** @type {any} */ def, /** @type {any} */ track) => setViewing(viewerFor(def, track))
  const openTrack = (/** @type {any} */ track) => {
    const view = track.view
    const top = view.prev ?? view.next
    const def = top ? state.achievements.find((/** @type {any} */ a) => a.key === top.key) : null
    if (def) openDef(def, track)
  }
  const openWon = (/** @type {any} */ row) => {
    const item = challengeCelebration(row)
    if (item) setViewing({ item, locked: false, how: '', progress: null, remaining: 0 })
  }

  const levels = state.tracks.reduce((/** @type {number} */ s, /** @type {any} */ t) => s + t.view.earnedCount, 0)
  const levelsAll = state.tracks.reduce((/** @type {number} */ s, /** @type {any} */ t) => s + t.view.tiers.length, 0)
  const badgesEarned = state.badges.filter((/** @type {any} */ b) => b.earned).length
  const { active, won } = state.challenges
  /** @type {Record<string, string>} */
  const meta = {
    challenges: active.length ? `${active.length} running` : won ? `${won} won` : 'None yet',
    milestones: `${levels} of ${levelsAll}`,
    badges: `${badgesEarned} of ${state.badges.length}`,
  }
  const current = SECTIONS.find(s => s.value === section) ?? SECTIONS[0]

  return (
    <div className="web-split web-achievements h-full flex">
      <div
        id="app-main"
        className="web-pane web-pane-list h-full overflow-y-auto overflow-x-hidden shrink-0"
        style={{ width: LIST_WIDTH }}
        aria-label="Achievements"
      >
        {/* A 36px row, as every list's title sits in beside its button, so the titles line up across sections. */}
        <div className="px-5 pt-safe-header pb-4">
          <div className="min-h-9 flex items-center justify-between">
            <h1 className="text-[22px] leading-7 font-bold tracking-[-0.02em] text-slate-900 dark:text-white">Achievements</h1>
            <InfoButton title="How achievements work" onOpen={() => setGuide(true)} />
          </div>
        </div>

        {state.loading ? (
          <div className="px-5 grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, i) => <SkeletonBadge key={i} />)}
          </div>
        ) : (
          <>
            <Card padding="md" className="mx-5 mb-3">
              <p className="text-11 font-medium text-slate-500 dark:text-slate-400">Earned so far</p>
              <p className="mt-1 flex items-baseline gap-1.5 text-slate-900 dark:text-white tabular-nums">
                <span className="text-28 leading-none font-bold tracking-tight">{state.earnedCount}</span>
                <span className="text-13 font-semibold text-slate-500 dark:text-slate-400">of {state.total}</span>
              </p>
              <div className="mt-3">
                <ProgressBar value={state.total ? (state.earnedCount / state.total) * 100 : 0} color={accentColor} />
              </div>
              <p className="mt-2 text-11 text-slate-500 dark:text-slate-400 tabular-nums">
                {won > 0 ? `${won} ${won === 1 ? 'challenge' : 'challenges'} won` : 'No challenges won yet'}
              </p>
            </Card>

            <Streaks tracks={state.tracks} onOpen={openTrack} />

            <Card clip className="mx-5 mt-3 mb-8" role="tablist" aria-label="Collections" aria-orientation="vertical">
              {SECTIONS.map((s, i) => {
                const on = s.value === section
                return (
                  <div key={s.value}>
                    {i > 0 && <Divider inset="row" />}
                    <button
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setSection(s.value)}
                      className={`web-ach-tab w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${on ? 'is-on' : 'active:bg-slate-50 dark:active:bg-white/[0.04]'}`}
                    >
                      <GlassBadge glyph={s.glyph} hue={accentColor} shape={s.shape} size={40} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-15 font-semibold text-slate-900 dark:text-white">{s.label}</span>
                        <span className="block text-12 text-slate-500 dark:text-slate-400 truncate">{s.about}</span>
                      </span>
                      <span className="shrink-0 text-12 font-semibold tabular-nums text-slate-500 dark:text-slate-400">{meta[s.value]}</span>
                      <span className="shrink-0 text-slate-300 dark:text-slate-600"><IconChevronRight size={16} /></span>
                    </button>
                  </div>
                )
              })}
            </Card>
          </>
        )}
      </div>

      <div className="web-pane web-pane-detail flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden" role="tabpanel" aria-label={current.label}>
        <div className="mx-auto w-full pb-10" style={{ maxWidth: DETAIL_WIDTH }}>
          <div className="px-5 pt-safe-header pb-4">
            <div className="min-h-9 flex items-center">
              <h2 className="text-[22px] leading-7 font-bold tracking-[-0.02em] text-slate-900 dark:text-white">{current.label}</h2>
            </div>
            <p className="-mt-0.5 text-13 text-slate-500 dark:text-slate-400">{current.about}</p>
          </div>
          {!state.loading && (
            <div className={`web-ach-${section}`}>
              {section === 'challenges' && (
                <Challenges state={state} categories={state.ctx?.categories ?? []} onViewWon={openWon} />
              )}
              {section === 'milestones' && (
                <Milestones tracks={state.tracks} achievements={state.achievements} onOpen={openDef} />
              )}
              {section === 'badges' && <Badges badges={state.badges} onOpen={(/** @type {any} */ b) => openDef(b)} />}
            </div>
          )}
        </div>
      </div>

      <Guide open={guide} onClose={() => setGuide(false)} state={state} />

      {viewing && (
        <Suspense fallback={null}>
          <Celebration
            key={viewing.item.id}
            item={viewing.item}
            mode="view"
            locked={viewing.locked}
            how={viewing.how}
            progress={viewing.progress}
            remaining={viewing.remaining}
            onClose={() => setViewing(null)}
          />
        </Suspense>
      )}
    </div>
  )
}
