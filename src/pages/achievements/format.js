import { fmt } from '../../lib/money'
import { celebrationOf } from '../../context/AchievementContext'

/** "Sat 19 Sep", or with the year outside this one. @param {string} day 'YYYY-MM-DD' */
export function fmtDay(day) {
  const d = new Date(`${day}T00:00:00`)
  return d.toLocaleDateString('en-PH', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  })
}

/** A challenge's window in words: "Sat 19 – Sun 20 Sep", "Wed 16 Sep". @param {string} start @param {string} end */
export function fmtWindow(start, end) {
  if (start === end) return fmtDay(start)
  return `${fmtDay(start)} – ${fmtDay(end)}`
}

/**
 * What a challenge with a setting is about, where its figures alone would not
 * say: a cap's category. "₱420 of ₱1,000" is only half an answer. As judged,
 * so a category renamed since the cap was set shows its name now.
 *
 * @param {{judged?: {subject?: string}}} row
 * @returns {string|null}
 */
export function challengeSubject(row) {
  return row.judged?.subject || null
}

/** "26 Sep". @param {string|null|undefined} iso */
export function fmtShort(iso) {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' }) : ''
}

/**
 * A track's number the way its sentence reads it: "12 days", "134 entries",
 * "₱86,400.00".
 *
 * @param {{key: string, unit: string}} track
 * @param {number} n
 */
export function trackAmount(track, n) {
  if (track.key === 'held') return fmt(n)
  const one = { days: 'day', entries: 'entry', months: 'month', goals: 'goal', won: 'won' }[track.unit] ?? track.unit
  if (track.unit === 'won') return `${n.toLocaleString('en-US')} won`
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : track.unit}`
}

/**
 * What the viewer shows for one achievement: the celebration's own shape,
 * plus - while it is locked - how it is earned and how far along you are.
 *
 * @param {any} def   an entry of useAchievements().achievements
 * @param {any} [track]  its track, for a milestone
 */
export function viewerFor(def, track) {
  const item = celebrationOf(def, def.earnedAt)
  if (def.earned || !track || def.n == null) return { item, locked: !def.earned, how: def.how, progress: null, remaining: 0 }
  const shown = track.streak ? (track.progress.current ?? 0) : track.progress.value
  return {
    item,
    locked: true,
    how: def.how,
    progress: `${trackAmount(track, Math.min(shown, def.n))} of ${trackAmount(track, def.n)}`,
    remaining: 0,
  }
}
