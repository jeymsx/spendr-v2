import { describe, it, expect, vi } from 'vitest'
import { REALTIME_TABLES, startRealtime } from './realtime'

/**
 * A stand-in for the Supabase client: each channel remembers its bindings and
 * its status callback, and the test plays the server's part.
 */
function fakeClient() {
  /** @type {Array<{name: string, bindings: any[], status: ((s: string, e?: any) => void)|null, removed: boolean}>} */
  const channels = []
  const client = {
    channel(/** @type {string} */ name) {
      const ch = { name, bindings: /** @type {any[]} */ ([]), status: /** @type {any} */ (null), removed: false }
      channels.push(ch)
      const api = {
        on(/** @type {string} */ type, /** @type {any} */ filter, /** @type {() => void} */ cb) { ch.bindings.push({ type, filter, cb }); return api },
        subscribe(/** @type {any} */ cb) { ch.status = cb; return api },
        _ch: ch,
      }
      return api
    },
    removeChannel(/** @type {any} */ api) { api._ch.removed = true },
  }
  return { client: /** @type {any} */ (client), channels }
}

describe('startRealtime', () => {
  it('listens to every synced table, each on its own channel, for this user only', () => {
    const { client, channels } = fakeClient()
    startRealtime('u1', { onChange: vi.fn() }, client)
    expect(channels.map(c => c.bindings[0].filter.table)).toEqual(REALTIME_TABLES)
    for (const c of channels) {
      expect(c.bindings).toHaveLength(1)
      expect(c.bindings[0].type).toBe('postgres_changes')
      expect(c.bindings[0].filter).toMatchObject({ event: '*', schema: 'public', filter: 'user_id=eq.u1' })
    }
    expect(new Set(channels.map(c => c.name)).size).toBe(channels.length)
  })

  it('hears deletions as rows of the deletions table, not as DELETE events', () => {
    expect(REALTIME_TABLES).toContain('deletions')
    expect(REALTIME_TABLES).toContain('transactions')
  })

  it('calls onChange with the table that changed', () => {
    const { client, channels } = fakeClient()
    const onChange = vi.fn()
    startRealtime('u1', { onChange }, client)
    channels.find(c => c.bindings[0].filter.table === 'accounts')?.bindings[0].cb({ eventType: 'UPDATE' })
    expect(onChange).toHaveBeenCalledWith('accounts')
  })

  it('says it is connecting, then live when the ledger channel subscribes - and catches up once', () => {
    const { client, channels } = fakeClient()
    const onChange = vi.fn()
    const onState = vi.fn()
    startRealtime('u1', { onChange, onState }, client)
    expect(onState).toHaveBeenLastCalledWith('connecting')
    channels.find(c => c.bindings[0].filter.table === 'accounts')?.status?.('SUBSCRIBED')
    expect(onState).toHaveBeenLastCalledWith('connecting')
    expect(onChange).not.toHaveBeenCalled()
    channels.find(c => c.bindings[0].filter.table === 'transactions')?.status?.('SUBSCRIBED')
    expect(onState).toHaveBeenLastCalledWith('on')
    expect(onChange).toHaveBeenCalledWith('transactions')
  })

  it('says it is off when the ledger channel cannot subscribe, and why', () => {
    const { client, channels } = fakeClient()
    const onState = vi.fn()
    startRealtime('u1', { onChange: vi.fn(), onState }, client)
    channels.find(c => c.bindings[0].filter.table === 'transactions')?.status?.('CHANNEL_ERROR', new Error('not in the publication'))
    expect(onState).toHaveBeenLastCalledWith('off', 'not in the publication')
  })

  it('does not let one unpublished table take the others down', () => {
    const { client, channels } = fakeClient()
    const onState = vi.fn()
    startRealtime('u1', { onChange: vi.fn(), onState }, client)
    channels.find(c => c.bindings[0].filter.table === 'notes')?.status?.('CHANNEL_ERROR')
    expect(onState).toHaveBeenLastCalledWith('connecting')
  })

  it('stops: removes every channel, and hears nothing after', () => {
    const { client, channels } = fakeClient()
    const onChange = vi.fn()
    const stop = startRealtime('u1', { onChange }, client)
    stop()
    expect(channels.every(c => c.removed)).toBe(true)
    channels[0].bindings[0].cb({})
    expect(onChange).not.toHaveBeenCalled()
  })
})
