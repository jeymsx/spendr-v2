import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SubPage from '../components/SubPage'
import Segmented from '../components/ui/Segmented'
import InfoButton from '../components/ui/InfoButton'
import { SkeletonBadge } from '../components/ui/Skeleton'
import { useAchievements, challengeCelebration } from '../context/AchievementContext'
import Streaks from './achievements/Streaks'
import Challenges from './achievements/Challenges'
import { Badges, Milestones } from './achievements/Collection'
import { viewerFor } from './achievements/format'
import Guide from './achievements/Guide'

const Celebration = lazy(() => import('../components/achievements/Celebration'))

const TABS = [
  { value: 'challenges', label: 'Challenges' },
  { value: 'milestones', label: 'Milestones' },
  { value: 'badges', label: 'Badges' },
]

/** @param {string|null} v */
const tabOf = (v) => (TABS.some(t => t.value === v) ? /** @type {string} */ (v) : 'challenges')

/**
 * Achievements: challenges, milestones and badges, under one roof.
 *
 * ── Why one page ──
 *
 * Badges ran out: twenty of them, and once you had the ones within reach
 * there was nothing ahead. Milestones keep going - every track has a next
 * level - and challenges are the part you choose. They are three views of one
 * idea (you did something with your money, and the app noticed), so they
 * share a page and a celebration, and the streaks that feed two of them lead
 * it, because a streak is the one number you can move today.
 *
 * ── What it is not ──
 *
 * The badges page said it, and it still holds: no ranking, no points, no one
 * to compare with, and nothing here nags. Missing a challenge costs nothing
 * but the challenge.
 *
 * The tab is in the URL (`?tab=badges`), so a link from a notification or
 * the old /badges route lands on the right one.
 */
export default function Achievements() {
  const state = useAchievements()
  const [params] = useSearchParams()
  const urlTab = params.get('tab')
  const [tab, setTabState] = useState(() => tabOf(urlTab))
  /* A link that lands here while the page is already open - a notification
     tapped from the bell - moves the tab, as adjusting state in render: the
     one-render way, with nothing to clean up. */
  const [seenTab, setSeenTab] = useState(urlTab)
  if (urlTab !== seenTab) {
    setSeenTab(urlTab)
    setTabState(tabOf(urlTab))
  }
  const [viewing, setViewing] = useState(/** @type {any} */ (null))
  const [guide, setGuide] = useState(false)

  /* Written to the address with replaceState rather than through the router.
     A router navigation gives the location a new key, and both layouts put
     the scroll back to the top on a new key - so every tap on a tab jumped
     the page up by the height of the streaks. The router's own state object
     is kept, so Back still works. */
  const setTab = (/** @type {string} */ v) => {
    setTabState(v)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', v)
      window.history.replaceState(window.history.state, '', url)
    } catch { /* the tab still changes; the address just does not follow */ }
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

  return (
    <SubPage
      title="Achievements"
      action={<InfoButton title="How achievements work" onOpen={() => setGuide(true)} />}
    >
      {state.loading ? (
        <div className="px-5 pt-2 grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, i) => <SkeletonBadge key={i} />)}
        </div>
      ) : (
        <>
          <p className="px-5 -mt-1 mb-3 text-13 text-slate-500 dark:text-slate-400 text-center tabular-nums">
            {state.earnedCount} of {state.total} earned
            {state.challenges.won > 0 ? ` · ${state.challenges.won} ${state.challenges.won === 1 ? 'challenge' : 'challenges'} won` : ''}
          </p>

          <Streaks tracks={state.tracks} onOpen={openTrack} />

          <div className="px-5 mt-5 mb-5">
            <Segmented options={TABS} value={tab} onChange={setTab} />
          </div>

          {tab === 'challenges' && (
            <Challenges state={state} categories={state.ctx?.categories ?? []} onViewWon={openWon} />
          )}
          {tab === 'milestones' && (
            <Milestones tracks={state.tracks} achievements={state.achievements} onOpen={openDef} />
          )}
          {tab === 'badges' && <Badges badges={state.badges} onOpen={(/** @type {any} */ b) => openDef(b)} />}
          <div className="h-6" />
        </>
      )}

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
    </SubPage>
  )
}
