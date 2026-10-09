import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithTimeout, REQUEST_TIMEOUT_MS } from './supabase'

/**
 * A request to the cloud is given up on, rather than holding its sync - and
 * every sync after it - open for good.
 */

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

/** A fetch that never answers, unless it is aborted. */
const hangingFetch = () => vi.fn((/** @type {any} */ _input, /** @type {RequestInit} */ init) => new Promise((_resolve, reject) => {
  init.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new Error('aborted')))
}))

describe('fetchWithTimeout', () => {
  it('gives up on a request that never answers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())
    const pending = fetchWithTimeout('https://example.invalid/rest/v1/notes')
    const outcome = pending.then(() => 'answered', (e) => e.message)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
    expect(await outcome).toBe('The request took too long')
  })

  it('passes an answer straight through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })))
    const res = await fetchWithTimeout('https://example.invalid/rest/v1/notes')
    expect(await res.text()).toBe('ok')
  })

  it('still lets the caller cancel', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const mine = new AbortController()
    const pending = fetchWithTimeout('https://example.invalid/rest/v1/notes', { signal: mine.signal })
    mine.abort(new Error('cancelled'))
    await expect(pending).rejects.toThrow('cancelled')
  })
})
