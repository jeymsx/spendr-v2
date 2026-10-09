import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Delete my account and Reset app: what the cloud is asked, what a person is
 * told when it cannot be done, and that the device is emptied whole.
 */

let rpcAnswer = /** @type {{message: string}|null} */ (null)
/** @type {string[]} */
let rpcCalls = []
vi.mock('./supabase', () => ({
  supabase: { rpc: async (/** @type {string} */ name) => { rpcCalls.push(name); return { error: rpcAnswer } } },
}))

/** @type {string[]} */
let cleared = []
vi.mock('../db/db', () => {
  const tables = ['transactions', 'accounts', 'notes', 'meta'].map(name => ({ name, clear: async () => { cleared.push(name) } }))
  return { default: { tables, transaction: async (/** @type {any} */ _m, /** @type {any} */ _t, /** @type {() => Promise<void>} */ fn) => fn() } }
})
let lockCleared = false
vi.mock('./appLock', () => ({ clearLock: () => { lockCleared = true } }))

const { deleteMyAccount, eraseThisDevice } = await import('./eraseDevice')

/** @type {Record<string, string>} */
let store = {}
beforeEach(() => {
  rpcAnswer = null; rpcCalls = []; cleared = []; lockCleared = false
  store = { 'spendr-theme': 'dark', accentColor: '#000', 'spendr-style': 'flat', 'spendr-crash-log': '[]', other: 'kept' }
  vi.stubGlobal('localStorage', { removeItem: (/** @type {string} */ k) => { delete store[k] } })
  vi.stubGlobal('navigator', { onLine: true })
})
afterEach(() => vi.unstubAllGlobals())

describe('deleting the account', () => {
  it('asks the cloud to delete the signed-in account, and nothing else', async () => {
    await deleteMyAccount()
    expect(rpcCalls).toEqual(['delete_my_account'])
  })

  it('does not try while offline, and says so', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await expect(deleteMyAccount()).rejects.toThrow('You’re offline')
    expect(rpcCalls).toEqual([])
  })

  it('says when the server has not been set up for it', async () => {
    rpcAnswer = { message: 'Could not find the function public.delete_my_account without parameters in the schema cache' }
    await expect(deleteMyAccount()).rejects.toThrow('isn’t set up on the server yet')
  })

  it('says it could not, in words, for anything else', async () => {
    rpcAnswer = { message: 'JWT expired' }
    await expect(deleteMyAccount()).rejects.toThrow('Could not delete your account')
  })
})

describe('erasing this device', () => {
  it('empties every table, turns the lock off, and drops the look and the error log', async () => {
    await eraseThisDevice()
    expect(cleared).toEqual(['transactions', 'accounts', 'notes', 'meta'])
    expect(lockCleared).toBe(true)
    expect(store).toEqual({ other: 'kept' })
  })
})
