import { beforeEach, describe, it, expect, vi } from 'vitest'

/**
 * What the notifications store records, and what it calls news.
 *
 * Dexie is stood in for by the few calls the store makes, over plain Maps -
 * there is no IndexedDB in a node test, and what is being pinned is the
 * store's rules, not Dexie's.
 */

/** @type {{meta: Map<string, any>, notifications: Map<string, any>}} */
const store = { meta: new Map(), notifications: new Map() }

/** @param {'meta'|'notifications'} name @param {string} pk */
const table = (name, pk) => ({
  get: async (/** @type {string} */ k) => store[name].get(k),
  put: async (/** @type {any} */ row) => { store[name].set(row[pk], row) },
  bulkPut: async (/** @type {any[]} */ rows) => { for (const r of rows) store[name].set(r[pk], r) },
  toCollection: () => ({ primaryKeys: async () => [...store[name].keys()] }),
  where: (/** @type {string} */ field) => ({
    below: (/** @type {string} */ v) => ({
      delete: async () => { for (const [k, r] of store[name]) if (r[field] < v) store[name].delete(k) },
    }),
    anyOf: (/** @type {string[]} */ list) => ({
      modify: async (/** @type {any} */ patch) => {
        for (const k of list) { const r = store[name].get(k); if (r) store[name].set(k, { ...r, ...patch }) }
      },
    }),
  }),
})

vi.mock('./db', () => ({
  default: {
    meta: table('meta', 'key'),
    notifications: table('notifications', 'id'),
    transaction: async (/** @type {any[]} */ ...args) => args[args.length - 1](),
  },
}))

const { recordNotifications, markRead, releaseSeenAt, KEEP_DAYS } = await import('./notifications')

const NOW = new Date(2026, 8, 25, 14)
const HOUR = 36e5
/** @param {string} id @param {number} hoursAgo @param {Record<string, any>} [more] */
const item = (id, hoursAgo, more = {}) => ({
  id, kind: /** @type {const} */ ('badge'), at: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
  title: id, body: '', url: /** @type {string|null} */ (null), ...more,
})
const readOf = (/** @type {string} */ id) => store.notifications.get(id)?.read

beforeEach(() => { store.meta.clear(); store.notifications.clear() })

describe('what is news', () => {
  it('on a first run, calls the last three days news and the rest history', async () => {
    const fresh = await recordNotifications([item('new', 5), item('old', 5 * 24)], NOW)
    expect(fresh.map(i => i.id)).toEqual(['new', 'old'])
    expect(readOf('new')).toBe(0)
    expect(readOf('old')).toBe(1)
  })

  /* A restored backup or a sign-in lands a month of history at once, minutes
     after the last look. Only the last day of it is news. */
  it('keeps history that arrives all at once from lighting the bell', async () => {
    await recordNotifications([], new Date(NOW.getTime() - 5 * 60e3))
    await recordNotifications([item('today', 3), item('last-week', 7 * 24)], NOW)
    expect(readOf('today')).toBe(0)
    expect(readOf('last-week')).toBe(1)
  })

  it('calls everything since a long absence news', async () => {
    await recordNotifications([], new Date(NOW.getTime() - 10 * 24 * HOUR))
    await recordNotifications([item('while-away', 6 * 24)], NOW)
    expect(readOf('while-away')).toBe(0)
  })

  it('records a quiet item as read, without keeping the flag', async () => {
    await recordNotifications([item('silent-badge', 1, { quiet: true })], NOW)
    expect(readOf('silent-badge')).toBe(1)
    expect(store.notifications.get('silent-badge')).not.toHaveProperty('quiet')
  })

  it('never records the same thing twice, or touches what it recorded', async () => {
    await recordNotifications([item('a', 1)], NOW)
    await markRead(['a'])
    const again = await recordNotifications([item('a', 1)], NOW)
    expect(again).toEqual([])
    expect(readOf('a')).toBe(1)
  })

  it(`lets go of entries after ${KEEP_DAYS} days`, async () => {
    store.notifications.set('ancient', { ...item('ancient', (KEEP_DAYS + 1) * 24), read: 1 })
    await recordNotifications([], NOW)
    expect(store.notifications.has('ancient')).toBe(false)
  })
})

describe('marking read', () => {
  it('marks only the ones it is given', async () => {
    await recordNotifications([item('shown', 1), item('arrived-later', 1)], NOW)
    await markRead(['shown'])
    expect(readOf('shown')).toBe(1)
    expect(readOf('arrived-later')).toBe(0)
  })
})

describe('when a release was first seen', () => {
  it('announces nothing on a first install, where everything is new', async () => {
    expect(await releaseSeenAt('0.5.0', NOW)).toBeNull()
  })

  it('dates an upgrade once, and keeps that date', async () => {
    store.meta.set('whatsNewSeen', { key: 'whatsNewSeen', value: '0.4.2' })
    const first = await releaseSeenAt('0.5.0', NOW)
    expect(first).toBe(NOW.toISOString())
    expect(await releaseSeenAt('0.5.0', new Date(NOW.getTime() + 100 * 24 * HOUR))).toBe(first)
  })

  it('announces nothing for a release already acknowledged', async () => {
    store.meta.set('whatsNewSeen', { key: 'whatsNewSeen', value: '0.5.0' })
    expect(await releaseSeenAt('0.5.0', NOW)).toBeNull()
  })
})
