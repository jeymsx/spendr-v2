import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The bug this pins: a preference you changed was reverted by the next sync.
 *
 * pullPreferences used to write the remote value over the local one with no
 * comparison at all, and fullSync pulls BEFORE it pushes. So the sequence was:
 *
 *   1. turn on "Skip confirmation"        local = true, remote still false
 *   2. switch away and back               SyncManager syncs on window focus
 *   3. pull writes remote false over it   local = false
 *   4. push sends false                   remote = false
 *
 * The setting was off again on both devices, and the confirm sheet you had
 * turned off came back. Same path for the display name and the currency.
 *
 * Every other table in sync.js already resolved this by comparing updated_at
 * and taking the newer row; preferences were the one place that did not, and
 * could not, because nothing stamped the local side. Now three writers do.
 */

const metaStore = new Map()
/** @type {{row: Record<string, any>|null, error: {code: string, message?: string}|null}} */
const remote = { row: null, error: null }

vi.mock('../db/db', () => ({
  default: {
    meta: {
      get: async (/** @type {string} */ k) => metaStore.get(k),
      put: async (/** @type {any} */ r) => { metaStore.set(r.key, r); return r.key },
    },
  },
  UNSYNCED: 0,
  SYNCED: 1,
  dbReady: Promise.resolve(),
  /** @returns {Promise<any[]>} */
  getUnsyncedTxs: async () => [],
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: remote.row, error: remote.error }),
        }),
      }),
    }),
  },
}))

const { pullPreferences } = await import('./sync')

const OLD = '2026-09-01T00:00:00.000Z'
const NEW = '2026-09-12T00:00:00.000Z'

beforeEach(() => {
  metaStore.clear()
  remote.row = null
  remote.error = null
})

describe('pullPreferences', () => {
  it('takes the remote value when the local one is older', () => {
    metaStore.set('skipConfirm', { key: 'skipConfirm', value: false, updatedAt: OLD })
    remote.row = { skip_confirm: true, updated_at: NEW }
    return pullPreferences('u1').then(() => {
      expect(metaStore.get('skipConfirm').value).toBe(true)
    })
  })

  /** The bug, exactly: local turned on, remote not yet told. */
  it('KEEPS a local change the server has not heard about yet', async () => {
    metaStore.set('skipConfirm', { key: 'skipConfirm', value: true, updatedAt: NEW })
    remote.row = { skip_confirm: false, updated_at: OLD }
    await pullPreferences('u1')
    expect(metaStore.get('skipConfirm').value).toBe(true)
  })

  it('keeps a locally-changed display name and currency too', async () => {
    metaStore.set('displayName', { key: 'displayName', value: 'James', updatedAt: NEW })
    metaStore.set('currency', { key: 'currency', value: 'SGD', updatedAt: NEW })
    remote.row = { display_name: 'Old Name', currency: 'PHP', updated_at: OLD }
    await pullPreferences('u1')
    expect(metaStore.get('displayName').value).toBe('James')
    expect(metaStore.get('currency').value).toBe('SGD')
  })

  /**
   * A local row with no stamp predates this fix, so the remote value is the
   * only information there is and it wins. Anything else would strand an old
   * device on whatever it happened to hold.
   */
  it('lets the remote win when the local row carries no stamp', async () => {
    metaStore.set('skipConfirm', { key: 'skipConfirm', value: false })
    remote.row = { skip_confirm: true, updated_at: OLD }
    await pullPreferences('u1')
    expect(metaStore.get('skipConfirm').value).toBe(true)
  })

  it('writes a preference this device has never had', async () => {
    remote.row = { skip_confirm: true, display_name: 'James', currency: 'PHP', updated_at: OLD }
    await pullPreferences('u1')
    expect(metaStore.get('skipConfirm').value).toBe(true)
    expect(metaStore.get('displayName').value).toBe('James')
  })

  it('carries the remote stamp onto what it writes, so the next pull can compare', async () => {
    remote.row = { skip_confirm: true, updated_at: OLD }
    await pullPreferences('u1')
    expect(metaStore.get('skipConfirm').updatedAt).toBe(OLD)
  })

  it('keeps userName in step with displayName, which the profile row reads', async () => {
    remote.row = { display_name: 'James', updated_at: NEW }
    await pullPreferences('u1')
    expect(metaStore.get('userName').value).toBe('James')
  })

  it('does nothing at all on a first sign-in with no row yet', async () => {
    remote.row = null
    remote.error = { code: 'PGRST116' }
    await pullPreferences('u1')
    expect(metaStore.size).toBe(0)
  })

  it('throws on a real error rather than silently keeping stale settings', async () => {
    remote.error = { code: '500', message: 'boom' }
    await expect(pullPreferences('u1')).rejects.toThrow(/user_preferences pull/)
  })
})
