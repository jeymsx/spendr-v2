import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL  ?? ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/** False when the env vars are missing — sync and auth can't work. */
export const isSupabaseConfigured = Boolean(url && key)

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Sync and sign-in are unavailable; the app runs offline-only against IndexedDB.',
  )
}

// createClient throws outright on an empty URL, and this module sits on
// main.jsx's import path via AuthContext. An unset env var therefore used to
// take the entire app down to a blank screen instead of just disabling sync —
// the opposite of the offline-first behaviour the warning above promises.
//
// The placeholder keeps construction valid. getSession() reads from
// localStorage and resolves to null without touching the network, so the app
// mounts and every local feature works; only requests that genuinely need a
// backend fail, and those are already gated behind a signed-in user.
export const supabase = createClient(
  url || 'http://localhost/unconfigured',
  key || 'unconfigured',
  { global: { fetch: fetchWithTimeout } },
)

/** How long one request to the cloud may take before it is given up on. */
export const REQUEST_TIMEOUT_MS = 20_000

/**
 * fetch, given up on after REQUEST_TIMEOUT_MS.
 *
 * Nothing else gave up on a request. One that hung - started as a phone's
 * connection came back, and never answered - held the sync it belonged to
 * open for good, and every sync after it waited behind that one: an expense
 * saved offline sat on the phone, and live changes stopped arriving, until
 * the app was reloaded. Failing it lets that sync end as failed, and the next
 * one runs. A caller's own signal still works, and still wins.
 *
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 */
export function fetchWithTimeout(input, init = {}) {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new Error('The request took too long')), REQUEST_TIMEOUT_MS)
  const theirs = init.signal
  if (theirs) {
    if (theirs.aborted) timeout.abort(theirs.reason)
    else theirs.addEventListener('abort', () => timeout.abort(theirs.reason), { once: true })
  }
  return fetch(input, { ...init, signal: timeout.signal }).finally(() => clearTimeout(timer))
}
