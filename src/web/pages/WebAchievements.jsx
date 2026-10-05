import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import InfoButton from '../../components/ui/InfoButton'
import { useAchievements, challengeCelebration } from '../../context/AchievementContext'
import Challenges from '../../pages/achievements/Challenges'
import { Badges, Milestones } from '../../pages/achievements/Collection'
import { viewerFor } from '../../pages/achievements/format'
import Guide from '../../pages/achievements/Guide'
import Page from '../ui/Page'
import { Tabs } from '../ui/controls'
import { useTheme } from '../../context/ThemeContext'
import { GlassArt } from '../../components/glass/GlassArt'
import { Progress, Skeleton } from '../ui/display'

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
 * earned, your two streaks and the challenges you have won across the top -
 * four cards of one shape (AchCard: a label and its picture, the figure, a
 * line, a bar at the foot) - then challenges, milestones or
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
  const { active, won, finished } = state.challenges
  const { accentColor } = useTheme()
  const logging = state.tracks.find((/** @type {any} */ t) => t.key === 'logging')
  const nospend = state.tracks.find((/** @type {any} */ t) => t.key === 'nospend')
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
          <AchCard label="Earned so far" art="trophy" hue={accentColor} value={`${state.earnedCount} of ${state.total}`}
            note={`${levels} levels and ${badgesEarned} badges`} bar={state.total ? (state.earnedCount / state.total) * 100 : 0} />
          {logging && <StreakCard track={logging} art="flame" onOpen={openTrack} />}
          {nospend && <StreakCard track={nospend} art="leaf" onOpen={openTrack} />}
          <AchCard label="Challenges won" art="medal" hue={accentColor} value={String(won)} tone={won ? 'd-pos' : ''}
            note={finished.length
              ? `${won} of ${finished.length} finished${active.length ? ` · ${active.length} running` : ''}`
              : active.length ? `${active.length} running now` : 'Take one on below'}
            bar={finished.length ? (won / finished.length) * 100 : 0} barColor="var(--d-pos)" />
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

/**
 * One of the four cards across the top: its label with its picture at the
 * right, the figure, one line under it, and a bar at the foot - at the same
 * height in all four, whatever the line says.
 *
 * @param {{label: string, art: string, hue: string, value: import('react').ReactNode, unit?: string, note: string,
 *          bar: number, barColor?: string, tone?: string, onClick?: () => void, aria?: string}} props
 */
function AchCard({ label, art, hue, value, unit, note, bar, barColor, tone = '', onClick, aria }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-label={aria} className={`d-panel d-ach-card${onClick ? ' is-button' : ''}`}>
      <span className="flex items-start justify-between gap-2 w-full">
        <span className="d-stat-label">{label}</span>
        <GlassArt name={art} hue={hue} size={36} className="-mt-1.5 -mr-1.5" />
      </span>
      <span className={`d-stat-value ${tone}`}>
        {value}{unit && <span className="ml-1.5 text-14 font-semibold text-[var(--d-text-3)]">{unit}</span>}
      </span>
      <span className="d-stat-note">{note}</span>
      <Progress className="mt-auto pt-0" value={bar} color={barColor} />
    </Tag>
  )
}

/**
 * A streak as one of those cards: today's run, the best, and the way to the
 * next level - the phone's streak card (pages/achievements/Streaks) in the
 * desktop's shape. Opening it shows the track's next medal.
 *
 * @param {{track: any, art: string, onOpen: (track: any) => void}} props
 */
function StreakCard({ track, art, onOpen }) {
  const current = track.progress.current ?? 0
  const best = track.progress.value ?? 0
  const next = track.view.next
  const why = track.key === 'nospend'
    ? (track.progress.spentToday ? 'Spent today, starts again tomorrow' : current === 0 ? 'Today counts once it’s over' : null)
    : (current === 0 ? 'Log something today to start one' : null)
  const toward = !next ? 'Every level reached'
    : current >= next.n ? `${next.n} is yours once today is over`
      : `${next.n - current} more for ${next.n}`
  return (
    <AchCard
      label={track.name}
      art={art}
      hue={track.hue}
      value={current}
      unit={current === 1 ? 'day' : 'days'}
      note={[best > current ? `Best ${best}` : null, why ?? toward].filter(Boolean).join(' · ')}
      bar={next ? (current / next.n) * 100 : 100}
      barColor={track.hue}
      onClick={() => onOpen(track)}
      aria={`${track.name}: ${current} ${current === 1 ? 'day' : 'days'}`}
    />
  )
}
