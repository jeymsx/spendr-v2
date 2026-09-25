import db from './db'

/**
 * The notifications list, as stored.
 *
 * lib/notifications.js works out which events exist; this records each one
 * the first time it is seen and keeps it, so the list has a history rather
 * than being whatever is true this minute. Nothing here decides what an
 * event is - it only remembers, and decides what is news.
 *
 * ── What is news ──
 *
 * An event is recorded unread if it happened since the device last looked,
 * or within the last day; anything older arrives already read. That is what
 * keeps the bell honest when a lot of history turns up at once - a restored
 * backup, a sign-in that pulls a month of rows, the first run of the feature
 * itself - none of which is anything that just happened. The mark is the
 * time of the last look, kept per device.
 */

/** How long an entry is kept once it has happened. */
export const KEEP_DAYS = 90
/** With no last look to go by - a device's very first pass - how far back
 *  counts as news. */
export const FIRST_RUN_UNREAD_DAYS = 3
/** However recent the last look, the last day is always news. */
const RECENT_MS = 864e5
const LOOKED_KEY = 'notificationsLookedAt'
const SINCE_KEY = 'whatsNewSince'
const DAY_MS = 864e5

/**
 * Record every candidate not already recorded, and let old entries go.
 *
 * @param {import('../lib/notifications').FeedItem[]} candidates
 * @param {Date} [now]
 * @returns {Promise<import('../lib/notifications').FeedItem[]>} the ones that are new
 */
export async function recordNotifications(candidates, now = new Date()) {
  const nowMs = now.getTime()
  return db.transaction('rw', [db.notifications, db.meta], async () => {
    const looked = Date.parse((await db.meta.get(LOOKED_KEY))?.value ?? '')
    const newsFrom = Number.isFinite(looked)
      ? Math.min(looked, nowMs - RECENT_MS)
      : nowMs - FIRST_RUN_UNREAD_DAYS * DAY_MS
    const known = new Set(await db.notifications.toCollection().primaryKeys())
    const fresh = candidates.filter(c => !known.has(c.id))

    if (fresh.length) {
      await db.notifications.bulkPut(fresh.map(({ quiet, ...c }) => ({
        ...c,
        read: quiet || Date.parse(c.at) < newsFrom ? 1 : 0,
      })))
    }
    await db.meta.put({ key: LOOKED_KEY, value: now.toISOString() })

    const cutoff = new Date(nowMs - KEEP_DAYS * DAY_MS).toISOString()
    await db.notifications.where('at').below(cutoff).delete()
    return fresh
  })
}

/**
 * The ones in the list that were on screen: read. Only those ids - an entry
 * recorded while the list was open was never shown with its dot, and keeps
 * it for next time.
 *
 * @param {Iterable<string>} ids
 */
export async function markRead(ids) {
  const list = [...ids]
  if (list.length) await db.notifications.where('id').anyOf(list).modify({ read: 1 })
}

/**
 * When this device first had `version`, for its "What's new" entry - or null
 * when there is nothing to announce: a first install, where everything is
 * new, or a release it has already acknowledged.
 *
 * Fixed the first time it is asked, so the entry keeps its date: dated "now"
 * on every pass, it came back as news each time the 90-day prune let it go.
 *
 * @param {string} version
 * @param {Date} [now]
 * @returns {Promise<string|null>}
 */
export async function releaseSeenAt(version, now = new Date()) {
  return db.transaction('rw', db.meta, async () => {
    const since = (await db.meta.get(SINCE_KEY))?.value
    if (since?.version === version) return since.at
    const seen = (await db.meta.get('whatsNewSeen'))?.value
    if (!seen || seen === version) return null
    const at = now.toISOString()
    await db.meta.put({ key: SINCE_KEY, value: { version, at } })
    return at
  })
}
