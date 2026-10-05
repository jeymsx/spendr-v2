import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import InfoButton from '../../components/ui/InfoButton'
import { useAchievements, challengeCelebration } from '../../context/AchievementContext'
import Streaks from '../../pages/achievements/Streaks'
import Challenges from '../../pages/achievements/Challenges'
import { Badges, Milestones } from '../../pages/achievements/Collection'
import { viewerFor } from '../../pages/achievements/format'
import Guide from '../../pages/achievements/Guide'
import Page from '../ui/Page'
import { Tabs } from '../ui/controls'
import { Stat, Progress, Skeleton } from '../ui/display'

const Celebration = lazy(() => import('../../components/achievements/Celebration'))

const SECTIONS = [
  { value: 'challenges', label: 'Challenges', about: 'Beat one, keep the medal.' },
  { value: 'milestones', label: 'Milestones', about: 'Every track has a next level.' },
  { value: 'badges', label: 'Badges', about: 'One-offs, each earned once.' },
]

/** @param {string|null} v */
const sectionOf = (v) => (SECTIONS.some(t => t.value === v) ? /** @type {string} */ (v) : 'challenges')

/**
 * Achievements on a computer, in the frame every page has: what you have
 * earned and your two streaks across the top, then challenges, milestones or
 * badges with the width to lay them out - two columns of challenges and
 * milestones, badges five across (web.css).
 *
 * The pieces are the phone's own (pages/achievements/*): taking a challenge
 * on, a badge's medal, the guide, the celebration. The collection is in the
 * address (`?tab=`), written with replaceState as the phone's tabs are, so a
 * notification's link opens the right one and switching does not scroll.
 */
export default function WebAchievements() {
  const state = useAchievements()
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
  const current = SECTIONS.find(s => s.value === section) ?? SECTIONS[0]

  return (
    <Page
      title="Achievements"
      subtitle={current.about}
      actions={<InfoButton title="How achievements work" onOpen={() => setGuide(true)} />}
    >
      {state.loading ? (
        <div className="grid grid-cols-4 gap-5 mb-8">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[136px] rounded-[24px]" />)}</div>
      ) : (
        <div className="d-stats grid grid-cols-4 gap-5 mb-8 items-stretch">
          <Stat label="Earned so far" value={`${state.earnedCount} of ${state.total}`} note={`${levels} levels and ${badgesEarned} badges`}>
            <Progress className="mt-3" value={state.total ? (state.earnedCount / state.total) * 100 : 0} />
          </Stat>
          <div className="col-span-2 -mx-5 web-ach-streaks"><Streaks tracks={state.tracks} onOpen={openTrack} /></div>
          <Stat label="Challenges won" value={String(won)} tone={won ? 'pos' : null} note={active.length ? `${active.length} running now` : 'Take one on below'} />
        </div>
      )}

      <Tabs
        className="mb-6"
        label="Collections"
        value={section}
        onChange={setSection}
        tabs={[
          { value: 'challenges', label: 'Challenges', count: active.length || undefined },
          { value: 'milestones', label: 'Milestones', count: levelsAll ? levels : undefined },
          { value: 'badges', label: 'Badges', count: state.badges.length ? badgesEarned : undefined },
        ]}
      />

      {!state.loading && (
        <div className={`-mx-5 web-ach-${section}`}>
          {section === 'challenges' && <Challenges state={state} categories={state.ctx?.categories ?? []} onViewWon={openWon} />}
          {section === 'milestones' && <Milestones tracks={state.tracks} achievements={state.achievements} onOpen={openDef} />}
          {section === 'badges' && <Badges badges={state.badges} onOpen={(/** @type {any} */ b) => openDef(b)} />}
        </div>
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
    </Page>
  )
}
