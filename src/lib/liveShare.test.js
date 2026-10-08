import { describe, it, expect, vi } from 'vitest'
import { SHARE_EVENT, shareTopic, startShare } from './liveShare'

/**
 * A stand-in for the Supabase client: the channel remembers how it was made, what
 * it listens to and what it is sent, and the test plays the server's part.
 */
/** @param {{failSend?: boolean}} [opts] */
function fakeClient({ failSend = false } = {}) {
  /** @type {{name: string, config: any, listeners: Array<{filter: any, cb: (m: any) => void}>, status: ((s: string) => void)|null, sent: any[], removed: boolean}} */
  const state = { name: '', config: null, listeners: [], status: null, sent: [], removed: false }
  const client = {
    channel(/** @type {string} */ name, /** @type {any} */ opts) {
      state.name = name
      state.config = opts?.config
      const api = {
        on(/** @type {string} */ _type, /** @type {any} */ filter, /** @type {(m: any) => void} */ cb) { state.listeners.push({ filter, cb }); return api },
        subscribe(/** @type {(s: string) => void} */ cb) { state.status = cb; return api },
        send: vi.fn(async (/** @type {any} */ message) => { if (failSend) throw new Error('offline'); state.sent.push(message); return 'ok' }),
      }
      return api
    },
    removeChannel() { state.removed = true },
  }
  return { client: /** @type {any} */ (client), state }
}

const row = { tx_id: 't1', type: 'expense', amount: 150 }

describe('startShare', () => {
  it('joins a private channel named for the user, and does not hear itself', () => {
    const { client, state } = fakeClient()
    startShare('u1', { onTransaction: vi.fn() }, client)
    expect(state.name).toBe(shareTopic('u1'))
    expect(state.name).toBe('spendr:live:u1')
    expect(state.config.private).toBe(true)
    expect(state.config.broadcast.self).toBe(false)
  })

  it('listens for the one event, and hands on the transaction in it', () => {
    const { client, state } = fakeClient()
    const onTransaction = vi.fn()
    startShare('u1', { onTransaction }, client)
    expect(state.listeners).toHaveLength(1)
    expect(state.listeners[0].filter).toEqual({ event: SHARE_EVENT })
    state.listeners[0].cb({ type: 'broadcast', event: SHARE_EVENT, payload: row })
    expect(onTransaction).toHaveBeenCalledWith(row)
  })

  it('ignores a message that is not a transaction', () => {
    const { client, state } = fakeClient()
    const onTransaction = vi.fn()
    startShare('u1', { onTransaction }, client)
    state.listeners[0].cb({ payload: {} })
    state.listeners[0].cb({ payload: undefined })
    state.listeners[0].cb(undefined)
    expect(onTransaction).not.toHaveBeenCalled()
  })

  it('sends nothing until it has joined: the usual path carries the transaction, as before', () => {
    const { client, state } = fakeClient()
    const { share } = startShare('u1', { onTransaction: vi.fn() }, client)
    expect(share(row)).toBe(false)
    state.status?.('CHANNEL_ERROR')
    expect(share(row)).toBe(false)
    expect(state.sent).toEqual([])
  })

  it('sends the transaction as a broadcast once it has joined', () => {
    const { client, state } = fakeClient()
    const { share } = startShare('u1', { onTransaction: vi.fn() }, client)
    state.status?.('SUBSCRIBED')
    expect(share(row)).toBe(true)
    expect(state.sent).toEqual([{ type: 'broadcast', event: SHARE_EVENT, payload: row }])
  })

  it('stops sending when the connection goes', () => {
    const { client, state } = fakeClient()
    const { share } = startShare('u1', { onTransaction: vi.fn() }, client)
    state.status?.('SUBSCRIBED')
    state.status?.('CLOSED')
    expect(share(row)).toBe(false)
  })

  it('does not send a row with no stable id: the other device could not tell it from another', () => {
    const { client, state } = fakeClient()
    const { share } = startShare('u1', { onTransaction: vi.fn() }, client)
    state.status?.('SUBSCRIBED')
    expect(share({ amount: 5 })).toBe(false)
    expect(state.sent).toEqual([])
  })

  it('does not wait for the send, and does not mind it failing', async () => {
    const { client, state } = fakeClient({ failSend: true })
    const { share } = startShare('u1', { onTransaction: vi.fn() }, client)
    state.status?.('SUBSCRIBED')
    // True at once: nobody is waiting on it, and a rejected send is not an unhandled rejection.
    expect(share(row)).toBe(true)
    await new Promise(r => setTimeout(r, 0))
  })

  it('stops: leaves the channel, and hears and sends nothing after', () => {
    const { client, state } = fakeClient()
    const onTransaction = vi.fn()
    const handle = startShare('u1', { onTransaction }, client)
    state.status?.('SUBSCRIBED')
    handle.stop()
    expect(state.removed).toBe(true)
    state.listeners[0].cb({ payload: row })
    expect(onTransaction).not.toHaveBeenCalled()
    expect(handle.share(row)).toBe(false)
  })
})
